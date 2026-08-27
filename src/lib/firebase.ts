import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel } from 'firebase/app';
import { 
  initializeFirestore, 
  getFirestore, 
  Firestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import defaultConfig from '../../firebase-applet-config.json';

// Silence internal SDK logs to prevent 10s backend connection timeout warning noise
setLogLevel('silent');

export interface FirebaseConfigType {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  recaptchaSiteKey?: string;
}

/**
 * Resolves active Firebase configuration.
 * Priority:
 * 1. Custom configuration stored in localStorage ('custom_firebase_config')
 * 2. Vite environment variables (VITE_FIREBASE_*)
 * 3. Default fallback configuration (firebase-applet-config.json)
 */
export function getFirebaseConfig(): FirebaseConfigType {
  if (typeof window !== 'undefined') {
    const customStr = localStorage.getItem('custom_firebase_config');
    if (customStr) {
      try {
        const parsed = JSON.parse(customStr) as FirebaseConfigType;
        if (parsed && parsed.projectId && parsed.apiKey) {
          // If project ID is a custom project, but firestoreDatabaseId is missing or leftover from preview remix, default to '(default)'
          let dbId = parsed.firestoreDatabaseId ? parsed.firestoreDatabaseId.trim() : '(default)';
          if (parsed.projectId !== defaultConfig.projectId && (dbId.includes('ai-studio-remix') || dbId.includes('acc88558') || !dbId)) {
            dbId = '(default)';
          }
          return {
            ...defaultConfig,
            ...parsed,
            firestoreDatabaseId: dbId
          };
        }
      } catch (e) {
        console.warn('Failed to parse custom_firebase_config from localStorage', e);
      }
    }
  }

  // Check Vite environment variables for production hosting deployments (e.g. Vercel, Netlify)
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  if (metaEnv && metaEnv.VITE_FIREBASE_PROJECT_ID) {
    return {
      projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || defaultConfig.projectId,
      appId: metaEnv.VITE_FIREBASE_APP_ID || defaultConfig.appId,
      apiKey: metaEnv.VITE_FIREBASE_API_KEY || defaultConfig.apiKey,
      authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
      firestoreDatabaseId: metaEnv.VITE_FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId,
      storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
      messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId,
      measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || '',
      recaptchaSiteKey: metaEnv.VITE_FIREBASE_RECAPTCHA_SITE_KEY || ''
    };
  }

  return defaultConfig;
}

export const activeFirebaseConfig = getFirebaseConfig();

// Initialize Firebase App dynamically
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();
export const auth = getAuth(app);

/**
 * Mendapatkan Database ID Firestore yang sedang aktif
 * (Memeriksa localStorage jika wali kelas pernah memilih database kelas tertentu)
 */
export function getActiveDatabaseId(): string {
  if (typeof window !== 'undefined') {
    const customDb = localStorage.getItem('active_firestore_database_id');
    if (customDb && customDb.trim()) {
      const trimmed = customDb.trim();
      // If the active config belongs to user's custom project or doesn't match old remix ID, clear stale ID
      if (trimmed.includes('ai-studio-remix') || trimmed.includes('acc88558')) {
        localStorage.removeItem('active_firestore_database_id');
        return activeFirebaseConfig.firestoreDatabaseId || '(default)';
      }
      return trimmed;
    }
  }
  return activeFirebaseConfig.firestoreDatabaseId || '(default)';
}

export function createFirestoreInstance(databaseId: string): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    }, databaseId);
  } catch (_e) {
    try {
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, databaseId);
    } catch (_e2) {
      return getFirestore(app, databaseId);
    }
  }
}

// Initialize Firestore with active database ID and long polling detection
export let db: Firestore = createFirestoreInstance(getActiveDatabaseId());

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection on boot
if (typeof window !== 'undefined') {
  // Connection validated automatically by Firestore SDK
}

/**
 * Berpindah Database Firestore (misal: beralih ke Database ID Rombel / Kelas lain)
 */
export function switchFirestoreDatabase(newDbId: string) {
  const cleanDbId = newDbId.trim() || '(default)';
  localStorage.setItem('active_firestore_database_id', cleanDbId);
  db = createFirestoreInstance(cleanDbId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('database-switched', { detail: { databaseId: cleanDbId } }));
  }
  return db;
}

/**
 * Simpan atau ganti konfigurasi kustom Firebase (Custom Database)
 */
export function saveCustomFirebaseConfig(config: Partial<FirebaseConfigType> | null) {
  if (!config) {
    localStorage.removeItem('custom_firebase_config');
    localStorage.removeItem('active_firestore_database_id');
  } else {
    localStorage.setItem('custom_firebase_config', JSON.stringify(config));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firebase-config-changed', { detail: config }));
    window.dispatchEvent(new Event('data-changed'));
  }
}

export default app;


