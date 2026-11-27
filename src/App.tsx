import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { PendingAccountScreen } from './components/PendingAccountScreen';
import { AdminPortal } from './components/AdminPortal';
import { MemberPortal } from './components/MemberPortal';
import { t } from './utils/i18n';

function ToastShelf() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-3 rounded-xl border text-xs font-medium shadow-md ${
            toast.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function AppRouter() {
  const { authReady, profileSyncing, profileError, firebaseUser, profile, isVerifiedAccount, isAdmin, lang } =
    useApp();

  if (!authReady || profileSyncing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">{t(lang, 'loading')}</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthScreen />;
  }

  if (!isVerifiedAccount || profileError || !profile) {
    return <PendingAccountScreen />;
  }

  if (isAdmin) {
    return <AdminPortal />;
  }

  if (profile.status !== 'active') {
    return <PendingAccountScreen />;
  }

  return <MemberPortal />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastShelf />
        <AppRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
