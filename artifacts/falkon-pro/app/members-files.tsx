import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';
import { useMembersStore, type MembersFile } from '@/lib/members-store';

function FileCard({ file, onOpen, onAddFrom, onExport, onDelete }: {
  file: MembersFile;
  onOpen: () => void;
  onAddFrom: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const addedPct = file.totalCount > 0 ? Math.round((file.addedCount / file.totalCount) * 100) : 0;

  return (
    <View style={{
      backgroundColor: palette.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <TouchableOpacity style={{ padding: 16 }} onPress={onOpen}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="folder" size={22} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{file.name}</Text>
            {file.sourceGroup && (
              <Text style={{ color: palette.primary, fontSize: 11, marginTop: 2 }}>
                Source: {file.sourceGroup}
              </Text>
            )}
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 1 }}>
              {new Date(file.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
        </View>

        {/* Stats Row */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '900' }}>{file.totalCount}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
          </View>
          <View style={{ width: 1, backgroundColor: palette.border }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: palette.success, fontSize: 18, fontWeight: '900' }}>{file.addedCount}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Added</Text>
          </View>
          <View style={{ width: 1, backgroundColor: palette.border }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: palette.warning, fontSize: 18, fontWeight: '900' }}>{file.totalCount - file.addedCount}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pending</Text>
          </View>
          <View style={{ width: 1, backgroundColor: palette.border }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: palette.info, fontSize: 18, fontWeight: '900' }}>{addedPct}%</Text>
            <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Done</Text>
          </View>
        </View>

        {/* Progress Bar */}
        {file.addedCount > 0 && (
          <View style={{ height: 3, backgroundColor: palette.border, borderRadius: 2, marginTop: 10 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: palette.success, width: `${addedPct}%` }} />
          </View>
        )}
      </TouchableOpacity>

      {/* Action Bar */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: palette.border }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 }}
          onPress={onAddFrom}
        >
          <MaterialIcons name="person-add" size={15} color={palette.success} />
          <Text style={{ color: palette.success, fontSize: 11, fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
        <View style={{ width: 1, backgroundColor: palette.border }} />
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 }}
          onPress={onExport}
        >
          <MaterialIcons name="share" size={15} color={palette.info} />
          <Text style={{ color: palette.info, fontSize: 11, fontWeight: '700' }}>Export</Text>
        </TouchableOpacity>
        <View style={{ width: 1, backgroundColor: palette.border }} />
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 }}
          onPress={onDelete}
        >
          <MaterialIcons name="delete-outline" size={15} color={palette.error} />
          <Text style={{ color: palette.error, fontSize: 11, fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function MembersFilesScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { files, deleteFile, exportFileAsText, totalMembers } = useMembersStore();
  const [search, setSearch] = useState('');

  const filtered = files.filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.sourceGroup?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = (file: MembersFile) => {
    Alert.alert('Delete File', `Delete "${file.name}" with ${file.totalCount} members?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFile(file.id) },
    ]);
  };

  const handleExport = async (file: MembersFile) => {
    const text = exportFileAsText(file.id);
    try {
      await Share.share({ message: text, title: file.name });
    } catch {
      Alert.alert('Export', text.slice(0, 300) + '\n\n[Truncated for display]');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Members Data</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Saved Files</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => router.push('/extraction' as any)}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Extract</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Files', value: files.length, color: palette.primary },
            { label: 'Total Members', value: totalMembers, color: palette.info },
            { label: 'Total Added', value: files.reduce((a, f) => a + f.addedCount, 0), color: palette.success },
          ].map((stat) => (
            <View key={stat.label} style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center' }}>
              <Text style={{ color: stat.color, fontSize: 20, fontWeight: '900' }}>{stat.value}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={{ marginHorizontal: 20, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <MaterialIcons name="search" size={18} color={palette.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search files..."
              placeholderTextColor={palette.muted}
              style={{ flex: 1, color: palette.foreground, fontSize: 14, paddingVertical: 10 }}
            />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 14 }}>
              <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: palette.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="folder-open" size={36} color={palette.primary} />
              </View>
              <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '800' }}>No Files Yet</Text>
              <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
                Run an extraction to save member lists here. You can then add them to any group.
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                onPress={() => router.push('/extraction' as any)}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Start Extraction</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filtered.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onOpen={() => router.push({ pathname: '/members-file', params: { id: file.id } } as any)}
                onAddFrom={() => router.push({ pathname: '/add-members', params: { fileId: file.id } } as any)}
                onExport={() => handleExport(file)}
                onDelete={() => handleDelete(file)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
