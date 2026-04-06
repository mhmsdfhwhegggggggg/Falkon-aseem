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
import { useAccountsStore } from '@/lib/accounts-store';
import { useMembersStore } from '@/lib/members-store';

type ExtractionMode = 'members' | 'admins' | 'subscribers' | 'contacts';
type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

const MODES = [
  { id: 'members' as const,     label: 'أعضاء المجموعة',   icon: 'group' as const,                 desc: 'جميع أعضاء المجموعة' },
  { id: 'admins' as const,      label: 'المشرفون فقط',     icon: 'admin-panel-settings' as const,  desc: 'الأدمن والمشرفون' },
  { id: 'subscribers' as const, label: 'مشتركو القناة',    icon: 'campaign' as const,               desc: 'قائمة مشتركي القناة' },
  { id: 'contacts' as const,    label: 'جهات الاتصال',      icon: 'contacts' as const,               desc: 'جهات الاتصال الخاصة بك' },
];

// Last seen presets — {label, days}
const LAST_SEEN_PRESETS = [
  { label: 'الكل', days: 0 },
  { label: 'أونلاين', days: 0, onlineOnly: true },
  { label: 'يوم', days: 1 },
  { label: '3 أيام', days: 3 },
  { label: 'أسبوع', days: 7 },
  { label: 'شهر', days: 30 },
  { label: '3 أشهر', days: 90 },
  { label: 'مخصص', days: -1 },
];

