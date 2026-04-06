import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';

const MODES = [
  { id: 'dm' as const,      label: 'رسائل مباشرة',    icon: 'chat' as const,     description: 'DM لكل مستخدم على حدة' },
  { id: 'group' as const,   label: 'نشر في مجموعات',   icon: 'group' as const,    description: 'نشر نفس الرسالة في مجموعات متعددة' },
  { id: 'channel' as const, label: 'بث في قنوات',      icon: 'campaign' as const, description: 'إرسال بث للقنوات المستهدفة' },
];

const PARSE_MODES = [
  { id: 'none' as const,     label: 'عادي' },
  { id: 'html' as const,     label: 'HTML' },
  { id: 'markdown' as const, label: 'Markdown' },
];

export default function BulkOpsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { activeAccounts, getSession } = useAccountsStore();

  const [mode, setMode] = useState<'dm' | 'group' | 'channel'>('dm');
  const [message, setMessage] = useState('');
  const [targets, setTargets] = useState('');
  const [delay, setDelay] = useState('45');
  const [parseMode, setParseMode] = useState<'none' | 'html' | 'markdown'>('none');
  const [selectedAccId, setSelectedAccId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMutation = trpc.bulkMessage.start.useMutation();
  const statusQuery = trpc.bulkMessage.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId, refetchInterval: jobId ? 3000 : false }
  );

  // Select first active account by default
  useEffect(() => {
    if (activeAccounts.length > 0 && !selectedAccId) {
      setSelectedAccId(activeAccounts[0]!.id);
    }
  }, [activeAccounts]);

  const handleStart = async () => {
    const targetList = targets.split('\n').map(t => t.trim()).filter(Boolean);
    if (!message.trim()) {
      Alert.alert('نص مفقود', 'اكتب الرسالة أولاً');
      return;
    }
    if (targetList.length === 0) {
      Alert.alert('أهداف مفقودة', 'أدخل الأهداف (مستخدم واحد في كل سطر)');
      return;
    }
    if (!selectedAccId && activeAccounts.length === 0) {
      Alert.alert('لا يوجد حساب', 'أضف حساباً تيليغرام أولاً من الإعدادات');
      return;
    }

    const accId = selectedAccId || activeAccounts[0]?.id || '';
    if (!accId) return;

    setIsLaunching(true);
    try {
      const sessionString = await getSession(accId);

      const allAccountsWithSessions = await Promise.all(
        activeAccounts.map(async (acc) => ({
          id: acc.id,
          sessionString: (await getSession(acc.id)) || undefined,
        }))
      );

      const result = await startMutation.mutateAsync({
        mode,
        message: message.trim(),
        targets: targetList,
        delaySeconds: parseInt(delay) || 45,
        maxPerDay: 100,
        parseMode,
        accountId: accId,
        sessionString: sessionString || undefined,
        allAccounts: allAccountsWithSessions.filter(a => a.sessionString),
        priority: 'normal',
      });

      setJobId(result.jobId);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في بدء العملية');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStop = () => {
    setJobId(null);
  };

  const status = statusQuery.data;
  const isRunning = status?.status === 'running' || status?.status === 'queued';
  const isDone = status?.status === 'completed' || status?.status === 'failed' || status?.status === 'cancelled';

  const progressPct = status && status.total > 0
    ? Math.round((status.progress / status.total) * 100)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>أتمتة</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>العمليات الجماعية</Text>
          </View>
          {activeAccounts.length > 0 && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.primary + '20', borderWidth: 1, borderColor: palette.primary + '40' }}>
              <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '700' }}>{activeAccounts.length} حساب</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 16 }}>

          {/* Job Status Card */}
          {jobId && status && (
            <View style={{ backgroundColor: isRunning ? palette.primary + '15' : (isDone && status.status === 'completed' ? '#34D39920' : '#F8717120'), borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '40' : (isDone && status.status === 'completed' ? '#34D39940' : '#F8717140'), gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {isRunning && <ActivityIndicator size="small" color={palette.primary} />}
                  {isDone && status.status === 'completed' && <MaterialIcons name="check-circle" size={18} color="#34D399" />}
                  {isDone && status.status !== 'completed' && <MaterialIcons name="error" size={18} color="#F87171" />}
                  <Text style={{ color: palette.foreground, fontWeight: '700', fontSize: 14 }}>
                    {isRunning ? 'جارٍ الإرسال...' : status.status === 'completed' ? 'اكتمل' : 'فشل'}
                  </Text>
                </View>
                {isRunning && (
                  <TouchableOpacity
                    style={{ backgroundColor: '#F87171' + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                    onPress={handleStop}
                  >
                    <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>إيقاف</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Progress Bar */}
              {isRunning && status.total > 0 && (
                <View>
                  <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 6, width: `${progressPct}%`, backgroundColor: palette.primary, borderRadius: 3 }} />
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                    {status.progress} / {status.total} ({progressPct}%)
                  </Text>
                </View>
              )}

              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View>
                  <Text style={{ color: '#34D399', fontSize: 16, fontWeight: '800' }}>{status.sent}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>أُرسل</Text>
                </View>
                <View>
                  <Text style={{ color: '#F87171', fontSize: 16, fontWeight: '800' }}>{status.failed}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>فشل</Text>
                </View>
                <View>
                  <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '800' }}>{status.total}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>الإجمالي</Text>
                </View>
              </View>

              {status.error && (
                <Text style={{ color: palette.muted, fontSize: 11, fontStyle: 'italic' }} numberOfLines={3}>{status.error}</Text>
              )}

              {isDone && (
                <TouchableOpacity
                  style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center' }}
                  onPress={() => setJobId(null)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>عملية جديدة</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Mode Selector */}
          {!jobId && (
            <>
              <View style={{ gap: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>نوع العملية</Text>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={{ backgroundColor: mode === m.id ? palette.primary + '15' : palette.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: mode === m.id ? palette.primary : palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    onPress={() => setMode(m.id)}
                  >
                    <MaterialIcons name={m.icon} size={20} color={mode === m.id ? palette.primary : palette.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{m.description}</Text>
                    </View>
                    {mode === m.id && <MaterialIcons name="check-circle" size={18} color={palette.primary} />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Account Selector */}
              {activeAccounts.length > 1 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الحساب المُرسِل</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {activeAccounts.map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedAccId === acc.id ? palette.primary : palette.surface, borderWidth: 1, borderColor: selectedAccId === acc.id ? palette.primary : palette.border }}
                        onPress={() => setSelectedAccId(acc.id)}
                      >
                        <Text style={{ color: selectedAccId === acc.id ? '#fff' : palette.muted, fontSize: 12, fontWeight: '600' }}>
                          {acc.firstName || acc.phone}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>جميع الحسابات النشطة ({activeAccounts.length}) ستُستخدم للتدوير تلقائياً</Text>
                </View>
              )}

              {/* Message */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الرسالة</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {PARSE_MODES.map((pm) => (
                      <TouchableOpacity
                        key={pm.id}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: parseMode === pm.id ? palette.primary : palette.surface, borderWidth: 1, borderColor: parseMode === pm.id ? palette.primary : palette.border }}
                        onPress={() => setParseMode(pm.id)}
                      >
                        <Text style={{ color: parseMode === pm.id ? '#fff' : palette.muted, fontSize: 10, fontWeight: '700' }}>{pm.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="اكتب رسالتك هنا..."
                  placeholderTextColor={palette.muted}
                  multiline
                  numberOfLines={5}
                  style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, textAlignVertical: 'top', minHeight: 120, writingDirection: 'auto' }}
                />
                {/* Personalization variable chips */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {['{اسم}', '{username}', '{رقم}'].map((tag) => (
                    <TouchableOpacity key={tag} onPress={() => setMessage((m) => m + tag)}
                      style={{ backgroundColor: '#1a2235', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B55' }}>
                      <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={{ color: palette.muted, fontSize: 11, alignSelf: 'center' }}>← متغيرات مخصصة</Text>
                </View>
                <Text style={{ color: palette.muted, fontSize: 11 }}>{message.length} حرف</Text>
              </View>

              {/* Targets */}
              <View style={{ gap: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الأهداف (هدف واحد في كل سطر)</Text>
                <TextInput
                  value={targets}
                  onChangeText={setTargets}
                  placeholder="@user1&#10;@user2&#10;@group1"
                  placeholderTextColor={palette.muted}
                  multiline
                  numberOfLines={4}
                  style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, textAlignVertical: 'top', minHeight: 100 }}
                />
                {targets.trim() && (
                  <Text style={{ color: palette.muted, fontSize: 11 }}>
                    {targets.split('\n').filter(t => t.trim()).length} هدف
                  </Text>
                )}
              </View>

              {/* Advanced Settings */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <MaterialIcons name={showAdvanced ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '600' }}>إعدادات متقدمة</Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>التأخير بين الرسائل (ثانية)</Text>
                    <TextInput
                      value={delay}
                      onChangeText={setDelay}
                      placeholder="45"
                      keyboardType="numeric"
                      placeholderTextColor={palette.muted}
                      style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
                    />
                    <Text style={{ color: palette.muted, fontSize: 11 }}>الموصى به: 45–120 ثانية للـDM، 10–30 ثانية للمجموعات</Text>
                  </View>
                </View>
              )}

              {/* Anti-Ban Notice */}
              <View style={{ backgroundColor: '#FBBF2415', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FBBF2430', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <MaterialIcons name="shield" size={16} color="#FBBF24" />
                <Text style={{ color: palette.muted, fontSize: 11, flex: 1, lineHeight: 16 }}>
                  الحماية من الحظر نشطة: تأخيرات عشوائية، تدوير الحسابات عند FloodWait، معالجة PeerFlood تلقائياً.
                  كلما زاد عدد الحسابات النشطة، زادت سرعة الإرسال وانخفض خطر الحظر.
                </Text>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: isLaunching ? palette.muted : palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={handleStart}
                disabled={isLaunching}
              >
                {isLaunching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="send" size={20} color="#fff" />
                )}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {isLaunching ? 'جارٍ التشغيل...' : 'بدء العملية الجماعية'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
