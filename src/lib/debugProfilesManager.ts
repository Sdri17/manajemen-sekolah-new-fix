import { FirebaseConfigType, getRemoteFirebaseConfig } from './remoteConfigLoader';
import { saveCustomFirebaseConfig, switchFirestoreDatabase, getActiveDatabaseId } from './firebase';
import defaultConfig from '../../firebase-applet-config.json';

export interface FirebaseDebugProfile {
  id: string;
  name: string;
  description: string;
  environmentTag: 'development' | 'staging' | 'production' | 'test' | 'custom';
  isDefaultSystem?: boolean;
  createdAt: string;
  updatedAt: string;
  config: FirebaseConfigType;
  sourceType: 'default' | 'uploaded_file' | 'pasted_json' | 'remote_url' | 'preset';
  sourceDetail?: string;
}

const STORAGE_KEY_PROFILES = 'edusync_dev_debug_profiles';
const STORAGE_KEY_ACTIVE_ID = 'edusync_dev_active_profile_id';

/**
 * Returns default system profile built from firebase-applet-config.json
 */
export function getDefaultSystemProfile(): FirebaseDebugProfile {
  const cfg = defaultConfig as FirebaseConfigType;
  return {
    id: 'profile-system-default',
    name: 'Default Applet Config',
    description: 'Konfigurasi Bawaan Server (firebase-applet-config.json)',
    environmentTag: 'development',
    isDefaultSystem: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      projectId: cfg.projectId,
      appId: cfg.appId || '',
      apiKey: cfg.apiKey || '',
      authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
      firestoreDatabaseId: cfg.firestoreDatabaseId || '(default)',
      storageBucket: cfg.storageBucket || `${cfg.projectId}.appspot.com`,
      messagingSenderId: cfg.messagingSenderId || '',
      measurementId: cfg.measurementId || '',
      recaptchaSiteKey: cfg.recaptchaSiteKey || ''
    },
    sourceType: 'default',
    sourceDetail: '/firebase-applet-config.json'
  };
}

/**
 * Pre-populated default profiles for rapid environment testing
 */
export function getInitialPresetProfiles(): FirebaseDebugProfile[] {
  const sysDefault = getDefaultSystemProfile();
  
  const stagingProfile: FirebaseDebugProfile = {
    id: 'profile-preset-staging',
    name: 'Staging Environment (Isolated DB)',
    description: 'Lingkungan Staging untuk Uji Coba Integrasi & Migrasi',
    environmentTag: 'staging',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      ...sysDefault.config,
      firestoreDatabaseId: 'db-staging-test'
    },
    sourceType: 'preset',
    sourceDetail: 'Preset Staging (Database ID: db-staging-test)'
  };

  const sandboxProfile: FirebaseDebugProfile = {
    id: 'profile-preset-sandbox',
    name: 'Sandbox / Local Demo DB',
    description: 'Lingkungan Sandbox terisolasi untuk testing fitur baru',
    environmentTag: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      ...sysDefault.config,
      firestoreDatabaseId: 'db-sandbox-demo'
    },
    sourceType: 'preset',
    sourceDetail: 'Preset Sandbox (Database ID: db-sandbox-demo)'
  };

  return [sysDefault, stagingProfile, sandboxProfile];
}

/**
 * Retrieves all saved developer debug profiles from local registry
 */
