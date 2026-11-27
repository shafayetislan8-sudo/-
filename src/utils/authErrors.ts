import type { Language } from './i18n';

export interface MappedAuthError {
  kind: 'error' | 'providerNotice';
  text: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateEmailPasswordForm(params: {
  mode: 'login' | 'register' | 'forgot';
  email: string;
  password?: string;
  fullName?: string;
  lang: Language;
}): { valid: true } | { valid: false; message: string } {
  const { mode, email, password = '', fullName = '', lang } = params;

  if (mode === 'register' && fullName.trim().length < 2) {
    return {
      valid: false,
      message:
        lang === 'bn'
          ? 'অনুগ্রহ করে কমপক্ষে ২ অক্ষরের পূর্ণ নাম লিখুন।'
          : 'Please enter your full name (at least 2 characters).',
    };
  }

  if (!email.trim()) {
    return {
      valid: false,
      message:
        lang === 'bn'
          ? 'অনুগ্রহ করে আপনার ইমেইল ঠিকানা লিখুন।'
          : 'Please enter your email address.',
    };
  }

  if (!isValidEmailFormat(email)) {
    return {
      valid: false,
      message:
        lang === 'bn'
          ? 'ইমেইল ঠিকানাটি সঠিক নয়। সঠিক ইমেইল লিখুন (যেমন: name@example.com)।'
          : 'Please enter a valid email address (e.g. name@example.com).',
    };
  }

  if (mode !== 'forgot') {
    if (!password) {
      return {
        valid: false,
        message:
          lang === 'bn'
            ? 'অনুগ্রহ করে আপনার পাসওয়ার্ড লিখুন।'
            : 'Please enter your password.',
      };
    }

    if (password.length < 6) {
      return {
        valid: false,
        message:
          lang === 'bn'
            ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
            : 'Password must be at least 6 characters long.',
      };
    }
  }

  return { valid: true };
}

export function mapFirebaseAuthError(
  err: unknown,
  lang: Language,
  currentHostname?: string,
  activeProjectId?: string
): MappedAuthError {
  const code = (err as { code?: string })?.code || '';
  const rawMessage = err instanceof Error ? err.message : String(err);

  if (
    code === 'auth/operation-not-allowed' ||
    rawMessage.includes('PASSWORD_LOGIN_DISABLED') ||
    rawMessage.includes('OPERATION_NOT_ALLOWED')
  ) {
    const projectLabel = activeProjectId ? ` (Project: ${activeProjectId})` : '';
    return {
      kind: 'providerNotice',
      text:
        lang === 'bn'
          ? `বর্তমান সংযুক্ত Firebase প্রজেক্টে${projectLabel} Email/Password (অথবা Phone OTP) প্রোভাইডারটি চালু নেই। সঠিক প্রজেক্টে Sign-in method চালু আছে কিনা নিশ্চিত করুন অথবা Google দিয়ে প্রবেশ করুন।`
          : `Email/Password (or Phone OTP) is disabled in the connected Firebase project${projectLabel}. Verify the Sign-in method for that project or sign in with Google.`,
    };
  }

  if (code === 'auth/unauthorized-domain') {
    const host =
      currentHostname ||
      (typeof window !== 'undefined' ? window.location.hostname : 'this domain');
    const projectLabel = activeProjectId ? ` (Project: ${activeProjectId})` : '';
    return {
      kind: 'error',
      text:
        lang === 'bn'
          ? `এই ডোমেইনটি (${host}) Firebase Authentication-এ${projectLabel} অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized domains-এ ডোমেইনটি যোগ করুন।`
          : `Domain (${host}) is not in Firebase Authorized Domains${projectLabel}. Add it in Firebase Console > Authentication > Settings > Authorized domains.`,
    };
  }

  const localizedMap: Record<string, { bn: string; en: string }> = {
    'auth/email-already-in-use': {
      bn: 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট তৈরি করা হয়েছে। অনুগ্রহ করে লগইন করুন।',
      en: 'This email is already registered. Please sign in instead.',
    },
    'auth/invalid-credential': {
      bn: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে যাচাই করে আবার চেষ্টা করুন।',
      en: 'Invalid email or password. Please check your credentials.',
    },
    'auth/invalid-login-credentials': {
      bn: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে যাচাই করে আবার চেষ্টা করুন।',
      en: 'Invalid email or password. Please check your credentials.',
    },
    'auth/wrong-password': {
      bn: 'পাসওয়ার্ডটি সঠিক নয়। ভুলে গেলে "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করুন।',
      en: 'Incorrect password. Use Forgot Password if needed.',
    },
    'auth/user-not-found': {
      bn: 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। নতুন হলে "নতুন একাউন্ট" থেকে নিবন্ধন করুন।',
      en: 'No account found with this email. Please create an account first.',
    },
    'auth/user-disabled': {
      bn: 'এই অ্যাকাউন্টটি সাময়িকভাবে নিষ্ক্রিয় করা হয়েছে। এডমিনের সাথে যোগাযোগ করুন।',
      en: 'This account has been disabled. Please contact the administrator.',
    },
    'auth/weak-password': {
      bn: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
      en: 'Password must be at least 6 characters long.',
    },
    'auth/invalid-email': {
      bn: 'সঠিক ইমেইল ঠিকানা লিখুন।',
      en: 'Please enter a valid email address.',
    },
    'auth/missing-email': {
      bn: 'অনুগ্রহ করে আপনার ইমেইল ঠিকানা লিখুন।',
      en: 'Please enter your email address.',
    },
    'auth/missing-password': {
      bn: 'অনুগ্রহ করে আপনার পাসওয়ার্ড লিখুন।',
      en: 'Please enter your password.',
    },
    'auth/too-many-requests': {
      bn: 'অনেকবার ভুল চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      en: 'Too many attempts. Please wait a few minutes and try again.',
    },
    'auth/popup-closed-by-user': {
      bn: 'Google লগইন পপ-আপ সম্পূর্ণ হওয়ার আগেই বন্ধ করা হয়েছে। আবার চেষ্টা করুন।',
      en: 'Google sign-in popup was closed before completion.',
    },
    'auth/cancelled-popup-request': {
      bn: 'আগের লগইন পপ-আপটি বাতিল হয়েছে। অনুগ্রহ করে আবার ক্লিক করুন।',
      en: 'Previous sign-in popup request was cancelled. Please try again.',
    },
    'auth/popup-blocked': {
      bn: 'ব্রাউজার পপ-আপ ব্লক করেছে। ব্রাউজারে পপ-আপের অনুমতি (Allow Popups) দিয়ে আবার চেষ্টা করুন।',
      en: 'Popup was blocked by your browser. Please allow popups and retry.',
    },
    'auth/account-exists-with-different-credential': {
      bn: 'এই ইমেইল দিয়ে আগেই অন্য লগইন পদ্ধতিতে অ্যাকাউন্ট তৈরি করা আছে। সেই পদ্ধতি দিয়ে লগইন করুন।',
      en: 'An account already exists with this email using a different sign-in method.',
    },
    'auth/invalid-phone-number': {
      bn: 'সঠিক আন্তর্জাতিক মোবাইল নম্বর লিখুন (যেমন: +8801712345678 বা 01712345678)।',
      en: 'Enter a valid phone number in international format (e.g. +8801712345678).',
    },
    'auth/invalid-verification-code': {
      bn: 'OTP কোডটি সঠিক নয়। আবার যাচাই করুন।',
      en: 'Invalid OTP verification code.',
    },
    'auth/code-expired': {
      bn: 'OTP কোডের মেয়াদ শেষ হয়েছে। নতুন OTP পাঠান।',
      en: 'OTP code expired. Please request a new code.',
    },
    'auth/billing-not-enabled': {
      bn: 'ফোন OTP পাঠাতে Firebase Console-এ Blaze প্ল্যান বা টেস্ট ফোন নম্বর কনফিগার করতে হবে।',
      en: 'Phone SMS requires Firebase Phone Auth billing or configured test phone numbers in Firebase Console.',
    },
    'auth/network-request-failed': {
      bn: 'ইন্টারনেট সংযোগ বিচ্ছিন্ন রয়েছে। নেটওয়ার্ক পরীক্ষা করে আবার চেষ্টা করুন।',
      en: 'Network error. Please check your internet connection.',
    },
    'auth/internal-error': {
      bn: `Firebase Authentication-এ ত্রুটি হয়েছে (${rawMessage})। Authorized domains এবং Sign-in method কনফিগারেশন পরীক্ষা করুন।`,
      en: `Authentication service error (${rawMessage}). Check Firebase Authorized domains and Sign-in method configuration.`,
    },
  };

  const mapped = localizedMap[code];
  if (mapped) {
    return { kind: 'error', text: mapped[lang] };
  }

  return {
    kind: 'error',
    text:
      lang === 'bn'
        ? `লগইন/নিবন্ধনে সমস্যা হয়েছে (${code || 'unknown'}): ${rawMessage}`
        : `${code ? `[${code}] ` : ''}${rawMessage}`,
  };
}
