# Security Specification — Mess Manager Pro

## 1. Data Invariants

1. **Single Admin Lock**: `system/adminBootstrap` can be created or recovered only by the configured verified Google primary admin email (`MY_NEW_ADMIN_EMAIL`) with `email_verified == true` and `sign_in_provider == 'google.com'`. Ordinary users can never create, update, or delete `system/adminBootstrap`.
2. **No Self-Promotion**: `users/{uid}` creation by non-admin callers is strictly restricted to `role == 'member'` and `status == 'pending'`. Members cannot modify `role`, `status`, `uid`, `joiningDate`, or `createdAt`.
3. **PII & Financial Isolation**: Members can read only their own `users/{uid}`, `wallets/{uid}`, `transactions`, `mealEntries`, `depositRequests`, `notifications`, and `monthlyReports`. Cross-member reads are rejected.
4. **Admin-Only Financial Ledger**: Only the single verified Admin may create or update `wallets/{uid}`, create `transactions/{id}`, create `expenses/{id}`, update `depositRequests/{id}` to `approved`/`rejected`, or approve/reject `mealEntries/{id}`.
5. **Append-Only Historical Records**: `mealRates`, `transactions` (except Admin marking `status: 'reversed'` paired with a reversal transaction), `expenses`, and `auditLogs` cannot be deleted.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`.
7. **Integer Poisha & Size Bounds**: Every monetary field must be an integer `>= 0` (or integer for adjustments/balances), and every string/list must obey strict `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Self-Promotion on Sign-up**: Member creates `/users/memberA` with `{ role: "admin", status: "active" }`.
2. **Admin Bootstrap Hijack**: Member attempts to create `/system/adminBootstrap` with `{ adminUid: "memberA" }`.
3. **Role Escalation Update**: Member updates `/users/memberA` with `{ role: "admin" }`.
4. **Cross-Member Wallet Read**: Member A attempts `get(/wallets/memberB)`.
5. **Direct Wallet Tampering**: Member A attempts `update(/wallets/memberA, { currentBalanceInPoisha: 99999900 })`.
6. **Self-Approved Meal Entry**: Member A creates `/mealEntries/e1` with `{ status: "approved" }`.
7. **Self-Approved Deposit Request**: Member A updates `/depositRequests/d1` to `{ status: "approved" }`.
8. **Shadow/Ghost Field Injection**: Member A creates `/mealEntries/e2` with extra field `{ isFree: true }`.
9. **Spoofed Unverified Admin Email**: Caller with `email: "MY_NEW_ADMIN_EMAIL"` and `email_verified: false` tries to read `/auditLogs`.
10. **Cross-Member List Scraping**: Member A runs `list` on `/transactions` without `where("memberId", "==", "memberA")`.
11. **ID Poisoning**: Caller attempts to create `/mealEntries/${"a".repeat(200)}`.
12. **Admin-Only Settings Access**: Member A tries to read `/adminSettings/integrations` or write `/settings/mess`.
