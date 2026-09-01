import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { store, SchoolSettings, Settings, Student } from '../lib/store';
import { db } from '../lib/firebase';
import { getTenantCollectionName } from '../lib/firebaseSync';
import { collection, query, where, getDocs, getDocsFromServer, onSnapshot, Unsubscribe, DocumentData } from 'firebase/firestore';

export const defaultSchoolSettings: SchoolSettings = {
  id: 'global',
  nama_sekolah: 'SD NEGERI 091473 P. SIANTAR',
  npsn: '10200123',
  alamat: 'Jl. Merdeka No. 45, Kota Pematang Siantar',
  kota_kabupaten: 'Pematang Siantar',
  provinsi: 'Sumatera Utara',
  telepon: '(0622) 234567',
  email: 'sdn091473@sch.id',
  website: 'https://sdn091473.sch.id',
  nama_kepala_sekolah: 'Bpk. Headmaster, S.Pd., M.M.',
  nip_kepala_sekolah: '19750101 200003 1 001',
  kop_pemerintah: 'PEMERINTAH KOTA PEMATANG SIANTAR',
  kop_dinas: 'DINAS PENDIDIKAN DAN KEBUDAYAAN',
  kop_logo_type: 'tutwuri',
  logo_url: '',
  kop_logo_base64: '',
  tahun_ajaran_aktif: '2025/2026',
  semester_aktif: 'Ganjil'
};

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Robust helper executing Firestore `where` queries with Exponential Backoff retry strategy.
 * If network issues or transient errors occur, it retries with increasing delay up to `maxRetries`.
 * If all retries fail, it falls back to local IndexedDB store matching records seamlessly.
 */
