import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { Target, Users, Play, Loader2, CheckCircle } from 'lucide-react';

export function ExtractionPage() {
  const activeAccount = useActiveAccount();
  const [groupUrl, setGroupUrl] = useState('');
  const [limit, setLimit] = useState('500');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'online'>('all');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.extraction.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأت عملية الاستخراج');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.extraction.status.useQuery(
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
    if (!groupUrl) return;

    startMut.mutate({
      group: groupUrl,
      limit: parseInt(limit, 10),
      dataFilter: 'all',
      onlineOnly: filterMode === 'online',
      filterActive: filterMode === 'active',
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">استخراج الأعضاء</h1>
        <p className="text-muted-foreground mt-1">سحب البيانات من المجموعات والقنوات المستهدفة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm h-fit">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            إعدادات الاستخراج
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">رابط المجموعة أو المعرّف (Username)</label>
              <input 
                type="text" 
                value={groupUrl} 
                onChange={e => setGroupUrl(e.target.value)} 
                dir="ltr" 
                placeholder="https://t.me/example_group أو @example_group" 
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-left" 
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">الحد الأقصى للأعضاء</label>
              <input 
                type="number" 
                value={limit} 
                onChange={e => setLimit(e.target.value)} 
                min="1"
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">نوع الفلترة</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${filterMode === 'all' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-secondary'}`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('active')}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${filterMode === 'active' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-secondary'}`}
                >
                  النشطون مؤخراً
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('online')}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${filterMode === 'online' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-secondary'}`}
                >
                  المتصلون الآن
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                بدء الاستخراج
              </button>
              {!activeAccount && <p className="text-destructive text-sm mt-2 text-center">لا يوجد حساب نشط. يرجى تفعيل حساب من قسم الجلسات.</p>}
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            حالة التنفيذ
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Target className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">تقدم العملية</span>
                  <span className="font-mono text-sm">{statusData?.progress || 0} / {statusData?.total || limit}</span>
                </div>
                <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((statusData?.progress || 0) / (statusData?.total || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-secondary/50 rounded-lg p-4 text-center border border-border/50">
                  <span className="block text-sm text-muted-foreground mb-1">الحالة</span>
                  <span className={`font-bold ${statusData?.status === 'failed' ? 'text-destructive' : statusData?.status === 'completed' ? 'text-success' : 'text-primary animate-pulse'}`}>
                    {statusData?.status === 'running' ? 'قيد التنفيذ' : 
                     statusData?.status === 'completed' ? 'مكتمل' : 
                     statusData?.status === 'failed' ? 'فشل' : 
                     statusData?.status === 'queued' ? 'في الانتظار' : '...'}
                  </span>
                </div>
                <div className="bg-secondary/50 rounded-lg p-4 text-center border border-border/50">
                  <span className="block text-sm text-muted-foreground mb-1">تم استخراج</span>
                  <span className="font-bold text-xl">{statusData?.extracted || 0}</span>
                </div>
              </div>

              {statusData?.error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg text-sm mb-4">
                  {statusData.error}
                </div>
              )}

              {statusData?.status === 'completed' && (
                <div className="mt-auto bg-success/10 border border-success/20 text-success p-4 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    <span>تمت العملية بنجاح. تم حفظ الأعضاء في الملفات.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}