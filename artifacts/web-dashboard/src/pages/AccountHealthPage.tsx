import { trpc, queryClient } from '@/lib/trpc';
import { toast } from 'sonner';
import { Activity, ShieldAlert, Zap, RefreshCw } from 'lucide-react';

export function AccountHealthPage() {
  const { data: healthData, isLoading } = trpc.system.health.useQuery();
  const { data: accountsData } = trpc.accounts.list.useQuery();
  
  const resetMut = trpc.system.resetCircuit.useMutation({
    onSuccess: () => {
      toast.success('تمت إعادة ضبط حماية الحساب');
      queryClient.invalidateQueries();
    }
  });

  const accounts = accountsData?.accounts || [];
  const healthStats = healthData?.accountHealth || {};

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">صحة الحسابات</h1>
        <p className="text-muted-foreground mt-1">مراقبة حالات الحظر وتخفيف الضغط (Anti-Ban)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm border-l-4 border-l-primary">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-primary">
            <ShieldAlert className="w-5 h-5" />
            ما هو PeerFlood؟
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            تيليغرام يراقب سرعة إرسال الطلبات (مثل إضافة أعضاء أو إرسال رسائل). إذا تم تجاوز الحد المسموح، يفرض حظراً مؤقتاً يُعرف بـ PeerFlood. 
            يقوم نظام Falkon Pro بمراقبة هذا عبر <strong>Circuit Breaker</strong>، وعند رصد أخطاء متكررة يقوم بإيقاف الحساب مؤقتاً لحمايته من الحظر الدائم.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-10 text-muted-foreground">جاري التحميل...</div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
            لا توجد حسابات مضافة
          </div>
        ) : accounts.map((acc: any) => {
          const health = healthStats[acc.id] || {
            score: 100,
            circuitOpen: false,
            dailyCount: 0,
            floodCount: 0,
            peerFloodCount: 0,
            warmupMode: false,
          };
          const isBlocked = health.circuitOpen;
          
          return (
            <div key={acc.id} className={`bg-card border rounded-xl p-6 shadow-sm transition-all ${isBlocked ? 'border-destructive shadow-destructive/10' : 'border-card-border'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-foreground">{acc.firstName} {acc.lastName}</h3>
                  <p className="text-sm text-muted-foreground font-mono mt-1" dir="ltr">{acc.phone}</p>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${isBlocked ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`}>
                  {isBlocked ? 'محظور مؤقتاً' : 'سليم'}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">نقاط الصحة</span>
                    <span className="font-bold">{health.score}%</span>
                  </div>
                  <div className="w-full bg-background rounded-full h-2">
                    <div 
                      className={`h-full rounded-full transition-all ${health.score < 50 ? 'bg-destructive' : health.score < 80 ? 'bg-primary' : 'bg-success'}`}
                      style={{ width: `${health.score}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-secondary/50 rounded-lg p-2 text-center">
                    <span className="block text-xs text-muted-foreground mb-0.5">عمليات اليوم</span>
                    <span className="font-mono text-success">{health.dailyCount}</span>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-2 text-center">
                    <span className="block text-xs text-muted-foreground mb-0.5">أخطاء الحظر</span>
                    <span className="font-mono text-destructive">{health.floodCount + health.peerFloodCount}</span>
                  </div>
                </div>

                {isBlocked && (
                  <button 
                    onClick={() => resetMut.mutate({ accountId: acc.id })}
                    disabled={resetMut.isPending}
                    className="w-full mt-2 bg-background border border-border hover:bg-secondary text-foreground py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${resetMut.isPending ? 'animate-spin' : ''}`} />
                    إعادة ضبط الحماية
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}