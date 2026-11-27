import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Home,
  Megaphone,
  Plus,
  User,
  UtensilsCrossed,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cancelMealEntry, submitDepositRequest, submitMealEntry } from '../services/messService';
import type { MealType, PaymentMethod } from '../types/mess';
import { t } from '../utils/i18n';
import { formatPoisha, getTodayDateDhaka, parseBdtToPoisha } from '../utils/money';
import { NotificationsPanel } from './NotificationsPanel';
import { ProfileView } from './ProfileView';
import { ReportsView } from './ReportsView';

type MemberTab = 'home' | 'meals' | 'wallet' | 'reports' | 'profile';

export function MemberPortal() {
  const {
    firebaseUser,
    profile,
    messSettings,
    myWallet,
    mealEntries,
    transactions,
    depositRequests,
    notifications,
    notices,
    lang,
    notify,
  } = useApp();

  const [tab, setTab] = useState<MemberTab>('home');
  const [notifOpen, setNotifOpen] = useState(false);

  // Meal submission state
  const [mealDate, setMealDate] = useState(getTodayDateDhaka());
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealQty, setMealQty] = useState(1);
  const [mealBusy, setMealBusy] = useState(false);

  // Deposit submission state
  const [depAmount, setDepAmount] = useState('');
  const [depMethod, setDepMethod] = useState<PaymentMethod>('bkash');
  const [depTrxId, setDepTrxId] = useState('');
  const [depReceipt, setDepReceipt] = useState('');
  const [depBusy, setDepBusy] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const currentMonthPrefix = getTodayDateDhaka().slice(0, 7);

  const monthlyStats = useMemo(() => {
    const approvedMonth = mealEntries.filter(
      (m) => m.status === 'approved' && m.mealDate.startsWith(currentMonthPrefix)
    );
    const breakfast = approvedMonth.filter((m) => m.mealType === 'breakfast').reduce((s, m) => s + m.quantity, 0);
    const lunch = approvedMonth.filter((m) => m.mealType === 'lunch').reduce((s, m) => s + m.quantity, 0);
    const dinner = approvedMonth.filter((m) => m.mealType === 'dinner').reduce((s, m) => s + m.quantity, 0);
    return { breakfast, lunch, dinner, total: breakfast + lunch + dinner };
  }, [mealEntries, currentMonthPrefix]);

  const currentBalance = myWallet?.currentBalanceInPoisha ?? 0;
  const outstandingDue = currentBalance < 0 ? Math.abs(currentBalance) : 0;

  const handleSubmitMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !messSettings) return;
    setMealBusy(true);
    try {
      await submitMealEntry({
        memberId: firebaseUser.uid,
        mealDate,
        mealType,
        quantity: mealQty,
        actorUid: firebaseUser.uid,
        isAdminActor: false,
        settings: messSettings,
      });
      notify(
        'success',
        lang === 'bn'
          ? 'মিল এন্ট্রি জমা হয়েছে (এডমিন অনুমোদনের অপেক্ষায়)।'
          : 'Meal entry submitted (pending admin approval).'
      );
      setMealQty(1);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to submit meal');
    } finally {
      setMealBusy(false);
    }
  };

  const handleCancelMeal = async (entryId: string) => {
    if (!firebaseUser || !messSettings) return;
    try {
      await cancelMealEntry(entryId, firebaseUser.uid, false, messSettings);
      notify('info', lang === 'bn' ? 'মিল এন্ট্রি বাতিল করা হয়েছে।' : 'Meal entry cancelled.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to cancel meal');
    }
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setDepBusy(true);
    try {
      const amountInPoisha = parseBdtToPoisha(depAmount);
      await submitDepositRequest({
        memberId: firebaseUser.uid,
        amountInPoisha,
        paymentMethod: depMethod,
        transactionId: depTrxId,
        receiptImage: depReceipt || undefined,
      });
      notify(
        'success',
        lang === 'bn' ? 'জমা অনুরোধ পাঠানো হয়েছে।' : 'Deposit request submitted for admin review.'
      );
      setDepAmount('');
      setDepTrxId('');
      setDepReceipt('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Invalid deposit request');
    } finally {
      setDepBusy(false);
    }
  };

  const navItems: { id: MemberTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: t(lang, 'navHome'), icon: <Home className="w-5 h-5" /> },
    { id: 'meals', label: t(lang, 'navMeals'), icon: <UtensilsCrossed className="w-5 h-5" /> },
    { id: 'wallet', label: t(lang, 'navWallet'), icon: <WalletIcon className="w-5 h-5" /> },
    { id: 'reports', label: t(lang, 'navReports'), icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'profile', label: t(lang, 'navProfile'), icon: <User className="w-5 h-5" /> },
  ];

  const activeMealRate =
    messSettings == null
      ? 0
      : mealType === 'breakfast'
        ? messSettings.breakfastRate
        : mealType === 'lunch'
          ? messSettings.lunchRate
          : messSettings.dinnerRate;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <img
            src="/src/assets/images/mess_brand_emblem_1795759109964.jpg"
            alt="Mess Manager Pro"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {messSettings?.messName || t(lang, 'appName')}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{profile?.fullName}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors ${
                tab === item.id
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col pb-20 lg:pb-8">
        {/* Sticky Compact Top App Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/mess_brand_emblem_1795759109964.jpg"
              alt="Logo"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover lg:hidden shrink-0"
            />
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            aria-label={t(lang, 'notifications')}
            className="relative min-h-[40px] min-w-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Bell className="w-4 h-4" />
            <span className="tabular-nums">{unreadCount}</span>
          </button>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
          {tab === 'home' && (
            <>
              {/* Hero Balance & Monthly Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 bg-slate-900 dark:bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{t(lang, 'currentBalance')}</p>
                    <p className="text-3xl font-bold tabular-nums mt-1">
                      {formatPoisha(currentBalance, lang)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-4 mt-4 border-t border-slate-800 text-xs">
                    <div>
                      <p className="text-slate-400">{t(lang, 'totalDeposits')}</p>
                      <p className="font-semibold tabular-nums mt-0.5 text-emerald-400">
                        {formatPoisha(myWallet?.totalDepositsInPoisha ?? 0, lang)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">{t(lang, 'totalMealCosts')}</p>
                      <p className="font-semibold tabular-nums mt-0.5">
                        {formatPoisha(myWallet?.totalMealCostsInPoisha ?? 0, lang)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">{t(lang, 'outstandingDue')}</p>
                      <p className="font-semibold tabular-nums mt-0.5 text-rose-400">
                        {formatPoisha(outstandingDue, lang)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'monthlyMeals')}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums my-2">
                    {monthlyStats.total}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {t(lang, 'breakfast')}: {monthlyStats.breakfast} · {t(lang, 'lunch')}: {monthlyStats.lunch} ·{' '}
                    {t(lang, 'dinner')}: {monthlyStats.dinner}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'totalExpenses')}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums my-2">
                    {formatPoisha(myWallet?.totalExpensesInPoisha ?? 0, lang)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('meals')}
                    className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t(lang, 'submitMeal')}</span>
                  </button>
                </div>
              </div>

              {/* Notices + Recent Transactions Split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-500" />
                    <span>{t(lang, 'notices')}</span>
                  </h2>
                  {notices.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">{t(lang, 'noData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {notices.slice(0, 4).map((notice) => (
                        <div
                          key={notice.id}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                        >
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notice.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{notice.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'bn' ? 'সাম্প্রতিক লেনদেন' : 'Recent Transactions'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab('wallet')}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      {lang === 'bn' ? 'সব দেখুন' : 'View All'}
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.length === 0 ? (
                      <p className="text-sm text-slate-500 py-10 text-center">{t(lang, 'noData')}</p>
                    ) : (
                      transactions.slice(0, 6).map((tx) => (
                        <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {tx.description}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {tx.type} · {tx.status} · {tx.createdAt?.toDate?.()?.toLocaleDateString() || ''}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums shrink-0 ${
                              tx.type === 'deposit' || tx.type === 'refund'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {tx.type === 'deposit' || tx.type === 'refund' ? '+' : '-'}
                            {formatPoisha(Math.abs(tx.amountInPoisha), lang)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'meals' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Submit Meal Form */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t(lang, 'submitMeal')}
                </h2>
                {messSettings && !messSettings.memberMealEntryEnabled ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-xl">
                    {lang === 'bn'
                      ? 'এডমিন বর্তমানে মেম্বারদের সরাসরি মিল এন্ট্রি বন্ধ রেখেছেন।'
                      : 'Member self meal entry is currently disabled by Admin.'}
                  </p>
                ) : (
                  <form onSubmit={handleSubmitMeal} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'date')}
                      </label>
                      <input
                        type="date"
                        required
                        value={mealDate}
                        onChange={(e) => setMealDate(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {lang === 'bn' ? 'মিলের ধরন' : 'Meal Type'}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((typeKey) => (
                          <button
                            key={typeKey}
                            type="button"
                            onClick={() => setMealType(typeKey)}
                            className={`min-h-[44px] px-2 rounded-xl border text-xs font-medium transition-colors ${
                              mealType === typeKey
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {t(lang, typeKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'quantity')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        required
                        value={mealQty}
                        onChange={(e) => setMealQty(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {lang === 'bn' ? 'বর্তমান রেট ও মোট' : 'Unit Rate & Total'}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatPoisha(activeMealRate, lang)} × {mealQty} ={' '}
                        {formatPoisha(activeMealRate * mealQty, lang)}
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={mealBusy}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {mealBusy ? t(lang, 'loading') : t(lang, 'submitMeal')}
                    </button>
                  </form>
                )}
              </div>

              {/* Member Meal History */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'bn' ? 'আপনার মিল ইতিহাস' : 'My Meal History'}
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mealEntries.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                  ) : (
                    mealEntries.map((entry) => (
                      <div key={entry.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {entry.mealDate} · {t(lang, entry.mealType)} (×{entry.quantity})
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatPoisha(entry.totalAmountInPoisha, lang)} · {t(lang, entry.status)}
                          </p>
                        </div>
                        {entry.status === 'pending' && entry.id && (
                          <button
                            type="button"
                            onClick={() => handleCancelMeal(entry.id!)}
                            className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t(lang, 'cancel')}</span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'wallet' && (
            <div className="space-y-6">
              {/* Wallet Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  [t(lang, 'openingBalance'), myWallet?.openingBalanceInPoisha ?? 0],
                  [t(lang, 'totalDeposits'), myWallet?.totalDepositsInPoisha ?? 0],
                  [t(lang, 'totalRefunds'), myWallet?.totalRefundsInPoisha ?? 0],
                  [t(lang, 'totalMealCosts'), -(myWallet?.totalMealCostsInPoisha ?? 0)],
                  [t(lang, 'totalExpenses'), -(myWallet?.totalExpensesInPoisha ?? 0)],
                ].map(([label, val], idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                      {formatPoisha(Number(val), lang)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Deposit Request Form */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t(lang, 'submitDeposit')}
                  </h2>
                  <form onSubmit={handleSubmitDeposit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'amountBdt')}
                      </label>
                      <input
                        type="text"
                        required
                        value={depAmount}
                        onChange={(e) => setDepAmount(e.target.value)}
                        placeholder="1500"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'paymentMethod')}
                      </label>
                      <select
                        value={depMethod}
                        onChange={(e) => setDepMethod(e.target.value as PaymentMethod)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      >
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="rocket">Rocket</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="cash">Cash</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'transactionRef')}
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={depTrxId}
                        onChange={(e) => setDepTrxId(e.target.value)}
                        placeholder="TRX123456"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {lang === 'bn' ? 'রসিদ লিংক (ঐচ্ছিক)' : 'Receipt URL (optional)'}
                      </label>
                      <input
                        type="url"
                        value={depReceipt}
                        onChange={(e) => setDepReceipt(e.target.value)}
                        placeholder="https://..."
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={depBusy}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {depBusy ? t(lang, 'loading') : t(lang, 'submitDeposit')}
                    </button>
                  </form>

                  {depositRequests.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <p className="text-xs font-semibold text-slate-500">
                        {lang === 'bn' ? 'জমা অনুরোধসমূহ' : 'Deposit Requests'}
                      </p>
                      {depositRequests.slice(0, 5).map((req) => (
                        <div key={req.id} className="flex items-center justify-between text-xs py-1.5">
                          <span className="tabular-nums">
                            {formatPoisha(req.amountInPoisha, lang)} · {req.paymentMethod} ({req.transactionId})
                          </span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {t(lang, req.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Personal Ledger */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'bn' ? 'ব্যক্তিগত লেনদেন খাতা' : 'Personal Wallet Ledger'}
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.length === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                    ) : (
                      transactions.map((tx) => (
                        <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {tx.description}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {tx.type} · {t(lang, tx.status)} · {tx.createdAt?.toDate?.()?.toLocaleString() || ''}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums shrink-0 ${
                              tx.type === 'deposit' || tx.type === 'refund'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {tx.type === 'deposit' || tx.type === 'refund' ? '+' : '-'}
                            {formatPoisha(Math.abs(tx.amountInPoisha), lang)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'reports' && <ReportsView />}
          {tab === 'profile' && <ProfileView />}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16 pb-safe">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              tab === item.id
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {item.icon}
            <span className="truncate max-w-[64px]">{item.label}</span>
          </button>
        ))}
      </nav>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
