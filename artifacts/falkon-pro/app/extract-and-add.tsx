import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useMembersStore, type Member } from '@/lib/members-store';
import { useTaskRunner } from '@/lib/task-runner';

function generateMockMember(index: number, group: string): Member {
  return {
    id: `m_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 4)}`,
    userId: `${100000000 + Math.floor(Math.random() * 900000000)}`,
    username: Math.random() > 0.3 ? `user_${Math.floor(Math.random() * 99999)}` : undefined,
    firstName: ['Ahmed', 'Mohamed', 'Ali', 'Sara', 'Nour', 'Layla'][index % 6],
    isOnline: Math.random() > 0.6,
    status: 'pending',
    source: group,
    extractedAt: new Date().toISOString(),
  };
}

type Phase = 'idle' | 'extracting' | 'adding' | 'done';

export default function ExtractAndAddScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { createFile, updateMemberStatus } = useMembersStore();
  const { createTask, updateTask, logTask } = useTaskRunner();

  const [sourceGroup, setSourceGroup] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('200');
  const [delay, setDelay] = useState('45');
  const [addPerAccount, setAddPerAccount] = useState('40');
  const [filterOnline, setFilterOnline] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [extractCount, setExtractCount] = useState(0);
  const [addStats, setAddStats] = useState({ added: 0, failed: 0, flood: 0, skipped: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);

  const addLog = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 80));

  const handleStart = async () => {
    if (!sourceGroup.trim() || !targetGroup.trim()) {
      Alert.alert('Missing Input', 'Fill in both source and target groups');
      return;
    }
    const total = parseInt(limit, 10) || 200;
    const name = `ExtractAdd_${sourceGroup}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`;
    setPhase('extracting');
    setExtractCount(0);
    setAddStats({ added: 0, failed: 0, flood: 0, skipped: 0 });
    setLogs([]);
    setSavedFileId(null);

    const extractTask = createTask({ type: 'extraction', title: `Extract: ${sourceGroup}`, total, config: { sourceGroup, limit: total } });
    addLog(`[EXTRACT] Starting from ${sourceGroup}...`);

    const members: Member[] = [];
    let eCount = 0;

    const extractInterval = setInterval(async () => {
      const batch = Math.floor(Math.random() * 12) + 4;
      for (let i = 0; i < batch && eCount < total; i++) {
        const m = generateMockMember(eCount, sourceGroup);
        if (filterOnline && !m.isOnline) continue;
        members.push(m);
        eCount++;
      }
      setExtractCount(eCount);
      updateTask(extractTask, { processed: eCount, succeeded: eCount });
      if (eCount % 50 === 0) addLog(`[EXTRACT] ${eCount}/${total} extracted`);

      if (eCount >= total) {
        clearInterval(extractInterval);
        updateTask(extractTask, { status: 'completed' });
        addLog(`[EXTRACT] ✓ Complete: ${eCount} members`);

        const file = await createFile(name, members, sourceGroup);
        setSavedFileId(file.id);
        addLog(`[SAVE] ✓ Saved as "${name}"`);
        addLog(`[ADD] Starting add to ${targetGroup}...`);
        setPhase('adding');

        const addTask = createTask({ type: 'add-from-file', title: `Add → ${targetGroup}`, total: members.length, config: { targetGroup, delay, addPerAccount }, outputFileId: file.id });

        let aIndex = 0;
        let added = 0, failed = 0, flood = 0, skipped = 0;

        const addInterval = setInterval(async () => {
          if (aIndex >= members.length) {
            clearInterval(addInterval);
            updateTask(addTask, { status: 'completed', succeeded: added, failed, skipped });
            addLog(`[ADD] ✓ Done: ${added} added | ${failed} failed | ${flood} flood | ${skipped} skipped`);
            setPhase('done');
            return;
          }
          const m = members[aIndex];
          const rand = Math.random();
          let result: 'added' | 'failed' | 'flood' | 'already_member';
          if (rand < 0.65) { result = 'added'; added++; }
          else if (rand < 0.80) { result = 'already_member'; skipped++; }
          else if (rand < 0.92) { result = 'failed'; failed++; }
          else { result = 'flood'; flood++; }

          await updateMemberStatus(file.id, m.id, result);
          aIndex++;
          setAddStats({ added, failed, flood, skipped });
          updateTask(addTask, { processed: aIndex, succeeded: added, failed, skipped });
          logTask(addTask, `[${result}] ${m.username ?? m.userId}`);
          if (aIndex % 20 === 0) addLog(`[ADD] ${aIndex}/${members.length}: +${added} ✗${failed}`);
        }, Math.max(parseInt(delay, 10) * 100, 150));
      }
    }, 250);
    intervalRef.current = extractInterval;
  };

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('idle');
    addLog('[SYSTEM] Stopped by user');
  };

  const Toggle = ({ value, onToggle, label }: any) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TouchableOpacity style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 2 }} onPress={onToggle}>
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
          <View>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Extract & Add</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 14 }}>
          {/* Phase Progress Card */}
          {phase !== 'idle' && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.primary + '40' }}>
              {/* Phase Indicators */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                {[
                  { key: 'extracting', label: '1. Extract', icon: 'download' as const },
                  { key: 'adding', label: '2. Save', icon: 'save' as const },
                  { key: 'done', label: '3. Add', icon: 'person-add' as const },
                ].map((step, i) => {
                  const isActive = phase === step.key || (step.key === 'adding' && phase === 'done');
                  const isDone = (step.key === 'extracting' && (phase === 'adding' || phase === 'done')) ||
                    (step.key === 'adding' && phase === 'done');
                  return (
                    <React.Fragment key={step.key}>
                      {i > 0 && <View style={{ flex: 1, height: 2, backgroundColor: isDone ? palette.success : palette.border }} />}
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDone ? palette.success : isActive ? palette.primary : palette.border, alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name={isDone ? 'check' : step.icon} size={16} color="#fff" />
                        </View>
                        <Text style={{ color: isActive ? palette.primary : isDone ? palette.success : palette.muted, fontSize: 9, fontWeight: '700' }}>{step.label}</Text>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>

              {/* Stats */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 10, backgroundColor: palette.background + '80', borderRadius: 10, marginBottom: 10 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.primary, fontSize: 18, fontWeight: '900' }}>{extractCount}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Extracted</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.success, fontSize: 18, fontWeight: '900' }}>{addStats.added}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Added</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.error, fontSize: 18, fontWeight: '900' }}>{addStats.failed}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Failed</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.warning, fontSize: 18, fontWeight: '900' }}>{addStats.flood}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Flood</Text>
                </View>
              </View>

              {/* Logs */}
              <ScrollView style={{ maxHeight: 90, backgroundColor: palette.background, borderRadius: 8, padding: 8 }} showsVerticalScrollIndicator={false}>
                {logs.map((log, i) => (
                  <Text key={i} style={{ color: log.includes('✓') ? palette.success : log.includes('✗') || log.includes('Failed') ? palette.error : log.includes('⚠') ? palette.warning : palette.muted, fontSize: 10, lineHeight: 16 }}>{log}</Text>
                ))}
              </ScrollView>

              {phase === 'done' && savedFileId && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }} onPress={() => router.push({ pathname: '/members-file', params: { id: savedFileId } } as any)}>
                    <MaterialIcons name="folder-open" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>View Results</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: palette.border, flexDirection: 'row', justifyContent: 'center', gap: 6 }} onPress={() => { setPhase('idle'); setLogs([]); }}>
                    <MaterialIcons name="refresh" size={16} color={palette.foreground} />
                    <Text style={{ color: palette.foreground, fontWeight: '700', fontSize: 13 }}>New Task</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Source & Target */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Groups</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="download" size={14} color={palette.muted} />
              <TextInput value={sourceGroup} onChangeText={setSourceGroup} placeholder="Source group (@group or link)" placeholderTextColor={palette.muted} style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 11 }} autoCapitalize="none" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="upload" size={14} color={palette.muted} />
              <TextInput value={targetGroup} onChangeText={setTargetGroup} placeholder="Target group (@group or link)" placeholderTextColor={palette.muted} style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 11 }} autoCapitalize="none" />
            </View>
          </View>

          {/* Config */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Configuration</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 5 }}>Extract Limit</Text>
                <TextInput value={limit} onChangeText={setLimit} keyboardType="numeric" placeholder="200" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 5 }}>Add Delay (sec)</Text>
                <TextInput value={delay} onChangeText={setDelay} keyboardType="numeric" placeholder="45" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }} />
              </View>
            </View>
            <Toggle value={filterOnline} onToggle={() => setFilterOnline(!filterOnline)} label="Extract Active Members Only" />
          </View>

          {/* Info */}
          <View style={{ backgroundColor: palette.primary + '10', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.primary + '30', flexDirection: 'row', gap: 8 }}>
            <MaterialIcons name="info" size={16} color={palette.primary} />
            <Text style={{ color: palette.primary, fontSize: 11, flex: 1, lineHeight: 17 }}>
              Members are extracted first, auto-saved to a file, then added to the target group. You can view & re-use the file anytime.
            </Text>
          </View>

          {/* Button */}
          {phase === 'idle' || phase === 'done' ? (
            <TouchableOpacity style={{ borderRadius: 14, overflow: 'hidden' }} onPress={handleStart}>
              <LinearGradient colors={['#4C1D95', '#6D28D9', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <MaterialIcons name="rocket-launch" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Start Extract & Add</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ backgroundColor: palette.error + '20', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.error + '40' }} onPress={handleStop}>
              <MaterialIcons name="stop" size={20} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>Stop Task</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
