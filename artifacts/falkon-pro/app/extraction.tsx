import React, { useState, useEffect, useRef } from 'react';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';

type ExtractionMode = 'members' | 'admins' | 'subscribers' | 'contacts';

const MODES = [
  { id: 'members' as const, label: 'Group Members', icon: 'group' as const, desc: 'All members of a group' },
  { id: 'admins' as const, label: 'Group Admins', icon: 'admin-panel-settings' as const, desc: 'Admins & moderators only' },
  { id: 'subscribers' as const, label: 'Channel Subscribers', icon: 'campaign' as const, desc: 'Channel subscriber list' },
  { id: 'contacts' as const, label: 'My Contacts', icon: 'contacts' as const, desc: 'Your Telegram contacts' },
];

const Toggle = ({ value, onToggle, label, desc, palette }: any) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {desc && <Text style={{ color: palette.muted, fontSize: 11, marginTop: 1 }}>{desc}</Text>}
    </View>
    <TouchableOpacity
      style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 2 }}
      onPress={onToggle}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </TouchableOpacity>
  </View>
);

export default function ExtractionScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];

  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('500');
  const [mode, setMode] = useState<ExtractionMode>('members');
  const [filterActive, setFilterActive] = useState(false);
  const [excludeBots, setExcludeBots] = useState(true);
  const [fileName, setFileName] = useState('');

  const [jobId, setJobId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const accountsQuery = trpc.accounts.list.useQuery();
  const startMut = trpc.extraction.start.useMutation();

  const statusQuery = trpc.extraction.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId && isRunning, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (!statusQuery.data) return;
    const { status } = statusQuery.data;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      setIsRunning(false);
    }
  }, [statusQuery.data]);

  const accounts = accountsQuery.data?.accounts ?? [];
  const activeAccounts = accounts.filter((a) => a.isActive);

  const handleStart = async () => {
    if (!targetGroup.trim()) {
      return Alert.alert('Missing Input', 'Enter a group username, link, or ID');
    }
    if (activeAccounts.length === 0) {
      return Alert.alert('No Account', 'Add and activate a Telegram account first from the Accounts tab');
    }

    const total = parseInt(limit, 10) || 500;
    const accountId = activeAccounts[0]!.id;

    try {
      setIsRunning(true);
      const result = await startMut.mutateAsync({
        group: targetGroup.trim(),
        limit: total,
        filterActive,
        excludeBots,
        mode,
        accountId,
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsRunning(false);
      Alert.alert('Error', err.message || 'Failed to start extraction');
    }
  };

  const job = statusQuery.data;
  const progress = job?.total ? Math.round((job.progress / job.total) * 100) : 0;
  const savedFileId = job?.savedFileId;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Member Extraction</Text>
          </View>
          <TouchableOpacity
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20' }}
            onPress={() => router.push('/members-files' as any)}
          >
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>Files</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>

          {/* Account Status */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: activeAccounts.length > 0 ? palette.success + '50' : palette.error + '50', marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name={activeAccounts.length > 0 ? 'check-circle' : 'error'} size={18} color={activeAccounts.length > 0 ? palette.success : palette.error} />
            <Text style={{ color: activeAccounts.length > 0 ? palette.success : palette.error, fontSize: 13, fontWeight: '600', flex: 1 }}>
              {activeAccounts.length > 0
                ? `Using account: ${activeAccounts[0]!.firstName || activeAccounts[0]!.phone} (${activeAccounts.length} total)`
                : 'No account connected — add one in the Accounts tab'}
            </Text>
          </View>

          {/* Progress Card */}
          {jobId && job && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '60' : (job.status === 'completed' ? palette.success + '60' : palette.error + '60'), marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {isRunning ? 'Extracting...' : job.status === 'completed' ? '✓ Extraction Complete' : `✗ ${job.status}`}
                </Text>
                <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '800' }}>{job.progress} / {job.total || '?'}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, marginBottom: 8 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: isRunning ? palette.primary : (job.status === 'completed' ? palette.success : palette.error), width: `${progress}%` }} />
              </View>
              {isRunning && <ActivityIndicator color={palette.primary} size="small" style={{ marginBottom: 8 }} />}
              {job.error && <Text style={{ color: palette.error, fontSize: 12 }}>{job.error}</Text>}
              {savedFileId && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={() => router.push({ pathname: '/members-file', params: { id: savedFileId } } as any)}
                  >
                    <MaterialIcons name="folder-open" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>View File</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: palette.success + '20', borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={() => router.push({ pathname: '/add-members', params: { fileId: savedFileId } } as any)}
                  >
                    <MaterialIcons name="person-add" size={16} color={palette.success} />
                    <Text style={{ color: palette.success, fontWeight: '700', fontSize: 13 }}>Add Members</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Target Group */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Target Source</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="link" size={16} color={palette.muted} />
              <TextInput
                value={targetGroup}
                onChangeText={setTargetGroup}
                placeholder="@groupname or t.me/link or group ID"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                autoCapitalize="none"
                editable={!isRunning}
              />
            </View>
          </View>

          {/* Mode */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Extraction Mode</Text>
            <View style={{ gap: 8 }}>
              {MODES.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: mode === m.id ? palette.primary + '15' : 'transparent', borderWidth: 1, borderColor: mode === m.id ? palette.primary : palette.border, opacity: isRunning ? 0.5 : 1 }}
                  onPress={() => !isRunning && setMode(m.id)}
                >
                  <MaterialIcons name={m.icon} size={18} color={mode === m.id ? palette.primary : palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{m.label}</Text>
                    <Text style={{ color: palette.muted, fontSize: 11 }}>{m.desc}</Text>
                  </View>
                  {mode === m.id && <MaterialIcons name="check-circle" size={18} color={palette.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Settings */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, gap: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Settings</Text>
            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Extraction Limit</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['100', '500', '1000', '5000', 'All'].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: limit === (v === 'All' ? '99999' : v) ? palette.primary : palette.background, borderWidth: 1, borderColor: limit === (v === 'All' ? '99999' : v) ? palette.primary : palette.border, alignItems: 'center', opacity: isRunning ? 0.5 : 1 }}
                    onPress={() => !isRunning && setLimit(v === 'All' ? '99999' : v)}
                  >
                    <Text style={{ color: limit === (v === 'All' ? '99999' : v) ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={filterActive} onToggle={() => setFilterActive(!filterActive)} label="Active Members Only" desc="Skip members inactive for 30+ days" palette={palette} />
            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={excludeBots} onToggle={() => setExcludeBots(!excludeBots)} label="Exclude Bots" desc="Skip bot accounts from extraction" palette={palette} />
          </View>

          {/* Action */}
          {!isRunning ? (
            <TouchableOpacity style={{ borderRadius: 14, overflow: 'hidden' }} onPress={handleStart} disabled={startMut.isPending}>
              <LinearGradient colors={['#6D28D9', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {startMut.isPending ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="download" size={20} color="#fff" />}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {startMut.isPending ? 'Starting...' : 'Start Extraction'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: palette.primary + '10', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.primary + '40' }}>
              <ActivityIndicator color={palette.primary} />
              <Text style={{ color: palette.primary, fontSize: 15, fontWeight: '800' }}>Extracting... ({progress}%)</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
