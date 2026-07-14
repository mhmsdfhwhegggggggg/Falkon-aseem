import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { UserPlus, Settings2, Play, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function AddMembersPage() {
  const activeAccount = useActiveAccount();
  const [targetGroup, setTargetGroup] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('3');
  const [maxPerDay, setMaxPerDay] = useState('50');
  const [members, setMembers] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.addMembers.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأت عملية الإضافة');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.addMembers.status.useQuery(
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
    if (!targetGroup || !members) return;

    const parsedMembers = members.split('\n').map(l => l.trim()).filter(Boolean);
    if (parsedMembers.length === 0) {
      toast.error('قائمة الأعضاء فارغة');
      return;
    }

    startMut.mutate({
      targetGroup,
      mode: 'by-username',
      usernames: parsedMembers,
      delaySeconds: parseInt(delaySeconds, 10),
      maxPerDay: parseInt(maxPerDay, 10),
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إضافة الأعضاء</h1>
        <p className="text-muted-foreground mt-1">إضافة قائمة من المعرفات (Usernames) إلى مجموعة مستهدفة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm h-fit">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            إعدادات الإضافة
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">المجموعة المستهدفة</label>
              <input 
                type="text" 
                value={targetGroup} 
                onChange={e => setTargetGroup(e.target.value)} 
                dir="ltr" 
                placeholder="https://t.me/my_group أو @my_group" 
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-left" 
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium mb-2">الحد الأقصى يومياً</label>
                <input 
                  type="number" 
                  value={maxPerDay} 
                  onChange={e => setMaxPerDay(e.target.value)} 
                  min="1"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none" 
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                قائمة المعرفات (Usernames)
                <span className="text-xs text-muted-foreground font-normal">سطر لكل معرّف</span>
              </label>
              <textarea 
                value={members} 
                onChange={e => setMembers(e.target.value)} 
                dir="ltr" 
                rows={6}
                placeholder="@user1\n@user2\n..." 
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-mono text-sm text-left" 
                required
              />
            </div>

            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                بدء الإضافة
              </button>
              {!activeAccount && <p className="text-destructive text-sm mt-2 text-center">لا يوجد حساب نشط.</p>}
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            حالة التنفيذ
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <UserPlus className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">التقدم الإجمالي</span>
                  <span className="font-mono text-sm">{statusData?.progress || 0} / {statusData?.total || 1}</span>
                </div>
                <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((statusData?.progress || 0) / (statusData?.total || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-center">
                  <span className="block text-xs text-success/80 mb-1">تم الإضافة</span>
                  <span className="font-bold text-xl text-success">{statusData?.added || 0}</span>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                  <span className="block text-xs text-destructive/80 mb-1">فشل</span>
                  <span className="font-bold text-xl text-destructive">{statusData?.failed || 0}</span>
                </div>
                <div className="bg-secondary/50 border border-border/50 rounded-lg p-3 text-center">
                  <span className="block text-xs text-muted-foreground mb-1">تم التخطي</span>
                  <span className="font-bold text-xl">{statusData?.skipped || 0}</span>
                </div>
              </div>

              <div className="text-center mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusData?.status === 'failed' ? 'bg-destructive/10 text-destructive' : statusData?.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary animate-pulse'}`}>
                  {statusData?.status === 'running' ? 'جاري الإضافة...' : 
                   statusData?.status === 'completed' ? 'اكتملت المهمة' : 
                   statusData?.status === 'failed' ? 'فشلت المهمة' : 'في الانتظار'}
                </span>
              </div>

              {statusData?.error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg text-sm mb-4 flex gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{statusData.error}</p>
                </div>
              )}

              {statusData?.errors && statusData.errors.length > 0 && (
                <div className="mt-4 bg-background border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-2">سجل الأخطاء:</p>
                  <ul className="space-y-1 text-xs text-destructive">
                    {statusData.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}