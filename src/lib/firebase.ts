import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel } from 'firebase/app';
import { 
  initializeFirestore, 
  getFirestore, 
  Firestore, 
  doc, 
  getDoc,
  setDoc,
  getDocFromServer,
  memoryLocalCache
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import defaultConfig from '../../firebase-applet-config.json';

import { getRuntimeFirebaseConfig, clearRuntimeConfigCache } from './runtimeConfig';
import { subscribeRemoteConfigChange } from './remoteConfigLoader';
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
 * (Memeriksa Query URL, Cookie, dan localStorage agar tersinkronisasi di perangkat/sesi lain)
 */
export function getActiveDatabaseId(): string {
  if (typeof window !== 'undefined') {
    // 0. Check URL query parameters (?db_id=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlDbId = urlParams.get('db_id');
      if (urlDbId && urlDbId.trim()) {
        const cleanUrlDb = urlDbId.trim();
        localStorage.setItem('active_firestore_database_id', cleanUrlDb);
        setCookie('edusync_active_firestore_database_id', cleanUrlDb, 30);
        return cleanUrlDb;
      }
    } catch (_e) {}

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

// Validate connection and listen for live remote config updates
if (typeof window !== 'undefined') {
  subscribeRemoteConfigChange((newConfig) => {
    if (newConfig && newConfig.projectId) {
      Object.assign(activeFirebaseConfig, newConfig);
      const targetDbId = newConfig.firestoreDatabaseId || '(default)';
      console.log(`[firebase.ts] Dynamic remote config sync received. Target DB ID: "${targetDbId}"`);
      if (getActiveDatabaseId() !== targetDbId) {
        switchFirestoreDatabase(targetDbId);
      }
    }
  });
}

/**
 * Synchronizes the current active database configuration to Cloud Firestore ('school_settings/global_database_config')
 * so that any other device opening the app will automatically read and switch to the same database.
 */
export async function syncDatabaseConfigToCloud(customConfig?: Partial<FirebaseConfigType> | null) {
  if (typeof window === 'undefined') return;
  try {
    const configToSync = customConfig || getFirebaseConfig();
    const activeDbId = getActiveDatabaseId();

    const payload = {
      projectId: configToSync.projectId,
      apiKey: configToSync.apiKey,
      authDomain: configToSync.authDomain || `${configToSync.projectId}.firebaseapp.com`,
      firestoreDatabaseId: configToSync.firestoreDatabaseId || activeDbId || '(default)',
      appId: configToSync.appId || '',
      updatedAt: new Date().toISOString(),
      updatedByDevice: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 40) : 'Web App'
    };

    // Save to active db
    const targetDocRef = doc(db, 'school_settings', 'global_database_config');
    await setDoc(targetDocRef, payload, { merge: true });

    // Also attempt saving to primary (default) db instance if target is different
    if (activeDbId !== '(default)' && activeDbId !== 'default') {
      try {
        const primaryDb = createFirestoreInstance('(default)');
        const primaryDocRef = doc(primaryDb, 'school_settings', 'global_database_config');
        await setDoc(primaryDocRef, payload, { merge: true });
      } catch (_e) {}
    }

    console.log('[firebase.ts] Synced database config to Cloud Firestore across all devices:', payload.firestoreDatabaseId);
  } catch (err) {
    console.warn('[firebase.ts] Cloud database config sync warning:', err);
  }
}

/**
 * Checks Cloud Firestore ('school_settings/global_database_config') for any database configuration
 * updated from another device, and automatically adopts it if newer/different.
 */
export async function syncDatabaseConfigFromCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const isDevDebugLocked = 
      localStorage.getItem('edusync_debug_lock_active') === 'true' ||
      (localStorage.getItem('edusync_dev_active_profile_id') && 
       localStorage.getItem('edusync_dev_active_profile_id') !== 'profile-system-default');

    const currentActive = getFirebaseConfig();
    const currentDbId = getActiveDatabaseId();

    const primaryDb = currentDbId === '(default)' ? db : createFirestoreInstance('(default)');
    const configDocRef = doc(primaryDb, 'school_settings', 'global_database_config');
    const snap = await getDoc(configDocRef);

    if (snap.exists()) {
      const remote = snap.data() as FirebaseConfigType & { updatedAt?: string };
      if (remote && remote.projectId && remote.apiKey) {
        
        // If the remote document has a DIFFERENT projectId than currentActive
        // AND the developer did NOT explicitly lock a custom debug profile:
        // DO NOT overwrite currentActive with the foreign projectId!
        // Instead, update the Cloud Firestore document to match the deployed build project ID.
        if (remote.projectId !== currentActive.projectId) {
          if (!isDevDebugLocked) {
            console.log(`[CloudConfigSync] Firestore doc has stale projectId (${remote.projectId}) while deployed build has (${currentActive.projectId}). Aligning Firestore doc with deployed build...`);
            syncDatabaseConfigToCloud(currentActive).catch(() => {});
            return false;
          }
        }

        // Only sync database ID switch if it belongs to the SAME project ID
        const isDifferentDb = remote.firestoreDatabaseId && remote.firestoreDatabaseId !== currentDbId;
        if (isDifferentDb && remote.projectId === currentActive.projectId) {
          console.log(`[CloudConfigSync] Remote database ID switch detected within project ${remote.projectId}: ${remote.firestoreDatabaseId}`);
          switchFirestoreDatabase(remote.firestoreDatabaseId);
          return true;
        }
      }
    }
  } catch (err) {
    console.warn('[CloudConfigSync] Could not check Cloud database config:', err);
  }
  return false;
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
  syncDatabaseConfigToCloud(null).catch(() => {});
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
  if (config) {
    syncDatabaseConfigToCloud(config).catch(() => {});
  }
}

