import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AdminSettings,
  AllocationType,
  ExpenseCategory,
  MealEntry,
  MealType,
  MessSettings,
  PaymentMethod,
  TransactionRecord,
  UserProfile,
  UserStatus,
  Wallet,
} from '../types/mess';
import {
  isPrimaryAdminConfigured,
  isPrimaryAdminEmailMatch,
  PRIMARY_ADMIN_EMAIL,
} from '../config/admin';
import { allocatePoishaExactly, computeAlertLevel, formatPoisha, getTodayDateDhaka } from '../utils/money';

function cleanIdPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${cleanIdPart(prefix)}_${Date.now()}_${rand}`;
}

function buildNextWalletPayload(params: {
  memberId: string;
  prevWallet: Wallet | null;
  openingBalanceInPoisha: number;
  currentBalanceInPoisha: number;
  totalDepositsInPoisha: number;
  totalMealCostsInPoisha: number;
  totalExpensesInPoisha: number;
  totalRefundsInPoisha: number;
  lastAlertLevel: Wallet['lastAlertLevel'];
}): Record<string, unknown> {
  const {
    memberId,
    prevWallet,
    openingBalanceInPoisha,
    currentBalanceInPoisha,
    totalDepositsInPoisha,
    totalMealCostsInPoisha,
    totalExpensesInPoisha,
    totalRefundsInPoisha,
    lastAlertLevel,
  } = params;

  const newBalance = Math.trunc(currentBalanceInPoisha);
  const prevBalance = prevWallet ? Math.trunc(prevWallet.currentBalanceInPoisha) : 0;

  let previousBalanceInPoisha: number;
  if (!prevWallet) {
    previousBalanceInPoisha = 0;
  } else if (prevBalance > 0 && newBalance <= 0) {
    previousBalanceInPoisha = prevBalance;
  } else if (prevBalance <= 0 && newBalance <= 0) {
    previousBalanceInPoisha =
      typeof prevWallet.previousBalanceInPoisha === 'number'
        ? Math.trunc(prevWallet.previousBalanceInPoisha)
        : prevBalance;
  } else {
    previousBalanceInPoisha = prevBalance;
  }

  const payload: Record<string, unknown> = {
    memberId,
    openingBalanceInPoisha: Math.trunc(openingBalanceInPoisha),
    currentBalanceInPoisha: newBalance,
    totalDepositsInPoisha: Math.trunc(totalDepositsInPoisha),
    totalMealCostsInPoisha: Math.trunc(totalMealCostsInPoisha),
    totalExpensesInPoisha: Math.trunc(totalExpensesInPoisha),
    totalRefundsInPoisha: Math.trunc(totalRefundsInPoisha),
    previousBalanceInPoisha,
    lastAlertLevel: lastAlertLevel || 'none',
    updatedAt: serverTimestamp(),
  };

  if (newBalance <= 0) {
    payload.balanceFinishedAt =
      prevWallet && prevBalance <= 0 && prevWallet.balanceFinishedAt
        ? prevWallet.balanceFinishedAt
        : serverTimestamp();
  }

  return payload;
}

export const DEFAULT_MESS_SETTINGS = {
  messName: 'গ্রিনভ্যালি মেস (Mess Manager Pro)',
  currency: 'BDT' as const,
  timezone: 'Asia/Dhaka' as const,
  openingDate: getTodayDateDhaka(),
  breakfastRate: 300, // ৳3.00
  lunchRate: 3000, // ৳30.00
  dinnerRate: 3000, // ৳30.00
  lowBalanceThreshold: 20000, // ৳200.00
  criticalBalanceThreshold: 5000, // ৳50.00
  zeroBalanceNotificationEnabled: true,
  memberMealEntryEnabled: true,
  automaticMealApproval: false,
  notificationSettings: {
    mealAlerts: true,
    depositAlerts: true,
    expenseAlerts: true,
  },
};

export async function getAdminBootstrapStatus(): Promise<{
  initialized: boolean;
  adminUid?: string;
  adminEmail?: string;
}> {
  try {
    const snap = await getDoc(doc(db, 'system', 'adminBootstrap'));
    if (!snap.exists()) {
      return { initialized: false };
    }
    const data = snap.data();
    return {
      initialized: true,
      adminUid: data.adminUid,
      adminEmail: data.adminEmail,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'system/adminBootstrap');
  }
}

/**
 * One-time atomic bootstrap for the single primary Administrator.
 * Protected by firestore.rules so only the verified primary Admin email can create it once.
 */
export async function bootstrapPrimaryAdmin(user: User): Promise<void> {
  if (!isPrimaryAdminConfigured()) {
    throw new Error(
      'Primary Admin email is not configured. Replace MY_NEW_ADMIN_EMAIL in src/config/admin.ts (or set VITE_PRIMARY_ADMIN_EMAIL) and firestore.rules.'
    );
  }
  const tokenResult = await user.getIdTokenResult();
  if (
    !user.email ||
    !user.emailVerified ||
    tokenResult.signInProvider !== 'google.com' ||
    !isPrimaryAdminEmailMatch(user.email)
  ) {
    throw new Error('Only the configured, verified Google primary administrator account can initialize Admin access.');
  }

  const bootstrapRef = doc(db, 'system', 'adminBootstrap');
  let existingBootstrap;
  try {
    existingBootstrap = await getDoc(bootstrapRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'system/adminBootstrap');
  }

  const existingBootData = existingBootstrap.exists() ? existingBootstrap.data() : null;
  const needsBootstrapWrite =
    !existingBootData ||
    existingBootData.adminUid !== user.uid ||
    String(existingBootData.adminEmail || '').toLowerCase() !== PRIMARY_ADMIN_EMAIL;

  // Bind system/adminBootstrap to the current verified primary admin UID first so
  // subsequent isAdmin() checks evaluate cleanly against the committed bootstrap lock.
  if (needsBootstrapWrite) {
    try {
      await setDoc(bootstrapRef, {
        adminUid: user.uid,
        adminEmail: user.email.slice(0, 200),
        initializedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'system/adminBootstrap');
    }
  }

  const today = getTodayDateDhaka();
  const userRef = doc(db, 'users', user.uid);
  const settingsRef = doc(db, 'settings', 'mess');
  const adminSettingsRef = doc(db, 'adminSettings', 'integrations');

  let existingUser;
  let existingSettings;
  let existingAdminSettings;
  try {
    [existingUser, existingSettings, existingAdminSettings] = await Promise.all([
      getDoc(userRef),
      getDoc(settingsRef),
      getDoc(adminSettingsRef),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }

  const rawAdminName =
    user.displayName?.trim() ||
    (user.email ? user.email.split('@')[0].trim() : '') ||
    'Mess Administrator';
  const safeAdminName = (rawAdminName.length >= 2 ? rawAdminName : 'Mess Administrator').slice(0, 120);

  const batch = writeBatch(db);
  let hasBatchWrites = false;

  if (!existingUser.exists()) {
    batch.set(userRef, {
      uid: user.uid,
      fullName: safeAdminName,
      email: user.email.slice(0, 200),
      ...(user.phoneNumber ? { phoneNumber: user.phoneNumber.slice(0, 32) } : {}),
      ...(user.photoURL ? { profileImage: user.photoURL.slice(0, 1000) } : {}),
      role: 'admin',
      status: 'active',
      joiningDate: today,
      whatsappConsent: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    hasBatchWrites = true;
  } else {
    const existingData = existingUser.data() as UserProfile;
    if (existingData.role !== 'admin' || existingData.status !== 'active') {
      const upgradePayload: Record<string, unknown> = {
        role: 'admin',
        status: 'active',
        email: user.email.slice(0, 200),
        updatedAt: serverTimestamp(),
      };
      if (!existingData.fullName || existingData.fullName.trim().length < 2) {
        upgradePayload.fullName = safeAdminName;
      }
      if (user.photoURL && !existingData.profileImage) {
        upgradePayload.profileImage = user.photoURL.slice(0, 1000);
      }
      batch.update(userRef, upgradePayload);
      hasBatchWrites = true;
    }
  }

  if (!existingSettings.exists()) {
    batch.set(settingsRef, {
      ...DEFAULT_MESS_SETTINGS,
      updatedAt: serverTimestamp(),
    });
    const initialRates: { type: MealType; amount: number }[] = [
      { type: 'breakfast', amount: DEFAULT_MESS_SETTINGS.breakfastRate },
      { type: 'lunch', amount: DEFAULT_MESS_SETTINGS.lunchRate },
      { type: 'dinner', amount: DEFAULT_MESS_SETTINGS.dinnerRate },
    ];
    for (const r of initialRates) {
      batch.set(doc(db, 'mealRates', `init_${r.type}_${Date.now()}`), {
        mealType: r.type,
        amountInPoisha: r.amount,
        effectiveFrom: today,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
    }
    hasBatchWrites = true;
  }

  if (!existingAdminSettings.exists()) {
    batch.set(adminSettingsRef, {
      whatsappEnabled: false,
      whatsappConsentRequired: true,
      fcmEnabled: true,
      updatedAt: serverTimestamp(),
    });
    hasBatchWrites = true;
  }

  if (needsBootstrapWrite || hasBatchWrites) {
    batch.set(doc(db, 'auditLogs', makeDocId('bootstrap')), {
      actorUid: user.uid,
      action: existingBootstrap.exists() ? 'ADMIN_BOOTSTRAP_RECOVERED' : 'ADMIN_BOOTSTRAP_INITIALIZED',
      targetType: 'system',
      targetId: 'adminBootstrap',
      timestamp: serverTimestamp(),
      newValue: { adminUid: user.uid, adminEmail: user.email.slice(0, 200) },
    });
    hasBatchWrites = true;
  }

  if (hasBatchWrites) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  }
}

export async function ensureMemberProfile(user: User, fullNameOverride?: string): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const tokenResult = await user.getIdTokenResult();
  const isPrimaryCandidate =
    isPrimaryAdminConfigured() &&
    Boolean(user.emailVerified) &&
    tokenResult.signInProvider === 'google.com' &&
    isPrimaryAdminEmailMatch(user.email);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existingProfile = snap.data() as UserProfile;
      if (isPrimaryCandidate && (existingProfile.role !== 'admin' || existingProfile.status !== 'active')) {
        await bootstrapPrimaryAdmin(user);
        const promoted = await getDoc(userRef);
        return promoted.data() as UserProfile;
      }
      return existingProfile;
    }

    if (isPrimaryCandidate) {
      await bootstrapPrimaryAdmin(user);
      const createdAdmin = await getDoc(userRef);
      if (createdAdmin.exists()) {
        return createdAdmin.data() as UserProfile;
      }
    }

    const rawFallbackName =
      fullNameOverride?.trim() ||
      user.displayName?.trim() ||
      (user.email ? user.email.split('@')[0].trim() : '') ||
      (user.phoneNumber ? `Member ${user.phoneNumber.slice(-4)}` : 'Mess Member');
    const fallbackName = rawFallbackName.length >= 2 ? rawFallbackName : 'Mess Member';

    const payload: Record<string, unknown> = {
      uid: user.uid,
      fullName: fallbackName.slice(0, 120),
      role: 'member',
      status: 'pending',
      joiningDate: getTodayDateDhaka(),
      whatsappConsent: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (user.email) payload.email = user.email.slice(0, 200);
    if (user.phoneNumber) payload.phoneNumber = user.phoneNumber.slice(0, 32);
    if (user.photoURL) payload.profileImage = user.photoURL.slice(0, 1000);

    await setDoc(userRef, payload);
    const created = await getDoc(userRef);
    return created.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updateOwnProfile(
  uid: string,
  updates: {
    fullName?: string;
    phoneNumber?: string;
    profileImage?: string;
    whatsappConsent?: boolean;
    fcmToken?: string;
  }
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const clean: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.fullName !== undefined) clean.fullName = updates.fullName.trim().slice(0, 120);
  if (updates.phoneNumber !== undefined) clean.phoneNumber = updates.phoneNumber.trim().slice(0, 32);
  if (updates.profileImage !== undefined) clean.profileImage = updates.profileImage.trim().slice(0, 500);
  if (updates.whatsappConsent !== undefined) clean.whatsappConsent = updates.whatsappConsent;
  if (updates.fcmToken !== undefined) clean.fcmToken = updates.fcmToken.slice(0, 512);

  try {
    await updateDoc(userRef, clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function approveMemberWithWallet(
  memberUid: string,
  openingBalanceInPoisha: number,
  adminUid: string
): Promise<void> {
  const userRef = doc(db, 'users', memberUid);
  const walletRef = doc(db, 'wallets', memberUid);

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('Member profile not found.');
      const prevStatus = userSnap.data().status;
      const walletSnap = await tx.get(walletRef);

      tx.update(userRef, {
        status: 'active',
        updatedAt: serverTimestamp(),
      });

      if (!walletSnap.exists()) {
        tx.set(
          walletRef,
          buildNextWalletPayload({
            memberId: memberUid,
            prevWallet: null,
            openingBalanceInPoisha,
            currentBalanceInPoisha: openingBalanceInPoisha,
            totalDepositsInPoisha: 0,
            totalMealCostsInPoisha: 0,
            totalExpensesInPoisha: 0,
            totalRefundsInPoisha: 0,
            lastAlertLevel: openingBalanceInPoisha <= 0 ? 'zero' : 'none',
          })
        );
      }

      if (openingBalanceInPoisha !== 0 && !walletSnap.exists()) {
        tx.set(doc(db, 'transactions', `opening_${memberUid}`), {
          memberId: memberUid,
          type: 'adjustment',
          amountInPoisha: openingBalanceInPoisha,
          description: 'Opening wallet balance at registration approval',
          paymentMethod: 'opening',
          referenceId: memberUid,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
          status: 'completed',
        });
      }

      tx.set(doc(db, 'notifications', makeDocId('notif')), {
        recipientUid: memberUid,
        title: 'অ্যাকাউন্ট অনুমোদিত হয়েছে / Account Approved',
        message: 'মেস এডমিন আপনার অ্যাকাউন্ট অনুমোদন করেছেন। এখন আপনি মিল এন্ট্রি ও ওয়ালেট ব্যবহার করতে পারবেন।',
        category: 'account',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'MEMBER_APPROVED',
        targetType: 'users',
        targetId: memberUid,
        timestamp: serverTimestamp(),
        previousValue: { status: prevStatus },
        newValue: { status: 'active', openingBalanceInPoisha },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${memberUid}`);
  }
}

