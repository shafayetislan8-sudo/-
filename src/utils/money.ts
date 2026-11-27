import type { AlertLevel } from '../types/mess';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(input: string): string {
  return input.replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/**
 * Parses a decimal BDT string (e.g. "30", "30.5", "30.50") into integer poisha
 * using exact string splitting—never floating-point multiplication.
 */
export function parseBdtToPoisha(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error('Invalid BDT amount format');
  }
  const isNegative = cleaned.startsWith('-');
  const unsigned = isNegative ? cleaned.slice(1) : cleaned;
  const [wholePart, fracPart = ''] = unsigned.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const whole = parseInt(wholePart, 10);
  const frac = parseInt(paddedFrac, 10);
  const total = whole * 100 + frac;
  return isNegative ? -total : total;
}

/**
 * Formats integer poisha into BDT currency string without floating point arithmetic.
 */
export function formatPoisha(poisha: number, lang: 'bn' | 'en' = 'bn', showDecimals = true): string {
  const safeInt = Math.trunc(Number.isFinite(poisha) ? poisha : 0);
  const isNegative = safeInt < 0;
  const abs = Math.abs(safeInt);
  const taka = Math.floor(abs / 100);
  const remPoisha = abs % 100;

  const takaFormatted = taka.toLocaleString('en-US');
  const base = showDecimals
    ? `${takaFormatted}.${String(remPoisha).padStart(2, '0')}`
    : remPoisha === 0
      ? takaFormatted
      : `${takaFormatted}.${String(remPoisha).padStart(2, '0')}`;

  const signed = `${isNegative ? '-' : ''}৳${base}`;
  return lang === 'bn' ? toBengaliDigits(signed) : signed;
}

export function poishaToInputString(poisha: number): string {
  const safeInt = Math.trunc(Number.isFinite(poisha) ? poisha : 0);
  const abs = Math.abs(safeInt);
  const taka = Math.floor(abs / 100);
  const rem = abs % 100;
  const prefix = safeInt < 0 ? '-' : '';
  return rem === 0 ? `${prefix}${taka}` : `${prefix}${taka}.${String(rem).padStart(2, '0')}`;
}

/**
 * Splits totalPoisha across N members using exact integer division + remainder distribution.
 * Sum of returned array is guaranteed to equal totalPoisha.
 */
export function allocatePoishaExactly(totalPoisha: number, memberCount: number): number[] {
  if (memberCount <= 0) return [];
  const safeTotal = Math.trunc(totalPoisha);
  const baseShare = Math.floor(safeTotal / memberCount);
  const remainder = safeTotal % memberCount;
  return Array.from({ length: memberCount }, (_, idx) =>
    idx < remainder ? baseShare + 1 : baseShare
  );
}

export function computeAlertLevel(
  balanceInPoisha: number,
  lowThresholdInPoisha: number,
  criticalThresholdInPoisha: number,
  zeroNotificationEnabled: boolean
): AlertLevel {
  if (balanceInPoisha <= 0 && zeroNotificationEnabled) {
    return 'zero';
  }
  if (balanceInPoisha <= criticalThresholdInPoisha) {
    return 'critical';
  }
  if (balanceInPoisha <= lowThresholdInPoisha) {
    return 'low';
  }
  return 'none';
}

export function getTodayDateDhaka(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
