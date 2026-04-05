import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

export default function LicenseDashboardScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];

  const DETAILS = [
    { label: 'License Tier', value: 'Professional', icon: 'star' as const },
    { label: 'Status', value: 'Active', icon: 'check-circle' as const, valueColor: palette.success },
    { label: 'Expires', value: 'Never (Lifetime)', icon: 'calendar-today' as const },
    { label: 'Max Accounts', value: '1000', icon: 'people' as const },
    { label: 'Max Windows', value: 'Unlimited', icon: 'tab' as const },
    { label: 'Device ID', value: 'This Device', icon: 'phone-android' as const },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Account</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>License</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}>
          {/* Hero */}
          <LinearGradient
            colors={['#4C1D95', '#6D28D9', '#8B5CF6']}
            style={{ borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 }}
          >
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="verified" size={36} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>FALKON PRO</Text>
            <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Professional License</Text>
            </View>
          </LinearGradient>

          {/* Details */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
            {DETAILS.map((item, i) => (
              <View key={item.label}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
                  <MaterialIcons name={item.icon} size={18} color={palette.primary} />
                  <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{item.label}</Text>
                  <Text style={{ color: item.valueColor ?? palette.foreground, fontSize: 13, fontWeight: '700' }}>{item.value}</Text>
                </View>
                {i < DETAILS.length - 1 && <View style={{ height: 1, backgroundColor: palette.border, marginLeft: 46 }} />}
              </View>
            ))}
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={{ backgroundColor: palette.primary + '15', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: palette.primary + '40', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            onPress={() => router.push('/license-activation' as any)}
          >
            <MaterialIcons name="refresh" size={18} color={palette.primary} />
            <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '700' }}>Re-activate / Change Key</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
