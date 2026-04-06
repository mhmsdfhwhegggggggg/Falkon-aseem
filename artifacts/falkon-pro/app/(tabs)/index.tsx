import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTaskRunner } from '@/lib/task-runner';
import { useMembersStore } from '@/lib/members-store';
import FalconLogo from '@/components/FalconLogo';

const { width } = Dimensions.get('window');

const GOLD = '#F59E0B';
const GOLD_LIGHT = '#FDE68A';
const GOLD_DARK = '#D97706';
const PURPLE = '#8B5CF6';
const PURPLE_DARK = '#4C1D95';
const BG = '#030712';
const SURFACE = '#0D1117';
const BORDER = '#1a2235';

const QUICK_ACTIONS = [
  { label: 'استخراج', icon: 'download' as const, route: '/extraction', color: PURPLE },
  { label: 'إضافة', icon: 'person-add' as const, route: '/add-members', color: '#34D399' },
  { label: 'رسائل', icon: 'chat' as const, route: '/bulk-ops', color: '#60A5FA' },
  { label: 'الملفات', icon: 'folder' as const, route: '/members-files', color: GOLD },
  { label: 'مراقبة', icon: 'monitor' as const, route: '/tasks-monitor', color: '#F87171' },
  { label: 'نوافذ', icon: 'tab' as const, route: '/windows', color: '#A78BFA' },
];

