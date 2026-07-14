import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { Filter, Play, Loader2 } from 'lucide-react';

export function ContactsFilterPage() {
  const activeAccount = useActiveAccount();
  const [phonesText, setPhonesText] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  const startMut = trpc.contactsFilter.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('بدأت عملية الفلترة');
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: statusData } = trpc.contactsFilter.status.useQuery(
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
    if (!phonesText.trim()) return;

    const phones = phonesText.split('\n').map(l => l.trim()).filter(Boolean);
    
    startMut.mutate({
      phones,
      accountId: activeAccount.id,
      sessionString: undefined,
    });
  };

  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';
  const total = statusData?.total || 1;
  const processed = statusData?.progress || 0;
  const valid = statusData?.result?.extracted ?? statusData?.extracted ?? 0;
  const invalid = processed - valid;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">فلترة الأرقام</h1>
        <p className="text-muted-foreground mt-1">التحقق من الأرقام التي تمتلك حسابات تيليغرام نشطة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            إدخال الأرقام
          </h2>
          
          <form onSubmit={handleStart} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 flex justify-between">
                الأرقام للفلترة
                <span className="text-xs text-muted-foreground">مع مفتاح الدولة (سطر لكل رقم)</span>
              </label>
              <textarea 
                value={phonesText} 
                onChange={e => setPhonesText(e.target.value)} 
                dir="ltr" 
                rows={10}
                placeholder="+966555555555\n+201000000000\n..." 
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm text-left" 
                required
              />
            </div>
            
            <div className="pt-4 border-t border-card-border">
              <button 
                type="submit" 
                disabled={startMut.isPending || (!!jobId && !isDone)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {(startMut.isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                بدء الفلترة
              </button>
            </div>
          </form>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            النتائج
          </h2>
          
          {!jobId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Filter className="w-16 h-16 mb-4" />
              <p>في انتظار بدء المهمة...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">التقدم</span>
                  <span className="font-mono text-sm">{processed} / {total}</span>
                </div>
                <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (processed / total) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 text-center">
                  <span className="block text-sm text-success/80 mb-1">أرقام تيليغرام صالحة</span>
                  <span className="font-bold text-3xl text-success">{valid}</span>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <span className="block text-sm text-destructive/80 mb-1">أرقام غير صالحة</span>
                  <span className="font-bold text-3xl text-destructive">{invalid}</span>
                </div>
              </div>

              {isDone && (
                <div className="mt-auto bg-primary/10 border border-primary/20 p-4 rounded-lg text-center">
                  <p className="text-sm font-medium text-primary">تم حفظ الأرقام الصالحة كملف أعضاء في النظام ويمكن استخدامها لاحقاً.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}