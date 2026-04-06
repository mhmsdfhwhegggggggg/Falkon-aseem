import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';

const BG = '#030712';
const SURFACE = '#0D1117';
const SURFACE2 = '#111827';
const BORDER = '#1a2235';
const GOLD = '#F59E0B';
const GREEN = '#34D399';
const RED = '#F87171';

const STORAGE_KEY = 'auto_reply_rules_v1';

interface Rule {
  id: string;
  trigger: string;
  response: string;
  matchType: 'contains' | 'exact' | 'startsWith';
  enabled: boolean;
}

const MATCH_LABELS = {
  contains: 'يحتوي على',
  exact: 'مطابق تام',
  startsWith: 'يبدأ بـ',
};

function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setRules(JSON.parse(raw));
    });
  }, []);
  const save = useCallback((next: Rule[]) => {
    setRules(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);
  return { rules, save };
}

export default function AutoReplyScreen() {
  const { rules, save } = useRules();
  const { activeAccounts, getSession } = useAccountsStore();
  const [trigger, setTrigger] = useState('');
  const [response, setResponse] = useState('');
  const [matchType, setMatchType] = useState<Rule['matchType']>('contains');
  const [showAdd, setShowAdd] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{ checked: number; matched: number; replied: number } | null>(null);

  const checkMutation = trpc.autoReply.check.useMutation({
    onSuccess(data) {
      setLastResult(data);
      Alert.alert('اكتمل الفحص', `تم فحص ${data.checked} رسالة، مطابقة: ${data.matched}، ردود مُرسلة: ${data.replied}`);
    },
    onError(err) {
      Alert.alert('خطأ', err.message);
    },
    onSettled() { setChecking(false); },
  });

  const addRule = () => {
    if (!trigger.trim() || !response.trim()) {
      Alert.alert('خطأ', 'يرجى ملء حقل الكلمة المفتاحية والرد');
      return;
    }
    const newRule: Rule = {
      id: Date.now().toString(),
      trigger: trigger.trim(),
      response: response.trim(),
      matchType,
      enabled: true,
    };
    save([...rules, newRule]);
    setTrigger('');
    setResponse('');
    setShowAdd(false);
  };

  const toggleRule = (id: string) => {
    save(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const deleteRule = (id: string) => {
    Alert.alert('حذف القاعدة', 'هل تريد حذف هذه القاعدة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => save(rules.filter((r) => r.id !== id)) },
    ]);
  };

  const runCheck = async () => {
    const activeAccs = activeAccounts;
    if (activeAccs.length === 0) {
      Alert.alert('لا توجد حسابات', 'يرجى تفعيل حساب أولاً من تبويب الحسابات');
      return;
    }
    if (rules.filter((r) => r.enabled).length === 0) {
      Alert.alert('لا توجد قواعد', 'أضف قاعدة رد تلقائي واحدة على الأقل');
      return;
    }
    setChecking(true);
    const acc = activeAccs[0];
    const sessionString = await getSession(acc.id);
    if (!sessionString) {
      setChecking(false);
      Alert.alert('خطأ', 'لا يمكن تحميل جلسة الحساب. يرجى إعادة تسجيل الدخول.');
      return;
    }
    checkMutation.mutate({
      sessionString,
      rules: rules.filter((r) => r.enabled).map((r) => ({
        id: r.id,
        trigger: r.trigger,
        response: r.response,
        matchType: r.matchType,
        enabled: r.enabled,
      })),
      limitDialogs: 15,
      limitMessages: 20,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="arrow-back" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>تشغيل آلي</Text>
            <Text style={{ color: '#F3F4F6', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>الرد التلقائي</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowAdd(!showAdd)}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: GREEN + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GREEN + '40' }}
          >
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={20} color={GREEN} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

          {/* Run Check Card */}
          <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, marginBottom: 20, overflow: 'hidden' }}>
            <View style={{ height: 2, backgroundColor: GREEN + '60' }} />
            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: '#F3F4F6', fontSize: 14, fontWeight: '800' }}>فحص الرسائل الآن</Text>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>
                    {rules.filter((r) => r.enabled).length} قاعدة مفعّلة
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={runCheck}
                  disabled={checking}
                  style={{ backgroundColor: checking ? '#374151' : GREEN + '20', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: checking ? BORDER : GREEN + '50', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <MaterialIcons name={checking ? 'hourglass-empty' : 'play-arrow'} size={18} color={checking ? '#6B7280' : GREEN} />
                  <Text style={{ color: checking ? '#6B7280' : GREEN, fontWeight: '800', fontSize: 13 }}>
                    {checking ? 'جارٍ الفحص...' : 'فحص'}
                  </Text>
                </TouchableOpacity>
              </View>

              {lastResult && (
                <View style={{ flexDirection: 'row', gap: 1, marginTop: 14, backgroundColor: '#ffffff06', borderRadius: 10, overflow: 'hidden' }}>
                  {[
                    { label: 'فُحصت', value: lastResult.checked, color: '#60A5FA' },
                    { label: 'طابقت', value: lastResult.matched, color: GOLD },
                    { label: 'أُرسلت', value: lastResult.replied, color: GREEN },
                  ].map((s, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: i < 2 ? 1 : 0, borderColor: '#ffffff10' }}>
                      <Text style={{ color: s.color, fontSize: 18, fontWeight: '900' }}>{s.value}</Text>
                      <Text style={{ color: '#4B5563', fontSize: 10, marginTop: 2, fontWeight: '600' }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Add Rule Form */}
          {showAdd && (
            <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: GOLD + '40', marginBottom: 20, overflow: 'hidden' }}>
              <View style={{ height: 2, backgroundColor: GOLD + '80' }} />
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>قاعدة جديدة</Text>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>الكلمة المفتاحية</Text>
                  <TextInput
                    value={trigger}
                    onChangeText={setTrigger}
                    placeholder="مثال: السعر، مرحبا، تواصل..."
                    placeholderTextColor="#374151"
                    style={{ backgroundColor: SURFACE2, borderRadius: 10, padding: 12, color: '#F3F4F6', borderWidth: 1, borderColor: BORDER, fontSize: 14, textAlign: 'right' }}
                  />
                </View>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>الرد التلقائي</Text>
                  <TextInput
                    value={response}
                    onChangeText={setResponse}
                    placeholder="الرسالة التي ستُرسل تلقائياً..."
                    placeholderTextColor="#374151"
                    multiline
                    style={{ backgroundColor: SURFACE2, borderRadius: 10, padding: 12, color: '#F3F4F6', borderWidth: 1, borderColor: BORDER, fontSize: 14, minHeight: 80, textAlignVertical: 'top', textAlign: 'right' }}
                  />
                </View>

                <View>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>نوع المطابقة</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['contains', 'startsWith', 'exact'] as Rule['matchType'][]).map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setMatchType(type)}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: matchType === type ? GOLD + '20' : SURFACE2, borderWidth: 1, borderColor: matchType === type ? GOLD + '60' : BORDER, alignItems: 'center' }}
                      >
                        <Text style={{ color: matchType === type ? GOLD : '#6B7280', fontSize: 10, fontWeight: '700' }}>{MATCH_LABELS[type]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={addRule}
                  style={{ backgroundColor: GOLD, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <MaterialIcons name="add-circle" size={18} color="#030712" />
                  <Text style={{ color: '#030712', fontWeight: '900', fontSize: 14 }}>إضافة القاعدة</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Rules Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 3, height: 18, backgroundColor: GOLD, borderRadius: 2 }} />
            <Text style={{ color: '#E5E7EB', fontSize: 14, fontWeight: '800' }}>القواعد المحفوظة</Text>
            <View style={{ marginRight: 'auto', backgroundColor: GOLD + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + '40' }}>
              <Text style={{ color: GOLD, fontSize: 10, fontWeight: '800' }}>{rules.length}</Text>
            </View>
          </View>

          {rules.length === 0 ? (
            <View style={{ backgroundColor: SURFACE, borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: BORDER, gap: 10 }}>
              <MaterialIcons name="reply" size={36} color="#374151" />
              <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                لا توجد قواعد بعد.{'\n'}أضف قاعدتك الأولى بالضغط على +
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {rules.map((rule) => (
                <View
                  key={rule.id}
                  style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: rule.enabled ? GREEN + '30' : BORDER, overflow: 'hidden' }}
                >
                  {/* Top accent */}
                  <View style={{ height: 1.5, backgroundColor: rule.enabled ? GREEN : '#374151' }} />
                  <View style={{ padding: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        {/* Trigger */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <View style={{ backgroundColor: GOLD + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: GOLD + '40' }}>
                            <Text style={{ color: GOLD, fontSize: 10, fontWeight: '800' }}>{MATCH_LABELS[rule.matchType]}</Text>
                          </View>
                          <Text style={{ color: '#F3F4F6', fontSize: 13, fontWeight: '800' }}>"{rule.trigger}"</Text>
                        </View>
                        {/* Response */}
                        <Text style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                          ↩ {rule.response}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center', gap: 10 }}>
                        <Switch
                          value={rule.enabled}
                          onValueChange={() => toggleRule(rule.id)}
                          trackColor={{ false: '#374151', true: GREEN + '60' }}
                          thumbColor={rule.enabled ? GREEN : '#6B7280'}
                        />
                        <TouchableOpacity onPress={() => deleteRule(rule.id)}>
                          <MaterialIcons name="delete-outline" size={20} color="#F87171" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