const DATA_FILTER_OPTIONS: { id: DataFilter; label: string; icon: string; desc: string }[] = [
  { id: 'all',              label: 'الكل',           icon: '👥', desc: 'جميع المستخدمين' },
  { id: 'with-username',    label: 'يوزر فقط',       icon: '@',  desc: 'من لديهم @username' },
  { id: 'without-username', label: 'ID فقط',         icon: '#',  desc: 'من لا يوجد لديهم username' },
  { id: 'with-phone',       label: 'رقم فقط',        icon: '📞', desc: 'من يشاركون رقمهم' },
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
  const [excludeBots, setExcludeBots] = useState(true);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [lastSeenPreset, setLastSeenPreset] = useState(0); // index into LAST_SEEN_PRESETS
  const [customDays, setCustomDays] = useState('');        // used when preset === -1
  const [dataFilter, setDataFilter] = useState<DataFilter>('all');

  const [jobId, setJobId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [localFileId, setLocalFileId] = useState<string | null>(null);

  const localAccounts = useAccountsStore();
  const membersStore = useMembersStore();
  const startMut = trpc.extraction.start.useMutation();
  const resultQuery = trpc.extraction.result.useQuery(
    { jobId: jobId! },
    { enabled: false }
  );

  const statusQuery = trpc.extraction.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId && isRunning, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (!statusQuery.data) return;
    const { status } = statusQuery.data;
    if (status === 'completed') {
      setIsRunning(false);
      resultQuery.refetch().then(async (res) => {
        if (res.data?.members && res.data.members.length > 0) {
          const groupName = targetGroup.replace(/^@/, '').replace(/https?:\/\/t\.me\//, '').replace(/\//g, '_').substring(0, 40);
          const name = `${groupName}_${new Date().toISOString().split('T')[0]}`;
          const phoneMembers = res.data.members.map((m: any) => ({
            id: `m_${m.userId}_${Date.now()}`,
            userId: m.userId,
            accessHash: m.accessHash || undefined,   // store for add-members InputUser
            username: m.username || '',
            firstName: m.firstName || '',
            lastName: m.lastName || '',
            phone: m.phone || '',
            isOnline: m.isOnline || false,
            lastSeen: m.lastSeen,
            status: 'pending' as const,
            source: targetGroup,
            extractedAt: new Date().toISOString(),
          }));
          const saved = await membersStore.createFile(name, phoneMembers, targetGroup);
          setLocalFileId(saved.id);
        }
      });
    } else if (status === 'failed' || status === 'cancelled') {
      setIsRunning(false);
    }
  }, [statusQuery.data?.status]);

  const activeAccounts = localAccounts.activeAccounts;

  /** Compute effective lastSeenDays from preset + optional custom */
  const getLastSeenDays = (): number => {
    const preset = LAST_SEEN_PRESETS[lastSeenPreset]!;
    if (preset.days === -1) return parseInt(customDays, 10) || 0;
    return preset.days;
  };

  const handleStart = async () => {
    if (!targetGroup.trim()) {
      return Alert.alert('الحقل فارغ', 'أدخل اسم المجموعة أو الرابط أو ID');
    }
    if (activeAccounts.length === 0) {
      return Alert.alert('لا يوجد حساب', 'أضف حساب Telegram نشط من تبويب الحسابات أولاً');
    }

    const total = parseInt(limit, 10) || 500;
    const account = activeAccounts[0]!;
    const sessionString = await localAccounts.getSession(account.id);
    const lastSeenDays = getLastSeenDays();

    try {
      setIsRunning(true);
      setLocalFileId(null);
      const result = await startMut.mutateAsync({
        group: targetGroup.trim(),
        limit: total,
        excludeBots,
        lastSeenDays,
        dataFilter,
        mode,
        accountId: account.id,
        sessionString: sessionString || undefined,
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsRunning(false);
      Alert.alert('خطأ', err.message || 'فشل بدء الاستخراج');
    }
  };

  const job = statusQuery.data;
  const progress = job?.total ? Math.round((job.progress / job.total) * 100) : 0;

  const selectedPreset = LAST_SEEN_PRESETS[lastSeenPreset]!;
  const isCustom = selectedPreset.days === -1;

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
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>استخراج الأعضاء</Text>
          </View>
          <TouchableOpacity
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20' }}
            onPress={() => router.push('/members-files' as any)}
          >
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>الملفات</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>

          {/* Account Status */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: activeAccounts.length > 0 ? palette.success + '50' : palette.error + '50', marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name={activeAccounts.length > 0 ? 'check-circle' : 'error'} size={18} color={activeAccounts.length > 0 ? palette.success : palette.error} />
            <Text style={{ color: activeAccounts.length > 0 ? palette.success : palette.error, fontSize: 13, fontWeight: '600', flex: 1 }}>
              {activeAccounts.length > 0
                ? `${activeAccounts[0]!.firstName || activeAccounts[0]!.phone} — ${activeAccounts.length} حساب نشط`
                : 'لا يوجد حساب — أضف من تبويب الحسابات'}
            </Text>
          </View>

          {/* Progress Card */}
          {jobId && job && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '60' : (job.status === 'completed' ? palette.success + '60' : palette.error + '60'), marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                  {isRunning ? 'جاري الاستخراج...' : job.status === 'completed' ? '✓ اكتمل الاستخراج' : `✗ ${job.status}`}
                </Text>
                <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '800' }}>{job.progress} / {job.total || '?'}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, marginBottom: 8 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: isRunning ? palette.primary : (job.status === 'completed' ? palette.success : palette.error), width: `${progress}%` }} />
              </View>
              {isRunning && <ActivityIndicator color={palette.primary} size="small" style={{ marginBottom: 8 }} />}
              {job.error && <Text style={{ color: palette.error, fontSize: 12 }}>{job.error}</Text>}
              {localFileId && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={() => router.push({ pathname: '/members-file', params: { id: localFileId } } as any)}
                  >
                    <MaterialIcons name="folder-open" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>عرض الملف</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: palette.success + '20', borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={() => router.push({ pathname: '/add-members', params: { fileId: localFileId } } as any)}
                  >
                    <MaterialIcons name="person-add" size={16} color={palette.success} />
                    <Text style={{ color: palette.success, fontWeight: '700', fontSize: 13 }}>إضافة الأعضاء</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Target Group */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>المصدر</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
              <MaterialIcons name="link" size={16} color={palette.muted} />
              <TextInput
                value={targetGroup}
                onChangeText={setTargetGroup}
                placeholder="@group أو t.me/link أو group ID"
                placeholderTextColor={palette.muted}
                style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                autoCapitalize="none"
                editable={!isRunning}
              />
            </View>
          </View>

          {/* Mode */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>نوع الاستخراج</Text>
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

          {/* ── LAST SEEN FILTER ─────────────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="schedule" size={18} color={palette.primary} />
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>آخر ظهور</Text>
              {getLastSeenDays() > 0 && (
                <View style={{ backgroundColor: palette.primary + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' }}>
                  <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '800' }}>
                    {getLastSeenDays() === 1 ? 'آخر 24 ساعة' : `آخر ${getLastSeenDays()} يوم`}
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 10 }}>
              استخرج فقط من ظهروا خلال المدة المحددة — من لا يُعرف وقت ظهورهم (إعدادات الخصوصية) يُستبعدون تلقائياً
            </Text>

            {/* Preset buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LAST_SEEN_PRESETS.map((p, idx) => {
                const isSelected = lastSeenPreset === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => !isRunning && setLastSeenPreset(idx)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: isSelected ? palette.primary : palette.background,
                      borderWidth: 1, borderColor: isSelected ? palette.primary : palette.border,
                      opacity: isRunning ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: isSelected ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom days input */}
            {isCustom && (
              <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, borderWidth: 1, borderColor: palette.primary + '60', paddingHorizontal: 14, gap: 8 }}>
                <TextInput
                  value={customDays}
                  onChangeText={(v) => setCustomDays(v.replace(/[^0-9]/g, ''))}
                  placeholder="أدخل عدد الأيام (مثلاً 14)"
                  placeholderTextColor={palette.muted}
                  keyboardType="numeric"
                  style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 12 }}
                  editable={!isRunning}
                />
                <Text style={{ color: palette.muted, fontSize: 12 }}>يوم</Text>
              </View>
            )}

            {/* Live summary */}
            {getLastSeenDays() > 0 && (
              <View style={{ marginTop: 10, backgroundColor: palette.primary + '10', borderRadius: 8, padding: 10 }}>
                <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '600' }}>
                  ✓ سيُستخرج من ظهروا آخر مرة خلال {getLastSeenDays()} يوم أو أقل
                </Text>
              </View>
            )}
          </View>

          {/* ── DATA TYPE FILTER ─────────────────────────────────────────────── */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="filter-list" size={18} color={palette.primary} />
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>نوع البيانات</Text>
            </View>
            <View style={{ gap: 8 }}>
              {DATA_FILTER_OPTIONS.map((opt) => {
                const isSelected = dataFilter === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => !isRunning && setDataFilter(opt.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 12, borderRadius: 12,
                      backgroundColor: isSelected ? palette.primary + '15' : 'transparent',
                      borderWidth: 1, borderColor: isSelected ? palette.primary : palette.border,
                      opacity: isRunning ? 0.5 : 1,
                    }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isSelected ? palette.primary + '25' : palette.border + '40', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{opt.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{opt.label}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{opt.desc}</Text>
                    </View>
                    {isSelected && <MaterialIcons name="check-circle" size={18} color={palette.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Settings */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, gap: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الإعدادات</Text>

            {/* Limit */}
            <View>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>حد الاستخراج</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['100', '500', '1000', '5000', '10000', 'الكل'].map((v) => {
                  const val = v === 'الكل' ? '100000' : v;
                  const isSelected = limit === val;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isSelected ? palette.primary : palette.background, borderWidth: 1, borderColor: isSelected ? palette.primary : palette.border, opacity: isRunning ? 0.5 : 1 }}
                      onPress={() => !isRunning && setLimit(val)}
                    >
                      <Text style={{ color: isSelected ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={excludeBots} onToggle={() => setExcludeBots(!excludeBots)} label="استبعاد البوتات" desc="لا تُدرج حسابات البوت في النتائج" palette={palette} />
          </View>

          {/* Active filter summary badge */}
          {(getLastSeenDays() > 0 || dataFilter !== 'all') && (
            <View style={{ backgroundColor: palette.warning + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.warning + '40', marginBottom: 14, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <MaterialIcons name="info" size={16} color={palette.warning} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.warning, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>فلاتر مفعّلة</Text>
                {getLastSeenDays() > 0 && (
                  <Text style={{ color: palette.muted, fontSize: 11 }}>• آخر ظهور: خلال {getLastSeenDays()} يوم</Text>
                )}
                {dataFilter !== 'all' && (
                  <Text style={{ color: palette.muted, fontSize: 11 }}>
                    • نوع البيانات: {DATA_FILTER_OPTIONS.find((o) => o.id === dataFilter)?.label}
                  </Text>
                )}
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                  النتائج ستكون أقل من الحد المحدد بسبب الفلترة
                </Text>
              </View>
            </View>
          )}

          {/* Action */}
          {!isRunning ? (
            <TouchableOpacity style={{ borderRadius: 14, overflow: 'hidden' }} onPress={handleStart} disabled={startMut.isPending}>
              <LinearGradient colors={['#6D28D9', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {startMut.isPending ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="download" size={20} color="#fff" />}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {startMut.isPending ? 'جاري البدء...' : 'بدء الاستخراج'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: palette.primary + '10', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: palette.primary + '40' }}>
              <ActivityIndicator color={palette.primary} />
              <Text style={{ color: palette.primary, fontSize: 15, fontWeight: '800' }}>جاري الاستخراج... ({progress}%)</Text>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