export async function executeFirestoreWhereQueryWithRetry<T = any>(
  collectionName: string,
  fieldName: string,
  value: any,
  options: RetryOptions = {}
): Promise<T[]> {
  const {
    maxRetries = 4,
    initialDelayMs = 400,
    maxDelayMs = 4000,
    backoffFactor = 2
  } = options;

  const tenantColName = getTenantCollectionName(collectionName);
  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    try {
      const colRef = collection(db, tenantColName);
      const q = query(colRef, where(fieldName, '==', value));
      const snap = await getDocsFromServer(q).catch(() => getDocs(q));

      const results: T[] = [];
      if (snap && !snap.empty) {
        snap.docs.forEach((d) => {
          results.push({ id: d.id, ...d.data() } as T);
        });
      }
      return results;
    } catch (err: any) {
      lastError = err;
      attempt++;
      if (attempt > maxRetries) {
        console.warn(`[SchoolProvider] Firestore where query '${tenantColName}' (${fieldName} == ${value}) failed after ${maxRetries} retries:`, err);
        break;
      }
      const delay = Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200);
      console.log(`[SchoolProvider Retry] Query '${tenantColName}' failed (Attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  // Fallback to local IndexedDB store if remote query failed completely
  try {
    const storeInstance = (store as any)[collectionName] || (store as any).students;
    if (storeInstance) {
      const localResults: T[] = [];
      await storeInstance.iterate((val: any) => {
        if (val && String(val[fieldName] || '').trim().toLowerCase() === String(value).trim().toLowerCase()) {
          localResults.push(val as T);
        }
      });
      return localResults;
    }
  } catch (localErr) {
    console.warn(`[SchoolProvider] Local fallback for '${collectionName}' also failed:`, localErr);
  }

  return [];
}

export type FirestoreStreamStatus = 'IDLE' | 'CONNECTING' | 'ACTIVE' | 'ERROR';

interface SchoolContextType {
  schoolInfo: SchoolSettings;
  updateSchoolInfo: (updates: Partial<SchoolSettings>) => Promise<void>;
  isLoading: boolean;
  refreshSchoolInfo: () => Promise<void>;
  executeFirestoreWhereQueryWithRetry: <T = any>(
    collectionName: string,
    fieldName: string,
    value: any,
    options?: RetryOptions
  ) => Promise<T[]>;
  fetchClassFilteredRecordsWithRetry: <T = any>(
    collectionName: string,
    classId: string,
    options?: RetryOptions
  ) => Promise<T[]>;
  streamStatus: FirestoreStreamStatus;
  lastStreamUpdate: Date | null;
  subscribeToStudentRecordsStream: (assignedClasses: string[]) => () => void;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(defaultSchoolSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [streamStatus, setStreamStatus] = useState<FirestoreStreamStatus>('IDLE');
  const [lastStreamUpdate, setLastStreamUpdate] = useState<Date | null>(null);

  const activeUnsubscribersRef = useRef<Unsubscribe[]>([]);

  const fetchClassFilteredRecordsWithRetry = useCallback(async <T = any>(
    collectionName: string,
    classId: string,
    options?: RetryOptions
  ): Promise<T[]> => {
    return await executeFirestoreWhereQueryWithRetry<T>(collectionName, 'kelas', classId, options);
  }, []);

  /**
   * Listener-based 'Firestore Subscription Manager' that attaches real-time snapshot listeners
   * to student records filtered by assigned classes. Replaces polling/manual sync with stream updates.
   */
  const subscribeToStudentRecordsStream = useCallback((assignedClasses: string[]) => {
    // Clean up existing listeners
    activeUnsubscribersRef.current.forEach(unsub => unsub());
    activeUnsubscribersRef.current = [];

    setStreamStatus('CONNECTING');
    const tenantColName = getTenantCollectionName('students');
    const colRef = collection(db, tenantColName);

    const isUnrestricted = assignedClasses.includes('*') || assignedClasses.length === 0;

    try {
      const q = isUnrestricted
        ? query(colRef)
        : assignedClasses.length <= 10
        ? query(colRef, where('kelas', 'in', assignedClasses))
        : query(colRef); // Firestore 'in' query limit is 10, fallback to full stream if >10

      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          setStreamStatus('ACTIVE');
          setLastStreamUpdate(new Date());

          let updateCount = 0;
          for (const change of snapshot.docChanges()) {
            const data = change.doc.data() as Student;
            const docId = change.doc.id;

            if (change.type === 'added' || change.type === 'modified') {
              await store.students.setItem(docId, { id: docId, ...data }).catch(() => {});
              updateCount++;
            } else if (change.type === 'removed') {
              await store.students.removeItem(docId).catch(() => {});
              updateCount++;
            }
          }

          if (updateCount > 0) {
            console.log(`[Firestore Subscription Manager] Stream update received (${updateCount} changes)`);
            window.dispatchEvent(new CustomEvent('delta-data-changed', { detail: { storeName: 'students' } }));
          }
        },
        (error) => {
          console.warn('[Firestore Subscription Manager] Stream listener error:', error);
          setStreamStatus('ERROR');
        }
      );

      activeUnsubscribersRef.current.push(unsubscribe);

      return () => {
        unsubscribe();
        setStreamStatus('IDLE');
      };
    } catch (err) {
      console.warn('[Firestore Subscription Manager] Failed to attach stream listener:', err);
      setStreamStatus('ERROR');
      return () => {};
    }
  }, []);

  const refreshSchoolInfo = useCallback(async () => {
    try {
      let saved = await store.school_settings.getItem<SchoolSettings>('global');
      if (!saved) {
        const appSet = await store.settings.getItem<Settings>('app_settings');
        if (appSet && appSet.nama_sekolah) {
          saved = {
            id: 'global',
            nama_sekolah: appSet.nama_sekolah || defaultSchoolSettings.nama_sekolah,
            npsn: appSet.npsn || defaultSchoolSettings.npsn,
            alamat: appSet.alamat || defaultSchoolSettings.alamat,
            email: appSet.email || defaultSchoolSettings.email,
            nama_kepala_sekolah: appSet.nama_kepala_sekolah || defaultSchoolSettings.nama_kepala_sekolah,
            nip_kepala_sekolah: appSet.nip_kepala_sekolah || defaultSchoolSettings.nip_kepala_sekolah,
            kop_pemerintah: appSet.kop_pemerintah || defaultSchoolSettings.kop_pemerintah,
            kop_dinas: appSet.kop_dinas || defaultSchoolSettings.kop_dinas,
            kop_logo_type: appSet.kop_logo_type || 'tutwuri',
            kop_logo_base64: appSet.kop_logo_base64 || '',
            tahun_ajaran_aktif: '2025/2026',
            semester_aktif: 'Ganjil'
          };
          await store.school_settings.setItem('global', saved).catch(() => {});
        } else {
          saved = defaultSchoolSettings;
          await store.school_settings.setItem('global', defaultSchoolSettings).catch(() => {});
        }
      }
      setSchoolInfo(saved);
    } catch (err) {
      console.warn('[SchoolContext] Failed to load school settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSchoolInfo = useCallback(async (updates: Partial<SchoolSettings>) => {
    const updated: SchoolSettings = {
      ...schoolInfo,
      ...updates,
      id: 'global',
      lastModified: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setSchoolInfo(updated);
    await store.school_settings.setItem('global', updated);

    const currentSet = await store.settings.getItem<Settings>('app_settings') || {} as any;
    await store.settings.setItem('app_settings', {
      ...currentSet,
      nama_sekolah: updated.nama_sekolah,
      npsn: updated.npsn,
      alamat: updated.alamat,
      email: updated.email,
      nama_kepala_sekolah: updated.nama_kepala_sekolah,
      nip_kepala_sekolah: updated.nip_kepala_sekolah,
      kop_pemerintah: updated.kop_pemerintah,
      kop_dinas: updated.kop_dinas,
      kop_logo_type: updated.kop_logo_type,
      kop_logo_base64: updated.kop_logo_base64
    });
  }, [schoolInfo]);

  useEffect(() => {
    refreshSchoolInfo();

    const handleDataChange = (evt?: any) => {
      if (!evt?.detail?.storeName || evt.detail.storeName === 'school_settings' || evt.detail.storeName === 'settings') {
        refreshSchoolInfo();
      }
    };

    window.addEventListener('data-changed', handleDataChange);
    window.addEventListener('delta-data-changed', handleDataChange);
    window.addEventListener('sync-status-changed', handleDataChange);

    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      window.removeEventListener('delta-data-changed', handleDataChange);
      window.removeEventListener('sync-status-changed', handleDataChange);
      activeUnsubscribersRef.current.forEach(u => u());
    };
  }, [refreshSchoolInfo]);

  return (
    <SchoolContext.Provider 
      value={{ 
        schoolInfo, 
        updateSchoolInfo, 
        isLoading, 
        refreshSchoolInfo,
        executeFirestoreWhereQueryWithRetry,
        fetchClassFilteredRecordsWithRetry,
        streamStatus,
        lastStreamUpdate,
        subscribeToStudentRecordsStream
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};
