import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import DevAuthGate from '@/components/DevAuthGate';
import { useDevAuth } from '@/lib/dev-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';

type LicenseTier = 'Basic' | 'Professional' | 'Enterprise' | 'Lifetime';
type LicenseStatus = 'active' | 'expired' | 'revoked' | 'trial';

interface License {
  id: string;
  key: string;
  tier: LicenseTier;
  status: LicenseStatus;
  deviceId: string;
  activatedAt: string;
  expiresAt: string | null;
  maxAccounts: number;
  maxWindows: number | 'Unlimited';
  features: string[];
}

const TIER_COLORS: Record<LicenseTier, string> = {
  Basic: '#60A5FA',
  Professional: '#8B5CF6',
  Enterprise: '#34D399',
  Lifetime: '#FBBF24',
};

const STATUS_COLORS: Record<LicenseStatus, string> = {
  active: '#34D399',
  expired: '#F87171',
  revoked: '#9CA3AF',
  trial: '#FBBF24',
};

function maskKey(key: string): string {
  if (key.length <= 8) return '****-****';
  return key.slice(0, 4) + '-****-****-' + key.slice(-4);
}

function generateKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FLK-${seg()}-${seg()}-${seg()}-${seg()}`;
}

const DEMO_LICENSES: License[] = [
  {
    id: 'lic_001',
    key: 'FLK-PRO1-AB2C-DEF3-4567',
    tier: 'Professional',
    status: 'active',
    deviceId: 'DEV-A1B2C3D4',
    activatedAt: '2025-01-15T10:00:00Z',
    expiresAt: '2026-01-15T10:00:00Z',
    maxAccounts: 100,
    maxWindows: 'Unlimited',
    features: ['Extraction', 'Bulk Add', 'Multi-Window', 'Auto-Reply', 'Scheduler', 'Proxies'],
  },
  {
    id: 'lic_002',
    key: 'FLK-ENT1-XYZW-UV56-7890',
    tier: 'Enterprise',
    status: 'active',
    deviceId: 'DEV-E5F6G7H8',
    activatedAt: '2024-11-01T09:00:00Z',
    expiresAt: null,
    maxAccounts: 1000,
    maxWindows: 'Unlimited',
    features: ['All Professional', 'API Access', 'Priority Support', 'White Label', 'Custom Bots'],
  },
  {
    id: 'lic_003',
    key: 'FLK-BSC1-1234-ABCD-EFGH',
    tier: 'Basic',
    status: 'expired',
    deviceId: 'DEV-I9J0K1L2',
    activatedAt: '2024-03-01T08:00:00Z',
    expiresAt: '2025-03-01T08:00:00Z',
    maxAccounts: 10,
    maxWindows: 5,
    features: ['Extraction', 'Basic Add', 'Stats'],
  },
];

const TABS = ['Licenses', 'Generate', 'Validator'] as const;
type Tab = typeof TABS[number];

function LicenseCard({ license, onRevoke, showKey }: { license: License; onRevoke: () => void; showKey: boolean }) {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const tierColor = TIER_COLORS[license.tier];
  const statusColor = STATUS_COLORS[license.status];

  return (
    <View style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: license.status === 'active' ? tierColor + '40' : palette.border, marginBottom: 12, overflow: 'hidden' }}>
      {/* Header */}
      <LinearGradient
        colors={license.status === 'active' ? [tierColor + '20', tierColor + '05'] : [palette.border + '40', 'transparent']}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: tierColor + '20', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name={license.tier === 'Lifetime' ? 'star' : license.tier === 'Enterprise' ? 'business' : license.tier === 'Professional' ? 'workspace-premium' : 'person'} size={20} color={tierColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '800' }}>{license.tier}</Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: statusColor + '20' }}>
              <Text style={{ color: statusColor, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{license.status}</Text>
            </View>
          </View>
          <Text style={{ color: palette.muted, fontSize: 11, fontFamily: 'monospace' }}>
            {showKey ? license.key : maskKey(license.key)}
          </Text>
        </View>
        {license.status === 'active' && (
          <TouchableOpacity
            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.error + '15', borderWidth: 1, borderColor: palette.error + '30' }}
            onPress={onRevoke}
          >
            <Text style={{ color: palette.error, fontSize: 10, fontWeight: '700' }}>Revoke</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Details */}
      <View style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: 'phone-android' as const, label: 'Device', val: license.deviceId },
            { icon: 'calendar-today' as const, label: 'Activated', val: new Date(license.activatedAt).toLocaleDateString('en-GB') },
            { icon: 'event' as const, label: 'Expires', val: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('en-GB') : 'Never' },
            { icon: 'people' as const, label: 'Max Accounts', val: String(license.maxAccounts) },
            { icon: 'tab' as const, label: 'Max Windows', val: String(license.maxWindows) },
          ].map((d) => (
            <View key={d.label} style={{ backgroundColor: palette.background, borderRadius: 8, padding: 8, gap: 2, minWidth: '45%', flexGrow: 1 }}>
              <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>{d.label}</Text>
              <Text style={{ color: palette.foreground, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{d.val}</Text>
            </View>
          ))}
        </View>
        {/* Features */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {license.features.map((f) => (
            <View key={f} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: tierColor + '15' }}>
              <Text style={{ color: tierColor, fontSize: 10, fontWeight: '600' }}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function LicensesTab({ palette }: { palette: any }) {
  const [licenses, setLicenses] = useState<License[]>(DEMO_LICENSES);
  const [showKeys, setShowKeys] = useState(false);
  const [filter, setFilter] = useState<LicenseStatus | 'all'>('all');

  const filtered = filter === 'all' ? licenses : licenses.filter((l) => l.status === filter);

  const handleRevoke = (id: string) => {
    const lic = licenses.find((l) => l.id === id);
    Alert.alert('Revoke License', `Revoke ${lic?.tier} license for device ${lic?.deviceId}?\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => setLicenses((prev) => prev.map((l) => l.id === id ? { ...l, status: 'revoked' } : l)) },
    ]);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Total', value: licenses.length, color: palette.primary },
          { label: 'Active', value: licenses.filter((l) => l.status === 'active').length, color: palette.success },
          { label: 'Expired', value: licenses.filter((l) => l.status === 'expired').length, color: palette.error },
          { label: 'Revoked', value: licenses.filter((l) => l.status === 'revoked').length, color: palette.muted },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center' }}>
            <Text style={{ color: s.color, fontSize: 18, fontWeight: '900' }}>{s.value}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter + Toggle */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(['all', 'active', 'expired', 'revoked'] as const).map((s) => (
            <TouchableOpacity key={s} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: filter === s ? palette.primary : palette.surface, borderWidth: 1, borderColor: filter === s ? palette.primary : palette.border }} onPress={() => setFilter(s)}>
              <Text style={{ color: filter === s ? '#fff' : palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setShowKeys(!showKeys)}>
          <MaterialIcons name={showKeys ? 'visibility-off' : 'visibility'} size={12} color={palette.muted} />
          <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700' }}>{showKeys ? 'Hide' : 'Show'} Keys</Text>
        </TouchableOpacity>
      </View>

      {filtered.map((lic) => (
        <LicenseCard key={lic.id} license={lic} onRevoke={() => handleRevoke(lic.id)} showKey={showKeys} />
      ))}
    </ScrollView>
  );
}

