import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import app from '../firebase';
import { updateOwnProfile } from './messService';

export async function registerFcmToken(uid: string): Promise<{ token: string | null; reason?: string }> {
  try {
    const supported = await isSupported();
    if (!supported || typeof Notification === 'undefined') {
      return { token: null, reason: 'Push notifications are not supported in this browser/WebView.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { token: null, reason: 'Notification permission was not granted.' };
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return {
        token: null,
        reason: 'Notification permission granted. Add VITE_FIREBASE_VAPID_KEY for Web Push or build Android APK with google-services.json for FCM.',
      };
    }

    if (!app) {
      return { token: null, reason: 'Firebase is not initialized yet.' };
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    if (token) {
      await updateOwnProfile(uid, { fcmToken: token });
      return { token };
    }
    return { token: null, reason: 'No FCM token returned.' };
  } catch (err) {
    return {
      token: null,
      reason: err instanceof Error ? err.message : 'Failed to initialize FCM.',
    };
  }
}
