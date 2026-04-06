import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useWindowManager } from '@/lib/window-manager';

const MODES = [
  { id: 'dm', label: 'Direct Messages', icon: 'chat' as const, description: 'Message individual users' },
  { id: 'group', label: 'Group Blast', icon: 'group' as const, description: 'Post to multiple groups' },
  { id: 'channel', label: 'Channel Broadcast', icon: 'campaign' as const, description: 'Broadcast to channels' },
];

export default function BulkOpsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [mode, setMode] = useState('dm');
  const [message, setMessage] = useState('');
  const [targets, setTargets] = useState('');
  const [delay, setDelay] = useState('45');
  const { createWindow } = useWindowManager();

  const handleStart = () => {
    if (!message.trim() || !targets.trim()) {
      Alert.alert('Missing Input', 'Please fill in the message and targets');
      return;
    }
    createWindow({ taskType: 'bulk-message' }, `Bulk ${mode}: ${message.slice(0, 20)}...`);
    router.push('/windows' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Bulk Operations</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}>
          {/* Mode Selector */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Operation Mode</Text>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={{ backgroundColor: mode === m.id ? palette.primary + '15' : palette.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: mode === m.id ? palette.primary : palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                onPress={() => setMode(m.id)}
              >
                <MaterialIcons name={m.icon} size={20} color={mode === m.id ? palette.primary : palette.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>{m.description}</Text>
                </View>
                {mode === m.id && <MaterialIcons name="check-circle" size={18} color={palette.primary} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Message */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Type your message here..."
              placeholderTextColor={palette.muted}
              multiline
              numberOfLines={5}
              style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, textAlignVertical: 'top', minHeight: 120 }}
            />
          </View>

          {/* Targets */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Targets (one per line)</Text>
            <TextInput
              value={targets}
              onChangeText={setTargets}
              placeholder="@user1&#10;@user2&#10;@group1"
              placeholderTextColor={palette.muted}
              multiline
              numberOfLines={4}
              style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, textAlignVertical: 'top', minHeight: 100 }}
            />
          </View>

          {/* Delay */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Delay Between Messages (sec)</Text>
            <TextInput
              value={delay}
              onChangeText={setDelay}
              placeholder="45"
              keyboardType="numeric"
              placeholderTextColor={palette.muted}
              style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
            />
          </View>

          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            onPress={handleStart}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Launch Bulk Operation</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
