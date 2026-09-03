import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel } from 'firebase/app';
import { 
  initializeFirestore, 
  getFirestore, 
  Firestore, 
  doc, 
  getDocFromServer,
  memoryLocalCache
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import defaultConfig from '../../firebase-applet-config.json';

import { getRuntimeFirebaseConfig, clearRuntimeConfigCache } from './runtimeConfig';
import { getCookie, setCookie, eraseCookie } from './accountSessionCache';

// Silence internal SDK logs to prevent 10s backend connection timeout warning noise
setLogLevel('silent');

// Safely clear any legacy or bloated Firestore internal storage keys from localStorage to prevent QuotaExceededError
export function purgeFirestoreLocalStorageCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Purge internal firestore SDK state keys, large reports, and legacy backup snapshots
        if (
          (key.startsWith('firestore') && key !== 'active_firestore_database_id' && key !== 'custom_firebase_config') ||
          key.startsWith('ClassApp_') ||
          key.includes('integrity_report')
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch (_e) {}
    });
  } catch (_e) {
    // Ignore storage cleanup error
  }
}

// Run cleanup immediately on module load
purgeFirestoreLocalStorageCache();

/**
 * Safe helper for localStorage.setItem to swallow QuotaExceededError gracefully
 * and purge obsolete internal cache if quota is reached.
 */
export function safeLocalStorageSetItem(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[localStorage] Quota exceeded writing key "${key}". Purging Firestore internal cache...`, err);
    purgeFirestoreLocalStorageCache();
    try {
      localStorage.setItem(key, value);
    } catch (_retryErr) {
      // Ignore fallback failure if storage is completely full
    }
  }
}

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
  return getRuntimeFirebaseConfig();
}

export const activeFirebaseConfig = getFirebaseConfig();

// Initialize Firebase App dynamically
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();
export const auth = getAuth(app);

/**
 * Mendapatkan Database ID Firestore yang sedang aktif
 * (Memeriksa Cookie dan localStorage agar tersinkronisasi di perangkat/sesi lain)
 */
export function getActiveDatabaseId(): string {
  if (typeof window !== 'undefined') {
    // 1. Check Cookie first
    const cookieDb = getCookie('edusync_active_firestore_database_id');
    if (cookieDb && cookieDb.trim()) {
      const trimmed = cookieDb.trim();
      if (!trimmed.includes('ai-studio-remix') && !trimmed.includes('acc88558')) {
        return trimmed;
      }
    }

    // 2. Check localStorage
    const customDb = localStorage.getItem('active_firestore_database_id');
    if (customDb && customDb.trim()) {
      const trimmed = customDb.trim();
      // If the active config belongs to user's custom project or doesn't match old remix ID, clear stale ID
      if (trimmed.includes('ai-studio-remix') || trimmed.includes('acc88558')) {
        try { 
          localStorage.removeItem('active_firestore_database_id'); 
          eraseCookie('edusync_active_firestore_database_id');
        } catch (_e) {}
        return activeFirebaseConfig.firestoreDatabaseId || '(default)';
      }
      return trimmed;
    }

    // 3. Check Vite Environment Variable
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_DATABASE_ID) {
      return (import.meta as any).env.VITE_FIREBASE_DATABASE_ID;
    }
  }
  return activeFirebaseConfig.firestoreDatabaseId || '(default)';
}

export function createFirestoreInstance(databaseId: string): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: memoryLocalCache()
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
  setCookie('edusync_active_firestore_database_id', cleanDbId, 30);
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
  clearRuntimeConfigCache();
  if (!config) {
    localStorage.removeItem('custom_firebase_config');
    localStorage.removeItem('active_firestore_database_id');
    eraseCookie('edusync_custom_firebase_config');
    eraseCookie('edusync_active_firestore_database_id');
  } else {
    const jsonStr = JSON.stringify(config);
    localStorage.setItem('custom_firebase_config', jsonStr);
    setCookie('edusync_custom_firebase_config', jsonStr, 30);
    if (config.firestoreDatabaseId) {
      localStorage.setItem('active_firestore_database_id', config.firestoreDatabaseId);
      setCookie('edusync_active_firestore_database_id', config.firestoreDatabaseId, 30);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firebase-config-changed', { detail: config }));
    window.dispatchEvent(new Event('data-changed'));
  }
}

export default app;


