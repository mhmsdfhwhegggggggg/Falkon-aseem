import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAccountsStore } from '@/lib/accounts-store';
import { useMembersStore } from '@/lib/members-store';

const GOLD   = '#F59E0B';
const BG     = '#030712';
const SURF   = '#0D1117';
const BORDER = '#1a2235';
const GREEN  = '#34D399';
const RED    = '#F87171';
const MUTED  = '#6B7280';
const PURPLE = '#8B5CF6';

export default function ContactsFilterScreen() {
  const trpc    = useTRPC();
  const { activeAccounts, getSession } = useAccountsStore();
  const membersStore = useMembersStore();

  const [phonesText, setPhonesText] = useState('');
  const [jobId, setJobId]           = useState<string | null>(null);
  const [isRunning, setIsRunning]   = useState(false);
  const [savedFile, setSavedFile]   = useState<string | null>(null);

  const startMut = useMutation(trpc.contactsFilter.start.mutationOptions());

  const statusQ = useQuery({
    ...trpc.contactsFilter.status.queryOptions({ jobId: jobId! }),
    enabled: !!jobId,
    refetchInterval: isRunning ? 2000 : false,
    staleTime: 0,
  });

  const job = statusQ.data;

  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed') {
      setIsRunning(false);
      const members = job.result?.members ?? [];
      if (members.length > 0 && !savedFile) {
        const fileId = membersStore.createFile('أرقام مفلترة - تيليجرام', members as any);
        setSavedFile(fileId);
      }
    }
    if (job.status === 'failed') setIsRunning(false);
  }, [job?.status]);

  const lines = phonesText.split('\n').map((l) => l.trim()).filter(Boolean);

  const handleStart = async () => {
    if (lines.length === 0) return Alert.alert('خطأ', 'أدخل أرقام الهواتف');
    if (activeAccounts.length === 0) return Alert.alert('لا يوجد حساب', 'أضف حساباً نشطاً أولاً');

    const acc     = activeAccounts[0];
    const session = await getSession(acc.id);
    if (!session) return Alert.alert('خطأ', 'لا يمكن تحميل الجلسة');

    try {
      setIsRunning(true);
      setSavedFile(null);
      const res = await startMut.mutateAsync({
        phones: lines,
        accountId: acc.id,
        sessionString: session,
      });
      setJobId(res.jobId);
    } catch (e: any) {
      setIsRunning(false);
      Alert.alert('فشل', e.message);
    }
  };

  const isDone   = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  const found    = job?.result?.extracted ?? 0;
  const total    = job?.total ?? lines.length;
  const pct      = total > 0 ? Math.round(((job?.progress ?? 0) / total) * 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ color: GOLD, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>فلترة أرقام الهواتف</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 1 }}>من لديه تيليجرام؟</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* Info */}
        <View style={{ backgroundColor: '#12082a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2a1060', borderLeftWidth: 3, borderLeftColor: PURPLE }}>
          <Text style={{ color: '#C4B5FD', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>📱 كيف يعمل؟</Text>
          <Text style={{ color: '#DDD6FE', fontSize: 12, lineHeight: 20 }}>
            أدخل قائمة أرقام الهواتف (رقم في كل سطر). سيتحقق التطبيق من كل رقم ويُعيد لك فقط الأرقام التي لديها حساب تيليجرام نشط مع بياناتهم الكاملة.
          </Text>
        </View>

        {/* Stats bar */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'إجمالي الأرقام', value: lines.length, color: '#fff' },
            { label: 'تم فحصهم', value: job?.progress ?? 0, color: GOLD },
            { label: 'على تيليجرام', value: found, color: GREEN },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: SURF, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: s.color, fontSize: 20, fontWeight: '800' }}>{s.value}</Text>
              <Text style={{ color: MUTED, fontSize: 10, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Phone input */}
        <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>أرقام الهواتف</Text>
            <Text style={{ color: MUTED, fontSize: 11 }}>{lines.length} رقم</Text>
          </View>
          <TextInput
            value={phonesText}
            onChangeText={setPhonesText}
            placeholder={'+966501234567\n+971501234567\n+201234567890'}
            placeholderTextColor={MUTED}
            multiline
            numberOfLines={8}
            style={{
              color: '#fff', fontSize: 13, padding: 12, backgroundColor: BG,
              borderRadius: 8, borderWidth: 1, borderColor: BORDER,
              minHeight: 160, textAlignVertical: 'top', fontFamily: 'monospace',
            }}
            editable={!isRunning}
          />
          <Text style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
            💡 رقم واحد في كل سطر، بصيغة دولية (+966...)
          </Text>
        </View>

        {/* Progress */}
        {jobId && job && (
          <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {job.status === 'running' ? '🔍 جاري الفحص...' : isDone ? '✅ اكتمل' : isFailed ? '❌ فشل' : '⏳ في الانتظار'}
              </Text>
              <Text style={{ color: GOLD, fontWeight: '700' }}>{pct}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: isDone ? GREEN : PURPLE, borderRadius: 3 }} />
            </View>
            {isFailed && <Text style={{ color: RED, marginTop: 8, fontSize: 12 }}>{job.error}</Text>}
          </View>
        )}

        {/* Result */}
        {isDone && found > 0 && (
          <View style={{ backgroundColor: '#0a1f0d', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: GREEN }}>
            <Text style={{ color: GREEN, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
              ✅ وُجد {found} رقم على تيليجرام من أصل {total}
            </Text>
            <Text style={{ color: '#6EE7B7', fontSize: 12, textAlign: 'center', marginBottom: 14 }}>
              نسبة الإصابة: {total > 0 ? Math.round((found / total) * 100) : 0}%
            </Text>
            {savedFile && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/members-file', params: { fileId: savedFile } })}
                style={{ backgroundColor: GREEN, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>عرض النتائج وإضافتهم</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Start */}
        <TouchableOpacity
          onPress={handleStart}
          disabled={isRunning || lines.length === 0}
          style={{ backgroundColor: isRunning ? '#2a1f00' : lines.length === 0 ? '#1a1a1a' : GOLD, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {isRunning ? <ActivityIndicator color={GOLD} size="small" /> : null}
          <Text style={{ color: isRunning ? GOLD : lines.length === 0 ? MUTED : '#000', fontSize: 16, fontWeight: '800' }}>
            {isRunning ? 'جاري الفحص...' : `🔍 فلتر ${lines.length} رقم`}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
