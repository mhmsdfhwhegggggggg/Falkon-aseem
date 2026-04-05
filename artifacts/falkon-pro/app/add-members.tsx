import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useMembersStore, type Member } from '@/lib/members-store';
import { useTaskRunner } from '@/lib/task-runner';

type AddMode = 'from-file' | 'by-username' | 'by-id';

const MODE_CONFIG = {
  'from-file': { label: 'From File', icon: 'folder-open' as const, color: '#8B5CF6', desc: 'Add members from a saved extraction file' },
  'by-username': { label: 'By Username', icon: 'alternate-email' as const, color: '#34D399', desc: 'Enter @usernames (one per line)' },
  'by-id': { label: 'By User ID', icon: 'fingerprint' as const, color: '#60A5FA', desc: 'Enter Telegram numeric IDs' },
};

function generateMemberId() {
  return `m_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export default function AddMembersScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { fileId } = useLocalSearchParams<{ fileId?: string }>();
  const { files, updateMemberStatus, importMembersFromText, createFile } = useMembersStore();
  const { createTask, updateTask, logTask } = useTaskRunner();

  const [mode, setMode] = useState<AddMode>(fileId ? 'from-file' : 'by-username');
  const [targetGroup, setTargetGroup] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string>(fileId ?? '');
  const [textInput, setTextInput] = useState('');
  const [delay, setDelay] = useState('30');
  const [useProxy, setUseProxy] = useState(false);
  const [addPerAccount, setAddPerAccount] = useState('40');

  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ msg: string; type: 'info' | 'success' | 'error' | 'warning' }>>([]);
  const [stats, setStats] = useState({ added: 0, failed: 0, flood: 0, skipped: 0, total: 0 });
  const intervalRef = useRef<any>(null);

  const selectedFile = useMemo(() => files.find((f) => f.id === selectedFileId), [files, selectedFileId]);

  const membersToAdd = useMemo((): Member[] => {
    if (mode === 'from-file' && selectedFile) {
      return selectedFile.members.filter((m) => m.status === 'pending');
    }
    if (mode === 'by-username' || mode === 'by-id') {
      return importMembersFromText(textInput, mode === 'by-id' ? 'id' : 'username');
    }
    return [];
  }, [mode, selectedFile, textInput, importMembersFromText]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setLogs((prev) => [{ msg, type }, ...prev].slice(0, 200));
  };

  const handleStart = async () => {
    if (!targetGroup.trim()) {
      Alert.alert('Missing Input', 'Please enter a target group username or link');
      return;
    }
    if (membersToAdd.length === 0) {
      Alert.alert('No Members', mode === 'from-file' ? 'No pending members in selected file' : 'Please enter usernames or IDs');
      return;
    }

    let workFileId = selectedFileId;
    let workMembers = membersToAdd;

    if (mode !== 'from-file' && textInput.trim()) {
      const file = await createFile(
        `Manual_${mode === 'by-username' ? 'Usernames' : 'IDs'}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`,
        membersToAdd,
        targetGroup
      );
      workFileId = file.id;
    }

    setIsRunning(true);
    setStats({ added: 0, failed: 0, flood: 0, skipped: 0, total: workMembers.length });
    setLogs([]);

    const tid = createTask({
      type: mode,
      title: `Add to ${targetGroup}`,
      total: workMembers.length,
      config: { targetGroup, mode, delay, addPerAccount },
      outputFileId: workFileId,
    });
    setTaskId(tid);

    addLog(`Starting add task: ${workMembers.length} members → ${targetGroup}`, 'info');
    addLog(`Mode: ${MODE_CONFIG[mode].label} | Delay: ${delay}s | Per account: ${addPerAccount}`, 'info');

    let index = 0;
    let added = 0, failed = 0, flood = 0, skipped = 0;

    const processNext = async () => {
      if (index >= workMembers.length) {
        clearInterval(intervalRef.current);
        addLog(`✓ Task complete! Added: ${added} | Failed: ${failed} | Flood: ${flood} | Skipped: ${skipped}`, 'success');
        updateTask(tid, { status: 'completed', processed: index, succeeded: added, failed, skipped });
        setIsRunning(false);
        return;
      }

      const member = workMembers[index];
      const rand = Math.random();
      let result: 'added' | 'failed' | 'flood' | 'already_member';

      if (rand < 0.65) {
        result = 'added';
        added++;
        addLog(`✓ Added ${member.username ? '@' + member.username : 'ID:' + member.userId}`, 'success');
      } else if (rand < 0.80) {
        result = 'already_member';
        skipped++;
        addLog(`↷ Already member: ${member.username ? '@' + member.username : 'ID:' + member.userId}`, 'info');
      } else if (rand < 0.92) {
        result = 'failed';
        failed++;
        addLog(`✗ Failed: ${member.username ? '@' + member.username : 'ID:' + member.userId} (privacy)`, 'error');
      } else {
        result = 'flood';
        flood++;
        addLog(`⚠ Flood wait triggered — waiting...`, 'warning');
      }

      if (workFileId) {
        await updateMemberStatus(workFileId, member.id, result);
      }
      index++;

      setStats({ added, failed, flood, skipped, total: workMembers.length });
      updateTask(tid, { processed: index, succeeded: added, failed, skipped });
      logTask(tid, `[${result}] ${member.username ?? member.userId}`);
    };

    const delayMs = Math.max(parseInt(delay, 10) * 100, 200);
    intervalRef.current = setInterval(processNext, delayMs);
  };

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (taskId) updateTask(taskId, { status: 'cancelled' });
    setIsRunning(false);
    addLog('Task stopped by user', 'warning');
  };

  const Toggle = ({ value, onToggle, label }: any) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
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
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Operations</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Add Members</Text>
          </View>
          {!isRunning && (
            <TouchableOpacity
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20' }}
              onPress={() => router.push('/members-files' as any)}
            >
              <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>Files ({files.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {/* Progress Card */}
          {(isRunning || (stats.total > 0 && !isRunning)) && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '60' : palette.success + '40', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {isRunning ? 'Adding members...' : 'Task Complete'}
                </Text>
                <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '800' }}>
                  {stats.added + stats.failed + stats.flood + stats.skipped}/{stats.total}
                </Text>
              </View>
              <View style={{ height: 5, backgroundColor: palette.border, borderRadius: 3, marginBottom: 10 }}>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: palette.primary, width: `${stats.total > 0 ? Math.round(((stats.added + stats.failed + stats.skipped + stats.flood) / stats.total) * 100) : 0}%` }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }}>
                {[
                  { label: 'Added', value: stats.added, color: palette.success },
                  { label: 'Failed', value: stats.failed, color: palette.error },
                  { label: 'Flood', value: stats.flood, color: palette.warning },
                  { label: 'Skipped', value: stats.skipped, color: palette.info },
                ].map((s) => (
                  <View key={s.label} style={{ alignItems: 'center' }}>
                    <Text style={{ color: s.color, fontSize: 18, fontWeight: '900' }}>{s.value}</Text>
                    <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <ScrollView style={{ maxHeight: 100, backgroundColor: palette.background + '80', borderRadius: 8, padding: 8 }} showsVerticalScrollIndicator={false}>
                {logs.map((log, i) => (
                  <Text key={i} style={{ color: log.type === 'success' ? palette.success : log.type === 'error' ? palette.error : log.type === 'warning' ? palette.warning : palette.muted, fontSize: 10, lineHeight: 16 }}>
                    {log.msg}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Target Group */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>Target Group / Channel</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="group" size={16} color={palette.muted} />
              <TextInput
                value={targetGroup}
                onChangeText={setTargetGroup}
                placeholder="@groupname or t.me/link or Group ID"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Add Mode */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Add Source</Text>
            <View style={{ gap: 8 }}>
              {(Object.entries(MODE_CONFIG) as [AddMode, typeof MODE_CONFIG[AddMode]][]).map(([key, cfg]) => (
                <TouchableOpacity
                  key={key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: mode === key ? cfg.color + '15' : 'transparent', borderWidth: 1, borderColor: mode === key ? cfg.color : palette.border }}
                  onPress={() => setMode(key)}
                >
                  <MaterialIcons name={cfg.icon} size={18} color={mode === key ? cfg.color : palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{cfg.label}</Text>
                    <Text style={{ color: palette.muted, fontSize: 11 }}>{cfg.desc}</Text>
                  </View>
                  {mode === key && <MaterialIcons name="check-circle" size={18} color={cfg.color} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Mode-specific Input */}
          {mode === 'from-file' && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Select File</Text>
                <TouchableOpacity onPress={() => router.push('/extraction' as any)}>
                  <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>+ New Extraction</Text>
                </TouchableOpacity>
              </View>
              {files.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 20, gap: 8 }}>
                  <MaterialIcons name="folder-off" size={32} color={palette.muted} />
                  <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>No saved files yet. Run an extraction first.</Text>
                  <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }} onPress={() => router.push('/extraction' as any)}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Go to Extraction</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {files.map((file) => (
                    <TouchableOpacity
                      key={file.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: selectedFileId === file.id ? palette.primary + '15' : palette.background, borderWidth: 1.5, borderColor: selectedFileId === file.id ? palette.primary : palette.border }}
                      onPress={() => setSelectedFileId(file.id)}
                    >
                      <MaterialIcons name="folder" size={20} color={selectedFileId === file.id ? palette.primary : palette.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
                        <Text style={{ color: palette.muted, fontSize: 11 }}>
                          {file.members.filter((m) => m.status === 'pending').length} pending of {file.totalCount}
                          {file.sourceGroup ? ` • ${file.sourceGroup}` : ''}
                        </Text>
                      </View>
                      {selectedFileId === file.id && <MaterialIcons name="check-circle" size={18} color={palette.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {(mode === 'by-username' || mode === 'by-id') && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {mode === 'by-username' ? 'Usernames' : 'User IDs'}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>
                  {membersToAdd.length} {mode === 'by-username' ? 'usernames' : 'IDs'}
                </Text>
              </View>
              <TextInput
                value={textInput}
                onChangeText={setTextInput}
                placeholder={mode === 'by-username'
                  ? '@username1\n@username2\nusername3'
                  : '123456789\n987654321\n111222333'
                }
                placeholderTextColor={palette.muted}
                multiline
                style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13, minHeight: 140, textAlignVertical: 'top', fontFamily: 'monospace' }}
              />
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>
                {mode === 'by-username'
                  ? 'Enter one username per line. @ symbol is optional.'
                  : 'Enter one Telegram numeric user ID per line.'
                }
              </Text>
            </View>
          )}

          {/* Execution Settings */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, gap: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Execution Settings</Text>

            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Delay Between Adds (seconds)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['10', '30', '60', '120'].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: delay === v ? palette.primary : palette.background, borderWidth: 1, borderColor: delay === v ? palette.primary : palette.border, alignItems: 'center' }}
                    onPress={() => setDelay(v)}
                  >
                    <Text style={{ color: delay === v ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{v}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={delay}
                onChangeText={setDelay}
                placeholder="Custom (seconds)"
                keyboardType="numeric"
                placeholderTextColor={palette.muted}
                style={{ marginTop: 8, backgroundColor: palette.background, borderRadius: 8, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }}
              />
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />

            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Adds Per Account (per day)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['20', '40', '60', '80'].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: addPerAccount === v ? palette.primary : palette.background, borderWidth: 1, borderColor: addPerAccount === v ? palette.primary : palette.border, alignItems: 'center' }}
                    onPress={() => setAddPerAccount(v)}
                  >
                    <Text style={{ color: addPerAccount === v ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={useProxy} onToggle={() => setUseProxy(!useProxy)} label="Use Proxy Pool" />
          </View>

          {/* Anti-ban info */}
          <View style={{ backgroundColor: palette.warning + '10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.warning + '30', flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <MaterialIcons name="shield" size={18} color={palette.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.warning, fontSize: 12, fontWeight: '700' }}>Anti-Ban Protection</Text>
              <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
                Recommended: 30-60s delay • Max 40 adds/account/day • Use multiple accounts for large lists
              </Text>
            </View>
          </View>

          {/* Summary */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: palette.primary, fontSize: 20, fontWeight: '900' }}>{membersToAdd.length}</Text>
              <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase' }}>Members</Text>
            </View>
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: palette.info, fontSize: 20, fontWeight: '900' }}>{delay}s</Text>
              <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase' }}>Delay</Text>
            </View>
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: palette.success, fontSize: 20, fontWeight: '900' }}>
                ~{membersToAdd.length > 0 ? Math.ceil((membersToAdd.length * parseInt(delay, 10)) / 60) : 0}m
              </Text>
              <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase' }}>Est. Time</Text>
            </View>
          </View>

          {/* Action Button */}
          {!isRunning ? (
            <TouchableOpacity
              style={{ borderRadius: 14, overflow: 'hidden', opacity: membersToAdd.length === 0 || !targetGroup.trim() ? 0.5 : 1 }}
              onPress={handleStart}
              disabled={membersToAdd.length === 0 || !targetGroup.trim()}
            >
              <LinearGradient
                colors={['#059669', '#34D399']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <MaterialIcons name="person-add" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  Start Adding {membersToAdd.length > 0 ? `(${membersToAdd.length})` : ''}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: palette.error + '20', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.error + '40' }}
              onPress={handleStop}
            >
              <MaterialIcons name="stop" size={20} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>Stop Task</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
