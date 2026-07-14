import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { Layers, Play, Loader2 } from 'lucide-react';

export function GroupManagerPage() {
  const activeAccount = useActiveAccount();
  const [activeTab, setActiveTab] = useState<'join' | 'leave' | 'sendToAll' | 'extractAdmins'>('join');
  const [inputData, setInputData] = useState('');
  const [delay, setDelay] = useState('3');
  const [jobId, setJobId] = useState<string | null>(null);

  const joinMut = trpc.groupManager.join.useMutation({ onSuccess: d => handleSuccess(d.jobId), onError: e => toast.error(e.message) });
  const leaveMut = trpc.groupManager.leave.useMutation({ onSuccess: d => handleSuccess(d.jobId), onError: e => toast.error(e.message) });
  const sendToAllMut = trpc.groupManager.sendToAll.useMutation({ onSuccess: d => handleSuccess(d.jobId), onError: e => toast.error(e.message) });
  const extractAdminsMut = trpc.groupManager.extractAdmins.useMutation({ onSuccess: d => handleSuccess(d.jobId), onError: e => toast.error(e.message) });

  const { data: statusData } = trpc.groupManager.status.useQuery(
    { jobId: jobId! },
    { 
      enabled: !!jobId, 
      refetchInterval: (query) => {
        const isDone = query.state.data?.status === 'completed' || query.state.data?.status === 'failed';
        return isDone ? false : 2000;
      }
    }
  );

  const handleSuccess = (id: string) => {
    setJobId(id);
    toast.success('تم إرسال المهمة بنجاح');
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      toast.error('يجب تحديد حساب نشط أولاً');
      return;
    }

    const lines = inputData.split('\n').map(l => l.trim()).filter(Boolean);

    if (activeTab === 'join') {
      if (!lines.length) return toast.error('يرجى إدخال الروابط');
      joinMut.mutate({ groups: lines, delaySeconds: parseInt(delay, 10), accountId: activeAccount.id });
    } else if (activeTab === 'leave') {
      leaveMut.mutate({ groups: lines.length ? lines : undefined, accountId: activeAccount.id });
    } else if (activeTab === 'sendToAll') {
      if (!inputData) return toast.error('يرجى إدخال الرسالة');
      sendToAllMut.mutate({ message: inputData, delaySeconds: parseInt(delay, 10), accountId: activeAccount.id });
    } else if (activeTab === 'extractAdmins') {
      if (!inputData) return toast.error('يرجى إدخال المجموعة');
      extractAdminsMut.mutate({ group: inputData.trim(), accountId: activeAccount.id });
    }
  };

  const isPending = joinMut.isPending || leaveMut.isPending || sendToAllMut.isPending || extractAdminsMut.isPending;
  const isDone = statusData?.status === 'completed' || statusData?.status === 'failed';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إدارة المجموعات</h1>
        <p className="text-muted-foreground mt-1">الانضمام والمغادرة وإدارة المجموعات المشترك بها</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-card-border overflow-x-auto">
          <button onClick={() => { setActiveTab('join'); setInputData(''); setJobId(null); }} className={`px-6 py-4 font-bold whitespace-nowrap transition-colors ${activeTab === 'join' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-secondary/50'}`}>الانضمام المتعدد</button>
          <button onClick={() => { setActiveTab('leave'); setInputData(''); setJobId(null); }} className={`px-6 py-4 font-bold whitespace-nowrap transition-colors ${activeTab === 'leave' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-secondary/50'}`}>المغادرة</button>
          <button onClick={() => { setActiveTab('sendToAll'); setInputData(''); setJobId(null); }} className={`px-6 py-4 font-bold whitespace-nowrap transition-colors ${activeTab === 'sendToAll' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-secondary/50'}`}>رسالة لكل المجموعات</button>
          <button onClick={() => { setActiveTab('extractAdmins'); setInputData(''); setJobId(null); }} className={`px-6 py-4 font-bold whitespace-nowrap transition-colors ${activeTab === 'extractAdmins' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-secondary/50'}`}>استخراج الأدمن</button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <form onSubmit={handleStart} className="space-y-5">
            {activeTab === 'join' && (
              <div>
                <label className="block text-sm font-medium mb-2">روابط المجموعات (سطر لكل رابط)</label>
                <textarea value={inputData} onChange={e => setInputData(e.target.value)} dir="ltr" rows={6} className="w-full bg-background border border-border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />
              </div>
            )}
            
            {activeTab === 'leave' && (
              <div>
                <label className="block text-sm font-medium mb-2">روابط للمغادرة (اتركه فارغاً لمغادرة الكل)</label>
                <textarea value={inputData} onChange={e => setInputData(e.target.value)} dir="ltr" rows={6} className="w-full bg-background border border-border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}

            {activeTab === 'sendToAll' && (
              <div>
                <label className="block text-sm font-medium mb-2">الرسالة</label>
                <textarea value={inputData} onChange={e => setInputData(e.target.value)} rows={6} className="w-full bg-background border border-border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />
              </div>
            )}

            {activeTab === 'extractAdmins' && (
              <div>
                <label className="block text-sm font-medium mb-2">رابط المجموعة</label>
                <input type="text" value={inputData} onChange={e => setInputData(e.target.value)} dir="ltr" className="w-full bg-background border border-border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />
              </div>
            )}

            {(activeTab === 'join' || activeTab === 'sendToAll') && (
              <div>
                <label className="block text-sm font-medium mb-2">الفاصل الزمني (ثواني)</label>
                <input type="number" value={delay} onChange={e => setDelay(e.target.value)} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" required />
              </div>
            )}

            <button type="submit" disabled={isPending || (!!jobId && !isDone)} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
              {(isPending || (!!jobId && !isDone)) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              تنفيذ
            </button>
          </form>

          <div className="bg-secondary/30 border border-border rounded-xl p-6 flex flex-col min-h-[250px]">
            <h3 className="font-bold mb-4">حالة التنفيذ</h3>
            {!jobId ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground opacity-50">
                <p>لم تبدأ أي مهمة</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>التقدم</span>
                  <span className="font-mono">{statusData?.progress || 0} / {statusData?.total || 1}</span>
                </div>
                <div className="w-full bg-background rounded-full h-2 border border-border">
                  <div className="bg-primary h-full transition-all" style={{ width: `${Math.min(100, ((statusData?.progress || 0) / (statusData?.total || 1)) * 100)}%` }} />
                </div>
                <div className="text-sm font-bold text-center mt-4">
                  {statusData?.status === 'completed' ? <span className="text-success">مكتمل</span> : 
                   statusData?.status === 'failed' ? <span className="text-destructive">فشل</span> : 
                   <span className="text-primary animate-pulse">قيد التنفيذ...</span>}
                </div>
                {statusData?.error && <div className="text-destructive text-sm mt-2">{statusData.error}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}