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

const GOLD   = '#F59E0B';
const BG     = '#030712';
const SURF   = '#0D1117';
const BORDER = '#1a2235';
const GREEN  = '#34D399';
const RED    = '#F87171';
const MUTED  = '#6B7280';
const BLUE   = '#3B82F6';
const ORANGE = '#F97316';

type TabType = 'join' | 'leave' | 'send' | 'admins';

interface TabDef {
  id: TabType;
  label: string;
  icon: string;
  color: string;
}

const TABS: TabDef[] = [
  { id: 'join',   label: 'انضمام',   icon: '➕', color: GREEN  },
  { id: 'leave',  label: 'مغادرة',  icon: '🚪', color: RED    },
  { id: 'send',   label: 'إرسال للكل', icon: '📢', color: BLUE  },
  { id: 'admins', label: 'الأدمن',   icon: '👑', color: GOLD  },
];

export default function GroupManagerScreen() {
  const trpc = useTRPC();
  const { activeAccounts, getSession } = useAccountsStore();

  const [tab, setTab]             = useState<TabType>('join');
  const [groupsText, setGroupsText] = useState('');
  const [message, setMessage]     = useState('');
  const [adminGroup, setAdminGroup] = useState('');
  const [delay, setDelay]         = useState('3');
  const [jobId, setJobId]         = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const joinMut   = useMutation(trpc.groupManager.join.mutationOptions());
  const leaveMut  = useMutation(trpc.groupManager.leave.mutationOptions());
  const sendMut   = useMutation(trpc.groupManager.sendToAll.mutationOptions());
  const adminsMut = useMutation(trpc.groupManager.extractAdmins.mutationOptions());

  const statusQ = useQuery({
    ...trpc.groupManager.status.queryOptions({ jobId: jobId! }),
    enabled: !!jobId,
    refetchInterval: isRunning ? 2000 : false,
    staleTime: 0,
  });

  const job = statusQ.data;

  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed') setIsRunning(false);
  }, [job?.status]);

  const reset = () => { setJobId(null); setIsRunning(false); };

  const getSession_ = async () => {
    if (activeAccounts.length === 0) { Alert.alert('لا يوجد حساب', 'أضف حساباً نشطاً'); return null; }
    const acc = activeAccounts[0];
    const s   = await getSession(acc.id);
    if (!s) { Alert.alert('خطأ', 'لا يمكن تحميل الجلسة'); return null; }
    return { acc, session: s };
  };

  const lines = groupsText.split('\n').map((l) => l.trim()).filter(Boolean);

  const handleAction = async () => {
    const ctx = await getSession_();
    if (!ctx) return;
    const { acc, session } = ctx;

    try {
      setIsRunning(true);
      let res: any;

      if (tab === 'join') {
        if (lines.length === 0) { setIsRunning(false); return Alert.alert('خطأ', 'أدخل روابط الجروبات'); }
        res = await joinMut.mutateAsync({ groups: lines, delaySeconds: parseInt(delay) || 3, accountId: acc.id, sessionString: session });
      } else if (tab === 'leave') {
        if (!window.confirm?.('هل أنت متأكد من مغادرة ' + (lines.length > 0 ? `${lines.length} جروب` : 'كل الجروبات') + '؟')) {
          setIsRunning(false); return;
        }
        res = await leaveMut.mutateAsync({ groups: lines.length > 0 ? lines : undefined, accountId: acc.id, sessionString: session });
      } else if (tab === 'send') {
        if (!message.trim()) { setIsRunning(false); return Alert.alert('خطأ', 'أدخل الرسالة'); }
        res = await sendMut.mutateAsync({ message: message.trim(), delaySeconds: parseInt(delay) || 5, accountId: acc.id, sessionString: session });
      } else if (tab === 'admins') {
        if (!adminGroup.trim()) { setIsRunning(false); return Alert.alert('خطأ', 'أدخل رابط الجروب'); }
        res = await adminsMut.mutateAsync({ group: adminGroup.trim(), accountId: acc.id, sessionString: session });
      }

      if (res?.jobId) setJobId(res.jobId);
    } catch (e: any) {
      setIsRunning(false);
      Alert.alert('فشل', e.message || 'حدث خطأ');
    }
  };

  const isDone   = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  const pct      = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
  const currentTab = TABS.find((t) => t.id === tab)!;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ color: GOLD, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>مدير الجروبات</Text>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => { setTab(t.id); reset(); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: isActive ? t.color + '22' : SURF, borderWidth: 1, borderColor: isActive ? t.color : BORDER }}>
              <Text style={{ fontSize: 18 }}>{t.icon}</Text>
              <Text style={{ color: isActive ? t.color : MUTED, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* JOIN TAB */}
        {tab === 'join' && (
          <>
            <View style={{ backgroundColor: '#0a1a0d', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1a4a1a', borderLeftWidth: 3, borderLeftColor: GREEN }}>
              <Text style={{ color: '#6EE7B7', fontSize: 12, lineHeight: 20 }}>
                💡 أدخل روابط الجروبات أو أسماء المستخدمين (رابط في كل سطر). يدعم الروابط العامة والخاصة (t.me/joinchat/...).
              </Text>
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>روابط الجروبات</Text>
                <Text style={{ color: MUTED, fontSize: 11 }}>{lines.length} رابط</Text>
              </View>
              <TextInput
                value={groupsText} onChangeText={setGroupsText}
                placeholder={'@groupname\nt.me/groupname\nhttps://t.me/joinchat/xxx'}
                placeholderTextColor={MUTED} multiline numberOfLines={8}
                style={{ color: '#fff', fontSize: 13, padding: 12, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, minHeight: 140, textAlignVertical: 'top' }}
                editable={!isRunning}
              />
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>التأخير (ثواني)</Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                {['2', '3', '5', '10', '15'].map((v) => (
                  <TouchableOpacity key={v} onPress={() => !isRunning && setDelay(v)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: delay === v ? GREEN : BG, borderWidth: 1, borderColor: delay === v ? GREEN : BORDER }}>
                    <Text style={{ color: delay === v ? '#000' : MUTED, fontSize: 11, fontWeight: '700' }}>{v}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* LEAVE TAB */}
        {tab === 'leave' && (
          <>
            <View style={{ backgroundColor: '#1f0a0a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#4a1a1a', borderLeftWidth: 3, borderLeftColor: RED }}>
              <Text style={{ color: '#FCA5A5', fontSize: 12, lineHeight: 20 }}>
                ⚠️ اتركه فارغاً لمغادرة كل الجروبات التي ينضم إليها الحساب. أو أدخل روابط محددة.
              </Text>
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: RED, fontSize: 12, fontWeight: '700' }}>جروبات للمغادرة (اختياري)</Text>
                <Text style={{ color: MUTED, fontSize: 11 }}>{lines.length || 'الكل'}</Text>
              </View>
              <TextInput
                value={groupsText} onChangeText={setGroupsText}
                placeholder={'اتركه فارغاً لمغادرة كل الجروبات\nأو @group لمغادرة جروب محدد'}
                placeholderTextColor={MUTED} multiline numberOfLines={6}
                style={{ color: '#fff', fontSize: 13, padding: 12, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, minHeight: 120, textAlignVertical: 'top' }}
                editable={!isRunning}
              />
            </View>
          </>
        )}

        {/* SEND TO ALL TAB */}
        {tab === 'send' && (
          <>
            <View style={{ backgroundColor: '#0a1020', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1a2040', borderLeftWidth: 3, borderLeftColor: BLUE }}>
              <Text style={{ color: '#93C5FD', fontSize: 12, lineHeight: 20 }}>
                📢 ترسل هذه الرسالة لكل الجروبات والقنوات التي ينضم إليها الحساب تلقائياً.
              </Text>
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: BLUE, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>الرسالة</Text>
              <TextInput
                value={message} onChangeText={setMessage}
                placeholder="أدخل الرسالة التي ستُرسل لكل الجروبات..."
                placeholderTextColor={MUTED} multiline numberOfLines={6}
                style={{ color: '#fff', fontSize: 13, padding: 12, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, minHeight: 120, textAlignVertical: 'top' }}
                editable={!isRunning}
              />
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: BLUE, fontSize: 12, fontWeight: '700' }}>التأخير (ثواني)</Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                {['3', '5', '10', '20', '30'].map((v) => (
                  <TouchableOpacity key={v} onPress={() => !isRunning && setDelay(v)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: delay === v ? BLUE : BG, borderWidth: 1, borderColor: delay === v ? BLUE : BORDER }}>
                    <Text style={{ color: delay === v ? '#fff' : MUTED, fontSize: 11, fontWeight: '700' }}>{v}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ADMINS TAB */}
        {tab === 'admins' && (
          <>
            <View style={{ backgroundColor: '#1a1000', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#3a2a00', borderLeftWidth: 3, borderLeftColor: GOLD }}>
              <Text style={{ color: '#FDE68A', fontSize: 12, lineHeight: 20 }}>
                👑 استخرج قائمة الأدمن من أي جروب أو قناة. يمكنك بعدها إرسال رسائل لهم أو إضافتهم.
              </Text>
            </View>
            <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>الجروب</Text>
              <TextInput
                value={adminGroup} onChangeText={setAdminGroup}
                placeholder="@groupname أو t.me/groupname"
                placeholderTextColor={MUTED}
                style={{ color: '#fff', fontSize: 14, padding: 12, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER }}
                editable={!isRunning}
              />
            </View>
          </>
        )}

        {/* Progress */}
        {jobId && job && (
          <View style={{ backgroundColor: SURF, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {job.status === 'running' ? `⚡ ${currentTab.label}...` : isDone ? '✅ اكتمل' : isFailed ? '❌ فشل' : '⏳ في الانتظار'}
              </Text>
              <Text style={{ color: currentTab.color, fontWeight: '700' }}>{job.total > 0 ? `${job.progress}/${job.total}` : job.progress}</Text>
            </View>
            {job.total > 0 && (
              <View style={{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: isDone ? GREEN : currentTab.color, borderRadius: 3 }} />
              </View>
            )}
            {isDone && (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={{ color: GREEN, fontSize: 13 }}>✅ نجح: {job.result?.added ?? 0}</Text>
                {(job.result?.failed ?? 0) > 0 && <Text style={{ color: RED, fontSize: 13 }}>❌ فشل: {job.result?.failed}</Text>}
              </View>
            )}
            {isFailed && <Text style={{ color: RED, fontSize: 12, marginTop: 4 }}>{job.error}</Text>}
          </View>
        )}

        {/* Action button */}
        <TouchableOpacity
          onPress={handleAction}
          disabled={isRunning}
          style={{ backgroundColor: isRunning ? BG : currentTab.color, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: isRunning ? 1 : 0, borderColor: currentTab.color }}>
          {isRunning ? <ActivityIndicator color={currentTab.color} size="small" /> : null}
          <Text style={{ color: isRunning ? currentTab.color : tab === 'send' || tab === 'admins' ? '#fff' : '#000', fontSize: 16, fontWeight: '800' }}>
            {isRunning ? 'جاري التنفيذ...' :
             tab === 'join' ? `➕ انضمام لـ ${lines.length} جروب` :
             tab === 'leave' ? `🚪 مغادرة ${lines.length > 0 ? lines.length + ' جروب' : 'كل الجروبات'}` :
             tab === 'send' ? '📢 إرسال لكل الجروبات' :
             '👑 استخراج الأدمن'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
