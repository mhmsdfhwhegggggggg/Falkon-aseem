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
import { router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useMembersStore } from '@/lib/members-store';

export default function MembersFilesScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [search, setSearch] = useState('');
  const membersStore = useMembersStore();

  const files = membersStore.files.map((f) => ({
    id: f.id,
    name: f.name,
    memberCount: f.totalCount,
    addedCount: f.addedCount,
    sourceGroup: f.sourceGroup || '',
    createdAt: f.createdAt,
  }));
  const filtered = files.filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.sourceGroup.toLowerCase().includes(search.toLowerCase())
  );

  const totalMembers = files.reduce((a, f) => a + f.memberCount, 0);
  const totalAdded = files.reduce((a, f) => a + f.addedCount, 0);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('حذف الملف', `حذف "${name}"؟ لا يمكن التراجع عن هذا.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => membersStore.deleteFile(id),
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>بيانات الأعضاء</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>الملفات المحفوظة</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            onPress={() => router.push('/extraction' as any)}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>استخراج</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14 }}>
          {[
            { label: 'الملفات', value: files.length, color: palette.primary },
            { label: 'إجمالي الأعضاء', value: totalMembers, color: '#34D399' },
            { label: 'تمت إضافتهم', value: totalAdded, color: '#FBBF24' },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: palette.border }}>
              <Text style={{ color: s.color, fontSize: 20, fontWeight: '900' }}>{s.value.toLocaleString()}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginHorizontal: 20, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <MaterialIcons name="search" size={18} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث في الملفات..."
              placeholderTextColor={palette.muted}
              style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 10 }}
            />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: palette.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="folder-open" size={36} color={palette.primary} />
              </View>
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>لا توجد ملفات</Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                {search ? 'لا توجد ملفات تطابق البحث' : 'قم باستخراج أعضاء لحفظهم هنا ثم إضافتهم لأي مجموعة'}
              </Text>
              {!search && (
                <TouchableOpacity
                  style={{ backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                  onPress={() => router.push('/extraction' as any)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>ابدأ الاستخراج</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filtered.map((file) => {
              const addedPct = file.memberCount > 0 ? Math.round((file.addedCount / file.memberCount) * 100) : 0;
              return (
                <TouchableOpacity
                  key={file.id}
                  style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: palette.border }}
                  onPress={() => router.push({ pathname: '/members-file', params: { id: file.id } } as any)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="folder" size={22} color={palette.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>{file.sourceGroup} · {new Date(file.createdAt).toLocaleDateString('ar')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(file.id, file.name)}>
                      <MaterialIcons name="delete-outline" size={18} color={palette.error} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>
                      الأعضاء: <Text style={{ color: palette.foreground, fontWeight: '700' }}>{file.memberCount.toLocaleString()}</Text>
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>
                      أُضيفوا: <Text style={{ color: palette.success, fontWeight: '700' }}>{file.addedCount.toLocaleString()}</Text>
                    </Text>
                  </View>

                  {file.memberCount > 0 && (
                    <View>
                      <View style={{ height: 4, backgroundColor: palette.border, borderRadius: 2 }}>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.success, width: `${addedPct}%` }} />
                      </View>
                      <Text style={{ color: palette.muted, fontSize: 10, marginTop: 3 }}>{addedPct}% تمت إضافتهم</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: palette.primary + '15', borderRadius: 10, padding: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                      onPress={() => router.push({ pathname: '/members-file', params: { id: file.id } } as any)}
                    >
                      <MaterialIcons name="visibility" size={14} color={palette.primary} />
                      <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>عرض الملف</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: palette.success + '15', borderRadius: 10, padding: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                      onPress={() => router.push({ pathname: '/add-members', params: { fileId: file.id } } as any)}
                    >
                      <MaterialIcons name="person-add" size={14} color={palette.success} />
                      <Text style={{ color: palette.success, fontSize: 12, fontWeight: '700' }}>إضافة للمجموعة</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
