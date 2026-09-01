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

export interface RuntimeDiagnosticDetails {
  sdkProjectId: string;
  sdkAuthDomain: string;
  sdkAppId: string;
  sdkDatabaseId: string;
  runtimeJsonProjectId?: string;
  localStorageProjectId?: string;
  configSource: 'localStorage' | 'runtime_json' | 'default_json' | 'env_var';
  isVercelCacheMismatch: boolean;
  checkedAt: string;
}

let cachedRuntimeConfig: FirebaseConfigType | null = null;

/**
 * Central interface for loading Firebase configuration at runtime.
 * Prioritizes runtime JSON and localStorage over stale build-time VITE_ environment variables.
 */
export function getRuntimeFirebaseConfig(): FirebaseConfigType {
  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig;
  }

  // 1. Check custom configuration stored in localStorage ('custom_firebase_config')
  if (typeof window !== 'undefined') {
    const customStr = localStorage.getItem('custom_firebase_config');
    if (customStr) {
      try {
        const parsed = JSON.parse(customStr) as FirebaseConfigType;
        if (parsed && parsed.projectId && parsed.apiKey) {
          let dbId = parsed.firestoreDatabaseId ? parsed.firestoreDatabaseId.trim() : '(default)';
          if (parsed.projectId !== defaultConfig.projectId && (dbId.includes('ai-studio-remix') || dbId.includes('acc88558') || !dbId)) {
            dbId = '(default)';
          }
          const config: FirebaseConfigType = {
            ...defaultConfig,
            ...parsed,
            firestoreDatabaseId: dbId
          };
          cachedRuntimeConfig = config;
          return config;
        }
      } catch (e) {
        console.warn('[runtimeConfig] Failed to parse custom_firebase_config from localStorage', e);
      }
    }
  }

  // 2. Check default fallback configuration (firebase-applet-config.json)
  if (defaultConfig && defaultConfig.projectId && defaultConfig.apiKey) {
    cachedRuntimeConfig = defaultConfig as FirebaseConfigType;
    return cachedRuntimeConfig;
  }

  // 3. Fallback to Vite environment variables if present
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  if (metaEnv && metaEnv.VITE_FIREBASE_PROJECT_ID) {
    const envConfig: FirebaseConfigType = {
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
    cachedRuntimeConfig = envConfig;
    return envConfig;
  }

  return defaultConfig as FirebaseConfigType;
}

/**
 * Dynamically fetches the latest runtime configuration file `/firebase-applet-config.json` from the server
 * with a cache-busting timestamp `?t=...` to ensure fresh credentials after Vercel deployments.
 */
export async function fetchFreshRuntimeConfig(): Promise<FirebaseConfigType | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch(`/firebase-applet-config.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (res.ok) {
      const json = await res.json();
      if (json && json.projectId && json.apiKey) {
        cachedRuntimeConfig = json as FirebaseConfigType;
        return cachedRuntimeConfig;
      }
    }
  } catch (err) {
    console.warn('[runtimeConfig] Failed to fetch runtime firebase-applet-config.json:', err);
  }

  return null;
}

/**
 * Returns the current runtime Project ID.
 */
export function getRuntimeProjectId(): string {
  const config = getRuntimeFirebaseConfig();
  return config.projectId || defaultConfig.projectId || 'unknown';
}

/**
 * Clears the cached runtime config in memory, forcing a fresh resolution.
 */
export function clearRuntimeConfigCache(): void {
  cachedRuntimeConfig = null;
}
