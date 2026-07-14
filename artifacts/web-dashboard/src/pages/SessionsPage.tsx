import { useState, useRef } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { Phone, KeyRound, Save, Trash2, CheckCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

export function SessionsPage() {
  const { data, isLoading } = trpc.accounts.list.useQuery();
  const accounts = data?.accounts || [];

  const startAuthMut = trpc.accounts.startAuth.useMutation();
  const confirmAuthMut = trpc.accounts.confirmAuth.useMutation();
  const importSessionMut = trpc.accounts.importSession.useMutation();
  const removeAccountMut = trpc.accounts.remove.useMutation();
  const setActiveMut = trpc.accounts.setActive.useMutation();

  const [authMode, setAuthMode] = useState<'phone' | 'session'>('phone');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sessionString, setSessionString] = useState('');

  const handleStartAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    try {
      const res = await startAuthMut.mutateAsync({ phone });
      setSessionId(res.sessionId);
      toast.success('تم إرسال رمز التحقق');
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ');
    }
  };

  const handleConfirmAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !sessionId) return;
    try {
      await confirmAuthMut.mutateAsync({ sessionId, code, password });
      toast.success('تمت إضافة الحساب بنجاح');
      setSessionId('');
      setCode('');
      setPassword('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: [['accounts', 'list']] });
    } catch (err: any) {
      toast.error(err.message || 'رمز خاطئ أو كلمة مرور غير صحيحة');
    }
  };

  const handleImportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionString) return;
    try {
      await importSessionMut.mutateAsync({ sessionString });
      toast.success('تم استيراد الجلسة بنجاح');
      setSessionString('');
      queryClient.invalidateQueries({ queryKey: [['accounts', 'list']] });
    } catch (err: any) {
      toast.error(err.message || 'جلسة غير صالحة');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف الحساب؟')) return;
    try {
      await removeAccountMut.mutateAsync({ id });
      toast.success('تم حذف الحساب');
      queryClient.invalidateQueries({ queryKey: [['accounts', 'list']] });
    } catch (err: any) {
      toast.error('حدث خطأ');
    }
  };

  const handleSetActive = async (id: string, isActive: boolean) => {
    try {
      await setActiveMut.mutateAsync({ id, isActive });
      queryClient.invalidateQueries({ queryKey: [['accounts', 'list']] });
    } catch (err: any) {
      toast.error('حدث خطأ');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إدارة الجلسات</h1>
        <p className="text-muted-foreground mt-1">إضافة وإدارة حسابات تيليغرام</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
        <div className="flex gap-4 mb-6 border-b border-card-border pb-4">
          <button 
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${authMode === 'phone' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
            onClick={() => setAuthMode('phone')}
          >
            تسجيل برقم الهاتف
          </button>
          <button 
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${authMode === 'session' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
            onClick={() => setAuthMode('session')}
          >
            استيراد Session String
          </button>
        </div>

        {authMode === 'phone' && !sessionId && (
          <form onSubmit={handleStartAuth} className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">رقم الهاتف (مع رمز الدولة)</label>
              <div className="relative">
                <Phone className="w-5 h-5 absolute right-3 top-3 text-muted-foreground" />
                <input 
                  type="text" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  dir="ltr" 
                  placeholder="+1234567890" 
                  className="w-full bg-background border border-border rounded-lg pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={startAuthMut.isPending} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
              {startAuthMut.isPending ? 'جاري الإرسال...' : 'إرسال الرمز'}
            </button>
          </form>
        )}

        {authMode === 'phone' && sessionId && (
          <form onSubmit={handleConfirmAuth} className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">رمز التحقق</label>
              <div className="relative">
                <KeyRound className="w-5 h-5 absolute right-3 top-3 text-muted-foreground" />
                <input 
                  type="text" 
                  value={code} 
                  onChange={e => setCode(e.target.value)} 
                  dir="ltr" 
                  className="w-full bg-background border border-border rounded-lg pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">كلمة المرور (اختياري)</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                dir="ltr" 
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
              />
            </div>
            <button type="submit" disabled={confirmAuthMut.isPending} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 rounded-lg transition-colors shadow-lg shadow-primary/20">
              {confirmAuthMut.isPending ? 'جاري التحقق...' : 'تأكيد الرمز'}
            </button>
            <button type="button" onClick={() => setSessionId('')} className="w-full text-muted-foreground hover:text-foreground text-sm py-2">
              تغيير رقم الهاتف
            </button>
          </form>
        )}

        {authMode === 'session' && (
          <form onSubmit={handleImportSession} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">Session String</label>
              <textarea 
                value={sessionString} 
                onChange={e => setSessionString(e.target.value)} 
                dir="ltr" 
                rows={4}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-mono text-sm" 
                required
              />
            </div>
            <button type="submit" disabled={importSessionMut.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
              <Save className="w-5 h-5" />
              {importSessionMut.isPending ? 'جاري الاستيراد...' : 'حفظ الجلسة'}
            </button>
          </form>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-card-border">
          <h2 className="text-xl font-bold">الحسابات المسجلة</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">الاسم</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">الهاتف</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">الحالة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">لا توجد حسابات مضافة</td></tr>
              ) : (
                accounts.map((acc: any) => (
                  <tr key={acc.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      {acc.firstName} {acc.lastName} {acc.username && <span className="text-muted-foreground text-sm">@{acc.username}</span>}
                    </td>
                    <td className="px-6 py-4" dir="ltr">{acc.phone}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleSetActive(acc.id, !acc.isActive)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${acc.isActive ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        {acc.isActive ? 'نشط' : 'غير نشط'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleDelete(acc.id)} className="text-muted-foreground hover:text-destructive transition-colors p-2 rounded-lg hover:bg-destructive/10 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}