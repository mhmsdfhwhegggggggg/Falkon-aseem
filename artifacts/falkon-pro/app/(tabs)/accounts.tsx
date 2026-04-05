import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';

type Account = {
  id: string;
  phone: string;
  username: string;
  status: 'active' | 'inactive' | 'banned' | 'flood';
  proxy?: string;
  lastUsed?: string;
  tasks: number;
};

const STATUS_COLOR: Record<Account['status'], string> = {
  active: '#34D399',
  inactive: '#9CA3AF',
  banned: '#F87171',
  flood: '#FBBF24',
};

const STATUS_LABEL: Record<Account['status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
  banned: 'Banned',
  flood: 'Flood Wait',
};

export default function AccountsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Account['status']>('all');
  const [accounts] = useState<Account[]>([]);

  const FILTERS: Array<'all' | Account['status']> = ['all', 'active', 'inactive', 'banned', 'flood'];

  const filtered = accounts.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter;
    const matchSearch = !search || a.phone.includes(search) || (a.username?.toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const handleAddAccount = () => {
    Alert.alert('Add Account', 'Connect a Telegram account via phone number or session string.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Telegram</Text>
            <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Accounts</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            onPress={handleAddAccount}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: palette.surface,
            borderRadius: 12,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: palette.border,
            gap: 8,
          }}>
            <MaterialIcons name="search" size={18} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search accounts..."
              placeholderTextColor={palette.muted}
              style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 10 }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialIcons name="close" size={16} color={palette.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: filter === f ? palette.primary : palette.surface,
                borderWidth: 1,
                borderColor: filter === f ? palette.primary : palette.border,
              }}
              onPress={() => setFilter(f)}
            >
              <Text style={{ color: filter === f ? '#fff' : palette.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>
                {f === 'all' ? `All (${accounts.length})` : `${STATUS_LABEL[f]}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="people-outline" size={32} color={palette.primary} />
              </View>
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>No accounts yet</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                Add your first Telegram account to start automating
              </Text>
              <TouchableOpacity
                style={{ marginTop: 8, backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                onPress={handleAddAccount}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add Account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filtered.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={{
                  backgroundColor: palette.surface,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: palette.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: palette.primary + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ color: palette.primary, fontSize: 16, fontWeight: '800' }}>
                    {account.phone.slice(-2)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>{account.phone}</Text>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>@{account.username || 'unknown'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                    backgroundColor: STATUS_COLOR[account.status] + '20',
                  }}>
                    <Text style={{ color: STATUS_COLOR[account.status], fontSize: 10, fontWeight: '700' }}>
                      {STATUS_LABEL[account.status]}
                    </Text>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>{account.tasks} tasks</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
