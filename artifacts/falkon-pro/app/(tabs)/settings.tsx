import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useThemeContext } from '@/lib/theme-provider';

function SettingRow({
  icon,
  iconColor,
  label,
  value,
  onPress,
  rightElement,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const palette = colors[scheme];

  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
      }}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconColor + '20', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {value ? <Text style={{ color: palette.muted, fontSize: 12, marginTop: 1 }}>{value}</Text> : null}
      </View>
      {rightElement ?? <MaterialIcons name="chevron-right" size={18} color={palette.muted} />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { colorScheme, setColorScheme } = useThemeContext();
  const [notifications, setNotifications] = useState(true);

  const handleThemeToggle = () => {
    setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
  };

  const handleClearCache = () => {
    Alert.alert('Clear Cache', 'This will clear all cached data. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {} },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => {} },
    ]);
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 }}>
      {title}
    </Text>
  );

  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <View style={{ marginHorizontal: 20, backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', gap: 0 }}>
      {children}
    </View>
  );

  const Divider = () => (
    <View style={{ height: 1, backgroundColor: palette.border, marginLeft: 62 }} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>App</Text>
          <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Settings</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Profile */}
          <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <View style={{
              backgroundColor: palette.surface,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="person" size={26} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '800' }}>FALKON PRO User</Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>License: Active</Text>
              </View>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.primary + '20' }}
                onPress={() => router.push('/license-dashboard' as any)}
              >
                <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>License</Text>
              </TouchableOpacity>
            </View>
          </View>

          <SectionHeader title="Appearance" />
          <SectionCard>
            <SettingRow
              icon="nightlight"
              iconColor={palette.primary}
              label="Dark Mode"
              value={colorScheme === 'dark' ? 'On' : 'Off'}
              rightElement={
                <Switch
                  value={colorScheme === 'dark'}
                  onValueChange={handleThemeToggle}
                  trackColor={{ false: palette.border, true: palette.primary }}
                  thumbColor="#fff"
                />
              }
            />
          </SectionCard>

          <SectionHeader title="Notifications" />
          <SectionCard>
            <SettingRow
              icon="notifications"
              iconColor="#60A5FA"
              label="Push Notifications"
              rightElement={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: palette.border, true: palette.primary }}
                  thumbColor="#fff"
                />
              }
            />
          </SectionCard>

          <SectionHeader title="License" />
          <SectionCard>
            <SettingRow icon="verified" iconColor="#34D399" label="License Dashboard" onPress={() => router.push('/license-dashboard' as any)} />
            <Divider />
            <SettingRow icon="card-membership" iconColor="#FBBF24" label="Activate License" onPress={() => router.push('/license-activation' as any)} />
          </SectionCard>

          <SectionHeader title="Advanced" />
          <SectionCard>
            <SettingRow icon="code" iconColor="#818CF8" label="Developer Dashboard" onPress={() => router.push('/developer-dashboard' as any)} />
            <Divider />
            <SettingRow icon="delete-sweep" iconColor="#F87171" label="Clear Cache" onPress={handleClearCache} />
            <Divider />
            <SettingRow icon="info" iconColor={palette.muted} label="Version" value="1.0.0" />
          </SectionCard>

          <View style={{ height: 20 }} />
          <View style={{ marginHorizontal: 20 }}>
            <TouchableOpacity
              style={{
                backgroundColor: palette.error + '10',
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: palette.error + '30',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={handleLogout}
            >
              <MaterialIcons name="logout" size={18} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 14, fontWeight: '700' }}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
