import { trpc } from '@/lib/trpc';
import { Activity, Server, Target, CheckCircle } from 'lucide-react';

export function Dashboard() {
  const { data: accountsData } = trpc.accounts.list.useQuery();
  const { data: jobsData } = trpc.jobs.list.useQuery({ limit: 5 });
  const { data: systemHealth } = trpc.system.health.useQuery();
  const { data: statsData } = trpc.stats.overview.useQuery({});

  const accountsCount = accountsData?.accounts?.length || 0;
  const activeAccountsCount = accountsData?.accounts?.filter((a: any) => a.isActive).length || 0;
  const jobs = jobsData?.jobs || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">لوحة المؤشرات</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على حالة النظام والمهام الجارية</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">الحسابات النشطة</h3>
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <p className="text-3xl font-bold">{activeAccountsCount} <span className="text-lg text-muted-foreground font-normal">/ {accountsCount}</span></p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">الملفات المستخرجة</h3>
            <Target className="w-5 h-5 text-primary" />
          </div>
          <p className="text-3xl font-bold">{statsData?.totalFiles || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">الأعضاء المضافين</h3>
            <CheckCircle className="w-5 h-5 text-success" />
          </div>
          <p className="text-3xl font-bold text-success">{statsData?.added || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">استهلاك الذاكرة</h3>
            <Server className="w-5 h-5 text-primary" />
          </div>
          <p className="text-3xl font-bold">{systemHealth?.memoryMB || 0} MB</p>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-card-border flex justify-between items-center">
          <h2 className="text-xl font-bold">آخر المهام</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">المهمة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">الحالة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">التقدم</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">لا توجد مهام حالية</td>
                </tr>
              ) : (
                jobs.map((job: any) => (
                  <tr key={job.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium">{job.type}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        job.status === 'completed' ? 'bg-success/10 text-success' :
                        job.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                        job.status === 'running' ? 'bg-primary/10 text-primary animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)]' :
                        'bg-secondary text-foreground'
                      }`}>
                        {job.status === 'completed' ? 'مكتمل' :
                         job.status === 'failed' ? 'فشل' :
                         job.status === 'running' ? 'قيد التشغيل' :
                         'في الانتظار'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono" dir="ltr">
                      {job.progress} / {job.total || '?'}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(job.addedAt || Date.now()).toLocaleString('ar-EG')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
