import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Vibration,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useDevAuth } from '@/lib/dev-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';

function CountdownTimer({ lockedUntil, onExpired }: { lockedUntil: number; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => {
      const rem = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setRemaining(rem);
      if (rem === 0) onExpired();
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lockedUntil, onExpired]);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return <Text style={{ color: '#F87171', fontSize: 24, fontWeight: '900', letterSpacing: 4 }}>{m}:{s.toString().padStart(2, '0')}</Text>;
}

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function DevAuthGate({ children, title = 'Developer Access', subtitle = 'Restricted area — authentication required' }: Props) {
  const { isAuthenticated, isPinSet, attemptsLeft, lockedUntil, isLoading, login, setPin } = useDevAuth();
  const scheme = useColorScheme();
  const palette = colors[scheme];

  const [pin, setPin2] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [now, setNow] = useState(Date.now());
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const shake = () => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const isLocked = lockedUntil && lockedUntil > now;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (isAuthenticated) return <>{children}</>;

  const handleLogin = async () => {
    if (working || isLocked) return;
    setWorking(true);
    setError('');
    const res = await login(pin);
    setWorking(false);
    if (!res.success) {
      setError(res.error ?? 'Authentication failed');
      setPin2('');
      shake();
    }
  };

  const handleSetPin = async () => {
    if (working) return;
    if (pin.trim().length < 4) {
      setError('PIN must be at least 4 characters');
      shake(); return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      shake(); return;
    }
    setWorking(true);
    setError('');
    const res = await setPin(null, pin);
    setWorking(false);
    if (!res.success) { setError(res.error ?? 'Failed to set PIN'); shake(); }
    else { setPin2(''); setConfirmPin(''); setIsSettingPin(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.muted} />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
          {/* Shield Icon */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <LinearGradient
              colors={['#1E1B4B', '#4C1D95']}
              style={{ width: 90, height: 90, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
            >
              <MaterialIcons name="security" size={44} color="#8B5CF6" />
            </LinearGradient>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{title}</Text>
            <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>{subtitle}</Text>
          </View>

          {/* Lockout State */}
          {isLocked ? (
            <View style={{ backgroundColor: palette.error + '15', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: palette.error + '40', alignItems: 'center', gap: 12 }}>
              <MaterialIcons name="lock" size={36} color={palette.error} />
              <Text style={{ color: palette.error, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Access Locked</Text>
              <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center' }}>Too many failed attempts. Try again in:</Text>
              <CountdownTimer lockedUntil={lockedUntil} onExpired={() => setNow(Date.now())} />
            </View>
          ) : !isPinSet || isSettingPin ? (
            /* Set PIN Mode */
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <MaterialIcons name="lock-open" size={18} color={palette.primary} />
                  <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '800' }}>
                    {isPinSet ? 'Change Developer PIN' : 'Set Developer PIN'}
                  </Text>
                </View>
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>
                  This PIN protects all developer features. Choose a strong, memorable PIN (min 4 chars).
                </Text>

                <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: error ? palette.error : palette.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="pin" size={16} color={palette.muted} />
                  <TextInput
                    value={pin}
                    onChangeText={(t) => { setPin2(t); setError(''); }}
                    placeholder="New PIN (min 4 chars)"
                    placeholderTextColor={palette.muted}
                    secureTextEntry
                    style={{ flex: 1, color: palette.foreground, fontSize: 16, paddingVertical: 14, letterSpacing: 4 }}
                  />
                </View>
                <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: error ? palette.error : palette.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="pin" size={16} color={palette.muted} />
                  <TextInput
                    value={confirmPin}
                    onChangeText={(t) => { setConfirmPin(t); setError(''); }}
                    placeholder="Confirm PIN"
                    placeholderTextColor={palette.muted}
                    secureTextEntry
                    style={{ flex: 1, color: palette.foreground, fontSize: 16, paddingVertical: 14, letterSpacing: 4 }}
                    onSubmitEditing={handleSetPin}
                  />
                </View>

                {error ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="error" size={14} color={palette.error} />
                    <Text style={{ color: palette.error, fontSize: 12, fontWeight: '600' }}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={{ backgroundColor: palette.primary, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={handleSetPin}
                  disabled={working}
                >
                  {working ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="check-circle" size={18} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {working ? 'Saving...' : 'Set PIN & Enter'}
                  </Text>
                </TouchableOpacity>

                {isPinSet && (
                  <TouchableOpacity onPress={() => { setIsSettingPin(false); setError(''); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          ) : (
            /* Login Mode */
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14 }}>
                <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '800' }}>Enter Developer PIN</Text>

                <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: error ? palette.error : palette.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="lock" size={16} color={palette.muted} />
                  <TextInput
                    value={pin}
                    onChangeText={(t) => { setPin2(t); setError(''); }}
                    placeholder="Enter PIN"
                    placeholderTextColor={palette.muted}
                    secureTextEntry
                    autoFocus
                    style={{ flex: 1, color: palette.foreground, fontSize: 20, paddingVertical: 14, letterSpacing: 6 }}
                    onSubmitEditing={handleLogin}
                  />
                </View>

                {error ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="error" size={14} color={palette.error} />
                    <Text style={{ color: palette.error, fontSize: 12, fontWeight: '600' }}>{error}</Text>
                  </View>
                ) : null}

                {attemptsLeft < MAX_ATTEMPTS && (
                  <View style={{ backgroundColor: palette.warning + '15', borderRadius: 8, padding: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <MaterialIcons name="warning" size={14} color={palette.warning} />
                    <Text style={{ color: palette.warning, fontSize: 11, fontWeight: '600' }}>
                      {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={{ backgroundColor: palette.primary, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={handleLogin}
                  disabled={working || !pin.trim()}
                >
                  {working ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="login" size={18} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {working ? 'Verifying...' : 'Authenticate'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setIsSettingPin(true); setError(''); setPin2(''); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>Forgot PIN? Reset it</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* Security Info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 }}>
            <MaterialIcons name="security" size={12} color={palette.muted} />
            <Text style={{ color: palette.muted, fontSize: 10 }}>End-to-end encrypted • Auto-locks after 5min</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
