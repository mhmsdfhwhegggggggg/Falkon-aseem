import { useEffect, useState } from 'react';
import { trpc, queryClient, API_BASE_URL } from '@/lib/trpc';
import { toast } from 'sonner';
import { Shield, Server, Cpu } from 'lucide-react';

export function SettingsPage() {
  const { data: health } = trpc.system.health.useQuery();
  const [concurrency, setConcurrency] = useState('10');

  useEffect(() => {
    if (health?.workerPool?.maxConcurrency) {
      setConcurrency(String(health.workerPool.maxConcurrency));
    }
  }, [health?.workerPool?.maxConcurrency]);

  const setPoolSizeMut = trpc.system.setPoolSize.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث حجم مجموعة العمال');
      queryClient.invalidateQueries({ queryKey: [['system', 'health']] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetAllCircuitsMut = trpc.system.resetAllCircuits.useMutation({
    onSuccess: (data: { resetCount: number }) => {
      toast.success(`تمت إعادة ضبط ${data.resetCount} حسابات`);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleUpdatePool = () => {
    const value = Number.parseInt(concurrency, 10);
    if (!Number.isInteger(value) || value < 1 || value > 50) {
      toast.error('قيمة التزامن يجب أن تكون بين 1 و50');
      return;
    }
    setPoolSizeMut.mutate({ concurrency: value });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-muted-foreground mt-1">تكوين النظام والأداء وحالة الاتصال</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" /> أداء النظام
          </h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">حد التزامن للمهام</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={concurrency}
                  min={1}
                  max={50}
                  onChange={(event) => setConcurrency(event.target.value)}
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
                />
                <button onClick={handleUpdatePool} disabled={setPoolSizeMut.isPending} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold disabled:opacity-60">
                  حفظ
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">عدد المهام المتزامنة، من 1 إلى 50.</p>
            </div>
            <div className="pt-4 border-t border-card-border">
              <h3 className="text-sm font-bold mb-3 text-destructive">إدارة الحماية</h3>
              <p className="text-xs text-muted-foreground mb-4">أعد ضبط دوائر حماية الحسابات فقط بعد معالجة سبب الحظر.</p>
              <button
                onClick={() => { if (confirm('هل أنت متأكد من إعادة ضبط حماية كل الحسابات؟')) resetAllCircuitsMut.mutate(); }}
                disabled={resetAllCircuitsMut.isPending}
                className="w-full bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-60"
              >
                إعادة ضبط جميع الحسابات
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> الأمان والاتصال
          </h2>
          <div className="space-y-6">
            <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
              <p className="font-medium text-success">جلسة الإدارة محمية بتوكن محدود العمر</p>
              <p className="text-xs text-muted-foreground mt-2">لا يتم حفظ كلمة مرور الإدارة في الجهاز أو إرسالها مع العمليات اللاحقة.</p>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Server className="w-4 h-4" /> الخادم</h3>
              <code className="block bg-background border border-border rounded-lg p-3 text-xs break-all" dir="ltr">{API_BASE_URL}</code>
            </div>
            <div className="pt-4 border-t border-card-border">
              <h3 className="text-sm font-bold mb-3">حالة الخادم</h3>
              {health ? (
                <div className="space-y-2 text-sm font-mono" dir="ltr">
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Uptime:</span><span>{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span></div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Memory:</span><span>{health.memoryMB} MB</span></div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Workers:</span><span>{health.workerPool?.running} / {health.workerPool?.maxConcurrency}</span></div>
                </div>
              ) : <div className="text-sm text-muted-foreground">جاري جلب الحالة...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
