import { useMemo, useState } from 'react';
import { Archive, Download, FileSpreadsheet, FileText } from 'lucide-react';
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
import { archiveMonthlyReportSnapshot } from '../services/messService';
import { exportMemberSummaryPdf, exportReportToCsv, type MemberReportRow } from '../services/reportExport';
import { t } from '../utils/i18n';
import { formatPoisha, getTodayDateDhaka } from '../utils/money';

type ReportMode = 'daily' | 'weekly' | 'monthly' | 'member' | 'complete';

export function ReportsView() {
  const {
    isAdmin,
    firebaseUser,
    profile,
    members,
    wallets,
    myWallet,
    mealEntries,
    transactions,
    expenses,
    messSettings,
    monthlyReports,
    lang,
    notify,
  } = useApp();

  const today = getTodayDateDhaka();
  const [mode, setMode] = useState<ReportMode>('monthly');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [archiving, setArchiving] = useState(false);

  const weekStart = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, [selectedDate]);

  const filteredMeals = useMemo(() => {
    return mealEntries.filter((m) => {
      if (m.status !== 'approved') return false;
      if (selectedMemberId !== 'all' && m.memberId !== selectedMemberId) return false;
      if (mode === 'daily') return m.mealDate === selectedDate;
      if (mode === 'weekly') return m.mealDate >= weekStart && m.mealDate <= selectedDate;
      if (mode === 'monthly') return m.mealDate.startsWith(selectedMonth);
      return true;
    });
  }, [mealEntries, mode, selectedDate, weekStart, selectedMonth, selectedMemberId]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.status !== 'completed') return false;
      if (selectedMemberId !== 'all' && tx.memberId !== selectedMemberId) return false;
      const dateStr = tx.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || '';
      if (mode === 'daily') return dateStr === selectedDate;
      if (mode === 'weekly') return dateStr >= weekStart && dateStr <= selectedDate;
      if (mode === 'monthly') return dateStr.startsWith(selectedMonth);
      return true;
    });
  }, [transactions, mode, selectedDate, weekStart, selectedMonth, selectedMemberId]);

  const memberSummaryRows: MemberReportRow[] = useMemo(() => {
    const targetUsers = isAdmin
      ? members.filter((u) => (selectedMemberId === 'all' ? u.status !== 'removed' : u.uid === selectedMemberId))
      : profile
        ? [profile]
        : [];

    return targetUsers.map((u) => {
      const uMeals = filteredMeals.filter((m) => m.memberId === u.uid);
      const breakfast = uMeals.filter((m) => m.mealType === 'breakfast').reduce((s, m) => s + m.quantity, 0);
      const lunch = uMeals.filter((m) => m.mealType === 'lunch').reduce((s, m) => s + m.quantity, 0);
      const dinner = uMeals.filter((m) => m.mealType === 'dinner').reduce((s, m) => s + m.quantity, 0);
      const mealCostInPoisha = uMeals.reduce((s, m) => s + m.totalAmountInPoisha, 0);

      const uTx = filteredTransactions.filter((tx) => tx.memberId === u.uid);
      const depositsInPoisha = uTx.filter((tx) => tx.type === 'deposit').reduce((s, tx) => s + tx.amountInPoisha, 0);
      const expensesInPoisha = uTx.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amountInPoisha, 0);

      const wallet = isAdmin ? wallets[u.uid] : myWallet;

      return {
        name: u.fullName,
        breakfast,
        lunch,
        dinner,
        totalMeals: breakfast + lunch + dinner,
        mealCostInPoisha,
        depositsInPoisha,
        expensesInPoisha,
        balanceInPoisha: wallet?.currentBalanceInPoisha ?? 0,
      };
    });
  }, [isAdmin, members, profile, selectedMemberId, filteredMeals, filteredTransactions, wallets, myWallet]);

  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; breakfast: number; lunch: number; dinner: number }> = {};
    for (const m of filteredMeals) {
      if (!byDate[m.mealDate]) {
        byDate[m.mealDate] = { date: m.mealDate.slice(5), breakfast: 0, lunch: 0, dinner: 0 };
      }
      byDate[m.mealDate][m.mealType] += m.quantity;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [filteredMeals]);

  const periodLabel =
    mode === 'daily'
      ? selectedDate
      : mode === 'weekly'
        ? `${weekStart}_to_${selectedDate}`
        : mode === 'monthly'
          ? selectedMonth
          : 'all_time';

  const handleExportCsv = () => {
    exportReportToCsv(
      `mess-report-${periodLabel}`,
      ['Member', 'Breakfast', 'Lunch', 'Dinner', 'Total Meals', 'Meal Cost (BDT)', 'Deposits (BDT)', 'Expenses (BDT)', 'Current Balance (BDT)'],
      memberSummaryRows.map((r) => [
        r.name,
        r.breakfast,
        r.lunch,
        r.dinner,
        r.totalMeals,
        (r.mealCostInPoisha / 100).toFixed(2),
        (r.depositsInPoisha / 100).toFixed(2),
        (r.expensesInPoisha / 100).toFixed(2),
        (r.balanceInPoisha / 100).toFixed(2),
      ])
    );
  };

  const handleExportPdf = () => {
    exportMemberSummaryPdf({
      messName: messSettings?.messName || 'Mess Manager Pro',
      periodLabel,
      rows: memberSummaryRows,
    });
  };

  const handleArchiveMonth = async () => {
    if (!isAdmin || !firebaseUser) return;
    setArchiving(true);
    try {
      const [yStr, mStr] = selectedMonth.split('-');
      const count = await archiveMonthlyReportSnapshot({
        year: Number(yStr),
        month: Number(mStr),
        members: members.filter((m) => m.status !== 'removed'),
        mealEntries,
        transactions,
        wallets,
        adminUid: firebaseUser.uid,
      });
      notify(
        'success',
        lang === 'bn'
          ? `${selectedMonth} মাসের ${count}টি মেম্বার রিপোর্ট স্থায়ীভাবে সংরক্ষিত হয়েছে।`
          : `Archived ${count} member snapshots for ${selectedMonth}.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to archive month');
    } finally {
      setArchiving(false);
    }
  };

  const totalMessExpensePoisha = useMemo(
    () =>
      expenses
        .filter((e) => {
          if (mode === 'daily') return e.expenseDate === selectedDate;
          if (mode === 'weekly') return e.expenseDate >= weekStart && e.expenseDate <= selectedDate;
          if (mode === 'monthly') return e.expenseDate.startsWith(selectedMonth);
          return true;
        })
        .reduce((s, e) => s + e.amountInPoisha, 0),
    [expenses, mode, selectedDate, weekStart, selectedMonth]
  );

  return (
    <div className="space-y-6">
      {/* Controls & Export Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(
              [
                ['daily', lang === 'bn' ? 'দৈনিক' : 'Daily'],
                ['weekly', lang === 'bn' ? 'সাপ্তাহিক' : 'Weekly'],
                ['monthly', lang === 'bn' ? 'মাসিক' : 'Monthly'],
                ['member', lang === 'bn' ? 'মেম্বার' : 'Member-wise'],
                ['complete', lang === 'bn' ? 'সম্পূর্ণ মেস' : 'Complete'],
              ] as [ReportMode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  mode === key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{t(lang, 'exportCsv')}</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="min-h-[40px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
            >
              <FileText className="w-4 h-4" />
              <span>{t(lang, 'exportPdf')}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(mode === 'daily' || mode === 'weekly') && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                {t(lang, 'date')}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          )}

          {mode === 'monthly' && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                {lang === 'bn' ? 'মাস নির্বাচন' : 'Select Month'}
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          )}

          {isAdmin && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                {lang === 'bn' ? 'মেম্বার ফিল্টার' : 'Member Filter'}
              </label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="all">{lang === 'bn' ? 'সকল মেম্বার' : 'All Members'}</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && mode === 'monthly' && (
            <div className="flex items-end">
              <button
                type="button"
                disabled={archiving}
                onClick={handleArchiveMonth}
                className="w-full min-h-[40px] px-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
              >
                <Archive className="w-4 h-4" />
                <span>{archiving ? t(lang, 'loading') : t(lang, 'archiveMonth')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Meal Trend Chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {lang === 'bn' ? 'দৈনিক মিল বিশ্লেষণ' : 'Meal Breakdown Trend'}
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {lang === 'bn' ? 'মোট বাজার/খরচ' : 'Mess Expenses'}: {formatPoisha(totalMessExpensePoisha, lang)}
          </span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noData')}
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="breakfast" name={t(lang, 'breakfast')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lunch" name={t(lang, 'lunch')} fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dinner" name={t(lang, 'dinner')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Summary Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {lang === 'bn' ? 'আর্থিক ও মিল সারসংক্ষেপ' : 'Financial & Meal Summary'}
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">{periodLabel}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">{lang === 'bn' ? 'মেম্বার' : 'Member'}</th>
                <th className="py-3 px-3 text-right">{t(lang, 'breakfast')}</th>
                <th className="py-3 px-3 text-right">{t(lang, 'lunch')}</th>
                <th className="py-3 px-3 text-right">{t(lang, 'dinner')}</th>
                <th className="py-3 px-3 text-right">{lang === 'bn' ? 'মোট মিল' : 'Meals'}</th>
                <th className="py-3 px-3 text-right">{lang === 'bn' ? 'মিল খরচ' : 'Meal Cost'}</th>
                <th className="py-3 px-3 text-right">{t(lang, 'totalDeposits')}</th>
                <th className="py-3 px-3 text-right">{t(lang, 'totalExpenses')}</th>
                <th className="py-3 px-4 text-right">{t(lang, 'currentBalance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
              {memberSummaryRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    {t(lang, 'noData')}
                  </td>
                </tr>
              ) : (
                memberSummaryRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{row.breakfast}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{row.lunch}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{row.dinner}</td>
                    <td className="py-3 px-3 text-right font-semibold tabular-nums">{row.totalMeals}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatPoisha(row.mealCostInPoisha, lang)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatPoisha(row.depositsInPoisha, lang)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatPoisha(row.expensesInPoisha, lang)}</td>
                    <td
                      className={`py-3 px-4 text-right font-semibold tabular-nums ${
                        row.balanceInPoisha < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {formatPoisha(row.balanceInPoisha, lang)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Archived Monthly Snapshots */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {lang === 'bn' ? 'সংরক্ষিত পূর্ববর্তী মাসিক রিপোর্ট' : 'Preserved Monthly Archives'}
          </h3>
          <Download className="w-4 h-4 text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">{lang === 'bn' ? 'মাস/বছর' : 'Period'}</th>
                <th className="py-2.5 px-3 text-right">{t(lang, 'breakfast')}</th>
                <th className="py-2.5 px-3 text-right">{t(lang, 'lunch')}</th>
                <th className="py-2.5 px-3 text-right">{t(lang, 'dinner')}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'bn' ? 'মিল খরচ' : 'Meal Cost'}</th>
                <th className="py-2.5 px-3 text-right">{t(lang, 'totalDeposits')}</th>
                <th className="py-2.5 px-4 text-right">{lang === 'bn' ? 'সমাপনী ব্যালেন্স' : 'Closing Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {monthlyReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {t(lang, 'noData')}
                  </td>
                </tr>
              ) : (
                monthlyReports.map((rep) => (
                  <tr key={rep.id}>
                    <td className="py-2.5 px-4 font-medium tabular-nums">
                      {rep.year}-{String(rep.month).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{rep.totalBreakfast}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{rep.totalLunch}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{rep.totalDinner}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatPoisha(rep.totalMealCostInPoisha, lang)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatPoisha(rep.totalDepositsInPoisha, lang)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                      {formatPoisha(rep.closingBalanceInPoisha, lang)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
