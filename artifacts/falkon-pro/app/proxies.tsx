import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';

const PROXIES_STORAGE_KEY = '@falkon_proxies';
const ACCOUNT_PROXY_KEY = '@falkon_account_proxy';

export interface ProxyConfig {
  id: string;
  host: string;
  port: string;
  type: 'socks5' | 'http' | 'mtproto';
  username?: string;
  password?: string;
  secret?: string;
  status: 'active' | 'dead' | 'testing';
  createdAt: string;
}

const STATUS_COLOR: Record<ProxyConfig['status'], string> = {
  active: '#34D399',
  dead: '#F87171',
  testing: '#FBBF24',
};

export default function ProxiesScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { activeAccounts } = useAccountsStore();

  const [proxies, setProxies] = useState<ProxyConfig[]>([]);
  const [accountProxyMap, setAccountProxyMap] = useState<Record<string, string>>({}); // accountId → proxyId
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Form fields
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [type, setType] = useState<ProxyConfig['type']>('socks5');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');

  const setProxyMutation = trpc.proxy.setAccountProxy.useMutation();

  // Load from AsyncStorage
  const loadProxies = useCallback(async () => {
    try {
      const [proxiesRaw, mapRaw] = await Promise.all([
        AsyncStorage.getItem(PROXIES_STORAGE_KEY),
        AsyncStorage.getItem(ACCOUNT_PROXY_KEY),
      ]);
      if (proxiesRaw) setProxies(JSON.parse(proxiesRaw));
      if (mapRaw) setAccountProxyMap(JSON.parse(mapRaw));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveProxies = useCallback(async (updated: ProxyConfig[]) => {
    await AsyncStorage.setItem(PROXIES_STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const saveMap = useCallback(async (updated: Record<string, string>) => {
    await AsyncStorage.setItem(ACCOUNT_PROXY_KEY, JSON.stringify(updated));
  }, []);

  useEffect(() => { loadProxies(); }, [loadProxies]);

  const addProxy = async () => {
    if (!host.trim() || !port.trim()) {
      Alert.alert('بيانات مفقودة', 'الهوست والمنفذ مطلوبان');
      return;
    }
    if (isNaN(parseInt(port)) || parseInt(port) < 1 || parseInt(port) > 65535) {
      Alert.alert('منفذ غير صالح', 'أدخل رقماً بين 1 و 65535');
      return;
    }

    const newProxy: ProxyConfig = {
      id: `prx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      host: host.trim(),
      port: port.trim(),
      type,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      secret: secret.trim() || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const updated = [...proxies, newProxy];
    setProxies(updated);
    await saveProxies(updated);

    setHost(''); setPort(''); setUsername(''); setPassword(''); setSecret('');
    setShowAdd(false);
    Alert.alert('تم', `بروكسي ${type.toUpperCase()} أُضيف بنجاح`);
  };

  const deleteProxy = (id: string) => {
    Alert.alert('حذف البروكسي', 'هل تريد حذف هذا البروكسي؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          const updated = proxies.filter((p) => p.id !== id);
          setProxies(updated);
          await saveProxies(updated);
          // Remove assignment for any accounts using this proxy
          const newMap = { ...accountProxyMap };
          Object.entries(newMap).forEach(([accId, pId]) => {
            if (pId === id) delete newMap[accId];
          });
          setAccountProxyMap(newMap);
          await saveMap(newMap);
        },
      },
    ]);
  };

  const assignProxyToAccount = async (accountId: string, proxyId: string | null) => {
    const newMap = { ...accountProxyMap };
    if (proxyId === null) {
      delete newMap[accountId];
    } else {
      newMap[accountId] = proxyId;
    }
    setAccountProxyMap(newMap);
    await saveMap(newMap);

    // Register with server so it uses the proxy on next connection
    const proxy = proxyId ? proxies.find((p) => p.id === proxyId) : null;
    try {
      await setProxyMutation.mutateAsync({
        accountId,
        proxy: proxy ? {
          host: proxy.host,
          port: parseInt(proxy.port),
          type: proxy.type,
          username: proxy.username,
          password: proxy.password,
          secret: proxy.secret,
        } : null,
      });
    } catch {
      // Non-fatal — server-side proxy cache will be set on next operation
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>شبكة</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>مدير البروكسي</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => setShowAdd(!showAdd)}
          >
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{showAdd ? 'إلغاء' : 'إضافة'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 14 }}>

          {/* Add Form */}
          {showAdd && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>إضافة بروكسي جديد</Text>

              {/* Type */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['socks5', 'http', 'mtproto'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: type === t ? palette.primary : palette.background, borderWidth: 1, borderColor: type === t ? palette.primary : palette.border, alignItems: 'center' }}
                    onPress={() => setType(t)}
                  >
                    <Text style={{ color: type === t ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput value={host} onChangeText={setHost} placeholder="Host / IP" placeholderTextColor={palette.muted} autoCapitalize="none" autoCorrect={false} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={port} onChangeText={setPort} placeholder="Port (1-65535)" placeholderTextColor={palette.muted} keyboardType="numeric" style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={username} onChangeText={setUsername} placeholder="اسم المستخدم (اختياري)" placeholderTextColor={palette.muted} autoCapitalize="none" style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور (اختياري)" placeholderTextColor={palette.muted} secureTextEntry style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              {type === 'mtproto' && (
                <TextInput value={secret} onChangeText={setSecret} placeholder="السر (MTProto Secret)" placeholderTextColor={palette.muted} autoCapitalize="none" style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              )}

              <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={addProxy}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>إضافة البروكسي</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Anti-Ban tip */}
          <View style={{ backgroundColor: '#8B5CF620', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#8B5CF640', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <MaterialIcons name="security" size={16} color="#8B5CF6" />
            <Text style={{ color: palette.muted, fontSize: 11, flex: 1, lineHeight: 16 }}>
              خصّص بروكسي لكل حساب لإخفاء عناوين IP المختلفة عن تيليغرام. يُقلّل هذا PeerFlood بشكل كبير ويحمي حساباتك من الحظر الجماعي.
            </Text>
          </View>

          {/* Proxies List */}
          {proxies.length === 0 && !showAdd ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <MaterialIcons name="vpn-key" size={56} color={palette.muted} />
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>لا توجد بروكسيات</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                أضف بروكسيات SOCKS5 أو HTTP أو MTProto لتقليل خطر الحظر وتعزيز الحماية
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>البروكسيات ({proxies.length})</Text>
              {proxies.map((proxy) => (
                <View
                  key={proxy.id}
                  style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: STATUS_COLOR[proxy.status] + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="vpn-key" size={18} color={STATUS_COLOR[proxy.status]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{proxy.host}:{proxy.port}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{proxy.type.toUpperCase()}{proxy.username ? ` • ${proxy.username}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: STATUS_COLOR[proxy.status] + '20' }}>
                        <Text style={{ color: STATUS_COLOR[proxy.status], fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>{proxy.status}</Text>
                      </View>
                      <TouchableOpacity onPress={() => deleteProxy(proxy.id)}>
                        <MaterialIcons name="delete-outline" size={18} color="#F87171" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Account assignment */}
                  {activeAccounts.length > 0 && (
                    <View style={{ gap: 6 }}>
                      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600' }}>تعيين للحساب:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {activeAccounts.map((acc) => {
                          const isAssigned = accountProxyMap[acc.id] === proxy.id;
                          return (
                            <TouchableOpacity
                              key={acc.id}
                              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: isAssigned ? palette.primary : palette.background, borderWidth: 1, borderColor: isAssigned ? palette.primary : palette.border }}
                              onPress={() => assignProxyToAccount(acc.id, isAssigned ? null : proxy.id)}
                            >
                              <Text style={{ color: isAssigned ? '#fff' : palette.muted, fontSize: 11, fontWeight: '600' }}>
                                {isAssigned ? '✓ ' : ''}{acc.firstName || acc.phone}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Account → Proxy Summary */}
          {activeAccounts.length > 0 && Object.keys(accountProxyMap).length > 0 && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
              <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>ملخص التعيينات</Text>
              {activeAccounts.map((acc) => {
                const proxyId = accountProxyMap[acc.id];
                const proxy = proxyId ? proxies.find((p) => p.id === proxyId) : null;
                return (
                  <View key={acc.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: palette.foreground, fontSize: 12 }}>{acc.firstName || acc.phone}</Text>
                    <Text style={{ color: proxy ? '#34D399' : palette.muted, fontSize: 11, fontWeight: '600' }}>
                      {proxy ? `${proxy.host}:${proxy.port} (${proxy.type})` : 'بدون بروكسي'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