function PulsingDot({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active]);
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      {active && (
        <Animated.View style={{
          position: 'absolute',
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: '#34D39930',
          transform: [{ scale: pulse }],
        }} />
      )}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#34D399' : '#6B7280' }} />
    </View>
  );
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { tasks, activeTasks } = useTaskRunner();
  const { files, totalMembers } = useMembersStore();

  const falconAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.spring(falconAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalAdded = files.reduce((a, f) => a + f.addedCount, 0);
  const isActive = activeTasks.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Top bar ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PulsingDot active={isActive} />
            <Text style={{ color: isActive ? '#34D399' : '#6B7280', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
              {isActive ? `${activeTasks.length} مهمة نشطة` : 'جاهز'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/tasks-monitor' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SURFACE, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="notifications-none" size={16} color="#6B7280" />
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600' }}>الإشعارات</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
          contentContainerStyle={{ paddingBottom: 110 }}
        >

          {/* ── FALCON HERO ── */}
          <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 0 }}>
            {/* Outer glow ring */}
            <Animated.View style={{
              position: 'absolute',
              top: 0,
              width: 260, height: 260,
              borderRadius: 130,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: GOLD,
              opacity: glowAnim,
              transform: [{ scale: glowAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0.95, 1.05] }) }],
            }} />

            {/* Inner glow ring */}
            <Animated.View style={{
              position: 'absolute',
              top: 20,
              width: 220, height: 220,
              borderRadius: 110,
              backgroundColor: GOLD + '06',
              borderWidth: 1,
              borderColor: GOLD + '40',
            }} />

            {/* Gold gradient disc */}
            <LinearGradient
              colors={['#1a1200', '#1f1500', '#0a0a00']}
              style={{
                width: 180, height: 180, borderRadius: 90,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: GOLD + '60',
                marginTop: 30,
              }}
            >
              {/* Inner accent ring */}
              <View style={{
                position: 'absolute',
                width: 160, height: 160, borderRadius: 80,
                borderWidth: 1, borderColor: GOLD + '30',
              }} />

              <Animated.View style={{
                transform: [
                  { scale: falconAnim },
                  { translateY: falconAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                ],
              }}>
                <FalconLogo size={130} />
              </Animated.View>
            </LinearGradient>

            {/* Corner ornaments */}
            <View style={{ position: 'absolute', top: 28, left: width / 2 - 98, width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: GOLD, opacity: 0.6 }} />
            <View style={{ position: 'absolute', top: 28, right: width / 2 - 98, width: 20, height: 20, borderTopWidth: 2, borderRightWidth: 2, borderColor: GOLD, opacity: 0.6 }} />
            <View style={{ position: 'absolute', bottom: 0, left: width / 2 - 98, width: 20, height: 20, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: GOLD, opacity: 0.6 }} />
            <View style={{ position: 'absolute', bottom: 0, right: width / 2 - 98, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2, borderColor: GOLD, opacity: 0.6 }} />
          </View>

          {/* ── Brand title ── */}
          <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 28 }}>
            <Text style={{ color: GOLD, fontSize: 28, fontWeight: '900', letterSpacing: 6, textTransform: 'uppercase' }}>FALKON</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: GOLD + '40', maxWidth: 50 }} />
              <Text style={{ color: GOLD_DARK, fontSize: 11, fontWeight: '700', letterSpacing: 4 }}>PRO</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: GOLD + '40', maxWidth: 50 }} />
            </View>
            <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 6, letterSpacing: 1 }}>نظام إدارة تيليجرام الاحترافي</Text>
          </View>

          {/* ── Status banner ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <LinearGradient
              colors={['#0D1117', '#111827', '#0D1117']}
              style={{ borderRadius: 20, borderWidth: 1, borderColor: isActive ? '#34D39940' : GOLD + '25', overflow: 'hidden' }}
            >
              {/* Top accent line */}
              <LinearGradient
                colors={isActive ? ['#34D39900', '#34D399', '#34D39900'] : [GOLD + '00', GOLD, GOLD + '00']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1.5 }}
              />
              <View style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: '#6B7280', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' }}>حالة النظام</Text>
                    <Text style={{ color: isActive ? '#34D399' : GOLD, fontSize: 24, fontWeight: '900', marginTop: 4, letterSpacing: 1 }}>
                      {isActive ? `${activeTasks.length} مهام تعمل` : 'جاهز للعمل'}
                    </Text>
                    <Text style={{ color: '#4B5563', fontSize: 12, marginTop: 4 }}>
                      {completedTasks} مهمة منجزة  •  {files.length} ملف محفوظ
                    </Text>
                  </View>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: isActive ? '#34D39915' : GOLD + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isActive ? '#34D39940' : GOLD + '40' }}>
                    <MaterialIcons name={isActive ? 'bolt' : 'check-circle'} size={28} color={isActive ? '#34D399' : GOLD} />
                  </View>
                </View>

                {/* Stats row */}
                <View style={{ flexDirection: 'row', gap: 1, marginTop: 16, backgroundColor: '#ffffff08', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { label: 'أعضاء', value: totalMembers.toLocaleString(), color: PURPLE },
                    { label: 'تمت إضافتهم', value: totalAdded.toLocaleString(), color: '#34D399' },
                    { label: 'الملفات', value: files.length.toString(), color: GOLD },
                  ].map((stat, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: i < 2 ? 1 : 0, borderColor: '#ffffff10' }}>
                      <Text style={{ color: stat.color, fontSize: 18, fontWeight: '900' }}>{stat.value}</Text>
                      <Text style={{ color: '#4B5563', fontSize: 10, marginTop: 2, fontWeight: '600' }}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {/* Bottom accent line */}
              <LinearGradient
                colors={isActive ? ['#34D39900', '#34D39940', '#34D39900'] : [GOLD + '00', GOLD + '40', GOLD + '00']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1 }}
              />
            </LinearGradient>
          </View>

          {/* ── Quick Actions ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ width: 3, height: 18, backgroundColor: GOLD, borderRadius: 2 }} />
              <Text style={{ color: '#E5E7EB', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 }}>الوصول السريع</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={{ width: (width - 50) / 3, alignItems: 'center', borderRadius: 16, padding: 14, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.75}
                >
                  {/* Top accent */}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: action.color, opacity: 0.8 }} />
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: action.color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: action.color + '35' }}>
                    <MaterialIcons name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={{ color: '#D1D5DB', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Recent Files ── */}
          {files.length > 0 && (
            <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 3, height: 18, backgroundColor: GOLD, borderRadius: 2 }} />
                  <Text style={{ color: '#E5E7EB', fontSize: 15, fontWeight: '800' }}>آخر الملفات</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/members-files' as any)}>
                  <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>عرض الكل</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                {files.slice(0, 3).map((file, i) => (
                  <TouchableOpacity
                    key={file.id}
                    style={{ backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    onPress={() => router.push({ pathname: '/members-file', params: { id: file.id } } as any)}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '30' }}>
                      <MaterialIcons name="folder" size={20} color={GOLD} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#F3F4F6', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{file.totalCount} عضو  •  {file.addedCount} تمت إضافتهم</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#34D39915', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#34D39940' }}
                      onPress={() => router.push({ pathname: '/add-members', params: { fileId: file.id } } as any)}
                    >
                      <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700' }}>إضافة</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Recent Tasks ── */}
          {tasks.length > 0 && (
            <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 3, height: 18, backgroundColor: PURPLE, borderRadius: 2 }} />
                  <Text style={{ color: '#E5E7EB', fontSize: 15, fontWeight: '800' }}>المهام الأخيرة</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/tasks-monitor' as any)}>
                  <Text style={{ color: PURPLE, fontSize: 12, fontWeight: '700' }}>المراقبة</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                {tasks.slice(0, 3).map((task) => {
                  const statusColor = task.status === 'completed' ? '#34D399' : task.status === 'running' ? PURPLE : task.status === 'error' ? '#F87171' : '#6B7280';
                  const statusIcon = task.status === 'completed' ? 'check-circle' : task.status === 'running' ? 'play-circle-filled' : task.status === 'error' ? 'error' : 'cancel';
                  return (
                    <View key={task.id} style={{ backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: statusColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={statusIcon as any} size={18} color={statusColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#F3F4F6', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{task.title}</Text>
                        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{task.progress}%  •  {task.succeeded} ناجح</Text>
                      </View>
                      {task.status === 'running' && (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PURPLE }} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Empty state ── */}
          {files.length === 0 && tasks.length === 0 && (
            <View style={{ marginHorizontal: 20 }}>
              <LinearGradient
                colors={['#0D1117', '#111827']}
                style={{ borderRadius: 20, borderWidth: 1, borderColor: GOLD + '25', padding: 28, alignItems: 'center', gap: 12 }}
              >
                <Text style={{ color: GOLD, fontSize: 22, fontWeight: '900', letterSpacing: 1 }}>ابدأ الآن</Text>
                <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                  استخرج أعضاء من أي مجموعة أو أضفهم مباشرة إلى مجموعتك
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: PURPLE, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    onPress={() => router.push('/extraction' as any)}
                  >
                    <MaterialIcons name="download" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>استخراج</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: '#34D39915', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: '#34D39940', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    onPress={() => router.push('/add-members' as any)}
                  >
                    <MaterialIcons name="person-add" size={16} color="#34D399" />
                    <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 13 }}>إضافة</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
