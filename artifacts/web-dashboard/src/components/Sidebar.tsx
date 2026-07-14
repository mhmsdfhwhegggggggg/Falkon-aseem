import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, Users, Download, UserPlus, MessageSquare, Bot, 
  Copy, MessageCircle, Filter, Layers, Calendar, FolderOpen, 
  Activity, Key, Settings, LogOut 
} from 'lucide-react';
import { logout } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

const menuItems = [
  { id: '/', label: 'لوحة المؤشرات', icon: LayoutDashboard },
  { id: '/sessions', label: 'الجلسات', icon: Users },
  { id: '/extraction', label: 'استخراج الأعضاء', icon: Download },
  { id: '/add-members', label: 'إضافة الأعضاء', icon: UserPlus },
  { id: '/bulk-message', label: 'رسائل جماعية', icon: MessageSquare },
  { id: '/auto-reply', label: 'الرد التلقائي', icon: Bot },
  { id: '/content-cloner', label: 'نسخ المحتوى', icon: Copy },
  { id: '/chatters', label: 'المتفاعلون', icon: MessageCircle },
  { id: '/contacts-filter', label: 'فلترة الأرقام', icon: Filter },
  { id: '/group-manager', label: 'إدارة المجموعات', icon: Layers },
  { id: '/scheduler', label: 'المجدول', icon: Calendar },
  { id: '/members-files', label: 'ملفات الأعضاء', icon: FolderOpen },
  { id: '/account-health', label: 'صحة الحسابات', icon: Activity },
  { id: '/licenses', label: 'التراخيص', icon: Key },
  { id: '/settings', label: 'الإعدادات', icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();
  const { data } = trpc.accounts.list.useQuery();
  const activeCount = data?.accounts?.filter((a: any) => a.isActive).length || 0;

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  return (
    <div className="w-64 bg-card border-l border-card-border h-screen fixed top-0 right-0 flex flex-col">
      <div className="p-6 border-b border-card-border flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-xl leading-none">F</span>
        </div>
        <span className="text-xl font-bold text-primary tracking-wide">Falkon Pro</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location === item.id;
          return (
            <Link key={item.id} href={item.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-card-border">
        <div className="flex items-center justify-between px-3 py-2 bg-secondary rounded-md mb-4">
          <span className="text-sm text-muted-foreground">جلسات نشطة</span>
          <span className="text-sm font-bold text-primary">{activeCount}</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-md text-destructive hover:bg-destructive/10 w-full transition-colors cursor-pointer text-right">
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="font-medium">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}
