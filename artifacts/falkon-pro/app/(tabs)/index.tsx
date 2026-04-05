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

const { width } = Dimensions.get('window');

const STAT_CARDS = [
  { label: 'Active Accounts', value: '0', icon: 'people' as const, color: '#8B5CF6', change: '+0%' },
  { label: 'Tasks Running', value: '0', icon: 'play-circle-filled' as const, color: '#34D399', change: '+0%' },
  { label: 'Messages Sent', value: '0', icon: 'send' as const, color: '#60A5FA', change: '+0%' },
  { label: 'Proxies Active', value: '0', icon: 'vpn-key' as const, color: '#FBBF24', change: '+0%' },
];

const QUICK_ACTIONS = [
  { label: 'Accounts', icon: 'people' as const, route: '/(tabs)/accounts', color: '#8B5CF6' },
  { label: 'Tasks', icon: 'assignment' as const, route: '/(tabs)/tasks', color: '#34D399' },
  { label: 'Tools', icon: 'build' as const, route: '/(tabs)/tools', color: '#60A5FA' },
  { label: 'Windows', icon: 'tab' as const, route: '/windows', color: '#FBBF24' },
  { label: 'Stats', icon: 'bar-chart' as const, route: '/stats', color: '#F87171' },
  { label: 'Settings', icon: 'settings' as const, route: '/(tabs)/settings', color: '#A78BFA' },
];

export default function DashboardScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1.2 }}>
              FALKON PRO
            </Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>
              Dashboard
            </Text>
          </View>
          <TouchableOpacity
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: palette.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <MaterialIcons name="notifications-none" size={18} color={palette.muted} />
          </TouchableOpacity>
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
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 20 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                    System Status
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>
                    All Systems Go
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>
                    0 active operations • 0 queued tasks
                  </Text>
                </View>
                <View style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <MaterialIcons name="local-fire-department" size={28} color="#fff" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                {[
                  { label: 'Online', value: '0 accounts' },
                  { label: 'Uptime', value: '99.9%' },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </Text>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                      {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </View>

          {/* Stat Cards */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Overview
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {STAT_CARDS.map((card) => (
                <View
                  key={card.label}
                  style={{
                    width: (width - 50) / 2,
                    backgroundColor: palette.surface,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: palette.border,
                  }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: card.color + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <MaterialIcons name={card.icon} size={18} color={card.color} />
                  </View>
                  <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>
                    {card.value}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>
                    {card.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <MaterialIcons name="trending-up" size={12} color={palette.success} />
                    <Text style={{ color: palette.success, fontSize: 10, fontWeight: '700', marginLeft: 2 }}>
                      {card.change}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Quick Actions */}
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Quick Access
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={{
                    width: (width - 50) / 3,
                    alignItems: 'center',
                    backgroundColor: palette.surface,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: palette.border,
                  }}
                  onPress={() => router.push(action.route as any)}
                >
                  <View style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: action.color + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}>
                    <MaterialIcons name={action.icon} size={20} color={action.color} />
                  </View>
                  <Text style={{ color: palette.foreground, fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recent Activity */}
          <View style={{ marginHorizontal: 20 }}>
            <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Recent Activity
            </Text>
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: palette.border,
              padding: 24,
              alignItems: 'center',
              gap: 8,
            }}>
              <MaterialIcons name="history" size={36} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                No recent activity yet.{'\n'}Start by adding accounts and running tasks.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
