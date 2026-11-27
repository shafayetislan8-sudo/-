import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  Edit3,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCheck,
  Users,
  UtensilsCrossed,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import {
  approveMealEntry,
  approveMemberWithWallet,
  cancelMealEntry,
  editPendingMealEntry,
  publishNotice,
  recordDirectLedgerEntry,
  recordExpense,
  rejectMealEntry,
  reviewDepositRequest,
  reverseTransaction,
  submitMealEntry,
  updateAdminIntegrationSettings,
  updateMemberStatus,
  updateMessSettingsAndRates,
} from '../services/messService';
import type {
  AllocationType,
  ExpenseCategory,
  MealType,
  TransactionRecord,
} from '../types/mess';
import { t } from '../utils/i18n';
import {
  formatPoisha,
  getTodayDateDhaka,
  parseBdtToPoisha,
  poishaToInputString,
} from '../utils/money';
import { deriveBalanceFinishedCustomers } from '../utils/balanceExpiry';
import { BalanceFinishedSection } from './BalanceFinishedSection';
import { NotificationsPanel } from './NotificationsPanel';
import { ProfileView } from './ProfileView';
import { ReportsView } from './ReportsView';

type AdminTab =
  | 'dashboard'
  | 'members'
  | 'meals'
  | 'transactions'
  | 'expenses'
  | 'balanceFinished'
  | 'reports'
  | 'settings'
  | 'profile';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Grocery',
  'Gas',
  'Electricity',
  'Wi-Fi',
  'Water',
  'Cleaning',
  'Maintenance',
  'Other',
];

