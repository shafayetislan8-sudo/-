import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { TransactionRecord, UserProfile, Wallet } from '../types/mess';
import { deriveBalanceFinishedCustomers } from './balanceExpiry';
import {
  buildBalanceFinishedWhatsAppMessage,
  buildWhatsAppClickToChatUrl,
  formatBangladeshPhoneForWhatsApp,
} from './whatsapp';

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

// 1. Bangladesh phone normalization (+880)
assert.deepEqual(formatBangladeshPhoneForWhatsApp('01712345678'), {
  waDigits: '8801712345678',
  displayPhone: '+8801712345678',
  isValid: true,
});
assert.deepEqual(formatBangladeshPhoneForWhatsApp('+880 1812-345678'), {
  waDigits: '8801812345678',
  displayPhone: '+8801812345678',
  isValid: true,
});
assert.deepEqual(formatBangladeshPhoneForWhatsApp('008801912345678'), {
  waDigits: '8801912345678',
  displayPhone: '+8801912345678',
  isValid: true,
});
assert.equal(formatBangladeshPhoneForWhatsApp('123').isValid, false);

// 2. Exact Bengali WhatsApp message template + wa.me Click-to-Chat URL
const expectedMsg =
  'প্রিয় রহিম আহমেদ,\nআপনার অ্যাকাউন্টের ব্যালেন্স শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় ব্যালেন্স রিচার্জ করুন।\nধন্যবাদ।';
assert.equal(buildBalanceFinishedWhatsAppMessage('রহিম আহমেদ'), expectedMsg);

const waUrl = buildWhatsAppClickToChatUrl('01712345678', 'রহিম আহমেদ');
assert.ok(waUrl?.startsWith('https://wa.me/8801712345678?text='));
assert.equal(decodeURIComponent(waUrl!.split('?text=')[1]), expectedMsg);

// 3. Automatic zero/negative balance detection, deduplication, and recharge removal
const members: UserProfile[] = [
  {
    uid: 'u1',
    fullName: 'রহিম আহমেদ',
    phoneNumber: '01712345678',
    role: 'member',
    status: 'active',
    joiningDate: '2026-01-01',
    createdAt: ts('2026-01-01T00:00:00Z'),
    updatedAt: ts('2026-01-10T00:00:00Z'),
  },
  // Intentional duplicate UID in input array to test deduplication
  {
    uid: 'u1',
    fullName: 'রহিম আহমেদ',
    phoneNumber: '01712345678',
    role: 'member',
    status: 'active',
    joiningDate: '2026-01-01',
    createdAt: ts('2026-01-01T00:00:00Z'),
    updatedAt: ts('2026-01-10T00:00:00Z'),
  },
  {
    uid: 'u2',
    fullName: 'করিম হাসান',
    phoneNumber: '+8801811223344',
    role: 'member',
    status: 'active',
    joiningDate: '2026-01-01',
    createdAt: ts('2026-01-01T00:00:00Z'),
    updatedAt: ts('2026-01-11T00:00:00Z'),
  },
  {
    uid: 'u3',
    fullName: 'সালমা খাতুন',
    phoneNumber: '01911223344',
    role: 'member',
    status: 'active',
    joiningDate: '2026-01-01',
    createdAt: ts('2026-01-01T00:00:00Z'),
    updatedAt: ts('2026-01-12T00:00:00Z'),
  },
];

const wallets: Record<string, Wallet> = {
  u1: {
    memberId: 'u1',
    openingBalanceInPoisha: 50000,
    currentBalanceInPoisha: -2500,
    previousBalanceInPoisha: 3500,
    totalDepositsInPoisha: 50000,
    totalMealCostsInPoisha: 52500,
    totalExpensesInPoisha: 0,
    totalRefundsInPoisha: 0,
    balanceFinishedAt: ts('2026-02-01T10:00:00Z'),
    updatedAt: ts('2026-02-01T10:00:00Z'),
  },
  u2: {
    memberId: 'u2',
    openingBalanceInPoisha: 10000,
    currentBalanceInPoisha: 0,
    totalDepositsInPoisha: 0,
    totalMealCostsInPoisha: 10000,
    totalExpensesInPoisha: 0,
    totalRefundsInPoisha: 0,
    updatedAt: ts('2026-02-02T12:00:00Z'),
  },
  u3: {
    memberId: 'u3',
    openingBalanceInPoisha: 50000,
    currentBalanceInPoisha: 12000, // positive -> must NOT appear
    previousBalanceInPoisha: -1000,
    totalDepositsInPoisha: 60000,
    totalMealCostsInPoisha: 48000,
    totalExpensesInPoisha: 0,
    totalRefundsInPoisha: 0,
    updatedAt: ts('2026-02-02T13:00:00Z'),
  },
};

const transactions: TransactionRecord[] = [
  {
    id: 't1',
    memberId: 'u2',
    type: 'meal_charge',
    amountInPoisha: 3000,
    description: 'LUNCH x1',
    createdBy: 'admin',
    createdAt: ts('2026-02-02T12:00:00Z'),
    status: 'completed',
  },
];

const finished = deriveBalanceFinishedCustomers(members, wallets, transactions, 'bn');
assert.equal(finished.length, 2, 'Should contain u1 and u2 only, deduplicated');
assert.equal(finished[0].uid, 'u2', 'Most recently finished u2 comes first');
assert.equal(finished[0].previousBalanceInPoisha, 3000, 'Falls back cleanly to transaction inference when previousBalanceInPoisha missing');
assert.equal(finished[1].uid, 'u1');
assert.equal(finished[1].previousBalanceInPoisha, 3500);
assert.equal(finished[1].formattedPhone, '+8801712345678');

// Simulate recharge of u1 above 0 -> automatically removed
const rechargedWallets: Record<string, Wallet> = {
  ...wallets,
  u1: {
    ...wallets.u1,
    previousBalanceInPoisha: -2500,
    currentBalanceInPoisha: 47500,
  },
};
const afterRecharge = deriveBalanceFinishedCustomers(members, rechargedWallets, transactions, 'bn');
assert.equal(afterRecharge.length, 1, 'Recharged customer must be automatically removed');
assert.equal(afterRecharge[0].uid, 'u2');

console.log('All balanceExpiry and WhatsApp Click-to-Chat tests passed!');
