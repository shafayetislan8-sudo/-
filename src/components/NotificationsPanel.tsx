import { Bell, CheckCheck, Megaphone, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { markAllNotificationsRead, markNotificationRead } from '../services/messService';
import { t } from '../utils/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const { notifications, notices, lang, notify } = useApp();

  if (!open) return null;

  const unreadIds = notifications.filter((n) => !n.isRead && n.id).map((n) => n.id!);

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead(unreadIds);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update notifications');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {t(lang, 'notifications')}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unreadIds.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t(lang, 'markAllRead')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Published Notices */}
          {notices.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" />
                <span>{t(lang, 'notices')}</span>
              </h3>
              <div className="space-y-2">
                {notices.slice(0, 5).map((notice) => (
                  <div
                    key={notice.id}
                    className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {notice.title}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                      {notice.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Personal Alerts */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'সাম্প্রতিক বার্তা' : 'Recent Alerts'}
            </h3>
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                {t(lang, 'noData')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => n.id && !n.isRead && markNotificationRead(n.id)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      n.isRead
                        ? 'bg-white dark:bg-slate-900 opacity-75'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {n.title}
                      </p>
                      <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {n.isRead ? (lang === 'bn' ? 'পঠিত' : 'Read') : (lang === 'bn' ? 'নতুন' : 'New')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
                      {n.category} · {n.createdAt?.toDate?.()?.toLocaleString() || ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
