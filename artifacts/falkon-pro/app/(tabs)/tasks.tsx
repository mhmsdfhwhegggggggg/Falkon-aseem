import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTaskRunner } from '@/lib/task-runner';
import { useMembersStore } from '@/lib/members-store';

const BG = '#030712';
const SURFACE = '#0D1117';
const BORDER = '#1a2235';
const GOLD = '#F59E0B';

const TASK_CARDS = [
  {
    id: 'extraction',
    label: 'استخراج الأعضاء',
    desc: 'استخرج أعضاء المجموعات والقنوات واحفظهم في ملف',
    icon: 'download' as const,
    color: '#8B5CF6',
    gradient: ['#1e1035', '#2d1b69'] as [string, string],
    route: '/extraction',
    badge: 'يحفظ في ملف',
  },
  {
    id: 'add-members',
    label: 'إضافة أعضاء',
    desc: 'أضف بالاسم أو ID أو من ملف محفوظ مع التدوير التلقائي',
    icon: 'person-add' as const,
    color: '#34D399',
    gradient: ['#052e16', '#064e3b'] as [string, string],
    route: '/add-members',
    badge: '3 طرق',
  },
  {
    id: 'extract-add',
    label: 'استخراج وإضافة',
    desc: 'استخرج الأعضاء وأضفهم تلقائياً في خطوة واحدة',
    icon: 'sync-alt' as const,
    color: '#60A5FA',
    gradient: ['#0c1a3e', '#1e3a8a'] as [string, string],
    route: '/extract-and-add',
    badge: 'دفعة واحدة',
  },
  {
    id: 'bulk-message',
    label: 'الرسائل الجماعية',
    desc: 'أرسل رسائل جماعية للمستخدمين أو المجموعات أو القنوات',
    icon: 'chat' as const,
    color: '#FBBF24',
    gradient: ['#291700', '#451a03'] as [string, string],
    route: '/bulk-ops',
    badge: 'متعدد الأهداف',
  },
  {
    id: 'auto-reply',
    label: 'الرد التلقائي',
    desc: 'نظام ردود ذكي يعمل على الكلمات المفتاحية',
    icon: 'reply' as const,
    color: '#F472B6',
    gradient: ['#2a0520', '#701a75'] as [string, string],
    route: '/auto-reply',
    badge: 'ذكي',
  },
  {
    id: 'scheduler',
    label: 'جدولة المهام',
    desc: 'جدول تشغيل أي مهمة في وقت محدد تلقائياً',
    icon: 'schedule' as const,
    color: '#A78BFA',
    gradient: ['#1e1035', '#3b0764'] as [string, string],
    route: '/scheduler',
    badge: 'مؤجل',
  },
  {
    id: 'content-cloner',
    label: 'ناسخ المحتوى',
    desc: 'انسخ وأعد توجيه المنشورات بين القنوات تلقائياً',
    icon: 'content-copy' as const,
    color: '#FB923C',
    gradient: ['#1c0700', '#431407'] as [string, string],
    route: '/content-cloner',
    badge: 'تلقائي',
  },
];

export default function TasksScreen() {
  const { activeTasks, tasks } = useTaskRunner();
  const { files, totalMembers } = useMembersStore();

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalAdded = files.reduce((a, f) => a + f.addedCount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                FALKON PRO
              </Text>
              <Text style={{ color: '#F3F4F6', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>المهام</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/tasks-monitor' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: activeTasks.length > 0 ? '#34D39915' : SURFACE, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: activeTasks.length > 0 ? '#34D39940' : BORDER, marginTop: 4 }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: activeTasks.length > 0 ? '#34D399' : '#4B5563' }} />
              <Text style={{ color: activeTasks.length > 0 ? '#34D399' : '#6B7280', fontSize: 12, fontWeight: '700' }}>
                {activeTasks.length > 0 ? `${activeTasks.length} نشط` : 'لا توجد مهام'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 2, width: 40, backgroundColor: GOLD, borderRadius: 1, marginTop: 8 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 1, marginHorizontal: 20, marginTop: 20, marginBottom: 24, backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
            {[
              { label: 'منجزة', value: completedCount.toString(), color: '#34D399' },
              { label: 'الأعضاء', value: totalMembers.toLocaleString(), color: '#8B5CF6' },
              { label: 'تمت إضافتهم', value: totalAdded.toLocaleString(), color: GOLD },
            ].map((stat, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: i < 2 ? 1 : 0, borderColor: BORDER }}>
                <Text style={{ color: stat.color, fontSize: 20, fontWeight: '900' }}>{stat.value}</Text>
                <Text style={{ color: '#4B5563', fontSize: 10, marginTop: 3, fontWeight: '600' }}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Section label */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 14 }}>
            <View style={{ width: 3, height: 18, backgroundColor: GOLD, borderRadius: 2 }} />
            <Text style={{ color: '#E5E7EB', fontSize: 15, fontWeight: '800' }}>ابدأ مهمة جديدة</Text>
          </View>

          {/* Task cards */}
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            {TASK_CARDS.map((task) => (
              <TouchableOpacity
                key={task.id}
                onPress={() => router.push(task.route as any)}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={[...task.gradient, task.color + '18']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 16, padding: 1.5 }}
                >
                  <View style={{ backgroundColor: SURFACE, borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: task.color + '1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: task.color + '40' }}>
                      <MaterialIcons name={task.icon} size={24} color={task.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={{ color: '#F3F4F6', fontSize: 15, fontWeight: '800' }}>{task.label}</Text>
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: task.color + '25', borderWidth: 1, borderColor: task.color + '40' }}>
                          <Text style={{ color: task.color, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{task.badge}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 17 }}>{task.desc}</Text>
                    </View>
                    <MaterialIcons name="arrow-forward-ios" size={14} color="#374151" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
