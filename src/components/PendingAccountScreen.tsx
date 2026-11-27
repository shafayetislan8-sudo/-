import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { Clock, LogOut, MailCheck, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPrimaryAdminConfigured, isPrimaryAdminEmailMatch } from '../config/admin';
import { mapFirebaseAuthError } from '../utils/authErrors';
import { t } from '../utils/i18n';

export function PendingAccountScreen() {
  const {
    firebaseUser,
    profile,
    profileError,
    isVerifiedAccount,
    isPrimaryAdminCandidate,
    bootstrapInitialized,
    bootstrapAdminUid,
    runAdminBootstrap,
    refreshAuthUser,
    retryProfileSync,
    retryFirestoreConnection,
    logout,
    lang,
    notify,
  } = useApp();
  const [busy, setBusy] = useState(false);

  const needsEmailVerification = Boolean(firebaseUser && !isVerifiedAccount);
  const adminConfigured = isPrimaryAdminConfigured();
  const needsPrimaryAdminSetup = Boolean(
    isPrimaryAdminCandidate &&
      (!bootstrapInitialized ||
        bootstrapAdminUid !== firebaseUser?.uid ||
        profile?.role !== 'admin' ||
        profile?.status !== 'active')
  );
  const adminWrongProvider = Boolean(
    firebaseUser && isPrimaryAdminEmailMatch(firebaseUser.email) && !isPrimaryAdminCandidate
  );
  const needsProfileRetry = Boolean(
    firebaseUser &&
      isVerifiedAccount &&
      !profile &&
      !needsPrimaryAdminSetup &&
      !adminWrongProvider
  );

  const handleResend = async () => {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      await sendEmailVerification(firebaseUser);
      notify('success', lang === 'bn' ? 'ভেরিফিকেশন লিংক পুনরায় পাঠানো হয়েছে।' : 'Verification link resent.');
    } catch (err) {
      const mapped = mapFirebaseAuthError(err, lang);
      notify('error', mapped.text);
    } finally {
      setBusy(false);
    }
  };

  const handleBootstrap = async () => {
    setBusy(true);
    try {
      await runAdminBootstrap();
      notify('success', lang === 'bn' ? 'প্রাইমারি এডমিন সেটআপ সম্পন্ন হয়েছে।' : 'Primary Admin initialized.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRetrySync = async () => {
    setBusy(true);
    try {
      await retryFirestoreConnection();
      await retryProfileSync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
        {needsEmailVerification ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <MailCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t(lang, 'verifyEmailTitle')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                {t(lang, 'verifyEmailDesc')} ({firebaseUser?.email})
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const verified = await refreshAuthUser();
                  if (!verified) {
                    notify(
                      'info',
                      lang === 'bn'
                        ? 'ইমেইল এখনো যাচাই হয়নি। ইনবক্স বা স্প্যাম ফোল্ডার চেক করুন।'
                        : 'Email is not verified yet. Please check your inbox or spam folder.'
                    );
                  }
                  setBusy(false);
                }}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t(lang, 'checkVerification')}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleResend}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                {t(lang, 'resendVerification')}
              </button>
            </div>
          </>
        ) : needsProfileRetry || profileError ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {lang === 'bn' ? 'প্রোফাইল লোড করতে সমস্যা হয়েছে' : 'Unable to Load Profile'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                {profileError ||
                  (lang === 'bn'
                    ? 'ডাটাবেস থেকে আপনার অ্যাকাউন্ট তথ্য আনা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
                    : 'Could not sync your user profile from Firestore. Please retry.')}
              </p>
            </div>
            {!adminWrongProvider && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRetrySync}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{lang === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry Sync'}</span>
              </button>
            )}
          </>
        ) : needsPrimaryAdminSetup ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t(lang, 'adminBootstrapBanner')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                {firebaseUser?.email} —{' '}
                {lang === 'bn'
                  ? 'আপনি এই অ্যাপের প্রাথমিক এডমিন। প্রাইমারি এডমিন সেটআপ সম্পন্ন করতে নিচের বাটনে চাপ দিন।'
                  : 'Complete primary Admin setup and activate your administrator profile.'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleBootstrap}
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              {busy ? t(lang, 'loading') : t(lang, 'adminBootstrapBtn')}
            </button>
          </>
        ) : profile?.status === 'suspended' || profile?.status === 'removed' ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t(lang, 'suspendedTitle')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                {t(lang, 'suspendedDesc')}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t(lang, 'pendingTitle')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                {t(lang, 'pendingDesc')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 tabular-nums">
                {profile?.fullName} · {profile?.email || profile?.phoneNumber}
              </p>
              {!adminConfigured && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  {lang === 'bn'
                    ? 'প্রাইমারি অ্যাডমিন ইমেইল কনফিগার করা হয়নি (MY_NEW_ADMIN_EMAIL)। src/config/admin.ts এবং firestore.rules-এ আপনার ভেরিফায়েড Google ইমেইল বসান।'
                    : 'Primary Admin email is still set to MY_NEW_ADMIN_EMAIL. Configure your verified Google email in src/config/admin.ts (or VITE_PRIMARY_ADMIN_EMAIL) and firestore.rules.'}
                </p>
              )}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={logout}
          className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4" />
          <span>{t(lang, 'signOut')}</span>
        </button>
      </div>
    </div>
  );
}