export function getDebugProfiles(): FirebaseDebugProfile[] {
  if (typeof window === 'undefined') return [getDefaultSystemProfile()];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed: FirebaseDebugProfile[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default system profile is always up-to-date with current file system
        const sysDefault = getDefaultSystemProfile();
        const existingDefaultIdx = parsed.findIndex(p => p.isDefaultSystem || p.id === 'profile-system-default');
        if (existingDefaultIdx !== -1) {
          parsed[existingDefaultIdx] = {
            ...parsed[existingDefaultIdx],
            config: sysDefault.config,
            updatedAt: new Date().toISOString()
          };
        } else {
          parsed.unshift(sysDefault);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[debugProfilesManager] Could not parse debug profiles from localStorage:', err);
  }

  // Fallback to presets
  const presets = getInitialPresetProfiles();
  saveDebugProfilesToStorage(presets);
  return presets;
}

/**
 * Saves profiles list to localStorage
 */
function saveDebugProfilesToStorage(profiles: FirebaseDebugProfile[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
  } catch (err) {
    console.error('[debugProfilesManager] Error saving debug profiles to localStorage:', err);
  }
}

/**
 * Gets currently active debug profile
 */
export function getActiveDebugProfile(): FirebaseDebugProfile {
  const profiles = getDebugProfiles();
  if (typeof window === 'undefined') return profiles[0];

  const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
  if (activeId) {
    const found = profiles.find(p => p.id === activeId);
    if (found) return found;
  }

  // Fallback to matching active config in runtime
  const activeConfig = getRemoteFirebaseConfig();
  const activeDbId = getActiveDatabaseId();

  const matched = profiles.find(p => 
    p.config.projectId === activeConfig.projectId &&
    (p.config.firestoreDatabaseId || '(default)') === (activeDbId || '(default)')
  );

  return matched || profiles[0];
}

/**
 * Adds or updates a developer debug profile
 */
export function saveDebugProfile(profile: Omit<FirebaseDebugProfile, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): FirebaseDebugProfile {
  const profiles = getDebugProfiles();
  const now = new Date().toISOString();

  const fullProfile: FirebaseDebugProfile = {
    ...profile,
    createdAt: profile.createdAt || now,
    updatedAt: now
  };

  const existingIdx = profiles.findIndex(p => p.id === fullProfile.id);
  if (existingIdx !== -1) {
    profiles[existingIdx] = fullProfile;
  } else {
    profiles.push(fullProfile);
  }

  saveDebugProfilesToStorage(profiles);
  return fullProfile;
}

/**
 * Deletes a custom debug profile (cannot delete default system profile)
 */
export function deleteDebugProfile(profileId: string): boolean {
  let profiles = getDebugProfiles();
  const target = profiles.find(p => p.id === profileId);

  if (!target || target.isDefaultSystem) {
    return false; // Cannot delete system default
  }

  profiles = profiles.filter(p => p.id !== profileId);
  saveDebugProfilesToStorage(profiles);

  // If active profile was deleted, switch back to system default
  if (typeof window !== 'undefined') {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    if (activeId === profileId) {
      activateDebugProfile('profile-system-default');
    }
  }

  return true;
}

/**
 * Switches and applies the selected Firebase debug profile into runtime
 */
export function activateDebugProfile(profileId: string): FirebaseDebugProfile {
  const profiles = getDebugProfiles();
  const profile = profiles.find(p => p.id === profileId) || profiles[0];

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, profile.id);

    // Apply configuration into runtime
    if (profile.isDefaultSystem) {
      // Clear custom config overrides so app fetches live public JSON / bundled config
      localStorage.removeItem('custom_firebase_config');
      localStorage.removeItem('active_firestore_database_id');
      document.cookie = "edusync_custom_firebase_config=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "edusync_active_firestore_database_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    } else {
      saveCustomFirebaseConfig(profile.config);
      if (profile.config.firestoreDatabaseId) {
        switchFirestoreDatabase(profile.config.firestoreDatabaseId);
      }
    }

    // Dispatch custom event to notify all listeners in application
    window.dispatchEvent(new CustomEvent('firebase-debug-profile-switched', {
      detail: { profile }
    }));
  }

  console.log(`[debugProfilesManager] Activated Firebase profile: "${profile.name}" (Project: ${profile.config.projectId}, Database ID: ${profile.config.firestoreDatabaseId})`);
  return profile;
}

/**
 * Resets active profile to original system default
 */
export function resetToSystemDefaultProfile(): FirebaseDebugProfile {
  return activateDebugProfile('profile-system-default');
}

/**
 * Validates and parses raw JSON string into a valid FirebaseConfigType
 */
