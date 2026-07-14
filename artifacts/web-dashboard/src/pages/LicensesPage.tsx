import { useState } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { getAdminSecret } from '@/lib/auth';
import { toast } from 'sonner';
import { Key, Copy, Plus, Loader2, ShieldCheck, XCircle, RefreshCw } from 'lucide-react';

export function LicensesPage() {
  const adminSecret = getAdminSecret();
  const { data: licensesData, isLoading } = trpc.admin.listLicenses.useQuery({ adminSecret });
  const { data: stats } = trpc.admin.stats.useQuery({ adminSecret });
  const licenses = licensesData || [];

  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('pro');
  const [days, setDays] = useState('30');
  const [maxAccounts, setMaxAccounts] = useState('5');

  const createMut = trpc.admin.createLicense.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء الترخيص بنجاح');
      queryClient.invalidateQueries({ queryKey: [['admin']] });
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeMut = trpc.admin.revoke.useMutation({
    onSuccess: () => {
      toast.success('تم إلغاء الترخيص');
      queryClient.invalidateQueries({ queryKey: [['admin']] });
    }
  });

  const renewMut = trpc.admin.renew.useMutation({
    onSuccess: () => {
      toast.success('تم تجديد الترخيص');
      queryClient.invalidateQueries({ queryKey: [['admin']] });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      adminSecret, phone, tier: tier as any,
      days: parseInt(days, 10), maxAccounts: parseInt(maxAccounts, 10)
    });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('تم نسخ مفتاح الترخيص');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إدارة التراخيص</h1>
        <p className="text-muted-foreground mt-1">إنشاء وتوزيع تراخيص استخدام لوحة التحكم</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm text-center">
          <span className="block text-sm text-muted-foreground mb-1">إجمالي التراخيص</span>
          <span className="font-bold text-2xl">{stats?.total || 0}</span>
        </div>
        <div className="bg-card border border-success/30 rounded-xl p-4 shadow-sm text-center">
          <span className="block text-sm text-success mb-1">نشطة</span>
          <span className="font-bold text-2xl text-success">{stats?.active || 0}</span>
        </div>
        <div className="bg-card border border-primary/30 rounded-xl p-4 shadow-sm text-center">
          <span className="block text-sm text-primary mb-1">ستنتهي قريباً</span>
          <span className="font-bold text-2xl text-primary">{stats?.expiringSoon || 0}</span>
        </div>
        <div className="bg-card border border-destructive/30 rounded-xl p-4 shadow-sm text-center">
          <span className="block text-sm text-destructive mb-1">منتهية / ملغاة</span>
          <span className="font-bold text-2xl text-destructive">{(stats?.expired || 0) + (stats?.revoked || 0)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm sticky top-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              إنشاء ترخيص جديد
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">رقم هاتف العميل</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" placeholder="+123456789" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">النوع</label>
                <select value={tier} onChange={e => setTier(e.target.value)} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">الصلاحية (أيام)</label>
                  <input type="number" value={days} onChange={e => setDays(e.target.value)} min="1" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">حد الحسابات</label>
                  <input type="number" value={maxAccounts} onChange={e => setMaxAccounts(e.target.value)} min="1" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" required />
                </div>
              </div>
              <button type="submit" disabled={createMut.isPending} className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                {createMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء وتوليد المفتاح'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-16 bg-card border border-card-border rounded-xl text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-20" />
              لا توجد تراخيص مصدرة
            </div>
          ) : (
            licenses.map((lic: any) => {
              const isExpired = new Date(lic.expiresAt) < new Date();
              const isRevoked = lic.status === 'revoked';
              
              return (
                <div key={lic.id} className={`bg-card border rounded-xl p-5 shadow-sm transition-all ${isRevoked ? 'opacity-70 border-destructive/50' : isExpired ? 'border-primary/50' : 'border-success/50'}`}>
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4 pb-4 border-b border-border/50">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${isRevoked ? 'bg-destructive/10 text-destructive' : isExpired ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                          {isRevoked ? 'ملغى' : isExpired ? 'منتهي' : 'نشط'}
                        </span>
                        <span className="bg-secondary px-2 py-0.5 rounded text-xs font-medium text-foreground capitalize">{lic.tier}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-2 w-full max-w-sm">
                        <code className="text-sm text-muted-foreground flex-1 truncate" dir="ltr">{lic.licenseKey}</code>
                        <button onClick={() => copyKey(lic.licenseKey)} className="text-primary hover:bg-primary/10 p-1.5 rounded transition-colors" title="نسخ">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      {!isRevoked && (
                        <>
                          <button onClick={() => renewMut.mutate({ adminSecret, licenseKey: lic.licenseKey, days: 30 })} className="flex-1 md:flex-none px-3 py-1.5 bg-background border border-border hover:bg-secondary text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5">
                            <RefreshCw className="w-4 h-4" /> تجديد
                          </button>
                          <button onClick={() => { if(confirm('هل أنت متأكد من إلغاء الترخيص؟')) revokeMut.mutate({ adminSecret, licenseKey: lic.licenseKey }); }} className="flex-1 md:flex-none px-3 py-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5">
                            <XCircle className="w-4 h-4" /> إلغاء
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="block text-xs text-muted-foreground mb-1">الهاتف</span><span className="font-medium" dir="ltr">{lic.phone}</span></div>
                    <div><span className="block text-xs text-muted-foreground mb-1">تاريخ الانتهاء</span><span className="font-medium text-xs" dir="ltr">{new Date(lic.expiresAt).toLocaleDateString('ar-EG')}</span></div>
                    <div><span className="block text-xs text-muted-foreground mb-1">الحد الأقصى</span><span className="font-medium">{lic.maxAccounts} حسابات</span></div>
                    <div><span className="block text-xs text-muted-foreground mb-1">معرف الجهاز (HWID)</span><span className="font-medium font-mono text-xs">{lic.hwid || 'غير مرتبط'}</span></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}