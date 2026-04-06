import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';

export default function ContentClonerScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { activeAccounts, getSession } = useAccountsStore();

  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [cloneMedia, setCloneMedia] = useState(true);
  const [clonePolls, setClonePolls] = useState(false);
  const [skipForwards, setSkipForwards] = useState(true);
  const [reverseOrder, setReverseOrder] = useState(true);
  const [delay, setDelay] = useState('5');
  const [limit, setLimit] = useState('100');
  const [selectedAccId, setSelectedAccId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const startMutation = trpc.contentCloner.start.useMutation();
  const statusQuery = trpc.contentCloner.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId, refetchInterval: jobId ? 3000 : false }
  );

  useEffect(() => {
    if (activeAccounts.length > 0 && !selectedAccId) {
      setSelectedAccId(activeAccounts[0]!.id);
    }
  }, [activeAccounts]);

  const handleStart = async () => {
    if (!source.trim() || !dest.trim()) {
      Alert.alert('بيانات مفقودة', 'أدخل المصدر والوجهة');
      return;
    }
    if (activeAccounts.length === 0) {
      Alert.alert('لا يوجد حساب', 'أضف حساباً تيليغرام أولاً');
      return;
    }

    const accId = selectedAccId || activeAccounts[0]?.id || '';
    if (!accId) return;

    setIsLaunching(true);
    try {
      const sessionString = await getSession(accId);

      const result = await startMutation.mutateAsync({
        sourceGroup: source.trim(),
        destGroup: dest.trim(),
        cloneMedia,
        clonePolls,
        skipForwards,
        reverseOrder,
        delaySeconds: parseFloat(delay) || 5,
        limit: parseInt(limit) || 100,
        accountId: accId,
        sessionString: sessionString || undefined,
        priority: 'normal',
      });

      setJobId(result.jobId);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل في بدء عملية النسخ');
    } finally {
      setIsLaunching(false);
    }
  };

  const status = statusQuery.data;
  const isRunning = status?.status === 'running' || status?.status === 'queued';
  const isDone = status?.status === 'completed' || status?.status === 'failed' || status?.status === 'cancelled';

  const progressPct = status && status.total > 0
    ? Math.round((status.progress / status.total) * 100)
    : 0;

  const Toggle = ({ value, onToggle, label, description }: {
    value: boolean; onToggle: () => void; label: string; description?: string;
  }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {description && <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{description}</Text>}
      </View>
      <TouchableOpacity
        style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: value ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 3 }}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2 }} />
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
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>أتمتة</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>ناسخ المحتوى</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 14 }}>

          {/* Job Status */}
          {jobId && status && (
            <View style={{ backgroundColor: isRunning ? palette.primary + '15' : (status.status === 'completed' ? '#34D39920' : '#F8717120'), borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isRunning ? palette.primary + '40' : (status.status === 'completed' ? '#34D39940' : '#F8717140'), gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isRunning && <ActivityIndicator size="small" color={palette.primary} />}
                {isDone && status.status === 'completed' && <MaterialIcons name="check-circle" size={18} color="#34D399" />}
                {isDone && status.status !== 'completed' && <MaterialIcons name="error" size={18} color="#F87171" />}
                <Text style={{ color: palette.foreground, fontWeight: '700', fontSize: 14 }}>
                  {isRunning ? 'جارٍ النسخ...' : status.status === 'completed' ? 'اكتمل النسخ' : 'فشل'}
                </Text>
              </View>

              {isRunning && status.total > 0 && (
                <View>
                  <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 6, width: `${progressPct}%`, backgroundColor: palette.primary, borderRadius: 3 }} />
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                    {status.progress} / {status.total} رسالة ({progressPct}%)
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 20 }}>
                <View>
                  <Text style={{ color: '#34D399', fontSize: 18, fontWeight: '800' }}>{status.forwarded}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>نُسخ</Text>
                </View>
                <View>
                  <Text style={{ color: '#F87171', fontSize: 18, fontWeight: '800' }}>{status.failed}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>فشل</Text>
                </View>
                <View>
                  <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '800' }}>{status.total}</Text>
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
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>نسخ جديد</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!jobId && (
            <>
              {/* Account Selector */}
              {activeAccounts.length > 1 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>الحساب</Text>
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
                </View>
              )}

              {/* Source & Destination */}
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>المصدر والوجهة</Text>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>مصدر الرسائل</Text>
                  <TextInput
                    value={source}
                    onChangeText={setSource}
                    placeholder="@channel أو t.me/channel"
                    placeholderTextColor={palette.muted}
                    style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={{ alignItems: 'center' }}>
                  <MaterialIcons name="arrow-downward" size={20} color={palette.primary} />
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>وجهة الرسائل</Text>
                  <TextInput
                    value={dest}
                    onChangeText={setDest}
                    placeholder="@channel أو t.me/channel"
                    placeholderTextColor={palette.muted}
                    style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Options */}
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 16 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>خيارات النسخ</Text>
                <Toggle value={cloneMedia} onToggle={() => setCloneMedia(!cloneMedia)} label="نسخ الوسائط" description="صور، فيديوهات، مستندات" />
                <View style={{ height: 1, backgroundColor: palette.border }} />
                <Toggle value={clonePolls} onToggle={() => setClonePolls(!clonePolls)} label="نسخ الاستطلاعات" description="استطلاعات الرأي والاختبارات" />
                <View style={{ height: 1, backgroundColor: palette.border }} />
                <Toggle value={skipForwards} onToggle={() => setSkipForwards(!skipForwards)} label="تجاهل المُعاد توجيهها" description="تخطى الرسائل المُوجَّهة مسبقاً" />
                <View style={{ height: 1, backgroundColor: palette.border }} />
                <Toggle value={reverseOrder} onToggle={() => setReverseOrder(!reverseOrder)} label="ترتيب زمني" description="إرسال الأقدم أولاً" />
              </View>

              {/* Advanced */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <MaterialIcons name={showAdvanced ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '600' }}>إعدادات متقدمة</Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>التأخير (ثانية)</Text>
                      <TextInput
                        value={delay}
                        onChangeText={setDelay}
                        placeholder="5"
                        keyboardType="numeric"
                        placeholderTextColor={palette.muted}
                        style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>عدد الرسائل</Text>
                      <TextInput
                        value={limit}
                        onChangeText={setLimit}
                        placeholder="100"
                        keyboardType="numeric"
                        placeholderTextColor={palette.muted}
                        style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
                      />
                    </View>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>تأخير 3–10 ثوانٍ موصى به لتجنب FloodWait</Text>
                </View>
              )}

              <TouchableOpacity
                style={{ backgroundColor: isLaunching ? palette.muted : palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={handleStart}
                disabled={isLaunching}
              >
                {isLaunching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="content-copy" size={20} color="#fff" />
                )}
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {isLaunching ? 'جارٍ التشغيل...' : 'بدء النسخ'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
