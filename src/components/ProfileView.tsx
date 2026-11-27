import React, { useEffect, useState } from 'react';
import { BellRing, Globe, LogOut, Moon, Save, ShieldCheck, Sun, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { updateOwnProfile } from '../services/messService';
import { registerFcmToken } from '../services/fcm';
import { t } from '../utils/i18n';

export function ProfileView() {
  const { profile, firebaseUser, isAdmin, lang, setLang, theme, toggleTheme, notify, logout } = useApp();
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [whatsappConsent, setWhatsappConsent] = useState(Boolean(profile?.whatsappConsent));
  const [saving, setSaving] = useState(false);
  const [fcmStatus, setFcmStatus] = useState<string>('');

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName || '');
    setPhoneNumber(profile.phoneNumber || '');
    setWhatsappConsent(Boolean(profile.whatsappConsent));
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await updateOwnProfile(firebaseUser.uid, {
        fullName,
        phoneNumber,
        whatsappConsent,
      });
      notify('success', lang === 'bn' ? 'প্রোফাইল সংরক্ষিত হয়েছে।' : 'Profile updated successfully.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    if (!firebaseUser) return;
    const res = await registerFcmToken(firebaseUser.uid);
    if (res.token) {
      setFcmStatus(lang === 'bn' ? 'পুশ নোটিফিকেশন সক্রিয় হয়েছে।' : 'Push notifications enabled.');
      notify('success', lang === 'bn' ? 'FCM টোকেন সংরক্ষিত হয়েছে।' : 'FCM token saved.');
    } else if (res.reason) {
      setFcmStatus(res.reason);
      notify('info', res.reason);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
            {profile?.fullName?.slice(0, 1)?.toUpperCase() || <User className="w-6 h-6" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {profile?.fullName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {profile?.email || profile?.phoneNumber} · {isAdmin ? 'Primary Admin' : 'Mess Member'} ·{' '}
              {profile?.status}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 pt-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'fullName')}
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'phoneNumber')}
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+8801XXXXXXXXX"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>

          <label className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t(lang, 'whatsappConsent')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'কম ব্যালেন্স বা জমার তথ্য হোয়াটসঅ্যাপে পেতে সম্মতি দিন'
                  : 'Opt in to receive balance & deposit alerts via WhatsApp when configured'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(e) => setWhatsappConsent(e.target.checked)}
              className="w-5 h-5 accent-emerald-600 shrink-0"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t(lang, 'loading') : t(lang, 'save')}</span>
          </button>
        </form>
      </div>

      {/* Preferences & Push */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {lang === 'bn' ? 'ভাষা / Language' : 'Language / ভাষা'}
            </span>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setLang('bn')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                lang === 'bn'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                lang === 'en'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-slate-500" />}
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {lang === 'bn' ? 'থিম মোড' : 'Appearance'}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? (lang === 'bn' ? 'লাইট মোড' : 'Light Mode') : (lang === 'bn' ? 'ডার্ক মোড' : 'Dark Mode')}
          </button>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {lang === 'bn' ? 'পুশ নোটিফিকেশন (FCM)' : 'Push Notifications (FCM)'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleEnablePush}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {lang === 'bn' ? 'সক্রিয় করুন' : 'Enable Push'}
            </button>
          </div>
          {fcmStatus && <p className="text-xs text-slate-500 dark:text-slate-400">{fcmStatus}</p>}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>UID: {firebaseUser?.uid}</span>
          </span>
          <span>Joined: {profile?.joiningDate}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={logout}
        className="w-full min-h-[48px] rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 text-sm font-medium flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30"
      >
        <LogOut className="w-4 h-4" />
        <span>{t(lang, 'signOut')}</span>
      </button>
    </div>
  );
}
