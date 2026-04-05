import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import DevAuthGate from '@/components/DevAuthGate';
import { useDevAuth } from '@/lib/dev-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useTaskRunner } from '@/lib/task-runner';
import { useMembersStore } from '@/lib/members-store';

const TABS = ['Overview', 'API Tester', 'Logs', 'Security'] as const;
type Tab = typeof TABS[number];

const SYSTEM_METRICS = [
  { label: 'API Version', value: '2.0.0', icon: 'api' as const, color: '#8B5CF6' },
  { label: 'tRPC Build', value: 'v11 stable', icon: 'code' as const, color: '#60A5FA' },
  { label: 'Expo SDK', value: '53', icon: 'phone-android' as const, color: '#34D399' },
  { label: 'NativeWind', value: 'v4', icon: 'palette' as const, color: '#FBBF24' },
];

const SAMPLE_ENDPOINTS = [
  '/api/trpc/accounts.list',
  '/api/trpc/license.verify',
  '/api/trpc/members.getFiles',
  '/api/trpc/tasks.getRunning',
];

function OverviewTab({ palette }: { palette: any }) {
  const { tasks, activeTasks } = useTaskRunner();
  const { files, totalMembers } = useMembersStore();
  const [refreshing, setRefreshing] = useState(false);

  const stats = [
    { label: 'Member Files', value: files.length, icon: 'folder' as const, color: palette.primary },
    { label: 'Total Members', value: totalMembers, icon: 'people' as const, color: palette.info },
    { label: 'Active Tasks', value: activeTasks.length, icon: 'play-circle-filled' as const, color: palette.success },
    { label: 'Total Tasks', value: tasks.length, icon: 'assignment' as const, color: palette.warning },
    { label: 'Completed', value: tasks.filter((t) => t.status === 'completed').length, icon: 'check-circle' as const, color: palette.success },
    { label: 'Failed', value: tasks.filter((t) => t.status === 'error').length, icon: 'error' as const, color: palette.error },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }} tintColor={palette.primary} />}
      contentContainerStyle={{ gap: 14, paddingBottom: 20 }}
    >
      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>System Stack</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SYSTEM_METRICS.map((m) => (
            <View key={m.label} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '46%', flexShrink: 1 }}>
              <MaterialIcons name={m.icon} size={16} color={m.color} />
              <View>
                <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</Text>
                <Text style={{ color: palette.foreground, fontSize: 12, fontWeight: '700' }}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Live App Stats</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {stats.map((s) => (
            <View key={s.label} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', flexGrow: 1, minWidth: 80 }}>
              <MaterialIcons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={{ color: s.color, fontSize: 20, fontWeight: '900' }}>{s.value}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Environment</Text>
        {[
          { key: 'NODE_ENV', val: process.env.NODE_ENV ?? 'unknown' },
          { key: 'EXPO_PUBLIC_API_BASE_URL', val: process.env.EXPO_PUBLIC_API_BASE_URL ?? '(not set)' },
          { key: 'ENABLE_LICENSE_CHECK', val: process.env.EXPO_PUBLIC_ENABLE_LICENSE_CHECK ?? 'true' },
          { key: 'Timestamp (UTC)', val: new Date().toISOString() },
        ].map(({ key, val }) => (
          <View key={key} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <Text style={{ color: palette.muted, fontSize: 11, flex: 1 }}>{key}</Text>
            <Text style={{ color: palette.primary, fontSize: 11, maxWidth: '55%' }} numberOfLines={1}>{val}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Quick Navigation</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Task Monitor', icon: 'monitor' as const, route: '/tasks-monitor' },
            { label: 'Member Files', icon: 'folder-open' as const, route: '/members-files' },
            { label: 'License Mgmt', icon: 'verified' as const, route: '/license-dashboard' },
            { label: 'Proxies', icon: 'vpn-key' as const, route: '/proxies' },
          ].map((n) => (
            <TouchableOpacity key={n.label} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => router.push(n.route as any)}>
              <MaterialIcons name={n.icon} size={14} color={palette.primary} />
              <Text style={{ color: palette.foreground, fontSize: 12, fontWeight: '600' }}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function ApiTesterTab({ palette }: { palette: any }) {
  const [endpoint, setEndpoint] = useState(SAMPLE_ENDPOINTS[0]);
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [body, setBody] = useState('{\n  \n}');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const run = async () => {
    setLoading(true); setResponse(''); setStatus(null); setLatency(null);
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? body : undefined });
      const text = await res.text();
      setStatus(res.status); setLatency(Date.now() - t0);
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
    } catch (err: any) { setStatus(0); setLatency(Date.now() - t0); setResponse(`Error: ${err.message}`); }
    setLoading(false);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>HTTP Request</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['GET', 'POST'] as const).map((m) => (
            <TouchableOpacity key={m} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: method === m ? palette.primary : palette.background, borderWidth: 1, borderColor: method === m ? palette.primary : palette.border }} onPress={() => setMethod(m)}>
              <Text style={{ color: method === m ? '#fff' : palette.muted, fontSize: 11, fontWeight: '800' }}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={endpoint} onChangeText={setEndpoint} placeholder="Endpoint URL" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.primary, borderWidth: 1, borderColor: palette.border, fontSize: 11 }} autoCapitalize="none" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SAMPLE_ENDPOINTS.map((e) => (
            <TouchableOpacity key={e} style={{ backgroundColor: palette.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: palette.border }} onPress={() => setEndpoint(e)}>
              <Text style={{ color: palette.muted, fontSize: 10 }}>{e.split('/').pop()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {method === 'POST' && (
          <TextInput value={body} onChangeText={setBody} placeholder="JSON body" placeholderTextColor={palette.muted} multiline style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 11, minHeight: 80, textAlignVertical: 'top' }} />
        )}
        <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="play-arrow" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{loading ? 'Running...' : 'Send Request'}</Text>
        </TouchableOpacity>
      </View>
      {(response || status !== null) && (
        <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Response</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {latency !== null && <Text style={{ color: palette.muted, fontSize: 11 }}>{latency}ms</Text>}
              {status !== null && <Text style={{ color: status >= 200 && status < 300 ? palette.success : palette.error, fontSize: 11, fontWeight: '700' }}>HTTP {status}</Text>}
            </View>
          </View>
          <ScrollView style={{ maxHeight: 240, backgroundColor: palette.background, borderRadius: 10, padding: 10 }} showsVerticalScrollIndicator>
            <Text style={{ color: palette.success, fontSize: 11, lineHeight: 18 }}>{response}</Text>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

function LogsTab({ palette }: { palette: any }) {
  const { tasks } = useTaskRunner();
  const [selected, setSelected] = useState<string | null>(null);
  const task = tasks.find((t) => t.id === selected);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 10 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {tasks.length === 0 ? <Text style={{ color: palette.muted, fontSize: 12 }}>No tasks yet</Text> : tasks.map((t) => (
          <TouchableOpacity key={t.id} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: selected === t.id ? palette.primary : palette.surface, borderWidth: 1, borderColor: selected === t.id ? palette.primary : palette.border }} onPress={() => setSelected(t.id === selected ? null : t.id)}>
            <Text style={{ color: selected === t.id ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{t.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {task ? (
        <ScrollView style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.muted, fontSize: 10, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase' }}>{task.title} — {task.status.toUpperCase()} — {task.logs.length} entries</Text>
          {task.logs.map((log, i) => (
            <Text key={i} style={{ color: log.type === 'success' ? '#34D399' : log.type === 'error' ? '#F87171' : log.type === 'warning' ? '#FBBF24' : '#9CA3AF', fontSize: 10, lineHeight: 17 }}>
              [{log.time}] [{log.type.toUpperCase()}] {log.message}
            </Text>
          ))}
          {task.logs.length === 0 && <Text style={{ color: palette.muted, fontSize: 12 }}>No logs for this task</Text>}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <MaterialIcons name="terminal" size={36} color={palette.muted} />
          <Text style={{ color: palette.muted, fontSize: 14 }}>Select a task to view logs</Text>
        </View>
      )}
    </View>
  );
}

function SecurityTab({ palette }: { palette: any }) {
  const { lockNow, setPin, isPinSet } = useDevAuth();
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPinVal] = useState('');
  const [confPin, setConfPin] = useState('');
  const [msg, setMsg] = useState('');
  const [working, setWorking] = useState(false);

  const handleChangePin = async () => {
    if (newPin !== confPin) { setMsg('PINs do not match'); return; }
    setWorking(true); setMsg('');
    const res = await setPin(isPinSet ? oldPin : null, newPin);
    setWorking(false);
    if (res.success) { setMsg('✓ PIN changed successfully'); setOldPin(''); setNewPinVal(''); setConfPin(''); setShowChangePin(false); }
    else setMsg(res.error ?? 'Failed');
  };

  const features = [
    { icon: 'lock' as const, label: 'PIN Authentication', desc: 'Required before accessing developer area', ok: true },
    { icon: 'timer' as const, label: 'Auto-lock (5 min)', desc: 'Locks automatically after 5 minutes inactivity', ok: true },
    { icon: 'block' as const, label: '3-Attempt Lockout', desc: '5-minute lockout after 3 wrong PINs', ok: true },
    { icon: 'security' as const, label: 'Encrypted PIN Storage', desc: 'FNV-1a hash stored in device SecureStore', ok: true },
    { icon: 'visibility-off' as const, label: 'Zero Plaintext Storage', desc: 'PIN never stored in readable form', ok: true },
    { icon: 'shield' as const, label: 'Brute-Force Protection', desc: 'Exponential lockout on failed attempts', ok: true },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Active Security Features</Text>
        {features.map((f) => (
          <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <MaterialIcons name={f.icon} size={18} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.foreground, fontSize: 12, fontWeight: '600' }}>{f.label}</Text>
              <Text style={{ color: palette.muted, fontSize: 11 }}>{f.desc}</Text>
            </View>
            <MaterialIcons name="check-circle" size={16} color={palette.success} />
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Change Developer PIN</Text>
          {!showChangePin && <TouchableOpacity style={{ backgroundColor: palette.primary + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }} onPress={() => setShowChangePin(true)}><Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>Change</Text></TouchableOpacity>}
        </View>
        {showChangePin && (
          <>
            {isPinSet && <TextInput value={oldPin} onChangeText={setOldPin} placeholder="Current PIN" placeholderTextColor={palette.muted} secureTextEntry style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, letterSpacing: 4 }} />}
            <TextInput value={newPin} onChangeText={setNewPinVal} placeholder="New PIN (min 4)" placeholderTextColor={palette.muted} secureTextEntry style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, letterSpacing: 4 }} />
            <TextInput value={confPin} onChangeText={setConfPin} placeholder="Confirm New PIN" placeholderTextColor={palette.muted} secureTextEntry style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, letterSpacing: 4 }} />
            {msg ? <Text style={{ color: msg.startsWith('✓') ? palette.success : palette.error, fontSize: 12, fontWeight: '600' }}>{msg}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 10, padding: 10, alignItems: 'center' }} onPress={handleChangePin} disabled={working}><Text style={{ color: '#fff', fontWeight: '700' }}>{working ? '...' : 'Save PIN'}</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: palette.border }} onPress={() => { setShowChangePin(false); setMsg(''); }}><Text style={{ color: palette.muted, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <TouchableOpacity
        style={{ backgroundColor: palette.error + '15', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.error + '40', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onPress={() => Alert.alert('Lock Now', 'Lock the developer area immediately?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock', style: 'destructive', onPress: lockNow }])}
      >
        <MaterialIcons name="lock" size={18} color={palette.error} />
        <Text style={{ color: palette.error, fontSize: 14, fontWeight: '800' }}>Lock Developer Area Now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DeveloperDashboardContent() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [tab, setTab] = useState<Tab>('Overview');
  const { lockNow } = useDevAuth();

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Restricted</Text>
            <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>Developer Dashboard</Text>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.warning + '20', marginRight: 8 }}>
            <Text style={{ color: palette.warning, fontSize: 10, fontWeight: '800' }}>DEV</Text>
          </View>
          <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: palette.error + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.error + '30' }} onPress={lockNow}>
            <MaterialIcons name="lock" size={16} color={palette.error} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42, paddingHorizontal: 20, marginBottom: 14 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: tab === t ? palette.primary : palette.surface, borderWidth: 1, borderColor: tab === t ? palette.primary : palette.border }} onPress={() => setTab(t)}>
              <Text style={{ color: tab === t ? '#fff' : palette.muted, fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {tab === 'Overview' && <OverviewTab palette={palette} />}
          {tab === 'API Tester' && <ApiTesterTab palette={palette} />}
          {tab === 'Logs' && <LogsTab palette={palette} />}
          {tab === 'Security' && <SecurityTab palette={palette} />}
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function DeveloperDashboardScreen() {
  return (
    <DevAuthGate title="Developer Dashboard" subtitle="This area is restricted to authorized developers only">
      <DeveloperDashboardContent />
    </DevAuthGate>
  );
}
