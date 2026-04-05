import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useWindowManager } from '@/lib/window-manager';

export default function ExtractionScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [targetGroup, setTargetGroup] = useState('');
  const [limit, setLimit] = useState('500');
  const [filterOnline, setFilterOnline] = useState(false);
  const { createWindow } = useWindowManager();

  const handleStart = () => {
    if (!targetGroup.trim()) {
      Alert.alert('Missing Input', 'Please enter a group username or link');
      return;
    }
    const windowId = createWindow({ title: `Extract: ${targetGroup}`, taskType: 'extraction', metadata: { targetGroup, limit, filterOnline } });
    router.push('/windows' as any);
    Alert.alert('Extraction Started', `Task launched in window ${windowId.slice(0, 8)}...`);
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
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Member Extraction</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Target Group</Text>
            <TextInput
              value={targetGroup}
              onChangeText={setTargetGroup}
              placeholder="@groupname or t.me/link"
              placeholderTextColor={palette.muted}
              style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
            />
          </View>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Extraction Limit</Text>
            <TextInput
              value={limit}
              onChangeText={setLimit}
              placeholder="500"
              placeholderTextColor={palette.muted}
              keyboardType="numeric"
              style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
            />
          </View>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Filter Online Only</Text>
              <Text style={{ color: palette.muted, fontSize: 12 }}>Only extract recently active members</Text>
            </View>
            <TouchableOpacity
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: filterOnline ? palette.primary : palette.border, justifyContent: 'center', paddingHorizontal: 2 }}
              onPress={() => setFilterOnline(!filterOnline)}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: filterOnline ? 'flex-end' : 'flex-start' }} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            onPress={handleStart}
          >
            <MaterialIcons name="play-arrow" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Start Extraction</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
