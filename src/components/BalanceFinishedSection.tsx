import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  MessageCircle,
  PhoneOff,
  Search,
  Wallet as WalletIcon,
} from 'lucide-react';
import type { BalanceFinishedCustomer } from '../utils/balanceExpiry';
import type { Language } from '../utils/i18n';
import { t } from '../utils/i18n';
import { formatPoisha } from '../utils/money';

type BalanceFilter = 'all' | 'negative' | 'zero' | 'withPhone' | 'noPhone';

interface BalanceFinishedSectionProps {
  customers: BalanceFinishedCustomer[];
  lang: Language;
  onQuickRecharge?: (memberUid: string) => void;
}

export function BalanceFinishedSection({
  customers,
  lang,
  onQuickRecharge,
}: BalanceFinishedSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<BalanceFilter>('all');

  const counts = useMemo(() => {
    let negative = 0;
    let zero = 0;
    let withPhone = 0;
    let noPhone = 0;
    for (const c of customers) {
      if (c.currentBalanceInPoisha < 0) negative++;
      else zero++;
      if (c.hasValidPhone) withPhone++;
      else noPhone++;
    }
    return {
      all: customers.length,
      negative,
      zero,
      withPhone,
      noPhone,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === 'negative' && c.currentBalanceInPoisha >= 0) return false;
      if (filter === 'zero' && c.currentBalanceInPoisha !== 0) return false;
      if (filter === 'withPhone' && !c.hasValidPhone) return false;
      if (filter === 'noPhone' && c.hasValidPhone) return false;

      if (!q) return true;
      return (
        c.customerName.toLowerCase().includes(q) ||
        c.formattedPhone.toLowerCase().includes(q) ||
        (c.rawPhone || '').toLowerCase().includes(q)
      );
    });
  }, [customers, searchQuery, filter]);

  const filterChips: { id: BalanceFilter; label: string; count: number }[] = [
    { id: 'all', label: lang === 'bn' ? 'সবগুলো' : 'All', count: counts.all },
    { id: 'negative', label: lang === 'bn' ? 'বকেয়া (< ৳0)' : 'Due (< ৳0)', count: counts.negative },
    { id: 'zero', label: lang === 'bn' ? 'শূন্য (৳0)' : 'Zero (৳0)', count: counts.zero },
    { id: 'withPhone', label: lang === 'bn' ? 'মোবাইল আছে' : 'Has Phone', count: counts.withPhone },
    { id: 'noPhone', label: lang === 'bn' ? 'নম্বর নেই' : 'No Phone', count: counts.noPhone },
  ];

  return (
    <div className="space-y-4">
      {/* Header & Summary Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              {t(lang, 'balanceFinishedFullTitle')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lang === 'bn'
              ? 'ব্যালেন্স ৳0 বা তার কম হলে মেম্বার স্বয়ংক্রিয়ভাবে এখানে যুক্ত হবেন এবং রিচার্জ করলে (৳0-এর বেশি) তালিকা থেকে সরে যাবেন। WhatsApp বাটনে ক্লিক করলে মেসেজ লেখা অবস্থায় চ্যাট খুলবে।'
              : 'Members with balance <= ৳0 appear here automatically and are removed once recharged above ৳0. WhatsApp button opens a pre-filled chat (free Click-to-Chat, no API token needed).'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-4 py-2.5">
          <div>
            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
              {lang === 'bn' ? 'টাকা শেষ মেম্বার' : 'Finished Count'}
            </p>
            <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {customers.length}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === 'bn'
                ? 'কাস্টমারের নাম বা মোবাইল নম্বর দিয়ে খুঁজুন...'
                : 'Search by customer name or mobile number...'
            }
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{chip.label}</span>
                <span className="tabular-nums opacity-80">({chip.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Table & Mobile Card List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-1.5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {customers.length === 0
                ? lang === 'bn'
                  ? 'এই মুহূর্তে কারও ব্যালেন্স শেষ হয়নি।'
                  : 'No customers currently have zero or negative balance.'
                : t(lang, 'noData')}
            </p>
            <p className="text-xs text-slate-500">
              {lang === 'bn'
                ? 'সকল সক্রিয় কাস্টমারের ব্যালেন্স শূন্যের উপরে রয়েছে অথবা ফিল্টারের সাথে মিলছে না।'
                : 'All active customers have positive balance or do not match the selected filter.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                    <th className="py-3.5 px-4">{t(lang, 'fullName')}</th>
                    <th className="py-3.5 px-3">{lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}</th>
                    <th className="py-3.5 px-3 text-right">{t(lang, 'previousBalance')}</th>
                    <th className="py-3.5 px-3 text-right">{t(lang, 'currentBalance')}</th>
                    <th className="py-3.5 px-3">{t(lang, 'balanceFinishedDate')}</th>
                    <th className="py-3.5 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {filteredCustomers.map((c) => (
                    <tr key={c.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{c.customerName}</p>
                        {c.email && <p className="text-xs text-slate-500 truncate max-w-[200px]">{c.email}</p>}
                      </td>
                      <td className="py-3.5 px-3 tabular-nums text-slate-700 dark:text-slate-300">
                        {c.formattedPhone}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatPoisha(c.previousBalanceInPoisha, lang)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                        {formatPoisha(c.currentBalanceInPoisha, lang)}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {c.balanceFinishedDateLabel}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {onQuickRecharge && (
                            <button
                              type="button"
                              onClick={() => onQuickRecharge(c.uid)}
                              className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                            >
                              <WalletIcon className="w-3.5 h-3.5" />
                              <span>{lang === 'bn' ? 'রিচার্জ' : 'Recharge'}</span>
                            </button>
                          )}
                          {c.whatsappUrl ? (
                            <a
                              href={c.whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] px-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                            >
                              <MessageCircle className="w-4 h-4 shrink-0" />
                              <span>{t(lang, 'sendWhatsAppReminder')}</span>
                            </a>
                          ) : (
                            <span
                              title={
                                lang === 'bn'
                                  ? 'সঠিক বাংলাদেশী মোবাইল নম্বর (+880) যুক্ত নেই'
                                  : 'No valid Bangladesh (+880) phone number'
                              }
                              className="min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs inline-flex items-center gap-1.5 cursor-not-allowed"
                            >
                              <PhoneOff className="w-3.5 h-3.5" />
                              <span>{lang === 'bn' ? 'নম্বর নেই' : 'No Phone'}</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.map((c) => (
                <div key={c.uid} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {c.customerName}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">{c.formattedPhone}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400 shrink-0">
                      {formatPoisha(c.currentBalanceInPoisha, lang)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-[11px] text-slate-500">{t(lang, 'previousBalance')}</p>
                      <p className="font-semibold tabular-nums mt-0.5">
                        {formatPoisha(c.previousBalanceInPoisha, lang)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">{t(lang, 'balanceFinishedDate')}</p>
                      <p className="font-medium tabular-nums mt-0.5">{c.balanceFinishedDateLabel}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.whatsappUrl ? (
                      <a
                        href={c.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>{t(lang, 'sendWhatsAppReminder')}</span>
                      </a>
                    ) : (
                      <span className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs flex items-center justify-center gap-1.5">
                        <PhoneOff className="w-4 h-4" />
                        <span>{lang === 'bn' ? 'সঠিক নম্বর নেই' : 'No Valid Phone'}</span>
                      </span>
                    )}
                    {onQuickRecharge && (
                      <button
                        type="button"
                        onClick={() => onQuickRecharge(c.uid)}
                        className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0"
                      >
                        <WalletIcon className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'রিচার্জ' : 'Recharge'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
