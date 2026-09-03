import defaultConfig from '../../firebase-applet-config.json';
import { getCookie } from './accountSessionCache';

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

export interface ConfigComparisonResult {
  isMatched: boolean;
  publicConfig: FirebaseConfigType | null;
  sdkConfig: Partial<FirebaseConfigType>;
  mismatchedKeys: string[];
  lastFetchedAt: Date | null;
  error: string | null;
}

let remoteConfigCache: FirebaseConfigType | null = null;
let fetchPromise: Promise<FirebaseConfigType> | null = null;
let pollingTimer: any = null;
type ConfigChangeListener = (newConfig: FirebaseConfigType, oldConfig: FirebaseConfigType | null) => void;
const changeListeners: Set<ConfigChangeListener> = new Set();

/**
 * Gets Firebase config defined via Vite environment variables (e.g., on Vercel)
 */
function getViteEnvConfig(): Partial<FirebaseConfigType> | null {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY) {
      return {
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        appId: env.VITE_FIREBASE_APP_ID || '',
        firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || '(default)',
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      };
    }
  }
  return null;
}

/**
 * Gets Firebase config stored in Cookie
 */
function getCookieCustomConfig(): Partial<FirebaseConfigType> | null {
  const cookieVal = getCookie('edusync_custom_firebase_config');
  if (cookieVal) {
    try {
      const parsed = JSON.parse(cookieVal);
      if (parsed && parsed.projectId) return parsed;
    } catch (_e) {}
  }
  return null;
}

/**
 * Compares two Firebase config objects to determine if any key configuration parameter has changed.
 */
export function isConfigDifferent(cfg1: Partial<FirebaseConfigType> | null, cfg2: Partial<FirebaseConfigType> | null): boolean {
  if (!cfg1 || !cfg2) return true;
  return (
    cfg1.projectId !== cfg2.projectId ||
    cfg1.apiKey !== cfg2.apiKey ||
    cfg1.appId !== cfg2.appId ||
    cfg1.firestoreDatabaseId !== cfg2.firestoreDatabaseId ||
    cfg1.authDomain !== cfg2.authDomain
  );
}

/**
 * Fetches the firebase-applet-config.json file directly from the public root using a standard fetch request
 * with a cache-busting timestamp to immediately respect updates on Vercel deployments across all devices.
 */
