import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const EXPECTED_FIREBASE_PROJECT_ID = 'gen-lang-client-0047498127';

export const firebaseConfig = {
  apiKey: 'AIzaSyAT4OMOdcu1iJJGBngF8MROFJSQOOso2qI',
  authDomain: 'gen-lang-client-0047498127.firebaseapp.com',
  projectId: 'gen-lang-client-0047498127',
  storageBucket: 'gen-lang-client-0047498127.firebasestorage.app',
  messagingSenderId: '686608178094',
  appId: '1:686608178094:web:171a1e97deef9d83f6863f',
};

export interface FirebaseConfigStatus {
  valid: boolean;
  activeProjectId: string;
  activeDatabaseId: string;
  missingKeys: string[];
  errorBn: string | null;
  errorEn: string | null;
}

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  return {
    valid: true,
    activeProjectId: firebaseConfig.projectId,
    activeDatabaseId: '(default)',
    missingKeys: [],
    errorBn: null,
    errorEn: null,
  };
}

export const firebaseConfigStatus = getFirebaseConfigStatus();
export const isFirebaseInitialized = true;

const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(() => setPersistence(auth, browserSessionPersistence))
    .catch(() => setPersistence(auth, inMemoryPersistence))
    .catch(() => {
      // Ignore if environment enforces built-in persistence
    });
}

export { auth, db, storage };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const currentUser = auth.currentUser;
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirestoreConnectionStatus {
  online: boolean;
  reason?: 'service_denied' | 'offline' | 'unknown';
  detail?: string;
}

export async function checkFirestoreConnection(): Promise<FirestoreConnectionStatus> {
  try {
    const restResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`
    );
    if (restResp.status === 403) {
      const body = (await restResp.json().catch(() => null)) as {
        error?: {
          message?: string;
          details?: { reason?: string; metadata?: { service?: string } }[];
        };
      } | null;
      const isServiceDenied =
        body?.error?.message?.includes('Permission denied on the service') ||
        body?.error?.details?.some((d) => d.reason === 'ACCESS_DENIED');
      if (isServiceDenied) {
        return {
          online: false,
          reason: 'service_denied',
          detail: `Cloud Firestore API (firestore.googleapis.com) is not enabled or is restricted on API key for project "${firebaseConfig.projectId}".`,
        };
      }
    }
  } catch {
    // Network error during REST preflight; fall through to SDK check
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { online: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('the client is offline') ||
      message.includes('Permission denied on the service')
    ) {
      console.warn('Firestore connection check:', message);
      return {
        online: false,
        reason: message.includes('Permission denied on the service') ? 'service_denied' : 'offline',
        detail: message,
      };
    }
    // Security rules denial (Missing or insufficient permissions) confirms Firestore is reachable
    return { online: true };
  }
}

export async function testConnection(): Promise<boolean> {
  const status = await checkFirestoreConnection();
  return status.online;
}

export default app;
