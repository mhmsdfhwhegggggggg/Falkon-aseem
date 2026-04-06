import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useAccountsStore } from '@/lib/accounts-store';
import { router } from 'expo-router';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStep = 'idle' | 'pick_mode' | 'enter_phone' | 'enter_phones' | 'enter_code' | 'enter_password' | 'success' | 'bulk_done';

interface QueuedPhone {
  phone: string;
  status: 'pending' | 'verifying' | 'needs_2fa' | 'done' | 'error';
  sessionId?: string;
  code?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, '');
  if (!clean) return '';
  if (!clean.startsWith('+')) return '+' + clean;
  return clean;
}

function parsePhoneList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map(normalizePhone)
    .filter((p) => p.length >= 7);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const scheme = useColorScheme();
  const p = colors[scheme];

  // ── State ───────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  // Single mode
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Bulk mode
  const [bulkText, setBulkText] = useState('');
  const [queue, setQueue] = useState<QueuedPhone[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [bulkCode, setBulkCode] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // ── Local Store (sessions & files stored on device) ─────────────────────────
  const localStore = useAccountsStore();

  // ── tRPC (auth only — server does not store sessions) ────────────────────────
  const startAuthMut = trpc.accounts.startAuth.useMutation();
  const confirmAuthMut = trpc.accounts.confirmAuth.useMutation();
  const resendMut = trpc.accounts.resendCode.useMutation();

  const accounts = localStore.accounts;
  const filtered = accounts.filter(
    (a) => !search || a.phone.includes(search) || a.username.toLowerCase().includes(search.toLowerCase())
  );

  // ── Single-account flow ──────────────────────────────────────────────────────

  const resetSingle = () => {
    setPhone(''); setCode(''); setPassword(''); setSessionId('');
    setAuthLoading(false);
  };

  const handleSingleSendCode = useCallback(async () => {
    const n = normalizePhone(phone);
    if (n.length < 7) return Alert.alert('خطأ', 'أدخل رقم الهاتف مع رمز الدولة مثال: +966501234567');
    setAuthLoading(true);
    try {
      const res = await startAuthMut.mutateAsync({ phone: n });
      setSessionId(res.sessionId);
      setPhone(n);
      setAuthStep('enter_code');
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل إرسال الكود');
    } finally {
      setAuthLoading(false);
    }
  }, [phone]);

  // ── Helper: save account + session to device after successful auth ────────────
  const saveAuthResult = useCallback(async (result: any) => {
    const today = new Date().toISOString().split('T')[0]!;
    const account = {
      id: `acc_${result.userId}`,
      phone: result.phone,
      firstName: result.firstName || '',
      lastName: result.lastName || '',
      username: result.username || '',
      userId: result.userId,
      addedAt: new Date().toISOString(),
      isActive: true,
      dailyAdded: 0,
      lastReset: today,
    };
    await localStore.addAccount(account, result.sessionString || '');
  }, [localStore]);

  const handleSingleVerifyCode = useCallback(async () => {
    if (!code.trim()) return Alert.alert('خطأ', 'أدخل كود التحقق');
    setAuthLoading(true);
    try {
      const result = await confirmAuthMut.mutateAsync({ sessionId, code: code.trim() });
      await saveAuthResult(result);
      setAuthStep('success');
      setTimeout(() => { setAuthStep('idle'); resetSingle(); }, 2000);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('PASSWORD_NEEDED') || msg.includes('SESSION_PASSWORD')) {
        setAuthStep('enter_password');
      } else {
        Alert.alert('خطأ', msg || 'كود غير صحيح');
      }
    } finally {
      setAuthLoading(false);
    }
  }, [sessionId, code, saveAuthResult]);

  const handleSingleVerifyPassword = useCallback(async () => {
    if (!password.trim()) return Alert.alert('خطأ', 'أدخل كلمة مرور 2FA');
    setAuthLoading(true);
    try {
      const result = await confirmAuthMut.mutateAsync({ sessionId, code: code.trim(), password: password.trim() });
      await saveAuthResult(result);
      setAuthStep('success');
      setTimeout(() => { setAuthStep('idle'); resetSingle(); }, 2000);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'كلمة مرور خاطئة');
    } finally {
      setAuthLoading(false);
    }
  }, [sessionId, code, password, saveAuthResult]);

  // ── Bulk flow ────────────────────────────────────────────────────────────────

  const resetBulk = () => {
    setBulkText(''); setQueue([]); setQueueIdx(0); setBulkCode('');
    setBulkPassword(''); setNeeds2FA(false); setBulkLoading(false);
    setAddedCount(0); setErrorCount(0);
  };

  const startBulkAuth = useCallback(async () => {
    const phones = parsePhoneList(bulkText);
    if (phones.length === 0) return Alert.alert('خطأ', 'أدخل رقم هاتف واحد على الأقل');

    const q: QueuedPhone[] = phones.map((ph) => ({ phone: ph, status: 'pending' }));
    setQueue(q);
    setQueueIdx(0);
    setAddedCount(0);
    setErrorCount(0);
    setBulkCode('');
    setBulkPassword('');
    setNeeds2FA(false);

    // Send code to first phone
    await sendCodeForIndex(q, 0);
  }, [bulkText]);

  const sendCodeForIndex = async (q: QueuedPhone[], idx: number) => {
    if (idx >= q.length) {
      setAuthStep('bulk_done');
      return;
    }

    const updated = [...q];
    updated[idx] = { ...updated[idx]!, status: 'verifying' };
    setQueue(updated);
    setQueueIdx(idx);
    setBulkLoading(true);
    setBulkCode('');
    setBulkPassword('');
    setNeeds2FA(false);

    try {
      const res = await startAuthMut.mutateAsync({ phone: updated[idx]!.phone });
      updated[idx] = { ...updated[idx]!, sessionId: res.sessionId, status: 'verifying' };
      setQueue([...updated]);
      setAuthStep('enter_code');
    } catch (err: any) {
      updated[idx] = { ...updated[idx]!, status: 'error', error: err.message };
      setQueue([...updated]);
      setErrorCount((c) => c + 1);
      // Auto-skip to next
      await sendCodeForIndex(updated, idx + 1);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkVerifyCode = useCallback(async () => {
    if (!bulkCode.trim()) return Alert.alert('خطأ', 'أدخل كود التحقق');
    const current = queue[queueIdx];
    if (!current?.sessionId) return;

    setBulkLoading(true);
    try {
      const result = await confirmAuthMut.mutateAsync({ sessionId: current.sessionId, code: bulkCode.trim() });
      await saveAuthResult(result);
      const updated = [...queue];
      updated[queueIdx] = { ...updated[queueIdx]!, status: 'done' };
      setQueue(updated);
      setAddedCount((c) => c + 1);
      await sendCodeForIndex(updated, queueIdx + 1);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('PASSWORD_NEEDED') || msg.includes('SESSION_PASSWORD')) {
        setNeeds2FA(true);
      } else {
        const updated = [...queue];
        updated[queueIdx] = { ...updated[queueIdx]!, status: 'error', error: msg };
        setQueue(updated);
        setErrorCount((c) => c + 1);
        await sendCodeForIndex(updated, queueIdx + 1);
      }
    } finally {
      setBulkLoading(false);
    }
  }, [queue, queueIdx, bulkCode, saveAuthResult]);

  const handleBulkVerify2FA = useCallback(async () => {
    if (!bulkPassword.trim()) return Alert.alert('خطأ', 'أدخل كلمة مرور 2FA');
    const current = queue[queueIdx];
    if (!current?.sessionId) return;

    setBulkLoading(true);
    try {
      const result = await confirmAuthMut.mutateAsync({
        sessionId: current.sessionId,
        code: bulkCode.trim(),
        password: bulkPassword.trim(),
      });
      await saveAuthResult(result);
      const updated = [...queue];
      updated[queueIdx] = { ...updated[queueIdx]!, status: 'done' };
      setQueue(updated);
      setAddedCount((c) => c + 1);
      setNeeds2FA(false);
      await sendCodeForIndex(updated, queueIdx + 1);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'كلمة مرور خاطئة');
    } finally {
      setBulkLoading(false);
    }
  }, [queue, queueIdx, bulkCode, bulkPassword, saveAuthResult]);

  const skipCurrentBulk = useCallback(async () => {
    const updated = [...queue];
    updated[queueIdx] = { ...updated[queueIdx]!, status: 'error', error: 'Skipped' };
    setQueue(updated);
    setErrorCount((c) => c + 1);
    setNeeds2FA(false);
    await sendCodeForIndex(updated, queueIdx + 1);
  }, [queue, queueIdx]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const handleRemove = (id: string) => {
    Alert.alert('حذف الحساب', 'هل أنت متأكد من حذف هذا الحساب؟\nسيُحذف من الجهاز نهائياً.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await localStore.removeAccount(id);
        },
      },
    ]);
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await localStore.setActive(id, !current);
  };

  // ── Modal ────────────────────────────────────────────────────────────────────

  const currentBulk = queue[queueIdx];
  const isBulk = queue.length > 0;
  const modalVisible = authStep !== 'idle';

  const renderModal = () => (
    <Modal visible={modalVisible} animationType="slide" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#00000085', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: p.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 24,
          paddingBottom: 40,
          maxHeight: '92%',
        }}>

          {/* ── Mode Picker ──────────────────────────────────────────────────── */}
          {authStep === 'pick_mode' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ color: p.foreground, fontSize: 20, fontWeight: '800' }}>إضافة حسابات</Text>
                <TouchableOpacity onPress={() => setAuthStep('idle')}>
                  <MaterialIcons name="close" size={22} color={p.muted} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: p.primary + '15', borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1.5, borderColor: p.primary + '40', flexDirection: 'row', alignItems: 'center', gap: 16 }}
                onPress={() => { setAuthStep('enter_phone'); setPhone(''); }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: p.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="person-add" size={26} color={p.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: p.foreground, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>حساب واحد</Text>
                  <Text style={{ color: p.muted, fontSize: 13 }}>أضف حساب تليجرام واحد عبر رقم الهاتف</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={p.muted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#10B98115', borderRadius: 18, padding: 20, borderWidth: 1.5, borderColor: '#10B98140', flexDirection: 'row', alignItems: 'center', gap: 16 }}
                onPress={() => { setAuthStep('enter_phones'); setBulkText(''); }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: '#10B98120', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="group-add" size={26} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: p.foreground, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>مجموعة حسابات</Text>
                  <Text style={{ color: p.muted, fontSize: 13 }}>أضف عدداً غير محدود من الحسابات دفعة واحدة</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={p.muted} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Single: Enter Phone ───────────────────────────────────────────── */}
          {authStep === 'enter_phone' && (
            <>
              <ModalHeader title="إضافة حساب" onBack={() => setAuthStep('pick_mode')} />
              <Text style={{ color: p.muted, fontSize: 13, marginBottom: 16 }}>
                أدخل رقم الهاتف مع رمز الدولة. سيرسل تليجرام كود تحقق.
              </Text>
              <PhoneInput value={phone} onChange={setPhone} palette={p} />
              <View style={{ gap: 10, marginTop: 8 }}>
                <PrimaryBtn label="إرسال الكود" loading={authLoading} onPress={handleSingleSendCode} palette={p} />
              </View>
            </>
          )}

          {/* ── Single: Enter Code ────────────────────────────────────────────── */}
          {authStep === 'enter_code' && !isBulk && (
            <>
              <ModalHeader
                title="كود التحقق"
                onBack={() => setAuthStep('enter_phone')}
                subtitle={`أُرسل الكود إلى ${phone}`}
              />
              <CodeInput value={code} onChange={setCode} palette={p} />
              <View style={{ gap: 10, marginTop: 8 }}>
                <PrimaryBtn label="تحقق من الكود" loading={authLoading} onPress={handleSingleVerifyCode} palette={p} />
                <TouchableOpacity style={{ alignItems: 'center', padding: 8 }} onPress={() => resendMut.mutate({ sessionId })}>
                  <Text style={{ color: p.primary, fontSize: 13, fontWeight: '600' }}>إعادة إرسال الكود</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Single: 2FA Password ──────────────────────────────────────────── */}
          {authStep === 'enter_password' && !isBulk && (
            <>
              <ModalHeader title="كلمة مرور 2FA" subtitle="هذا الحساب محمي بمصادقة ثنائية" />
              <PasswordInput value={password} onChange={setPassword} palette={p} />
              <View style={{ gap: 10, marginTop: 8 }}>
                <PrimaryBtn label="تأكيد" loading={authLoading} onPress={handleSingleVerifyPassword} palette={p} />
              </View>
            </>
          )}

          {/* ── Single: Success ───────────────────────────────────────────────── */}
          {authStep === 'success' && !isBulk && (
            <SuccessCard message="تمت إضافة الحساب بنجاح!" palette={p} />
          )}

          {/* ── Bulk: Enter Phones ────────────────────────────────────────────── */}
          {authStep === 'enter_phones' && (
            <>
              <ModalHeader title="مجموعة حسابات" onBack={() => setAuthStep('pick_mode')} />
              <Text style={{ color: p.muted, fontSize: 13, marginBottom: 12 }}>
                أدخل أرقام الهواتف (رقم في كل سطر، أو مفصولة بفاصلة). بلا حد للعدد.
              </Text>
              <View style={{ backgroundColor: p.background, borderRadius: 14, borderWidth: 1, borderColor: p.border, padding: 14, marginBottom: 12 }}>
                <TextInput
                  value={bulkText}
                  onChangeText={setBulkText}
                  placeholder={`+966501234567\n+966509876543\n+1234567890`}
                  placeholderTextColor={p.muted}
                  multiline
                  style={{ color: p.foreground, fontSize: 14, fontFamily: 'monospace', minHeight: 140, textAlignVertical: 'top' }}
                  autoFocus
                />
              </View>
              {bulkText.trim() && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: p.primary + '10', borderRadius: 10, padding: 10 }}>
                  <MaterialIcons name="info-outline" size={14} color={p.primary} />
                  <Text style={{ color: p.primary, fontSize: 12, fontWeight: '600' }}>
                    {parsePhoneList(bulkText).length} رقم سيتم التحقق منهم بالتسلسل
                  </Text>
                </View>
              )}
              <PrimaryBtn
                label={`بدء التحقق (${parsePhoneList(bulkText).length} حساب)`}
                loading={bulkLoading}
                onPress={startBulkAuth}
                palette={p}
                color="#10B981"
              />
            </>
          )}

          {/* ── Bulk: Verify Code ─────────────────────────────────────────────── */}
          {authStep === 'enter_code' && isBulk && !needs2FA && (
            <>
              <BulkProgress queue={queue} current={queueIdx} added={addedCount} errors={errorCount} palette={p} />
              <View style={{ backgroundColor: p.background, borderRadius: 14, borderWidth: 1, borderColor: p.border, padding: 14, marginBottom: 4 }}>
                <Text style={{ color: p.muted, fontSize: 11, marginBottom: 4 }}>
                  الكود المرسل إلى {currentBulk?.phone}
                </Text>
                <TextInput
                  value={bulkCode}
                  onChangeText={setBulkCode}
                  placeholder="12345"
                  placeholderTextColor={p.muted}
                  keyboardType="number-pad"
                  maxLength={10}
                  style={{ color: p.foreground, fontSize: 28, fontWeight: '800', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 }}
                  autoFocus
                />
              </View>
              <View style={{ gap: 8, marginTop: 12 }}>
                <PrimaryBtn label="تحقق ✓" loading={bulkLoading} onPress={handleBulkVerifyCode} palette={p} />
                <SecondaryBtn label="تخطي هذا الحساب" onPress={skipCurrentBulk} palette={p} />
              </View>
            </>
          )}

          {/* ── Bulk: 2FA ─────────────────────────────────────────────────────── */}
          {authStep === 'enter_code' && isBulk && needs2FA && (
            <>
              <BulkProgress queue={queue} current={queueIdx} added={addedCount} errors={errorCount} palette={p} />
              <View style={{ backgroundColor: '#FBBF2410', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', gap: 8 }}>
                <MaterialIcons name="lock" size={16} color="#FBBF24" />
                <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '600', flex: 1 }}>
                  هذا الحساب محمي بمصادقة ثنائية — أدخل كلمة المرور
                </Text>
              </View>
              <PasswordInput value={bulkPassword} onChange={setBulkPassword} palette={p} />
              <View style={{ gap: 8, marginTop: 12 }}>
                <PrimaryBtn label="تأكيد كلمة المرور" loading={bulkLoading} onPress={handleBulkVerify2FA} palette={p} />
                <SecondaryBtn label="تخطي هذا الحساب" onPress={skipCurrentBulk} palette={p} />
              </View>
            </>
          )}

          {/* ── Bulk: Done ────────────────────────────────────────────────────── */}
          {authStep === 'bulk_done' && (
            <>
              <View style={{ alignItems: 'center', paddingVertical: 20, gap: 14 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#10B98120', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="check-circle" size={40} color="#10B981" />
                </View>
                <Text style={{ color: p.foreground, fontSize: 22, fontWeight: '800' }}>اكتملت العملية!</Text>
                <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#10B981', fontSize: 28, fontWeight: '900' }}>{addedCount}</Text>
                    <Text style={{ color: p.muted, fontSize: 12 }}>أُضيف بنجاح</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: p.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#F87171', fontSize: 28, fontWeight: '900' }}>{errorCount}</Text>
                    <Text style={{ color: p.muted, fontSize: 12 }}>فشل / تخطي</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: p.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: p.foreground, fontSize: 28, fontWeight: '900' }}>{queue.length}</Text>
                    <Text style={{ color: p.muted, fontSize: 12 }}>إجمالي</Text>
                  </View>
                </View>
                <ScrollView style={{ maxHeight: 180, width: '100%', marginTop: 12 }} showsVerticalScrollIndicator={false}>
                  {queue.map((q, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: p.border }}>
                      <MaterialIcons
                        name={q.status === 'done' ? 'check-circle' : 'cancel'}
                        size={16}
                        color={q.status === 'done' ? '#10B981' : '#F87171'}
                      />
                      <Text style={{ color: p.foreground, fontSize: 13, flex: 1 }}>{q.phone}</Text>
                      {q.error && <Text style={{ color: '#F87171', fontSize: 11 }}>{q.error.slice(0, 20)}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </View>
              <PrimaryBtn label="إغلاق" loading={false} onPress={() => { setAuthStep('idle'); resetBulk(); }} palette={p} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View>
            <Text style={{ color: p.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Telegram</Text>
            <Text style={{ color: p.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>الحسابات</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: p.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            onPress={() => setAuthStep('pick_mode')}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>إضافة</Text>
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        {accounts.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14 }}>
            <StatChip icon="people" label={`${accounts.length} حساب`} color={p.primary} palette={p} />
            <StatChip icon="check-circle" label={`${accounts.filter(a => a.isActive).length} نشط`} color="#10B981" palette={p} />
            <StatChip icon="how-to-reg" label={`${accounts.reduce((s, a) => s + a.dailyAdded, 0)} اليوم`} color="#FBBF24" palette={p} />
          </View>
        )}

        {/* Search */}
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: p.surface, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: p.border, gap: 8 }}>
            <MaterialIcons name="search" size={18} color={p.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث عن حساب..."
              placeholderTextColor={p.muted}
              style={{ flex: 1, color: p.foreground, fontSize: 14, paddingVertical: 10 }}
            />
          </View>
        </View>

        {/* Account list */}
        {localStore.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={p.primary} size="large" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
            {filtered.length === 0 ? (
              <EmptyState palette={p} onAdd={() => setAuthStep('pick_mode')} hasSearch={!!search} />
            ) : (
              filtered.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  palette={p}
                  onRemove={() => handleRemove(account.id)}
                  onToggle={() => handleToggleActive(account.id, account.isActive)}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {renderModal()}
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ModalHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: subtitle ? 4 : 0 }}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={{ padding: 2 }}>
            <MaterialIcons name="arrow-back" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        <Text style={{ color: '#F9FAFB', fontSize: 18, fontWeight: '800', flex: 1 }}>{title}</Text>
      </View>
      {subtitle && <Text style={{ color: '#6B7280', fontSize: 13, marginLeft: onBack ? 30 : 0 }}>{subtitle}</Text>}
    </View>
  );
}

function PhoneInput({ value, onChange, palette }: any) {
  return (
    <View style={{ backgroundColor: palette.background, borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <MaterialIcons name="phone" size={18} color={palette.primary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="+966 501 234 567"
        placeholderTextColor={palette.muted}
        keyboardType="phone-pad"
        style={{ color: palette.foreground, fontSize: 18, fontWeight: '600', flex: 1 }}
        autoFocus
      />
    </View>
  );
}

function CodeInput({ value, onChange, palette }: any) {
  return (
    <View style={{ backgroundColor: palette.background, borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="12345"
        placeholderTextColor={palette.muted}
        keyboardType="number-pad"
        maxLength={10}
        style={{ color: palette.foreground, fontSize: 32, fontWeight: '900', letterSpacing: 8, textAlign: 'center' }}
        autoFocus
      />
    </View>
  );
}

function PasswordInput({ value, onChange, palette }: any) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ backgroundColor: palette.background, borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <MaterialIcons name="lock" size={18} color="#FBBF24" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="كلمة مرور 2FA"
        placeholderTextColor={palette.muted}
        secureTextEntry={!show}
        style={{ color: palette.foreground, fontSize: 16, flex: 1 }}
        autoFocus
      />
      <TouchableOpacity onPress={() => setShow(!show)}>
        <MaterialIcons name={show ? "visibility-off" : "visibility"} size={18} color={palette.muted} />
      </TouchableOpacity>
    </View>
  );
}

function PrimaryBtn({ label, loading, onPress, palette, color }: any) {
  const bg = color || palette.primary;
  return (
    <TouchableOpacity
      style={{ backgroundColor: bg, borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: loading ? 0.7 : 1 }}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryBtn({ label, onPress, palette }: any) {
  return (
    <TouchableOpacity
      style={{ borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: palette.border }}
      onPress={onPress}
    >
      <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SuccessCard({ message, palette }: { message: string; palette: any }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 12 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#10B98120', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name="check-circle" size={40} color="#10B981" />
      </View>
      <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>{message}</Text>
    </View>
  );
}

function BulkProgress({ queue, current, added, errors, palette }: {
  queue: QueuedPhone[]; current: number; added: number; errors: number; palette: any;
}) {
  const total = queue.length;
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '800' }}>
          التحقق من الحساب {current + 1} / {total}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>✓ {added}</Text>
          <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>✗ {errors}</Text>
        </View>
      </View>
      <View style={{ height: 6, backgroundColor: palette.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#10B981', borderRadius: 4 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {queue.map((q, i) => (
            <View key={i} style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor:
                q.status === 'done' ? '#10B98120' :
                q.status === 'error' ? '#F8717120' :
                i === current ? palette.primary + '20' :
                palette.border,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: i === current ? 2 : 0,
              borderColor: palette.primary,
            }}>
              <MaterialIcons
                name={
                  q.status === 'done' ? 'check' :
                  q.status === 'error' ? 'close' :
                  i === current ? 'hourglass-empty' :
                  'radio-button-unchecked'
                }
                size={14}
                color={
                  q.status === 'done' ? '#10B981' :
                  q.status === 'error' ? '#F87171' :
                  i === current ? palette.primary :
                  palette.muted
                }
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function AccountCard({ account, palette, onRemove, onToggle }: any) {
  const initials = (account.firstName?.[0] || account.phone.slice(-2)).toUpperCase();
  const colors2 = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'];
  const color = colors2[account.phone.length % colors2.length] || '#8B5CF6';
  return (
    <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: palette.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color, fontSize: 16, fontWeight: '800' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>
            {account.firstName} {account.lastName}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>
            {account.phone}{account.username ? ` · @${account.username}` : ''}
          </Text>
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <TouchableOpacity onPress={onToggle} style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
            backgroundColor: (account.isActive ? '#10B981' : '#9CA3AF') + '20',
          }}>
            <Text style={{ color: account.isActive ? '#10B981' : '#9CA3AF', fontSize: 10, fontWeight: '700' }}>
              {account.isActive ? '● نشط' : '○ معطّل'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemove}>
            <MaterialIcons name="delete-outline" size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border, gap: 16, alignItems: 'center' }}>
        <MiniStat label="أُضيف اليوم" value={account.dailyAdded} palette={palette} />
        <MiniStat label="المعرف" value={account.userId || '—'} palette={palette} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: palette.primary + '15',
            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
            borderWidth: 1, borderColor: palette.primary + '30',
          }}
          onPress={() => router.push({ pathname: '/account-health', params: { accountId: account.id } } as any)}
        >
          <MaterialIcons name="monitor-heart" size={13} color={palette.primary} />
          <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '700' }}>فحص الصحة</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MiniStat({ label, value, palette }: any) {
  return (
    <View>
      <Text style={{ color: palette.muted, fontSize: 10, marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function StatChip({ icon, label, color, palette }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: color + '15', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
      <MaterialIcons name={icon} size={13} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function EmptyState({ palette, onAdd, hasSearch }: { palette: any; onAdd: () => void; hasSearch: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, gap: 14 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name="people-outline" size={36} color={palette.primary} />
      </View>
      <Text style={{ color: palette.foreground, fontSize: 18, fontWeight: '700' }}>
        {hasSearch ? 'لا نتائج' : 'لا توجد حسابات بعد'}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
        {hasSearch ? 'لا توجد حسابات تطابق بحثك' : 'أضف حسابات تليجرام لبدء الأتمتة.\nيمكنك إضافة عدد غير محدود من الحسابات.'}
      </Text>
      {!hasSearch && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity
            style={{ backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={onAdd}
          >
            <MaterialIcons name="person-add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>إضافة حساب</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={onAdd}
          >
            <MaterialIcons name="group-add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>إضافة مجموعة</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