export function AdminPortal() {
  const {
    firebaseUser,
    profile,
    messSettings,
    adminSettings,
    members,
    wallets,
    mealRates,
    mealEntries,
    transactions,
    depositRequests,
    expenses,
    notifications,
    auditLogs,
    lang,
    notify,
  } = useApp();

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Member search & approval opening balance
  const [memberSearch, setMemberSearch] = useState('');
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});

  // Admin meal entry form
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'active'),
    [members]
  );
  const [mealMemberId, setMealMemberId] = useState('');
  const [mealDate, setMealDate] = useState(getTodayDateDhaka());
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealQty, setMealQty] = useState(1);
  const [mealApproveNow, setMealApproveNow] = useState(true);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingMealQty, setEditingMealQty] = useState(1);

  // Direct ledger form
  const [txMemberId, setTxMemberId] = useState('');
  const [txType, setTxType] = useState<'deposit' | 'refund' | 'adjustment'>('deposit');
  const [txAmountBdt, setTxAmountBdt] = useState('');
  const [txMethod, setTxMethod] = useState('cash');
  const [txDesc, setTxDesc] = useState('');

  // Expense form
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Grocery');
  const [expAmountBdt, setExpAmountBdt] = useState('');
  const [expDate, setExpDate] = useState(getTodayDateDhaka());
  const [expDesc, setExpDesc] = useState('');
  const [expAllocation, setExpAllocation] = useState<AllocationType>('equal');
  const [expSelectedIds, setExpSelectedIds] = useState<string[]>([]);

  // Notice form
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeDesc, setNoticeDesc] = useState('');

  // Settings form state
  const [sMessName, setSMessName] = useState(messSettings?.messName || 'Mess Manager Pro');
  const [sBreakfast, setSBreakfast] = useState(
    messSettings ? poishaToInputString(messSettings.breakfastRate) : '3'
  );
  const [sLunch, setSLunch] = useState(
    messSettings ? poishaToInputString(messSettings.lunchRate) : '30'
  );
  const [sDinner, setSDinner] = useState(
    messSettings ? poishaToInputString(messSettings.dinnerRate) : '30'
  );
  const [sLow, setSLow] = useState(
    messSettings ? poishaToInputString(messSettings.lowBalanceThreshold) : '200'
  );
  const [sCritical, setSCritical] = useState(
    messSettings ? poishaToInputString(messSettings.criticalBalanceThreshold) : '50'
  );
  const [sZeroAlert, setSZeroAlert] = useState(
    messSettings?.zeroBalanceNotificationEnabled ?? true
  );
  const [sMemberMeal, setSMemberMeal] = useState(
    messSettings?.memberMealEntryEnabled ?? true
  );
  const [sAutoApprove, setSAutoApprove] = useState(
    messSettings?.automaticMealApproval ?? false
  );

  // WhatsApp & FCM settings state
  const [waEnabled, setWaEnabled] = useState(adminSettings?.whatsappEnabled ?? false);
  const [waPhoneId, setWaPhoneId] = useState(adminSettings?.whatsappPhoneNumberId || '');
  const [waBizId, setWaBizId] = useState(adminSettings?.whatsappBusinessAccountId || '');
  const [waConsentReq, setWaConsentReq] = useState(adminSettings?.whatsappConsentRequired ?? true);
  const [fcmEnabled, setFcmEnabled] = useState(adminSettings?.fcmEnabled ?? true);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waServerConfigured, setWaServerConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!messSettings) return;
    setSMessName(messSettings.messName || 'Mess Manager Pro');
    setSBreakfast(poishaToInputString(messSettings.breakfastRate));
    setSLunch(poishaToInputString(messSettings.lunchRate));
    setSDinner(poishaToInputString(messSettings.dinnerRate));
    setSLow(poishaToInputString(messSettings.lowBalanceThreshold));
    setSCritical(poishaToInputString(messSettings.criticalBalanceThreshold));
    setSZeroAlert(Boolean(messSettings.zeroBalanceNotificationEnabled));
    setSMemberMeal(Boolean(messSettings.memberMealEntryEnabled));
    setSAutoApprove(Boolean(messSettings.automaticMealApproval));
  }, [messSettings]);

  useEffect(() => {
    if (!adminSettings) return;
    setWaEnabled(Boolean(adminSettings.whatsappEnabled));
    setWaPhoneId(adminSettings.whatsappPhoneNumberId || '');
    setWaBizId(adminSettings.whatsappBusinessAccountId || '');
    setWaConsentReq(Boolean(adminSettings.whatsappConsentRequired));
    setFcmEnabled(Boolean(adminSettings.fcmEnabled));
  }, [adminSettings]);

  useEffect(() => {
    if (tab !== 'settings' || !firebaseUser) return;
    let active = true;
    firebaseUser
      .getIdToken()
      .then((token) =>
        fetch('/api/whatsapp/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => {
        if (active) setWaServerConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (active) setWaServerConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [tab, firebaseUser]);

  const today = getTodayDateDhaka();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const memberById = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.uid] = m.fullName;
    });
    return map;
  }, [members]);

  const kpis = useMemo(() => {
    const totalMembers = members.filter((m) => m.status !== 'removed').length;
    const activeCount = activeMembers.length;
    const todaysMeals = mealEntries
      .filter((m) => m.mealDate === today && m.status === 'approved')
      .reduce((s, m) => s + m.quantity, 0);

    const walletList = Object.values(wallets);
    const totalDeposits = walletList.reduce((s, w) => s + w.totalDepositsInPoisha, 0);
    const totalMealCosts = walletList.reduce((s, w) => s + w.totalMealCostsInPoisha, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amountInPoisha, 0);

    const lowThresh = messSettings?.lowBalanceThreshold ?? 20000;
    let lowBalanceCount = 0;
    let zeroBalanceCount = 0;
    let totalOutstandingDue = 0;

    for (const m of activeMembers) {
      const bal = wallets[m.uid]?.currentBalanceInPoisha ?? 0;
      if (bal <= 0) {
        zeroBalanceCount++;
        if (bal < 0) totalOutstandingDue += Math.abs(bal);
      } else if (bal <= lowThresh) {
        lowBalanceCount++;
      }
    }

    return {
      totalMembers,
      activeCount,
      todaysMeals,
      totalDeposits,
      totalMealCosts,
      totalExpenses,
      lowBalanceCount,
      zeroBalanceCount,
      totalOutstandingDue,
    };
  }, [members, activeMembers, mealEntries, wallets, expenses, messSettings, today]);

  const balanceFinishedCustomers = useMemo(
    () => deriveBalanceFinishedCustomers(members, wallets, transactions, lang),
    [members, wallets, transactions, lang]
  );

  const pendingMembers = members.filter((m) => m.status === 'pending');
  const pendingDeposits = depositRequests.filter((d) => d.status === 'pending');
  const pendingMeals = mealEntries.filter((m) => m.status === 'pending');

  const chartData = useMemo(
    () => [
      { name: t(lang, 'totalDeposits'), amount: Math.round(kpis.totalDeposits / 100) },
      { name: t(lang, 'totalMealCosts'), amount: Math.round(kpis.totalMealCosts / 100) },
      { name: t(lang, 'totalExpenses'), amount: Math.round(kpis.totalExpenses / 100) },
      { name: t(lang, 'outstandingDue'), amount: Math.round(kpis.totalOutstandingDue / 100) },
    ],
    [kpis, lang]
  );

  const handleApproveMember = async (uid: string) => {
    if (!firebaseUser) return;
    setBusyId(uid);
    try {
      const rawBal = openingBalances[uid] || '0';
      const poisha = parseBdtToPoisha(rawBal);
      await approveMemberWithWallet(uid, poisha, firebaseUser.uid);
      notify('success', lang === 'bn' ? 'মেম্বার অনুমোদিত হয়েছে।' : 'Member approved & wallet created.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleMemberStatus = async (uid: string, status: 'active' | 'suspended' | 'removed') => {
    if (!firebaseUser) return;
    setBusyId(uid);
    try {
      await updateMemberStatus(uid, status, firebaseUser.uid);
      notify('success', lang === 'bn' ? 'মেম্বার অবস্থা হালনাগাদ হয়েছে।' : 'Member status updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdminAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !messSettings) return;
    const targetMember = mealMemberId || activeMembers[0]?.uid;
    if (!targetMember) {
      notify('error', lang === 'bn' ? 'সক্রিয় মেম্বার নির্বাচন করুন।' : 'Select an active member.');
      return;
    }
    setBusyId('add_meal');
    try {
      await submitMealEntry({
        memberId: targetMember,
        mealDate,
        mealType,
        quantity: mealQty,
        actorUid: firebaseUser.uid,
        isAdminActor: true,
        approveImmediately: mealApproveNow,
        settings: messSettings,
      });
      notify('success', lang === 'bn' ? 'মিল এন্ট্রি সংরক্ষিত হয়েছে।' : 'Meal entry recorded.');
      setMealQty(1);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Meal entry failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveMeal = async (entryId: string) => {
    if (!firebaseUser || !messSettings) return;
    setBusyId(entryId);
    try {
      await approveMealEntry(entryId, firebaseUser.uid, messSettings);
      notify('success', lang === 'bn' ? 'মিল অনুমোদিত হয়েছে।' : 'Meal approved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to approve meal');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectMeal = async (entryId: string) => {
    if (!firebaseUser) return;
    setBusyId(entryId);
    try {
      await rejectMealEntry(entryId, firebaseUser.uid);
      notify('info', lang === 'bn' ? 'মিল বাতিল করা হয়েছে।' : 'Meal rejected.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to reject meal');
    } finally {
      setBusyId(null);
    }
  };

  const handleReverseMeal = async (entryId: string) => {
    if (!firebaseUser || !messSettings) return;
    setBusyId(entryId);
    try {
      await cancelMealEntry(entryId, firebaseUser.uid, true, messSettings);
      notify('info', lang === 'bn' ? 'মিল রিভার্স ও রিফান্ড সম্পন্ন হয়েছে।' : 'Meal cancelled & refunded.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to reverse meal');
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewDeposit = async (requestId: string, decision: 'approved' | 'rejected') => {
    if (!firebaseUser || !messSettings) return;
    setBusyId(requestId);
    try {
      await reviewDepositRequest(requestId, decision, firebaseUser.uid, messSettings);
      notify(
        decision === 'approved' ? 'success' : 'info',
        decision === 'approved'
          ? lang === 'bn'
            ? 'জমা অনুমোদিত হয়েছে।'
            : 'Deposit approved.'
          : lang === 'bn'
            ? 'জমা প্রত্যাখ্যাত হয়েছে।'
            : 'Deposit rejected.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Deposit review failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDirectLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !messSettings) return;
    const target = txMemberId || activeMembers[0]?.uid;
    if (!target) return;
    setBusyId('direct_tx');
    try {
      const amount = parseBdtToPoisha(txAmountBdt);
      await recordDirectLedgerEntry({
        memberId: target,
        type: txType,
        amountInPoisha: amount,
        description: txDesc || `${txType} via ${txMethod}`,
        paymentMethod: txMethod,
        adminUid: firebaseUser.uid,
        settings: messSettings,
      });
      notify('success', lang === 'bn' ? 'লেনদেন সফলভাবে সম্পন্ন হয়েছে।' : 'Ledger entry recorded.');
      setTxAmountBdt('');
      setTxDesc('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to record entry');
    } finally {
      setBusyId(null);
    }
  };

  const handleReverseTx = async (tx: TransactionRecord) => {
    if (!firebaseUser || !messSettings || !tx.id) return;
    setBusyId(tx.id);
    try {
      await reverseTransaction(tx, firebaseUser.uid, 'Admin reversal adjustment', messSettings);
      notify('info', lang === 'bn' ? 'রিভার্সাল সম্পন্ন হয়েছে।' : 'Reversal transaction posted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Reversal failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !messSettings) return;
    setBusyId('add_expense');
    try {
      const amount = parseBdtToPoisha(expAmountBdt);
      const targets =
        expAllocation === 'equal'
          ? activeMembers.map((m) => m.uid)
          : expAllocation === 'selected'
            ? expSelectedIds
            : [];
      await recordExpense({
        category: expCategory,
        amountInPoisha: amount,
        description: expDesc,
        expenseDate: expDate,
        allocationType: expAllocation,
        targetMemberIds: targets,
        adminUid: firebaseUser.uid,
        settings: messSettings,
      });
      notify('success', lang === 'bn' ? 'খরচ সফলভাবে বণ্টন করা হয়েছে।' : 'Expense recorded and allocated.');
      setExpAmountBdt('');
      setExpDesc('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Expense failed');
    } finally {
      setBusyId(null);
    }
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setBusyId('notice');
    try {
      await publishNotice({
        title: noticeTitle,
        description: noticeDesc,
        targetType: 'all',
        targetMemberIds: [],
        recipientUidsToNotify: activeMembers.map((m) => m.uid),
        adminUid: firebaseUser.uid,
      });
      notify('success', lang === 'bn' ? 'নোটিশ প্রকাশিত হয়েছে।' : 'Notice published.');
      setNoticeTitle('');
      setNoticeDesc('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to publish notice');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setBusyId('save_settings');
    try {
      await updateMessSettingsAndRates(
        {
          messName: sMessName,
          currency: 'BDT',
          timezone: 'Asia/Dhaka',
          openingDate: messSettings?.openingDate || today,
          breakfastRate: parseBdtToPoisha(sBreakfast),
          lunchRate: parseBdtToPoisha(sLunch),
          dinnerRate: parseBdtToPoisha(sDinner),
          lowBalanceThreshold: parseBdtToPoisha(sLow),
          criticalBalanceThreshold: parseBdtToPoisha(sCritical),
          zeroBalanceNotificationEnabled: sZeroAlert,
          memberMealEntryEnabled: sMemberMeal,
          automaticMealApproval: sAutoApprove,
        },
        messSettings,
        firebaseUser.uid
      );
      notify('success', lang === 'bn' ? 'সেটিংস ও মিল রেট সংরক্ষিত হয়েছে।' : 'Settings and historical rates saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setBusyId('save_integrations');
    try {
      await updateAdminIntegrationSettings(
        {
          whatsappEnabled: waEnabled,
          whatsappPhoneNumberId: waPhoneId,
          whatsappBusinessAccountId: waBizId,
          whatsappConsentRequired: waConsentReq,
          fcmEnabled,
        },
        firebaseUser.uid
      );
      notify('success', lang === 'bn' ? 'ইন্টিগ্রেশন সেটিংস সংরক্ষিত।' : 'Integration settings updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save integrations');
    } finally {
      setBusyId(null);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!firebaseUser || !waTestPhone.trim()) return;
    setBusyId('wa_test');
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: waTestPhone.trim(),
          phoneNumberId: waPhoneId.trim(),
          message: `Mess Manager Pro test alert for ${sMessName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) {
        notify('error', data.error || 'WhatsApp message was NOT sent.');
      } else {
        notify('success', `WhatsApp sent (ID: ${data.messageId})`);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'WhatsApp endpoint unavailable');
    } finally {
      setBusyId(null);
    }
  };

  const allNavItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: t(lang, 'navDashboard'), icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'members', label: t(lang, 'navMembers'), icon: <Users className="w-5 h-5" /> },
    { id: 'meals', label: t(lang, 'navMeals'), icon: <UtensilsCrossed className="w-5 h-5" /> },
    { id: 'transactions', label: t(lang, 'navTransactions'), icon: <WalletIcon className="w-5 h-5" /> },
    { id: 'balanceFinished', label: t(lang, 'navBalanceFinished'), icon: <AlertTriangle className="w-5 h-5" /> },
    { id: 'expenses', label: t(lang, 'navExpenses'), icon: <Receipt className="w-5 h-5" /> },
    { id: 'reports', label: t(lang, 'navReports'), icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'settings', label: t(lang, 'navSettings'), icon: <SettingsIcon className="w-5 h-5" /> },
  ];

  const primaryMobileNav = allNavItems.slice(0, 4);

  const filteredMembers = members.filter((m) =>
    `${m.fullName} ${m.email || ''} ${m.phoneNumber || ''}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-3 px-2 py-3 mb-5">
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
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
              Primary Admin · {profile?.fullName}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {allNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full min-h-[42px] px-3.5 rounded-xl flex items-center justify-between gap-2 text-sm font-medium transition-colors ${
                tab === item.id
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.id === 'members' && pendingMembers.length > 0 && (
                <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingMembers.length}</span>
              )}
              {item.id === 'meals' && pendingMeals.length > 0 && (
                <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingMeals.length}</span>
              )}
              {item.id === 'transactions' && pendingDeposits.length > 0 && (
                <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingDeposits.length}</span>
              )}
              {item.id === 'balanceFinished' && balanceFinishedCustomers.length > 0 && (
                <span className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {balanceFinishedCustomers.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`mt-4 w-full min-h-[42px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium border border-slate-200 dark:border-slate-800 ${
            tab === 'profile'
              ? 'bg-slate-900 text-white dark:bg-emerald-600'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{t(lang, 'navProfile')}</span>
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col pb-20 lg:pb-8">
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/mess_brand_emblem_1795759109964.jpg"
              alt="Logo"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover lg:hidden shrink-0"
            />
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {tab === 'profile'
                ? t(lang, 'navProfile')
                : allNavItems.find((n) => n.id === tab)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="w-4 h-4" />
              <span className="tabular-nums">{unreadCount}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
          {tab === 'dashboard' && (
            <>
              {/* 9 Admin KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                {[
                  [t(lang, 'totalMembers'), kpis.totalMembers, 'text-slate-900 dark:text-slate-100'],
                  [t(lang, 'activeMembers'), kpis.activeCount, 'text-emerald-600 dark:text-emerald-400'],
                  [t(lang, 'todaysMeals'), kpis.todaysMeals, 'text-slate-900 dark:text-slate-100'],
                  [t(lang, 'totalDeposits'), formatPoisha(kpis.totalDeposits, lang), 'text-emerald-600 dark:text-emerald-400'],
                  [t(lang, 'totalMealCosts'), formatPoisha(kpis.totalMealCosts, lang), 'text-slate-900 dark:text-slate-100'],
                  [t(lang, 'totalExpenses'), formatPoisha(kpis.totalExpenses, lang), 'text-slate-900 dark:text-slate-100'],
                  [t(lang, 'lowBalanceMembers'), kpis.lowBalanceCount, 'text-amber-600 dark:text-amber-400', undefined],
                  [t(lang, 'zeroBalanceMembers'), balanceFinishedCustomers.length, 'text-rose-600 dark:text-rose-400', 'balanceFinished'],
                  [t(lang, 'outstandingDue'), formatPoisha(kpis.totalOutstandingDue, lang), 'text-rose-600 dark:text-rose-400', 'balanceFinished'],
                ].map(([label, val, colorCls, targetTab], idx) => (
                  <div
                    key={idx}
                    onClick={() => targetTab && setTab(targetTab as AdminTab)}
                    className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 ${
                      targetTab ? 'cursor-pointer hover:border-rose-300 dark:hover:border-rose-800 transition-colors' : ''
                    }`}
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
                    <p className={`text-xl font-bold tabular-nums mt-1.5 ${colorCls}`}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Balance Finished Live Alert Strip */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {t(lang, 'balanceFinishedFullTitle')} ·{' '}
                      <span className="tabular-nums text-rose-600 dark:text-rose-400">
                        {balanceFinishedCustomers.length}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {balanceFinishedCustomers.length > 0
                        ? lang === 'bn'
                          ? `${balanceFinishedCustomers.length} জন মেম্বারের ব্যালেন্স ৳0 বা তার কম। সরাসরি WhatsApp-এ রিমাইন্ডার পাঠান।`
                          : `${balanceFinishedCustomers.length} customer(s) at ৳0 or due. Send a free WhatsApp reminder.`
                        : lang === 'bn'
                          ? 'বর্তমানে কোনো মেম্বারের টাকা শেষ তালিকা বাকি নেই।'
                          : 'No customers currently in the Balance Finished list.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('balanceFinished')}
                  className="min-h-[40px] px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'তালিকা দেখুন' : 'Open List'}</span>
                </button>
              </div>

              {/* Financial Chart + Notice Publisher */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                    {lang === 'bn' ? 'আর্থিক সারসংক্ষেপ (৳)' : 'Mess Financial Summary (BDT)'}
                  </h2>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-500" />
                    <span>{t(lang, 'publishNotice')}</span>
                  </h2>
                  <form onSubmit={handlePublishNotice} className="space-y-3">
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={noticeTitle}
                      onChange={(e) => setNoticeTitle(e.target.value)}
                      placeholder={lang === 'bn' ? 'নোটিশের শিরোনাম' : 'Notice title'}
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <textarea
                      required
                      minLength={2}
                      rows={3}
                      value={noticeDesc}
                      onChange={(e) => setNoticeDesc(e.target.value)}
                      placeholder={lang === 'bn' ? 'বিস্তারিত বার্তা লিখুন...' : 'Announcement details...'}
                      className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busyId === 'notice'}
                      className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {t(lang, 'publishNotice')}
                    </button>
                  </form>
                </div>
              </div>

              {/* Action Queues */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{lang === 'bn' ? 'অপেক্ষমান মেম্বার' : 'Pending Members'}</h3>
                    <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingMembers.length}</span>
                  </div>
                  {pendingMembers.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">{t(lang, 'noData')}</p>
                  ) : (
                    pendingMembers.slice(0, 4).map((m) => (
                      <div key={m.uid} className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="truncate font-medium">{m.fullName}</span>
                        <button
                          type="button"
                          onClick={() => handleApproveMember(m.uid)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium shrink-0"
                        >
                          {t(lang, 'approve')}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{lang === 'bn' ? 'অপেক্ষমান মিল' : 'Pending Meals'}</h3>
                    <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingMeals.length}</span>
                  </div>
                  {pendingMeals.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">{t(lang, 'noData')}</p>
                  ) : (
                    pendingMeals.slice(0, 4).map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="truncate">
                          {memberById[m.memberId] || 'Member'} · {t(lang, m.mealType)} ×{m.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={!m.id || !messSettings || busyId === m.id}
                          onClick={() => m.id && void handleApproveMeal(m.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium shrink-0 disabled:opacity-50"
                        >
                          {t(lang, 'approve')}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{lang === 'bn' ? 'অপেক্ষমান জমা' : 'Pending Deposits'}</h3>
                    <span className="text-xs font-semibold tabular-nums text-amber-600">{pendingDeposits.length}</span>
                  </div>
                  {pendingDeposits.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">{t(lang, 'noData')}</p>
                  ) : (
                    pendingDeposits.slice(0, 4).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="truncate tabular-nums">
                          {memberById[d.memberId] || 'Member'} · {formatPoisha(d.amountInPoisha, lang)}
                        </span>
                        <button
                          type="button"
                          disabled={!d.id || !messSettings || busyId === d.id}
                          onClick={() => d.id && void handleReviewDeposit(d.id, 'approved')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium shrink-0 disabled:opacity-50"
                        >
                          {t(lang, 'approve')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'members' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t(lang, 'searchPlaceholder')}
                  className="flex-1 min-w-[220px] min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
                <span className="text-xs text-slate-500 tabular-nums">
                  {t(lang, 'totalMembers')}: {filteredMembers.length}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4">{t(lang, 'fullName')}</th>
                        <th className="py-3 px-3">{lang === 'bn' ? 'ভূমিকা / অবস্থা' : 'Role / Status'}</th>
                        <th className="py-3 px-3 text-right">{t(lang, 'currentBalance')}</th>
                        <th className="py-3 px-3 text-right">{t(lang, 'totalDeposits')}</th>
                        <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                      {filteredMembers.map((m) => {
                        const w = wallets[m.uid];
                        return (
                          <tr key={m.uid}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{m.fullName}</p>
                              <p className="text-xs text-slate-500">{m.email || m.phoneNumber || m.uid}</p>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-slate-700 dark:text-slate-300">
                                {m.role === 'admin' ? 'Primary Admin' : 'Member'} · {t(lang, m.status)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-semibold tabular-nums">
                              {formatPoisha(w?.currentBalanceInPoisha ?? 0, lang)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatPoisha(w?.totalDepositsInPoisha ?? 0, lang)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                {m.status === 'pending' && (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="0 ৳"
                                      value={openingBalances[m.uid] ?? ''}
                                      onChange={(e) =>
                                        setOpeningBalances((p) => ({ ...p, [m.uid]: e.target.value }))
                                      }
                                      className="w-20 min-h-[36px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
                                    />
                                    <button
                                      type="button"
                                      disabled={busyId === m.uid}
                                      onClick={() => handleApproveMember(m.uid)}
                                      className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium flex items-center gap-1"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      <span>{t(lang, 'approve')}</span>
                                    </button>
                                  </>
                                )}
                                {m.role !== 'admin' && m.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMemberStatus(m.uid, 'suspended')}
                                    className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-amber-700 dark:text-amber-400"
                                  >
                                    {lang === 'bn' ? 'স্থগিত' : 'Suspend'}
                                  </button>
                                )}
                                {m.role !== 'admin' && m.status === 'suspended' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMemberStatus(m.uid, 'active')}
                                    className="min-h-[36px] px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400"
                                  >
                                    {lang === 'bn' ? 'সক্রিয় করুন' : 'Activate'}
                                  </button>
                                )}
                                {m.role !== 'admin' && m.status !== 'removed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMemberStatus(m.uid, 'removed')}
                                    className="min-h-[36px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-900 text-xs text-rose-600"
                                  >
                                    {lang === 'bn' ? 'অপসারণ' : 'Remove'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'meals' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
                <h2 className="text-base font-semibold">{t(lang, 'addMealAdmin')}</h2>
                <form onSubmit={handleAdminAddMeal} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">{lang === 'bn' ? 'মেম্বার' : 'Member'}</label>
                    <select
                      value={mealMemberId || activeMembers[0]?.uid || ''}
                      onChange={(e) => setMealMemberId(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t(lang, 'date')}</label>
                    <input
                      type="date"
                      required
                      value={mealDate}
                      onChange={(e) => setMealDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() => setMealType(mt)}
                        className={`min-h-[42px] rounded-xl border text-xs font-medium ${
                          mealType === mt
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {t(lang, mt)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t(lang, 'quantity')}</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={mealQty}
                      onChange={(e) => setMealQty(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mealApproveNow}
                      onChange={(e) => setMealApproveNow(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span>{lang === 'bn' ? 'সাথে সাথে অনুমোদন ও চার্জ করুন' : 'Approve & charge immediately'}</span>
                  </label>
                  <button
                    type="submit"
                    disabled={busyId === 'add_meal' || activeMembers.length === 0}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t(lang, 'addMealAdmin')}</span>
                  </button>
                </form>
              </div>

              <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-base font-semibold">{lang === 'bn' ? 'সকল মিল তালিকা' : 'All Meal Entries'}</h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mealEntries.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                  ) : (
                    mealEntries.map((entry) => (
                      <div key={entry.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {memberById[entry.memberId] || entry.memberId} · {entry.mealDate} · {t(lang, entry.mealType)} (×{entry.quantity})
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {formatPoisha(entry.totalAmountInPoisha, lang)} ({formatPoisha(entry.unitRateInPoisha, lang)}/unit) · {t(lang, entry.status)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {entry.status === 'pending' && entry.id && (
                            <>
                              {editingMealId === entry.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={editingMealQty}
                                    onChange={(e) => setEditingMealQty(Number(e.target.value))}
                                    className="w-16 min-h-[34px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs tabular-nums"
                                  />
                                  <button
                                    type="button"
                                    disabled={busyId === entry.id}
                                    onClick={async () => {
                                      setBusyId(entry.id!);
                                      try {
                                        await editPendingMealEntry(entry.id!, editingMealQty, firebaseUser!.uid);
                                        setEditingMealId(null);
                                        notify('success', lang === 'bn' ? 'হালনাগাদ হয়েছে' : 'Updated');
                                      } catch (err) {
                                        notify('error', err instanceof Error ? err.message : 'Update failed');
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs disabled:opacity-50"
                                  >
                                    {t(lang, 'save')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMealId(entry.id!);
                                    setEditingMealQty(entry.quantity);
                                  }}
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!messSettings || busyId === entry.id}
                                onClick={() => void handleApproveMeal(entry.id!)}
                                className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t(lang, 'approve')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === entry.id}
                                onClick={() => void handleRejectMeal(entry.id!)}
                                className="min-h-[36px] px-2.5 rounded-lg border border-rose-200 text-rose-600 text-xs disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {entry.status === 'approved' && entry.id && (
                            <button
                              type="button"
                              disabled={!messSettings || busyId === entry.id}
                              onClick={() => void handleReverseMeal(entry.id!)}
                              className="min-h-[36px] px-3 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{t(lang, 'reverse')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'transactions' && (
            <div className="space-y-6">
              {/* Pending Deposit Requests */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    {lang === 'bn' ? 'জমা যাচাই তালিকা' : 'Deposit Verification Requests'}
                  </h2>
                  <span className="text-xs text-amber-600 font-semibold tabular-nums">
                    {pendingDeposits.length} {t(lang, 'pending')}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {depositRequests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                  ) : (
                    depositRequests.map((req) => (
                      <div key={req.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tabular-nums">
                            {memberById[req.memberId] || req.memberId} · {formatPoisha(req.amountInPoisha, lang)}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {req.paymentMethod} · TrxID: {req.transactionId} · {t(lang, req.status)}
                          </p>
                        </div>
                        {req.status === 'pending' && req.id && messSettings && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => void handleReviewDeposit(req.id!, 'approved')}
                              className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-medium disabled:opacity-50"
                            >
                              {t(lang, 'approve')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => void handleReviewDeposit(req.id!, 'rejected')}
                              className="min-h-[38px] px-3.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-medium disabled:opacity-50"
                            >
                              {t(lang, 'reject')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Direct Ledger Entry */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
                  <h2 className="text-base font-semibold">{t(lang, 'directDeposit')}</h2>
                  <form onSubmit={handleDirectLedger} className="space-y-3">
                    <select
                      value={txMemberId || activeMembers[0]?.uid || ''}
                      onChange={(e) => setTxMemberId(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={txType}
                      onChange={(e) => setTxType(e.target.value as 'deposit' | 'refund' | 'adjustment')}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="deposit">{lang === 'bn' ? 'জমা (Deposit)' : 'Deposit'}</option>
                      <option value="refund">{lang === 'bn' ? 'রিফান্ড (Refund)' : 'Refund'}</option>
                      <option value="adjustment">{lang === 'bn' ? 'সমন্বয় (Adjustment)' : 'Adjustment'}</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={txAmountBdt}
                      onChange={(e) => setTxAmountBdt(e.target.value)}
                      placeholder={t(lang, 'amountBdt')}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                    />
                    <input
                      type="text"
                      value={txMethod}
                      onChange={(e) => setTxMethod(e.target.value)}
                      placeholder="cash / bkash / bank"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={txDesc}
                      onChange={(e) => setTxDesc(e.target.value)}
                      placeholder={t(lang, 'description')}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busyId === 'direct_tx' || activeMembers.length === 0}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium"
                    >
                      {t(lang, 'save')}
                    </button>
                  </form>
                </div>

                {/* Immutable Ledger */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-semibold">{lang === 'bn' ? 'সম্পূর্ণ আর্থিক লেজার' : 'Financial Ledger'}</h2>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.length === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                    ) : (
                      transactions.slice(0, 80).map((tx) => (
                        <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {memberById[tx.memberId] || tx.memberId} — {tx.description}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              {tx.type} · {t(lang, tx.status)} · {tx.createdAt?.toDate?.()?.toLocaleString() || ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatPoisha(tx.amountInPoisha, lang)}
                            </span>
                            {tx.status === 'completed' && !tx.reversalOf && (
                              <button
                                type="button"
                                disabled={busyId === tx.id}
                                onClick={() => handleReverseTx(tx)}
                                title={t(lang, 'reverse')}
                                className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-600 flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{t(lang, 'reverse')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'expenses' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
                <h2 className="text-base font-semibold">{t(lang, 'addExpense')}</h2>
                <form onSubmit={handleAddExpense} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">{t(lang, 'category')}</label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">{t(lang, 'amountBdt')}</label>
                      <input
                        type="text"
                        required
                        value={expAmountBdt}
                        onChange={(e) => setExpAmountBdt(e.target.value)}
                        placeholder="1200"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">{t(lang, 'date')}</label>
                      <input
                        type="date"
                        required
                        value={expDate}
                        onChange={(e) => setExpDate(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t(lang, 'description')}</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={expDesc}
                      onChange={(e) => setExpDesc(e.target.value)}
                      placeholder={lang === 'bn' ? 'খরচের বিবরণ' : 'Expense description'}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">{t(lang, 'allocation')}</label>
                    <select
                      value={expAllocation}
                      onChange={(e) => setExpAllocation(e.target.value as AllocationType)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="equal">{t(lang, 'equalSplit')}</option>
                      <option value="selected">{t(lang, 'selectedSplit')}</option>
                      <option value="general">{t(lang, 'generalExpense')}</option>
                    </select>
                  </div>

                  {expAllocation === 'selected' && (
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 max-h-44 overflow-y-auto">
                      {activeMembers.map((m) => (
                        <label key={m.uid} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={expSelectedIds.includes(m.uid)}
                            onChange={(e) =>
                              setExpSelectedIds((prev) =>
                                e.target.checked ? [...prev, m.uid] : prev.filter((id) => id !== m.uid)
                              )
                            }
                            className="w-4 h-4 accent-emerald-600"
                          />
                          <span>{m.fullName}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busyId === 'add_expense'}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium"
                  >
                    {t(lang, 'addExpense')}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-base font-semibold">{lang === 'bn' ? 'খরচের তালিকা' : 'Recorded Expenses'}</h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expenses.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noData')}</p>
                  ) : (
                    expenses.map((exp) => (
                      <div key={exp.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {exp.category} · {exp.description}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {exp.expenseDate} · {exp.allocationType} ({exp.allocatedMemberIds.length} members)
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatPoisha(exp.amountInPoisha, lang)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'balanceFinished' && (
            <BalanceFinishedSection
              customers={balanceFinishedCustomers}
              lang={lang}
              onQuickRecharge={(uid) => {
                setTxMemberId(uid);
                setTxType('deposit');
                setTab('transactions');
              }}
            />
          )}

          {tab === 'reports' && <ReportsView />}

          {tab === 'settings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Mess Operational & Rate Settings */}
                <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <h2 className="text-base font-semibold">{t(lang, 'navSettings')}</h2>
                  <form onSubmit={handleSaveSettings} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium mb-1">{t(lang, 'messName')}</label>
                      <input
                        type="text"
                        required
                        value={sMessName}
                        onChange={(e) => setSMessName(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">{t(lang, 'breakfastRate')}</label>
                        <input
                          type="text"
                          required
                          value={sBreakfast}
                          onChange={(e) => setSBreakfast(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">{t(lang, 'lunchRate')}</label>
                        <input
                          type="text"
                          required
                          value={sLunch}
                          onChange={(e) => setSLunch(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">{t(lang, 'dinnerRate')}</label>
                        <input
                          type="text"
                          required
                          value={sDinner}
                          onChange={(e) => setSDinner(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">{t(lang, 'lowThreshold')}</label>
                        <input
                          type="text"
                          required
                          value={sLow}
                          onChange={(e) => setSLow(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">{t(lang, 'criticalThreshold')}</label>
                        <input
                          type="text"
                          required
                          value={sCritical}
                          onChange={(e) => setSCritical(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      {[
                        [t(lang, 'zeroAlert'), sZeroAlert, setSZeroAlert],
                        [t(lang, 'memberMealToggle'), sMemberMeal, setSMemberMeal],
                        [t(lang, 'autoApprovalToggle'), sAutoApprove, setSAutoApprove],
                      ].map(([label, val, setter], idx) => (
                        <label key={idx} className="flex items-center justify-between text-xs cursor-pointer py-1">
                          <span>{label as string}</span>
                          <input
                            type="checkbox"
                            checked={val as boolean}
                            onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </label>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={busyId === 'save_settings'}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-medium"
                    >
                      {t(lang, 'save')}
                    </button>
                  </form>
                </div>

                {/* WhatsApp Click-to-Chat (Free) & Optional Cloud API / FCM */}
                <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 p-3.5 text-xs space-y-1">
                    <p className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {lang === 'bn'
                          ? 'ফ্রি WhatsApp রিমাইন্ডার সক্রিয় (কোনো API/টোকেন প্রয়োজন নেই)'
                          : 'Free WhatsApp Click-to-Chat Active (Zero API/Token Needed)'}
                      </span>
                    </p>
                    <p className="text-green-700 dark:text-green-400">
                      {lang === 'bn'
                        ? '"টাকা শেষ" সেকশন থেকে এক ক্লিকে প্রি-ফিল্ড বাংলা মেসেজসহ WhatsApp চ্যাট খুলুন।'
                        : 'Use the "Balance Finished" tab for free one-click pre-filled WhatsApp reminders.'}
                    </p>
                  </div>
                  <h2 className="text-base font-semibold">{t(lang, 'whatsappIntegration')} & FCM</h2>
                  <form onSubmit={handleSaveIntegrations} className="space-y-3.5">
                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>{lang === 'bn' ? 'হোয়াটসঅ্যাপ ক্লাউড API সক্রিয় করুন' : 'Enable WhatsApp Business Cloud API'}</span>
                      <input
                        type="checkbox"
                        checked={waEnabled}
                        onChange={(e) => setWaEnabled(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                    <input
                      type="text"
                      value={waPhoneId}
                      onChange={(e) => setWaPhoneId(e.target.value)}
                      placeholder="WhatsApp Phone Number ID"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                    />
                    <input
                      type="text"
                      value={waBizId}
                      onChange={(e) => setWaBizId(e.target.value)}
                      placeholder="WhatsApp Business Account ID"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
                    />
                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>{lang === 'bn' ? 'মেম্বার সম্মতি বাধ্যতামূলক' : 'Require Explicit Member Consent'}</span>
                      <input
                        type="checkbox"
                        checked={waConsentReq}
                        onChange={(e) => setWaConsentReq(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>{lang === 'bn' ? 'FCM পুশ নোটিফিকেশন সক্রিয়' : 'Enable Android/Web FCM Push'}</span>
                      <input
                        type="checkbox"
                        checked={fcmEnabled}
                        onChange={(e) => setFcmEnabled(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busyId === 'save_integrations'}
                      className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-sm font-medium"
                    >
                      {t(lang, 'save')}
                    </button>
                  </form>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {lang === 'bn'
                          ? 'সার্ভার WHATSAPP_ACCESS_TOKEN অবস্থা:'
                          : 'Server WHATSAPP_ACCESS_TOKEN status:'}
                      </span>
                      <span
                        className={`font-medium ${
                          waServerConfigured
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {waServerConfigured === null
                          ? t(lang, 'loading')
                          : waServerConfigured
                            ? lang === 'bn'
                              ? 'সক্রিয় (Server Env)'
                              : 'Configured (Server Env)'
                            : lang === 'bn'
                              ? 'সেট করা নেই (Secrets-এ যোগ করুন)'
                              : 'Not set (Configure in Server Secrets)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {lang === 'bn'
                        ? 'সার্ভারে WHATSAPP_ACCESS_TOKEN সেট করা থাকলে নিচে টেস্ট মেসেজ পাঠান:'
                        : 'Test live WhatsApp delivery via server proxy (requires WHATSAPP_ACCESS_TOKEN):'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={waTestPhone}
                        onChange={(e) => setWaTestPhone(e.target.value)}
                        placeholder="+8801XXXXXXXXX"
                        className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={busyId === 'wa_test' || !waEnabled}
                        onClick={handleTestWhatsApp}
                        className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
                      >
                        {lang === 'bn' ? 'টেস্ট পাঠান' : 'Send Test'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Meal Rates & Audit Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold">{t(lang, 'rateHistory')}</h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {mealRates.map((r) => (
                      <div key={r.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                        <span>
                          {t(lang, r.mealType)} · {r.effectiveFrom}
                        </span>
                        <span className="font-semibold tabular-nums">{formatPoisha(r.amountInPoisha, lang)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{t(lang, 'auditLogs')}</h3>
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="px-5 py-2.5 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{log.action}</p>
                          <p className="text-slate-500 truncate">
                            {log.targetType}/{log.targetId}
                          </p>
                        </div>
                        <span className="text-slate-400 tabular-nums shrink-0">
                          {log.timestamp?.toDate?.()?.toLocaleString() || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'profile' && <ProfileView />}
        </main>
      </div>

      {/* Mobile Bottom Nav + More Drawer */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16 pb-safe">
        {primaryMobileNav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setMoreOpen(false);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              tab === item.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {item.icon}
            <span className="truncate max-w-[64px]">{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            ['balanceFinished', 'expenses', 'reports', 'settings', 'profile'].includes(tab)
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>{lang === 'bn' ? 'আরও' : 'More'}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-8 space-y-2 border-t border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />
            {(
              [
                ['balanceFinished', `${t(lang, 'navBalanceFinished')} (${balanceFinishedCustomers.length})`, <AlertTriangle className="w-5 h-5 text-rose-500" />],
                ['expenses', t(lang, 'navExpenses'), <Receipt className="w-5 h-5" />],
                ['reports', t(lang, 'navReports'), <BarChart3 className="w-5 h-5" />],
                ['settings', t(lang, 'navSettings'), <SettingsIcon className="w-5 h-5" />],
                ['profile', t(lang, 'navProfile'), <ShieldCheck className="w-5 h-5" />],
              ] as [AdminTab, string, React.ReactNode][]
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setMoreOpen(false);
                }}
                className="w-full min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
