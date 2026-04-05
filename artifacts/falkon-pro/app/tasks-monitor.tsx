import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useTaskRunner, type RunningTask, type TaskStatus } from '@/lib/task-runner';

const STATUS_CFG: Record<TaskStatus, { color: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }> = {
  idle: { color: '#9CA3AF', icon: 'circle', label: 'Idle' },
  running: { color: '#34D399', icon: 'play-circle-filled', label: 'Running' },
  paused: { color: '#FBBF24', icon: 'pause-circle-filled', label: 'Paused' },
  completed: { color: '#60A5FA', icon: 'check-circle', label: 'Completed' },
  error: { color: '#F87171', icon: 'error', label: 'Error' },
  cancelled: { color: '#9CA3AF', icon: 'cancel', label: 'Cancelled' },
};

const TYPE_LABELS: Record<string, string> = {
  'extraction': 'Member Extraction',
  'add-by-username': 'Add by Username',
  'add-by-id': 'Add by ID',
  'add-from-file': 'Add from File',
  'bulk-message': 'Bulk Message',
  'auto-reply': 'Auto Reply',
  'content-clone': 'Content Cloner',
  'scheduler': 'Scheduler',
};

function TaskCard({ task, onRemove }: { task: RunningTask; onRemove: () => void }) {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const cfg = STATUS_CFG[task.status];
  const elapsed = Math.floor((Date.now() - task.startedAt.getTime()) / 1000);
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;

  return (
    <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 12, overflow: 'hidden' }}>
      {/* Title Bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 10 }}>
        <MaterialIcons name={cfg.icon} size={18} color={cfg.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{task.title}</Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>{TYPE_LABELS[task.type] ?? task.type} • {elapsedStr} elapsed</Text>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: cfg.color + '20' }}>
          <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.label}</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: palette.muted, fontSize: 12 }}>{task.processed}/{task.total}</Text>
          <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>{task.progress}%</Text>
        </View>
        <View style={{ height: 4, backgroundColor: palette.border, borderRadius: 2, marginBottom: 10 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: task.status === 'completed' ? palette.success : task.status === 'error' || task.status === 'cancelled' ? palette.error : palette.primary, width: `${task.progress}%` }} />
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: palette.success, fontSize: 15, fontWeight: '800' }}>{task.succeeded}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Success</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: palette.error, fontSize: 15, fontWeight: '800' }}>{task.failed}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Failed</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: palette.info, fontSize: 15, fontWeight: '800' }}>{task.skipped}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase' }}>Skipped</Text>
          </View>
        </View>

        {/* Recent Logs */}
        {task.logs.length > 0 && (
          <View style={{ marginTop: 10, backgroundColor: palette.background, borderRadius: 8, padding: 8, maxHeight: 70 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {task.logs.slice(0, 5).map((log, i) => (
                <Text key={i} style={{ color: log.type === 'success' ? palette.success : log.type === 'error' ? palette.error : log.type === 'warning' ? palette.warning : palette.muted, fontSize: 10, lineHeight: 15 }}>
                  [{log.time}] {log.message}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Output File Link */}
        {task.outputFileId && task.status === 'completed' && (
          <TouchableOpacity
            style={{ marginTop: 10, backgroundColor: palette.primary + '15', borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: palette.primary + '30' }}
            onPress={() => router.push({ pathname: '/members-file', params: { id: task.outputFileId } } as any)}
          >
            <MaterialIcons name="folder-open" size={14} color={palette.primary} />
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>View Output File</Text>
          </TouchableOpacity>
        )}

        {(task.status !== 'running' && task.status !== 'paused') && (
          <TouchableOpacity style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 }} onPress={onRemove}>
            <MaterialIcons name="delete-outline" size={14} color={palette.error} />
            <Text style={{ color: palette.error, fontSize: 11 }}>Remove from list</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function TasksMonitorScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { tasks, removeTask, activeTasks } = useTaskRunner();

  const handleClearAll = () => {
    const done = tasks.filter((t) => t.status !== 'running' && t.status !== 'paused');
    if (done.length === 0) {
      Alert.alert('Nothing to clear', 'No completed or cancelled tasks to remove');
      return;
    }
    Alert.alert('Clear Completed', `Remove ${done.length} completed/cancelled tasks?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => done.forEach((t) => removeTask(t.id)) },
    ]);
  };

  const byStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Real-time</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Task Monitor</Text>
            </View>
          </View>
          {tasks.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: palette.error + '15', borderWidth: 1, borderColor: palette.error + '30' }}>
              <Text style={{ color: palette.error, fontSize: 12, fontWeight: '700' }}>Clear Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status Summary */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          {(['running', 'paused', 'completed', 'error', 'cancelled'] as TaskStatus[]).map((s) => {
            const count = byStatus(s).length;
            const cfg = STATUS_CFG[s];
            return (
              <View key={s} style={{ backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: count > 0 ? cfg.color + '40' : palette.border, alignItems: 'center', minWidth: 64 }}>
                <Text style={{ color: count > 0 ? cfg.color : palette.muted, fontSize: 16, fontWeight: '900' }}>{count}</Text>
                <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{cfg.label}</Text>
              </View>
            );
          })}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {tasks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <MaterialIcons name="assignment" size={52} color={palette.muted} />
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No Tasks</Text>
              <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>
                Tasks appear here when you run extraction, add, or bulk operations.
              </Text>
            </View>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onRemove={() => removeTask(task.id)} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
