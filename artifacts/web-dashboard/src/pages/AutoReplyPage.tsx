import { useState } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { toast } from 'sonner';
import { Bot, Plus, Trash2, Power, PowerOff } from 'lucide-react';

export function AutoReplyPage() {
  const activeAccount = useActiveAccount();
  const [keyword, setKeyword] = useState('');
  const [response, setResponse] = useState('');

  const { data: rulesData, isLoading } = trpc.autoReply.list.useQuery(
    { accountId: activeAccount?.id ?? '' },
    { enabled: Boolean(activeAccount) },
  );
  const rules = rulesData?.rules || [];

  const addRuleMut = trpc.autoReply.addRule.useMutation({
    onSuccess: () => {
      toast.success('تمت إضافة القاعدة بنجاح');
      setKeyword('');
      setResponse('');
      queryClient.invalidateQueries({ queryKey: [['autoReply', 'list']] });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeRuleMut = trpc.autoReply.removeRule.useMutation({
    onSuccess: () => {
      toast.success('تم الحذف');
      queryClient.invalidateQueries({ queryKey: [['autoReply', 'list']] });
    },
  });

  const toggleRuleMut = trpc.autoReply.toggleRule.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['autoReply', 'list']] });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      toast.error('يجب تحديد حساب نشط');
      return;
    }
    if (!keyword || !response) return;
    addRuleMut.mutate({ trigger: keyword, response, accountId: activeAccount.id });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">الرد التلقائي</h1>
        <p className="text-muted-foreground mt-1">إعداد قواعد للرد على الرسائل الواردة بكلمات مفتاحية معينة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              إضافة قاعدة جديدة
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">الكلمة المفتاحية (المشغّل)</label>
                <input 
                  type="text" 
                  value={keyword} 
                  onChange={e => setKeyword(e.target.value)} 
                  placeholder="مثال: سعر، تفاصيل، عرض" 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">الرد التلقائي</label>
                <textarea 
                  value={response} 
                  onChange={e => setResponse(e.target.value)} 
                  rows={4}
                  placeholder="الرد الذي سيتم إرساله..." 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-y" 
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={addRuleMut.isPending}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {addRuleMut.isPending ? 'جاري الإضافة...' : 'إضافة القاعدة'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm h-full">
            <div className="p-6 border-b border-card-border flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                القواعد الحالية
              </h2>
            </div>
            
            <div className="p-6">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
              ) : rules.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  لا توجد قواعد رد تلقائي مفعلة. قم بإضافة قاعدة جديدة.
                </div>
              ) : (
                <div className="space-y-4">
                  {rules.map((rule: any) => (
                    <div key={rule.id} className={`p-4 rounded-xl border transition-colors ${rule.enabled ? 'bg-secondary/30 border-primary/30' : 'bg-background border-border opacity-70'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded text-sm font-bold border border-primary/20">
                              {rule.trigger}
                            </span>
                            {!rule.enabled && <span className="text-xs text-muted-foreground bg-secondary px-2 rounded">معطل</span>}
                          </div>
                          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{rule.response}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={() => activeAccount && toggleRuleMut.mutate({ accountId: activeAccount.id, ruleId: rule.id })}
                            className={`p-2 rounded-lg transition-colors ${rule.enabled ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-secondary'}`}
                            title={rule.enabled ? 'تعطيل' : 'تفعيل'}
                          >
                            {rule.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={() => activeAccount && removeRuleMut.mutate({ accountId: activeAccount.id, ruleId: rule.id })}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}