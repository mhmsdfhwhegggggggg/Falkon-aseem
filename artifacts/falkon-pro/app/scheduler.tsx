import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

interface ScheduledTask {
  id: string;
  name: string;
  type: string;
  scheduledAt: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export default function SchedulerScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('extraction');
  const [showAdd, setShowAdd] = useState(false);

  const STATUS_COLOR = { pending: '#FBBF24', running: '#34D399', done: '#60A5FA', failed: '#F87171' };

  const addTask = () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Give your task a name');
      return;
    }
    setTasks(prev => [...prev, { id: Date.now().toString(), name, type, scheduledAt: new Date(Date.now() + 3600000).toLocaleString(), status: 'pending' }]);
    setName('');
    setShowAdd(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Scheduler</Text>
            </View>
          </View>
          <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setShowAdd(!showAdd)}>
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{showAdd ? 'Cancel' : 'Schedule'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 12 }}>
          {showAdd && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>New Scheduled Task</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Task name..." placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['extraction', 'bulk-msg', 'add'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: type === t ? palette.primary : palette.background, borderWidth: 1, borderColor: type === t ? palette.primary : palette.border, alignItems: 'center' }}
                    onPress={() => setType(t)}
                  >
                    <Text style={{ color: type === t ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={addTask}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Schedule Task</Text>
              </TouchableOpacity>
            </View>
          )}

          {tasks.length === 0 && !showAdd ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <MaterialIcons name="schedule" size={48} color={palette.muted} />
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No Scheduled Tasks</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>Schedule tasks to run automatically at specific times</Text>
            </View>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: STATUS_COLOR[task.status] + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="schedule" size={18} color={STATUS_COLOR[task.status]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{task.name}</Text>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>{task.scheduledAt} • {task.type}</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: STATUS_COLOR[task.status] + '20' }}>
                  <Text style={{ color: STATUS_COLOR[task.status], fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>{task.status}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
