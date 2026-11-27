import { Timestamp } from 'firebase/firestore';
import type { TransactionRecord, UserProfile, Wallet } from '../types/mess';
import { buildWhatsAppClickToChatUrl, formatBangladeshPhoneForWhatsApp } from './whatsapp';

export interface BalanceFinishedCustomer {
  uid: string;
  customerName: string;
  email?: string;
  rawPhone?: string;
  formattedPhone: string;
  hasValidPhone: boolean;
  previousBalanceInPoisha: number;
  currentBalanceInPoisha: number;
  balanceFinishedAtMs: number;
  balanceFinishedDateLabel: string;
  whatsappUrl: string | null;
  memberStatus: UserProfile['status'];
}

function formatDhakaDateTime(ms: number, lang: 'bn' | 'en'): string {
  if (!ms) return lang === 'bn' ? 'অনির্ধারিত' : 'N/A';
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

function inferPreviousBalanceFromTransactions(
  uid: string,
  currentBalanceInPoisha: number,
  transactions: TransactionRecord[]
): { prevBalance: number; finishedAtMs?: number } | null {
  const memberTxs = transactions
    .filter((tx) => tx.memberId === uid && tx.status === 'completed')
    .sort((a, b) => {
      const ams = a.createdAt?.toMillis?.() ?? 0;
      const bms = b.createdAt?.toMillis?.() ?? 0;
      return bms - ams;
    });

  for (const tx of memberTxs) {
    let signedDelta = 0;
    if (tx.type === 'meal_charge' || tx.type === 'expense') {
      signedDelta = -Math.abs(tx.amountInPoisha);
    } else if (tx.type === 'deposit' || tx.type === 'refund') {
      signedDelta = Math.abs(tx.amountInPoisha);
    } else {
      signedDelta = tx.amountInPoisha;
    }

    // Reversing signedDelta walks backward from currentBalance
    if (signedDelta < 0) {
      return {
        prevBalance: currentBalanceInPoisha - signedDelta,
        finishedAtMs: tx.createdAt?.toMillis?.() ?? undefined,
      };
    }
  }
  return null;
}

/**
 * Automatically monitors every member/customer wallet and builds a deduplicated list
 * of all customers whose current balance is <= 0.
 * - Automatically removes a customer as soon as currentBalanceInPoisha > 0.
 * - Never duplicates the same uid.
 */
export function deriveBalanceFinishedCustomers(
  members: UserProfile[],
  wallets: Record<string, Wallet>,
  transactions: TransactionRecord[],
  lang: 'bn' | 'en'
): BalanceFinishedCustomer[] {
  const seenUids = new Set<string>();
  const results: BalanceFinishedCustomer[] = [];

  for (const member of members) {
    if (!member.uid || seenUids.has(member.uid)) continue;
    if (member.status === 'removed' || member.status === 'pending') continue;
    if (member.role === 'admin' && !wallets[member.uid]) continue;

    const wallet = wallets[member.uid];
    // For active/suspended customer members: if wallet exists use its balance;
    // if an active member somehow has no wallet yet, treat as 0 balance so they aren't missed.
    if (!wallet && member.role === 'admin') continue;
    if (!wallet && member.status !== 'active') continue;

    const currentBalanceInPoisha = wallet ? Math.trunc(wallet.currentBalanceInPoisha) : 0;
    if (currentBalanceInPoisha > 0) {
      // Balance > 0: automatically excluded from Balance Finished list
      continue;
    }

    seenUids.add(member.uid);

    let previousBalanceInPoisha: number;
    let finishedAtMs =
      wallet?.balanceFinishedAt?.toMillis?.() ??
      wallet?.updatedAt?.toMillis?.() ??
      member.updatedAt?.toMillis?.() ??
      member.createdAt?.toMillis?.() ??
      0;

    if (typeof wallet?.previousBalanceInPoisha === 'number') {
      previousBalanceInPoisha = Math.trunc(wallet.previousBalanceInPoisha);
    } else {
      const inferred = inferPreviousBalanceFromTransactions(
        member.uid,
        currentBalanceInPoisha,
        transactions
      );
      if (inferred) {
        previousBalanceInPoisha = inferred.prevBalance;
        if (!wallet?.balanceFinishedAt && inferred.finishedAtMs) {
          finishedAtMs = inferred.finishedAtMs;
        }
      } else {
        previousBalanceInPoisha = wallet ? Math.trunc(wallet.openingBalanceInPoisha) : 0;
      }
    }

    const phoneInfo = formatBangladeshPhoneForWhatsApp(member.phoneNumber);
    const whatsappUrl = buildWhatsAppClickToChatUrl(member.phoneNumber, member.fullName);

    results.push({
      uid: member.uid,
      customerName: member.fullName,
      email: member.email,
      rawPhone: member.phoneNumber,
      formattedPhone: phoneInfo.isValid
        ? phoneInfo.displayPhone
        : member.phoneNumber?.trim() || (lang === 'bn' ? 'নম্বর নেই' : 'No Phone'),
      hasValidPhone: phoneInfo.isValid && Boolean(whatsappUrl),
      previousBalanceInPoisha,
      currentBalanceInPoisha,
      balanceFinishedAtMs: finishedAtMs,
      balanceFinishedDateLabel: formatDhakaDateTime(finishedAtMs, lang),
      whatsappUrl,
      memberStatus: member.status,
    });
  }

  // Sort most recently finished first, then alphabetically
  results.sort((a, b) => {
    if (b.balanceFinishedAtMs !== a.balanceFinishedAtMs) {
      return b.balanceFinishedAtMs - a.balanceFinishedAtMs;
    }
    return a.customerName.localeCompare(b.customerName);
  });

  return results;
}

export function isTimestampLike(val: unknown): val is Timestamp {
  return Boolean(val && typeof (val as Timestamp).toMillis === 'function');
}