export async function updateMemberStatus(
  memberUid: string,
  newStatus: UserStatus,
  adminUid: string
): Promise<void> {
  const userRef = doc(db, 'users', memberUid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User not found.');
      const data = snap.data() as UserProfile;
      if (data.role === 'admin') {
        throw new Error('Cannot change status of the primary Admin account.');
      }
      tx.update(userRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: `MEMBER_STATUS_${newStatus.toUpperCase()}`,
        targetType: 'users',
        targetId: memberUid,
        timestamp: serverTimestamp(),
        previousValue: { status: data.status },
        newValue: { status: newStatus },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${memberUid}`);
  }
}

export async function updateMessSettingsAndRates(
  next: Omit<MessSettings, 'updatedAt'>,
  previous: MessSettings | null,
  adminUid: string
): Promise<void> {
  const batch = writeBatch(db);
  const today = getTodayDateDhaka();
  const settingsRef = doc(db, 'settings', 'mess');

  const payload: Record<string, unknown> = {
    messName: next.messName.trim().slice(0, 120),
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
    breakfastRate: Math.trunc(next.breakfastRate),
    lunchRate: Math.trunc(next.lunchRate),
    dinnerRate: Math.trunc(next.dinnerRate),
    lowBalanceThreshold: Math.trunc(next.lowBalanceThreshold),
    criticalBalanceThreshold: Math.trunc(next.criticalBalanceThreshold),
    zeroBalanceNotificationEnabled: Boolean(next.zeroBalanceNotificationEnabled),
    memberMealEntryEnabled: Boolean(next.memberMealEntryEnabled),
    automaticMealApproval: Boolean(next.automaticMealApproval),
    updatedAt: serverTimestamp(),
  };
  if (next.messLogo) payload.messLogo = next.messLogo.trim().slice(0, 500);
  if (next.openingDate) payload.openingDate = next.openingDate;
  if (next.notificationSettings) payload.notificationSettings = next.notificationSettings;

  batch.set(settingsRef, payload);

  const ratePairs: { type: MealType; prev?: number; curr: number }[] = [
    { type: 'breakfast', prev: previous?.breakfastRate, curr: next.breakfastRate },
    { type: 'lunch', prev: previous?.lunchRate, curr: next.lunchRate },
    { type: 'dinner', prev: previous?.dinnerRate, curr: next.dinnerRate },
  ];

  for (const r of ratePairs) {
    if (r.prev === undefined || r.prev !== r.curr) {
      batch.set(doc(db, 'mealRates', makeDocId(`rate_${r.type}`)), {
        mealType: r.type,
        amountInPoisha: Math.trunc(r.curr),
        effectiveFrom: today,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });
    }
  }

  batch.set(doc(db, 'auditLogs', makeDocId('audit')), {
    actorUid: adminUid,
    action: 'MESS_SETTINGS_UPDATED',
    targetType: 'settings',
    targetId: 'mess',
    timestamp: serverTimestamp(),
    previousValue: previous
      ? {
          breakfastRate: previous.breakfastRate,
          lunchRate: previous.lunchRate,
          dinnerRate: previous.dinnerRate,
          automaticMealApproval: previous.automaticMealApproval,
        }
      : {},
    newValue: {
      breakfastRate: next.breakfastRate,
      lunchRate: next.lunchRate,
      dinnerRate: next.dinnerRate,
      automaticMealApproval: next.automaticMealApproval,
    },
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/mess');
  }
}

function getRateForMealType(settings: MessSettings, mealType: MealType): number {
  if (mealType === 'breakfast') return settings.breakfastRate;
  if (mealType === 'lunch') return settings.lunchRate;
  return settings.dinnerRate;
}

function maybeQueueBalanceAlert(
  tx: Parameters<Parameters<typeof runTransaction>[1]>[0],
  memberId: string,
  newBalanceInPoisha: number,
  previousAlertLevel: string | undefined,
  settings: MessSettings
) {
  const nextLevel = computeAlertLevel(
    newBalanceInPoisha,
    settings.lowBalanceThreshold,
    settings.criticalBalanceThreshold,
    settings.zeroBalanceNotificationEnabled
  );

  if (nextLevel !== 'none' && nextLevel !== previousAlertLevel) {
    const labelBn =
      nextLevel === 'zero'
        ? 'ব্যালেন্স শূন্য বা বকেয়া হয়েছে'
        : nextLevel === 'critical'
          ? 'জরুরি কম ব্যালেন্স সতর্কতা'
          : 'লো ব্যালেন্স সতর্কতা';
    const labelEn =
      nextLevel === 'zero'
        ? 'Zero / Negative Balance Alert'
        : nextLevel === 'critical'
          ? 'Critical Low Balance Alert'
          : 'Low Balance Alert';

    tx.set(doc(db, 'notifications', makeDocId(`alert_${nextLevel}`)), {
      recipientUid: memberId,
      title: `${labelBn} / ${labelEn}`,
      message: `বর্তমান ব্যালেন্স: ${formatPoisha(newBalanceInPoisha, 'bn')}। অনুগ্রহ করে শীঘ্রই টাকা জমা দিন।`,
      category: `balance_${nextLevel}`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  return nextLevel;
}

export async function submitMealEntry(params: {
  memberId: string;
  mealDate: string;
  mealType: MealType;
  quantity: number;
  actorUid: string;
  isAdminActor: boolean;
  approveImmediately?: boolean;
  settings: MessSettings;
}): Promise<string> {
  const { memberId, mealDate, mealType, quantity, actorUid, isAdminActor, approveImmediately, settings } = params;
  const safeQty = Math.trunc(quantity);
  if (safeQty < 1 || safeQty > 20) {
    throw new Error('Quantity must be between 1 and 20.');
  }

  // Prevent duplicate meal entries for the same member, date, and meal type
  const dupQuery = query(
    collection(db, 'mealEntries'),
    where('memberId', '==', memberId),
    where('mealDate', '==', mealDate)
  );
  let dupSnap;
  try {
    dupSnap = await getDocs(dupQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'mealEntries');
  }

  const hasDuplicate = dupSnap.docs.some((d) => {
    const data = d.data() as MealEntry;
    return data.mealType === mealType && (data.status === 'pending' || data.status === 'approved');
  });
  if (hasDuplicate) {
    throw new Error(`Duplicate entry: A ${mealType} meal already exists for ${mealDate}.`);
  }

  const unitRateInPoisha = getRateForMealType(settings, mealType);
  const totalAmountInPoisha = safeQty * unitRateInPoisha;
  const entryId = makeDocId(`meal_${mealDate}_${mealType}`);
  const entryRef = doc(db, 'mealEntries', entryId);

  if (isAdminActor && approveImmediately) {
    const walletRef = doc(db, 'wallets', memberId);
    const txId = `meal_charge_${entryId}`;
    const txRef = doc(db, 'transactions', txId);

    try {
      await runTransaction(db, async (tx) => {
        const walletSnap = await tx.get(walletRef);
        const existingTx = await tx.get(txRef);
        if (existingTx.exists()) return; // idempotency guard

        const walletData: Wallet = walletSnap.exists()
          ? (walletSnap.data() as Wallet)
          : {
              memberId,
              openingBalanceInPoisha: 0,
              currentBalanceInPoisha: 0,
              totalDepositsInPoisha: 0,
              totalMealCostsInPoisha: 0,
              totalExpensesInPoisha: 0,
              totalRefundsInPoisha: 0,
              lastAlertLevel: 'none',
              updatedAt: Timestamp.now(),
            };

        const newBalance = walletData.currentBalanceInPoisha - totalAmountInPoisha;
        const nextAlert = maybeQueueBalanceAlert(tx, memberId, newBalance, walletData.lastAlertLevel, settings);

        tx.set(entryRef, {
          memberId,
          mealDate,
          mealType,
          quantity: safeQty,
          unitRateInPoisha,
          totalAmountInPoisha,
          status: 'approved',
          createdBy: actorUid,
          approvedBy: actorUid,
          createdAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (totalAmountInPoisha > 0) {
          tx.set(txRef, {
            memberId,
            type: 'meal_charge',
            amountInPoisha: totalAmountInPoisha,
            description: `${mealType.toUpperCase()} x${safeQty} (${mealDate})`,
            referenceId: entryId,
            createdBy: actorUid,
            createdAt: serverTimestamp(),
            status: 'completed',
          });
        }

        tx.set(
          walletRef,
          buildNextWalletPayload({
            memberId,
            prevWallet: walletSnap.exists() ? walletData : null,
            openingBalanceInPoisha: walletData.openingBalanceInPoisha,
            currentBalanceInPoisha: newBalance,
            totalDepositsInPoisha: walletData.totalDepositsInPoisha,
            totalMealCostsInPoisha: walletData.totalMealCostsInPoisha + totalAmountInPoisha,
            totalExpensesInPoisha: walletData.totalExpensesInPoisha,
            totalRefundsInPoisha: walletData.totalRefundsInPoisha,
            lastAlertLevel: nextAlert,
          })
        );

        tx.set(doc(db, 'notifications', makeDocId('notif')), {
          recipientUid: memberId,
          title: 'মিল অনুমোদিত হয়েছে / Meal Approved',
          message: `${mealDate} (${mealType} x${safeQty}) — চার্জ: ${formatPoisha(totalAmountInPoisha, 'bn')}`,
          category: 'meal_approved',
          isRead: false,
          createdAt: serverTimestamp(),
        });

        tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
          actorUid,
          action: 'MEAL_ENTRY_CREATED_APPROVED',
          targetType: 'mealEntries',
          targetId: entryId,
          timestamp: serverTimestamp(),
          newValue: { memberId, mealDate, mealType, quantity: safeQty, totalAmountInPoisha },
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `mealEntries/${entryId}`);
    }
    return entryId;
  }

  try {
    await setDoc(entryRef, {
      memberId,
      mealDate,
      mealType,
      quantity: safeQty,
      unitRateInPoisha,
      totalAmountInPoisha,
      status: 'pending',
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `mealEntries/${entryId}`);
  }
  return entryId;
}

export async function approveMealEntry(entryId: string, adminUid: string, settings: MessSettings): Promise<void> {
  const entryRef = doc(db, 'mealEntries', entryId);
  const txId = `meal_charge_${entryId}`;
  const txRef = doc(db, 'transactions', txId);

  try {
    await runTransaction(db, async (tx) => {
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists()) throw new Error('Meal entry not found.');
      const entry = entrySnap.data() as MealEntry;
      if (entry.status !== 'pending') return;

      const existingTx = await tx.get(txRef);
      if (existingTx.exists()) return; // Idempotency guard: 1 meal approval = 1 charge

      const walletRef = doc(db, 'wallets', entry.memberId);
      const walletSnap = await tx.get(walletRef);
      const walletData: Wallet = walletSnap.exists()
        ? (walletSnap.data() as Wallet)
        : {
            memberId: entry.memberId,
            openingBalanceInPoisha: 0,
            currentBalanceInPoisha: 0,
            totalDepositsInPoisha: 0,
            totalMealCostsInPoisha: 0,
            totalExpensesInPoisha: 0,
            totalRefundsInPoisha: 0,
            lastAlertLevel: 'none',
            updatedAt: Timestamp.now(),
          };

      const charge = entry.totalAmountInPoisha;
      const newBalance = walletData.currentBalanceInPoisha - charge;
      const nextAlert = maybeQueueBalanceAlert(tx, entry.memberId, newBalance, walletData.lastAlertLevel, settings);

      tx.update(entryRef, {
        status: 'approved',
        approvedBy: adminUid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (charge > 0) {
        tx.set(txRef, {
          memberId: entry.memberId,
          type: 'meal_charge',
          amountInPoisha: charge,
          description: `${entry.mealType.toUpperCase()} x${entry.quantity} (${entry.mealDate})`,
          referenceId: entryId,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
          status: 'completed',
        });
      }

      tx.set(
        walletRef,
        buildNextWalletPayload({
          memberId: entry.memberId,
          prevWallet: walletSnap.exists() ? walletData : null,
          openingBalanceInPoisha: walletData.openingBalanceInPoisha,
          currentBalanceInPoisha: newBalance,
          totalDepositsInPoisha: walletData.totalDepositsInPoisha,
          totalMealCostsInPoisha: walletData.totalMealCostsInPoisha + charge,
          totalExpensesInPoisha: walletData.totalExpensesInPoisha,
          totalRefundsInPoisha: walletData.totalRefundsInPoisha,
          lastAlertLevel: nextAlert,
        })
      );

      tx.set(doc(db, 'notifications', makeDocId('notif')), {
        recipientUid: entry.memberId,
        title: 'মিল অনুমোদিত হয়েছে / Meal Approved',
        message: `${entry.mealDate} (${entry.mealType} x${entry.quantity}) — চার্জ: ${formatPoisha(charge, 'bn')}`,
        category: 'meal_approved',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'MEAL_ENTRY_APPROVED',
        targetType: 'mealEntries',
        targetId: entryId,
        timestamp: serverTimestamp(),
        previousValue: { status: 'pending' },
        newValue: { status: 'approved', totalAmountInPoisha: charge },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `mealEntries/${entryId}`);
  }
}

export async function rejectMealEntry(entryId: string, adminUid: string): Promise<void> {
  const entryRef = doc(db, 'mealEntries', entryId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(entryRef);
      if (!snap.exists()) throw new Error('Meal entry not found.');
      const entry = snap.data() as MealEntry;
      if (entry.status !== 'pending') return;

      tx.update(entryRef, {
        status: 'rejected',
        approvedBy: adminUid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'notifications', makeDocId('notif')), {
        recipientUid: entry.memberId,
        title: 'মিল এন্ট্রি বাতিল / Meal Rejected',
        message: `${entry.mealDate} (${entry.mealType} x${entry.quantity}) এন্ট্রিটি অনুমোদিত হয়নি।`,
        category: 'meal_rejected',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'MEAL_ENTRY_REJECTED',
        targetType: 'mealEntries',
        targetId: entryId,
        timestamp: serverTimestamp(),
        previousValue: { status: 'pending' },
        newValue: { status: 'rejected' },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `mealEntries/${entryId}`);
  }
}

export async function editPendingMealEntry(
  entryId: string,
  newQuantity: number,
  adminUid: string
): Promise<void> {
  const safeQty = Math.trunc(newQuantity);
  if (safeQty < 1 || safeQty > 20) throw new Error('Quantity must be 1–20');
  const entryRef = doc(db, 'mealEntries', entryId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(entryRef);
      if (!snap.exists()) throw new Error('Meal entry not found.');
      const entry = snap.data() as MealEntry;
      if (entry.status !== 'pending') throw new Error('Only pending meals can be edited directly. Cancel approved meals for reversal.');

      const newTotal = safeQty * entry.unitRateInPoisha;
      tx.update(entryRef, {
        quantity: safeQty,
        totalAmountInPoisha: newTotal,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'MEAL_ENTRY_EDITED',
        targetType: 'mealEntries',
        targetId: entryId,
        timestamp: serverTimestamp(),
        previousValue: { quantity: entry.quantity, totalAmountInPoisha: entry.totalAmountInPoisha },
        newValue: { quantity: safeQty, totalAmountInPoisha: newTotal },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `mealEntries/${entryId}`);
  }
}

export async function cancelMealEntry(
  entryId: string,
  actorUid: string,
  isAdminActor: boolean,
  settings: MessSettings
): Promise<void> {
  const entryRef = doc(db, 'mealEntries', entryId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(entryRef);
      if (!snap.exists()) throw new Error('Meal entry not found.');
      const entry = snap.data() as MealEntry;

      if (entry.status === 'pending') {
        tx.update(entryRef, {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
        return;
      }

      if (entry.status === 'approved' && isAdminActor) {
        const origTxId = `meal_charge_${entryId}`;
        const origTxRef = doc(db, 'transactions', origTxId);
        const origTxSnap = await tx.get(origTxRef);
        const refundTxId = `refund_meal_${entryId}`;
        const refundTxRef = doc(db, 'transactions', refundTxId);
        const existingRefund = await tx.get(refundTxRef);
        if (existingRefund.exists()) return; // idempotency guard

        const walletRef = doc(db, 'wallets', entry.memberId);
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists()) throw new Error('Wallet missing.');
        const walletData = walletSnap.data() as Wallet;

        const refundAmount = entry.totalAmountInPoisha;
        const newBalance = walletData.currentBalanceInPoisha + refundAmount;
        const nextAlert = computeAlertLevel(
          newBalance,
          settings.lowBalanceThreshold,
          settings.criticalBalanceThreshold,
          settings.zeroBalanceNotificationEnabled
        );

        tx.update(entryRef, {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });

        if (origTxSnap.exists() && origTxSnap.data().status === 'completed') {
          tx.update(origTxRef, { status: 'reversed' });
        }

        if (refundAmount > 0) {
          tx.set(refundTxRef, {
            memberId: entry.memberId,
            type: 'refund',
            amountInPoisha: refundAmount,
            description: `Reversal of ${entry.mealType} x${entry.quantity} (${entry.mealDate})`,
            referenceId: entryId,
            reversalOf: origTxId,
            createdBy: actorUid,
            createdAt: serverTimestamp(),
            status: 'completed',
          });
        }

        tx.set(
          walletRef,
          buildNextWalletPayload({
            memberId: entry.memberId,
            prevWallet: walletData,
            openingBalanceInPoisha: walletData.openingBalanceInPoisha,
            currentBalanceInPoisha: newBalance,
            totalDepositsInPoisha: walletData.totalDepositsInPoisha,
            totalMealCostsInPoisha: walletData.totalMealCostsInPoisha,
            totalExpensesInPoisha: walletData.totalExpensesInPoisha,
            totalRefundsInPoisha: walletData.totalRefundsInPoisha + refundAmount,
            lastAlertLevel: nextAlert,
          })
        );

        tx.set(doc(db, 'notifications', makeDocId('notif')), {
          recipientUid: entry.memberId,
          title: 'মিল রিফান্ড সম্পন্ন / Meal Cancelled & Refunded',
          message: `${entry.mealDate} (${entry.mealType}) বাতিল হওয়ায় ${formatPoisha(refundAmount, 'bn')} ওয়ালেটে ফেরত দেওয়া হয়েছে।`,
          category: 'refund',
          isRead: false,
          createdAt: serverTimestamp(),
        });

        tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
          actorUid,
          action: 'MEAL_ENTRY_CANCELLED_REFUNDED',
          targetType: 'mealEntries',
          targetId: entryId,
          timestamp: serverTimestamp(),
          previousValue: { status: 'approved' },
          newValue: { status: 'cancelled', refundAmountInPoisha: refundAmount },
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `mealEntries/${entryId}`);
  }
}

export async function submitDepositRequest(params: {
  memberId: string;
  amountInPoisha: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  receiptImage?: string;
}): Promise<string> {
  const { memberId, amountInPoisha, paymentMethod, transactionId, receiptImage } = params;
  const safeAmount = Math.trunc(amountInPoisha);
  if (safeAmount <= 0) throw new Error('Deposit amount must be greater than zero.');

  const requestId = makeDocId('dep_req');
  const payload: Record<string, unknown> = {
    memberId,
    amountInPoisha: safeAmount,
    paymentMethod: paymentMethod.slice(0, 64),
    transactionId: transactionId.trim().slice(0, 128),
    status: 'pending',
    createdAt: serverTimestamp(),
  };
  if (receiptImage?.trim()) {
    payload.receiptImage = receiptImage.trim().slice(0, 500);
  }

  try {
    await setDoc(doc(db, 'depositRequests', requestId), payload);
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `depositRequests/${requestId}`);
  }
}

export async function reviewDepositRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  adminUid: string,
  settings: MessSettings
): Promise<void> {
  const reqRef = doc(db, 'depositRequests', requestId);
  const txId = `deposit_${requestId}`;
  const txRef = doc(db, 'transactions', txId);

  try {
    await runTransaction(db, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('Deposit request not found.');
      const reqData = reqSnap.data();
      if (reqData.status !== 'pending') return;

      if (decision === 'rejected') {
        tx.update(reqRef, {
          status: 'rejected',
          reviewedBy: adminUid,
          reviewedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'notifications', makeDocId('notif')), {
          recipientUid: reqData.memberId,
          title: 'জমা অনুরোধ প্রত্যাখ্যাত / Deposit Rejected',
          message: `${formatPoisha(reqData.amountInPoisha, 'bn')} জমার অনুরোধ (${reqData.transactionId}) যাচাইয়ে গৃহীত হয়নি।`,
          category: 'deposit_rejected',
          isRead: false,
          createdAt: serverTimestamp(),
        });
        tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
          actorUid: adminUid,
          action: 'DEPOSIT_REJECTED',
          targetType: 'depositRequests',
          targetId: requestId,
          timestamp: serverTimestamp(),
          previousValue: { status: 'pending' },
          newValue: { status: 'rejected' },
        });
        return;
      }

      const existingTx = await tx.get(txRef);
      if (existingTx.exists()) return; // Idempotency guard

      const walletRef = doc(db, 'wallets', reqData.memberId);
      const walletSnap = await tx.get(walletRef);
      const walletData: Wallet = walletSnap.exists()
        ? (walletSnap.data() as Wallet)
        : {
            memberId: reqData.memberId,
            openingBalanceInPoisha: 0,
            currentBalanceInPoisha: 0,
            totalDepositsInPoisha: 0,
            totalMealCostsInPoisha: 0,
            totalExpensesInPoisha: 0,
            totalRefundsInPoisha: 0,
            lastAlertLevel: 'none',
            updatedAt: Timestamp.now(),
          };

      const newBalance = walletData.currentBalanceInPoisha + reqData.amountInPoisha;
      const nextAlert = computeAlertLevel(
        newBalance,
        settings.lowBalanceThreshold,
        settings.criticalBalanceThreshold,
        settings.zeroBalanceNotificationEnabled
      );

      tx.update(reqRef, {
        status: 'approved',
        reviewedBy: adminUid,
        reviewedAt: serverTimestamp(),
      });

      tx.set(txRef, {
        memberId: reqData.memberId,
        type: 'deposit',
        amountInPoisha: reqData.amountInPoisha,
        description: `Deposit approved (${reqData.paymentMethod} · ${reqData.transactionId})`,
        paymentMethod: reqData.paymentMethod,
        referenceId: requestId,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        status: 'completed',
      });

      tx.set(
        walletRef,
        buildNextWalletPayload({
          memberId: reqData.memberId,
          prevWallet: walletSnap.exists() ? walletData : null,
          openingBalanceInPoisha: walletData.openingBalanceInPoisha,
          currentBalanceInPoisha: newBalance,
          totalDepositsInPoisha: walletData.totalDepositsInPoisha + reqData.amountInPoisha,
          totalMealCostsInPoisha: walletData.totalMealCostsInPoisha,
          totalExpensesInPoisha: walletData.totalExpensesInPoisha,
          totalRefundsInPoisha: walletData.totalRefundsInPoisha,
          lastAlertLevel: nextAlert,
        })
      );

      tx.set(doc(db, 'notifications', makeDocId('notif')), {
        recipientUid: reqData.memberId,
        title: 'জমা নিশ্চিত হয়েছে / Deposit Confirmed',
        message: `${formatPoisha(reqData.amountInPoisha, 'bn')} আপনার ওয়ালেটে যুক্ত হয়েছে। নতুন ব্যালেন্স: ${formatPoisha(newBalance, 'bn')}`,
        category: 'deposit_approved',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'DEPOSIT_APPROVED',
        targetType: 'depositRequests',
        targetId: requestId,
        timestamp: serverTimestamp(),
        previousValue: { status: 'pending' },
        newValue: { status: 'approved', amountInPoisha: reqData.amountInPoisha },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `depositRequests/${requestId}`);
  }
}

export async function recordDirectLedgerEntry(params: {
  memberId: string;
  type: 'deposit' | 'refund' | 'adjustment';
  amountInPoisha: number;
  description: string;
  paymentMethod?: string;
  adminUid: string;
  settings: MessSettings;
}): Promise<void> {
  const { memberId, type, amountInPoisha, description, paymentMethod, adminUid, settings } = params;
  const safeAmount = Math.trunc(amountInPoisha);
  if (safeAmount === 0) throw new Error('Amount cannot be zero.');

  const txId = makeDocId(`direct_${type}`);
  const txRef = doc(db, 'transactions', txId);
  const walletRef = doc(db, 'wallets', memberId);

  try {
    await runTransaction(db, async (tx) => {
      const walletSnap = await tx.get(walletRef);
      const walletData: Wallet = walletSnap.exists()
        ? (walletSnap.data() as Wallet)
        : {
            memberId,
            openingBalanceInPoisha: 0,
            currentBalanceInPoisha: 0,
            totalDepositsInPoisha: 0,
            totalMealCostsInPoisha: 0,
            totalExpensesInPoisha: 0,
            totalRefundsInPoisha: 0,
            lastAlertLevel: 'none',
            updatedAt: Timestamp.now(),
          };

      let newBalance = walletData.currentBalanceInPoisha;
      let totalDeposits = walletData.totalDepositsInPoisha;
      let totalRefunds = walletData.totalRefundsInPoisha;

      if (type === 'deposit') {
        if (safeAmount < 0) throw new Error('Deposit must be positive.');
        newBalance += safeAmount;
        totalDeposits += safeAmount;
      } else if (type === 'refund') {
        if (safeAmount < 0) throw new Error('Refund must be positive.');
        newBalance += safeAmount;
        totalRefunds += safeAmount;
      } else {
        newBalance += safeAmount;
      }

      const nextAlert = maybeQueueBalanceAlert(tx, memberId, newBalance, walletData.lastAlertLevel, settings);

      tx.set(txRef, {
        memberId,
        type,
        amountInPoisha: safeAmount,
        description: description.trim().slice(0, 300),
        ...(paymentMethod ? { paymentMethod: paymentMethod.slice(0, 64) } : {}),
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        status: 'completed',
      });

      tx.set(
        walletRef,
        buildNextWalletPayload({
          memberId,
          prevWallet: walletSnap.exists() ? walletData : null,
          openingBalanceInPoisha: walletData.openingBalanceInPoisha,
          currentBalanceInPoisha: newBalance,
          totalDepositsInPoisha: totalDeposits,
          totalMealCostsInPoisha: walletData.totalMealCostsInPoisha,
          totalExpensesInPoisha: walletData.totalExpensesInPoisha,
          totalRefundsInPoisha: totalRefunds,
          lastAlertLevel: nextAlert,
        })
      );

      tx.set(doc(db, 'notifications', makeDocId('notif')), {
        recipientUid: memberId,
        title: type === 'deposit' ? 'সরাসরি জমা / Deposit Added' : 'ওয়ালেট আপডেট / Wallet Updated',
        message: `${description.trim()} (${formatPoisha(safeAmount, 'bn')})। নতুন ব্যালেন্স: ${formatPoisha(newBalance, 'bn')}`.slice(0, 500),
        category: type,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: `DIRECT_${type.toUpperCase()}`,
        targetType: 'transactions',
        targetId: txId,
        timestamp: serverTimestamp(),
        newValue: { memberId, type, amountInPoisha: safeAmount },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function reverseTransaction(
  originalTx: TransactionRecord,
  adminUid: string,
  reason: string,
  settings: MessSettings
): Promise<void> {
  if (!originalTx.id) throw new Error('Missing transaction ID.');
  if (originalTx.status === 'reversed') throw new Error('Transaction is already reversed.');

  const origRef = doc(db, 'transactions', originalTx.id);
  const revId = `rev_${originalTx.id}`;
  const revRef = doc(db, 'transactions', revId);
  const walletRef = doc(db, 'wallets', originalTx.memberId);

  try {
    await runTransaction(db, async (tx) => {
      const origSnap = await tx.get(origRef);
      if (!origSnap.exists() || origSnap.data().status !== 'completed') return;

      const revSnap = await tx.get(revRef);
      if (revSnap.exists()) return; // Idempotency guard

      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists()) throw new Error('Member wallet not found.');
      const walletData = walletSnap.data() as Wallet;

      let delta = 0;
      let revType: 'refund' | 'adjustment' = 'adjustment';
      let totalRefunds = walletData.totalRefundsInPoisha;

      if (originalTx.type === 'meal_charge' || originalTx.type === 'expense') {
        delta = originalTx.amountInPoisha; // credit back
        revType = 'refund';
        totalRefunds += originalTx.amountInPoisha;
      } else if (originalTx.type === 'deposit' || originalTx.type === 'refund') {
        delta = -originalTx.amountInPoisha; // debit back
        revType = 'adjustment';
      } else {
        delta = -originalTx.amountInPoisha;
        revType = 'adjustment';
      }

      const newBalance = walletData.currentBalanceInPoisha + delta;
      const nextAlert = maybeQueueBalanceAlert(tx, originalTx.memberId, newBalance, walletData.lastAlertLevel, settings);

      tx.update(origRef, { status: 'reversed' });

      tx.set(revRef, {
        memberId: originalTx.memberId,
        type: revType,
        amountInPoisha: delta,
        description: `Reversal of ${originalTx.id}: ${reason.trim().slice(0, 180)}`,
        referenceId: originalTx.id,
        reversalOf: originalTx.id,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        status: 'completed',
      });

      tx.set(
        walletRef,
        buildNextWalletPayload({
          memberId: originalTx.memberId,
          prevWallet: walletData,
          openingBalanceInPoisha: walletData.openingBalanceInPoisha,
          currentBalanceInPoisha: newBalance,
          totalDepositsInPoisha: walletData.totalDepositsInPoisha,
          totalMealCostsInPoisha: walletData.totalMealCostsInPoisha,
          totalExpensesInPoisha: walletData.totalExpensesInPoisha,
          totalRefundsInPoisha: totalRefunds,
          lastAlertLevel: nextAlert,
        })
      );

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'TRANSACTION_REVERSED',
        targetType: 'transactions',
        targetId: originalTx.id,
        timestamp: serverTimestamp(),
        previousValue: { status: 'completed', amountInPoisha: originalTx.amountInPoisha },
        newValue: { status: 'reversed', reversalId: revId, delta },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${originalTx.id}`);
  }
}

