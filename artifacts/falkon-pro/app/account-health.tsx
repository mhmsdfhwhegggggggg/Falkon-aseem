import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';
import { router, useLocalSearchParams } from 'expo-router';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return `${hrs}س ${m}د`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ScoreBar({ score, palette }: { score: number; palette: any }) {
  const color = score >= 70 ? palette.success : score >= 40 ? palette.warning : palette.error;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: palette.muted, fontSize: 12 }}>نقاط الصحة</Text>
        <Text style={{ color, fontSize: 16, fontWeight: '800' }}>{score}/100</Text>
      </View>
      <View style={{ height: 8, backgroundColor: palette.border, borderRadius: 4 }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${score}%` }} />
      </View>
    </View>
  );
}

// ─── PeerFlood Explanation Card ────────────────────────────────────────────────

function WhyPeerFloodCard({ palette }: { palette: any }) {
  return (
    <View style={{
      backgroundColor: '#F59E0B10',
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: '#F59E0B40',
      marginBottom: 14,
      gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name="info-outline" size={18} color="#F59E0B" />
        <Text style={{ color: '#F59E0B', fontSize: 14, fontWeight: '800' }}>ما هو PeerFlood؟</Text>
      </View>
      <Text style={{ color: palette.foreground, fontSize: 13, lineHeight: 20 }}>
        هو قيد من <Text style={{ fontWeight: '800', color: '#F59E0B' }}>Telegram مباشرةً</Text>، ليس خطأ في التطبيق.
        Telegram يمنع الحسابات من إضافة أعضاء بسرعة كبيرة لمنع الإسبام.
      </Text>

      <View style={{ gap: 6 }}>
        {[
          { icon: 'new-releases', color: '#F87171', text: 'حساب جديد (< 30 يوم): 5–10 إضافات/يوم فقط' },
          { icon: 'trending-up', color: '#FBBF24', text: 'حساب متوسط (1–6 أشهر): 20–30 إضافة/يوم' },
          { icon: 'verified', color: '#34D399', text: 'حساب قديم نشط (> 6 أشهر): 40–80 إضافة/يوم' },
          { icon: 'admin-panel-settings', color: '#8B5CF6', text: 'أدمن في المجموعة/القناة المستهدفة: ضعف الكمية' },
        ].map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <MaterialIcons name={item.icon as any} size={14} color={item.color} style={{ marginTop: 2 }} />
            <Text style={{ color: palette.muted, fontSize: 12, flex: 1 }}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#8B5CF620' }}>
        <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>💡 الحل الصحيح:</Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>
          استخدم <Text style={{ color: palette.foreground, fontWeight: '700' }}>حسابات متعددة</Text> — الهدف الأساسي لـ FALKON PRO.{'\n'}
          10 حسابات × 30 إضافة = <Text style={{ color: palette.success, fontWeight: '800' }}>300 إضافة/يوم</Text>
        </Text>
      </View>
    </View>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, subValue, color, palette
}: {
  icon: string; label: string; value: string; subValue?: string; color: string; palette: any;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: color + '30',
      alignItems: 'center',
      gap: 4,
    }}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      {subValue && <Text style={{ color: palette.muted, fontSize: 10 }}>{subValue}</Text>}
      <Text style={{ color: palette.muted, fontSize: 11, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function AccountHealthScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const params = useLocalSearchParams<{ accountId: string }>();
  const { activeAccounts } = useAccountsStore();
  const utils = trpc.useUtils();

  const accountId = params.accountId || activeAccounts[0]?.id || '';
  const account = activeAccounts.find(a => a.id === accountId) || activeAccounts[0];

  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live clock for cooldown countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const healthQuery = trpc.system.accountHealth.useQuery(
    { accountId },
    { enabled: !!accountId, refetchInterval: 5000 }
  );
  const resetMut = trpc.system.resetCircuit.useMutation({
    onSuccess: () => {
      healthQuery.refetch();
      Alert.alert('✅ تم', 'تم إعادة ضبط الـ Circuit Breaker. يمكن للحساب العمل الآن.');
    },
    onError: (e) => Alert.alert('خطأ', e.message),
  });
  const resetAllMut = trpc.system.resetAllCircuits.useMutation({
    onSuccess: (d) => {
      healthQuery.refetch();
      Alert.alert('✅ تم', `أُعيد ضبط ${d.resetCount} حساب`);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await healthQuery.refetch();
    setRefreshing(false);
  }, [healthQuery]);

  const h = healthQuery.data;
  const cooldownLeft = h ? Math.max(0, h.circuitOpenUntil - now) : 0;
  const isCooling = h?.circuitOpen && cooldownLeft > 0;
  const dailyMax = 40;

  const statusColor = isCooling
    ? palette.error
    : h?.score && h.score >= 70
      ? palette.success
      : palette.warning;

  const statusText = isCooling
    ? 'محظور مؤقتاً'
    : h?.score && h.score >= 70
      ? 'يعمل بشكل طبيعي'
      : 'يحتاج انتباه';

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
              تشخيص
            </Text>
            <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>صحة الحساب</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="refresh" size={20} color={palette.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        >
          {/* Account Info */}
          {account && (
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: statusColor + '40',
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: statusColor + '20',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <MaterialIcons name="person" size={22} color={statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '800' }}>
                  {account.firstName} {account.lastName}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>{account.phone}</Text>
                {account.username && (
                  <Text style={{ color: palette.primary, fontSize: 12 }}>@{account.username}</Text>
                )}
              </View>
              <View style={{
                backgroundColor: statusColor + '20',
                paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: 20, borderWidth: 1, borderColor: statusColor + '40',
              }}>
                <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusText}</Text>
              </View>
            </View>
          )}

          {/* Cooldown Alert */}
          {isCooling && (
            <View style={{
              backgroundColor: palette.error + '15',
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.error + '40',
              marginBottom: 14,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <MaterialIcons name="block" size={20} color={palette.error} />
                <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>
                  الحساب في فترة Cooldown
                </Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 13, marginBottom: 12 }}>
                Telegram علّق هذا الحساب مؤقتاً بسبب PeerFlood. لا يمكنه إضافة أعضاء حتى ينتهي العداد.
              </Text>

              {/* Big countdown */}
              <View style={{
                backgroundColor: palette.error + '20',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <Text style={{ color: palette.muted, fontSize: 12, marginBottom: 4 }}>الوقت المتبقي</Text>
                <Text style={{ color: palette.error, fontSize: 42, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                  {formatMs(cooldownLeft)}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                  ينتهي في {new Date(h!.circuitOpenUntil).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: palette.error,
                    borderRadius: 10, padding: 12,
                    alignItems: 'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 6,
                    opacity: resetMut.isPending ? 0.6 : 1,
                  }}
                  onPress={() => {
                    Alert.alert(
                      'إعادة ضبط الـ Circuit Breaker',
                      'هل تريد رفع الحظر المؤقت الآن؟\n\nتحذير: قد يؤدي ذلك إلى حظر الحساب إذا استمررت في الإضافة السريعة.',
                      [
                        { text: 'إلغاء', style: 'cancel' },
                        { text: 'نعم، أفهم', style: 'destructive', onPress: () => resetMut.mutate({ accountId }) },
                      ]
                    );
                  }}
                  disabled={resetMut.isPending}
                >
                  <MaterialIcons name="lock-open" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>رفع الحظر الآن</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: palette.surface,
                    borderRadius: 10, padding: 12,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: palette.border,
                    paddingHorizontal: 16,
                  }}
                  onPress={onRefresh}
                >
                  <MaterialIcons name="refresh" size={18} color={palette.muted} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Health Score */}
          {h && (
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
              marginBottom: 14,
            }}>
              <ScoreBar score={h.score} palette={palette} />
            </View>
          )}

          {/* Stats Grid */}
          {h && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <StatCard
                icon="person-add"
                label="إضافات اليوم"
                value={String(h.dailyAdded)}
                subValue={`من ${dailyMax}`}
                color={h.dailyAdded >= dailyMax ? palette.error : palette.success}
                palette={palette}
              />
              <StatCard
                icon="block"
                label="PeerFlood"
                value={String(h.peerFloodCount)}
                subValue="مجموع"
                color={h.peerFloodCount > 0 ? palette.error : palette.success}
                palette={palette}
              />
              <StatCard
                icon="speed"
                label="FloodWait"
                value={String(h.floodWaitCount)}
                subValue="مجموع"
                color={h.floodWaitCount > 2 ? palette.warning : palette.muted}
                palette={palette}
              />
              <StatCard
                icon="check-circle"
                label="أُضيف"
                value={String(h.totalAdded)}
                subValue="إجمالي"
                color={palette.primary}
                palette={palette}
              />
            </View>
          )}

          {/* Daily Limit Bar */}
          {h && (
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
              marginBottom: 14,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>
                  الحد اليومي (Telegram)
                </Text>
                <Text style={{
                  color: h.dailyAdded >= dailyMax ? palette.error : palette.success,
                  fontWeight: '800',
                }}>
                  {h.dailyAdded} / {dailyMax}
                </Text>
              </View>
              <View style={{ height: 10, backgroundColor: palette.border, borderRadius: 5 }}>
                <View style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: h.dailyAdded >= dailyMax ? palette.error : palette.primary,
                  width: `${Math.min(100, (h.dailyAdded / dailyMax) * 100)}%`,
                }} />
              </View>
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>
                يتجدد يومياً عند منتصف الليل (UTC)
              </Text>
            </View>
          )}

          {/* Why PeerFlood explanation */}
          <WhyPeerFloodCard palette={palette} />

          {/* Tips for better performance */}
          <View style={{
            backgroundColor: palette.surface,
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: palette.border,
            marginBottom: 14,
            gap: 10,
          }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>
              كيف تحسّن الأداء؟
            </Text>
            {[
              { num: '1', tip: 'أضف حسابات متعددة — كل حساب = كوتا إضافية مستقلة' },
              { num: '2', tip: 'استخدم وضع Warmup للحسابات الجديدة (يبدأ بطيئاً ثم يتسارع)' },
              { num: '3', tip: 'اجعل الحساب أدمناً في القناة/المجموعة المستهدفة' },
              { num: '4', tip: 'زيد التأخير بين الإضافات إلى 45-60 ثانية' },
              { num: '5', tip: 'استخدم حسابات عمرها أكثر من 3 أشهر ونشطة' },
            ].map((item) => (
              <View key={item.num} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: palette.primary + '20',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '800' }}>{item.num}</Text>
                </View>
                <Text style={{ color: palette.muted, fontSize: 13, flex: 1, lineHeight: 20 }}>{item.tip}</Text>
              </View>
            ))}
          </View>

          {/* Reset All Button */}
          <TouchableOpacity
            style={{
              backgroundColor: palette.surface,
              borderRadius: 12,
              padding: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: palette.border,
              marginBottom: 8,
              opacity: resetAllMut.isPending ? 0.6 : 1,
            }}
            onPress={() => {
              Alert.alert(
                'إعادة ضبط جميع الحسابات',
                'هل تريد إزالة الـ Circuit Breaker من كل الحسابات المعطّلة؟',
                [
                  { text: 'إلغاء', style: 'cancel' },
                  { text: 'نعم', onPress: () => resetAllMut.mutate() },
                ]
              );
            }}
            disabled={resetAllMut.isPending}
          >
            <MaterialIcons name="settings-backup-restore" size={18} color={palette.muted} />
            <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13 }}>إعادة ضبط جميع الحسابات</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
