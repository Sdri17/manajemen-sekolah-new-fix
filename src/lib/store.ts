import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { syncDocToFirebase, deleteDocFromFirebase, purgeAllFirebaseData, dispatchDeltaUpdate } from './firebaseSync';
import { logAuditEvent } from './auditLogger';

export * from '../models';
import {
  Student,
  Grade,
  StudentTask,
  Attendance,
  AppUser,
  CustomHoliday,
  RosterItem,
  PiketItem,
  JurnalEntry,
  KasActivityLog,
  KasEntry,
  RaporCapaian,
  BreakTimeConfig,
  Settings,
  defaultSettings,
  normalizeStudentHelper
} from '../models';

let isNotificationPaused = false;
let isSyncQueuePaused = false;

export const pauseNotifications = (_paused?: boolean) => {
  isNotificationPaused = true;
};

export const resumeNotifications = (triggerNow = true) => {
  isNotificationPaused = false;
  if (triggerNow && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-changed'));
    window.dispatchEvent(new Event('sync-status-changed'));
  }
};

export const pauseSyncQueue = () => {
  isSyncQueuePaused = true;
};

export const resumeSyncQueue = () => {
  isSyncQueuePaused = false;
};

// Global config for localforage driver order
try {
  localforage.config({
    name: 'ClassApp',
    driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE]
  });
} catch (e) {}

// Fallback in-memory storage + localStorage wrapper when IndexedDB fails or driver dbInfo is null
const memoryCache: Record<string, Map<string, any>> = {};

function getMemoryStore(storeName: string): Map<string, any> {
  if (!memoryCache[storeName]) {
    memoryCache[storeName] = new Map();
  }
  return memoryCache[storeName];
}

function fallbackGetItem(storeName: string, key: string): any {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const lsKey = `ClassApp_${storeName}_${key}`;
      const raw = localStorage.getItem(lsKey);
      if (raw !== null) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {}
  return getMemoryStore(storeName).get(key) ?? null;
}

function fallbackSetItem(storeName: string, key: string, value: any): void {
  getMemoryStore(storeName).set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const lsKey = `ClassApp_${storeName}_${key}`;
      localStorage.setItem(lsKey, JSON.stringify(value));
    }
  } catch (e) {}
}

function fallbackRemoveItem(storeName: string, key: string): void {
  getMemoryStore(storeName).delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const lsKey = `ClassApp_${storeName}_${key}`;
      localStorage.removeItem(lsKey);
    }
  } catch (e) {}
}

function fallbackClear(storeName: string): void {
  getMemoryStore(storeName).clear();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const prefix = `ClassApp_${storeName}_`;
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {}
}

function fallbackKeys(storeName: string): string[] {
  const keysSet = new Set<string>(getMemoryStore(storeName).keys());
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const prefix = `ClassApp_${storeName}_`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysSet.add(k.substring(prefix.length));
        }
      }
    }
  } catch (e) {}
  return Array.from(keysSet);
}

let forceLocalStorage = false;
const instances: Record<string, LocalForage> = {};

export function getStoreInstance(storeName: string): LocalForage {
  if (!instances[storeName] || (instances[storeName] as any)?._dbInfo === null) {
    try {
      if (forceLocalStorage) {
        instances[storeName] = localforage.createInstance({
          name: 'ClassApp',
          storeName,
          driver: localforage.LOCALSTORAGE
        });
      } else {
        instances[storeName] = localforage.createInstance({
          name: 'ClassApp',
          storeName,
          driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE]
        });
      }
    } catch (e) {
      forceLocalStorage = true;
      instances[storeName] = localforage.createInstance({
        name: 'ClassApp',
        storeName,
        driver: localforage.LOCALSTORAGE
      });
    }
  }
  return instances[storeName];
}

