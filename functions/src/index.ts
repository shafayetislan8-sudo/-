import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();

const DEFAULT_PRIMARY_ADMIN_EMAIL = 'shafayetislam28122006@gmail.com';
const PRIMARY_ADMIN_EMAIL = (
  process.env.PRIMARY_ADMIN_EMAIL?.trim() || DEFAULT_PRIMARY_ADMIN_EMAIL
).toLowerCase();

/**
 * One-time server-side Admin bootstrap assigning custom claim { admin: true }.
 */
export const bootstrapPrimaryAdmin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const isConfigured =
    Boolean(PRIMARY_ADMIN_EMAIL) &&
    PRIMARY_ADMIN_EMAIL !== 'my_new_admin_email' &&
    PRIMARY_ADMIN_EMAIL.includes('@');
  const signInProvider = request.auth.token.firebase?.sign_in_provider;
  if (
    !isConfigured ||
    !request.auth.token.email_verified ||
    signInProvider !== 'google.com' ||
    request.auth.token.email?.toLowerCase() !== PRIMARY_ADMIN_EMAIL
  ) {
    throw new HttpsError('permission-denied', 'Only the configured, verified Google primary admin email can initialize.');
  }

  const bootRef = db.doc('system/adminBootstrap');
  const existing = await bootRef.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', 'Primary Admin is already initialized.');
  }

  await getAuth().setCustomUserClaims(request.auth.uid, { role: 'admin', singleAdmin: true });
  await bootRef.set({
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email,
    initializedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, adminUid: request.auth.uid };
});

/**
 * Automatic meal approval & atomic integer-poisha wallet deduction trigger.
 */
export const onMealEntryCreated = onDocumentCreated('mealEntries/{entryId}', async (event) => {
  const entry = event.data?.data();
  if (!entry || entry.status !== 'pending') return;

  const settingsSnap = await db.doc('settings/mess').get();
  const settings = settingsSnap.data();
  if (!settings?.automaticMealApproval) return;

  const entryId = event.params.entryId;
  const txId = `meal_charge_${entryId}`;
  const walletRef = db.doc(`wallets/${entry.memberId}`);
  const txRef = db.doc(`transactions/${txId}`);

  await db.runTransaction(async (tx) => {
    const existingTx = await tx.get(txRef);
    if (existingTx.exists) return;

    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() || {
      memberId: entry.memberId,
      openingBalanceInPoisha: 0,
      currentBalanceInPoisha: 0,
      totalDepositsInPoisha: 0,
      totalMealCostsInPoisha: 0,
      totalExpensesInPoisha: 0,
      totalRefundsInPoisha: 0,
    };

    const charge = Math.trunc(entry.totalAmountInPoisha || 0);
    const nextBal = wallet.currentBalanceInPoisha - charge;

    tx.update(event.data!.ref, {
      status: 'approved',
      approvedBy: 'AUTO',
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (charge > 0) {
      tx.set(txRef, {
        memberId: entry.memberId,
        type: 'meal_charge',
        amountInPoisha: charge,
        description: `${String(entry.mealType).toUpperCase()} x${entry.quantity} (${entry.mealDate})`,
        referenceId: entryId,
        createdBy: 'AUTO',
        createdAt: FieldValue.serverTimestamp(),
        status: 'completed',
      });
    }

    tx.set(walletRef, {
      ...wallet,
      currentBalanceInPoisha: nextBal,
      totalMealCostsInPoisha: wallet.totalMealCostsInPoisha + charge,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
});

/**
 * Delivers FCM push notification whenever a notification document is created.
 */
export const onNotificationCreated = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const notif = event.data?.data();
  if (!notif?.recipientUid) return;

  const userSnap = await db.doc(`users/${notif.recipientUid}`).get();
  const fcmToken = userSnap.data()?.fcmToken;
  if (!fcmToken || typeof fcmToken !== 'string') return;

  await getMessaging().send({
    token: fcmToken,
    notification: {
      title: String(notif.title || 'Mess Manager Pro'),
      body: String(notif.message || ''),
    },
    data: {
      category: String(notif.category || 'general'),
    },
  });
});
