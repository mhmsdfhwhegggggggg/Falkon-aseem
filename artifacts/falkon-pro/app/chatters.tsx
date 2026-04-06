import React, { useState, useEffect, useRef } from 'react';
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
import { colors } from '@/lib/theme';

const GOLD = '#F59E0B';
const BG   = '#030712';
const SURF = '#0D1117';
const SURF2 = '#111827';
const BORDER = '#1a2235';
const GREEN = '#34D399';
const RED   = '#F87171';
const MUTED = '#6B7280';

export default function ChattersScreen() {
  const scheme   = useColorScheme();
  const palette  = colors[scheme ?? 'dark'];
  const trpc     = useTRPC();
  const { activeAccounts, getSession } = useAccountsStore();
  const membersStore = useMembersStore();

  const [group, setGroup]     = useState('');
  const [limit, setLimit]     = useState('500');
  const [lastDays, setLastDays] = useState('30');
  const [jobId, setJobId]     = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [savedFile, setSavedFile] = useState<string | null>(null);

  const startMut = useMutation(trpc.chatters.start.mutationOptions());

  const statusQ = useQuery({
    ...trpc.chatters.status.queryOptions({ jobId: jobId! }),
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
        const fileId = membersStore.createFile(`متفاعلون - ${group}`, members as any);
        setSavedFile(fileId);
      }
    }
    if (job.status === 'failed') setIsRunning(false);
  }, [job?.status]);

  const handleStart = async () => {
    if (!group.trim()) return Alert.alert('خطأ', 'أدخل رابط أو اسم الجروب');
    if (activeAccounts.length === 0) return Alert.alert('لا يوجد حساب', 'أضف حساباً نشطاً أولاً');

    const acc = activeAccounts[0];
    const session = await getSession(acc.id);
    if (!session) return Alert.alert('خطأ', 'لا يمكن تحميل جلسة الحساب');

    try {
      setIsRunning(true);
      setSavedFile(null);
      const res = await startMut.mutateAsync({
        group: group.trim(),
        limit: parseInt(limit, 10) || 500,
        lastDays: parseInt(lastDays, 10) || 30,
        excludeBots: true,
        accountId: acc.id,
        sessionString: session,
      });
      setJobId(res.jobId);
    } catch (e: any) {
      setIsRunning(false);
      Alert.alert('فشل', e.message || 'حدث خطأ');
    }
  };

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
  const isDone = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  const count = job?.result?.extracted ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ color: GOLD, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>استخراج المتفاعلين</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 1 }}>الأشخاص الذين يكتبون فعلاً في الجروب</Text>
        </View>
        <View style={{ backgroundColor: '#1a2d0a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: GREEN }}>
          <Text style={{ color: GREEN, fontSize: 11, fontWeight: '700' }}>حصري</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* Info card */}
        <View style={{ backgroundColor: '#0a1a2e', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1a3a5c', borderLeftWidth: 3, borderLeftColor: '#3B82F6' }}>
          <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>🎯 لماذا المتفاعلين أقوى؟</Text>
          <Text style={{ color: '#93C5FD', fontSize: 12, lineHeight: 20 }}>
            المتفاعلون هم الأشخاص الذين كتبوا رسائل فعلاً داخل الجروب — وهم أكثر تفاعلاً من مجرد الأعضاء الصامتين. استهدفهم للحصول على أعلى معدل استجابة.
          </Text>
        </View>

        {/* Group input */}
        <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
          <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>الجروب المستهدف</Text>
          <TextInput
            value={group}
            onChangeText={setGroup}
            placeholder="@username أو t.me/link"
            placeholderTextColor={MUTED}
            style={{ color: '#fff', fontSize: 14, padding: 12, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER }}
            editable={!isRunning}
          />
        </View>

        {/* Settings row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: GOLD, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>الحد الأقصى</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['200', '500', '1000', '5000', 'الكل'].map((v) => {
                const val = v === 'الكل' ? '100000' : v;
                const isSel = limit === val;
                return (
                  <TouchableOpacity key={v} onPress={() => !isRunning && setLimit(val)}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: isSel ? GOLD : BG, borderWidth: 1, borderColor: isSel ? GOLD : BORDER }}>
                    <Text style={{ color: isSel ? '#000' : MUTED, fontSize: 11, fontWeight: '700' }}>{v}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ flex: 1, backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: GOLD, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>آخر (أيام)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['7', '14', '30', '60', '90'].map((v) => {
                const isSel = lastDays === v;
                return (
                  <TouchableOpacity key={v} onPress={() => !isRunning && setLastDays(v)}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: isSel ? GOLD : BG, borderWidth: 1, borderColor: isSel ? GOLD : BORDER }}>
                    <Text style={{ color: isSel ? '#000' : MUTED, fontSize: 11, fontWeight: '700' }}>{v}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Progress */}
        {jobId && job && (
          <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {job.status === 'running' ? '⚡ جاري الاستخراج...' :
                 isDone ? '✅ اكتمل' : isFailed ? '❌ فشل' : '⏳ في الانتظار'}
              </Text>
              <Text style={{ color: GOLD, fontWeight: '700' }}>{pct}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: '#1a2235', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: isDone ? GREEN : GOLD, borderRadius: 3 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ color: MUTED, fontSize: 12 }}>متفاعلون: <Text style={{ color: isDone ? GREEN : '#fff', fontWeight: '700' }}>{job.progress}</Text></Text>
              {isDone && <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>تم الحفظ ✓</Text>}
            </View>
            {isFailed && <Text style={{ color: RED, marginTop: 6, fontSize: 12 }}>{job.error}</Text>}
          </View>
        )}

        {/* Result */}
        {isDone && savedFile && (
          <View style={{ backgroundColor: '#0a1f0d', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: GREEN }}>
            <Text style={{ color: GREEN, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
              ✅ تم استخراج {count} متفاعل
            </Text>
            <Text style={{ color: '#6EE7B7', fontSize: 12, textAlign: 'center', marginBottom: 14 }}>
              حُفظوا في ملف "{`متفاعلون - ${group}`}"
            </Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/members-file', params: { fileId: savedFile } })}
              style={{ backgroundColor: GREEN, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>عرض الملف وإضافتهم</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start button */}
        <TouchableOpacity
          onPress={handleStart}
          disabled={isRunning}
          style={{ backgroundColor: isRunning ? '#2a1f00' : GOLD, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: isRunning ? 0.8 : 1 }}>
          {isRunning ? <ActivityIndicator color={GOLD} size="small" /> : null}
          <Text style={{ color: isRunning ? GOLD : '#000', fontSize: 16, fontWeight: '800' }}>
            {isRunning ? 'جاري الاستخراج...' : '🎯 ابدأ استخراج المتفاعلين'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