export function recreateStoreInstance(storeName: string): LocalForage {
  forceLocalStorage = true;
  try {
    instances[storeName] = localforage.createInstance({
      name: 'ClassApp',
      storeName,
      driver: localforage.LOCALSTORAGE
    });
  } catch (e) {
    instances[storeName] = localforage.createInstance({
      name: `ClassApp_${Date.now()}`,
      storeName,
      driver: localforage.LOCALSTORAGE
    });
  }
  return instances[storeName];
}

export function resetStoreInstances() {
  for (const key of Object.keys(instances)) {
    delete instances[key];
  }
}

async function safeExec<T>(
  storeName: string,
  fn: (inst: LocalForage) => Promise<T>,
  fallbackFn: () => T | Promise<T>
): Promise<T> {
  try {
    const inst = getStoreInstance(storeName);
    return await fn(inst);
  } catch (err: any) {
    console.warn(`[localforage] Store '${storeName}' operational error, switching to LOCALSTORAGE fallback:`, err?.message || err);
    try {
      const freshInst = recreateStoreInstance(storeName);
      if (typeof freshInst.ready === 'function') {
        await freshInst.ready().catch(() => {});
      }
      return await fn(freshInst);
    } catch (retryErr: any) {
      console.warn(`[localforage] Fallback engaged for store '${storeName}':`, retryErr?.message || retryErr);
      return await fallbackFn();
    }
  }
}

