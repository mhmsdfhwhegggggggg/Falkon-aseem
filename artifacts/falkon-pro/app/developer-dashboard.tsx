import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

const TABS = ['Overview', 'Logs', 'API Test', 'Queue'] as const;

export default function DeveloperDashboardScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');
  const [apiEndpoint, setApiEndpoint] = useState('/api/trpc/accounts.list');
  const [apiResponse, setApiResponse] = useState<string | null>(null);

  const runApiTest = async () => {
    setApiResponse('Loading...');
    try {
      const res = await fetch(apiEndpoint);
      const text = await res.text();
      setApiResponse(text.slice(0, 500));
    } catch (err: any) {
      setApiResponse(`Error: ${err.message}`);
    }
  };

  const ENV_VARS = [
    { key: 'NODE_ENV', value: process.env.NODE_ENV ?? 'unknown' },
    { key: 'EXPO_PUBLIC_API_BASE_URL', value: process.env.EXPO_PUBLIC_API_BASE_URL ?? '(not set)' },
    { key: 'EXPO_PUBLIC_ENABLE_LICENSE_CHECK', value: process.env.EXPO_PUBLIC_ENABLE_LICENSE_CHECK ?? 'true' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Developer</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Dashboard</Text>
          </View>
          <View style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.warning + '20' }}>
            <Text style={{ color: palette.warning, fontSize: 10, fontWeight: '800' }}>DEV</Text>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: tab === t ? palette.primary : palette.surface, borderWidth: 1, borderColor: tab === t ? palette.primary : palette.border }} onPress={() => setTab(t)}>
              <Text style={{ color: tab === t ? '#fff' : palette.muted, fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 14 }}>
          {tab === 'Overview' && (
            <>
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>Environment Variables</Text>
                {ENV_VARS.map((e, i) => (
                  <View key={e.key}>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                      <Text style={{ color: palette.primary, fontSize: 12, fontFamily: 'monospace', fontWeight: '600' }}>{e.key}</Text>
                      <Text style={{ color: palette.foreground, fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{e.value}</Text>
                    </View>
                    {i < ENV_VARS.length - 1 && <View style={{ height: 1, backgroundColor: palette.border, marginLeft: 16 }} />}
                  </View>
                ))}
              </View>

              <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 8 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>App Info</Text>
                {[
                  { label: 'Version', value: '1.0.0' },
                  { label: 'Build', value: 'expo-54' },
                  { label: 'Platform', value: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 40) ?? 'Unknown' : 'Native' },
                ].map((info) => (
                  <View key={info.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>{info.label}</Text>
                    <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600' }}>{info.value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {tab === 'API Test' && (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
                <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Test API Endpoint</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={apiEndpoint}
                    onChangeText={setApiEndpoint}
                    style={{ flex: 1, backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 12, fontFamily: 'monospace' }}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                    onPress={runApiTest}
                  >
                    <MaterialIcons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              {apiResponse !== null && (
                <View style={{ backgroundColor: '#0D1117', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#30363D' }}>
                  <Text style={{ color: '#E6EDF3', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 }}>{apiResponse}</Text>
                </View>
              )}
            </View>
          )}

          {tab === 'Logs' && (
            <View style={{ backgroundColor: '#0D1117', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#30363D' }}>
              <Text style={{ color: '#7EE787', fontSize: 11, fontFamily: 'monospace' }}>
                {'[INFO] FALKON PRO started\n[INFO] Theme: dark\n[INFO] License check: enabled\n[INFO] Ready'}
              </Text>
            </View>
          )}

          {tab === 'Queue' && (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
              <MaterialIcons name="queue" size={42} color={palette.muted} />
              <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700' }}>Queue Empty</Text>
              <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>
                No jobs currently in queue. Start a task to see jobs appear here.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
