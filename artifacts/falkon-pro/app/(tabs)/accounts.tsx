import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

const STATUS_COLOR = {
  active: '#34D399',
  inactive: '#9CA3AF',
  banned: '#F87171',
  flood: '#FBBF24',
} as const;

type AuthStep = 'idle' | 'enter_phone' | 'enter_code' | 'enter_password' | 'success';

export default function AccountsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [search, setSearch] = useState('');
  const [authStep, setAuthStep] = useState<AuthStep>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const accountsQuery = trpc.accounts.list.useQuery(undefined, { refetchInterval: 5000 });
  const startAuthMut = trpc.accounts.startAuth.useMutation();
  const confirmAuthMut = trpc.accounts.confirmAuth.useMutation();
  const resendMut = trpc.accounts.resendCode.useMutation();
  const removeMut = trpc.accounts.remove.useMutation();

  const accounts = accountsQuery.data?.accounts ?? [];
  const filtered = accounts.filter((a) =>
    !search || a.phone.includes(search) || a.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartAuth = useCallback(async () => {
    if (!phone.trim()) return Alert.alert('Error', 'Enter a phone number with country code (e.g. +1234567890)');
    setAuthLoading(true);
    try {
      const result = await startAuthMut.mutateAsync({ phone: phone.trim() });
      setSessionId(result.sessionId);
      setAuthStep('enter_code');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send code');
    } finally {
      setAuthLoading(false);
    }
  }, [phone]);

  const handleConfirmCode = useCallback(async () => {
    if (!code.trim()) return Alert.alert('Error', 'Enter the verification code');
    setAuthLoading(true);
    try {
      await confirmAuthMut.mutateAsync({ sessionId, code: code.trim() });
      setAuthStep('success');
      accountsQuery.refetch();
      setTimeout(() => {
        setAuthStep('idle');
        setPhone(''); setCode(''); setPassword(''); setSessionId('');
      }, 2000);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('PASSWORD_NEEDED') || msg.includes('SESSION_PASSWORD')) {
        setAuthStep('enter_password');
      } else {
        Alert.alert('Error', msg || 'Invalid code');
      }
    } finally {
      setAuthLoading(false);
    }
  }, [sessionId, code]);

  const handleConfirmPassword = useCallback(async () => {
    if (!password.trim()) return Alert.alert('Error', 'Enter your 2FA password');
    setAuthLoading(true);
    try {
      await confirmAuthMut.mutateAsync({ sessionId, code: code.trim(), password: password.trim() });
      setAuthStep('success');
      accountsQuery.refetch();
      setTimeout(() => {
        setAuthStep('idle');
        setPhone(''); setCode(''); setPassword(''); setSessionId('');
      }, 2000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Wrong password');
    } finally {
      setAuthLoading(false);
    }
  }, [sessionId, code, password]);

  const handleRemove = useCallback(async (id: string) => {
    Alert.alert('Remove Account', 'Are you sure you want to remove this account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMut.mutateAsync({ id });
            accountsQuery.refetch();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  }, []);

  const renderAuthModal = () => (
    <Modal visible={authStep !== 'idle'} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 }}>
          {authStep === 'success' ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#34D39920', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="check-circle" size={36} color="#34D399" />
              </View>
              <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>Account Added!</Text>
              <Text style={{ color: palette.muted, fontSize: 14 }}>Telegram account connected successfully</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '800' }}>
                  {authStep === 'enter_phone' ? 'Add Telegram Account' :
                   authStep === 'enter_code' ? 'Enter Verification Code' :
                   'Two-Factor Password'}
                </Text>
                <TouchableOpacity onPress={() => { setAuthStep('idle'); setPhone(''); setCode(''); setPassword(''); }}>
                  <MaterialIcons name="close" size={22} color={palette.muted} />
                </TouchableOpacity>
              </View>

              {authStep === 'enter_phone' && (
                <>
                  <Text style={{ color: palette.muted, fontSize: 13 }}>
                    Enter your phone number with country code. Telegram will send a verification code.
                  </Text>
                  <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 234 567 8900"
                      placeholderTextColor={palette.muted}
                      keyboardType="phone-pad"
                      style={{ color: palette.foreground, fontSize: 16 }}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: palette.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: authLoading ? 0.7 : 1 }}
                    onPress={handleStartAuth}
                    disabled={authLoading}
                  >
                    {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Send Code</Text>}
                  </TouchableOpacity>
                </>
              )}

              {authStep === 'enter_code' && (
                <>
                  <Text style={{ color: palette.muted, fontSize: 13 }}>
                    A code was sent to <Text style={{ color: palette.foreground, fontWeight: '700' }}>{phone}</Text> via Telegram app or SMS.
                  </Text>
                  <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <TextInput
                      value={code}
                      onChangeText={setCode}
                      placeholder="12345"
                      placeholderTextColor={palette.muted}
                      keyboardType="number-pad"
                      maxLength={10}
                      style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', letterSpacing: 4, textAlign: 'center' }}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: palette.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: authLoading ? 0.7 : 1 }}
                    onPress={handleConfirmCode}
                    disabled={authLoading}
                  >
                    {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Verify Code</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => resendMut.mutate({ sessionId })} style={{ alignItems: 'center' }}>
                    <Text style={{ color: palette.primary, fontSize: 13 }}>Resend Code</Text>
                  </TouchableOpacity>
                </>
              )}

              {authStep === 'enter_password' && (
                <>
                  <Text style={{ color: palette.muted, fontSize: 13 }}>
                    This account has Two-Factor Authentication enabled. Enter your 2FA password.
                  </Text>
                  <View style={{ backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="2FA Password"
                      placeholderTextColor={palette.muted}
                      secureTextEntry
                      style={{ color: palette.foreground, fontSize: 16 }}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: palette.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: authLoading ? 0.7 : 1 }}
                    onPress={handleConfirmPassword}
                    disabled={authLoading}
                  >
                    {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Confirm</Text>}
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Telegram</Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Accounts</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            onPress={() => setAuthStep('enter_phone')}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <MaterialIcons name="search" size={18} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search accounts..."
              placeholderTextColor={palette.muted}
              style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 10 }}
            />
          </View>
        </View>

        {accountsQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={palette.primary} size="large" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="people-outline" size={32} color={palette.primary} />
                </View>
                <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No accounts yet</Text>
                <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                  {search ? 'No accounts match your search' : 'Add your Telegram account to start automating'}
                </Text>
                {!search && (
                  <TouchableOpacity
                    style={{ marginTop: 8, backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                    onPress={() => setAuthStep('enter_phone')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>+ Add Account</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filtered.map((account) => (
                <View
                  key={account.id}
                  style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: palette.primary, fontSize: 15, fontWeight: '800' }}>
                      {(account.firstName?.[0] || account.phone.slice(-2)).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
                      {account.firstName} {account.lastName}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>
                      {account.phone}{account.username ? ` · @${account.username}` : ''}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>
                      Added today: {account.dailyAdded} members
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: (account.isActive ? '#34D399' : '#9CA3AF') + '20' }}>
                      <Text style={{ color: account.isActive ? '#34D399' : '#9CA3AF', fontSize: 10, fontWeight: '700' }}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemove(account.id)}>
                      <MaterialIcons name="delete-outline" size={18} color="#F87171" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      {renderAuthModal()}
    </View>
  );
}
