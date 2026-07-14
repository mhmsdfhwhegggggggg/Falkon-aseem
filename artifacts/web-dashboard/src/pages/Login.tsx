import { useState } from 'react';
import { login } from '@/lib/auth';

export function Login() {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      login(password);
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-card-border rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-primary mx-auto flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-4xl leading-none">F</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">Falkon Pro</h1>
          <p className="text-muted-foreground mt-2">تسجيل الدخول إلى لوحة التحكم</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground text-right">كلمة المرور (Admin Secret)</label>
            <input 
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-left"
              placeholder="••••••••"
              dir="ltr"
              required
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-colors cursor-pointer shadow-lg shadow-primary/20"
          >
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
