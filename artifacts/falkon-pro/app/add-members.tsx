import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';
import { useMembersStore } from '@/lib/members-store';

type AddMode = 'from-file' | 'by-username' | 'by-id';

const MODE_CONFIG = {
  'from-file': { label: 'From File', icon: 'folder-open' as const, color: '#8B5CF6', desc: 'Add members from a saved extraction file' },
  'by-username': { label: 'By Username', icon: 'alternate-email' as const, color: '#34D399', desc: 'Enter @usernames (one per line)' },
  'by-id': { label: 'By User ID', icon: 'fingerprint' as const, color: '#60A5FA', desc: 'Enter Telegram numeric IDs' },
};

const DELAYS = [
  { label: '30 ثانية', value: 30 },
  { label: '45 ثانية', value: 45 },
  { label: 'دقيقة', value: 60 },
  { label: 'دقيقتين', value: 120 },
];

const MAX_PER_DAY_OPTIONS = [
  { label: '20/يوم', value: 20 },
  { label: '40/يوم', value: 40 },
  { label: '60/يوم', value: 60 },
  { label: '80/يوم', value: 80 },
];

export default function AddMembersScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { fileId: paramFileId } = useLocalSearchParams<{ fileId?: string }>();

  const [mode, setMode] = useState<AddMode>(paramFileId ? 'from-file' : 'by-username');
  const [targetGroup, setTargetGroup] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string>(paramFileId ?? '');
  const [textInput, setTextInput] = useState('');
  const [delay, setDelay] = useState(30);
  const [maxPerDay, setMaxPerDay] = useState(40);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // Track the active file ID at job-start time via ref (avoids stale closure in useEffect)
  const activeFileIdRef = React.useRef<string | null>(null);

  const localAccounts = useAccountsStore();
  const membersStore = useMembersStore();
  const startMut = trpc.addMembers.start.useMutation();

  const statusQuery = trpc.addMembers.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId && isRunning, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (!statusQuery.data) return;
    const { status, members } = statusQuery.data;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      setIsRunning(false);
      // Sync member statuses back to phone storage when job finishes
      const fileId = activeFileIdRef.current;
      if (fileId && members && members.length > 0) {
        const updates = members
          .filter((m: any) => m.status !== 'pending')
          .map((m: any) => ({
            userId: m.userId || undefined,
            username: m.username || undefined,
            status: m.status as any,
            error: m.error,
          }));
        if (updates.length > 0) {
          membersStore.batchUpdateMemberStatuses(fileId, updates);
        }
      }
    }
  }, [statusQuery.data?.status]);

  const activeAccounts = localAccounts.activeAccounts;
  // Use phone-stored members files
  const files = membersStore.files.map((f) => ({
    id: f.id,
    name: f.name,
    memberCount: f.totalCount,
    addedCount: f.addedCount,
    sourceGroup: f.sourceGroup,
    createdAt: f.createdAt,
  }));

  const parseLines = (text: string) =>
    text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const handleStart = async () => {
    if (!targetGroup.trim()) {
      return Alert.alert('Missing Input', 'Enter a target group username or link');
    }
    if (activeAccounts.length === 0) {
      return Alert.alert('لا يوجد حساب', 'أضف حساب Telegram نشط من تبويب الحسابات أولاً');
    }
    if (mode === 'from-file' && !selectedFileId) {
      return Alert.alert('No File', 'Select a members file to add from');
    }
    if ((mode === 'by-username' || mode === 'by-id') && !textInput.trim()) {
      return Alert.alert('No Input', 'Enter at least one username or ID');
    }

    // Build account rotation pool — send ALL active accounts to the server
    // Server will rotate automatically when one gets PeerFlood
    const allAccountsList = await Promise.all(
      activeAccounts.map(async (acc) => ({
        id: acc.id,
        sessionString: await localAccounts.getSession(acc.id) || undefined,
      }))
    );
    const primaryAccount = allAccountsList[0]!;
    const lines = parseLines(textInput);

    // If using phone-stored file, send members inline
    let inlineMembers: any[] | undefined;
    if (mode === 'from-file' && selectedFileId) {
      const file = membersStore.files.find((f) => f.id === selectedFileId);
      if (file) {
        inlineMembers = file.members.filter((m) => m.status === 'pending').map((m) => ({
          userId: m.userId || '',
          username: m.username || '',
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          isOnline: m.isOnline || false,
          phone: m.phone,
          lastSeen: m.lastSeen,
          status: 'pending' as const,
        }));
      }
    }

    try {
      // Track which file to update when this job completes
      activeFileIdRef.current = mode === 'from-file' ? selectedFileId : null;
      setIsRunning(true);
      const result = await startMut.mutateAsync({
        targetGroup: targetGroup.trim(),
        mode: inlineMembers ? 'from-phone' : mode,
        members: inlineMembers,
        fileId: !inlineMembers && mode === 'from-file' ? selectedFileId : undefined,
        usernames: mode === 'by-username' ? lines : undefined,
        userIds: mode === 'by-id' ? lines : undefined,
        delaySeconds: delay,
        maxPerDay,
        accountId: primaryAccount.id,
        sessionString: primaryAccount.sessionString,
        allAccounts: allAccountsList, // rotation pool
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsRunning(false);
      Alert.alert('Error', err.message || 'Failed to start');
    }
  };

  const job = statusQuery.data;
  const progress = job?.total ? Math.round((job.progress / job.total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Operations</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Add Members</Text>
          </View>
          <TouchableOpacity
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20' }}
            onPress={() => router.push('/members-files' as any)}
          >
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>Files ({files.length})</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>

          {/* Account status — shows rotation pool */}
          <TouchableOpacity
            style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: activeAccounts.length > 0 ? palette.success + '50' : palette.error + '50', marginBottom: 14 }}
            onPress={() => activeAccounts.length === 0 && router.push('/(tabs)/accounts' as any)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name={activeAccounts.length > 0 ? 'check-circle' : 'error'} size={18} color={activeAccounts.length > 0 ? palette.success : palette.error} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: activeAccounts.length > 0 ? palette.success : palette.error, fontSize: 13, fontWeight: '700' }}>
                  {activeAccounts.length > 0
                    ? `${activeAccounts.length} حساب${activeAccounts.length > 1 ? ' (تدوير تلقائي)' : ''}`
                    : 'لا يوجد حساب — أضف من تبويب الحسابات'}
                </Text>
                {activeAccounts.length > 0 && (
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>
                    {activeAccounts.map((a) => a.firstName || a.phone).join(' · ')}
                  </Text>
                )}
              </View>
              {activeAccounts.length > 1 && (
                <View style={{ backgroundColor: palette.success + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: palette.success, fontSize: 10, fontWeight: '800' }}>×{activeAccounts.length}</Text>
                </View>
              )}
            </View>
            {activeAccounts.length > 1 && (
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>
                عند PeerFlood يتحول للحساب التالي تلقائياً بدون انتظار
              </Text>
            )}
          </TouchableOpacity>

          {/* Progress */}
          {jobId && job && (() => {
            const jobError: string | undefined = (job as any).error;
            const isPeerFloodWait = isRunning && !!jobError && (jobError.startsWith('⏳') || jobError.startsWith('🔄'));
            const cardColor = isPeerFloodWait ? palette.warning
              : isRunning ? palette.primary
              : job.status === 'completed' ? palette.success
              : palette.error;
            return (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: cardColor + '60', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: cardColor, fontSize: 14, fontWeight: '700' }}>
                  {isPeerFloodWait ? '⏳ PeerFlood — انتظار تلقائي' : isRunning ? 'جاري الإضافة...' : job.status === 'completed' ? '✓ اكتمل' : `✗ ${job.status}`}
                </Text>
                <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '800' }}>
                  +{job.added} / ✗{job.failed}
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, marginBottom: 8 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: cardColor, width: `${progress}%` }} />
              </View>
              {isRunning && !isPeerFloodWait && <ActivityIndicator color={cardColor} size="small" style={{ marginBottom: 4 }} />}
              {isPeerFloodWait && (
                <View style={{ backgroundColor: palette.warning + '15', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                  <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 18 }}>
                    {jobError!.replace('⏳ ', '')}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                    المهمة لا تزال تعمل — ستكمل تلقائياً بعد انتهاء وقت الانتظار
                  </Text>
                </View>
              )}
              {!isPeerFloodWait && job.errors.slice(-3).map((e, i) => (
                <Text key={i} style={{ color: palette.error, fontSize: 11 }}>{e}</Text>
              ))}
            </View>
            );
          })()}

          {/* Target Group */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Target Group / Channel</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="group-add" size={16} color={palette.muted} />
              <TextInput
                value={targetGroup}
                onChangeText={setTargetGroup}
                placeholder="@groupname or t.me/link or Group ID"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                autoCapitalize="none"
                editable={!isRunning}
              />
            </View>
          </View>

          {/* Mode */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Add Source</Text>
            <View style={{ gap: 8 }}>
              {(Object.entries(MODE_CONFIG) as [AddMode, typeof MODE_CONFIG[AddMode]][]).map(([id, cfg]) => (
                <TouchableOpacity
                  key={id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: mode === id ? cfg.color + '15' : 'transparent', borderWidth: 1, borderColor: mode === id ? cfg.color : palette.border, opacity: isRunning ? 0.5 : 1 }}
                  onPress={() => !isRunning && setMode(id)}
                >
                  <MaterialIcons name={cfg.icon} size={18} color={mode === id ? cfg.color : palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{cfg.label}</Text>
                    <Text style={{ color: palette.muted, fontSize: 11 }}>{cfg.desc}</Text>
                  </View>
                  {mode === id && <MaterialIcons name="check-circle" size={18} color={cfg.color} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* From File selector */}
          {mode === 'from-file' && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Select File</Text>
              {membersStore.isLoading ? (
                <ActivityIndicator color={palette.primary} />
              ) : files.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
                  <MaterialIcons name="folder-off" size={32} color={palette.muted} />
                  <Text style={{ color: palette.muted, fontSize: 13 }}>No saved files. Run an extraction first.</Text>
                  <TouchableOpacity onPress={() => router.push('/extraction' as any)} style={{ backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Go to Extraction</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {files.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: selectedFileId === f.id ? palette.primary + '15' : palette.background, borderWidth: 1, borderColor: selectedFileId === f.id ? palette.primary : palette.border, opacity: isRunning ? 0.5 : 1 }}
                      onPress={() => !isRunning && setSelectedFileId(f.id)}
                    >
                      <MaterialIcons name="folder" size={18} color={selectedFileId === f.id ? palette.primary : palette.muted} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{f.name}</Text>
                        <Text style={{ color: palette.muted, fontSize: 11 }}>{f.memberCount} members · {new Date(f.createdAt).toLocaleDateString()}</Text>
                      </View>
                      {selectedFileId === f.id && <MaterialIcons name="check-circle" size={16} color={palette.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Username / ID input */}
          {(mode === 'by-username' || mode === 'by-id') && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {mode === 'by-username' ? 'Usernames' : 'User IDs'}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 11 }}>{parseLines(textInput).length} entries</Text>
              </View>
              <TextInput
                value={textInput}
                onChangeText={setTextInput}
                placeholder={mode === 'by-username' ? '@username1\n@username2\nusername3' : '123456789\n987654321'}
                placeholderTextColor={palette.muted}
                multiline
                numberOfLines={6}
                style={{ color: palette.foreground, fontSize: 13, backgroundColor: palette.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: palette.border, minHeight: 120, fontFamily: 'monospace', textAlignVertical: 'top' }}
                editable={!isRunning}
                autoCapitalize="none"
              />
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>
                {mode === 'by-username' ? 'One username per line. @ is optional.' : 'One numeric Telegram user ID per line.'}
              </Text>
            </View>
          )}

          {/* Execution Settings */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 16, gap: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Execution Settings</Text>
            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Delay Between Adds (seconds)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {DELAYS.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: delay === d.value ? palette.primary : palette.background, borderWidth: 1, borderColor: delay === d.value ? palette.primary : palette.border, alignItems: 'center', opacity: isRunning ? 0.5 : 1 }}
                    onPress={() => !isRunning && setDelay(d.value)}
                  >
                    <Text style={{ color: delay === d.value ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: palette.border }} />
            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Max Adds Per Day</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {MAX_PER_DAY_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: maxPerDay === o.value ? palette.warning : palette.background, borderWidth: 1, borderColor: maxPerDay === o.value ? palette.warning : palette.border, alignItems: 'center', opacity: isRunning ? 0.5 : 1 }}
                    onPress={() => !isRunning && setMaxPerDay(o.value)}
                  >
                    <Text style={{ color: maxPerDay === o.value ? '#000' : palette.muted, fontSize: 11, fontWeight: '700' }}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ backgroundColor: palette.info + '15', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8 }}>
              <MaterialIcons name="info" size={16} color={palette.info} />
              <Text style={{ color: palette.info, fontSize: 11, flex: 1 }}>
                Delay {delay}s between adds. Max {maxPerDay}/day. Anti-ban protection active.
              </Text>
            </View>
          </View>

          {/* Action */}
          {!isRunning ? (
            <TouchableOpacity style={{ borderRadius: 14, overflow: 'hidden' }} onPress={handleStart} disabled={startMut.isPending}>
              <LinearGradient colors={['#065F46', '#34D399']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {startMut.isPending ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="person-add" size={20} color="#fff" />}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {startMut.isPending ? 'Starting...' : 'Start Adding Members'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: palette.success + '10', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.success + '40' }}>
              <ActivityIndicator color={palette.success} />
              <Text style={{ color: palette.success, fontSize: 15, fontWeight: '800' }}>Adding... ({progress}%)</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
