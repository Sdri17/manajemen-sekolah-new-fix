import defaultConfig from '../../firebase-applet-config.json';
import { getRemoteFirebaseConfig, fetchRemoteFirebaseConfig } from './remoteConfigLoader';

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
 * Uses remoteConfigLoader to fetch public `/firebase-applet-config.json` dynamically.
 */
export function getRuntimeFirebaseConfig(): FirebaseConfigType {
  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig;
  }
  const remote = getRemoteFirebaseConfig();
  if (remote && remote.projectId && remote.apiKey) {
    cachedRuntimeConfig = remote;
    return remote;
  }
  return defaultConfig as FirebaseConfigType;
}

/**
 * Dynamically fetches the latest runtime configuration file `/firebase-applet-config.json` from the server
 * with a cache-busting timestamp `?t=...` to ensure fresh credentials after Vercel deployments.
 */
export async function fetchFreshRuntimeConfig(): Promise<FirebaseConfigType | null> {
  const fresh = await fetchRemoteFirebaseConfig();
  if (fresh) {
    cachedRuntimeConfig = fresh;
    return fresh;
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
