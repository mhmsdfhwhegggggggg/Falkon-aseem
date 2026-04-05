import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useTaskRunner } from '@/lib/task-runner';
import { useMembersStore } from '@/lib/members-store';

const { width } = Dimensions.get('window');

const QUICK_ACTIONS = [
  { label: 'Extract', icon: 'download' as const, route: '/extraction', color: '#8B5CF6' },
  { label: 'Add Members', icon: 'person-add' as const, route: '/add-members', color: '#34D399' },
  { label: 'Bulk Msg', icon: 'chat' as const, route: '/bulk-ops', color: '#60A5FA' },
  { label: 'Saved Files', icon: 'folder' as const, route: '/members-files', color: '#FBBF24' },
  { label: 'Monitor', icon: 'monitor' as const, route: '/tasks-monitor', color: '#F87171' },
  { label: 'Windows', icon: 'tab' as const, route: '/windows', color: '#A78BFA' },
];

export default function DashboardScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [refreshing, setRefreshing] = useState(false);
  const { tasks, activeTasks } = useTaskRunner();
  const { files, totalMembers } = useMembersStore();

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalAdded = files.reduce((a, f) => a + f.addedCount, 0);

  const STAT_CARDS = [
    { label: 'Members Files', value: files.length.toString(), icon: 'folder' as const, color: '#8B5CF6' },
    { label: 'Total Members', value: totalMembers.toLocaleString(), icon: 'people' as const, color: '#34D399' },
    { label: 'Running Tasks', value: activeTasks.length.toString(), icon: 'play-circle-filled' as const, color: '#60A5FA' },
    { label: 'Members Added', value: totalAdded.toLocaleString(), icon: 'person-add' as const, color: '#FBBF24' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 }}>FALKON PRO</Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Dashboard</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {activeTasks.length > 0 && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.success + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, gap: 4 }}
                onPress={() => router.push('/tasks-monitor' as any)}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.success }} />
                <Text style={{ color: palette.success, fontSize: 12, fontWeight: '700' }}>{activeTasks.length} Running</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }}
              onPress={() => router.push('/tasks-monitor' as any)}
            >
              <MaterialIcons name="notifications-none" size={18} color={palette.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Hero Banner */}
          <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <LinearGradient
              colors={['#4C1D95', '#6D28D9', '#8B5CF6']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 20 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>System Status</Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>
                    {activeTasks.length > 0 ? `${activeTasks.length} Task${activeTasks.length > 1 ? 's' : ''} Running` : 'Ready'}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>
                    {completedTasks} completed • {files.length} files saved
                  </Text>
                </View>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="local-fire-department" size={28} color="#fff" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}
                  onPress={() => router.push('/extraction' as any)}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Action</Text>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 }}>⚡ Extract Members</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}
                  onPress={() => router.push('/add-members' as any)}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Action</Text>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 }}>➕ Add Members</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* Stat Cards */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>Overview</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {STAT_CARDS.map((card) => (
                <View key={card.label} style={{ width: (width - 50) / 2, backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: card.color + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <MaterialIcons name={card.icon} size={18} color={card.color} />
                  </View>
                  <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '900' }}>{card.value}</Text>
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{card.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Quick Access */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>Quick Access</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={{ width: (width - 50) / 3, alignItems: 'center', backgroundColor: palette.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: palette.border }}
                  onPress={() => router.push(action.route as any)}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: action.color + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <MaterialIcons name={action.icon} size={20} color={action.color} />
                  </View>
                  <Text style={{ color: palette.foreground, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recent Files */}
          {files.length > 0 && (
            <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700' }}>Recent Files</Text>
                <TouchableOpacity onPress={() => router.push('/members-files' as any)}>
                  <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '700' }}>View All</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                {files.slice(0, 3).map((file) => (
                  <TouchableOpacity
                    key={file.id}
                    style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => router.push({ pathname: '/members-file', params: { id: file.id } } as any)}
                  >
                    <MaterialIcons name="folder" size={20} color={palette.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{file.totalCount} members • {file.addedCount} added</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: palette.success + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                      onPress={() => router.push({ pathname: '/add-members', params: { fileId: file.id } } as any)}
                    >
                      <Text style={{ color: palette.success, fontSize: 11, fontWeight: '700' }}>Add</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Recent Tasks */}
          {tasks.length > 0 && (
            <View style={{ marginHorizontal: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700' }}>Recent Tasks</Text>
                <TouchableOpacity onPress={() => router.push('/tasks-monitor' as any)}>
                  <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '700' }}>Monitor</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                {tasks.slice(0, 3).map((task) => (
                  <View key={task.id} style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <MaterialIcons name={task.status === 'completed' ? 'check-circle' : task.status === 'running' ? 'play-circle-filled' : task.status === 'error' ? 'error' : 'cancel'} size={18} color={task.status === 'completed' ? palette.success : task.status === 'running' ? palette.primary : task.status === 'error' ? palette.error : palette.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{task.title}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{task.progress}% • {task.succeeded} succeeded</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {files.length === 0 && tasks.length === 0 && (
            <View style={{ marginHorizontal: 20 }}>
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 24, alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="rocket-launch" size={36} color={palette.muted} />
                <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700' }}>Ready to Launch</Text>
                <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>Start by extracting members or adding them directly to your groups.</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }} onPress={() => router.push('/extraction' as any)}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Extract Members</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: palette.success + '20', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: palette.success + '40' }} onPress={() => router.push('/add-members' as any)}>
                    <Text style={{ color: palette.success, fontWeight: '700', fontSize: 13 }}>Add Members</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