/**
 * Re-initializes all Firebase services dynamically (Auth, Firestore DB instance)
 * and dispatches re-initialization events across the application.
 */
export function reinitializeFirebaseServices(newConfig?: Partial<FirebaseConfigType>): Firestore {
  clearRuntimeConfigCache();
  
  if (newConfig && newConfig.projectId) {
    Object.assign(activeFirebaseConfig, newConfig);
    if (newConfig.apiKey) {
      saveCustomFirebaseConfig(newConfig);
    }
  }

  const activeDbId = getActiveDatabaseId();
  db = createFirestoreInstance(activeDbId);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firebase-reinitialized', {
      detail: {
        config: activeFirebaseConfig,
        databaseId: activeDbId,
        reinitializedAt: new Date().toISOString()
      }
    }));
    window.dispatchEvent(new CustomEvent('firebase-config-changed', { detail: activeFirebaseConfig }));
    window.dispatchEvent(new Event('data-changed'));
  }

  syncDatabaseConfigFromCloud().catch(() => {});
  return db;
}

/**
 * Verification hook executed during initial app load that performs a lightweight 'ping'
 * to the current Firestore configuration endpoint (/firebase-applet-config.json).
 * If the response project ID differs from the one stored in local storage, it triggers
 * an automatic re-initialization of all Firebase services.
 */
export async function verifyFirestoreConfigPing(): Promise<{ reinitialized: boolean; activeProjectId: string }> {
  if (typeof window === 'undefined') {
    return { reinitialized: false, activeProjectId: activeFirebaseConfig.projectId };
  }

  try {
    // 1. Perform lightweight ping to Firestore configuration endpoint
    const pingResponse = await fetch(`/firebase-applet-config.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (pingResponse.ok) {
      const endpointConfig = await pingResponse.json();
      if (endpointConfig && endpointConfig.projectId) {
        // 2. Read stored project ID from local storage
        let storedProjectId: string | null = null;
        
        // Check custom_firebase_config in localStorage
        const customLocalStr = localStorage.getItem('custom_firebase_config');
        if (customLocalStr) {
          try {
            const parsedCustom = JSON.parse(customLocalStr);
            if (parsedCustom && parsedCustom.projectId) {
              storedProjectId = parsedCustom.projectId;
            }
          } catch (_e) {}
        }

        // Fallback to cached project ID key in localStorage if no custom config
        if (!storedProjectId) {
          storedProjectId = localStorage.getItem('edusync_cached_firebase_project_id');
        }

        console.log(`[FirebaseConfigPing] Endpoint Project ID: "${endpointConfig.projectId}", Stored LocalStorage Project ID: "${storedProjectId || 'none'}"`);

        // 3. Compare endpoint project ID with stored project ID
        if (storedProjectId && storedProjectId !== endpointConfig.projectId) {
          console.warn(`[FirebaseConfigPing] Project ID mismatch detected! Endpoint: ${endpointConfig.projectId} vs Stored: ${storedProjectId}. Triggering automatic re-initialization of all Firebase services...`);

          // Update local storage to reflect newly verified endpoint configuration
          localStorage.setItem('edusync_cached_firebase_project_id', endpointConfig.projectId);
          if (customLocalStr) {
            localStorage.setItem('custom_firebase_config', JSON.stringify(endpointConfig));
          }

          // 4. Trigger automatic re-initialization of all Firebase services
          reinitializeFirebaseServices(endpointConfig);
          return { reinitialized: true, activeProjectId: endpointConfig.projectId };
        } else {
          // Store current verified project ID in cache for future pings
          localStorage.setItem('edusync_cached_firebase_project_id', endpointConfig.projectId);
        }
      }
    }
  } catch (err) {
    console.warn('[FirebaseConfigPing] Verification ping failed or offline:', err);
  }

  return { reinitialized: false, activeProjectId: activeFirebaseConfig.projectId };
}

export default app;


