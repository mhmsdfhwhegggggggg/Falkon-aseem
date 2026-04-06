import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useWindowManager, type AppWindow, type WindowConfig, type WindowTaskType } from '@/lib/window-manager';
import { useAccountsStore } from '@/lib/accounts-store';

const { width } = Dimensions.get('window');

const GOLD = '#F59E0B';
const GOLD_DARK = '#D97706';
const PURPLE = '#8B5CF6';
const BG = '#030712';
const SURFACE = '#0D1117';
const SURFACE2 = '#111827';
const BORDER = '#1a2235';
const GREEN = '#34D399';
const RED = '#F87171';
const YELLOW = '#FBBF24';

// ─── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsed(startDate: Date, running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const base = Math.floor((Date.now() - startDate.getTime()) / 1000);
    setElapsed(base);
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [running, startDate]);
  const s = Math.floor((Date.now() - startDate.getTime()) / 1000) + elapsed;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── Animated Progress Bar ────────────────────────────────────────────────────

function AnimatedProgressBar({ progress, status }: { progress: number; status: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: progress / 100, duration: 600, useNativeDriver: false }).start();
  }, [progress]);

  useEffect(() => {
    if (status !== 'running') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status]);

  const barColor = status === 'error' ? RED : status === 'completed' ? GREEN : status === 'paused' ? YELLOW : PURPLE;
  const widthPct = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ height: 6, backgroundColor: '#1a2235', borderRadius: 3, overflow: 'hidden', marginVertical: 10 }}>
      <Animated.View style={{ height: '100%', width: widthPct, borderRadius: 3, backgroundColor: barColor }} />
      {status === 'running' && progress > 5 && (
        <Animated.View style={{
          position: 'absolute', top: 0, bottom: 0, width: 40, borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,0.25)',
          left: shimmer.interpolate({ inputRange: [0, 1], outputRange: ['-15%' as any, '110%' as any] }),
        }} />
      )}
    </View>
  );
}

// ─── Log Line ─────────────────────────────────────────────────────────────────

function LogLine({ log }: { log: AppWindow['logs'][0] }) {
  const color = log.type === 'success' ? GREEN : log.type === 'error' ? RED : log.type === 'warning' ? YELLOW : '#6B7280';
  const icon = log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : log.type === 'warning' ? '!' : '›';
  const time = log.time.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '800', minWidth: 12 }}>{icon}</Text>
      <Text style={{ color: '#4B5563', fontSize: 10 }}>{time}</Text>
      <Text style={{ color: color === '#6B7280' ? '#9CA3AF' : color, fontSize: 11, flex: 1 }} numberOfLines={1}>{log.message}</Text>
    </View>
  );
}

// ─── Window Card ──────────────────────────────────────────────────────────────

