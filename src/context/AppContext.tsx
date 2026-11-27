import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  buildFirestoreErrorInfo,
  checkFirestoreConnection,
  db,
  isFirebaseInitialized,
  OperationType,
  type FirestoreConnectionStatus,
} from '../firebase';
import type {
  AdminSettings,
  AuditLogRecord,
  DepositRequest,
  ExpenseRecord,
  MealEntry,
  MealRate,
  MessSettings,
  MonthlyReportRecord,
  NoticeRecord,
  NotificationRecord,
  TransactionRecord,
  UserProfile,
  Wallet,
} from '../types/mess';
import {
  hasGoogleProvider,
  isPrimaryAdminConfigured,
  isPrimaryAdminEmailMatch,
  PRIMARY_ADMIN_EMAIL,
} from '../config/admin';
import type { Language } from '../utils/i18n';
import {
  approveMealEntry,
  bootstrapPrimaryAdmin,
  ensureMemberProfile,
  getAdminBootstrapStatus,
} from '../services/messService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  authReady: boolean;
  profileSyncing: boolean;
  profileError: string | null;
  firebaseOnline: boolean;
  firestoreStatus: FirestoreConnectionStatus | null;
  retryFirestoreConnection: () => Promise<boolean>;
  firebaseUser: User | null;
  profile: UserProfile | null;
  isVerifiedAccount: boolean;
  isAdmin: boolean;
  isPrimaryAdminCandidate: boolean;
  bootstrapInitialized: boolean;
  bootstrapAdminUid: string | null;
  messSettings: MessSettings | null;
  adminSettings: AdminSettings | null;

  members: UserProfile[];
  wallets: Record<string, Wallet>;
  myWallet: Wallet | null;
  mealRates: MealRate[];
  mealEntries: MealEntry[];
  transactions: TransactionRecord[];
  depositRequests: DepositRequest[];
  expenses: ExpenseRecord[];
  notifications: NotificationRecord[];
  notices: NoticeRecord[];
  monthlyReports: MonthlyReportRecord[];
  auditLogs: AuditLogRecord[];

  lang: Language;
  setLang: (lang: Language) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], text: string) => void;
  logout: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  retryProfileSync: () => Promise<void>;
  runAdminBootstrap: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [firebaseOnline, setFirebaseOnline] = useState(true);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreConnectionStatus | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authSignInProvider, setAuthSignInProvider] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bootstrapInitialized, setBootstrapInitialized] = useState(false);
  const [bootstrapAdminUid, setBootstrapAdminUid] = useState<string | null>(null);

  const [messSettings, setMessSettings] = useState<MessSettings | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [myWallet, setMyWallet] = useState<Wallet | null>(null);
  const [mealRates, setMealRates] = useState<MealRate[]>([]);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = window.localStorage.getItem('mmp_lang');
      return saved === 'en' ? 'en' : 'bn';
    } catch {
      return 'bn';
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('mmp_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const autoApprovingRef = useRef<Set<string>>(new Set());
  const syncInFlightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem('mmp_lang', next);
    } catch {
      // ignore storage restriction
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('mmp_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const notify = (type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  };

  const handleListenerError = (error: unknown, op: OperationType, path: string) => {
    const info = buildFirestoreErrorInfo(error, op, path);
    console.error('Firestore Listener Error:', JSON.stringify(info));
    if (info.error.includes('the client is offline')) {
      setFirebaseOnline(false);
    }
  };

  useEffect(() => {
    if (!isFirebaseInitialized || !auth) return;
    auth.languageCode = lang === 'bn' ? 'bn' : 'en';
  }, [lang]);

  const retryFirestoreConnection = async (): Promise<boolean> => {
    if (!isFirebaseInitialized) {
      setFirebaseOnline(false);
      return false;
    }
    const status = await checkFirestoreConnection();
    setFirestoreStatus(status);
    setFirebaseOnline(status.online);
    return status.online;
  };

  useEffect(() => {
    void retryFirestoreConnection();
  }, []);

  const isVerifiedAccount = useMemo(() => {
    if (!firebaseUser) return false;
    const isPhone = firebaseUser.providerData?.some((p) => p.providerId === 'phone');
    return Boolean(firebaseUser.emailVerified || isPhone);
  }, [firebaseUser, authVersion]);

  const isPrimaryAdminCandidate = useMemo(() => {
    if (!firebaseUser || !isPrimaryAdminConfigured() || !firebaseUser.emailVerified) return false;
    const googleOk = authSignInProvider
      ? authSignInProvider === 'google.com'
      : hasGoogleProvider(firebaseUser);
    return googleOk && isPrimaryAdminEmailMatch(firebaseUser.email);
  }, [firebaseUser, authSignInProvider, authVersion]);

  const isAdmin = useMemo(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !isPrimaryAdminCandidate) return false;
    return Boolean(
      bootstrapInitialized &&
        bootstrapAdminUid &&
        firebaseUser.uid === bootstrapAdminUid &&
        profile?.role === 'admin' &&
        profile?.status === 'active'
    );
  }, [firebaseUser, authVersion, bootstrapInitialized, bootstrapAdminUid, profile, isPrimaryAdminCandidate]);

  const syncVerifiedUserProfile = async (user: User) => {
    const isPhone = user.providerData?.some((p) => p.providerId === 'phone');
    if (!user.emailVerified && !isPhone) return;

    if (syncInFlightRef.current && syncInFlightRef.current.uid === user.uid) {
      return syncInFlightRef.current.promise;
    }

    const run = (async () => {
      setProfileSyncing(true);
      setProfileError(null);
      try {
        const tokenResult = await user.getIdTokenResult();
        const signInProvider = tokenResult.signInProvider ?? null;
        setAuthSignInProvider(signInProvider);

        if (isPrimaryAdminEmailMatch(user.email) && signInProvider !== 'google.com') {
          setProfileError(
            lang === 'bn'
              ? 'প্রাইমারি অ্যাডমিন অ্যাক্সেসের জন্য এই ইমেইল দিয়ে "Google দিয়ে প্রবেশ করুন" ব্যবহার করে লগইন করুন।'
              : 'Primary Admin access requires signing in with Google ("Continue with Google") using this account.'
          );
          return;
        }

        const isCandidate =
          isPrimaryAdminConfigured() &&
          user.emailVerified &&
          signInProvider === 'google.com' &&
          isPrimaryAdminEmailMatch(user.email);
        if (isCandidate) {
          const boot = await getAdminBootstrapStatus();
          setBootstrapInitialized(boot.initialized);
          setBootstrapAdminUid(boot.adminUid ?? null);

          if (
            !boot.initialized ||
            boot.adminUid !== user.uid ||
            boot.adminEmail?.toLowerCase() !== PRIMARY_ADMIN_EMAIL
          ) {
            await bootstrapPrimaryAdmin(user);
            const updatedBoot = await getAdminBootstrapStatus();
            setBootstrapInitialized(updatedBoot.initialized);
            setBootstrapAdminUid(updatedBoot.adminUid ?? null);
          }
        }
        const ensured = await ensureMemberProfile(user);
        if (isCandidate) {
          const refreshedBoot = await getAdminBootstrapStatus();
          setBootstrapInitialized(refreshedBoot.initialized);
          setBootstrapAdminUid(refreshedBoot.adminUid ?? null);
        }
        setProfile(ensured);
      } catch (err) {
        console.error('Bootstrap/profile check error:', err);
        const raw = err instanceof Error ? err.message : 'Profile sync failed';
        let parsedError = raw;
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          if (parsed?.error) parsedError = parsed.error;
        } catch {
          // keep raw message
        }
        if (
          parsedError.includes('Permission denied on the service') ||
          parsedError.includes('the client is offline')
        ) {
          setFirebaseOnline(false);
          setProfileError(
            lang === 'bn'
              ? 'Firebase প্রজেক্ট (gen-lang-client-0047498127)-এ Cloud Firestore API অথবা (default) Firestore Database সংযুক্ত হতে পারেনি। Console-এ Cloud Firestore চালু এবং API Key অনুমতি যাচাই করুন।'
              : 'Unable to reach Cloud Firestore on project "gen-lang-client-0047498127". Ensure Firestore Database is created, Cloud Firestore API is enabled, and the API key allows Cloud Firestore API.'
          );
        } else {
          setProfileError(parsedError);
        }
      } finally {
        if (syncInFlightRef.current?.uid === user.uid) {
          syncInFlightRef.current = null;
        }
        setProfileSyncing(false);
      }
    })();

    syncInFlightRef.current = { uid: user.uid, promise: run };
    return run;
  };

  const retryProfileSync = async () => {
    if (!isFirebaseInitialized || !auth?.currentUser) return;
    await auth.currentUser.getIdToken(true);
    await syncVerifiedUserProfile(auth.currentUser);
  };

  const runAdminBootstrap = async () => {
    if (!isFirebaseInitialized || !auth?.currentUser) return;
    setProfileError(null);
    await auth.currentUser.getIdToken(true);
    await bootstrapPrimaryAdmin(auth.currentUser);
    const status = await getAdminBootstrapStatus();
    setBootstrapInitialized(status.initialized);
    setBootstrapAdminUid(status.adminUid ?? null);
    const ensured = await ensureMemberProfile(auth.currentUser);
    setProfile(ensured);
    setAuthVersion((v) => v + 1);
  };

  const refreshAuthUser = async (): Promise<boolean> => {
    if (!isFirebaseInitialized || !auth) return false;
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    await current.getIdToken(true);
    setFirebaseUser(auth.currentUser);
    setAuthVersion((v) => v + 1);
    const isPhone = current.providerData?.some((p) => p.providerId === 'phone');
    const verified = Boolean(current.emailVerified || isPhone);
    if (verified) {
      await syncVerifiedUserProfile(current);
    }
    return verified;
  };

  useEffect(() => {
    if (!isFirebaseInitialized || !auth) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthVersion((v) => v + 1);
      if (!user) {
        setAuthSignInProvider(null);
        setProfile(null);
        setProfileError(null);
        setMembers([]);
        setWallets({});
        setMyWallet(null);
        setMealEntries([]);
        setTransactions([]);
        setDepositRequests([]);
        setExpenses([]);
        setNotifications([]);
        setNotices([]);
        setMonthlyReports([]);
        setAuditLogs([]);
        setAuthReady(true);
        return;
      }

      await syncVerifiedUserProfile(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Subscribe to own user profile, bootstrap doc, and mess settings once verified
  useEffect(() => {
    if (!authReady || !firebaseUser || !isVerifiedAccount) return;

    const unsubs: (() => void)[] = [];

    if (isPrimaryAdminCandidate) {
      unsubs.push(
        onSnapshot(
          doc(db, 'system', 'adminBootstrap'),
          (snap) => {
            if (snap.exists()) {
              setBootstrapInitialized(true);
              setBootstrapAdminUid(snap.data().adminUid);
            } else {
              setBootstrapInitialized(false);
              setBootstrapAdminUid(null);
            }
          },
          (error) => handleListenerError(error, OperationType.GET, 'system/adminBootstrap')
        )
      );
    }

    unsubs.push(
      onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        },
        (error) => handleListenerError(error, OperationType.GET, `users/${firebaseUser.uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'mess'),
        (snap) => {
          setMessSettings(snap.exists() ? (snap.data() as MessSettings) : null);
        },
        (error) => handleListenerError(error, OperationType.GET, 'settings/mess')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'mealRates'), orderBy('createdAt', 'desc'), limit(60)),
        (snap) => {
          setMealRates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MealRate)));
        },
        (error) => handleListenerError(error, OperationType.LIST, 'mealRates')
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [authReady, firebaseUser, isVerifiedAccount, isPrimaryAdminCandidate, authVersion]);

  // Role-gated collection subscriptions
  useEffect(() => {
    if (!authReady || !firebaseUser || !isVerifiedAccount || !profile) return;
    if (profile.status !== 'active' && !isAdmin) return;

    const unsubs: (() => void)[] = [];
    const uid = firebaseUser.uid;

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          doc(db, 'adminSettings', 'integrations'),
          (snap) => setAdminSettings(snap.exists() ? (snap.data() as AdminSettings) : null),
          (e) => handleListenerError(e, OperationType.GET, 'adminSettings/integrations')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'users'), orderBy('createdAt', 'desc')),
          (snap) => setMembers(snap.docs.map((d) => d.data() as UserProfile)),
          (e) => handleListenerError(e, OperationType.LIST, 'users')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'wallets'),
          (snap) => {
            const map: Record<string, Wallet> = {};
            snap.docs.forEach((d) => {
              map[d.id] = d.data() as Wallet;
            });
            setWallets(map);
            setMyWallet(map[uid] ?? null);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'wallets')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'mealEntries'), orderBy('createdAt', 'desc'), limit(500)),
          (snap) => setMealEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MealEntry))),
          (e) => handleListenerError(e, OperationType.LIST, 'mealEntries')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500)),
          (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'transactions')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'depositRequests'), orderBy('createdAt', 'desc'), limit(300)),
          (snap) => setDepositRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepositRequest))),
          (e) => handleListenerError(e, OperationType.LIST, 'depositRequests')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(300)),
          (snap) => setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'expenses')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(200)),
          (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'notifications')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(100)),
          (snap) => setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NoticeRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'notices')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'monthlyReports'), orderBy('generatedAt', 'desc'), limit(300)),
          (snap) => setMonthlyReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthlyReportRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'monthlyReports')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200)),
          (snap) => setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogRecord))),
          (e) => handleListenerError(e, OperationType.LIST, 'auditLogs')
        )
      );
    } else {
      let sharedExpenses: ExpenseRecord[] = [];
      let selectedExpenses: ExpenseRecord[] = [];
      const mergeExpenses = () => {
        const byId = new Map<string, ExpenseRecord>();
        [...sharedExpenses, ...selectedExpenses].forEach((e) => {
          if (e.id) byId.set(e.id, e);
        });
        const merged = Array.from(byId.values());
        merged.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setExpenses(merged);
      };

      unsubs.push(
        onSnapshot(
          doc(db, 'wallets', uid),
          (snap) => setMyWallet(snap.exists() ? (snap.data() as Wallet) : null),
          (e) => handleListenerError(e, OperationType.GET, `wallets/${uid}`)
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'mealEntries'), where('memberId', '==', uid), limit(300)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MealEntry));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setMealEntries(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'mealEntries')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'transactions'), where('memberId', '==', uid), limit(300)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionRecord));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setTransactions(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'transactions')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'depositRequests'), where('memberId', '==', uid), limit(150)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepositRequest));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setDepositRequests(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'depositRequests')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'expenses'), where('allocationType', 'in', ['equal', 'general']), limit(200)),
          (snap) => {
            sharedExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseRecord));
            mergeExpenses();
          },
          (e) => handleListenerError(e, OperationType.LIST, 'expenses')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'expenses'), where('allocatedMemberIds', 'array-contains', uid), limit(200)),
          (snap) => {
            selectedExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseRecord));
            mergeExpenses();
          },
          (e) => handleListenerError(e, OperationType.LIST, 'expenses')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), where('recipientUid', '==', uid), limit(100)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationRecord));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setNotifications(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'notifications')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notices'), where('published', '==', true), where('targetType', '==', 'all'), limit(50)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NoticeRecord));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setNotices(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'notices')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'monthlyReports'), where('memberId', '==', uid), limit(60)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthlyReportRecord));
            list.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
            setMonthlyReports(list);
          },
          (e) => handleListenerError(e, OperationType.LIST, 'monthlyReports')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [authReady, firebaseUser, isVerifiedAccount, profile?.status, isAdmin, authVersion]);

  // Automatic meal approval processor when Admin has automaticMealApproval enabled
  useEffect(() => {
    if (!isAdmin || !messSettings?.automaticMealApproval || !firebaseUser) return;
    const pendingMeals = mealEntries.filter((m) => m.status === 'pending' && m.id);
    for (const meal of pendingMeals) {
      if (!meal.id || autoApprovingRef.current.has(meal.id)) continue;
      autoApprovingRef.current.add(meal.id);
      approveMealEntry(meal.id, firebaseUser.uid, messSettings)
        .catch((err) => console.error('Auto approval error:', err))
        .finally(() => {
          if (meal.id) autoApprovingRef.current.delete(meal.id);
        });
    }
  }, [isAdmin, messSettings, mealEntries, firebaseUser]);

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    setProfile(null);
    setProfileError(null);
    setFirebaseUser(null);
  };

  return (
    <AppContext.Provider
      value={{
        authReady,
        profileSyncing,
        profileError,
        firebaseOnline,
        firestoreStatus,
        retryFirestoreConnection,
        firebaseUser,
        profile,
        isVerifiedAccount,
        isAdmin,
        isPrimaryAdminCandidate,
        bootstrapInitialized,
        bootstrapAdminUid,
        messSettings,
        adminSettings,
        members,
        wallets,
        myWallet,
        mealRates,
        mealEntries,
        transactions,
        depositRequests,
        expenses,
        notifications,
        notices,
        monthlyReports,
        auditLogs,
        lang,
        setLang,
        theme,
        toggleTheme,
        toasts,
        notify,
        logout,
        refreshAuthUser,
        retryProfileSync,
        runAdminBootstrap,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
