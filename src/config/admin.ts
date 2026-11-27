import type { User } from 'firebase/auth';

/**
 * Primary Administrator email configuration.
 * Matches VITE_PRIMARY_ADMIN_EMAIL when provided and defaults to the configured owner Google account.
 */
export const DEFAULT_PRIMARY_ADMIN_EMAIL = 'shafayetislam28122006@gmail.com';

export const PRIMARY_ADMIN_EMAIL: string = (
  import.meta.env.VITE_PRIMARY_ADMIN_EMAIL?.trim() || DEFAULT_PRIMARY_ADMIN_EMAIL
).toLowerCase();

export function isPrimaryAdminConfigured(): boolean {
  return (
    Boolean(PRIMARY_ADMIN_EMAIL) &&
    PRIMARY_ADMIN_EMAIL !== 'my_new_admin_email' &&
    PRIMARY_ADMIN_EMAIL.includes('@')
  );
}

export function isPrimaryAdminEmailMatch(email: string | null | undefined): boolean {
  if (!isPrimaryAdminConfigured() || !email) return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

export function hasGoogleProvider(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.providerData?.some((p) => p.providerId === 'google.com'));
}

export function isPrimaryAdminGoogleUser(user: User | null | undefined): boolean {
  if (!user || !user.emailVerified) return false;
  return isPrimaryAdminEmailMatch(user.email) && hasGoogleProvider(user);
}
