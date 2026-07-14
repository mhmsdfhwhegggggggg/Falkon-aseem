import { useState } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { toast } from 'sonner';
import { Calendar, Trash2, Plus, Clock } from 'lucide-react';

export function SchedulerPage() {
  const { data: jobsData, isLoading } = trpc.scheduler.list.useQuery();
  const jobs = jobsData?.jobs || [];

  const [name, setName] = useState('');
  const [taskType, setTaskType] = useState<'extraction' | 'add-members' | 'bulk-message'>('extraction');
  const [scheduledAt, setScheduledAt] = useState('');

  const createMut = trpc.scheduler.create.useMutation({
    onSuccess: () => {
      toast.success('تمت جدولة المهمة بنجاح');
      setName('');
      setScheduledAt('');
      queryClient.invalidateQueries({ queryKey: [['scheduler', 'list']] });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.scheduler.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المهمة المجدولة');
      queryClient.invalidateQueries({ queryKey: [['scheduler', 'list']] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !scheduledAt) return;
    const date = new Date(scheduledAt);
    if (date <= new Date()) {
      toast.error('يجب أن يكون وقت التنفيذ في المستقبل');
      return;
    }
    
    createMut.mutate({
      name,
      taskType,
      scheduledAt: date.toISOString(),
      params: {} // In a full implementation, you'd collect specific params per task type
    });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'extraction': return 'استخراج أعضاء';
      case 'add-members': return 'إضافة أعضاء';
      case 'bulk-message': return 'رسائل جماعية';
      default: return type;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">المجدول</h1>
        <p className="text-muted-foreground mt-1">جدولة المهام لتعمل تلقائياً في أوقات محددة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm sticky top-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              مهمة جديدة
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">اسم المهمة (للتوضيح)</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">نوع المهمة</label>
                <select 
                  value={taskType} 
                  onChange={e => setTaskType(e.target.value as any)} 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" 
                >
                  <option value="extraction">استخراج أعضاء</option>
                  <option value="add-members">إضافة أعضاء</option>
                  <option value="bulk-message">رسائل جماعية</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">وقت التنفيذ</label>
                <input 
                  type="datetime-local" 
                  value={scheduledAt} 
                  onChange={e => setScheduledAt(e.target.value)} 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary" 
                  required
                />
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-4">
                  ملاحظة: هذه نسخة مبسطة، في التطبيق الكامل سيتم طلب إعدادات محددة لكل نوع مهمة.
                </p>
                <button 
                  type="submit" 
                  disabled={createMut.isPending}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {createMut.isPending ? 'جاري الحفظ...' : 'جدولة المهمة'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm h-full">
            <div className="p-6 border-b border-card-border flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                المهام المجدولة
              </h2>
            </div>
            
            <div className="p-0">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  لا توجد مهام مجدولة حالياً
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {jobs.map((job: any) => {
                    const date = new Date(job.scheduledAt);
                    const isPast = date < new Date() && job.status === 'pending';
                    
                    return (
                      <div key={job.id} className="p-5 flex items-center justify-between hover:bg-secondary/10 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground mb-1">{job.name}</h3>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="bg-background border border-border px-2 py-0.5 rounded text-muted-foreground">
                                {getTypeLabel(job.taskType)}
                              </span>
                              <span className="bg-background border border-border px-2 py-0.5 rounded text-muted-foreground" dir="ltr">
                                {date.toLocaleString('ar-EG')}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-medium ${
                                job.status === 'completed' ? 'bg-success/10 text-success' : 
                                job.status === 'failed' ? 'bg-destructive/10 text-destructive' : 
                                isPast ? 'bg-primary/10 text-primary' : 'bg-secondary text-foreground'
                              }`}>
                                {job.status === 'completed' ? 'تم التنفيذ' : 
                                 job.status === 'failed' ? 'فشل' : 
                                 isPast ? 'حان وقت التنفيذ' : 'في الانتظار'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => deleteMut.mutate({ id: job.id })}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}