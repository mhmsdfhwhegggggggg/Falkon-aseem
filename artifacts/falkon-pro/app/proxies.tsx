import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

interface Proxy {
  id: string;
  host: string;
  port: string;
  type: 'socks5' | 'http' | 'mtproto';
  status: 'active' | 'dead' | 'testing';
  username?: string;
  password?: string;
}

const STATUS_COLOR: Record<Proxy['status'], string> = {
  active: '#34D399',
  dead: '#F87171',
  testing: '#FBBF24',
};

export default function ProxiesScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [type, setType] = useState<Proxy['type']>('socks5');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const addProxy = () => {
    if (!host.trim() || !port.trim()) {
      Alert.alert('Missing Fields', 'Host and port are required');
      return;
    }
    setProxies(prev => [...prev, {
      id: Date.now().toString(),
      host: host.trim(),
      port: port.trim(),
      type,
      status: 'testing',
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    }]);
    setHost(''); setPort(''); setUsername(''); setPassword('');
    setShowAdd(false);
  };

  const deleteProxy = (id: string) => {
    setProxies(prev => prev.filter(p => p.id !== id));
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Network</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Proxy Manager</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => setShowAdd(!showAdd)}
          >
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{showAdd ? 'Cancel' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 12 }}>
          {showAdd && (
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
              <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Add Proxy</Text>
              {/* Proxy Type */}
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
              <TextInput value={host} onChangeText={setHost} placeholder="Host / IP" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={port} onChangeText={setPort} placeholder="Port" placeholderTextColor={palette.muted} keyboardType="numeric" style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={username} onChangeText={setUsername} placeholder="Username (optional)" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TextInput value={password} onChangeText={setPassword} placeholder="Password (optional)" placeholderTextColor={palette.muted} secureTextEntry style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }} />
              <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={addProxy}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Proxy</Text>
              </TouchableOpacity>
            </View>
          )}

          {proxies.length === 0 && !showAdd ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <MaterialIcons name="vpn-key" size={48} color={palette.muted} />
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No Proxies Added</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>Add SOCKS5, HTTP, or MTProto proxies to avoid account bans</Text>
            </View>
          ) : (
            proxies.map((proxy) => (
              <View
                key={proxy.id}
                style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
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
                    <MaterialIcons name="delete-outline" size={18} color={palette.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
