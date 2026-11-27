import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  updateProfile,
  type ConfirmationResult,
} from 'firebase/auth';
import { Eye, EyeOff, Globe, KeyRound, Mail, Moon, Phone, ShieldCheck, Sun, UserPlus } from 'lucide-react';
import { auth, firebaseConfig, firebaseConfigStatus, isFirebaseInitialized } from '../firebase';
import { useApp } from '../context/AppContext';
import { mapFirebaseAuthError, validateEmailPasswordForm } from '../utils/authErrors';
import { t } from '../utils/i18n';
import { ensureMemberProfile } from '../services/messService';
import { isPrimaryAdminEmailMatch } from '../config/admin';

type AuthMode = 'login' | 'register' | 'phone' | 'forgot';

function normalizeBangladeshPhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^01\d{9}$/.test(cleaned)) {
    return `+88${cleaned}`;
  }
  if (/^8801\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function AuthScreen() {
  const {
    lang,
    setLang,
    theme,
    toggleTheme,
    notify,
    refreshAuthUser,
    firebaseOnline,
    firestoreStatus,
    retryFirestoreConnection,
  } = useApp();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+880');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [providerNotice, setProviderNotice] = useState('');
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const clearRecaptcha = () => {
    try {
      recaptchaRef.current?.clear();
    } catch {
      // ignore cleanup errors on unmounted nodes
    }
    recaptchaRef.current = null;
  };

  useEffect(() => {
    if (!isFirebaseInitialized || !auth) return;
    getRedirectResult(auth).catch((err) => {
      if (err) {
        const mapped = mapFirebaseAuthError(err, lang, undefined, firebaseConfig.projectId);
        if (mapped.kind === 'providerNotice') setProviderNotice(mapped.text);
        else setErrorMsg(mapped.text);
      }
    });
  }, []);

  useEffect(() => {
    if (mode !== 'phone') {
      clearRecaptcha();
      setConfirmation(null);
      setOtp('');
    }
    return () => {
      clearRecaptcha();
    };
  }, [mode]);

  const handleAuthError = (err: unknown) => {
    const mapped = mapFirebaseAuthError(err, lang, undefined, firebaseConfig.projectId);
    setSuccessMsg('');
    if (mapped.kind === 'providerNotice') {
      setProviderNotice(mapped.text);
      setErrorMsg('');
    } else {
      setErrorMsg(mapped.text);
    }
  };

  const ensureAuthReadyForAction = (): boolean => {
    if (!firebaseConfigStatus.valid || !isFirebaseInitialized || !auth) {
      setErrorMsg(
        (lang === 'bn' ? firebaseConfigStatus.errorBn : firebaseConfigStatus.errorEn) ||
          'Firebase configuration is incomplete.'
      );
      return false;
    }
    return true;
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setProviderNotice('');
    if (!ensureAuthReadyForAction()) return;
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      if (cred.user) {
        await refreshAuthUser();
        notify(
          'success',
          lang === 'bn' ? 'Google লগইন সফল হয়েছে!' : 'Signed in with Google!'
        );
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderNotice('');
    if (!ensureAuthReadyForAction()) return;

    const check = validateEmailPasswordForm({
      mode: 'login',
      email,
      password,
      lang,
    });
    if (!check.valid) {
      setErrorMsg(check.message);
      return;
    }
    if (isPrimaryAdminEmailMatch(email)) {
      setErrorMsg(
        lang === 'bn'
          ? 'প্রাইমারি অ্যাডমিন অ্যাকাউন্টের জন্য ইমেইল/পাসওয়ার্ড নয়, উপরের "Google দিয়ে প্রবেশ করুন" বাটন ব্যবহার করুন।'
          : 'Primary Admin must sign in using "Continue with Google" above rather than Email/Password.'
      );
      return;
    }

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await refreshAuthUser();
      notify('success', lang === 'bn' ? 'লগইন সফল হয়েছে!' : 'Signed in successfully!');
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderNotice('');
    if (!ensureAuthReadyForAction()) return;

    const check = validateEmailPasswordForm({
      mode: 'register',
      email,
      password,
      fullName,
      lang,
    });
    if (!check.valid) {
      setErrorMsg(check.message);
      return;
    }
    if (isPrimaryAdminEmailMatch(email)) {
      setErrorMsg(
        lang === 'bn'
          ? 'প্রাইমারি অ্যাডমিন ইমেইল দিয়ে নতুন মেম্বার নিবন্ধন করা যাবে না। উপরের "Google দিয়ে প্রবেশ করুন" বাটন ব্যবহার করুন।'
          : 'This email is reserved for the Primary Admin. Please use "Continue with Google" above.'
      );
      return;
    }

    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      try {
        await sendEmailVerification(cred.user);
        notify(
          'success',
          lang === 'bn'
            ? 'নিবন্ধন সম্পন্ন! আপনার ইমেইলে ভেরিফিকেশন লিংক পাঠানো হয়েছে।'
            : 'Account created! A verification link has been sent to your email.'
        );
      } catch {
        notify(
          'info',
          lang === 'bn'
            ? 'অ্যাকাউন্ট তৈরি হয়েছে। পরের ধাপে "পুনরায় ভেরিফিকেশন লিংক পাঠান" ব্যবহার করুন।'
            : 'Account created. Please use Resend Verification Link on the next screen.'
        );
      }
      await refreshAuthUser();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderNotice('');
    if (!ensureAuthReadyForAction()) return;

    const check = validateEmailPasswordForm({
      mode: 'forgot',
      email,
      lang,
    });
    if (!check.valid) {
      setErrorMsg(check.message);
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      const msg =
        lang === 'bn'
          ? `পাসওয়ার্ড রিসেট লিংক ${email.trim()} ইমেইলে পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার চেক করুন।`
          : `Password reset link sent to ${email.trim()}. Please check your inbox and spam folder.`;
      setSuccessMsg(msg);
      notify('success', msg);
      setMode('login');
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderNotice('');
    if (!ensureAuthReadyForAction()) return;

    const normalizedPhone = normalizeBangladeshPhone(phone);
    setPhone(normalizedPhone);
    if (!/^\+[1-9]\d{8,14}$/.test(normalizedPhone)) {
      setErrorMsg(
        lang === 'bn'
          ? 'সঠিক মোবাইল নম্বর দিন (যেমন: 01712345678 বা +8801712345678)।'
          : 'Enter a valid mobile number (e.g. 01712345678 or +8801712345678).'
      );
      return;
    }

    setBusy(true);
    try {
      clearRecaptcha();
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
      const res = await signInWithPhoneNumber(auth, normalizedPhone, recaptchaRef.current);
      setConfirmation(res);
      notify('info', lang === 'bn' ? 'OTP পাঠানো হয়েছে।' : 'OTP code sent.');
    } catch (err) {
      clearRecaptcha();
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation) return;
    if (otp.trim().length < 4) {
      setErrorMsg(lang === 'bn' ? '৬ সংখ্যার সঠিক OTP কোড লিখুন।' : 'Enter the OTP code.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const cred = await confirmation.confirm(otp.trim());
      await ensureMemberProfile(cred.user, fullName || undefined);
      await refreshAuthUser();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg('');
    setProviderNotice('');
    if (nextMode !== 'login') setSuccessMsg('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Minimal Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/src/assets/images/mess_brand_emblem_1795759109964.jpg"
            alt="Mess Manager Pro"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0"
          />
          <span className="font-semibold text-base sm:text-lg tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {t(lang, 'appName')}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'bn' ? 'EN' : 'বাংলা'}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Media Column */}
        <div className="lg:col-span-6 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
          <div className="relative h-56 sm:h-72 lg:h-80 w-full bg-slate-900">
            <img
              src="/src/assets/images/mess_welcome_banner_1795759110571.jpg"
              alt="Mess Dining Hall"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent flex flex-col justify-end p-6">
              <p className="text-xs font-medium text-emerald-300 mb-1">
                {t(lang, 'appSubtitle')}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight text-balance">
                {lang === 'bn'
                  ? 'দৈনিক মিল, স্বচ্ছ ওয়ালেট এবং মাসিক হিসাব এক জায়গায়'
                  : 'Daily meals, transparent poisha ledger, and monthly statements'}
              </h1>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'আর্কিটেকচার' : 'Architecture'}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {lang === 'bn' ? 'একক এডমিন' : 'Single Admin'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'হিসাব একক' : 'Precision'}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                  {lang === 'bn' ? 'পূর্ণ পয়সা (৳)' : 'Integer Poisha'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'নিরাপত্তা' : 'Isolation'}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {lang === 'bn' ? 'মেম্বার প্রাইভেসি' : 'Private Wallets'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p>
                {lang === 'bn'
                  ? 'প্রতিটি মেম্বার শুধুমাত্র নিজস্ব মিল, জমা এবং ওয়ালেট লেনদেন দেখতে পারবেন। আর্থিক অনুমোদন শুধুমাত্র মেস এডমিন কর্তৃক নিয়ন্ত্রিত।'
                  : 'Every member sees only their own meals, deposits, and wallet ledger. Financial approvals are enforced strictly by the single Admin and Firestore rules.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {mode === 'login' && t(lang, 'signIn')}
              {mode === 'register' && t(lang, 'signUp')}
              {mode === 'phone' && t(lang, 'phoneOtpLogin')}
              {mode === 'forgot' && t(lang, 'forgotPassword')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'bn'
                ? 'মেস অ্যাকাউন্টে প্রবেশ বা নতুন মেম্বার নিবন্ধন করুন'
                : 'Sign in to your mess account or register as a new member'}
            </p>
          </div>

          {/* Primary Google Sign-In */}
          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleLogin}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2.5 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>{t(lang, 'googleSignIn')}</span>
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 text-center">
            {lang === 'bn'
              ? 'প্রাইমারি এডমিন: Google দিয়ে প্রবেশ করুন · মেম্বার: Google / ইমেইল / OTP'
              : 'Primary Admin: use Google Sign-In · Members: Google, Email, or OTP'}
          </p>

          {/* Segmented Mode Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl my-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`min-h-[40px] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{t(lang, 'signIn')}</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`min-h-[40px] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t(lang, 'signUp')}</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('phone')}
              className={`min-h-[40px] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'phone'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>OTP</span>
            </button>
          </div>

          {!firebaseConfigStatus.valid && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {lang === 'bn' ? firebaseConfigStatus.errorBn : firebaseConfigStatus.errorEn}
            </div>
          )}

          {firebaseConfigStatus.valid && !firebaseOnline && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-2">
              <p>
                {firestoreStatus?.reason === 'service_denied'
                  ? lang === 'bn'
                    ? `Firebase Auth সংযুক্ত হয়েছে, কিন্তু "${firebaseConfig.projectId}" প্রজেক্টে Cloud Firestore API অথবা (default) Firestore Database সক্রিয় নেই। Firebase Console > Firestore Database তৈরি করুন এবং API Key-তে Cloud Firestore API অনুমতি দিন।`
                    : `Firebase Auth is connected, but Cloud Firestore API or the (default) Firestore database is not enabled/permitted on project "${firebaseConfig.projectId}".`
                  : lang === 'bn'
                    ? 'Firestore ডাটাবেসের সাথে সংযোগ করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
                    : 'Unable to connect to Cloud Firestore. Check your internet connection and retry.'}
              </p>
              <button
                type="button"
                onClick={() => void retryFirestoreConnection()}
                className="underline font-medium text-amber-900 dark:text-amber-100"
              >
                {lang === 'bn' ? 'সংযোগ পুনরায় পরীক্ষা করুন' : 'Retry connection'}
              </button>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
              {successMsg}
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {providerNotice && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              {providerNotice}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleEmailLogin} noValidate className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'email')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'password')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {t(lang, 'forgotPassword')}
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {busy ? t(lang, 'loading') : t(lang, 'signIn')}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} noValidate className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'fullName')}
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={lang === 'bn' ? 'আপনার পূর্ণ নাম' : 'Your full name'}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'email')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'password')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {busy ? t(lang, 'loading') : t(lang, 'registerBtn')}
              </button>
            </form>
          )}

          {mode === 'phone' && (
            <div className="space-y-3.5">
              <div id="recaptcha-container" />
              {!confirmation ? (
                <form onSubmit={handleSendOtp} noValidate className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'fullName')}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={lang === 'bn' ? 'আপনার নাম (নতুন হলে)' : 'Full name (if new)'}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'phoneNumber')}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+88017XXXXXXXX"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {busy ? t(lang, 'loading') : t(lang, 'sendOtp')}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} noValidate className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'otpCode')}
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="123456"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmation(null);
                        setOtp('');
                        clearRecaptcha();
                      }}
                      className="min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      {lang === 'bn' ? 'নম্বর বদলান' : 'Change'}
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {busy ? t(lang, 'loading') : t(lang, 'verifyOtp')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} noValidate className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(lang, 'email')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{busy ? t(lang, 'loading') : t(lang, 'resetPassword')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
