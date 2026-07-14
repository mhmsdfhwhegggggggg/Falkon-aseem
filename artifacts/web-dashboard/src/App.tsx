import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { trpc, queryClient, trpcClient } from '@/lib/trpc';
import { isAuthenticated } from '@/lib/auth';

import { Sidebar } from '@/components/Sidebar';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { SessionsPage } from '@/pages/SessionsPage';
import { ExtractionPage } from '@/pages/ExtractionPage';
import { AddMembersPage } from '@/pages/AddMembersPage';
import { BulkMessagePage } from '@/pages/BulkMessagePage';
import { AutoReplyPage } from '@/pages/AutoReplyPage';
import { ContentClonerPage } from '@/pages/ContentClonerPage';
import { ChattersPage } from '@/pages/ChattersPage';
import { ContactsFilterPage } from '@/pages/ContactsFilterPage';
import { GroupManagerPage } from '@/pages/GroupManagerPage';
import { SchedulerPage } from '@/pages/SchedulerPage';
import { MembersFilesPage } from '@/pages/MembersFilesPage';
import { AccountHealthPage } from '@/pages/AccountHealthPage';
import { LicensesPage } from '@/pages/LicensesPage';
import { SettingsPage } from '@/pages/SettingsPage';

function Layout({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 mr-64 p-8 h-screen overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/sessions" component={SessionsPage} />
      <Route path="/extraction" component={ExtractionPage} />
      <Route path="/add-members" component={AddMembersPage} />
      <Route path="/bulk-message" component={BulkMessagePage} />
      <Route path="/auto-reply" component={AutoReplyPage} />
      <Route path="/content-cloner" component={ContentClonerPage} />
      <Route path="/chatters" component={ChattersPage} />
      <Route path="/contacts-filter" component={ContactsFilterPage} />
      <Route path="/group-manager" component={GroupManagerPage} />
      <Route path="/scheduler" component={SchedulerPage} />
      <Route path="/members-files" component={MembersFilesPage} />
      <Route path="/account-health" component={AccountHealthPage} />
      <Route path="/licenses" component={LicensesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route>
        <div className="text-center py-20 text-muted-foreground">الصفحة غير موجودة</div>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster theme="dark" position="bottom-left" dir="rtl" />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
