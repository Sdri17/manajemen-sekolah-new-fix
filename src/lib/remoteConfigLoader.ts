import defaultConfig from '../../firebase-applet-config.json';

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
 * with a cache-busting timestamp to immediately respect dashboard updates across all devices.
 */
export async function fetchRemoteFirebaseConfig(): Promise<FirebaseConfigType> {
  if (typeof window === 'undefined') {
    return (defaultConfig as FirebaseConfigType);
  }

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
        if (oldConfig && isConfigDifferent(oldConfig, config)) {
          console.log('[remoteConfigLoader] Config change detected in firebase-applet-config.json! New Project ID:', config.projectId);
          remoteConfigCache = config;
          notifyListeners(config, oldConfig);
        } else {
          remoteConfigCache = config;
        }

        return config;
      }
    }
  } catch (error: any) {
    console.warn('[remoteConfigLoader] Error fetching remote firebase-applet-config.json, falling back:', error);
  }

  // Fallback 1: localStorage override
  const localCustom = localStorage.getItem('custom_firebase_config');
  if (localCustom) {
    try {
      const parsed = JSON.parse(localCustom);
      if (parsed && parsed.projectId) {
        remoteConfigCache = parsed;
        return parsed;
      }
    } catch (_e) {}
  }

  // Fallback 2: Default bundled JSON
  remoteConfigCache = defaultConfig as FirebaseConfigType;
  return remoteConfigCache;
}

/**
 * Synchronously retrieves cached remote configuration object or falls back to local storage/bundled defaults.
 */
export function getRemoteFirebaseConfig(): FirebaseConfigType {
  if (remoteConfigCache) {
    return remoteConfigCache;
  }
  
  if (typeof window !== 'undefined') {
    const localCustom = localStorage.getItem('custom_firebase_config');
    if (localCustom) {
      try {
        const parsed = JSON.parse(localCustom);
        if (parsed && parsed.projectId) {
          return parsed;
        }
      } catch (_e) {}
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
