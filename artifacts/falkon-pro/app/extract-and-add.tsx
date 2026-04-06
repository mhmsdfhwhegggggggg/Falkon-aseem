/**
 * Extract & Add — REAL implementation
 * =====================================
 * Phase 1: Real extraction via trpc.extraction.start/status/result
 * Phase 2: Save real members to phone storage (AsyncStorage)
 * Phase 3: Real add via trpc.addMembers.start/status + account rotation
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';
import { useMembersStore } from '@/lib/members-store';

type Phase = 'idle' | 'extracting' | 'saving' | 'adding' | 'done' | 'error';
type DataFilter = 'all' | 'with-username' | 'without-username';

// ── Last-seen presets ────────────────────────────────────────────────────────
const LAST_SEEN_PRESETS = [
  { label: 'الكل',    days: 0 },
  { label: 'يوم',    days: 1 },
  { label: '3 أيام', days: 3 },
  { label: 'أسبوع',  days: 7 },
  { label: 'شهر',    days: 30 },
  { label: 'مخصص',   days: -1 },
];

const DATA_OPTS: { id: DataFilter; label: string; desc: string }[] = [
  { id: 'all',              label: 'الكل',     desc: 'جميع المستخدمين' },
  { id: 'with-username',    label: 'يوزر @',   desc: 'من لديهم @username' },
  { id: 'without-username', label: 'ID فقط',   desc: 'من لا يوجد لديهم username' },
];

const DELAY_OPTIONS = [
  { label: '15ث', val: 15 },
  { label: '30ث', val: 30 },
  { label: '45ث', val: 45 },
  { label: '60ث', val: 60 },
  { label: '90ث', val: 90 },
];

const Toggle = ({ value, onToggle, label, desc, palette, disabled }: any) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: disabled ? 0.4 : 1 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {desc && <Text style={{ color: palette.muted, fontSize: 11, marginTop: 1 }}>{desc}</Text>}
    </View>
    <TouchableOpacity
      style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 2 }}
      onPress={() => !disabled && onToggle()}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </TouchableOpacity>
  </View>
);

export default function ExtractAndAddScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const localAccounts = useAccountsStore();
  const membersStore = useMembersStore();

  // ── Form state ────────────────────────────────────────────────────────────
  const [sourceGroup, setSourceGroup] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('200');
  const [delay, setDelay] = useState(30);
  const [lastSeenIdx, setLastSeenIdx] = useState(0);
  const [customDays, setCustomDays] = useState('');
  const [dataFilter, setDataFilter] = useState<DataFilter>('all');
  const [excludeBots, setExcludeBots] = useState(true);

  // ── Job state ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [addJobId, setAddJobId] = useState<string | null>(null);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [addStats, setAddStats] = useState({ added: 0, failed: 0, flood: 0 });

  const addLog = useCallback((msg: string) =>
    setLogs((p) => [msg, ...p].slice(0, 100)), []);

  // ── tRPC mutations & queries ──────────────────────────────────────────────
  const extractStart = trpc.extraction.start.useMutation();
  const addStart = trpc.addMembers.start.useMutation();

  const extractStatus = trpc.extraction.status.useQuery(
    { jobId: extractJobId! },
    { enabled: !!extractJobId && phase === 'extracting', refetchInterval: 2000 }
  );
  const extractResult = trpc.extraction.result.useQuery(
    { jobId: extractJobId! },
    { enabled: false }
  );
  const addStatus = trpc.addMembers.status.useQuery(
    { jobId: addJobId! },
    { enabled: !!addJobId && phase === 'adding', refetchInterval: 2000 }
  );

  // ── Watch extraction progress ─────────────────────────────────────────────
  useEffect(() => {
    if (!extractStatus.data || phase !== 'extracting') return;
    const { status, progress, total, error } = extractStatus.data;

    if (status === 'running' || status === 'queued') {
      if (progress > 0) addLog(`[استخراج] ${progress}/${total || '?'} عضو`);
    } else if (status === 'completed') {
      addLog(`[استخراج] ✓ اكتمل: ${progress} عضو`);
      setPhase('saving');
      // Fetch full result and save to phone
      extractResult.refetch().then(async (res) => {
        if (!res.data?.members || res.data.members.length === 0) {
          addLog('[خطأ] لم يُعثر على أعضاء للاستخراج');
          setPhase('error');
          return;
        }
        const members = res.data.members;
        const groupSlug = sourceGroup.replace(/^@/, '').replace(/https?:\/\/t\.me\//, '').replace(/\//g, '_').substring(0, 40);
        const name = `ExtractAdd_${groupSlug}_${new Date().toISOString().split('T')[0]}`;
        const phoneMembers = members.map((m: any) => ({
          id: `m_${m.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          userId: m.userId,
          username: m.username || '',
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          phone: m.phone || '',
          isOnline: m.isOnline || false,
          lastSeen: m.lastSeen,
          status: 'pending' as const,
          source: sourceGroup,
          extractedAt: new Date().toISOString(),
        }));
        const saved = await membersStore.createFile(name, phoneMembers, sourceGroup);
        setSavedFileId(saved.id);
        addLog(`[حفظ] ✓ تم حفظ ${phoneMembers.length} عضو`);
        // Start adding phase
        await startAddPhase(phoneMembers);
      });
    } else if (status === 'failed') {
      addLog(`[خطأ] الاستخراج فشل: ${error || 'خطأ غير معروف'}`);
      setPhase('error');
    }
  }, [extractStatus.data?.status, extractStatus.data?.progress]);

  // ── Watch add progress ────────────────────────────────────────────────────
  useEffect(() => {
    if (!addStatus.data || phase !== 'adding') return;
    const { status, added, failed, error, progress, total } = addStatus.data;
    const flood = (addStatus.data as any).flood || 0;

    setAddStats({ added: added || 0, failed: failed || 0, flood });

    const isRotating = error?.startsWith('🔄');
    const isFloodWait = error?.startsWith('⏳');
    if (error && !isRotating && !isFloodWait) {
      // Not a warning — log it
    }
    if (isRotating) addLog(`🔄 تبديل حساب تلقائي...`);
    if (isFloodWait) addLog(`⏳ ${error?.replace('⏳ ', '')}`);
    if (progress > 0 && progress % 10 === 0) addLog(`[إضافة] ${progress}/${total}: +${added} ✗${failed}`);

    if (status === 'completed' || status === 'failed') {
      if (status === 'completed') {
        addLog(`[إضافة] ✓ انتهى: ${added} مضاف | ${failed} فاشل`);
      } else {
        addLog(`[إضافة] ✗ فشل: ${error}`);
      }
      // Sync member statuses back to phone storage so the file shows real results
      const serverMembers = (addStatus.data as any).members as any[] | null;
      if (savedFileId && serverMembers && serverMembers.length > 0) {
        const updates = serverMembers
          .filter((m: any) => m.status !== 'pending')
          .map((m: any) => ({
            userId: m.userId || undefined,
            username: m.username || undefined,
            status: m.status as any,
            error: m.error,
          }));
        if (updates.length > 0) {
          membersStore.batchUpdateMemberStatuses(savedFileId, updates);
          addLog(`[حفظ] ✓ تم تحديث حالة ${updates.length} عضو في الملف المحلي`);
        }
      }
      setPhase('done');
    }
  }, [addStatus.data?.status, addStatus.data?.added, addStatus.data?.progress]);

  // ── Start add phase (called internally after save) ────────────────────────
  const startAddPhase = async (phoneMembers: any[]) => {
    setPhase('adding');
    addLog(`[إضافة] جاري الإضافة إلى ${targetGroup}...`);
    try {
      const activeAccounts = localAccounts.activeAccounts;
      const allAccountsList = await Promise.all(
        activeAccounts.map(async (acc) => ({
          id: acc.id,
          sessionString: await localAccounts.getSession(acc.id) || undefined,
        }))
      );
      const primary = allAccountsList[0]!;

      const inlineMembers = phoneMembers.map((m) => ({
        userId: m.userId || '',
        username: m.username || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        isOnline: m.isOnline || false,
        phone: m.phone,
        lastSeen: m.lastSeen,
        status: 'pending' as const,
      }));

      const result = await addStart.mutateAsync({
        targetGroup: targetGroup.trim(),
        mode: 'from-phone',
        members: inlineMembers,
        delaySeconds: delay,
        maxPerDay: 40,
        accountId: primary.id,
        sessionString: primary.sessionString,
        allAccounts: allAccountsList,
      });
      setAddJobId(result.jobId);
    } catch (err: any) {
      addLog(`[خطأ] فشل بدء الإضافة: ${err.message}`);
      setPhase('error');
    }
  };

  // ── Main start handler ────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!sourceGroup.trim()) return Alert.alert('حقل فارغ', 'أدخل المجموعة المصدر');
    if (!targetGroup.trim()) return Alert.alert('حقل فارغ', 'أدخل المجموعة الهدف');
    const activeAccounts = localAccounts.activeAccounts;
    if (activeAccounts.length === 0) return Alert.alert('لا يوجد حساب', 'أضف حساب Telegram نشط من تبويب الحسابات');

    const total = parseInt(limit, 10) || 200;
    const account = activeAccounts[0]!;
    const sessionString = await localAccounts.getSession(account.id);

    const preset = LAST_SEEN_PRESETS[lastSeenIdx]!;
    const lastSeenDays = preset.days === -1 ? (parseInt(customDays, 10) || 0) : preset.days;

    setPhase('extracting');
    setExtractJobId(null);
    setAddJobId(null);
    setSavedFileId(null);
    setLogs([]);
    setAddStats({ added: 0, failed: 0, flood: 0 });
    addLog(`[استخراج] بدء من ${sourceGroup}...`);

    try {
      const result = await extractStart.mutateAsync({
        group: sourceGroup.trim(),
        limit: total,
        excludeBots,
        lastSeenDays,
        dataFilter: dataFilter === 'all' ? 'all' : dataFilter,
        mode: 'members',
        accountId: account.id,
        sessionString: sessionString || undefined,
      });
      setExtractJobId(result.jobId);
    } catch (err: any) {
      addLog(`[خطأ] فشل الاستخراج: ${err.message}`);
      setPhase('error');
    }
  };

  const handleStop = () => {
    setPhase('idle');
    addLog('[نظام] تم الإيقاف');
  };

  const handleReset = () => {
    setPhase('idle');
    setExtractJobId(null);
    setAddJobId(null);
    setSavedFileId(null);
    setLogs([]);
    setAddStats({ added: 0, failed: 0, flood: 0 });
  };

  const activeAccounts = localAccounts.activeAccounts;
  const isRunning = phase === 'extracting' || phase === 'adding' || phase === 'saving';
  const extractProg = extractStatus.data;
  const addProg = addStatus.data;

  const getLastSeenDays = () => {
    const p = LAST_SEEN_PRESETS[lastSeenIdx]!;
    return p.days === -1 ? (parseInt(customDays, 10) || 0) : p.days;
  };

  // Phase labels and icons
  const steps = [
    { key: 'extracting', label: 'استخراج', icon: 'download' as const },
    { key: 'saving',     label: 'حفظ',     icon: 'save' as const },
    { key: 'adding',     label: 'إضافة',   icon: 'person-add' as const },
  ];
  const phaseOrder: Phase[] = ['extracting', 'saving', 'adding', 'done'];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>استخراج وإضافة</Text>
          </View>
          {(phase === 'done' || phase === 'error') && savedFileId && (
            <TouchableOpacity
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20' }}
              onPress={() => router.push({ pathname: '/members-file', params: { id: savedFileId } } as any)}
            >
              <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>الملف</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 14 }}>

          {/* ── Account status ─────────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: activeAccounts.length > 0 ? palette.success + '50' : palette.error + '50', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name={activeAccounts.length > 0 ? 'check-circle' : 'error'} size={18} color={activeAccounts.length > 0 ? palette.success : palette.error} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: activeAccounts.length > 0 ? palette.success : palette.error, fontSize: 13, fontWeight: '700' }}>
                {activeAccounts.length > 0
                  ? `${activeAccounts.length} حساب نشط${activeAccounts.length > 1 ? ' (تدوير تلقائي عند PeerFlood)' : ''}`
                  : 'لا يوجد حساب — أضف من تبويب الحسابات'}
              </Text>
              {activeAccounts.length > 0 && (
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 1 }}>
                  {activeAccounts.map((a) => a.firstName || a.phone).join(' · ')}
                </Text>
              )}
            </View>
            {activeAccounts.length > 1 && (
              <View style={{ backgroundColor: palette.success + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: palette.success, fontSize: 11, fontWeight: '800' }}>×{activeAccounts.length}</Text>
              </View>
            )}
          </View>

          {/* ── Progress card (shown while running / done) ─────────────── */}
          {phase !== 'idle' && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: phase === 'error' ? palette.error + '50' : phase === 'done' ? palette.success + '50' : palette.primary + '50' }}>

              {/* Step indicators */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                {steps.map((step, i) => {
                  const phaseIdx = phaseOrder.indexOf(phase);
                  const stepIdx = phaseOrder.indexOf(step.key as Phase);
                  const isDone = phaseIdx > stepIdx || phase === 'done';
                  const isActive = phase === step.key || (step.key === 'saving' && phase === 'saving');
                  return (
                    <React.Fragment key={step.key}>
                      {i > 0 && <View style={{ flex: 1, height: 2, backgroundColor: isDone ? palette.success : palette.border }} />}
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDone ? palette.success : isActive ? palette.primary : palette.border, alignItems: 'center', justifyContent: 'center' }}>
                          {isActive && !isDone
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <MaterialIcons name={isDone ? 'check' : step.icon} size={17} color="#fff" />}
                        </View>
                        <Text style={{ color: isDone ? palette.success : isActive ? palette.primary : palette.muted, fontSize: 10, fontWeight: '700' }}>{step.label}</Text>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>

              {/* Stats bar */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: palette.background + '80', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: '900' }}>
                    {extractProg?.progress || 0}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>مُستخرج</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.success, fontSize: 20, fontWeight: '900' }}>{addStats.added}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>مُضاف</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.error, fontSize: 20, fontWeight: '900' }}>{addStats.failed}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>فاشل</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: palette.warning, fontSize: 20, fontWeight: '900' }}>{addStats.flood}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Flood</Text>
                </View>
              </View>

              {/* Add progress bar */}
              {phase === 'adding' && addProg && addProg.total > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.success, width: `${Math.round((addProg.progress / addProg.total) * 100)}%` }} />
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 10, marginTop: 4 }}>
                    {addProg.progress}/{addProg.total} — {Math.round((addProg.progress / addProg.total) * 100)}%
                  </Text>
                </View>
              )}

              {/* Logs */}
              <ScrollView style={{ maxHeight: 100, backgroundColor: palette.background, borderRadius: 8, padding: 8 }} showsVerticalScrollIndicator={false}>
                {logs.map((log, i) => (
                  <Text key={i} style={{
                    color: log.includes('✓') ? palette.success
                      : log.includes('✗') || log.includes('خطأ') || log.includes('فشل') ? palette.error
                      : log.includes('⏳') || log.includes('🔄') ? palette.warning
                      : palette.muted,
                    fontSize: 10, lineHeight: 16,
                  }}>{log}</Text>
                ))}
              </ScrollView>

              {/* Done actions */}
              {(phase === 'done' || phase === 'error') && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {savedFileId && (
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                      onPress={() => router.push({ pathname: '/members-file', params: { id: savedFileId } } as any)}
                    >
                      <MaterialIcons name="folder-open" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>عرض النتائج</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: palette.border, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={handleReset}
                  >
                    <MaterialIcons name="refresh" size={16} color={palette.foreground} />
                    <Text style={{ color: palette.foreground, fontWeight: '700', fontSize: 13 }}>مهمة جديدة</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Source & Target groups ─────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>المجموعات</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="download" size={14} color={palette.primary} />
              <TextInput
                value={sourceGroup} onChangeText={setSourceGroup}
                placeholder="المصدر: @group أو t.me/link"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 12 }}
                autoCapitalize="none" editable={!isRunning}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="upload" size={14} color={palette.success} />
              <TextInput
                value={targetGroup} onChangeText={setTargetGroup}
                placeholder="الهدف: @group أو t.me/link"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 12 }}
                autoCapitalize="none" editable={!isRunning}
              />
            </View>
          </View>

          {/* ── Last seen filter ───────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MaterialIcons name="schedule" size={16} color={palette.primary} />
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>آخر ظهور</Text>
              {getLastSeenDays() > 0 && (
                <View style={{ backgroundColor: palette.primary + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' }}>
                  <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '800' }}>
                    آخر {getLastSeenDays()} يوم
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LAST_SEEN_PRESETS.map((p, idx) => {
                const isSel = lastSeenIdx === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => !isRunning && setLastSeenIdx(idx)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isSel ? palette.primary : palette.background, borderWidth: 1, borderColor: isSel ? palette.primary : palette.border, opacity: isRunning ? 0.5 : 1 }}
                  >
                    <Text style={{ color: isSel ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {LAST_SEEN_PRESETS[lastSeenIdx]?.days === -1 && (
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.primary + '60', paddingHorizontal: 14, gap: 8 }}>
                <TextInput
                  value={customDays} onChangeText={(v) => setCustomDays(v.replace(/[^0-9]/g, ''))}
                  placeholder="عدد الأيام (مثل 14)"
                  placeholderTextColor={palette.muted} keyboardType="numeric"
                  style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                  editable={!isRunning}
                />
                <Text style={{ color: palette.muted, fontSize: 12 }}>يوم</Text>
              </View>
            )}
          </View>

          {/* ── Data type filter ───────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MaterialIcons name="filter-list" size={16} color={palette.primary} />
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>نوع البيانات</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DATA_OPTS.map((opt) => {
                const isSel = dataFilter === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => !isRunning && setDataFilter(opt.id)}
                    style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: isSel ? palette.primary + '15' : palette.background, borderWidth: 1, borderColor: isSel ? palette.primary : palette.border, alignItems: 'center', opacity: isRunning ? 0.5 : 1 }}
                  >
                    <Text style={{ color: isSel ? palette.primary : palette.foreground, fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
                    <Text style={{ color: palette.muted, fontSize: 10, marginTop: 2, textAlign: 'center' }}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Configuration ─────────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الإعدادات</Text>

            {/* Extract limit */}
            <View>
              <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 8 }}>حد الاستخراج</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['100', '200', '500', '1000', '5000'].map((v) => {
                  const isSel = limit === v;
                  return (
                    <TouchableOpacity key={v} onPress={() => !isRunning && setLimit(v)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isSel ? palette.primary : palette.background, borderWidth: 1, borderColor: isSel ? palette.primary : palette.border, opacity: isRunning ? 0.5 : 1 }}>
                      <Text style={{ color: isSel ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Delay */}
            <View>
              <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 8 }}>تأخير الإضافة</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {DELAY_OPTIONS.map((d) => {
                  const isSel = delay === d.val;
                  return (
                    <TouchableOpacity key={d.val} onPress={() => !isRunning && setDelay(d.val)}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: isSel ? palette.primary : palette.background, borderWidth: 1, borderColor: isSel ? palette.primary : palette.border, alignItems: 'center', opacity: isRunning ? 0.5 : 1 }}>
                      <Text style={{ color: isSel ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }}>{d.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={excludeBots} onToggle={() => setExcludeBots(!excludeBots)} label="استبعاد البوتات" desc="لا تُدرج حسابات البوت" palette={palette} disabled={isRunning} />
          </View>

          {/* ── Info banner ─────────────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.primary + '10', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.primary + '30', flexDirection: 'row', gap: 8 }}>
            <MaterialIcons name="info" size={16} color={palette.primary} style={{ marginTop: 1 }} />
            <Text style={{ color: palette.primary, fontSize: 11, flex: 1, lineHeight: 17 }}>
              يتم الاستخراج الحقيقي من Telegram ثم الحفظ على الهاتف ثم الإضافة التلقائية. عند PeerFlood يتحول للحساب التالي فوراً إذا أضفت أكثر من حساب.
            </Text>
          </View>

          {/* ── Action button ──────────────────────────────────────────── */}
          {!isRunning ? (
            <TouchableOpacity
              style={{ borderRadius: 14, overflow: 'hidden', opacity: (extractStart.isPending || activeAccounts.length === 0) ? 0.6 : 1 }}
              onPress={handleStart}
              disabled={extractStart.isPending || activeAccounts.length === 0}
            >
              <LinearGradient
                colors={['#4C1D95', '#6D28D9', '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                {extractStart.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <MaterialIcons name="rocket-launch" size={20} color="#fff" />}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {extractStart.isPending ? 'جاري البدء...' : 'بدء الاستخراج والإضافة'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: palette.error + '20', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.error + '40' }}
              onPress={handleStop}
            >
              <MaterialIcons name="stop" size={20} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>إيقاف المهمة</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
