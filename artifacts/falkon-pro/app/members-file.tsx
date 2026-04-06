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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useMembersStore, type Member, type MemberStatus } from '@/lib/members-store';

const STATUS_CONFIG: Record<MemberStatus, { color: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }> = {
  pending: { color: '#FBBF24', icon: 'schedule', label: 'انتظار' },
  added: { color: '#34D399', icon: 'check-circle', label: 'أُضيف' },
  failed: { color: '#F87171', icon: 'error', label: 'فشل' },
  flood: { color: '#FB923C', icon: 'warning', label: 'Flood' },
  already_member: { color: '#60A5FA', icon: 'info', label: 'موجود' },
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
          {member.isOnline && <Text style={{ color: palette.success, fontSize: 10 }}>● أونلاين</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <MaterialIcons name={cfg.icon} size={14} color={cfg.color} />
        <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.label}</Text>
      </View>
    </View>
  );
}

function downloadOnWeb(content: string, filename: string, mime: string) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export default function MembersFileScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { files, exportFileAsText, exportFileAsCSV, exportFileAsUsernames } = useMembersStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'all'>('all');
  const [showExport, setShowExport] = useState(false);

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
    if (!file) return {} as any;
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
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <MaterialIcons name="folder-open" size={48} color={palette.muted} />
        <Text style={{ color: palette.muted, fontSize: 16 }}>الملف غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '700' }}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const doExport = async (format: 'txt' | 'csv' | 'usernames') => {
    let content = '';
    let filename = '';
    let mime = 'text/plain';

    if (format === 'csv') {
      content = exportFileAsCSV(file.id);
      filename = `${file.name}.csv`;
      mime = 'text/csv';
    } else if (format === 'usernames') {
      content = exportFileAsUsernames(file.id);
      filename = `${file.name}_usernames.txt`;
    } else {
      content = exportFileAsText(file.id);
      filename = `${file.name}.txt`;
    }

    setShowExport(false);

    // Web: download directly
    if (Platform.OS === 'web') {
      const ok = downloadOnWeb(content, filename, mime);
      if (!ok) {
        await Share.share({ message: content, title: filename });
      }
      return;
    }

    // Mobile: use Share
    try {
      await Share.share({ message: content, title: filename });
    } catch {
      Alert.alert('تصدير', `محتوى الملف جاهز للمشاركة (${content.split('\n').length} سطر)`);
    }
  };

  const STATUSES: Array<{ key: MemberStatus | 'all'; label: string }> = [
    { key: 'all', label: `الكل (${stats.total})` },
    { key: 'pending', label: `انتظار (${stats.pending})` },
    { key: 'added', label: `أُضيف (${stats.added})` },
    { key: 'failed', label: `فشل (${stats.failed})` },
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
              {file.sourceGroup ? `من ${file.sourceGroup} · ` : ''}{file.totalCount.toLocaleString()} عضو
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowExport(!showExport)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: showExport ? palette.primary : palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: showExport ? palette.primary : palette.border }}
          >
            <MaterialIcons name="download" size={16} color={showExport ? '#fff' : palette.foreground} />
          </TouchableOpacity>
        </View>

        {/* Export Panel */}
        {showExport && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.primary + '40', gap: 8 }}>
            <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>تصدير الملف ({file.totalCount} عضو)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#1D4ED8' + '20', borderRadius: 10, padding: 10, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1D4ED8' + '40' }}
                onPress={() => doExport('csv')}
              >
                <MaterialIcons name="table-chart" size={20} color="#60A5FA" />
                <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '700' }}>CSV</Text>
                <Text style={{ color: palette.muted, fontSize: 9, textAlign: 'center' }}>Excel / جداول</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: palette.success + '15', borderRadius: 10, padding: 10, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: palette.success + '40' }}
                onPress={() => doExport('usernames')}
              >
                <MaterialIcons name="alternate-email" size={20} color={palette.success} />
                <Text style={{ color: palette.success, fontSize: 11, fontWeight: '700' }}>يوزرات</Text>
                <Text style={{ color: palette.muted, fontSize: 9, textAlign: 'center' }}>@usernames فقط</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: palette.primary + '15', borderRadius: 10, padding: 10, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: palette.primary + '40' }}
                onPress={() => doExport('txt')}
              >
                <MaterialIcons name="description" size={20} color={palette.primary} />
                <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '700' }}>TXT</Text>
                <Text style={{ color: palette.muted, fontSize: 9, textAlign: 'center' }}>نص كامل</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: palette.muted, fontSize: 10, textAlign: 'center' }}>
              {stats.withUsername} يوزر · {stats.withId} ID · {stats.online} أونلاين
            </Text>
          </View>
        )}

        {/* Stats Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {[
            { label: 'الكل', value: stats.total, color: palette.foreground },
            { label: 'يوزر', value: stats.withUsername, color: palette.primary },
            { label: 'ID', value: stats.withId, color: '#60A5FA' },
            { label: 'أونلاين', value: stats.online, color: palette.success },
            { label: 'أُضيف', value: stats.added, color: palette.success },
            { label: 'فشل', value: stats.failed, color: palette.error },
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
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>إضافة للمجموعة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: palette.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: showExport ? palette.primary : palette.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => setShowExport(!showExport)}
          >
            <MaterialIcons name="download" size={16} color={showExport ? palette.primary : palette.foreground} />
            <Text style={{ color: showExport ? palette.primary : palette.foreground, fontWeight: '700', fontSize: 13 }}>تصدير</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ marginHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <MaterialIcons name="search" size={16} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث بالاسم، اليوزر، أو الـ ID..."
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
              <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                <MaterialIcons name="group" size={40} color={palette.muted} />
                <Text style={{ color: palette.muted, fontSize: 14 }}>لا يوجد أعضاء يطابقون الفلتر</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
