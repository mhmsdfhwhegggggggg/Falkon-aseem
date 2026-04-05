import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useMembersStore, type Member, type MemberStatus } from '@/lib/members-store';

const STATUS_CONFIG: Record<MemberStatus, { color: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }> = {
  pending: { color: '#FBBF24', icon: 'schedule', label: 'Pending' },
  added: { color: '#34D399', icon: 'check-circle', label: 'Added' },
  failed: { color: '#F87171', icon: 'error', label: 'Failed' },
  flood: { color: '#FB923C', icon: 'warning', label: 'Flood Wait' },
  already_member: { color: '#60A5FA', icon: 'info', label: 'Already In' },
};

function MemberRow({ member, palette }: { member: Member; palette: any }) {
  const cfg = STATUS_CONFIG[member.status];
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '800' }}>
          {(member.firstName?.[0] ?? member.username?.[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
          {[member.firstName, member.lastName].filter(Boolean).join(' ') || member.username || `ID:${member.userId}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          {member.username && <Text style={{ color: palette.primary, fontSize: 10 }}>@{member.username}</Text>}
          {member.userId && <Text style={{ color: palette.muted, fontSize: 10 }}>ID:{member.userId}</Text>}
          {member.isOnline && <Text style={{ color: palette.success, fontSize: 10 }}>● Online</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <MaterialIcons name={cfg.icon} size={14} color={cfg.color} />
        <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.label}</Text>
      </View>
    </View>
  );
}

export default function MembersFileScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { files, exportFileAsText } = useMembersStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'all'>('all');

  const file = files.find((f) => f.id === id);

  const filtered = useMemo(() => {
    if (!file) return [];
    return file.members.filter((m) => {
      const matchStatus = filterStatus === 'all' || m.status === filterStatus;
      const matchSearch = !search ||
        m.username?.toLowerCase().includes(search.toLowerCase()) ||
        m.userId?.includes(search) ||
        m.firstName?.toLowerCase().includes(search.toLowerCase()) ||
        m.lastName?.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [file, search, filterStatus]);

  const stats = useMemo(() => {
    if (!file) return {};
    const all = file.members;
    return {
      total: all.length,
      added: all.filter((m) => m.status === 'added').length,
      pending: all.filter((m) => m.status === 'pending').length,
      failed: all.filter((m) => m.status === 'failed').length,
      flood: all.filter((m) => m.status === 'flood').length,
      withUsername: all.filter((m) => m.username).length,
      withId: all.filter((m) => m.userId).length,
      online: all.filter((m) => m.isOnline).length,
    };
  }, [file]);

  if (!file) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.muted, fontSize: 16 }}>File not found</Text>
      </View>
    );
  }

  const handleExport = async () => {
    const text = exportFileAsText(file.id);
    try {
      await Share.share({ message: text, title: file.name });
    } catch {
      Alert.alert('Exported', 'File content ready to share');
    }
  };

  const STATUSES: Array<{ key: MemberStatus | 'all'; label: string }> = [
    { key: 'all', label: `All (${stats.total})` },
    { key: 'pending', label: `Pending (${stats.pending})` },
    { key: 'added', label: `Added (${stats.added})` },
    { key: 'failed', label: `Failed (${stats.failed})` },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.foreground, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{file.name}</Text>
            <Text style={{ color: palette.muted, fontSize: 11 }}>
              {file.sourceGroup ? `from ${file.sourceGroup} • ` : ''}{file.totalCount} members
            </Text>
          </View>
          <TouchableOpacity onPress={handleExport} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }}>
            <MaterialIcons name="share" size={16} color={palette.foreground} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {[
            { label: 'Total', value: stats.total, color: palette.foreground },
            { label: 'Usernames', value: stats.withUsername, color: palette.primary },
            { label: 'IDs', value: stats.withId, color: palette.info },
            { label: 'Online', value: stats.online, color: palette.success },
            { label: 'Added', value: stats.added, color: palette.success },
            { label: 'Failed', value: stats.failed, color: palette.error },
          ].map((s) => (
            <View key={s.label} style={{ backgroundColor: palette.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', minWidth: 64 }}>
              <Text style={{ color: s.color, fontSize: 16, fontWeight: '900' }}>{s.value ?? 0}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: palette.primary, borderRadius: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onPress={() => router.push({ pathname: '/add-members', params: { fileId: file.id } } as any)}
          >
            <MaterialIcons name="person-add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add All Members</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: palette.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={handleExport}
          >
            <MaterialIcons name="download" size={16} color={palette.foreground} />
            <Text style={{ color: palette.foreground, fontWeight: '700', fontSize: 13 }}>Export</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ marginHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <MaterialIcons name="search" size={16} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, username, ID..."
              placeholderTextColor={palette.muted}
              style={{ flex: 1, color: palette.foreground, fontSize: 13, paddingVertical: 8 }}
            />
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: filterStatus === s.key ? palette.primary : palette.surface, borderWidth: 1, borderColor: filterStatus === s.key ? palette.primary : palette.border }}
              onPress={() => setFilterStatus(s.key)}
            >
              <Text style={{ color: filterStatus === s.key ? '#fff' : palette.muted, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Members List */}
        <View style={{ flex: 1 }}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MemberRow member={item} palette={palette} />}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Text style={{ color: palette.muted, fontSize: 14 }}>No members match the filter</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
