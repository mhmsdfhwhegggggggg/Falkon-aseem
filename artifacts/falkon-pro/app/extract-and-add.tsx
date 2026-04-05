import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useWindowManager } from '@/lib/window-manager';

export default function ExtractAndAddScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [sourceGroup, setSourceGroup] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('100');
  const [delay, setDelay] = useState('30');
  const { createWindow } = useWindowManager();

  const handleStart = () => {
    if (!sourceGroup.trim() || !targetGroup.trim()) {
      Alert.alert('Missing Input', 'Please fill in both source and target groups');
      return;
    }
    createWindow({ title: `Extract+Add: ${sourceGroup}→${targetGroup}`, taskType: 'extract-add', metadata: { sourceGroup, targetGroup, limit, delay } });
    router.push('/windows' as any);
  };

  const Field = ({ label, value, onChange, placeholder, keyboardType }: any) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        keyboardType={keyboardType || 'default'}
        style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
      />
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
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Extract & Add</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 16 }}>
            <Field label="Source Group" value={sourceGroup} onChange={setSourceGroup} placeholder="@source_group" />
            <Field label="Target Group" value={targetGroup} onChange={setTargetGroup} placeholder="@target_group" />
            <Field label="Member Limit" value={limit} onChange={setLimit} placeholder="100" keyboardType="numeric" />
            <Field label="Delay Between Adds (seconds)" value={delay} onChange={setDelay} placeholder="30" keyboardType="numeric" />
          </View>
          <View style={{ backgroundColor: palette.primary + '10', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.primary + '30', marginBottom: 20, flexDirection: 'row', gap: 10 }}>
            <MaterialIcons name="info" size={18} color={palette.primary} />
            <Text style={{ color: palette.primary, fontSize: 12, flex: 1, lineHeight: 18 }}>
              Use realistic delays (30-60s) to avoid flood limits. Each account can add ~40 members/day.
            </Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            onPress={handleStart}
          >
            <MaterialIcons name="play-arrow" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Start Task</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
