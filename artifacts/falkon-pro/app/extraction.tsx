import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useMembersStore, type Member } from '@/lib/members-store';
import { useTaskRunner } from '@/lib/task-runner';

type ExtractionMode = 'group_members' | 'group_admins' | 'channel_subscribers' | 'contacts';

const MODES = [
  { id: 'group_members', label: 'Group Members', icon: 'group' as const, desc: 'All members of a group' },
  { id: 'group_admins', label: 'Group Admins', icon: 'admin-panel-settings' as const, desc: 'Admins & moderators only' },
  { id: 'channel_subscribers', label: 'Channel Subscribers', icon: 'campaign' as const, desc: 'Channel subscriber list' },
  { id: 'contacts', label: 'My Contacts', icon: 'contacts' as const, desc: 'Your Telegram contacts' },
];

function generateMockMember(index: number, group: string): Member {
  const id = `m_${Date.now()}_${index}`;
  const hasUsername = Math.random() > 0.3;
  const hasUserId = true;
  return {
    id,
    userId: `${100000000 + Math.floor(Math.random() * 900000000)}`,
    username: hasUsername ? `user_${Math.floor(Math.random() * 99999)}` : undefined,
    firstName: ['Ahmed', 'Mohamed', 'Ali', 'Sara', 'Nour', 'Layla', 'Omar', 'Hassan', 'Fatima', 'Yousef'][index % 10],
    lastName: ['Al-Rashid', 'Abdullah', 'Hassan', 'Ibrahim', 'Khalid', 'Mansour'][index % 6],
    isBot: Math.random() < 0.02,
    isOnline: Math.random() > 0.7,
    lastSeen: new Date(Date.now() - Math.random() * 7 * 24 * 3600000).toISOString(),
    status: 'pending',
    source: group,
    extractedAt: new Date().toISOString(),
  };
}

export default function ExtractionScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { createFile } = useMembersStore();
  const { createTask, updateTask, logTask } = useTaskRunner();

  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('500');
  const [mode, setMode] = useState<ExtractionMode>('group_members');
  const [filterOnline, setFilterOnline] = useState(false);
  const [filterBots, setFilterBots] = useState(true);
  const [fileName, setFileName] = useState('');

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extracted, setExtracted] = useState(0);
  const [logs, setLogs] = useState<Array<{ msg: string; type: 'info' | 'success' | 'error' | 'warning' }>>([]);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setLogs((prev) => [{ msg, type }, ...prev].slice(0, 100));
  };

  const handleStart = async () => {
    if (!targetGroup.trim()) {
      Alert.alert('Missing Input', 'Please enter a group username or link');
      return;
    }
    const total = parseInt(limit, 10) || 500;
    const name = fileName.trim() || `${targetGroup}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`;

    setIsRunning(true);
    setProgress(0);
    setExtracted(0);
    setLogs([]);
    setSavedFileId(null);

    const taskId = createTask({
      type: 'extraction',
      title: `Extract: ${targetGroup}`,
      total,
      config: { targetGroup, limit: total, mode, filterOnline, filterBots },
    });

    addLog(`Starting extraction from ${targetGroup}...`, 'info');
    addLog(`Mode: ${MODES.find((m) => m.id === mode)?.label}`, 'info');
    addLog(`Limit: ${total} members`, 'info');

    const members: Member[] = [];
    let count = 0;

    intervalRef.current = setInterval(async () => {
      const batchSize = Math.floor(Math.random() * 15) + 5;
      for (let i = 0; i < batchSize && count < total; i++) {
        const member = generateMockMember(count, targetGroup);
        if (filterBots && member.isBot) continue;
        if (filterOnline && !member.isOnline) continue;
        members.push(member);
        count++;
      }
      setExtracted(count);
      setProgress(Math.min(Math.round((count / total) * 100), 100));

      if (count % 50 === 0 || count >= total) {
        addLog(`Extracted ${count}/${total} members`, 'info');
        updateTask(taskId, { processed: count, total, succeeded: count });
        logTask(taskId, `Extracted ${count}/${total} members`);
      }

      if (count >= total) {
        clearInterval(intervalRef.current);
        addLog(`✓ Extraction complete! ${count} members extracted`, 'success');
        addLog(`Saving to file: "${name}"...`, 'info');
        const file = await createFile(name, members, targetGroup);
        setSavedFileId(file.id);
        addLog(`✓ Saved as "${name}" (${count} members)`, 'success');
        updateTask(taskId, { status: 'completed', processed: count, succeeded: count, outputFileId: file.id });
        setIsRunning(false);
      }
    }, 300);
  };

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    addLog('Extraction stopped by user', 'warning');
  };

  const Toggle = ({ value, onToggle, label, desc }: any) => (
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
          {/* Progress Card (shown when running) */}
          {(isRunning || savedFileId) && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '60' : palette.success + '60', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {isRunning ? 'Extracting...' : '✓ Extraction Complete'}
                </Text>
                <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '800' }}>{extracted} / {limit}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, marginBottom: 12 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: isRunning ? palette.primary : palette.success, width: `${progress}%` }} />
              </View>
              <ScrollView style={{ maxHeight: 100 }} showsVerticalScrollIndicator={false}>
                {logs.map((log, i) => (
                  <Text key={i} style={{ color: log.type === 'success' ? palette.success : log.type === 'error' ? palette.error : log.type === 'warning' ? palette.warning : palette.muted, fontSize: 11, lineHeight: 18 }}>
                    [{log.type.toUpperCase()}] {log.msg}
                  </Text>
                ))}
              </ScrollView>
              {savedFileId && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
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
              />
            </View>
          </View>

          {/* Extraction Mode */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Extraction Mode</Text>
            <View style={{ gap: 8 }}>
              {MODES.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: mode === m.id ? palette.primary + '15' : 'transparent', borderWidth: 1, borderColor: mode === m.id ? palette.primary : palette.border }}
                  onPress={() => setMode(m.id as ExtractionMode)}
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
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: limit === v ? palette.primary : palette.background, borderWidth: 1, borderColor: limit === v ? palette.primary : palette.border, alignItems: 'center' }}
                    onPress={() => setLimit(v === 'All' ? '99999' : v)}
                  >
                    <Text style={{ color: limit === v ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={limit}
                onChangeText={setLimit}
                placeholder="Custom number..."
                placeholderTextColor={palette.muted}
                keyboardType="numeric"
                style={{ marginTop: 8, backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }}
              />
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={filterOnline} onToggle={() => setFilterOnline(!filterOnline)} label="Active Members Only" desc="Skip members inactive for 30+ days" />
            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={filterBots} onToggle={() => setFilterBots(!filterBots)} label="Exclude Bots" desc="Skip bot accounts from extraction" />
          </View>

          {/* Save As */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 16 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>Save As File</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="folder" size={16} color={palette.muted} />
              <TextInput
                value={fileName}
                onChangeText={setFileName}
                placeholder={targetGroup ? `${targetGroup}_extracted` : 'File name (auto-generated if empty)'}
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 10 }}
              />
            </View>
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>Members will be saved automatically after extraction</Text>
          </View>

          {/* Action Buttons */}
          {!isRunning ? (
            <TouchableOpacity
              style={{ borderRadius: 14, overflow: 'hidden' }}
              onPress={handleStart}
            >
              <LinearGradient
                colors={['#6D28D9', '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <MaterialIcons name="download" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Start Extraction</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: palette.error + '20', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.error + '40' }}
              onPress={handleStop}
            >
              <MaterialIcons name="stop" size={20} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>Stop Extraction</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
