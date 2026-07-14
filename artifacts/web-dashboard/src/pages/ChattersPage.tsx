import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { MessageCircle, Play, Loader2 } from 'lucide-react';

export function ChattersPage() {
  const activeAccount = useActiveAccount();
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState('500');
  const [lastDays, setLastDays] = useState('30');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.chatters.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأ استخراج المتفاعلين');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.chatters.status.useQuery(
    { jobId: jobId! },
    { 
      enabled: !!jobId, 
      refetchInterval: (query) => {
        const isDone = query.state.data?.status === 'completed' || query.state.data?.status === 'failed';
        return isDone ? false : 2000;
      }
    }
  );

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      toast.error('يجب تحديد حساب نشط أولاً');
      return;
    }
    if (!group) return;

    startMut.mutate({
      group,
      limit: parseInt(limit, 10),
      lastDays: parseInt(lastDays, 10),
      excludeBots: true,
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">استخراج المتفاعلين</h1>
        <p className="text-muted-foreground mt-1">سحب الأعضاء الذين أرسلوا رسائل في المجموعة مؤخراً</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            إعدادات الاستخراج
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">رابط المجموعة أو المعرّف</label>
              <input 
                type="text" 
                value={group} 
                onChange={e => setGroup(e.target.value)} 
                dir="ltr" 
                placeholder="@group_username" 
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary outline-none text-left" 
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">عدد الرسائل للفحص</label>
                <input 
                  type="number" 
                  value={limit} 
                  onChange={e => setLimit(e.target.value)} 
                  min="1"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary outline-none" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">آخر الأيام</label>
                <input 
                  type="number" 
                  value={lastDays} 
                  onChange={e => setLastDays(e.target.value)} 
                  min="1"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary outline-none" 
                  required
                />
              </div>
            </div>

            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                بدء الاستخراج
              </button>
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            النتائج
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <MessageCircle className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">التقدم (رسائل تم فحصها)</span>
                  <span className="font-mono text-sm">{statusData?.progress || 0}</span>
                </div>
                <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: statusData?.total ? `${Math.min(100, ((statusData?.progress || 0) / statusData.total) * 100)}%` : '0%' }}
                  />
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-6 text-center border border-border/50 mb-6">
                <span className="block text-sm text-muted-foreground mb-2">عدد المتفاعلين المستخرجين</span>
                <span className="font-bold text-4xl text-primary">{statusData?.extracted || 0}</span>
              </div>

              <div className="text-center mt-auto">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusData?.status === 'failed' ? 'bg-destructive/10 text-destructive' : statusData?.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary animate-pulse'}`}>
                  {statusData?.status === 'running' ? 'جاري الاستخراج...' : 
                   statusData?.status === 'completed' ? 'اكتملت المهمة وتم حفظ الأعضاء' : 
                   statusData?.status === 'failed' ? 'فشلت المهمة' : 'في الانتظار'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}