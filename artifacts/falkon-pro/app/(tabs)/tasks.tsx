import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

const TASK_TYPES = [
  {
    id: 'extraction',
    label: 'Member Extraction',
    description: 'Extract members from groups & channels',
    icon: 'group' as const,
    color: '#8B5CF6',
    gradient: ['#4C1D95', '#6D28D9'] as [string, string],
    route: '/extraction',
  },
  {
    id: 'extract-add',
    label: 'Extract & Add',
    description: 'Extract and add members to your groups',
    icon: 'person-add' as const,
    color: '#34D399',
    gradient: ['#064E3B', '#059669'] as [string, string],
    route: '/extract-and-add',
  },
  {
    id: 'bulk-message',
    label: 'Bulk Messaging',
    description: 'Send bulk messages to users & groups',
    icon: 'chat' as const,
    color: '#60A5FA',
    gradient: ['#1E3A8A', '#2563EB'] as [string, string],
    route: '/bulk-ops',
  },
  {
    id: 'auto-reply',
    label: 'Auto Reply',
    description: 'Automated response system',
    icon: 'reply' as const,
    color: '#FBBF24',
    gradient: ['#78350F', '#D97706'] as [string, string],
    route: '/auto-reply',
  },
  {
    id: 'scheduler',
    label: 'Task Scheduler',
    description: 'Schedule tasks for later execution',
    icon: 'schedule' as const,
    color: '#F472B6',
    gradient: ['#831843', '#BE185D'] as [string, string],
    route: '/scheduler',
  },
  {
    id: 'content-cloner',
    label: 'Content Cloner',
    description: 'Clone & forward content automatically',
    icon: 'content-copy' as const,
    color: '#A78BFA',
    gradient: ['#4C1D95', '#7C3AED'] as [string, string],
    route: '/content-cloner',
  },
];

export default function TasksScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [activeJobs] = useState<any[]>([]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Tasks</Text>
          </View>
          <View style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 12,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              <Text style={{ color: palette.success, fontWeight: '700' }}>{activeJobs.length}</Text> running
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {/* Active Jobs Banner */}
          {activeJobs.length === 0 ? (
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: palette.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.success + '20', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="check-circle" size={20} color={palette.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Queue Empty</Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>No tasks currently running</Text>
              </View>
            </View>
          ) : null}

          {/* Task Type Cards */}
          <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
            Start a Task
          </Text>
          <View style={{ gap: 12 }}>
            {TASK_TYPES.map((task) => (
              <TouchableOpacity
                key={task.id}
                onPress={() => router.push(task.route as any)}
              >
                <LinearGradient
                  colors={[...task.gradient, task.color + '80']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 16, padding: 1 }}
                >
                  <View style={{
                    backgroundColor: palette.surface,
                    borderRadius: 15,
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: task.color + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <MaterialIcons name={task.icon} size={24} color={task.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700' }}>
                        {task.label}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>
                        {task.description}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
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