function GenerateTab({ palette }: { palette: any }) {
  const [tier, setTier] = useState<LicenseTier>('Professional');
  const [duration, setDuration] = useState<'1y' | '6m' | 'lifetime'>('1y');
  const [maxAccounts, setMaxAccounts] = useState('100');
  const [deviceId, setDeviceId] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 600));
    const key = generateKey();
    setGenerated(key);
    setGenerating(false);
    Alert.alert('License Generated', `Key: ${key}\n\nTier: ${tier}\nExpiry: ${duration === 'lifetime' ? 'Never' : duration}\nMax Accounts: ${maxAccounts}\n\nCopy this key — it will not be shown again.`);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>License Tier</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['Basic', 'Professional', 'Enterprise', 'Lifetime'] as LicenseTier[]).map((t) => (
            <TouchableOpacity key={t} style={{ flexGrow: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: tier === t ? TIER_COLORS[t] + '20' : palette.background, borderWidth: 1.5, borderColor: tier === t ? TIER_COLORS[t] : palette.border, alignItems: 'center' }} onPress={() => setTier(t)}>
              <Text style={{ color: tier === t ? TIER_COLORS[t] : palette.muted, fontSize: 12, fontWeight: '700' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Duration</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ key: '6m', label: '6 Months' }, { key: '1y', label: '1 Year' }, { key: 'lifetime', label: 'Lifetime' }].map((d) => (
            <TouchableOpacity key={d.key} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: duration === d.key ? palette.primary : palette.background, borderWidth: 1, borderColor: duration === d.key ? palette.primary : palette.border, alignItems: 'center' }} onPress={() => setDuration(d.key as any)}>
              <Text style={{ color: duration === d.key ? '#fff' : palette.muted, fontSize: 11, fontWeight: '700' }}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Limits & Binding</Text>
        <View>
          <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 6 }}>Max Accounts</Text>
          <TextInput value={maxAccounts} onChangeText={setMaxAccounts} keyboardType="numeric" placeholder="100" placeholderTextColor={palette.muted} style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }} />
        </View>
        <View>
          <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 6 }}>Device ID (leave blank = any device)</Text>
          <TextInput value={deviceId} onChangeText={setDeviceId} placeholder="DEV-XXXXXXXX (optional)" placeholderTextColor={palette.muted} autoCapitalize="none" style={{ backgroundColor: palette.background, borderRadius: 10, padding: 10, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 13 }} />
        </View>
      </View>

      {generated && (
        <View style={{ backgroundColor: palette.success + '10', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: palette.success + '40', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="check-circle" size={16} color={palette.success} />
            <Text style={{ color: palette.success, fontSize: 13, fontWeight: '700' }}>License Generated</Text>
          </View>
          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '900', letterSpacing: 1, fontFamily: 'monospace' }}>{generated}</Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>Save this key — it cannot be retrieved again.</Text>
        </View>
      )}

      <TouchableOpacity style={{ borderRadius: 14, overflow: 'hidden' }} onPress={handleGenerate} disabled={generating}>
        <LinearGradient colors={['#4C1D95', '#6D28D9', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {generating ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="vpn-key" size={20} color="#fff" />}
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{generating ? 'Generating...' : 'Generate License Key'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ValidatorTab({ palette }: { palette: any }) {
  const [key, setKey] = useState('');
  const [result, setResult] = useState<{ valid: boolean; tier?: LicenseTier; status?: LicenseStatus; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    const clean = key.trim().toUpperCase();
    const match = DEMO_LICENSES.find((l) => l.key === clean);
    if (match) {
      setResult({ valid: match.status === 'active', tier: match.tier, status: match.status, msg: match.status === 'active' ? `Valid ${match.tier} license — active until ${match.expiresAt ? new Date(match.expiresAt).toLocaleDateString() : 'never'}` : `License is ${match.status}` });
    } else if (clean.startsWith('FLK-') && clean.length >= 16) {
      setResult({ valid: false, msg: 'License key not found in database' });
    } else {
      setResult({ valid: false, msg: 'Invalid key format (must start with FLK-)' });
    }
    setLoading(false);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
      <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
        <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Validate License Key</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>Check if a license key is valid, active, and its tier details.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.background, borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, gap: 8 }}>
          <MaterialIcons name="vpn-key" size={16} color={palette.muted} />
          <TextInput value={key} onChangeText={setKey} placeholder="FLK-XXXX-XXXX-XXXX-XXXX" placeholderTextColor={palette.muted} autoCapitalize="characters" style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 12, letterSpacing: 1 }} onSubmitEditing={validate} />
        </View>
        <TouchableOpacity style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }} onPress={validate} disabled={loading || !key.trim()}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="search" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{loading ? 'Checking...' : 'Validate Key'}</Text>
        </TouchableOpacity>
      </View>

      {result && (
        <View style={{ backgroundColor: result.valid ? palette.success + '10' : palette.error + '10', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: result.valid ? palette.success + '40' : palette.error + '40', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name={result.valid ? 'check-circle' : 'cancel'} size={22} color={result.valid ? palette.success : palette.error} />
            <Text style={{ color: result.valid ? palette.success : palette.error, fontSize: 16, fontWeight: '900' }}>
              {result.valid ? 'Valid License' : 'Invalid License'}
            </Text>
          </View>
          <Text style={{ color: palette.foreground, fontSize: 13 }}>{result.msg}</Text>
          {result.tier && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: TIER_COLORS[result.tier] + '20' }}>
                <Text style={{ color: TIER_COLORS[result.tier], fontSize: 11, fontWeight: '700' }}>{result.tier}</Text>
              </View>
              {result.status && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: STATUS_COLORS[result.status] + '20' }}>
                  <Text style={{ color: STATUS_COLORS[result.status], fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{result.status}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function LicenseDashboardContent() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [tab, setTab] = useState<Tab>('Licenses');
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
            <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>License Management</Text>
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
          {tab === 'Licenses' && <LicensesTab palette={palette} />}
          {tab === 'Generate' && <GenerateTab palette={palette} />}
          {tab === 'Validator' && <ValidatorTab palette={palette} />}
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function LicenseDashboardScreen() {
  return (
    <DevAuthGate
      title="License Management"
      subtitle="Developer-only access required to manage licenses"
    >
      <LicenseDashboardContent />
    </DevAuthGate>
  );
}
