import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { MessageSquare, Send, Play, Loader2, AlertCircle } from 'lucide-react';

export function BulkMessagePage() {
  const activeAccount = useActiveAccount();
  const [message, setMessage] = useState('');
  const [targets, setTargets] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('2');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.bulkMessage.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأت عملية الإرسال');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.bulkMessage.status.useQuery(
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
    if (!message || !targets) return;

    const parsedTargets = targets.split('\n').map(l => l.trim()).filter(Boolean);
    if (parsedTargets.length === 0) {
      toast.error('قائمة المستهدفين فارغة');
      return;
    }

    startMut.mutate({
      message,
      targets: parsedTargets,
      delaySeconds: parseInt(delaySeconds, 10),
      mode: 'dm',
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">الرسائل الجماعية</h1>
        <p className="text-muted-foreground mt-1">إرسال رسائل لعدة أشخاص أو مجموعات دفعة واحدة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm h-fit">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            محتوى الرسالة والمستهدفين
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">نص الرسالة</label>
              <textarea 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
                rows={6}
                placeholder="اكتب رسالتك هنا..." 
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm resize-y" 
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                المستهدفون
                <span className="text-xs text-muted-foreground font-normal">معرفات (سطر لكل هدف)</span>
              </label>
              <textarea 
                value={targets} 
                onChange={e => setTargets(e.target.value)} 
                dir="ltr" 
                rows={4}
                placeholder="@user1\n@user2\n..." 
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-mono text-sm text-left" 
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">الفاصل الزمني (ثواني)</label>
              <input 
                type="number" 
                value={delaySeconds} 
                onChange={e => setDelaySeconds(e.target.value)} 
                min="1"
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
                required
              />
            </div>

            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                بدء الإرسال
              </button>
              {!activeAccount && <p className="text-destructive text-sm mt-2 text-center">لا يوجد حساب نشط.</p>}
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            حالة التنفيذ
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Send className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">تقدم الإرسال</span>
                  <span className="font-mono text-sm">{statusData?.progress || 0} / {statusData?.total || 1}</span>
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
                  <span className="block text-sm text-success/80 mb-1">تم الإرسال</span>
                  <span className="font-bold text-2xl text-success">{statusData?.sent || 0}</span>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <span className="block text-sm text-destructive/80 mb-1">فشل</span>
                  <span className="font-bold text-2xl text-destructive">{statusData?.failed || 0}</span>
                </div>
              </div>

              <div className="text-center mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusData?.status === 'failed' ? 'bg-destructive/10 text-destructive' : statusData?.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary animate-pulse'}`}>
                  {statusData?.status === 'running' ? 'جاري الإرسال...' : 
                   statusData?.status === 'completed' ? 'اكتملت المهمة' : 
                   statusData?.status === 'failed' ? 'فشلت المهمة' : 'في الانتظار'}
                </span>
              </div>

              {statusData?.error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg text-sm flex gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{statusData.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}