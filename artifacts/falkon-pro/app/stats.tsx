import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const PERIODS = ['Today', 'Week', 'Month', 'All Time'] as const;

const METRICS = [
  { label: 'Members Extracted', value: '0', icon: 'download' as const, color: '#8B5CF6' },
  { label: 'Members Added', value: '0', icon: 'person-add' as const, color: '#34D399' },
  { label: 'Messages Sent', value: '0', icon: 'send' as const, color: '#60A5FA' },
  { label: 'Accounts Used', value: '0', icon: 'people' as const, color: '#FBBF24' },
  { label: 'Tasks Completed', value: '0', icon: 'check-circle' as const, color: '#F472B6' },
  { label: 'Errors', value: '0', icon: 'error' as const, color: '#F87171' },
];

export default function StatsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [period, setPeriod] = useState<typeof PERIODS[number]>('Today');

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Analytics</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Statistics</Text>
          </View>
        </View>

        {/* Period Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: period === p ? palette.primary : palette.surface,
                borderWidth: 1,
                borderColor: period === p ? palette.primary : palette.border,
              }}
              onPress={() => setPeriod(p)}
            >
              <Text style={{ color: period === p ? '#fff' : palette.muted, fontSize: 13, fontWeight: '600' }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {/* Summary Banner */}
          <LinearGradient
            colors={['#1E1B4B', '#2D1B69', '#4C1D95']}
            style={{ borderRadius: 20, padding: 20, marginBottom: 20 }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              Performance Score
            </Text>
            <Text style={{ color: '#fff', fontSize: 48, fontWeight: '900', marginTop: 4 }}>0%</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>
              No data yet for {period.toLowerCase()}
            </Text>
          </LinearGradient>

          {/* Metrics Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {METRICS.map((m) => (
              <View
                key={m.label}
                style={{
                  width: (width - 50) / 2,
                  backgroundColor: palette.surface,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: m.color + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <MaterialIcons name={m.icon} size={18} color={m.color} />
                </View>
                <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '900' }}>{m.value}</Text>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* Empty Chart Area */}
          <View style={{ marginTop: 20, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 24, alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="insert-chart" size={42} color={palette.muted} />
            <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
              Charts will appear here once you have task data
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
