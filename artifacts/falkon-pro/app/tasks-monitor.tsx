import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

const STATUS_COLOR: Record<string, string> = {
  queued: '#60A5FA',
  running: '#8B5CF6',
  completed: '#34D399',
  failed: '#F87171',
  cancelled: '#9CA3AF',
};

const STATUS_ICON: Record<string, 'schedule' | 'sync' | 'check-circle' | 'error' | 'cancel'> = {
  queued: 'schedule',
  running: 'sync',
  completed: 'check-circle',
  failed: 'error',
  cancelled: 'cancel',
};

const TYPE_LABEL: Record<string, string> = {
  extraction: 'Extraction',
  add_members: 'Add Members',
  bulk_message: 'Bulk Message',
  extract_and_add: 'Extract & Add',
};

export default function TasksMonitorScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [filter, setFilter] = useState<string>('all');

  const jobsQuery = trpc.jobs.list.useQuery(
    filter === 'all' ? {} : { status: filter as any },
    { refetchInterval: 3000 }
  );
  const cancelMut = trpc.jobs.cancel.useMutation({ onSuccess: () => jobsQuery.refetch() });

  const jobs = jobsQuery.data?.jobs ?? [];

  const counts = {
    running: jobs.filter((j) => j.status === 'running').length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    cancelled: jobs.filter((j) => j.status === 'cancelled').length,
  };

  const STAT_CARDS = [
    { label: 'RUNNING', value: counts.running, color: '#8B5CF6' },
    { label: 'QUEUED', value: counts.queued, color: '#60A5FA' },
    { label: 'COMPLETED', value: counts.completed, color: '#34D399' },
    { label: 'ERROR', value: counts.failed, color: '#F87171' },
    { label: 'CANCELLED', value: counts.cancelled, color: '#9CA3AF' },
  ];

  const FILTERS = ['all', 'running', 'queued', 'completed', 'failed', 'cancelled'];

  const elapsed = (createdAt: string) => {
    const ms = Date.now() - new Date(createdAt).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Real-Time</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Task Monitor</Text>
          </View>
          {jobsQuery.isFetching && <ActivityIndicator color={palette.primary} size="small" />}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 14 }} contentContainerStyle={{ gap: 10 }}>
          {STAT_CARDS.map((s) => (
            <View key={s.label} style={{ minWidth: 70, backgroundColor: palette.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: palette.border }}>
              <Text style={{ color: s.color, fontSize: 22, fontWeight: '900' }}>{s.value}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '700', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: filter === f ? palette.primary : palette.surface, borderWidth: 1, borderColor: filter === f ? palette.primary : palette.border }}
              onPress={() => setFilter(f)}
            >
              <Text style={{ color: filter === f ? '#fff' : palette.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={jobsQuery.isFetching} onRefresh={() => jobsQuery.refetch()} tintColor={palette.primary} />}
        >
          {jobsQuery.isLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <ActivityIndicator color={palette.primary} size="large" />
              <Text style={{ color: palette.muted, marginTop: 12 }}>Loading tasks...</Text>
            </View>
          ) : jobs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="assignment" size={32} color={palette.muted} />
              </View>
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No Tasks</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                Tasks appear here when you run extraction, add, or bulk operations.
              </Text>
            </View>
          ) : (
            jobs.map((job) => {
              const color = STATUS_COLOR[job.status] || '#9CA3AF';
              const icon = STATUS_ICON[job.status] || 'schedule';
              const prog = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

              return (
                <View
                  key={job.id}
                  style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: palette.border }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={icon} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{TYPE_LABEL[job.type] || job.type}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{elapsed(job.createdAt)} · {job.id.slice(-8)}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: color + '20' }}>
                      <Text style={{ color, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{job.status}</Text>
                    </View>
                  </View>

                  {job.total > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: palette.muted, fontSize: 11 }}>{job.progress} / {job.total}</Text>
                        <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{prog}%</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: palette.border, borderRadius: 2 }}>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: `${prog}%` }} />
                      </View>
                    </View>
                  )}

                  {(job as any).result && (
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      {(job as any).result.extracted !== undefined && (
                        <Text style={{ color: palette.muted, fontSize: 11 }}>Extracted: <Text style={{ color: palette.success }}>{(job as any).result.extracted}</Text></Text>
                      )}
                      {(job as any).result.added !== undefined && (
                        <Text style={{ color: palette.muted, fontSize: 11 }}>Added: <Text style={{ color: palette.success }}>{(job as any).result.added}</Text></Text>
                      )}
                      {(job as any).result.failed !== undefined && (job as any).result.failed > 0 && (
                        <Text style={{ color: palette.muted, fontSize: 11 }}>Failed: <Text style={{ color: palette.error }}>{(job as any).result.failed}</Text></Text>
                      )}
                    </View>
                  )}

                  {(job as any).error && (() => {
                    const errMsg: string = (job as any).error;
                    const isWaiting = job.status === 'running' && errMsg.startsWith('⏳');
                    return (
                      <View style={{ backgroundColor: (isWaiting ? palette.warning : palette.error) + '18', borderRadius: 8, padding: 8, marginBottom: 6, flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 12 }}>{isWaiting ? '⏳' : '⚠️'}</Text>
                        <Text style={{ color: isWaiting ? palette.warning : palette.error, fontSize: 11, flex: 1, lineHeight: 16 }}>
                          {isWaiting ? errMsg.replace('⏳ ', '') : errMsg}
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {job.status === 'completed' && (job as any).result?.extracted > 0 && (
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: palette.primary + '20', borderRadius: 8, padding: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                        onPress={() => router.push('/members-files' as any)}
                      >
                        <MaterialIcons name="folder-open" size={14} color={palette.primary} />
                        <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>Members Files</Text>
                      </TouchableOpacity>
                    )}
                    {(job.status === 'running' || job.status === 'queued') && (
                      <TouchableOpacity
                        style={{ backgroundColor: palette.error + '20', borderRadius: 8, padding: 8, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                        onPress={() => cancelMut.mutate({ id: job.id })}
                      >
                        <MaterialIcons name="stop" size={14} color={palette.error} />
                        <Text style={{ color: palette.error, fontSize: 12, fontWeight: '700' }}>Stop</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
