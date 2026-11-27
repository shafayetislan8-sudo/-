/**
 * Free WhatsApp Click-to-Chat (wa.me) helper for Bangladesh (+880) numbers.
 * Does not require any paid API, WhatsApp Business API, or Access Token.
 */

export function formatBangladeshPhoneForWhatsApp(rawPhone?: string): {
  waDigits: string;
  displayPhone: string;
  isValid: boolean;
} {
  if (!rawPhone) {
    return { waDigits: '', displayPhone: '', isValid: false };
  }

  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) {
    return { waDigits: '', displayPhone: '', isValid: false };
  }

  let normalized = digits;
  if (/^01\d{9}$/.test(digits)) {
    normalized = `88${digits}`;
  } else if (/^1\d{9}$/.test(digits)) {
    normalized = `880${digits}`;
  } else if (/^8801\d{9}$/.test(digits)) {
    normalized = digits;
  } else if (/^008801\d{9}$/.test(digits)) {
    normalized = digits.slice(2);
  }

  const isValidBd = /^8801[3-9]\d{8}$/.test(normalized);
  const isGeneralValid = !isValidBd && /^[1-9]\d{8,14}$/.test(normalized);

  if (!isValidBd && !isGeneralValid) {
    return { waDigits: '', displayPhone: rawPhone.trim(), isValid: false };
  }

  return {
    waDigits: normalized,
    displayPhone: `+${normalized}`,
    isValid: true,
  };
}

export function buildBalanceFinishedWhatsAppMessage(customerName: string): string {
  const safeName = customerName.trim() || 'গ্রাহক';
  return `প্রিয় ${safeName},\nআপনার অ্যাকাউন্টের ব্যালেন্স শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় ব্যালেন্স রিচার্জ করুন।\nধন্যবাদ।`;
}

export function buildWhatsAppClickToChatUrl(
  rawPhone: string | undefined,
  customerName: string
): string | null {
  const { waDigits, isValid } = formatBangladeshPhoneForWhatsApp(rawPhone);
  if (!isValid || !waDigits) return null;
  const message = buildBalanceFinishedWhatsAppMessage(customerName);
  return `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}`;
}