const wrapInstance = (storeName: string) => {
  const notify = () => {
    if (!isNotificationPaused && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
    }
  };
  return {
    getItem: async (key: string) => {
      return safeExec(
        storeName,
        async (inst) => {
          let val = await inst.getItem(key);
          if (val === null || val === undefined) {
            val = fallbackGetItem(storeName, key);
          }
          if (storeName === 'students' && val) {
            return normalizeStudentHelper(val);
          }
          return val;
        },
        async () => {
          let val = fallbackGetItem(storeName, key);
          if (storeName === 'students' && val) {
            return normalizeStudentHelper(val);
          }
          return val;
        }
      );
    },
    setItem: async <T>(key: string, value: T) => {
      let valToSet = value;
      if (storeName === 'students' && value) {
        valToSet = normalizeStudentHelper(value) as any;
      }
      if (valToSet && typeof valToSet === 'object' && !Array.isArray(valToSet)) {
        const nowIso = new Date().toISOString();
        const obj = valToSet as any;
        if (!obj.lastModified) {
          obj.lastModified = nowIso;
        }
        if (!obj.updatedAt) {
          obj.updatedAt = obj.lastModified;
        }
      }
      if (['tasks', 'jurnal'].includes(storeName) && valToSet && typeof valToSet === 'object') {
        const obj = valToSet as any;
        if (!obj.OwnerID && !obj.ownerId) {
          const currentUserId = (typeof window !== 'undefined' ? localStorage.getItem('edusync_user_id') : null) || 'system';
          obj.OwnerID = currentUserId;
          obj.ownerId = currentUserId;
        } else {
          if (!obj.OwnerID) obj.OwnerID = obj.ownerId;
          if (!obj.ownerId) obj.ownerId = obj.OwnerID;
        }
      }

      fallbackSetItem(storeName, key, valToSet);

      return safeExec(
        storeName,
        async (inst) => {
          const previousVal = await inst.getItem(key).catch(() => fallbackGetItem(storeName, key));
          const res = await inst.setItem(key, valToSet);
          if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            await store.syncQueue.setItem(`${storeName}::${key}`, 'updated').catch(() => {});
          }
          if (['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            syncDocToFirebase(storeName, key, valToSet, previousVal).catch(() => {});
            dispatchDeltaUpdate(storeName, key, 'upsert', valToSet);
          }
          if (!['auditLogs', 'syncQueue', 'syncLogs'].includes(storeName)) {
            const isCreate = !previousVal;
            const action = isCreate ? 'CREATE' : (storeName === 'settings' ? 'SETTINGS' : 'UPDATE');
            const entityMap: Record<string, string> = {
              students: 'Siswa',
              grades: 'Nilai',
              attendance: 'Absensi',
              tasks: 'Tugas',
              users: 'Pengguna',
              jurnal: 'Jurnal Kelas',
              kas: 'Kas Kelas',
              settings: 'Pengaturan Sistem',
              school_settings: 'Pengaturan Identitas Sekolah',
              holiday_config: 'Konfigurasi Hari Libur',
              roster: 'Roster Pelajaran',
              piket: 'Jadwal Piket',
              raporCapaian: 'Rapor Capaian'
            };
            const entityName = entityMap[storeName] || storeName;
            const itemIdentifier = (valToSet as any)?.nama || (valToSet as any)?.judul || (valToSet as any)?.username || (valToSet as any)?.nama_sekolah || key;
            const details = isCreate 
              ? `Menambahkan ${entityName}: "${itemIdentifier}"` 
              : `Memperbarui ${entityName}: "${itemIdentifier}"`;

            logAuditEvent({
              action,
              entity: entityName,
              entity_id: key,
              details,
              previous_value: previousVal,
              new_value: valToSet
            }).catch(() => {});
          }
          notify();
          return res;
        },
        async () => {
          if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            await store.syncQueue.setItem(`${storeName}::${key}`, 'updated').catch(() => {});
          }
          if (['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            syncDocToFirebase(storeName, key, valToSet, null).catch(() => {});
            dispatchDeltaUpdate(storeName, key, 'upsert', valToSet);
          }
          notify();
          return valToSet as any;
        }
      );
    },
    removeItem: async (key: string) => {
      const previousVal = fallbackGetItem(storeName, key);
      fallbackRemoveItem(storeName, key);

      return safeExec(
        storeName,
        async (inst) => {
          const pVal = await inst.getItem(key).catch(() => previousVal);
          await inst.removeItem(key);
          if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            await store.syncQueue.setItem(`${storeName}::${key}`, 'deleted').catch(() => {});
          }
          if (['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            deleteDocFromFirebase(storeName, key, pVal || previousVal).catch(() => {});
            dispatchDeltaUpdate(storeName, key, 'delete');
          }
          if (!['auditLogs', 'syncQueue', 'syncLogs'].includes(storeName) && (pVal || previousVal)) {
            const targetVal = pVal || previousVal;
            const entityMap: Record<string, string> = {
              students: 'Siswa',
              grades: 'Nilai',
              attendance: 'Absensi',
              tasks: 'Tugas',
              users: 'Pengguna',
              jurnal: 'Jurnal Kelas',
              kas: 'Kas Kelas',
              settings: 'Pengaturan Sistem',
              roster: 'Roster Pelajaran',
              piket: 'Jadwal Piket',
              raporCapaian: 'Rapor Capaian'
            };
            const entityName = entityMap[storeName] || storeName;
            const itemIdentifier = (targetVal as any)?.nama || (targetVal as any)?.judul || (targetVal as any)?.username || key;
            const details = `Menghapus ${entityName}: "${itemIdentifier}"`;

            logAuditEvent({
              action: 'DELETE',
              entity: entityName,
              entity_id: key,
              details,
              previous_value: targetVal,
              new_value: null
            }).catch(() => {});
          }
          notify();
        },
        async () => {
          if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            await store.syncQueue.setItem(`${storeName}::${key}`, 'deleted').catch(() => {});
          }
          if (['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
            deleteDocFromFirebase(storeName, key, previousVal).catch(() => {});
            dispatchDeltaUpdate(storeName, key, 'delete');
          }
          notify();
        }
      );
    },
    clear: async () => {
      fallbackClear(storeName);
      return safeExec(
        storeName,
        async (inst) => {
          const existingKeys: string[] = [];
          try {
            await inst.iterate((_, key) => {
              if (key) existingKeys.push(key);
            });
          } catch (e) {}

          await inst.clear();
          if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs'].includes(storeName)) {
            try {
              const keys = await store.syncQueue.keys();
              for (const k of keys) {
                if (k.startsWith(`${storeName}::`)) {
                  await store.syncQueue.removeItem(k);
                }
              }
              for (const k of existingKeys) {
                await store.syncQueue.setItem(`${storeName}::${k}`, 'deleted').catch(() => {});
              }
            } catch (e) {}
          }
          notify();
        },
        async () => {
          notify();
        }
      );
    },
    iterate: async <T, U>(iterator: (value: T, key: string, iterationNumber: number) => U) => {
      return safeExec(
        storeName,
        async (inst) => {
          let itemCount = 0;
          return inst.iterate<any, any>((value, key, iterationNumber) => {
            let valToPass = value;
            if (storeName === 'students' && value) {
              valToPass = normalizeStudentHelper(value);
            }
            const res = iterator(valToPass, key, iterationNumber);
            itemCount++;
            if (res !== undefined && !(res instanceof Promise)) {
              return res;
            }
            return undefined;
          });
        },
        async () => {
          const keys = fallbackKeys(storeName);
          let res: any;
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            let val = fallbackGetItem(storeName, key);
            if (storeName === 'students' && val) {
              val = normalizeStudentHelper(val);
            }
            res = iterator(val, key, i + 1);
            if (res !== undefined && !(res instanceof Promise)) break;
          }
          return res;
        }
      );
    },
    length: async () => {
      return safeExec(
        storeName,
        async (inst) => {
          const len = await inst.length();
          return len > 0 ? len : fallbackKeys(storeName).length;
        },
        async () => fallbackKeys(storeName).length
      );
    },
    key: async (n: number) => {
      return safeExec(
        storeName,
        async (inst) => {
          const k = await inst.key(n);
          if (k !== null) return k;
          const fk = fallbackKeys(storeName);
          return fk[n] ?? null;
        },
        async () => {
          const fk = fallbackKeys(storeName);
          return fk[n] ?? null;
        }
      );
    },
    keys: async () => {
      return safeExec(
        storeName,
        async (inst) => {
          const instKeys = await inst.keys();
          if (instKeys && instKeys.length > 0) return instKeys;
          return fallbackKeys(storeName);
        },
        async () => fallbackKeys(storeName)
      );
    },
    dropInstance: async (options?: any) => {
      fallbackClear(storeName);
      return safeExec(
        storeName,
        async (inst) => {
          if (typeof inst.clear === 'function') {
            await inst.clear().catch(() => {});
          }
        },
        async () => {}
      );
    },
  } as LocalForage;
};

