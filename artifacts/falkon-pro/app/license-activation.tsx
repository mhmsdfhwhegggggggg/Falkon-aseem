import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

export default function LicenseActivationScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    if (!key.trim() || key.trim().length < 16) {
      Alert.alert('Invalid Key', 'Please enter a valid license key');
      return;
    }
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      Alert.alert('Success', 'License activated successfully!', [
        { text: 'Continue', onPress: () => router.replace('/') },
      ]);
    } catch {
      Alert.alert('Activation Failed', 'Could not activate license. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBypass = () => {
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}
        >
          {/* Hero */}
          <View style={{ alignItems: 'center', paddingTop: 60, marginBottom: 40 }}>
            <LinearGradient
              colors={['#4C1D95', '#6D28D9', '#8B5CF6']}
              style={{ width: 100, height: 100, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}
            >
              <MaterialIcons name="verified" size={52} color="#fff" />
            </LinearGradient>
            <Text style={{ color: palette.foreground, fontSize: 28, fontWeight: '900', textAlign: 'center' }}>
              FALKON PRO
            </Text>
            <Text style={{ color: palette.muted, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
              Enter your license key to unlock{'\n'}all professional features
            </Text>
          </View>

          {/* License Key Input */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>License Key</Text>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: palette.surface,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: key.length > 0 ? palette.primary : palette.border,
              paddingHorizontal: 14,
              gap: 10,
            }}>
              <MaterialIcons name="key" size={18} color={key.length > 0 ? palette.primary : palette.muted} />
              <TextInput
                value={key}
                onChangeText={setKey}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                style={{ flex: 1, color: palette.foreground, fontSize: 15, paddingVertical: 14, letterSpacing: 2, fontWeight: '700' }}
              />
              {key.length > 0 && (
                <TouchableOpacity onPress={() => setKey('')}>
                  <MaterialIcons name="close" size={16} color={palette.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Activate Button */}
          <TouchableOpacity
            style={{ opacity: loading ? 0.7 : 1 }}
            onPress={handleActivate}
            disabled={loading}
          >
            <LinearGradient
              colors={['#6D28D9', '#8B5CF6', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <MaterialIcons name="verified" size={20} color="#fff" />
              }
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                {loading ? 'Activating...' : 'Activate License'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Features */}
          <View style={{ marginTop: 32, gap: 12 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
              What you get
            </Text>
            {[
              { icon: 'people' as const, text: '1000+ concurrent account management' },
              { icon: 'tab' as const, text: 'Multi-window parallel execution' },
              { icon: 'speed' as const, text: 'High-performance bulk operations' },
              { icon: 'security' as const, text: 'Advanced anti-ban protection' },
              { icon: 'support-agent' as const, text: 'Priority support' },
            ].map((f) => (
              <View key={f.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name={f.icon} size={16} color={palette.primary} />
                </View>
                <Text style={{ color: palette.foreground, fontSize: 14, flex: 1 }}>{f.text}</Text>
                <MaterialIcons name="check" size={16} color={palette.success} />
              </View>
            ))}
          </View>

          {process.env.EXPO_PUBLIC_ENABLE_LICENSE_CHECK === 'false' && (
            <TouchableOpacity
              style={{ marginTop: 24, padding: 14, alignItems: 'center' }}
              onPress={handleBypass}
            >
              <Text style={{ color: palette.muted, fontSize: 13 }}>Continue without license (dev mode)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
