import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPoisha } from '../utils/money';

export interface MemberReportRow {
  name: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  totalMeals: number;
  mealCostInPoisha: number;
  depositsInPoisha: number;
  expensesInPoisha: number;
  balanceInPoisha: number;
}

export function exportReportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  // UTF-8 BOM ensures Excel opens Bengali & English text cleanly
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportMemberSummaryPdf(params: {
  messName: string;
  periodLabel: string;
  rows: MemberReportRow[];
}): void {
  const { messName, periodLabel, rows } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Mess Manager Pro — Financial & Meal Statement', 40, 42);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Mess: ${messName}  |  Period: ${periodLabel}  |  Generated: ${new Date().toISOString().slice(0, 10)}`, 40, 60);

  const tableBody = rows.map((r) => [
    r.name,
    String(r.breakfast),
    String(r.lunch),
    String(r.dinner),
    String(r.totalMeals),
    formatPoisha(r.mealCostInPoisha, 'en'),
    formatPoisha(r.depositsInPoisha, 'en'),
    formatPoisha(r.expensesInPoisha, 'en'),
    formatPoisha(r.balanceInPoisha, 'en'),
  ]);

  autoTable(doc, {
    startY: 78,
    head: [['Member', 'Breakfast', 'Lunch', 'Dinner', 'Total Meals', 'Meal Cost', 'Deposits', 'Expenses', 'Balance']],
    body: tableBody,
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`mess-report-${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
}
