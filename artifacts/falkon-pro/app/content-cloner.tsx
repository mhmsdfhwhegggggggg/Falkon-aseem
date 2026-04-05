import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useWindowManager } from '@/lib/window-manager';

export default function ContentClonerScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [cloneMedia, setCloneMedia] = useState(true);
  const [clonePolls, setClonePolls] = useState(false);
  const [delay, setDelay] = useState('5');
  const { createWindow } = useWindowManager();

  const handleStart = () => {
    if (!source.trim() || !dest.trim()) {
      Alert.alert('Missing Input', 'Fill in source and destination channels');
      return;
    }
    createWindow({ title: `Clone: ${source}→${dest}`, taskType: 'content-clone', metadata: { source, dest, cloneMedia, clonePolls, delay } });
    router.push('/windows' as any);
  };

  const Toggle = ({ value, onToggle, label, description }: any) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {description && <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{description}</Text>}
      </View>
      <TouchableOpacity
        style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 2 }}
        onPress={onToggle}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Content Cloner</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 14 }}>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Source & Destination</Text>
            <TextInput value={source} onChangeText={setSource} placeholder="Source @channel" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
            <TextInput value={dest} onChangeText={setDest} placeholder="Destination @channel" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
          </View>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 14 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Options</Text>
            <Toggle value={cloneMedia} onToggle={() => setCloneMedia(!cloneMedia)} label="Clone Media" description="Forward photos, videos, documents" />
            <View style={{ height: 1, backgroundColor: palette.border }} />
            <Toggle value={clonePolls} onToggle={() => setClonePolls(!clonePolls)} label="Clone Polls" description="Recreate polls and quizzes" />
          </View>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Forward Delay (sec)</Text>
            <TextInput value={delay} onChangeText={setDelay} placeholder="5" keyboardType="numeric" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
          </View>
          <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} onPress={handleStart}>
            <MaterialIcons name="content-copy" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Start Cloning</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
