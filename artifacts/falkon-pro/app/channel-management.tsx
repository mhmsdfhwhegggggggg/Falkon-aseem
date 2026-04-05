import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

interface Channel {
  id: string;
  username: string;
  title: string;
  members: number;
  type: 'channel' | 'group' | 'supergroup';
}

const TABS = ['My Channels', 'Linked', 'Operations'] as const;

export default function ChannelManagementScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [tab, setTab] = useState<typeof TABS[number]>('My Channels');
  const [channels] = useState<Channel[]>([]);
  const [newChannel, setNewChannel] = useState('');

  const addChannel = () => {
    if (!newChannel.trim()) {
      Alert.alert('Missing Input', 'Enter a channel username or link');
      return;
    }
    Alert.alert('Success', `Channel ${newChannel} added`);
    setNewChannel('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Telegram</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Channel Management</Text>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: tab === t ? palette.primary : palette.surface, borderWidth: 1, borderColor: tab === t ? palette.primary : palette.border }}
              onPress={() => setTab(t)}
            >
              <Text style={{ color: tab === t ? '#fff' : palette.muted, fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 12 }}>
          {tab === 'My Channels' && (
            <>
              <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={newChannel}
                  onChangeText={setNewChannel}
                  placeholder="@channel or t.me/link"
                  placeholderTextColor={palette.muted}
                  style={{ flex: 1, color: palette.foreground, fontSize: 14 }}
                />
                <TouchableOpacity
                  style={{ backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={addChannel}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>

              {channels.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
                  <MaterialIcons name="group-work" size={48} color={palette.muted} />
                  <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700' }}>No Channels Added</Text>
                  <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>Add channels or groups to manage them from here</Text>
                </View>
              )}
            </>
          )}

          {tab === 'Operations' && (
            <View style={{ gap: 10 }}>
              {[
                { label: 'Bulk Post', icon: 'campaign' as const, description: 'Post to all channels at once', color: '#8B5CF6' },
                { label: 'Schedule Post', icon: 'schedule' as const, description: 'Schedule content in advance', color: '#34D399' },
                { label: 'Pin Message', icon: 'push-pin' as const, description: 'Pin messages across channels', color: '#60A5FA' },
                { label: 'Member Report', icon: 'assessment' as const, description: 'View member statistics', color: '#FBBF24' },
              ].map((op) => (
                <TouchableOpacity
                  key={op.label}
                  style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: op.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={op.icon} size={20} color={op.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>{op.label}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{op.description}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