export function validateAndParseFirebaseConfigJson(jsonStr: string): { valid: boolean; config?: FirebaseConfigType; error?: string } {
  try {
    const cleaned = jsonStr.trim();
    if (!cleaned) {
      return { valid: false, error: 'String JSON tidak boleh kosong.' };
    }

    const data = JSON.parse(cleaned);

    // Extract properties (supports both direct JSON or JS object export format)
    const projectId = data.projectId || data.project_id;
    const apiKey = data.apiKey || data.api_key;

    if (!projectId || typeof projectId !== 'string') {
      return { valid: false, error: 'Field "projectId" wajib ada dan berjenis string.' };
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'Field "apiKey" wajib ada dan berjenis string.' };
    }

    const config: FirebaseConfigType = {
      projectId: projectId.trim(),
      apiKey: apiKey.trim(),
      authDomain: data.authDomain || `${projectId}.firebaseapp.com`,
      appId: data.appId || '',
      firestoreDatabaseId: data.firestoreDatabaseId || data.databaseId || '(default)',
      storageBucket: data.storageBucket || `${projectId}.appspot.com`,
      messagingSenderId: data.messagingSenderId || '',
      measurementId: data.measurementId || '',
      recaptchaSiteKey: data.recaptchaSiteKey || ''
    };

    return { valid: true, config };
  } catch (err: any) {
    return { valid: false, error: 'Format JSON tidak valid: ' + (err?.message || err) };
  }
}

/**
 * Fetches remote firebase-applet-config.json from URL source
 */
export async function fetchRemoteConfigProfileFromUrl(url: string): Promise<{ success: boolean; config?: FirebaseConfigType; error?: string }> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      return { success: false, error: `Server merespon dengan status HTTP ${response.status} (${response.statusText})` };
    }

    const text = await response.text();
    const result = validateAndParseFirebaseConfigJson(text);

    if (!result.valid || !result.config) {
      return { success: false, error: result.error || 'Konten dari URL bukan konfigurasi Firebase yang valid.' };
    }

    return { success: true, config: result.config };
  } catch (err: any) {
    return { success: false, error: 'Gagal mengambil data dari URL: ' + (err?.message || err) };
  }
}

/**
 * Exports debug profiles bundle as JSON string
 */
export function exportProfilesBundleJson(): string {
  const profiles = getDebugProfiles();
  const exportPayload = {
    app: 'EduSync-Firebase-Debug-Profiles',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    profiles: profiles.filter(p => !p.isDefaultSystem) // Exclude system default
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Imports profiles bundle from JSON string
 */
export function importProfilesBundleJson(jsonStr: string): { importedCount: number; error?: string } {
  try {
    const data = JSON.parse(jsonStr);
    const profilesList = Array.isArray(data) ? data : data.profiles;

    if (!Array.isArray(profilesList)) {
      return { importedCount: 0, error: 'Format file tidak memiliki array "profiles" yang valid.' };
    }

    let count = 0;
    for (const item of profilesList) {
      if (item && item.config && item.config.projectId && item.config.apiKey) {
        saveDebugProfile({
          id: item.id || `profile-imported-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: item.name || `Imported (${item.config.projectId})`,
          description: item.description || 'Profil diimpor dari berkas JSON',
          environmentTag: item.environmentTag || 'custom',
          config: {
            projectId: item.config.projectId,
            apiKey: item.config.apiKey,
            authDomain: item.config.authDomain || `${item.config.projectId}.firebaseapp.com`,
            appId: item.config.appId || '',
            firestoreDatabaseId: item.config.firestoreDatabaseId || '(default)',
            storageBucket: item.config.storageBucket || `${item.config.projectId}.appspot.com`,
            messagingSenderId: item.config.messagingSenderId || '',
            measurementId: item.config.measurementId || '',
            recaptchaSiteKey: item.config.recaptchaSiteKey || ''
          },
          sourceType: 'uploaded_file',
          sourceDetail: 'Impor Berkas Bundel'
        });
        count++;
      }
    }

    return { importedCount: count };
  } catch (err: any) {
    return { importedCount: 0, error: 'Gagal memproses file bundle: ' + (err?.message || err) };
  }
}