export async function fetchRemoteFirebaseConfig(): Promise<FirebaseConfigType> {
  if (typeof window === 'undefined') {
    return (defaultConfig as FirebaseConfigType);
  }

  // Priority 1 (Highest): Always fetch live public /firebase-applet-config.json directly from server
  try {
    const response = await fetch(`/firebase-applet-config.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.projectId && data.apiKey) {
        const config: FirebaseConfigType = {
          projectId: data.projectId,
          appId: data.appId || '',
          apiKey: data.apiKey || '',
          authDomain: data.authDomain || `${data.projectId}.firebaseapp.com`,
          firestoreDatabaseId: data.firestoreDatabaseId || '(default)',
          storageBucket: data.storageBucket || `${data.projectId}.appspot.com`,
          messagingSenderId: data.messagingSenderId || '',
          measurementId: data.measurementId || '',
          recaptchaSiteKey: data.recaptchaSiteKey || ''
        };

        const oldConfig = remoteConfigCache;

        // Clean up any stale localStorage override if server project/database ID has changed
        const localCustomStr = localStorage.getItem('custom_firebase_config');
        if (localCustomStr) {
          try {
            const parsed = JSON.parse(localCustomStr);
            if (parsed && (parsed.projectId !== config.projectId || parsed.firestoreDatabaseId !== config.firestoreDatabaseId)) {
              console.log('[remoteConfigLoader] Purging stale localStorage custom_firebase_config to sync with live server configuration');
              localStorage.removeItem('custom_firebase_config');
              localStorage.removeItem('active_firestore_database_id');
            }
          } catch (_e) {}
        }

        remoteConfigCache = config;

        if (oldConfig && isConfigDifferent(oldConfig, config)) {
          console.log('[remoteConfigLoader] Config change detected in live /firebase-applet-config.json! New Project ID:', config.projectId, 'Database ID:', config.firestoreDatabaseId);
          notifyListeners(config, oldConfig);
        }

        return config;
      }
    }
  } catch (error: any) {
    console.warn('[remoteConfigLoader] Error fetching live /firebase-applet-config.json, falling back:', error);
  }

  // Priority 2: LocalStorage or Cookie Override for user-configured custom database
  const cookieCustom = getCookieCustomConfig();
  const localCustomStr = localStorage.getItem('custom_firebase_config');
  let customObj: any = cookieCustom;
  if (!customObj && localCustomStr) {
    try { customObj = JSON.parse(localCustomStr); } catch (_e) {}
  }

  if (customObj && customObj.projectId && customObj.apiKey) {
    remoteConfigCache = customObj as FirebaseConfigType;
    return remoteConfigCache;
  }

  // Priority 3: Vite Environment variables (e.g. set in Vercel settings)
  const viteEnv = getViteEnvConfig();
  if (viteEnv && viteEnv.projectId && viteEnv.apiKey) {
    const fullEnvConfig: FirebaseConfigType = {
      projectId: viteEnv.projectId,
      apiKey: viteEnv.apiKey,
      authDomain: viteEnv.authDomain || `${viteEnv.projectId}.firebaseapp.com`,
      appId: viteEnv.appId || '',
      firestoreDatabaseId: viteEnv.firestoreDatabaseId || '(default)',
      storageBucket: viteEnv.storageBucket || `${viteEnv.projectId}.appspot.com`,
      messagingSenderId: viteEnv.messagingSenderId || '',
    };
    remoteConfigCache = fullEnvConfig;
    return fullEnvConfig;
  }

  // Priority 4: Default bundled JSON
  remoteConfigCache = defaultConfig as FirebaseConfigType;
  return remoteConfigCache;
}

/**
 * Synchronously retrieves cached remote configuration object or falls back to local storage/cookie/bundled defaults.
 */
export function getRemoteFirebaseConfig(): FirebaseConfigType {
  if (remoteConfigCache) {
    return remoteConfigCache;
  }
  
  if (typeof window !== 'undefined') {
    const cookieCustom = getCookieCustomConfig();
    if (cookieCustom && cookieCustom.projectId) {
      return cookieCustom as FirebaseConfigType;
    }

    const localCustom = localStorage.getItem('custom_firebase_config');
    if (localCustom) {
      try {
        const parsed = JSON.parse(localCustom);
        if (parsed && parsed.projectId) {
          return parsed;
        }
      } catch (_e) {}
    }

    const viteEnv = getViteEnvConfig();
    if (viteEnv && viteEnv.projectId && viteEnv.apiKey) {
      return {
        projectId: viteEnv.projectId,
        apiKey: viteEnv.apiKey,
        authDomain: viteEnv.authDomain || `${viteEnv.projectId}.firebaseapp.com`,
        appId: viteEnv.appId || '',
        firestoreDatabaseId: viteEnv.firestoreDatabaseId || '(default)',
        storageBucket: viteEnv.storageBucket || `${viteEnv.projectId}.appspot.com`,
        messagingSenderId: viteEnv.messagingSenderId || '',
      };
    }
  }

  return (defaultConfig as FirebaseConfigType);
}

/**
 * Immediately triggers remote config fetch at app initialization.
 */
export function initRemoteFirebaseConfig(): Promise<FirebaseConfigType> {
  if (!fetchPromise) {
    fetchPromise = fetchRemoteFirebaseConfig();
  }
  return fetchPromise;
}

/**
 * Subscribe to config changes detected by polling or manual refresh.
 */
export function subscribeRemoteConfigChange(listener: ConfigChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyListeners(newConfig: FirebaseConfigType, oldConfig: FirebaseConfigType | null) {
  changeListeners.forEach(listener => {
    try {
      listener(newConfig, oldConfig);
    } catch (e) {
      console.error('[remoteConfigLoader] Error in config change listener:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firebase-remote-config-changed', {
      detail: { newConfig, oldConfig }
    }));
  }
}

/**
 * Starts automatic polling to monitor changes in public/firebase-applet-config.json.
 * Default polling interval is 15 seconds.
 */
export function startRemoteConfigPolling(intervalMs: number = 15000): () => void {
  if (typeof window === 'undefined') return () => {};
  
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  // Initial fetch
  fetchRemoteFirebaseConfig().catch(() => {});

  pollingTimer = setInterval(() => {
    fetchRemoteFirebaseConfig().catch(() => {});
  }, intervalMs);

  console.log(`[remoteConfigLoader] Started polling public/firebase-applet-config.json every ${intervalMs / 1000}s`);

  return () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };
}

// Auto-trigger fetch and start polling at app initialization in browser environment
if (typeof window !== 'undefined') {
  initRemoteFirebaseConfig().catch(() => {});
  startRemoteConfigPolling(15000);
}