function WindowCard({ win }: { win: AppWindow }) {
  const { startWindow, pauseWindow, resumeWindow, closeWindow } = useWindowManager();
  const elapsed = useElapsed(win.createdAt, win.status === 'running');
  const [expanded, setExpanded] = useState(false);

  const statusCfg = {
    configuring: { color: '#6B7280', label: 'جاهز', dot: '#6B7280' },
    running:     { color: GREEN,     label: 'يعمل', dot: GREEN },
    paused:      { color: YELLOW,    label: 'موقوف', dot: YELLOW },
    completed:   { color: '#60A5FA', label: 'اكتمل', dot: '#60A5FA' },
    error:       { color: RED,       label: 'خطأ',   dot: RED },
    cancelled:   { color: '#4B5563', label: 'ملغى',  dot: '#4B5563' },
  }[win.status] ?? { color: '#6B7280', label: '...', dot: '#6B7280' };

  const typeIcon: Record<string, any> = {
    extraction: 'download', 'add-members': 'person-add', 'extract-and-add': 'swap-horiz',
    'bulk-message': 'chat', 'content-clone': 'content-copy', 'auto-reply': 'reply', 'scheduler': 'schedule',
  };
  const typeColor: Record<string, string> = {
    extraction: PURPLE, 'add-members': GREEN, 'extract-and-add': GOLD,
    'bulk-message': '#60A5FA', 'content-clone': '#EC4899', 'auto-reply': '#34D399', 'scheduler': '#FBBF24',
  };

  const tcolor = typeColor[win.taskType];

  const handleClose = () => {
    Alert.alert('إغلاق النافذة', 'هل تريد إغلاق هذه النافذة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إغلاق', style: 'destructive', onPress: () => closeWindow(win.id) },
    ]);
  };

  const recentLogs = win.logs.slice(-4).reverse();

  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: win.status === 'running' ? tcolor + '40' : BORDER, marginBottom: 14, overflow: 'hidden' }}>
      {/* Title bar */}
      <LinearGradient colors={['#0f1623', '#131d2e']} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 10 }}>
        {/* Traffic lights */}
        <TouchableOpacity onPress={handleClose}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: RED }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => win.status === 'running' ? pauseWindow(win.id) : win.status === 'paused' ? resumeWindow(win.id) : undefined}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: YELLOW }} />
        </TouchableOpacity>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: win.status === 'completed' ? GREEN : '#2d3748' }} />

        {/* Title */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: tcolor + '20', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name={typeIcon[win.taskType] as any} size={13} color={tcolor} />
          </View>
          <Text style={{ color: '#E5E7EB', fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>{win.title}</Text>
        </View>

        {/* Status */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: statusCfg.color + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusCfg.dot }} />
          <Text style={{ color: statusCfg.color, fontSize: 10, fontWeight: '800' }}>{statusCfg.label}</Text>
        </View>
      </LinearGradient>

      {/* Body */}
      <View style={{ padding: 14 }}>
        {/* Error */}
        {win.error && (
          <View style={{ backgroundColor: RED + '15', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: RED + '30' }}>
            <Text style={{ color: RED, fontSize: 11 }}>{win.error}</Text>
          </View>
        )}

        {/* Stats row */}
        <View style={{ flexDirection: 'row', backgroundColor: '#ffffff06', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
          {win.taskType === 'extraction' || win.taskType === 'extract-and-add' ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderColor: '#ffffff08' }}>
              <Text style={{ color: PURPLE, fontSize: 16, fontWeight: '900' }}>{win.stats.extracted}</Text>
              <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 1, fontWeight: '600' }}>مُستخرج</Text>
            </View>
          ) : null}
          {win.taskType === 'add-members' || win.taskType === 'extract-and-add' ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderColor: '#ffffff08' }}>
              <Text style={{ color: GREEN, fontSize: 16, fontWeight: '900' }}>{win.stats.added}</Text>
              <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 1, fontWeight: '600' }}>مُضاف</Text>
            </View>
          ) : null}
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderColor: '#ffffff08' }}>
            <Text style={{ color: RED, fontSize: 16, fontWeight: '900' }}>{win.stats.failed}</Text>
            <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 1, fontWeight: '600' }}>فاشل</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 16, fontWeight: '900' }}>{win.stats.total || win.total || 0}</Text>
            <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 1, fontWeight: '600' }}>إجمالي</Text>
          </View>
        </View>

        {/* Progress */}
        <AnimatedProgressBar progress={win.progress} status={win.status} />

        {/* Progress label */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: '#6B7280', fontSize: 11 }}>{win.progress}% مكتمل</Text>
          <Text style={{ color: '#6B7280', fontSize: 11 }}>⏱ {elapsed}</Text>
        </View>

        {/* Logs */}
        <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
          <View style={{ backgroundColor: '#ffffff05', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ffffff08', minHeight: 64 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: '#374151', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>سجل النشاط</Text>
              <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={14} color="#374151" />
            </View>
            {recentLogs.slice(0, expanded ? 8 : 3).map((log) => (
              <LogLine key={log.id} log={log} />
            ))}
            {recentLogs.length === 0 && (
              <Text style={{ color: '#374151', fontSize: 11 }}>لا يوجد نشاط بعد...</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {win.status === 'configuring' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: tcolor, borderRadius: 10, paddingVertical: 10 }}
              onPress={() => startWindow(win.id)}
            >
              <MaterialIcons name="play-arrow" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>تشغيل</Text>
            </TouchableOpacity>
          )}
          {win.status === 'running' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: YELLOW + '20', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: YELLOW + '40' }}
              onPress={() => pauseWindow(win.id)}
            >
              <MaterialIcons name="pause" size={16} color={YELLOW} />
              <Text style={{ color: YELLOW, fontSize: 12, fontWeight: '700' }}>إيقاف مؤقت</Text>
            </TouchableOpacity>
          )}
          {win.status === 'paused' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN + '20', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: GREEN + '40' }}
              onPress={() => resumeWindow(win.id)}
            >
              <MaterialIcons name="play-arrow" size={16} color={GREEN} />
              <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>استمرار</Text>
            </TouchableOpacity>
          )}
          {(win.status === 'completed' || win.status === 'error' || win.status === 'cancelled') && (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ffffff08', borderRadius: 10, paddingVertical: 10 }}>
              <MaterialIcons name={win.status === 'completed' ? 'check-circle' : 'error'} size={16} color={win.status === 'completed' ? GREEN : RED} />
              <Text style={{ color: win.status === 'completed' ? GREEN : RED, fontSize: 12, fontWeight: '700' }}>
                {win.status === 'completed' ? 'اكتملت' : win.status === 'error' ? 'فشلت' : 'ملغاة'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={{ width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: RED + '15', borderRadius: 10, borderWidth: 1, borderColor: RED + '30' }}
            onPress={handleClose}
          >
            <MaterialIcons name="close" size={16} color={RED} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── New Window Sheet ─────────────────────────────────────────────────────────

const TASK_TYPES: { type: WindowTaskType; label: string; subtitle: string; icon: any; color: string }[] = [
  { type: 'extraction',      label: 'استخراج أعضاء', subtitle: 'اسحب أعضاء من أي مجموعة', icon: 'download',    color: PURPLE },
  { type: 'add-members',     label: 'إضافة أعضاء',   subtitle: 'أضف أعضاء لمجموعتك',       icon: 'person-add',  color: GREEN },
  { type: 'extract-and-add', label: 'استخراج + إضافة', subtitle: 'استخراج وإضافة فوري',    icon: 'swap-horiz',  color: GOLD },
];

function NewWindowSheet({ visible, onClose, onCreate }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (config: WindowConfig, title: string) => void;
}) {
  const { accounts } = useAccountsStore();
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [taskType, setTaskType] = useState<WindowTaskType>('extraction');
  const [accountId, setAccountId] = useState('');
  const [sourceGroup, setSourceGroup] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('500');
  const [delay, setDelay] = useState('30');
  const [maxPerDay, setMaxPerDay] = useState('40');
  const [warmup, setWarmup] = useState(false);

  const selectedType = TASK_TYPES.find((t) => t.type === taskType)!;

  const reset = () => {
    setStep('type');
    setSourceGroup('');
    setTargetGroup('');
    setLimit('500');
    setDelay('30');
    setMaxPerDay('40');
    setWarmup(false);
  };

  const handleCreate = () => {
    if (!accountId) { Alert.alert('خطأ', 'اختر حساباً أولاً'); return; }
    if (taskType === 'extraction' && !sourceGroup.trim()) { Alert.alert('خطأ', 'أدخل المجموعة المصدر'); return; }
    if (taskType === 'add-members' && !targetGroup.trim()) { Alert.alert('خطأ', 'أدخل المجموعة الهدف'); return; }
    if (taskType === 'extract-and-add' && (!sourceGroup.trim() || !targetGroup.trim())) {
      Alert.alert('خطأ', 'أدخل المجموعة المصدر والهدف'); return;
    }

    const config: WindowConfig = {
      taskType,
      accountId,
      sourceGroup: sourceGroup.trim() || undefined,
      targetGroup: targetGroup.trim() || undefined,
      limit: parseInt(limit) || 500,
      delaySeconds: parseInt(delay) || 30,
      maxPerDay: parseInt(maxPerDay) || 40,
      warmup,
    };
    onCreate(config, selectedType.label);
    reset();
    onClose();
  };

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0]!.id);
  }, [accounts]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
        <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: BORDER }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151' }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
            <View>
              <Text style={{ color: '#E5E7EB', fontSize: 18, fontWeight: '900' }}>نافذة جديدة</Text>
              <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                {step === 'type' ? 'اختر نوع المهمة' : `إعداد: ${selectedType.label}`}
              </Text>
            </View>
            {step === 'config' && (
              <TouchableOpacity onPress={() => setStep('type')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="arrow-back" size={16} color={GOLD} />
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>تغيير النوع</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {step === 'type' ? (
              /* ── Step 1: Type selection ── */
              <View style={{ gap: 12, paddingTop: 4 }}>
                {TASK_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.type}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      backgroundColor: taskType === t.type ? t.color + '15' : '#ffffff06',
                      borderRadius: 16, padding: 16,
                      borderWidth: 2, borderColor: taskType === t.type ? t.color + '60' : '#ffffff0a',
                    }}
                    onPress={() => { setTaskType(t.type); setStep('config'); }}
                  >
                    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: t.color + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.color + '40' }}>
                      <MaterialIcons name={t.icon} size={26} color={t.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#F3F4F6', fontSize: 15, fontWeight: '800' }}>{t.label}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{t.subtitle}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#4B5563" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              /* ── Step 2: Config form ── */
              <View style={{ gap: 16, paddingTop: 4 }}>
                {/* Account */}
                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>الحساب</Text>
                  {accounts.length === 0 ? (
                    <View style={{ backgroundColor: RED + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: RED + '30' }}>
                      <Text style={{ color: RED, fontSize: 12, textAlign: 'center' }}>لا توجد حسابات — أضف حساباً من تبويب الحسابات أولاً</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {accounts.map((acc) => (
                          <TouchableOpacity
                            key={acc.id}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                              backgroundColor: accountId === acc.id ? PURPLE + '20' : '#ffffff08',
                              borderWidth: 2, borderColor: accountId === acc.id ? PURPLE + '60' : '#ffffff10',
                            }}
                            onPress={() => setAccountId(acc.id)}
                          >
                            <Text style={{ color: accountId === acc.id ? PURPLE : '#9CA3AF', fontSize: 13, fontWeight: '700' }}>
                              {acc.firstName || acc.phone}
                            </Text>
                            <Text style={{ color: '#4B5563', fontSize: 10, marginTop: 2 }}>{acc.phone}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>

                {/* Source group (extraction / extract-and-add) */}
                {(taskType === 'extraction' || taskType === 'extract-and-add') && (
                  <View>
                    <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>المجموعة المصدر</Text>
                    <TextInput
                      style={{ backgroundColor: SURFACE2, borderRadius: 12, padding: 14, color: '#E5E7EB', fontSize: 14, borderWidth: 1, borderColor: BORDER }}
                      placeholder="https://t.me/groupname أو @username"
                      placeholderTextColor="#374151"
                      value={sourceGroup}
                      onChangeText={setSourceGroup}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                {/* Target group (add-members / extract-and-add) */}
                {(taskType === 'add-members' || taskType === 'extract-and-add') && (
                  <View>
                    <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>المجموعة الهدف</Text>
                    <TextInput
                      style={{ backgroundColor: SURFACE2, borderRadius: 12, padding: 14, color: '#E5E7EB', fontSize: 14, borderWidth: 1, borderColor: BORDER }}
                      placeholder="@target_group"
                      placeholderTextColor="#374151"
                      value={targetGroup}
                      onChangeText={setTargetGroup}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                {/* Limit (extraction) */}
                {(taskType === 'extraction' || taskType === 'extract-and-add') && (
                  <View>
                    <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>عدد الأعضاء المستهدف</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['100', '500', '1000', '5000'].map((v) => (
                        <TouchableOpacity
                          key={v}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: limit === v ? PURPLE + '20' : '#ffffff08', borderWidth: 1, borderColor: limit === v ? PURPLE + '50' : '#ffffff10' }}
                          onPress={() => setLimit(v)}
                        >
                          <Text style={{ color: limit === v ? PURPLE : '#6B7280', fontSize: 13, fontWeight: '700' }}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Delay + MaxPerDay (add-members) */}
                {(taskType === 'add-members' || taskType === 'extract-and-add') && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>التأخير (ثانية)</Text>
                      <TextInput
                        style={{ backgroundColor: SURFACE2, borderRadius: 12, padding: 12, color: '#E5E7EB', fontSize: 14, borderWidth: 1, borderColor: BORDER, textAlign: 'center' }}
                        value={delay}
                        onChangeText={setDelay}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>الحد اليومي</Text>
                      <TextInput
                        style={{ backgroundColor: SURFACE2, borderRadius: 12, padding: 12, color: '#E5E7EB', fontSize: 14, borderWidth: 1, borderColor: BORDER, textAlign: 'center' }}
                        value={maxPerDay}
                        onChangeText={setMaxPerDay}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                )}

                {/* Warmup toggle */}
                {(taskType === 'add-members' || taskType === 'extract-and-add') && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: warmup ? GOLD + '15' : '#ffffff06', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: warmup ? GOLD + '40' : '#ffffff10' }}
                    onPress={() => setWarmup(!warmup)}
                  >
                    <View>
                      <Text style={{ color: '#E5E7EB', fontSize: 13, fontWeight: '700' }}>وضع الإحماء</Text>
                      <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>للحسابات الجديدة — يبدأ ببطء ثم يزداد</Text>
                    </View>
                    <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: warmup ? GOLD : '#374151', alignItems: warmup ? 'flex-end' : 'flex-start', justifyContent: 'center', padding: 2 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Create button */}
                <TouchableOpacity
                  style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}
                  onPress={handleCreate}
                >
                  <LinearGradient
                    colors={[selectedType.color, selectedType.color + 'CC']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 }}
                  >
                    <MaterialIcons name="add-circle" size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>إنشاء النافذة</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WindowsScreen() {
  const { windows, activeCount, createWindow } = useWindowManager();
  const [showSheet, setShowSheet] = useState(false);

  const running = windows.filter((w) => w.status === 'running').length;
  const paused = windows.filter((w) => w.status === 'paused' || w.status === 'configuring').length;
  const done = windows.filter((w) => w.status === 'completed').length;
  const errors = windows.filter((w) => w.status === 'error').length;

  const STATS = [
    { label: 'نشطة', value: running, color: GREEN },
    { label: 'موقوفة', value: paused, color: YELLOW },
    { label: 'منجزة', value: done, color: '#60A5FA' },
    { label: 'أخطاء', value: errors, color: RED },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER }}>
              <MaterialIcons name="arrow-back" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <View>
              <Text style={{ color: '#4B5563', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>متوازي</Text>
              <Text style={{ color: '#F3F4F6', fontSize: 20, fontWeight: '900', marginTop: 1 }}>النوافذ المتعددة</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ borderRadius: 12, overflow: 'hidden' }}
            onPress={() => setShowSheet(true)}
          >
            <LinearGradient
              colors={[GOLD, GOLD_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <MaterialIcons name="add" size={16} color="#000" />
              <Text style={{ color: '#000', fontSize: 13, fontWeight: '900' }}>نافذة جديدة</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 8, marginBottom: 16 }}>
          {STATS.map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: s.value > 0 ? s.color + '30' : BORDER }}>
              <Text style={{ color: s.value > 0 ? s.color : '#374151', fontSize: 20, fontWeight: '900' }}>{s.value}</Text>
              <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 2, fontWeight: '700' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Active indicator */}
        {running > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN + '10', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: GREEN + '25' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
            <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>{running} مهمة تعمل الآن في الخلفية</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}>
          {windows.length === 0 ? (
            /* Empty state */
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 16 }}>
              <LinearGradient
                colors={['#1a1200', '#1f1500']}
                style={{ width: 100, height: 100, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: GOLD + '40' }}
              >
                <MaterialIcons name="tab" size={50} color={GOLD} />
              </LinearGradient>
              <Text style={{ color: '#E5E7EB', fontSize: 20, fontWeight: '900' }}>لا توجد نوافذ مفتوحة</Text>
              <Text style={{ color: '#4B5563', fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>
                شغّل مهام متعددة في نفس الوقت — استخراج وإضافة معاً بشكل متوازٍ
              </Text>
              <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
                {TASK_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.type}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.color + '10', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: t.color + '30' }}
                    onPress={() => setShowSheet(true)}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={t.icon} size={22} color={t.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#E5E7EB', fontSize: 14, fontWeight: '800' }}>{t.label}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{t.subtitle}</Text>
                    </View>
                    <MaterialIcons name="add-circle-outline" size={20} color={t.color} />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden' }}
                onPress={() => setShowSheet(true)}
              >
                <LinearGradient colors={[GOLD, GOLD_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 36, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="add" size={20} color="#000" />
                  <Text style={{ color: '#000', fontWeight: '900', fontSize: 15 }}>افتح أول نافذة</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            windows.map((win) => <WindowCard key={win.id} win={win} />)
          )}
        </ScrollView>
      </SafeAreaView>

      <NewWindowSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        onCreate={(config, title) => createWindow(config, title)}
      />
    </View>
  );
}