export async function recordExpense(params: {
  category: ExpenseCategory;
  amountInPoisha: number;
  description: string;
  expenseDate: string;
  allocationType: AllocationType;
  targetMemberIds: string[];
  receiptImage?: string;
  adminUid: string;
  settings: MessSettings;
}): Promise<void> {
  const {
    category,
    amountInPoisha,
    description,
    expenseDate,
    allocationType,
    targetMemberIds,
    receiptImage,
    adminUid,
    settings,
  } = params;

  const safeTotal = Math.trunc(amountInPoisha);
  if (safeTotal <= 0) throw new Error('Expense amount must be positive.');

  const allocatedIds = allocationType === 'general' ? [] : Array.from(new Set(targetMemberIds));
  if (allocationType !== 'general' && allocatedIds.length === 0) {
    throw new Error('Select at least one active member for allocated expenses.');
  }

  const expenseId = makeDocId('exp');
  const expenseRef = doc(db, 'expenses', expenseId);
  const shares = allocatePoishaExactly(safeTotal, allocatedIds.length);

  try {
    await runTransaction(db, async (tx) => {
      const walletSnaps = await Promise.all(
        allocatedIds.map((uid) => tx.get(doc(db, 'wallets', uid)))
      );

      const expensePayload: Record<string, unknown> = {
        category,
        amountInPoisha: safeTotal,
        description: description.trim().slice(0, 300),
        expenseDate,
        allocationType,
        allocatedMemberIds: allocatedIds,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
      };
      if (receiptImage?.trim()) {
        expensePayload.receiptImage = receiptImage.trim().slice(0, 500);
      }

      tx.set(expenseRef, expensePayload);

      allocatedIds.forEach((memberId, index) => {
        const share = shares[index];
        if (share <= 0) return;

        const walletSnap = walletSnaps[index];
        const walletData: Wallet = walletSnap.exists()
          ? (walletSnap.data() as Wallet)
          : {
              memberId,
              openingBalanceInPoisha: 0,
              currentBalanceInPoisha: 0,
              totalDepositsInPoisha: 0,
              totalMealCostsInPoisha: 0,
              totalExpensesInPoisha: 0,
              totalRefundsInPoisha: 0,
              lastAlertLevel: 'none',
              updatedAt: Timestamp.now(),
            };

        const newBalance = walletData.currentBalanceInPoisha - share;
        const nextAlert = maybeQueueBalanceAlert(tx, memberId, newBalance, walletData.lastAlertLevel, settings);

        tx.set(doc(db, 'transactions', `expense_${expenseId}_${memberId}`), {
          memberId,
          type: 'expense',
          amountInPoisha: share,
          description: `${category}: ${description.trim().slice(0, 180)}`,
          referenceId: expenseId,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
          status: 'completed',
        });

        tx.set(
          doc(db, 'wallets', memberId),
          buildNextWalletPayload({
            memberId,
            prevWallet: walletSnap.exists() ? walletData : null,
            openingBalanceInPoisha: walletData.openingBalanceInPoisha,
            currentBalanceInPoisha: newBalance,
            totalDepositsInPoisha: walletData.totalDepositsInPoisha,
            totalMealCostsInPoisha: walletData.totalMealCostsInPoisha,
            totalExpensesInPoisha: walletData.totalExpensesInPoisha + share,
            totalRefundsInPoisha: walletData.totalRefundsInPoisha,
            lastAlertLevel: nextAlert,
          })
        );
      });

      tx.set(doc(db, 'auditLogs', makeDocId('audit')), {
        actorUid: adminUid,
        action: 'EXPENSE_RECORDED',
        targetType: 'expenses',
        targetId: expenseId,
        timestamp: serverTimestamp(),
        newValue: { category, amountInPoisha: safeTotal, allocationType, memberCount: allocatedIds.length },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `expenses/${expenseId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const batch = writeBatch(db);
  for (const id of notificationIds) {
    batch.update(doc(db, 'notifications', id), { isRead: true });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function publishNotice(params: {
  title: string;
  description: string;
  targetType: 'all' | 'selected';
  targetMemberIds: string[];
  recipientUidsToNotify: string[];
  adminUid: string;
}): Promise<void> {
  const { title, description, targetType, targetMemberIds, recipientUidsToNotify, adminUid } = params;
  const noticeId = makeDocId('notice');
  const batch = writeBatch(db);

  batch.set(doc(db, 'notices', noticeId), {
    title: title.trim().slice(0, 160),
    description: description.trim().slice(0, 2000),
    targetType,
    targetMemberIds: targetType === 'all' ? [] : targetMemberIds,
    published: true,
    createdAt: serverTimestamp(),
    createdBy: adminUid,
  });

  for (const uid of recipientUidsToNotify) {
    batch.set(doc(db, 'notifications', makeDocId('notif')), {
      recipientUid: uid,
      title: `ঘোষণা / Notice: ${title.trim().slice(0, 100)}`,
      message: description.trim().slice(0, 300),
      category: 'announcement',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'auditLogs', makeDocId('audit')), {
    actorUid: adminUid,
    action: 'NOTICE_PUBLISHED',
    targetType: 'notices',
    targetId: noticeId,
    timestamp: serverTimestamp(),
    newValue: { title, targetType },
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `notices/${noticeId}`);
  }
}

export async function updateAdminIntegrationSettings(
  settings: Omit<AdminSettings, 'updatedAt'>,
  adminUid: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    whatsappEnabled: settings.whatsappEnabled,
    whatsappConsentRequired: settings.whatsappConsentRequired,
    fcmEnabled: settings.fcmEnabled,
    updatedAt: serverTimestamp(),
  };
  if (settings.whatsappPhoneNumberId?.trim()) {
    payload.whatsappPhoneNumberId = settings.whatsappPhoneNumberId.trim().slice(0, 128);
  }
  if (settings.whatsappBusinessAccountId?.trim()) {
    payload.whatsappBusinessAccountId = settings.whatsappBusinessAccountId.trim().slice(0, 128);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'adminSettings', 'integrations'), payload);
  batch.set(doc(db, 'auditLogs', makeDocId('audit')), {
    actorUid: adminUid,
    action: 'INTEGRATION_SETTINGS_UPDATED',
    targetType: 'adminSettings',
    targetId: 'integrations',
    timestamp: serverTimestamp(),
    newValue: { whatsappEnabled: settings.whatsappEnabled, fcmEnabled: settings.fcmEnabled },
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'adminSettings/integrations');
  }
}

export async function archiveMonthlyReportSnapshot(params: {
  month: number;
  year: number;
  members: UserProfile[];
  mealEntries: MealEntry[];
  transactions: TransactionRecord[];
  wallets: Record<string, Wallet>;
  adminUid: string;
}): Promise<number> {
  const { month, year, members, mealEntries, transactions, wallets, adminUid } = params;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const batch = writeBatch(db);
  let count = 0;

  for (const member of members) {
    if (member.role === 'admin' && member.status !== 'active') continue;
    const mMeals = mealEntries.filter(
      (m) => m.memberId === member.uid && m.status === 'approved' && m.mealDate.startsWith(monthPrefix)
    );
    const totalBreakfast = mMeals.filter((m) => m.mealType === 'breakfast').reduce((s, m) => s + m.quantity, 0);
    const totalLunch = mMeals.filter((m) => m.mealType === 'lunch').reduce((s, m) => s + m.quantity, 0);
    const totalDinner = mMeals.filter((m) => m.mealType === 'dinner').reduce((s, m) => s + m.quantity, 0);
    const totalMealCostInPoisha = mMeals.reduce((s, m) => s + m.totalAmountInPoisha, 0);

    const mTx = transactions.filter((t) => {
      if (t.memberId !== member.uid || t.status !== 'completed' || !t.createdAt) return false;
      const d = t.createdAt.toDate();
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });

    const totalDepositsInPoisha = mTx
      .filter((t) => t.type === 'deposit')
      .reduce((s, t) => s + t.amountInPoisha, 0);
    const totalExpensesInPoisha = mTx
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amountInPoisha, 0);

    const wallet = wallets[member.uid];
    const closingBalanceInPoisha = wallet?.currentBalanceInPoisha ?? 0;
    const openingBalanceInPoisha = wallet?.openingBalanceInPoisha ?? 0;

    const reportId = `${year}_${String(month).padStart(2, '0')}_${cleanIdPart(member.uid)}`;
    batch.set(doc(db, 'monthlyReports', reportId), {
      memberId: member.uid,
      month,
      year,
      totalBreakfast,
      totalLunch,
      totalDinner,
      totalMealCostInPoisha,
      totalDepositsInPoisha,
      totalExpensesInPoisha,
      openingBalanceInPoisha,
      closingBalanceInPoisha,
      generatedAt: serverTimestamp(),
    });
    count++;
  }

  batch.set(doc(db, 'auditLogs', makeDocId('audit')), {
    actorUid: adminUid,
    action: 'MONTHLY_REPORT_ARCHIVED',
    targetType: 'monthlyReports',
    targetId: `${year}_${month}`,
    timestamp: serverTimestamp(),
    newValue: { month, year, memberCount: count },
  });

  try {
    await batch.commit();
    return count;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'monthlyReports');
  }
}
