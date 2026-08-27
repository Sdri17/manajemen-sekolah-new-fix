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

const instances: Record<string, LocalForage> = {};

export function getStoreInstance(storeName: string): LocalForage {
  if (!instances[storeName]) {
    instances[storeName] = localforage.createInstance({ name: 'ClassApp', storeName });
  }
  return instances[storeName];
}

export function recreateStoreInstance(storeName: string): LocalForage {
  instances[storeName] = localforage.createInstance({ name: 'ClassApp', storeName });
  return instances[storeName];
}

export function resetStoreInstances() {
  for (const key of Object.keys(instances)) {
    delete instances[key];
  }
}

async function safeExec<T>(storeName: string, fn: (inst: LocalForage) => Promise<T>, fallback: T): Promise<T> {
  try {
    const inst = getStoreInstance(storeName);
    return await fn(inst);
  } catch (err: any) {
    console.warn(`[localforage] Error on store '${storeName}', recreating instance:`, err);
    try {
      const freshInst = recreateStoreInstance(storeName);
      if (typeof freshInst.ready === 'function') {
        await freshInst.ready().catch(() => {});
      }
      return await fn(freshInst);
    } catch (retryErr) {
      console.error(`[localforage] Retry failed on store '${storeName}':`, retryErr);
      return fallback;
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
      return safeExec(storeName, async (inst) => {
        const val = await inst.getItem(key);
        if (storeName === 'students' && val) {
          return normalizeStudentHelper(val);
        }
        return val;
      }, null);
    },
    setItem: async <T>(key: string, value: T) => {
      return safeExec(storeName, async (inst) => {
        const previousVal = await inst.getItem(key).catch(() => null);
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
      }, value);
    },
    removeItem: async (key: string) => {
      return safeExec(storeName, async (inst) => {
        const previousVal = await inst.getItem(key).catch(() => null);
        await inst.removeItem(key);
        if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
          await store.syncQueue.setItem(`${storeName}::${key}`, 'deleted').catch(() => {});
        }
        if (['students', 'grades', 'attendance', 'roster', 'piket', 'tasks', 'raporCapaian', 'users', 'jurnal', 'kas', 'kasLogs', 'settings', 'school_settings', 'holiday_config'].includes(storeName)) {
          deleteDocFromFirebase(storeName, key, previousVal).catch(() => {});
          dispatchDeltaUpdate(storeName, key, 'delete');
        }
        if (!['auditLogs', 'syncQueue', 'syncLogs'].includes(storeName) && previousVal) {
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
          const itemIdentifier = (previousVal as any)?.nama || (previousVal as any)?.judul || (previousVal as any)?.username || key;
          const details = `Menghapus ${entityName}: "${itemIdentifier}"`;

          logAuditEvent({
            action: 'DELETE',
            entity: entityName,
            entity_id: key,
            details,
            previous_value: previousVal,
            new_value: null
          }).catch(() => {});
        }
        notify();
      }, undefined);
    },
    clear: async () => {
      return safeExec(storeName, async (inst) => {
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
      }, undefined);
    },
    iterate: async <T, U>(iterator: (value: T, key: string, iterationNumber: number) => U) => {
      return safeExec(storeName, async (inst) => {
        let itemCount = 0;
        return inst.iterate<any, any>(async (value, key, iterationNumber) => {
          let valToPass = value;
          if (storeName === 'students' && value) {
            valToPass = normalizeStudentHelper(value);
          }
          const res = iterator(valToPass, key, iterationNumber);
          itemCount++;
          if (itemCount % 500 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          return res;
        });
      }, undefined as any);
    },
    length: async () => {
      return safeExec(storeName, async (inst) => inst.length(), 0);
    },
    key: async (n: number) => {
      return safeExec(storeName, async (inst) => inst.key(n), null);
    },
    keys: async () => {
      return safeExec(storeName, async (inst) => inst.keys(), [] as string[]);
    },
    dropInstance: async (options?: any) => {
      return safeExec(storeName, async (inst) => {
        if (typeof inst.dropInstance === 'function') {
          return inst.dropInstance(options);
        }
      }, undefined);
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

  // 1. Iterate through wrapped store instances in store object and execute clear() & remove all keys
  for (const [key, storeInstance] of Object.entries(store)) {
    if (preserveSettings && key === 'settings') continue;
    try {
      if (storeInstance) {
        if (typeof storeInstance.keys === 'function') {
          const keys = await storeInstance.keys();
          for (const k of keys) {
            await storeInstance.removeItem(k).catch(() => {});
          }
        }
        if (typeof storeInstance.clear === 'function') {
          await storeInstance.clear().catch(() => {});
        }
      }
    } catch (e) {
      console.warn(`Error clearing store ${key}:`, e);
    }
  }

  // 2. Clear & Drop raw LocalForage store instances for ClassApp database
  for (const sName of storeNames) {
    if (preserveSettings && sName === 'settings') continue;
    try {
      const inst = localforage.createInstance({ name: 'ClassApp', storeName: sName });
      await inst.clear().catch(() => {});
      await inst.dropInstance().catch(() => {});
    } catch (e) {}
  }

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

