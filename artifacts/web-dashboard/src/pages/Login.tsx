import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

export function Login() {
  const [password, setPassword] = useState('');
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess(data: { token: string; expiresAt: string }) {
      saveSession(data.token, data.expiresAt);
      setPassword('');
      window.location.reload();
    },
    onError(error: any) {
      toast.error(error?.data?.code === 'UNAUTHORIZED'
        ? 'بيانات الدخول غير صحيحة'
        : 'تعذر الاتصال بالخادم. تحقق من تشغيل الخادم والشبكة.');
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = password.trim();
    if (value) loginMutation.mutate({ password: value });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-card-border rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-primary mx-auto flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-4xl leading-none">F</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">Falkon Pro</h1>
          <p className="text-muted-foreground mt-2">تسجيل الدخول الآمن إلى لوحة التحكم</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground text-right">كلمة مرور الإدارة</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-left"
              placeholder="••••••••"
              dir="ltr"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-colors cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loginMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
            {loginMutation.isPending ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