export const store = {
  students: wrapInstance('students'),
  grades: wrapInstance('grades'),
  attendance: wrapInstance('attendance'),
  tasks: wrapInstance('tasks'),
  settings: wrapInstance('settings'),
  school_settings: wrapInstance('school_settings'),
  holiday_config: wrapInstance('holiday_config'),
  users: wrapInstance('users'),
  roster: wrapInstance('roster'),
  piket: wrapInstance('piket'),
  raporCapaian: wrapInstance('raporCapaian'),
  jurnal: wrapInstance('jurnal'),
  kas: wrapInstance('kas'),
  kasLogs: wrapInstance('kasLogs'),
  syncQueue: wrapInstance('syncQueue'),
  syncLogs: wrapInstance('syncLogs'),
  auditLogs: wrapInstance('auditLogs'),
  documentLocks: wrapInstance('documentLocks'),
};

// Initializer
export const initializeStore = async () => {
  const currentSettings = await store.settings.getItem<Settings>('app_settings');
  if (!currentSettings) {
    await store.settings.setItem('app_settings', defaultSettings);
  } else {
    let updated = false;
    if (!currentSettings.catatan_wali_kelas_templates || currentSettings.catatan_wali_kelas_templates.length === 0) {
      currentSettings.catatan_wali_kelas_templates = defaultSettings.catatan_wali_kelas_templates;
      updated = true;
    }
    if (!currentSettings.capaian_kompetensi_templates || currentSettings.capaian_kompetensi_templates.length === 0) {
      currentSettings.capaian_kompetensi_templates = defaultSettings.capaian_kompetensi_templates;
      updated = true;
    }
    if (!currentSettings.mata_pelajaran || currentSettings.mata_pelajaran.length === 0) {
      currentSettings.mata_pelajaran = defaultSettings.mata_pelajaran;
      currentSettings.pilihan_mata_pelajaran = defaultSettings.pilihan_mata_pelajaran;
      updated = true;
    }
    if (updated) {
      await store.settings.setItem('app_settings', currentSettings);
    }
  }
};

