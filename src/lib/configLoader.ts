import { app, activeFirebaseConfig, getActiveDatabaseId, FirebaseConfigType } from './firebase';
import defaultConfig from '../../firebase-applet-config.json';

export interface ActiveProjectDetails {
  projectId: string;
  authDomain: string;
  firestoreDatabaseId: string;
  appId: string;
  source: 'firebase_sdk' | 'localStorage' | 'runtime_json' | 'default_config';
  initializedTime: string;
}

/**
 * Utility function to pull the Active Project ID and configuration
 * directly from the initialized Firebase SDK (`app.options`).
 * This guarantees verification of what database settings the active deployment is currently using.
 */
export function getActiveProjectDetails(): ActiveProjectDetails {
  const sdkOptions = app?.options || {};
  const projectId = sdkOptions.projectId || activeFirebaseConfig.projectId || defaultConfig.projectId || 'unknown';
  const authDomain = sdkOptions.authDomain || activeFirebaseConfig.authDomain || defaultConfig.authDomain || '-';
  const appId = sdkOptions.appId || activeFirebaseConfig.appId || defaultConfig.appId || '-';
  const firestoreDatabaseId = getActiveDatabaseId();

  let source: ActiveProjectDetails['source'] = 'firebase_sdk';
  if (typeof window !== 'undefined' && localStorage.getItem('custom_firebase_config')) {
    source = 'localStorage';
  }

  return {
    projectId,
    authDomain,
    firestoreDatabaseId,
    appId,
    source,
    initializedTime: new Date().toISOString()
  };
}

/**
 * Runtime Config Loader:
 * Explicitly fetches the latest Firebase config from public `/firebase-applet-config.json`
 * at runtime with cache-busting timestamp (`?t=...`).
 * Avoids relying solely on stale build-time `VITE_` environment variables or cached assets in Vercel.
 */
export async function fetchRuntimeFirebaseConfig(): Promise<FirebaseConfigType | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch(`/firebase-applet-config.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!res.ok) {
      console.warn(`[ConfigLoader] Fetch runtime config returned status ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (json && json.projectId && json.apiKey) {
      console.info(`[ConfigLoader] Successfully loaded runtime Firebase config for project: ${json.projectId}`);
      return json as FirebaseConfigType;
    }
  } catch (err) {
    console.warn('[ConfigLoader] Failed to fetch runtime firebase-applet-config.json:', err);
  }

  return null;
}
