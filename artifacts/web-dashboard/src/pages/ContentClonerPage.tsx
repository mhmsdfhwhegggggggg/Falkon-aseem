import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { Copy, Play, Loader2, ArrowLeftRight } from 'lucide-react';

export function ContentClonerPage() {
  const activeAccount = useActiveAccount();
  const [sourceGroup, setSourceGroup] = useState('');
  const [destGroup, setDestGroup] = useState('');
  const [cloneMedia, setCloneMedia] = useState(true);
  const [clonePolls, setClonePolls] = useState(false);
  const [skipForwards, setSkipForwards] = useState(true);
  const [reverseOrder, setReverseOrder] = useState(true);
  const [delay, setDelay] = useState('5');
  const [limit, setLimit] = useState('100');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.contentCloner.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأت عملية نسخ المحتوى');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.contentCloner.status.useQuery(
    { jobId: jobId! },
    { 
      enabled: !!jobId, 
      refetchInterval: (query) => {
        const isDone = query.state.data?.status === 'completed' || query.state.data?.status === 'failed';
        return isDone ? false : 3000;
      }
    }
  );

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      toast.error('يجب تحديد حساب نشط أولاً');
      return;
    }
    if (!sourceGroup || !destGroup) return;

    startMut.mutate({
      sourceGroup,
      destGroup,
      cloneMedia,
      clonePolls,
      skipForwards,
      reverseOrder,
      delaySeconds: parseFloat(delay),
      limit: parseInt(limit, 10),
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">نسخ المحتوى</h1>
        <p className="text-muted-foreground mt-1">نسخ الرسائل والوسائط من قناة/مجموعة إلى أخرى</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Copy className="w-5 h-5 text-primary" />
            إعدادات النسخ
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-primary">المصدر (Source)</label>
                <input 
                  type="text" 
                  value={sourceGroup} 
                  onChange={e => setSourceGroup(e.target.value)} 
                  dir="ltr" 
                  placeholder="@source_channel" 
                  className="w-full bg-background border border-primary/30 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-left" 
                  required
                />
              </div>
              <div className="relative">
                <div className="hidden md:flex absolute top-[60%] -left-[18px] z-10 w-8 h-8 bg-card border border-card-border rounded-full items-center justify-center text-muted-foreground">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <label className="block text-sm font-medium mb-2 text-success">الهدف (Destination)</label>
                <input 
                  type="text" 
                  value={destGroup} 
                  onChange={e => setDestGroup(e.target.value)} 
                  dir="ltr" 
                  placeholder="@dest_channel" 
                  className="w-full bg-background border border-success/30 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-success focus:border-transparent outline-none text-left" 
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium mb-2">عدد الرسائل</label>
                <input 
                  type="number" 
                  value={limit} 
                  onChange={e => setLimit(e.target.value)} 
                  min="1"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">الفاصل الزمني (ثواني)</label>
                <input 
                  type="number" 
                  step="0.5"
                  value={delay} 
                  onChange={e => setDelay(e.target.value)} 
                  min="0.5"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" 
                  required
                />
              </div>
            </div>

            <div className="bg-secondary/30 rounded-lg p-4 space-y-3 border border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={cloneMedia} onChange={e => setCloneMedia(e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary" />
                <span className="text-sm font-medium">نسخ الوسائط (صور، فيديو، ملفات)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={clonePolls} onChange={e => setClonePolls(e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary" />
                <span className="text-sm font-medium">نسخ الاستطلاعات (Polls)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={skipForwards} onChange={e => setSkipForwards(e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary" />
                <span className="text-sm font-medium">تخطي الرسائل المُحولة (Forwards)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={reverseOrder} onChange={e => setReverseOrder(e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary" />
                <span className="text-sm font-medium">النسخ بالترتيب الزمني (من الأقدم للأحدث)</span>
              </label>
            </div>

            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                بدء النسخ
              </button>
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            حالة التنفيذ
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Copy className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">التقدم</span>
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
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 text-center">
                  <span className="block text-sm text-success/80 mb-1">تم النقل</span>
                  <span className="font-bold text-2xl text-success">{statusData?.forwarded || 0}</span>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <span className="block text-sm text-destructive/80 mb-1">فشل</span>
                  <span className="font-bold text-2xl text-destructive">{statusData?.failed || 0}</span>
                </div>
              </div>

              <div className="text-center">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusData?.status === 'failed' ? 'bg-destructive/10 text-destructive' : statusData?.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary animate-pulse'}`}>
                  {statusData?.status === 'running' ? 'جاري النسخ...' : 
                   statusData?.status === 'completed' ? 'اكتملت المهمة' : 
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