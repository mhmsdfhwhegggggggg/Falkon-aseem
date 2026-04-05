import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useTaskRunner } from '@/lib/task-runner';
import { useMembersStore } from '@/lib/members-store';

const TASK_TYPES = [
  {
    id: 'extraction',
    label: 'Member Extraction',
    description: 'Extract members from groups & channels → save to file',
    icon: 'download' as const,
    color: '#8B5CF6',
    gradient: ['#4C1D95', '#6D28D9'] as [string, string],
    route: '/extraction',
    badge: 'Save to file',
  },
  {
    id: 'add-members',
    label: 'Add Members',
    description: 'Add by username, by ID, or from a saved file',
    icon: 'person-add' as const,
    color: '#34D399',
    gradient: ['#064E3B', '#059669'] as [string, string],
    route: '/add-members',
    badge: '3 modes',
  },
  {
    id: 'extract-add',
    label: 'Extract & Add',
    description: 'Extract members then add them automatically',
    icon: 'sync-alt' as const,
    color: '#60A5FA',
    gradient: ['#1E3A8A', '#2563EB'] as [string, string],
    route: '/extract-and-add',
    badge: '2-in-1',
  },
  {
    id: 'bulk-message',
    label: 'Bulk Messaging',
    description: 'Send bulk messages to users, groups, or channels',
    icon: 'chat' as const,
    color: '#FBBF24',
    gradient: ['#78350F', '#D97706'] as [string, string],
    route: '/bulk-ops',
    badge: 'Multi-mode',
  },
  {
    id: 'auto-reply',
    label: 'Auto Reply',
    description: 'Automated keyword-based response system',
    icon: 'reply' as const,
    color: '#F472B6',
    gradient: ['#831843', '#BE185D'] as [string, string],
    route: '/auto-reply',
    badge: 'Smart bot',
  },
  {
    id: 'scheduler',
    label: 'Task Scheduler',
    description: 'Schedule any task to run at a specific time',
    icon: 'schedule' as const,
    color: '#A78BFA',
    gradient: ['#4C1D95', '#7C3AED'] as [string, string],
    route: '/scheduler',
    badge: 'Timed',
  },
  {
    id: 'content-cloner',
    label: 'Content Cloner',
    description: 'Clone & forward content between channels',
    icon: 'content-copy' as const,
    color: '#FB923C',
    gradient: ['#7C2D12', '#EA580C'] as [string, string],
    route: '/content-cloner',
    badge: 'Auto-forward',
  },
];

export default function TasksScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { activeTasks, tasks } = useTaskRunner();
  const { files, totalMembers } = useMembersStore();

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Tasks</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: activeTasks.length > 0 ? palette.success + '20' : palette.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: activeTasks.length > 0 ? palette.success + '50' : palette.border }}
            onPress={() => router.push('/tasks-monitor' as any)}
          >
            <MaterialIcons name="monitor" size={14} color={activeTasks.length > 0 ? palette.success : palette.muted} />
            <Text style={{ color: activeTasks.length > 0 ? palette.success : palette.muted, fontSize: 12, fontWeight: '700' }}>
              {activeTasks.length > 0 ? `${activeTasks.length} Running` : 'Monitor'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Saved Files Quick Access */}
          {files.length > 0 && (
            <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
              <LinearGradient
                colors={['#1E1B4B', '#2D1B69']}
                style={{ borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="folder" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Saved Member Files</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    {files.length} files • {totalMembers.toLocaleString()} members
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
                  onPress={() => router.push('/members-files' as any)}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>View Files</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          )}

          {/* Task Counts */}
          {tasks.length > 0 && (
            <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Running', value: activeTasks.length, color: palette.success },
                { label: 'Completed', value: tasks.filter((t) => t.status === 'completed').length, color: palette.info },
                { label: 'Total', value: tasks.length, color: palette.muted },
              ].map((stat) => (
                <TouchableOpacity
                  key={stat.label}
                  style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: palette.border }}
                  onPress={() => router.push('/tasks-monitor' as any)}
                >
                  <Text style={{ color: stat.color, fontSize: 18, fontWeight: '900' }}>{stat.value}</Text>
                  <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{stat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Task Type Cards */}
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>
              Start a Task
            </Text>
            <View style={{ gap: 10 }}>
              {TASK_TYPES.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  onPress={() => router.push(task.route as any)}
                >
                  <LinearGradient
                    colors={[...task.gradient, task.color + '40']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 14, padding: 1 }}
                  >
                    <View style={{ backgroundColor: palette.surface, borderRadius: 13, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: task.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={task.icon} size={22} color={task.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '800' }}>{task.label}</Text>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: task.color + '20' }}>
                            <Text style={{ color: task.color, fontSize: 9, fontWeight: '700' }}>{task.badge}</Text>
                          </View>
                        </View>
                        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{task.description}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
