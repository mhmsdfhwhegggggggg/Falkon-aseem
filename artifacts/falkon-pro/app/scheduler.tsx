import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';

const BG = '#030712';
const SURFACE = '#0D1117';
const SURFACE2 = '#111827';
const BORDER = '#1a2235';
const GOLD = '#F59E0B';
const GREEN = '#34D399';
const RED = '#F87171';
const PURPLE = '#8B5CF6';
const ORANGE = '#FB923C';

const STORAGE_KEY = 'scheduler_jobs_v1';

type TaskType = 'extraction' | 'add-members' | 'bulk-message';
type JobStatus = 'pending' | 'running' | 'done' | 'failed';

interface ScheduledJob {
  id: string;
  name: string;
  taskType: TaskType;
  scheduledAt: number;
  status: JobStatus;
  params: Record<string, unknown>;
  createdAt: number;
}

const TASK_OPTIONS: { type: TaskType; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; color: string }[] = [
  { type: 'extraction', label: 'استخراج أعضاء', icon: 'download', color: PURPLE },
  { type: 'add-members', label: 'إضافة أعضاء', icon: 'person-add', color: GREEN },
  { type: 'bulk-message', label: 'رسائل جماعية', icon: 'chat', color: GOLD },
];

const STATUS_INFO: Record<JobStatus, { color: string; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }> = {
  pending: { color: GOLD, label: 'منتظر', icon: 'hourglass-empty' },
  running: { color: PURPLE, label: 'يعمل', icon: 'play-circle-filled' },
  done: { color: GREEN, label: 'مكتمل', icon: 'check-circle' },
  failed: { color: RED, label: 'فشل', icon: 'error' },
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeLeft(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'الآن';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `بعد ${h}س ${m}د`;
  return `بعد ${m} دقيقة`;
}

function useJobs() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setJobs(JSON.parse(raw));
    });
    // Check for due jobs every minute
    const timer = setInterval(checkDueJobs, 60000);
    return () => clearInterval(timer);
  }, []);

  const checkDueJobs = useCallback(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      const loaded: ScheduledJob[] = JSON.parse(raw);
      const now = Date.now();
      let changed = false;
      const updated = loaded.map((j) => {
        if (j.status === 'pending' && j.scheduledAt <= now) {
          changed = true;
          return { ...j, status: 'running' as JobStatus };
        }
        return j;
      });
      if (changed) {
        setJobs(updated);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    });
  }, []);

  const save = useCallback((next: ScheduledJob[]) => {
    setJobs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { jobs, save };
}

export default function SchedulerScreen() {
  const { jobs, save } = useJobs();
  const { activeAccounts } = useAccountsStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('extraction');
  const [targetGroup, setTargetGroup] = useState('');
  const [scheduledHours, setScheduledHours] = useState('1');

  const createServerJob = trpc.scheduler.create.useMutation({
    onSuccess(data) {
      const newJob: ScheduledJob = {
        id: data.id,
        name: data.name,
        taskType: data.taskType as TaskType,
        scheduledAt: data.scheduledAt,
        status: 'pending',
        params: data.params,
        createdAt: data.createdAt,
      };
      save([...jobs, newJob]);
      setShowAdd(false);
      setName('');
      setTargetGroup('');
    },
    onError(err) {
      Alert.alert('خطأ', err.message);
    },
  });

  const addJob = () => {
    if (!name.trim()) { Alert.alert('خطأ', 'يرجى إدخال اسم للمهمة'); return; }
    const hours = parseFloat(scheduledHours);
    if (isNaN(hours) || hours < 0) { Alert.alert('خطأ', 'يرجى إدخال مدة صحيحة'); return; }

    const scheduledAt = Date.now() + Math.round(hours * 3600000);
    const activeAcc = activeAccounts[0];

    createServerJob.mutate({
      name: name.trim(),
      taskType,
      scheduledAt,
      params: {
        group: targetGroup.trim(),
        accountId: activeAcc?.id ?? '',
      },
    });
  };

  const deleteJob = (id: string) => {
    Alert.alert('حذف المهمة', 'هل تريد حذف هذه المهمة المجدولة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => save(jobs.filter((j) => j.id !== id)) },
    ]);
  };

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;
  const doneCount = jobs.filter((j) => j.status === 'done').length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="arrow-back" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>تشغيل آلي</Text>
            <Text style={{ color: '#F3F4F6', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>جدولة المهام</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowAdd(!showAdd)}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: ORANGE + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ORANGE + '40' }}
          >
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={20} color={ORANGE} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: GOLD, fontSize: 24, fontWeight: '900' }}>{pendingCount}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700' }}>قيد الانتظار</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: GREEN, fontSize: 24, fontWeight: '900' }}>{doneCount}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700' }}>مكتملة</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: '#60A5FA', fontSize: 24, fontWeight: '900' }}>{jobs.length}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700' }}>إجمالي</Text>
            </View>
          </View>

          {/* Add Job Form */}
          {showAdd && (
            <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: ORANGE + '40', marginBottom: 20, overflow: 'hidden' }}>
              <View style={{ height: 2, backgroundColor: ORANGE }} />
              <View style={{ padding: 16, gap: 14 }}>
                <Text style={{ color: ORANGE, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>مهمة جديدة</Text>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>اسم المهمة</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="مثال: استخراج يومي..."
                    placeholderTextColor="#374151"
                    style={{ backgroundColor: SURFACE2, borderRadius: 10, padding: 12, color: '#F3F4F6', borderWidth: 1, borderColor: BORDER, fontSize: 14, textAlign: 'right' }}
                  />
                </View>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>نوع المهمة</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {TASK_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.type}
                        onPress={() => setTaskType(opt.type)}
                        style={{ flex: 1, backgroundColor: taskType === opt.type ? opt.color + '20' : SURFACE2, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: taskType === opt.type ? opt.color + '60' : BORDER, gap: 4 }}
                      >
                        <MaterialIcons name={opt.icon} size={18} color={taskType === opt.type ? opt.color : '#6B7280'} />
                        <Text style={{ color: taskType === opt.type ? opt.color : '#6B7280', fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>المجموعة / القناة (اختياري)</Text>
                  <TextInput
                    value={targetGroup}
                    onChangeText={setTargetGroup}
                    placeholder="@username أو t.me/link..."
                    placeholderTextColor="#374151"
                    style={{ backgroundColor: SURFACE2, borderRadius: 10, padding: 12, color: '#F3F4F6', borderWidth: 1, borderColor: BORDER, fontSize: 14, textAlign: 'right' }}
                  />
                </View>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>بعد كم ساعة؟</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['0.5', '1', '2', '6', '12', '24'].map((h) => (
                      <TouchableOpacity
                        key={h}
                        onPress={() => setScheduledHours(h)}
                        style={{ flex: 1, backgroundColor: scheduledHours === h ? GOLD + '20' : SURFACE2, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: scheduledHours === h ? GOLD + '60' : BORDER }}
                      >
                        <Text style={{ color: scheduledHours === h ? GOLD : '#6B7280', fontSize: 10, fontWeight: '800' }}>{h}س</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={addJob}
                  disabled={createServerJob.isPending}
                  style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <MaterialIcons name="schedule" size={18} color="#030712" />
                  <Text style={{ color: '#030712', fontWeight: '900', fontSize: 14 }}>
                    {createServerJob.isPending ? 'جارٍ الجدولة...' : 'جدولة المهمة'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Jobs List Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 3, height: 18, backgroundColor: ORANGE, borderRadius: 2 }} />
            <Text style={{ color: '#E5E7EB', fontSize: 14, fontWeight: '800' }}>المهام المجدولة</Text>
          </View>

          {jobs.length === 0 ? (
            <View style={{ backgroundColor: SURFACE, borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: BORDER, gap: 10 }}>
              <MaterialIcons name="schedule" size={36} color="#374151" />
              <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                لا توجد مهام مجدولة.{'\n'}أضف مهمة جديدة بالضغط على +
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {jobs.slice().reverse().map((job) => {
                const info = STATUS_INFO[job.status];
                const taskOpt = TASK_OPTIONS.find((o) => o.type === job.taskType);
                return (
                  <View
                    key={job.id}
                    style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: info.color + '30', overflow: 'hidden' }}
                  >
                    <View style={{ height: 2, backgroundColor: info.color + '80' }} />
                    <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: (taskOpt?.color ?? GOLD) + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: (taskOpt?.color ?? GOLD) + '40' }}>
                        <MaterialIcons name={taskOpt?.icon ?? 'schedule'} size={22} color={taskOpt?.color ?? GOLD} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#F3F4F6', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{job.name}</Text>
                        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                          {formatDateTime(job.scheduledAt)}
                        </Text>
                        {job.status === 'pending' && (
                          <Text style={{ color: GOLD, fontSize: 10, marginTop: 2, fontWeight: '700' }}>
                            {formatTimeLeft(job.scheduledAt)}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: info.color + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: info.color + '40' }}>
                          <MaterialIcons name={info.icon} size={12} color={info.color} />
                          <Text style={{ color: info.color, fontSize: 10, fontWeight: '800' }}>{info.label}</Text>
                        </View>
                        <TouchableOpacity onPress={() => deleteJob(job.id)}>
                          <MaterialIcons name="delete-outline" size={18} color="#F87171" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