export const getSubjectKKM = (subject: string, settings: Settings | null, fallbackKkm?: number): number => {
  if (!settings) return fallbackKkm ?? 75;
  if (settings.kkm_mode === 'per_mapel' && settings.kkm_per_mapel && typeof settings.kkm_per_mapel[subject] === 'number') {
    return settings.kkm_per_mapel[subject];
  }
  return fallbackKkm ?? settings.kkm_bulanan ?? 75;
};

export const resetDatabase = async (preserveSettings: boolean = false) => {
  pauseSyncQueue();
  pauseNotifications(true);

  let fbResult = { success: true, totalDeleted: 0, message: '' };

  // Purge Cloud Firestore Database completely first
  try {
    fbResult = await purgeAllFirebaseData();
  } catch (fbErr: any) {
    console.warn('[resetDatabase] Error purging Cloud Firestore during reset:', fbErr);
    fbResult = { success: false, totalDeleted: 0, message: fbErr?.message || String(fbErr) };
  }

  const storeNames = [
    'students',
    'grades',
    'attendance',
    'tasks',
    'roster',
    'piket',
    'raporCapaian',
    'jurnal',
    'kas',
    'kasLogs',
    'users',
    'syncQueue',
    'syncLogs',
    'settings'
  ];

  // 1. Parallel high-speed clear of all IndexedDB store instances using native clear()
  const clearPromises = Object.entries(store).map(async ([key, storeInstance]) => {
    if (preserveSettings && key === 'settings') return;
    try {
      if (storeInstance && typeof storeInstance.clear === 'function') {
        await storeInstance.clear().catch(() => {});
      }
    } catch (e) {
      console.warn(`Error clearing store ${key}:`, e);
    }
  });

  // 2. Clear localforage fallback memory instances in parallel
  const fallbackPromises = storeNames.map(async (sName) => {
    if (preserveSettings && sName === 'settings') return;
    try {
      fallbackClear(sName);
      const inst = getStoreInstance(sName);
      if (inst && typeof inst.clear === 'function') {
        await inst.clear().catch(() => {});
      }
    } catch (e) {}
  });

  await Promise.all([...clearPromises, ...fallbackPromises]);

  // 3. Delete IndexedDB database ClassApp directly
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      window.indexedDB.deleteDatabase('ClassApp');
    }
  } catch (e) {
    console.warn('Error deleting IndexedDB ClassApp:', e);
  }
  resetStoreInstances();

  // 4. Clear browser storage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {}

  // 5. Re-initialize default clean settings if settings are reset
  if (!preserveSettings) {
    const cleanSettings: Settings = {
      ...defaultSettings
    };
    await store.settings.setItem('app_settings', cleanSettings);
    await store.settings.setItem('current', cleanSettings);
  }

  // 6. Ensure default admin user exists
  await store.users.setItem('admin', { 
    id: 'admin', 
    username: 'admin', 
    password: 'admin', 
    role: 'admin', 
    name: 'Administrator Utama',
    assignedKelas: 'Semua',
    assignedMapel: 'Semua',
    canManageUsers: true,
    canEditSettings: true,
    canExportData: true,
    pertanyaan_keamanan: 'Nama SD Pertama Anda?',
    jawaban_keamanan: 'sd',
    email_pemulihan: 'admin@edusync.id'
  });

  resumeSyncQueue();
  resumeNotifications(false);

  return fbResult;
};

export const clearEntireDatabase = async (resetSettings: boolean = true) => {
  return await resetDatabase(!resetSettings);
};

