import { useState } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { login, getAdminSecret } from '@/lib/auth';
import { toast } from 'sonner';
import { Settings, Shield, Server, Cpu } from 'lucide-react';

export function SettingsPage() {
  const { data: health } = trpc.system.health.useQuery();
  
  const [concurrency, setConcurrency] = useState(health?.workerPool?.maxConcurrency?.toString() || '10');
  const [secret, setSecret] = useState(getAdminSecret());

  const setPoolSizeMut = trpc.system.setPoolSize.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث حجم مجموعة العمال (Worker Pool)');
      queryClient.invalidateQueries({ queryKey: [['system', 'health']] });
    }
  });

  const resetAllCircuitsMut = trpc.system.resetAllCircuits.useMutation({
    onSuccess: (data) => {
      toast.success(`تمت إعادة ضبط ${data.resetCount} حسابات`);
    }
  });

  const handleUpdatePool = () => {
    setPoolSizeMut.mutate({ concurrency: parseInt(concurrency, 10) });
  };

  const handleUpdateSecret = () => {
    if (secret) {
      login(secret);
      toast.success('تم تحديث مفتاح الإدارة محلياً');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-muted-foreground mt-1">تكوين النظام والأداء</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            أداء النظام
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">حد التزامن للمهام (Worker Concurrency)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={concurrency} 
                  onChange={e => setConcurrency(e.target.value)} 
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary" 
                />
                <button 
                  onClick={handleUpdatePool}
                  disabled={setPoolSizeMut.isPending}
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold"
                >
                  حفظ
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">عدد المهام التي يمكن تشغيلها في نفس الوقت (الحد الأقصى 50).</p>
            </div>

            <div className="pt-4 border-t border-card-border">
              <h3 className="text-sm font-bold mb-3 text-destructive">إدارة الحماية</h3>
              <p className="text-xs text-muted-foreground mb-4">في حال حظر العديد من الحسابات بسبب PeerFlood، يمكنك إعادة ضبط حماية جميع الحسابات دفعة واحدة.</p>
              <button 
                onClick={() => { if(confirm('متأكد من تصفير الحماية لكل الحسابات؟')) resetAllCircuitsMut.mutate(); }}
                disabled={resetAllCircuitsMut.isPending}
                className="w-full bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 px-4 py-3 rounded-lg font-bold transition-colors"
              >
                إعادة ضبط جميع الحسابات
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            الأمان والمصادقة
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">مفتاح الإدارة (Admin Secret)</label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={secret} 
                  onChange={e => setSecret(e.target.value)} 
                  dir="ltr"
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary font-mono text-sm" 
                />
                <button 
                  onClick={handleUpdateSecret}
                  className="bg-secondary text-foreground px-4 py-2 rounded-lg font-medium hover:bg-secondary/80"
                >
                  تحديث
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">يُستخدم للمصادقة مع الخادم (يتم حفظه محلياً في المتصفح فقط).</p>
            </div>

            <div className="pt-4 border-t border-card-border">
              <h3 className="text-sm font-bold mb-3">حالة الخادم</h3>
              {health ? (
                <div className="space-y-2 text-sm font-mono" dir="ltr">
                  <div className="flex justify-between p-2 bg-secondary/50 rounded">
                    <span className="text-muted-foreground">Uptime:</span>
                    <span>{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
                  </div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded">
                    <span className="text-muted-foreground">Memory:</span>
                    <span>{health.memoryMB} MB</span>
                  </div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded">
                    <span className="text-muted-foreground">Active Workers:</span>
                    <span>{health.workerPool?.activeWorkers} / {health.workerPool?.maxConcurrency}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">جاري جلب الحالة...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}