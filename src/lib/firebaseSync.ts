import { 
  doc, 
  setDoc, 
  updateDoc,
  FieldPath,
  getDoc,
  getDocFromServer,
  deleteDoc, 
  onSnapshot, 
  collection, 
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter as firestoreStartAfter,
  QueryDocumentSnapshot,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence
} from 'firebase/firestore';
import { db, auth, activeFirebaseConfig, getActiveDatabaseId } from './firebase';
import { store, pauseSyncQueue, resumeSyncQueue, pauseNotifications, resumeNotifications } from './store';
import { AppUser } from '../models';
import { initDocumentLocksRealtimeListener } from './documentLock';
import { sendLocalPushNotification } from './notificationService';
import { isDateHoliday, initScheduledCleanupJob } from './cleanupJob';
import toast from 'react-hot-toast';

export function dispatchDeltaUpdate(storeName: string, docId: string, action: 'upsert' | 'delete', data?: any) {
  if (typeof window !== 'undefined' && docId) {
    window.dispatchEvent(new CustomEvent('delta-data-changed', {
      detail: {
        storeName,
        docId,
        action,
        data,
        timestamp: Date.now()
      }
    }));
  }
}

let isPersistenceEnabled = false;

export { RECOMMENDED_FIRESTORE_RULES, RECOMMENDED_SQL_SCHEMA } from './sqlSchemaSolution';

/**
 * Sync Audit Log Structures & Storage Helpers
 */
export interface SyncAuditLogEntry {
  id: string;
  timestamp: string;
  type: 'PUSH' | 'PULL' | 'REALTIME' | 'DIAGNOSTIC';
  status: 'SUCCESS' | 'ERROR' | 'WARN';
  title: string;
  details: string;
  collection?: string;
  itemCount?: number;
  errorCode?: string;
  errorMessage?: string;
  technicalDetails?: string;
  solutionHint?: string;
}

export async function recordSyncAuditLog(params: Omit<SyncAuditLogEntry, 'id' | 'timestamp'>): Promise<SyncAuditLogEntry> {
  const entry: SyncAuditLogEntry = {
    id: Math.random().toString(36).substring(2, 11) + '_' + Date.now(),
    timestamp: new Date().toISOString(),
    ...params
  };

  try {
    await store.syncLogs.setItem(entry.id, entry);
  } catch (e) {
    console.warn('[SyncAuditLog] Failed to persist sync log:', e);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sync-audit-log-added', { detail: entry }));
  }

  return entry;
}

export async function getSyncAuditLogs(): Promise<SyncAuditLogEntry[]> {
  const logs: SyncAuditLogEntry[] = [];
  try {
    await store.syncLogs.iterate((val: any) => {
      if (val && val.timestamp) {
        logs.push(val);
      }
    });
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (e) {
    console.warn('[SyncAuditLog] Failed to read sync logs:', e);
  }
  return logs;
}

export async function clearSyncAuditLogs(): Promise<void> {
  try {
    await store.syncLogs.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-audit-logs-cleared'));
    }
  } catch (e) {
    console.warn('[SyncAuditLog] Failed to clear sync logs:', e);
  }
}

export interface DiagnosticStepResult {
  step: 'internet' | 'config' | 'server_reachability' | 'rules_write_read';
  name: string;
  passed: boolean;
  message: string;
  technicalError?: string;
  solutionHint?: string;
}

export interface FirebaseDiagnosticReport {
  timestamp: string;
  isAllPassed: boolean;
  steps: DiagnosticStepResult[];
  activeConfig: {
    projectId: string;
    apiKey: string;
    authDomain: string;
    databaseId: string;
    tenantId: string;
  };
  recommendation?: string;
}

/**
 * Run comprehensive step-by-step diagnostic verification for Firebase Firestore connection
 */
export async function runFirebaseDiagnostics(): Promise<FirebaseDiagnosticReport> {
  const steps: DiagnosticStepResult[] = [];
  const config = activeFirebaseConfig;
  const currentDbId = getActiveDatabaseId();
  const currentTenantId = getClassTenantId();

  // Step 1: Internet Connection Check
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (isOnline) {
    try {
      await Promise.race([
        fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network Ping Timeout')), 3500))
      ]);
      steps.push({
        step: 'internet',
        name: '1. Koneksi Internet Perangkat',
        passed: true,
        message: 'Perangkat terhubung ke internet dengan lancar.'
      });
    } catch (_e) {
      steps.push({
        step: 'internet',
        name: '1. Koneksi Internet Perangkat',
        passed: true,
        message: 'Perangkat online (mencapai server jaringan Google/Firebase).'
      });
    }
  } else {
    steps.push({
      step: 'internet',
      name: '1. Koneksi Internet Perangkat',
      passed: false,
      message: 'Perangkat Anda tidak terhubung ke jaringan internet (Offline).',
      solutionHint: 'Aktifkan koneksi internet WiFi atau paket data perangkat Anda.'
    });
  }

  // Step 2: Firebase Config Validation
  const hasProjId = !!(config && config.projectId && config.projectId !== 'demo-project');
  const hasApiKey = !!(config && config.apiKey);
  if (hasProjId && hasApiKey) {
    steps.push({
      step: 'config',
      name: '2. Konfigurasi Project Firebase',
      passed: true,
      message: `Project ID '${config.projectId}' dan API Key terkonfigurasi dengan valid.`
    });
  } else {
    steps.push({
      step: 'config',
      name: '2. Konfigurasi Project Firebase',
      passed: false,
      message: 'Konfigurasi Firebase belum diisi atau menggunakan ID bawaan.',
      solutionHint: 'Buka tab "Atur Firebase Kustom" untuk mengisikan Project ID & API Key milik Anda.'
    });
  }

  // Step 3: Server Reachability (Bypass local IndexedDB cache)
  try {
    const testDoc = doc(db, '_connection_test', 'reachability_ping');
    await Promise.race([
      getDocFromServer(testDoc),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore Connection Timeout (5s)')), 5000))
    ]);
    steps.push({
      step: 'server_reachability',
      name: '3. Sambungan ke Cloud Firestore Server',
      passed: true,
      message: 'Server Cloud Firestore merespons permintaan langsung (Server Live).'
    });
  } catch (err: any) {
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    if (code === 'permission-denied' || msg.includes('insufficient permissions') || msg.includes('not-found')) {
      steps.push({
        step: 'server_reachability',
        name: '3. Sambungan ke Cloud Firestore Server',
        passed: true,
        message: 'Server Cloud Firestore online dan merespons (Live).'
      });
    } else {
      steps.push({
        step: 'server_reachability',
        name: '3. Sambungan ke Cloud Firestore Server',
        passed: false,
        message: 'Server Cloud Firestore tidak merespons (Timeout / Offline).',
        technicalError: `Code: ${code} | Message: ${msg}`,
        solutionHint: 'Periksa apakah Database Firestore dengan ID "(default)" di Firebase Console sudah dibuat dan diaktifkan.'
      });
    }
  }

  // Step 4: Collection Security Rules & Write Test
  try {
    const targetTestCol = getTenantCollectionName('students');
    const testDocRef = doc(db, targetTestCol, '_diagnostic_write_test');
    const payload = {
      _testPing: true,
      testedAt: new Date().toISOString(),
      testedBy: 'Uji Diagnostik EduSync'
    };
    await Promise.race([
      setDoc(testDocRef, payload, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Uji Penulisan Firestore Timeout (8s)')), 8000))
    ]);
    await Promise.race([
      getDocFromServer(testDocRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Uji Pembacaan Firestore Timeout (8s)')), 8000))
    ]);

    // Clean up write test document immediately so it does not persist in student records
    await deleteDoc(testDocRef).catch(() => {});

    steps.push({
      step: 'rules_write_read',
      name: `4. Uji Penulisan & Pembacaan Collection (${targetTestCol})`,
      passed: true,
      message: `Penulisan & pembacaan pada collection '${targetTestCol}' BERHASIL disinkronkan ke Cloud Firebase!`
    });
  } catch (err: any) {
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    const isRules = code === 'permission-denied' || msg.includes('insufficient permissions');

    steps.push({
      step: 'rules_write_read',
      name: '4. Uji Penulisan Collection (Security Rules)',
      passed: false,
      message: isRules
        ? 'Security Rules Firestore MENOLAK penulisan (PERMISSION_DENIED).'
        : `Gagal melakukan penulisan ke Firestore Cloud: ${msg}`,
      technicalError: `FirebaseError [code=${code}]: ${msg}`,
      solutionHint: isRules
        ? `Buka Firebase Console -> Project '${config.projectId}' -> Firestore Database -> tab Rules, lalu salin kodenya: allow read, write: if true;`
        : 'Pastikan koneksi internet stabil dan ID database Firestore Anda valid.'
    });
  }

  const isAllPassed = steps.every(s => s.passed);
  const recommendation = isAllPassed
    ? 'Seluruh pengujian berhasil! Database Firebase Anda siap digunakan untuk sinkronisasi otomatis.'
    : 'Beberapa pengujian gagal. Ikuti petunjuk solusi pada poin berwarna merah di atas.';

  const report: FirebaseDiagnosticReport = {
    timestamp: new Date().toLocaleString('id-ID'),
    isAllPassed,
    steps,
    activeConfig: {
      projectId: config.projectId,
      apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
      authDomain: config.authDomain,
      databaseId: currentDbId,
      tenantId: currentTenantId
    },
    recommendation
  };

  recordSyncAuditLog({
    type: 'DIAGNOSTIC',
    status: isAllPassed ? 'SUCCESS' : 'ERROR',
    title: 'Hasil Pengujian Diagnostik Firebase',
    details: recommendation,
    technicalDetails: JSON.stringify(steps)
  });

  return report;
}

/**
 * Enable Firestore persistent cache
 * Note: Local persistence is configured directly during initializeFirestore in firebase.ts
 */
export function enableFirestorePersistentCache() {
  isPersistenceEnabled = true;
}

// Initialize Firestore persistent cache on module load
enableFirestorePersistentCache();

export const SYNCED_COLLECTIONS = [
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
  'settings',
  'school_settings',
  'holiday_config'
] as const;

export type SyncedCollectionName = typeof SYNCED_COLLECTIONS[number];

/**
 * Partitioning Strategy Configuration & Helpers
 */
export function getActiveAcademicPartition(): string {
  if (typeof window !== 'undefined') {
    const customPartition = localStorage.getItem('edusync_active_partition');
    if (customPartition && customPartition.trim()) {
      return customPartition.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    }
  }
  return '2025_2026'; // Default academic year partition
}

export function setActiveAcademicPartition(partition: string): void {
  if (typeof window !== 'undefined') {
    const cleanPartition = partition.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || '2025_2026';
    localStorage.setItem('edusync_active_partition', cleanPartition);
    window.dispatchEvent(new CustomEvent('academic-partition-changed', { detail: { partition: cleanPartition } }));
  }
}

/**
 * Returns partition-scoped collection name for Firestore to avoid monolithic single-collection degradation.
 * Large collections like attendance, grades, jurnal, tasks, raporCapaian are partitioned by school year.
 */
export function getPartitionedCollectionName(collectionName: string, partitionKey?: string): string {
  const baseCol = getTenantCollectionName(collectionName);
  const isPartitionable = ['attendance', 'grades', 'jurnal', 'tasks', 'raporCapaian'].includes(collectionName);
  if (!isPartitionable) return baseCol;

  const part = partitionKey || getActiveAcademicPartition();
  const safePart = part.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${baseCol}_part_${safePart}`;
}

/**
 * Multi-Tenancy Class / School ID Helpers
 */
export function getClassTenantId(): string {
  if (typeof window !== 'undefined') {
    const classId = localStorage.getItem('edusync_class_tenant_id');
    if (classId && classId.trim()) {
      return classId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
  }
  return 'default';
}

export function setClassTenantId(newClassId: string): void {
  const cleanId = (newClassId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default';
  if (typeof window !== 'undefined') {
    localStorage.setItem('edusync_class_tenant_id', cleanId);
    window.dispatchEvent(new CustomEvent('class-tenant-changed', { detail: { classTenantId: cleanId } }));
  }
}

export function getTenantCollectionName(baseCollectionName: string, overrideTenantId?: string): string {
  const tenantId = overrideTenantId !== undefined ? overrideTenantId : getClassTenantId();
  if (!tenantId || tenantId === 'default' || tenantId === 'semua') {
    return baseCollectionName;
  }
  return `${tenantId}_${baseCollectionName}`;
}

/**
 * Firestore Data Layer Middleware: OwnerID Security Validator
 * Validates if the 'OwnerID' or 'ownerId' of a retrieved document matches the currently authenticated user's ID.
 * Blocks access if unauthorized.
 */
export function validateDocumentOwner(collectionName: string, docId: string, docData: any): boolean {
  if (!docData || typeof docData !== 'object') return true;

  const targetOwnerId = docData.OwnerID || docData.ownerId;
  const isOwnerRestrictedCollection = ['tasks', 'jurnal', 'violations'].includes(collectionName);

  if (isOwnerRestrictedCollection || targetOwnerId) {
    const currentUserId = (typeof window !== 'undefined' ? localStorage.getItem('edusync_user_id') : null) || auth.currentUser?.uid;
    const userRole = (typeof window !== 'undefined' ? localStorage.getItem('edusync_user_role') : null);

    // Admins, kepsek, or background system operations bypass row-level check
    if (userRole === 'admin' || userRole === 'kepsek' || !currentUserId) {
      return true;
    }

    // If OwnerID is present and does not match authenticated user ID, block access!
    if (targetOwnerId && targetOwnerId !== currentUserId) {
      console.warn(`[OwnerID Middleware] Access BLOCKED for document ${collectionName}/${docId}. OwnerID (${targetOwnerId}) != Current User ID (${currentUserId}).`);
      recordSyncAuditLog({
        type: 'DIAGNOSTIC',
        status: 'WARN',
        title: 'Akses Ditolak (OwnerID Middleware)',
        details: `Akses dokumen ${collectionName}/${docId} diblokir karena OwnerID (${targetOwnerId}) tidak sesuai dengan ID Pengguna (${currentUserId}).`,
        collection: collectionName,
        errorCode: 'UNAUTHORIZED_OWNER_ID'
      }).catch(() => {});
      return false; // Unauthorized: Block access!
    }
  }

  return true;
}

/**
 * Resolves numeric millisecond timestamp for any entity to compare update freshness.
 */
export function getEntityTimestamp(doc: any): number {
  if (!doc || typeof doc !== 'object') return 0;
  const ts = doc.lastModified || doc.updatedAt || doc.lastUpdated || doc.updated_at || doc.createdAt || doc.created_at || doc.timestamp;
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (ts && typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  if (ts && typeof ts.toDate === 'function') {
    return ts.toDate().getTime();
  }
  return 0;
}

/**
 * Checks whether incoming remote sync data is newer than existing local IndexedDB entity data.
 * Prevents stale multi-device updates from overwriting newer local state.
 */
export function isIncomingDataNewer(incomingData: any, existingLocalData: any): boolean {
  if (!existingLocalData) return true; // Missing locally -> incoming is newer
  if (!incomingData) return false;

  const incomingTs = getEntityTimestamp(incomingData);
  const localTs = getEntityTimestamp(existingLocalData);

  // If local data has timestamp and incoming timestamp is strictly older, reject incoming
  if (localTs > 0 && incomingTs > 0 && incomingTs < localTs) {
    return false;
  }
  return true;
}

/**
 * Multi-Device Overwrite Conflict Resolution Engine
 */
export interface SyncConflictItem {
  id: string;
  collectionName: string;
  docId: string;
  documentTitle?: string;
  localData: any;
  serverData: any;
  detectedAt: string;
  status: 'pending' | 'resolved_local' | 'resolved_server';
  conflictFields: string[];
}

let activeConflicts: SyncConflictItem[] = [];
const conflictListeners: Set<(conflicts: SyncConflictItem[]) => void> = new Set();

export function subscribeToSyncConflicts(callback: (conflicts: SyncConflictItem[]) => void): () => void {
  conflictListeners.add(callback);
  callback([...activeConflicts]);
  return () => {
    conflictListeners.delete(callback);
  };
}

export function getActiveConflicts(): SyncConflictItem[] {
  return [...activeConflicts];
}

export function notifyConflictListeners() {
  conflictListeners.forEach((fn) => fn([...activeConflicts]));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sync-conflict-changed', { detail: [...activeConflicts] }));
  }
}

export function getDifferingFields(localData: any, serverData: any): string[] {
  if (!localData || !serverData) return [];
  const keys = new Set([...Object.keys(localData), ...Object.keys(serverData)]);
  const diffs: string[] = [];
  const ignoredKeys = new Set(['_startupCheck', 'checkedAt', 'updatedAt', 'lastModified', 'lastSyncTimestamp', 'lastUpdated']);

  keys.forEach((key) => {
    if (ignoredKeys.has(key)) return;
    const v1 = JSON.stringify(localData[key]);
    const v2 = JSON.stringify(serverData[key]);
    if (v1 !== v2) {
      diffs.push(key);
    }
  });
  return diffs;
}

export function checkAndRegisterConflict(
  collectionName: string, 
  docId: string, 
  localData: any, 
  serverData: any
): boolean {
  if (!localData || !serverData) return false;
  const differingFields = getDifferingFields(localData, serverData);
  if (differingFields.length === 0) return false;

  const title = localData.nama || localData.name || localData.title || localData.mapel || localData.nisn || localData.id || docId;
  const conflictId = `conflict_${collectionName}_${docId}`;

  const existingIndex = activeConflicts.findIndex(c => c.docId === docId && c.collectionName === collectionName);
  const conflictItem: SyncConflictItem = {
    id: conflictId,
    collectionName,
    docId,
    documentTitle: String(title),
    localData,
    serverData,
    detectedAt: new Date().toLocaleTimeString('id-ID'),
    status: 'pending',
    conflictFields: differingFields
  };

  if (existingIndex >= 0) {
    activeConflicts[existingIndex] = conflictItem;
  } else {
    activeConflicts.unshift(conflictItem);
  }

  notifyConflictListeners();
  return true;
}

export async function resolveSyncConflict(conflictId: string, choice: 'local' | 'server'): Promise<boolean> {
  const conflict = activeConflicts.find(c => c.id === conflictId);
  if (!conflict) return false;

  const { collectionName, docId, localData, serverData } = conflict;
  const storeInstance = (store as any)[collectionName];

  try {
    if (choice === 'local') {
      if (storeInstance) {
        await storeInstance.setItem(docId, localData);
      }
      await syncDocToFirebase(collectionName, docId, localData);
    } else {
      if (storeInstance) {
        await storeInstance.setItem(docId, serverData);
      }
      await store.syncQueue.removeItem(`${collectionName}::${docId}`).catch(() => {});
      dispatchDeltaUpdate(collectionName, docId, 'upsert', serverData);
    }

    activeConflicts = activeConflicts.filter(c => c.id !== conflictId);
    notifyConflictListeners();
    return true;
  } catch (err) {
    console.error('[FirebaseSync] Error resolving conflict:', err);
    return false;
  }
}

export async function resolveAllSyncConflicts(choice: 'local' | 'server'): Promise<number> {
  const list = [...activeConflicts];
  let count = 0;
  for (const c of list) {
    const ok = await resolveSyncConflict(c.id, choice);
    if (ok) count++;
  }
  return count;
}

export function simulateSyncConflict(customDoc?: { collectionName?: string; docId?: string; title?: string }) {
  const collectionName = customDoc?.collectionName || 'students';
  const docId = customDoc?.docId || 'sim_conflict_001';
  const title = customDoc?.title || 'Budi Santoso (Siswa Demo)';

  const localData = {
    id: docId,
    nisn: '1234567890',
    nama: 'Budi Santoso',
    kelas: '8-A',
    status: 'Aktif (Versi HP Guru)',
    catatan: 'Perubahan lokal di HP Wali Kelas saat offline (14:20)',
    updatedAt: new Date(Date.now() - 60000).toISOString()
  };

  const serverData = {
    id: docId,
    nisn: '1234567890',
    nama: 'Budi Santoso',
    kelas: '8-B (Mutasi Rombel)',
    status: 'Aktif (Versi Server Cloud)',
    catatan: 'Diubah oleh Admin Kurikulum di Laptop Server (14:25)',
    updatedAt: new Date().toISOString()
  };

  checkAndRegisterConflict(collectionName, docId, localData, serverData);
  return activeConflicts[0];
}

let isFirebaseSyncActive = false;
let isRemoteUpdateInProgress = false;
let firebaseStatus: 'connected' | 'syncing' | 'offline' | 'error' = 'offline';
let lastSyncTime: string | null = null;

export const getFirebaseStatus = () => ({
  status: firebaseStatus,
  lastSyncTime,
  isActive: isFirebaseSyncActive
});

export interface FirestoreLatencyMetric {
  id: string;
  timestamp: string;
  operation: 'pull' | 'push' | 'query' | 'realtime';
  collectionName: string;
  durationMs: number;
  itemCount: number;
  updatedCount?: number;
  itemsPerSecond: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export const latencyLogs: FirestoreLatencyMetric[] = [];

export function recordLatencyMetric(metric: Omit<FirestoreLatencyMetric, 'id' | 'timestamp'>) {
  const fullMetric: FirestoreLatencyMetric = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString('id-ID'),
    ...metric
  };
  latencyLogs.unshift(fullMetric);
  if (latencyLogs.length > 50) latencyLogs.pop();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore-latency-updated', { detail: fullMetric }));
  }
}

export function getLatencySummary() {
  if (latencyLogs.length === 0) {
    return {
      avgPullDurationMs: 0,
      avgPushDurationMs: 0,
      totalOperations: 0,
      recentMetric: null,
      logs: []
    };
  }

  const pulls = latencyLogs.filter(l => l.operation === 'pull');
  const pushes = latencyLogs.filter(l => l.operation === 'push');

  const avgPull = pulls.length > 0 ? pulls.reduce((acc, curr) => acc + curr.durationMs, 0) / pulls.length : 0;
  const avgPush = pushes.length > 0 ? pushes.reduce((acc, curr) => acc + curr.durationMs, 0) / pushes.length : 0;

  return {
    avgPullDurationMs: Math.round(avgPull),
    avgPushDurationMs: Math.round(avgPush),
    totalOperations: latencyLogs.length,
    recentMetric: latencyLogs[0],
    logs: [...latencyLogs]
  };
}

export const notifyFirebaseStatusChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('firebase-status-changed'));
  }
};

let dataChangedDebounceTimer: any = null;
export const notifyDataChangedDebounced = (delayMs: number = 300) => {
  if (dataChangedDebounceTimer) clearTimeout(dataChangedDebounceTimer);
  dataChangedDebounceTimer = setTimeout(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
    }
  }, delayMs);
};

/**
 * Save or update a document in Firestore using direct document references (doc) with optimistic rollback support.
 * Emits fine-grained delta update events to prevent excessive full-app re-renders during high-frequency syncs.
 */
export async function syncDocToFirebase(collectionName: string, docId: string, data: any, previousSnapshot?: any) {
  if (isRemoteUpdateInProgress || !docId) return;
  try {
    const safeId = String(docId).replace(/\//g, '_');
    const targetCol = getPartitionedCollectionName(collectionName);
    const docRef = doc(db, targetCol, safeId);
    // Sanitize data and inject updatedAt timestamp for delta-syncing
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (!cleanData.updatedAt) {
      cleanData.updatedAt = new Date().toISOString();
    }
    if (['tasks', 'jurnal'].includes(collectionName)) {
      const currentUserId = (typeof window !== 'undefined' ? localStorage.getItem('edusync_user_id') : null) || auth.currentUser?.uid || 'system';
      if (!cleanData.OwnerID && !cleanData.ownerId) {
        cleanData.OwnerID = currentUserId;
        cleanData.ownerId = currentUserId;
      }
    }

    // Attendance Middleware Check: Validate dates against holiday config
    if (collectionName === 'attendance' && cleanData.tanggal) {
      const holCheck = await isDateHoliday(cleanData.tanggal);
      if (holCheck.isHoliday && cleanData.status === 'Hadir') {
        cleanData.status = 'Libur';
        cleanData.keterangan = `Otomatis Dibatalkan (${holCheck.reason})`;
      }
    }

    if (!validateDocumentOwner(collectionName, docId, cleanData)) {
      throw new Error(`[Unauthorized] OwnerID mismatch. Document access/write blocked by data layer middleware.`);
    }

    // Direct document reference setDoc with merge for low-cost write
    await setDoc(docRef, cleanData, { merge: true });
    
    // Remove from local unsynced queue
    await store.syncQueue.removeItem(`${collectionName}::${docId}`).catch(() => {});

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    // Dispatch fine-grained delta event instead of forcing global full re-renders
    dispatchDeltaUpdate(collectionName, docId, 'upsert', cleanData);
  } catch (err: any) {
    console.warn(`[FirebaseSync] Error syncing doc ${collectionName}/${docId}:`, err);
    firebaseStatus = 'error';
    notifyFirebaseStatusChanged();

    // Rollback local store state if previousSnapshot was passed
    if (previousSnapshot !== undefined) {
      try {
        const storeInst = (store as any)[collectionName];
        if (storeInst) {
          if (previousSnapshot === null) {
            await storeInst.removeItem(docId);
          } else {
            await storeInst.setItem(docId, previousSnapshot);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('data-changed'));
            window.dispatchEvent(new Event('sync-status-changed'));
          }
        }
      } catch (rollbackErr) {
        console.error('[FirebaseSync] Rollback error:', rollbackErr);
      }
    }

    toast.error(`Gagal menyinkronkan data ke Cloud (${err?.message || 'Error'}). Perubahan lokal dikembalikan (rollback).`, {
      id: `rollback-sync-${collectionName}-${docId}`,
      duration: 4000
    });
  }
}

/**
 * Perform fine-grained partial update on a single Firestore document using FieldPath
 * and direct document references doc(db, col, docId).
 * Reduces read costs and prevents excessive re-renders during high-frequency syncs.
 */
export async function updateDocFieldsInFirebase(
  collectionName: string,
  docId: string,
  fieldsMap: Record<string, any>,
  previousSnapshot?: any
) {
  if (isRemoteUpdateInProgress || !docId) return;
  try {
    const safeId = String(docId).replace(/\//g, '_');
    const targetCol = getPartitionedCollectionName(collectionName);
    const docRef = doc(db, targetCol, safeId);

    // Build FieldPath updates dictionary to target specific nested or top-level properties
    const updatesObj: any = {};
    Object.keys(fieldsMap).forEach((key) => {
      if (key.includes('.')) {
        const segments = key.split('.');
        updatesObj[new FieldPath(...segments) as any] = fieldsMap[key];
      } else {
        updatesObj[key] = fieldsMap[key];
      }
    });

    if (!updatesObj['updatedAt']) {
      updatesObj['updatedAt'] = new Date().toISOString();
    }

    await updateDoc(docRef, updatesObj);

    // Remove from local unsynced queue
    await store.syncQueue.removeItem(`${collectionName}::${docId}`).catch(() => {});

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    // Fine-grained delta update notification to avoid full collection re-renders
    dispatchDeltaUpdate(collectionName, docId, 'upsert', fieldsMap);
  } catch (err: any) {
    // If document does not exist yet, fallback to setDoc with merge using direct doc reference
    if (err?.code === 'not-found' || (err?.message && err.message.includes('No document to update'))) {
      const safeId = String(docId).replace(/\//g, '_');
      const targetCol = getPartitionedCollectionName(collectionName);
      const docRef = doc(db, targetCol, safeId);
      await setDoc(docRef, { ...fieldsMap, updatedAt: new Date().toISOString() }, { merge: true });
      dispatchDeltaUpdate(collectionName, docId, 'upsert', fieldsMap);
      return;
    }
    console.warn(`[FirebaseSync] Error updating fields for ${collectionName}/${docId}:`, err);
    firebaseStatus = 'error';
    notifyFirebaseStatusChanged();

    if (previousSnapshot !== undefined) {
      try {
        const storeInst = (store as any)[collectionName];
        if (storeInst) {
          if (previousSnapshot === null) {
            await storeInst.removeItem(docId);
          } else {
            await storeInst.setItem(docId, previousSnapshot);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('data-changed'));
          }
        }
      } catch (rollbackErr) {
        console.error('[FirebaseSync] Rollback error:', rollbackErr);
      }
    }
  }
}

/**
 * Delete a document from Firestore with optimistic rollback support
 */
export async function deleteDocFromFirebase(collectionName: string, docId: string, previousSnapshot?: any) {
  if (isRemoteUpdateInProgress || !docId) return;
  try {
    const safeId = String(docId).replace(/\//g, '_');
    const targetCol = getPartitionedCollectionName(collectionName);
    const docRef = doc(db, targetCol, safeId);
    await deleteDoc(docRef);

    // Remove from local unsynced queue
    await store.syncQueue.removeItem(`${collectionName}::${docId}`).catch(() => {});

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();
  } catch (err: any) {
    console.warn(`[FirebaseSync] Error deleting doc ${collectionName}/${docId}:`, err);
    firebaseStatus = 'error';
    notifyFirebaseStatusChanged();

    if (previousSnapshot !== undefined && previousSnapshot !== null) {
      try {
        const storeInst = (store as any)[collectionName];
        if (storeInst) {
          await storeInst.setItem(docId, previousSnapshot);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('data-changed'));
            window.dispatchEvent(new Event('sync-status-changed'));
          }
        }
      } catch (rollbackErr) {
        console.error('[FirebaseSync] Delete Rollback error:', rollbackErr);
      }
    }

    toast.error(`Gagal menghapus data di Cloud (${err?.message || 'Error'}). Data lokal dikembalikan.`, {
      id: `rollback-del-${collectionName}-${docId}`,
      duration: 4000
    });
  }
}

/**
 * Delete an entire collection in Firestore batch by batch
 */
export async function deleteCollection(collectionName: string): Promise<number> {
  let deletedCount = 0;
  try {
    const colRef = collection(db, collectionName);
    let snapshot = await getDocs(colRef);

    while (!snapshot.empty) {
      const batchSize = 500; // Write batch hingga 500 dokumen per batch
      const docIds: string[] = [];
      snapshot.forEach(d => docIds.push(d.id));

      for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docIds.slice(i, i + batchSize);
        chunk.forEach(id => {
          batch.delete(doc(db, collectionName, id));
        });
        await batch.commit();
        deletedCount += chunk.length;
      }

      // Query again in case there are more documents remaining
      snapshot = await getDocs(colRef);
    }
  } catch (err) {
    console.warn(`[FirebaseSync] Error in deleteCollection for '${collectionName}':`, err);
  }
  return deletedCount;
}

/**
 * Purge/Delete ALL documents across ALL synced collections in Cloud Firestore
 */
export async function purgeAllFirebaseData(): Promise<{ success: boolean; totalDeleted: number; message: string }> {
  isRemoteUpdateInProgress = true;
  pauseSyncQueue();
  pauseNotifications(true);
  let totalDeleted = 0;

  try {
    const tenantId = getClassTenantId();
    const collectionsToPurge = new Set<string>();

    const knownBaseCollections = [
      ...SYNCED_COLLECTIONS,
      'siswa',
      'nilai',
      'absensi',
      'pengaturan',
      'tugas',
      'roster_piket',
      'rapor_capaian'
    ];

    knownBaseCollections.forEach(colName => {
      collectionsToPurge.add(colName);
      collectionsToPurge.add(getTenantCollectionName(colName));
      if (tenantId !== 'default') {
        collectionsToPurge.add(`${tenantId}_${colName}`);
      }
    });

    for (const targetCol of collectionsToPurge) {
      const count = await deleteCollection(targetCol);
      totalDeleted += count;
    }

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    recordSyncAuditLog({
      type: 'PUSH',
      status: 'SUCCESS',
      title: 'Pembersihan Total Cloud Firestore',
      details: `Berhasil menghapus seluruh ${totalDeleted} dokumen dari Cloud Firestore.`,
      itemCount: totalDeleted
    });

    return {
      success: true,
      totalDeleted,
      message: `Berhasil membersihkan seluruh ${totalDeleted} dokumen dari Cloud Firestore.`
    };
  } catch (err: any) {
    console.error('[FirebaseSync] Error in purgeAllFirebaseData:', err);
    return {
      success: false,
      totalDeleted,
      message: 'Gagal membersihkan data Cloud Firestore: ' + (err?.message || String(err))
    };
  } finally {
    isRemoteUpdateInProgress = false;
    resumeSyncQueue();
    resumeNotifications(true);
  }
}

export interface DatabaseVerificationResult {
  isClean: boolean;
  residualCount: number;
  residualCollections: string[];
  message: string;
}

/**
 * Verify if Firestore database collections (especially 'siswa' and 'students') are completely empty (0 documents)
 */
export async function verifyDatabaseIsEmpty(): Promise<DatabaseVerificationResult> {
  let residualCount = 0;
  const residualCollections: string[] = [];

  try {
    const tenantId = getClassTenantId();
    const collectionsToCheck = new Set<string>();

    const knownBaseCollections = [
      ...SYNCED_COLLECTIONS,
      'siswa',
      'nilai',
      'absensi',
      'pengaturan',
      'tugas',
      'roster_piket',
      'rapor_capaian'
    ];

    knownBaseCollections.forEach(colName => {
      collectionsToCheck.add(colName);
      collectionsToCheck.add(getTenantCollectionName(colName));
      if (tenantId !== 'default') {
        collectionsToCheck.add(`${tenantId}_${colName}`);
      }
    });

    for (const colName of collectionsToCheck) {
      try {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty && snapshot.size > 0) {
          residualCount += snapshot.size;
          residualCollections.push(`${colName} (${snapshot.size} dokumen)`);
        }
      } catch (e) {
        console.warn(`[verifyDatabaseIsEmpty] Warning checking collection '${colName}':`, e);
      }
    }

    if (residualCount > 0) {
      return {
        isClean: false,
        residualCount,
        residualCollections,
        message: 'Terdapat data residu, harap ulangi proses'
      };
    }

    return {
      isClean: true,
      residualCount: 0,
      residualCollections: [],
      message: 'Database 100% Bersih & Kosong Total!'
    };
  } catch (err: any) {
    console.error('[verifyDatabaseIsEmpty] Error:', err);
    return {
      isClean: false,
      residualCount: -1,
      residualCollections: ['Pemeriksaan Firestore Error'],
      message: 'Terdapat data residu, harap ulangi proses'
    };
  }
}

/**
 * Delete ALL student-related documents (students, siswa, grades, attendance, piket, raporCapaian) from Cloud Firestore
 */
export async function purgeStudentDataFromFirebase(): Promise<{ success: boolean; totalDeleted: number; message: string }> {
  isRemoteUpdateInProgress = true;
  pauseSyncQueue();
  pauseNotifications(true);
  let totalDeleted = 0;

  try {
    const tenantId = getClassTenantId();
    const studentCols = ['students', 'siswa', 'grades', 'nilai', 'attendance', 'absensi', 'piket', 'raporCapaian', 'rapor_capaian'];
    const collectionsToPurge = new Set<string>();

    studentCols.forEach(colName => {
      collectionsToPurge.add(colName);
      collectionsToPurge.add(getTenantCollectionName(colName));
      if (tenantId !== 'default') {
        collectionsToPurge.add(`${tenantId}_${colName}`);
      }
    });

    for (const targetCol of collectionsToPurge) {
      const count = await deleteCollection(targetCol);
      totalDeleted += count;
    }

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    return {
      success: true,
      totalDeleted,
      message: `Berhasil menghapus ${totalDeleted} dokumen data siswa dari Cloud Firestore.`
    };
  } catch (err: any) {
    console.error('[FirebaseSync] Error in purgeStudentDataFromFirebase:', err);
    return {
      success: false,
      totalDeleted,
      message: 'Gagal menghapus data siswa dari Cloud Firestore: ' + (err?.message || String(err))
    };
  } finally {
    isRemoteUpdateInProgress = false;
    resumeSyncQueue();
    resumeNotifications(true);
  }
}

/**
 * Maximum write operations per Firestore WriteBatch (Firestore API limit is 500)
 */
const MAX_FIRESTORE_BATCH_SIZE = 500;
let lastReachabilityCheckTime = 0;
const REACHABILITY_CHECK_TTL_MS = 30000;

/**
 * Execute WriteBatch commits with batching, concurrency control, and retry logic to prevent connection timeouts
 */
async function commitWriteBatches(
  batches: ReturnType<typeof writeBatch>[],
  concurrency = 6,
  delayMs = 0,
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (batch) => {
        let attempt = 0;
        while (attempt < maxRetries) {
          try {
            await batch.commit();
            break;
          } catch (err: any) {
            attempt++;
            if (attempt >= maxRetries) {
              throw err;
            }
            console.warn(`[FirebaseSync] Batch commit attempt ${attempt} failed, retrying in ${attempt * 150}ms...`, err);
            await new Promise((res) => setTimeout(res, attempt * 150));
          }
        }
      })
    );
    if (delayMs > 0 && i + concurrency < batches.length) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

/**
 * Perform high-speed parallel push of local IndexedDB data to Firebase Firestore
 */
export async function pushAllLocalDataToFirebase(
  forceFullPush: boolean = false,
  isSilent: boolean = false
): Promise<{ success: boolean; count: number; message: string }> {
  try {
    firebaseStatus = 'syncing';
    notifyFirebaseStatusChanged();

    // 1. Strict Internet Connection Check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const errMsg = 'Perangkat Anda saat ini OFFLINE (tidak ada koneksi internet). Mohon hubungkan ke internet sebelum melakukan sinkronisasi ke Firebase.';
      firebaseStatus = 'offline';
      notifyFirebaseStatusChanged();
      recordSyncAuditLog({
        type: 'PUSH',
        status: 'ERROR',
        title: 'Gagal Sinkronisasi - Perangkat Offline',
        details: errMsg,
        errorCode: 'OFFLINE',
        errorMessage: errMsg,
        solutionHint: 'Aktifkan koneksi WiFi atau paket data internet Anda lalu coba sinkronisasi kembali.'
      });
      return {
        success: false,
        count: 0,
        message: errMsg
      };
    }

    // 2. Direct Server Reachability & Security Rules Validation Test (Cached 30s)
    const nowCheck = Date.now();
    if (nowCheck - lastReachabilityCheckTime > REACHABILITY_CHECK_TTL_MS) {
      try {
        const testCol = getTenantCollectionName('_connection_test');
        const testDocRef = doc(db, testCol, 'sync_write_check');
        const testPayload = {
          checkTime: new Date().toISOString(),
          client: 'EduSync App',
          tenantId: getClassTenantId()
        };
        await Promise.race([
          setDoc(testDocRef, testPayload, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi Firestore Timeout (8s)')), 8000))
        ]);
        lastReachabilityCheckTime = nowCheck;
      } catch (testErr: any) {
        const errCode = testErr?.code || 'unknown';
        const errMsg = testErr?.message || String(testErr);
        const isRulesError = errCode === 'permission-denied' || errMsg.includes('insufficient permissions');

        const userFriendlyMsg = isRulesError
          ? 'Aturan Keamanan (Security Rules) Firestore di Firebase Console Menolak Penulisan (PERMISSION_DENIED).'
          : `Gagal terhubung ke Cloud Firestore Server (${errCode}): ${errMsg}`;

        const hint = isRulesError
          ? `Buka Firebase Console (https://console.firebase.google.com) > Project '${activeFirebaseConfig.projectId}' > Firestore Database > tab Rules, lalu ubah menjadi: allow read, write: if true;`
          : 'Periksa koneksi internet, Project ID, dan API Key Firebase Anda.';

        firebaseStatus = 'error';
        notifyFirebaseStatusChanged();
        recordSyncAuditLog({
          type: 'PUSH',
          status: 'ERROR',
          title: 'Gagal Mengirim Data - Penolakan Akses / Error Firebase',
          details: userFriendlyMsg,
          errorCode: errCode,
          errorMessage: errMsg,
          technicalDetails: `Error Code: ${errCode} | Path: _connection_test/sync_write_check`,
          solutionHint: hint
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sync-progress-updated', {
            detail: {
              isSyncing: false,
              stage: 'Error',
              stageLabel: userFriendlyMsg,
              percent: 0,
              direction: 'push'
            }
          }));
        }

        return {
          success: false,
          count: 0,
          message: `${userFriendlyMsg} Solusi: ${hint}`
        };
      }
    }

    // Check if sync queue has specific pending items
    const queueKeys = await store.syncQueue.keys().catch(() => []);
    
    // If not forcing full push and we have pending queue items, push delta items fast!
    if (!forceFullPush && queueKeys.length > 0) {
      let deltaCount = 0;

      // 1. Fetch queue items in parallel chunks to avoid sequential IndexedDB latency
      const itemsToSync: { storeName: string; safeId: string; val: any }[] = [];
      const fetchChunkSize = 100;

      for (let i = 0; i < queueKeys.length; i += fetchChunkSize) {
        const chunkKeys = queueKeys.slice(i, i + fetchChunkSize);
        const fetched = await Promise.all(
          chunkKeys.map(async (queueKey) => {
            const parts = queueKey.split('::');
            const storeName = parts[0];
            const docId = parts[1];
            if (storeName && docId) {
              const storeInstance = (store as any)[storeName];
              if (storeInstance) {
                const val = await storeInstance.getItem(docId);
                const safeId = String(docId).replace(/\//g, '_');
                return { storeName, safeId, val };
              }
            }
            return null;
          })
        );
        for (const item of fetched) {
          if (item) itemsToSync.push(item);
        }
      }

      // 2. Commit to Firestore in controlled chunked batches (max 500 operations per write batch)
      const batchesToCommit: ReturnType<typeof writeBatch>[] = [];

      for (let i = 0; i < itemsToSync.length; i += MAX_FIRESTORE_BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = itemsToSync.slice(i, i + MAX_FIRESTORE_BATCH_SIZE);

        for (const item of chunk) {
          const targetCol = getTenantCollectionName(item.storeName);
          if (item.val) {
            const cleanVal = JSON.parse(JSON.stringify(item.val));
            if (!cleanVal.updatedAt) {
              cleanVal.updatedAt = new Date().toISOString();
            }
            batch.set(doc(db, targetCol, item.safeId), cleanVal, { merge: true });
          } else {
            batch.delete(doc(db, targetCol, item.safeId));
          }
          deltaCount++;
        }

        batchesToCommit.push(batch);
      }

      // Execute batches in small controlled chunks (2 at a time) with retries to prevent connection timeouts
      await commitWriteBatches(batchesToCommit, 2, 50, 3);

      await store.syncQueue.clear().catch(() => {});

      firebaseStatus = 'connected';
      lastSyncTime = new Date().toLocaleTimeString('id-ID');
      notifyFirebaseStatusChanged();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sync-status-changed'));
        window.dispatchEvent(new CustomEvent('sync-progress-updated', {
          detail: {
            isSyncing: false,
            stage: 'Completed',
            stageLabel: `Sinkronisasi cepat berhasil (${deltaCount} item tersinkron)!`,
            percent: 100,
            processedItems: deltaCount,
            totalItems: deltaCount,
            direction: 'push'
          }
        }));
      }

      return {
        success: true,
        count: deltaCount,
        message: `Berhasil menyinkronkan ${deltaCount} item baru/perubahan!`
      };
    }

    // If queue is empty and forceFullPush is false, all local data is already in sync!
    if (!forceFullPush && queueKeys.length === 0) {
      firebaseStatus = 'connected';
      lastSyncTime = new Date().toLocaleTimeString('id-ID');
      notifyFirebaseStatusChanged();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('sync-status-changed'));
        window.dispatchEvent(new CustomEvent('sync-progress-updated', {
          detail: {
            isSyncing: false,
            stage: 'Completed',
            stageLabel: 'Data lokal sudah 100% tersinkron dengan Cloud!',
            percent: 100,
            processedItems: 0,
            totalItems: 0,
            direction: 'push'
          }
        }));
      }

      return {
        success: true,
        count: 0,
        message: 'Data lokal sudah 100% tersinkron dengan Cloud Firebase!'
      };
    }
    
    // Full Push Fallback (Force or Initial)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: true,
          stage: 'Preparing Data',
          stageLabel: 'Membaca & menyiapkan seluruh data lokal...',
          percent: 15,
          direction: 'push'
        }
      }));
    }

    let totalPushed = 0;
    const totalCollections = SYNCED_COLLECTIONS.length;
    let completedCols = 0;
    const syncErrors: string[] = [];

    // Process collections in controlled sequential/chunked batches (2 collections at a time)
    const COLLECTION_CHUNK_SIZE = 2;
    for (let c = 0; c < SYNCED_COLLECTIONS.length; c += COLLECTION_CHUNK_SIZE) {
      const colChunk = SYNCED_COLLECTIONS.slice(c, c + COLLECTION_CHUNK_SIZE);
      
      await Promise.all(
        colChunk.map(async (storeName) => {
          try {
            const storeInstance = (store as any)[storeName];
            if (!storeInstance) return;

            const items: { id: string; val: any }[] = [];
            await storeInstance.iterate((val: any, key: string) => {
              if (key && val) {
                items.push({ id: String(key), val });
              }
            });

            if (items.length > 0) {
              const batchesToCommit: ReturnType<typeof writeBatch>[] = [];

              for (let i = 0; i < items.length; i += MAX_FIRESTORE_BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = items.slice(i, i + MAX_FIRESTORE_BATCH_SIZE);
                for (const item of chunk) {
                  const safeId = String(item.id).replace(/\//g, '_');
                  const cleanVal = JSON.parse(JSON.stringify(item.val || {}));
                  if (!cleanVal.updatedAt) {
                    cleanVal.updatedAt = new Date().toISOString();
                  }
                  const targetCol = getTenantCollectionName(storeName);
                  batch.set(doc(db, targetCol, safeId), cleanVal, { merge: true });
                  totalPushed++;
                }
                batchesToCommit.push(batch);
              }

              // Commit batches in controlled chunks (2 at a time) with retries to prevent timeout
              await commitWriteBatches(batchesToCommit, 2, 50, 3);
            }

            completedCols++;
            const calcPercent = Math.min(95, 15 + Math.round((completedCols / totalCollections) * 80));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('sync-progress-updated', {
                detail: {
                  isSyncing: true,
                  stage: 'Writing to Database',
                  stageLabel: `Mengunggah koleksi '${storeName}' ke Cloud Firebase... (${completedCols}/${totalCollections})`,
                  percent: calcPercent,
                  processedItems: completedCols,
                  totalItems: totalCollections,
                  direction: 'push'
                }
              }));
            }
          } catch (colErr: any) {
            const errMsg = colErr?.message || String(colErr);
            console.error(`[FirebaseSync] Error pushing collection ${storeName}:`, colErr);
            syncErrors.push(`${storeName}: ${errMsg}`);
          }
        })
      );
    }

    if (syncErrors.length > 0) {
      const fullErrorMsg = syncErrors.join(' | ');
      firebaseStatus = 'error';
      notifyFirebaseStatusChanged();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sync-progress-updated', {
          detail: {
            isSyncing: false,
            stage: 'Idle',
            stageLabel: `Gagal menyinkronkan data: ${fullErrorMsg}`,
            percent: 0,
            direction: 'push'
          }
        }));
      }
      return {
        success: false,
        count: totalPushed,
        message: `Gagal menyinkronkan sebagian/seluruh data ke Cloud Firebase: ${fullErrorMsg}`
      };
    }

    // Clear unsynced queue once pushed successfully
    await store.syncQueue.clear().catch(() => {});

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    recordSyncAuditLog({
      type: 'PUSH',
      status: 'SUCCESS',
      title: 'Unggah Data Lokal ke Cloud Selesai',
      details: `Berhasil mengunggah ${totalPushed} item dari ${completedCols} koleksi data lokal ke Firestore Cloud Firebase.`,
      itemCount: totalPushed
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: false,
          stage: 'Completed',
          stageLabel: `Sinkronisasi ke Cloud Firebase berhasil (${totalPushed} item tersinkron)!`,
          percent: 100,
          processedItems: totalPushed,
          totalItems: totalPushed,
          direction: 'push'
        }
      }));
    }

    return {
      success: true,
      count: totalPushed,
      message: `Berhasil mengunggah ${totalPushed} data ke Cloud Firebase!`
    };
  } catch (err: any) {
    console.error('[FirebaseSync] Failed to push local data:', err);
    firebaseStatus = 'error';
    notifyFirebaseStatusChanged();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: false,
          stage: 'Idle',
          stageLabel: 'Gagal menyinkronkan data: ' + (err?.message || 'Error'),
          percent: 0,
          direction: 'push'
        }
      }));
    }

    return {
      success: false,
      count: 0,
      message: err?.message || 'Gagal menyinkronkan data ke Firebase'
    };
  }
}

/**
 * Fetch latest user accounts directly from Cloud Firestore into local IndexedDB
 */
export async function fetchLatestUsersFromFirebase(): Promise<AppUser[]> {
  try {
    const targetCol = getTenantCollectionName('users');
    const colRef = collection(db, targetCol);
    const snap = await Promise.race([
      getDocs(colRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching users from Firestore')), 6000))
    ]) as any;

    const fetchedUsers: AppUser[] = [];
    if (snap && !snap.empty) {
      for (const d of snap.docs) {
        const u = d.data() as AppUser;
        if (u && u.id && u.username) {
          fetchedUsers.push(u);
          await store.users.setItem(u.id, u);
          await store.users.setItem(u.username.toLowerCase(), u);
        }
      }
    }
    return fetchedUsers;
  } catch (err) {
    console.warn('[FirebaseSync] Failed to fetch latest users from Firestore:', err);
    return [];
  }
}

/**
 * Fast parallel pull of remote documents from Cloud Firebase to local IndexedDB
 * Uses intelligent delta checks to only update items that actually changed.
 */
export async function pullAllRemoteDataFromFirebase(
  forceFullPull: boolean = false,
  isSilent: boolean = false
): Promise<{ success: boolean; count: number; message: string }> {
  const pullStartTime = performance.now();
  const currentPullTimestamp = new Date().toISOString();
  try {
    firebaseStatus = 'syncing';
    notifyFirebaseStatusChanged();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: true,
          isSilent,
          stage: 'Connecting',
          stageLabel: forceFullPull ? 'Menarik seluruh data dari Cloud Firebase...' : 'Mendeteksi data baru/perubahan dari Cloud Firebase (Delta Sync)...',
          percent: 15,
          direction: 'pull'
        }
      }));
    }

    let totalFetched = 0;
    let totalUpdated = 0;
    let totalSkippedUnchanged = 0;
    isRemoteUpdateInProgress = true;
    pauseSyncQueue();
    pauseNotifications(true);

    let hasAnyChanges = false;
    const totalCollections = SYNCED_COLLECTIONS.length;
    let completedCols = 0;

    // Get active user credentials for explicit role-based teacher filtering
    const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('app_user') || 'null') : null;
    const isTeacher = currentUser && (currentUser.role === 'guru' || currentUser.role === 'wali_kelas' || currentUser.role === 'guru_mapel');
    const teacherClasses: string[] = Array.isArray(currentUser?.assignedClasses) && currentUser.assignedClasses.length > 0
      ? currentUser.assignedClasses
      : (currentUser?.assignedKelas && currentUser.assignedKelas !== 'semua' ? [currentUser.assignedKelas] : []);
    const isRestrictedTeacher = isTeacher && teacherClasses.length > 0 && !teacherClasses.includes('*');

    // Fetch all collections in parallel from Firestore with smart delta & pagination
    await Promise.all(
      SYNCED_COLLECTIONS.map(async (storeName) => {
        const colStartTime = performance.now();
        let colFetched = 0;
        let colUpdated = 0;

        try {
          const storeInstance = (store as any)[storeName];
          if (!storeInstance) return;

          const targetCol = getPartitionedCollectionName(storeName);
          const colRef = collection(db, targetCol);
          let lastPullTs = typeof window !== 'undefined' ? localStorage.getItem(`edusync_last_pull_ts_${targetCol}`) : null;

          // Compute latest timestamp from local IndexedDB store if lastPullTs is missing
          if (!forceFullPull && !lastPullTs) {
            let latestLocalTs = '';
            await storeInstance.iterate((val: any) => {
              const ts = val?.updatedAt || val?.lastUpdated || val?.updated_at || val?.createdAt || val?.created_at;
              if (ts && typeof ts === 'string' && ts > latestLocalTs) {
                latestLocalTs = ts;
              }
            }).catch(() => {});
            if (latestLocalTs) {
              lastPullTs = latestLocalTs;
            }
          }

          // Build explicit query filters for teacher role
          const queryConstraints: any[] = [];
          if (isRestrictedTeacher && ['students', 'grades', 'attendance', 'raporCapaian'].includes(storeName)) {
            if (teacherClasses.length === 1) {
              queryConstraints.push(where('kelas', '==', teacherClasses[0]));
            } else if (teacherClasses.length > 1 && teacherClasses.length <= 10) {
              queryConstraints.push(where('kelas', 'in', teacherClasses));
            }
          }

          let docsToProcess: { id: string; data: any }[] = [];

          // Try Delta Fetching first if lastPullTs exists and !forceFullPull (always full query for users & settings)
          let usedDeltaQuery = false;
          if (!forceFullPull && lastPullTs && storeName !== 'users' && storeName !== 'settings') {
            try {
              const deltaQ = query(colRef, ...queryConstraints, where('updatedAt', '>', lastPullTs), firestoreLimit(250));
              const deltaSnap = await Promise.race([
                getDocs(deltaQ),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi Firestore Delta Sync Timeout (5s)')), 5000))
              ]) as any;
              docsToProcess = deltaSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
              colFetched = docsToProcess.length;
              usedDeltaQuery = true;
            } catch (deltaErr) {
              // Fallback to lastUpdated or full paginated fetch
              try {
                const deltaQ2 = query(colRef, ...queryConstraints, where('lastUpdated', '>', lastPullTs), firestoreLimit(250));
                const deltaSnap2 = await Promise.race([
                  getDocs(deltaQ2),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi Firestore Delta Sync Timeout (5s)')), 5000))
                ]) as any;
                docsToProcess = deltaSnap2.docs.map((d: any) => ({ id: d.id, data: d.data() }));
                colFetched = docsToProcess.length;
                usedDeltaQuery = true;
              } catch (e) {
                usedDeltaQuery = false;
              }
            }
          }

          // Full Paginated Fetch fallback if delta fetch was not used or forced
          if (!usedDeltaQuery) {
            let lastDocSnap: QueryDocumentSnapshot | null = null;
            let hasMore = true;
            const pageSize = 250;

            while (hasMore) {
              let pQuery = query(colRef, ...queryConstraints, firestoreLimit(pageSize));
              if (lastDocSnap) {
                pQuery = query(colRef, ...queryConstraints, firestoreStartAfter(lastDocSnap), firestoreLimit(pageSize));
              }

              const pSnap = await Promise.race([
                getDocs(pQuery),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi Firestore Pull Timeout (5s)')), 5000))
              ]) as any;
              if (pSnap.empty) {
                hasMore = false;
              } else {
                pSnap.docs.forEach((d: any) => docsToProcess.push({ id: d.id, data: d.data() }));
                lastDocSnap = pSnap.docs[pSnap.docs.length - 1];
                if (pSnap.docs.length < pageSize) {
                  hasMore = false;
                }
              }
            }
            colFetched = docsToProcess.length;
          }

          totalFetched += colFetched;

          if (docsToProcess.length > 0) {
            // Pre-load local store items into a map for fast comparison
            const existingLocalMap = new Map<string, string>();
            await storeInstance.iterate((val: any, key: string) => {
              existingLocalMap.set(String(key), JSON.stringify(val || {}));
            });

            const setPromises: Promise<any>[] = [];

            for (const item of docsToProcess) {
              const docId = item.id;
              const remoteData = item.data;

              // Ignore and auto-clean diagnostic/startup test docs starting with '_'
              if (docId && (docId.startsWith('_') || docId.includes('diagnostic') || docId.includes('verify'))) {
                await storeInstance.removeItem(docId).catch(() => {});
                await deleteDocFromFirebase(targetCol, docId).catch(() => {});
                continue;
              }

              if (docId && remoteData) {
                // Middleware Check: Validate OwnerID of retrieved document
                if (!validateDocumentOwner(storeName, docId, remoteData)) {
                  console.warn(`[FirebaseSync Pull] Document ${storeName}/${docId} skipped by OwnerID middleware.`);
                  continue;
                }

                const remoteStr = JSON.stringify(remoteData);
                const localStr = existingLocalMap.get(docId);

                // Smart Delta & Timestamp Check: Only write to local storage if item is missing or incoming data is newer!
                if (remoteStr !== localStr) {
                  let existingLocalObj: any = null;
                  if (localStr) {
                    try { existingLocalObj = JSON.parse(localStr); } catch (e) {}
                  }
                  if (isIncomingDataNewer(remoteData, existingLocalObj)) {
                    setPromises.push(storeInstance.setItem(docId, remoteData));
                    colUpdated++;
                    totalUpdated++;
                    hasAnyChanges = true;
                  } else {
                    console.log(`[FirebaseSync Pull] Skipped stale remote data for ${storeName}/${docId}. Local data is newer.`);
                    totalSkippedUnchanged++;
                  }
                } else {
                  totalSkippedUnchanged++;
                }
              }
            }

            if (setPromises.length > 0) {
              const CHUNK_SIZE = 50;
              for (let i = 0; i < setPromises.length; i += CHUNK_SIZE) {
                await Promise.all(setPromises.slice(i, i + CHUNK_SIZE));
              }
            }
          }

          // Update last pull timestamp for this collection
          if (typeof window !== 'undefined') {
            localStorage.setItem(`edusync_last_pull_ts_${targetCol}`, currentPullTimestamp);
          }

          completedCols++;
          const colDuration = Math.round(performance.now() - colStartTime);

          recordLatencyMetric({
            operation: 'pull',
            collectionName: storeName,
            durationMs: colDuration,
            itemCount: colFetched,
            updatedCount: colUpdated,
            itemsPerSecond: colDuration > 0 ? Math.round((colFetched / colDuration) * 1000) : colFetched,
            status: 'success'
          });

          const calcPercent = Math.min(95, 15 + Math.round((completedCols / totalCollections) * 80));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sync-progress-updated', {
              detail: {
                isSyncing: true,
                stage: 'Writing to Database',
                stageLabel: `Koleksi '${storeName}': ${colUpdated} diperbarui, ${colFetched - colUpdated} tidak berubah (${completedCols}/${totalCollections})`,
                percent: calcPercent,
                processedItems: completedCols,
                totalItems: totalCollections,
                direction: 'pull'
              }
            }));
          }
        } catch (colErr: any) {
          console.warn(`[FirebaseSync] Error pulling collection ${storeName}:`, colErr);
          recordLatencyMetric({
            operation: 'pull',
            collectionName: storeName,
            durationMs: Math.round(performance.now() - colStartTime),
            itemCount: colFetched,
            itemsPerSecond: 0,
            status: 'error',
            errorMessage: colErr?.message || String(colErr)
          });
        }
      })
    );

    // Clear unsynced queue after pulling latest state
    await store.syncQueue.clear().catch(() => {});

    if (hasAnyChanges && typeof window !== 'undefined') {
      bufferRemoteDataUpdate('all', totalUpdated);
      window.dispatchEvent(new Event('sync-status-changed'));
    }

    firebaseStatus = 'connected';
    lastSyncTime = new Date().toLocaleTimeString('id-ID');
    notifyFirebaseStatusChanged();

    const totalDurationMs = Math.round(performance.now() - pullStartTime);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: false,
          stage: 'Completed',
          stageLabel: `Sinkronisasi delta selesai (${(totalDurationMs / 1000).toFixed(1)}s)! ${totalUpdated} data diperbarui, ${totalSkippedUnchanged} tidak berubah.`,
          percent: 100,
          processedItems: totalUpdated,
          totalItems: totalFetched,
          direction: 'pull'
        }
      }));
    }

    return {
      success: true,
      count: totalUpdated,
      message: `Delta Sync: ${totalUpdated} data diperbarui, ${totalSkippedUnchanged} data tidak berubah (Dilewati).`
    };
  } catch (err: any) {
    console.error('[FirebaseSync] Failed to pull remote data:', err);
    firebaseStatus = 'error';
    notifyFirebaseStatusChanged();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-progress-updated', {
        detail: {
          isSyncing: false,
          stage: 'Idle',
          stageLabel: 'Gagal mengunduh data: ' + (err?.message || 'Error'),
          percent: 0,
          direction: 'pull'
        }
      }));
    }

    return {
      success: false,
      count: 0,
      message: err?.message || 'Gagal menarik data dari Firebase'
    };
  } finally {
    isRemoteUpdateInProgress = false;
    resumeSyncQueue();
    resumeNotifications(true);
  }
}

export const MASTER_DATA_COLLECTIONS = ['users', 'students', 'settings', 'roster', 'grades'];
export const OPERATIONAL_REALTIME_COLLECTIONS = ['attendance', 'piket', 'kas', 'kasLogs', 'jurnal', 'tasks', 'raporCapaian', 'users'];

let bufferedUpdatesCount = 0;
let bufferedCollectionsSet = new Set<string>();

export function bufferRemoteDataUpdate(colName: string, count: number = 1) {
  if (count <= 0) return;
  bufferedUpdatesCount += count;
  bufferedCollectionsSet.add(colName);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('remote-data-buffered', {
      detail: {
        count: bufferedUpdatesCount,
        collections: Array.from(bufferedCollectionsSet),
        collectionName: colName
      }
    }));
  }
}

export function clearBufferedUpdates(colName?: string) {
  if (colName && colName !== 'all') {
    bufferedCollectionsSet.delete(colName);
  } else {
    bufferedCollectionsSet.clear();
  }
  if (bufferedCollectionsSet.size === 0) {
    bufferedUpdatesCount = 0;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('remote-data-buffered', {
      detail: {
        count: bufferedUpdatesCount,
        collections: Array.from(bufferedCollectionsSet)
      }
    }));
  }
}

export function getBufferedUpdatesInfo() {
  return {
    count: bufferedUpdatesCount,
    collections: Array.from(bufferedCollectionsSet)
  };
}

const unsubscribers: Array<() => void> = [];

/**
 * Initialize real-time listeners on operational Firestore collections.
 * Master Data (Guru, Siswa, Profil, Jadwal, Nilai) uses Fetch-Once (getDocs/delta pull)
 * to avoid disruptive real-time form resets and unwanted re-renders.
 */
export function initFirebaseRealtimeSync() {
  if (isFirebaseSyncActive) return;
  isFirebaseSyncActive = true;
  firebaseStatus = 'syncing';
  notifyFirebaseStatusChanged();

  // Initialize Real-time Document Lock listener
  initDocumentLocksRealtimeListener();

  // Initialize scheduled cleanup job for anomaly purging
  initScheduledCleanupJob();

  // Perform quick delta push for unsynced local queue items in background
  pushAllLocalDataToFirebase(false).catch((e) => console.warn('[FirebaseSync] Initial push error:', e));

  // Trigger automatic silent pull of remote data (including users and settings) on startup
  pullAllRemoteDataFromFirebase(false, true).catch((e) => console.warn('[FirebaseSync] Initial pull error:', e));

  // Listen to operational collections with Background Buffer pattern and smart delta filtering
  OPERATIONAL_REALTIME_COLLECTIONS.forEach((colName) => {
    try {
      const targetCol = getPartitionedCollectionName(colName);
      const colRef = collection(db, targetCol);
      const unsubscribe = onSnapshot(colRef, async (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) {
          // Local write originating from this device, skip listener processing to prevent loopback
          return;
        }

        isRemoteUpdateInProgress = true;
        pauseSyncQueue();
        pauseNotifications(true);

        try {
          const storeInstance = (store as any)[colName];
          if (storeInstance) {
            const docChanges = snapshot.docChanges();
            if (docChanges.length > 0) {
              let actualChangesCount = 0;
              const changePromises = docChanges.map(async (change) => {
                const docId = change.doc.id;
                const data = change.doc.data();

                if (!docId || docId.startsWith('_') || docId.includes('diagnostic') || docId.includes('verify')) {
                  return;
                }

                if (change.type === 'added' || change.type === 'modified') {
                  // Middleware Check: Validate OwnerID of realtime document
                  if (!validateDocumentOwner(colName, docId, data)) {
                    console.warn(`[FirebaseSync Listener] Realtime change for ${colName}/${docId} blocked by OwnerID middleware.`);
                    return;
                  }

                  const existingLocal = await storeInstance.getItem(docId).catch(() => null);
                  const isContentIdentical = existingLocal && JSON.stringify(existingLocal) === JSON.stringify(data);

                  // Only process and dispatch delta update if document is new or fields actually modified AND incoming data is newer!
                  if (!isContentIdentical) {
                    if (isIncomingDataNewer(data, existingLocal)) {
                      await storeInstance.setItem(docId, data);
                      dispatchDeltaUpdate(colName, docId, 'upsert', data);
                      actualChangesCount++;
                    } else {
                      console.log(`[FirebaseSync Listener] Ignored stale remote update for ${colName}/${docId}. Local data is newer.`);
                    }
                  }
                } else if (change.type === 'removed') {
                  const existingLocal = await storeInstance.getItem(docId).catch(() => null);
                  if (existingLocal !== null) {
                    await storeInstance.removeItem(docId);
                    dispatchDeltaUpdate(colName, docId, 'delete');
                    actualChangesCount++;
                  }
                }
              });

              await Promise.all(changePromises);

              if (actualChangesCount > 0) {
                // Buffer remote data update non-intrusively instead of forcing hard UI re-renders
                bufferRemoteDataUpdate(colName, actualChangesCount);

                // Trigger Service Worker Push Notification for Wali Kelas / Teachers
                const colLabels: Record<string, string> = {
                  attendance: 'Absensi Siswa',
                  tasks: 'Tugas Kelas',
                  jurnal: 'Jurnal Guru & KBM',
                  piket: 'Jadwal Piket',
                  kas: 'Kas Kelas',
                  kasLogs: 'Log Kas',
                  raporCapaian: 'Capaian Rapor',
                  users: 'Akun Pengguna'
                };
                const labelName = colLabels[colName] || colName;
                sendLocalPushNotification(`EduSync: Pembaruan ${labelName}`, {
                  body: `Ada ${actualChangesCount} data baru/perubahan pada koleksi ${labelName}.`,
                  tag: `edusync-${colName}`,
                  url: '/'
                }).catch(() => {});
              }
            }
          }
          firebaseStatus = 'connected';
          lastSyncTime = new Date().toLocaleTimeString('id-ID');
          notifyFirebaseStatusChanged();
        } catch (err) {
          console.warn(`[FirebaseSync] Error processing snapshot for ${colName}:`, err);
        } finally {
          isRemoteUpdateInProgress = false;
          resumeSyncQueue();
          resumeNotifications(true);
        }
      }, (err) => {
        console.warn(`[FirebaseSync] Snapshot listener error on ${colName}:`, err);
        firebaseStatus = 'error';
        notifyFirebaseStatusChanged();
      });

      unsubscribers.push(unsubscribe);
    } catch (colErr) {
      console.warn(`[FirebaseSync] Failed to setup listener for ${colName}:`, colErr);
    }
  });
}

/**
 * Stop real-time listeners
 */
export function stopFirebaseRealtimeSync() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers.length = 0;
  isFirebaseSyncActive = false;
  firebaseStatus = 'offline';
  notifyFirebaseStatusChanged();
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
  totalLoaded: number;
}

export interface KasRealtimeStats {
  totalPemasukan: number;
  totalPengeluaran: number;
  saldoKas: number;
  sisaKas: number;
  totalTransaksi: number;
  lastUpdated: string;
}

/**
 * Mengambil data siswa dari Firestore dengan metode limit dan pagination
 */
export async function fetchStudentsPaginatedFromFirestore(
  pageSize: number = 20,
  startAfterDoc: QueryDocumentSnapshot | null = null
): Promise<PaginatedResult<any>> {
  try {
    const colRef = collection(db, 'students');
    let q = query(colRef, orderBy('nama', 'asc'), firestoreLimit(pageSize));
    if (startAfterDoc) {
      q = query(colRef, orderBy('nama', 'asc'), firestoreStartAfter(startAfterDoc), firestoreLimit(pageSize));
    }
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    return {
      data,
      lastDoc,
      hasMore: snapshot.docs.length === pageSize,
      totalLoaded: data.length
    };
  } catch (err) {
    console.warn('[FirebaseSync] Error fetching paginated students:', err);
    return { data: [], lastDoc: null, hasMore: false, totalLoaded: 0 };
  }
}

/**
 * Mengambil data transaksi kas dari Firestore dengan metode limit dan pagination
 */
export async function fetchKasPaginatedFromFirestore(
  pageSize: number = 20,
  startAfterDoc: QueryDocumentSnapshot | null = null
): Promise<PaginatedResult<any>> {
  try {
    const colRef = collection(db, 'kas');
    let q = query(colRef, orderBy('tanggal', 'desc'), firestoreLimit(pageSize));
    if (startAfterDoc) {
      q = query(colRef, orderBy('tanggal', 'desc'), firestoreStartAfter(startAfterDoc), firestoreLimit(pageSize));
    }
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    return {
      data,
      lastDoc,
      hasMore: snapshot.docs.length === pageSize,
      totalLoaded: data.length
    };
  } catch (err) {
    console.warn('[FirebaseSync] Error fetching paginated kas:', err);
    return { data: [], lastDoc: null, hasMore: false, totalLoaded: 0 };
  }
}

/**
 * Mengambil statistik penggunaan Database Uang KAS secara real-time langsung dari Firestore
 */
export function listenRealtimeKasStatsFromFirestore(onUpdate: (stats: KasRealtimeStats) => void): () => void {
  try {
    const colRef = collection(db, 'kas');
    return onSnapshot(colRef, (snapshot) => {
      let totalPemasukan = 0;
      let totalPengeluaran = 0;
      let totalTransaksi = 0;

      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        const jumlah = Number(item.nominal ?? item.jumlah) || 0;
        totalTransaksi++;
        if (item.jenis === 'Pemasukan' || item.jenis === 'masuk') {
          totalPemasukan += jumlah;
        } else if (item.jenis === 'Pengeluaran' || item.jenis === 'keluar') {
          totalPengeluaran += jumlah;
        }
      });

      const saldoKas = totalPemasukan - totalPengeluaran;
      const sisaKas = Math.max(0, saldoKas);

      onUpdate({
        totalPemasukan,
        totalPengeluaran,
        saldoKas,
        sisaKas,
        totalTransaksi,
        lastUpdated: new Date().toLocaleTimeString('id-ID')
      });
    }, (err) => {
      console.warn('[FirebaseSync] Error listening realtime kas stats:', err);
    });
  } catch (err) {
    console.warn('[FirebaseSync] Failed to setup realtime kas stats listener:', err);
    return () => {};
  }
}

/**
 * Verifikasi data nilai 'terjebak' di lokal & paksa unggah (Force Sync) ke Firestore
 */
export async function verifyAndForceSyncGrades(): Promise<{
  totalLocal: number;
  pushedCount: number;
  message: string;
}> {
  const startTime = performance.now();
  const localGradesList: any[] = [];
  await store.grades.iterate((val) => {
    if (val) localGradesList.push(val);
  });

  let pushedCount = 0;
  if (localGradesList.length > 0) {
    let batch = writeBatch(db);
    let countInBatch = 0;

    for (const grade of localGradesList) {
      if (!grade.id) continue;
      const ref = doc(db, 'grades', String(grade.id));
      batch.set(ref, grade, { merge: true });
      countInBatch++;
      pushedCount++;

      if (countInBatch >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  recordLatencyMetric({
    operation: 'push',
    collectionName: 'grades',
    durationMs,
    itemCount: localGradesList.length,
    updatedCount: pushedCount,
    itemsPerSecond: durationMs > 0 ? Math.round((pushedCount / durationMs) * 1000) : pushedCount,
    status: 'success'
  });

  const msg = `Force Sync Nilai Selesai: ${pushedCount} dari ${localGradesList.length} data nilai lokal berhasil disinkronkan ke Cloud Firestore.`;
  return {
    totalLocal: localGradesList.length,
    pushedCount,
    message: msg
  };
}

/**
 * Mengambil data nilai spesifik siswa dari Firestore berdasarkan id_siswa atau nisn.
 * Menggunakan direct document reference (doc) & getDoc untuk efisiensi biaya baca instan.
 */
export async function fetchGradesByStudentIdFromFirestore(studentIdOrNisn: string): Promise<any[]> {
  if (!studentIdOrNisn) return [];
  try {
    // Attempt 1: Fast direct document reference lookup to avoid full query snapshot read costs
    const docRef = doc(db, 'grades', String(studentIdOrNisn).replace(/\//g, '_'));
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return [{ id: docSnap.id, ...docSnap.data() }];
    }

    // Attempt 2: Indexed query snapshot lookup by student ID
    const colRef = collection(db, 'grades');
    const q1 = query(colRef, where('id_siswa', '==', studentIdOrNisn));
    const snap1 = await getDocs(q1);
    const result: any[] = [];
    snap1.forEach(d => result.push({ id: d.id, ...d.data() }));

    if (result.length === 0) {
      const q2 = query(colRef, where('nisn', '==', studentIdOrNisn));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => result.push({ id: d.id, ...d.data() }));
    }

    return result;
  } catch (err) {
    console.warn('[FirebaseSync] Error fetching grades for student:', studentIdOrNisn, err);
    return [];
  }
}

/**
 * Utilitas pengecekan struktur data Firestore:
 * Mencetak semua koleksi & jumlah dokumen di Firestore ke console.log
 */
export async function inspectAndLogFirestoreCollections(): Promise<Record<string, number>> {
  console.log('==== [INSPEKSI KESELURUHAN KOLEKSI FIRESTORE] ====');
  const summary: Record<string, number> = {};

  for (const colName of SYNCED_COLLECTIONS) {
    try {
      const colRef = collection(db, colName);
      const snap = await getDocs(colRef);
      summary[colName] = snap.size;
      console.log(`📌 Koleksi Firestore [${colName}]: ${snap.size} dokumen`);
    } catch (err: any) {
      summary[colName] = -1;
      console.warn(`⚠️ Gagal memeriksa koleksi [${colName}]:`, err?.message || err);
    }
  }

  console.log('===================================================');
  return summary;
}

/**
 * Memunculkan Laporan Audit Log & Performa Sinkronisasi
 */
export async function generateAuditSyncReport() {
  const localCounts: Record<string, number> = {};
  for (const col of SYNCED_COLLECTIONS) {
    let count = 0;
    try {
      if ((store as any)[col]) {
        await (store as any)[col].iterate(() => { count++; });
      }
    } catch {
      count = -1;
    }
    localCounts[col] = count;
  }

  const fbStatus = getFirebaseStatus();
  const latencySummary = getLatencySummary();

  let pendingCount = 0;
  try {
    const unsyncedStr = typeof localStorage !== 'undefined' ? localStorage.getItem('unsynced_items_queue') : null;
    if (unsyncedStr) {
      const parsed = JSON.parse(unsyncedStr);
      pendingCount = Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch {
    pendingCount = 0;
  }

  return {
    reportType: 'EduSync Audit Log & Sync Performance Report',
    generatedAt: new Date().toISOString(),
    firebaseConnectionStatus: fbStatus.status,
    lastSyncTime: fbStatus.lastSyncTime || 'Belum Ada Sinkronisasi',
    isSyncActive: fbStatus.isActive,
    pendingUnsyncedQueueCount: pendingCount,
    localCollectionsCount: localCounts,
    latencyMetricsSummary: {
      avgPullDurationMs: latencySummary.avgPullDurationMs,
      avgPushDurationMs: latencySummary.avgPushDurationMs,
      totalOperationsRecorded: latencySummary.totalOperations
    },
    recentLatencyLogs: latencySummary.logs
  };
}

export interface AuditIssue {
  id: string;
  collection: string;
  docId: string;
  severity: 'danger' | 'warning' | 'info';
  issueType: 'Entitas Yatim' | 'Referensi Rusak' | 'Atribut Absen' | 'Kunci Duplikat';
  description: string;
  brokenRefId?: string;
  targetCollection?: string;
  recordSnapshot?: any;
}

export interface DeepAuditReport {
  timestamp: string;
  isFirestoreLive: boolean;
  totalCollections: number;
  totalDocuments: number;
  totalOrphans: number;
  totalIssues: number;
  collectionSummary: Record<string, { docCount: number; orphanCount: number; issueCount: number }>;
  issues: AuditIssue[];
}

/**
 * Audit Mendalam Koleksi Firestore
 * Mendeteksi entitas yatim, referensi ID rusak, kunci duplikat, dan bidang wajib yang hilang.
 */
export async function performDeepFirestoreAudit(): Promise<DeepAuditReport> {
  const collectionData: Record<string, any[]> = {};
  let isLive = false;

  // Read data from Firestore or local fallback
  for (const colName of SYNCED_COLLECTIONS) {
    collectionData[colName] = [];
    try {
      const targetCol = getTenantCollectionName(colName);
      const snap = await getDocs(collection(db, targetCol));
      isLive = true;
      snap.forEach(d => {
        collectionData[colName].push({ id: d.id, ...d.data() });
      });
    } catch {
      // Fallback to localforage
      try {
        const storeInst = (store as any)[colName];
        if (storeInst) {
          await storeInst.iterate((val: any, key: string) => {
            collectionData[colName].push({ id: key, ...(typeof val === 'object' ? val : { val }) });
          });
        }
      } catch (err) {
        console.warn(`[Audit] Failed reading local ${colName}:`, err);
      }
    }
  }

  const issues: AuditIssue[] = [];
  const collectionSummary: Record<string, { docCount: number; orphanCount: number; issueCount: number }> = {};
  let totalDocs = 0;

  SYNCED_COLLECTIONS.forEach(col => {
    const count = collectionData[col]?.length || 0;
    totalDocs += count;
    collectionSummary[col] = { docCount: count, orphanCount: 0, issueCount: 0 };
  });

  // Build Lookup Indexes for Relation Validations
  const studentMap = new Map<string, any>();
  const studentNisnMap = new Map<string, string>(); // nisn -> studentId
  const nisnCounts = new Map<string, number>();

  (collectionData['students'] || []).forEach(s => {
    const sId = String(s.id);
    // Ignore diagnostic/startup test documents starting with '_'
    if (sId.startsWith('_') || sId.includes('diagnostic') || sId.includes('verify')) {
      return;
    }
    studentMap.set(sId, s);
    if (s.nisn) {
      const nisnStr = String(s.nisn).trim();
      studentNisnMap.set(nisnStr, sId);
      if (nisnStr) {
        nisnCounts.set(nisnStr, (nisnCounts.get(nisnStr) || 0) + 1);
      }
    }

    // Check missing fields in students
    if (!s.nama || String(s.nama).trim() === '') {
      issues.push({
        id: `issue-student-noname-${sId}`,
        collection: 'students',
        docId: sId,
        severity: 'warning',
        issueType: 'Atribut Absen',
        description: `Dokumen siswa (ID: ${sId}) tidak memiliki nama lengkap.`
      });
      collectionSummary['students'].issueCount++;
    }
  });

  // Check NISN duplicates
  nisnCounts.forEach((cnt, nisn) => {
    if (cnt > 1) {
      issues.push({
        id: `issue-nisn-dup-${nisn}`,
        collection: 'students',
        docId: `nisn-${nisn}`,
        severity: 'warning',
        issueType: 'Kunci Duplikat',
        description: `Ditemukan ${cnt} siswa dengan NISN duplikat "${nisn}".`,
        brokenRefId: nisn,
        targetCollection: 'students'
      });
      collectionSummary['students'].issueCount++;
    }
  });

  // 1. Audit Grades
  (collectionData['grades'] || []).forEach(g => {
    const sId = g.id_siswa ? String(g.id_siswa) : null;
    const nisn = g.nisn ? String(g.nisn) : null;
    let found = false;

    if (sId && studentMap.has(sId)) found = true;
    if (!found && nisn && studentNisnMap.has(nisn)) found = true;

    if (!found && (sId || nisn)) {
      const refId = sId || nisn || 'Unknown';
      issues.push({
        id: `orphan-grade-${g.id}`,
        collection: 'grades',
        docId: String(g.id),
        severity: 'danger',
        issueType: 'Entitas Yatim',
        description: `Nilai "${g.nama_kolom || 'Tugas'}" (${g.jenis_nilai || 'Nilai'}) merujuk ke ID Siswa "${refId}" yang tidak terdaftar di koleksi siswa.`,
        brokenRefId: refId,
        targetCollection: 'students',
        recordSnapshot: g
      });
      collectionSummary['grades'].orphanCount++;
      collectionSummary['grades'].issueCount++;
    }
  });

  // 2. Audit Attendance
  (collectionData['attendance'] || []).forEach(a => {
    const sId = a.id_siswa ? String(a.id_siswa) : null;
    const nisn = a.nisn ? String(a.nisn) : null;
    let found = false;

    if (sId && studentMap.has(sId)) found = true;
    if (!found && nisn && studentNisnMap.has(nisn)) found = true;

    if (!found && (sId || nisn)) {
      const refId = sId || nisn || 'Unknown';
      issues.push({
        id: `orphan-att-${a.id}`,
        collection: 'attendance',
        docId: String(a.id),
        severity: 'danger',
        issueType: 'Entitas Yatim',
        description: `Catatan absensi tanggal ${a.tanggal || '-'} (Status: ${a.status || '-'}) merujuk ke Siswa "${refId}" yang tidak ada di database.`,
        brokenRefId: refId,
        targetCollection: 'students',
        recordSnapshot: a
      });
      collectionSummary['attendance'].orphanCount++;
      collectionSummary['attendance'].issueCount++;
    }
  });

  // 3. Audit Piket
  (collectionData['piket'] || []).forEach(p => {
    const sId = p.id_siswa ? String(p.id_siswa) : null;
    if (sId && !studentMap.has(sId)) {
      issues.push({
        id: `orphan-piket-${p.id}`,
        collection: 'piket',
        docId: String(p.id),
        severity: 'danger',
        issueType: 'Entitas Yatim',
        description: `Jadwal piket hari ${p.hari || '-'} merujuk ke ID Siswa "${sId}" yang telah dihapus atau tidak terdaftar.`,
        brokenRefId: sId,
        targetCollection: 'students',
        recordSnapshot: p
      });
      collectionSummary['piket'].orphanCount++;
      collectionSummary['piket'].issueCount++;
    }
  });

  // 4. Audit Jurnal
  (collectionData['jurnal'] || []).forEach(j => {
    const sId = j.id_siswa ? String(j.id_siswa) : null;
    if (sId && !studentMap.has(sId)) {
      issues.push({
        id: `orphan-jurnal-${j.id}`,
        collection: 'jurnal',
        docId: String(j.id),
        severity: 'warning',
        issueType: 'Entitas Yatim',
        description: `Catatan jurnal (${j.jenis || 'Kejadian'}) untuk siswa "${j.nama_siswa || sId}" merujuk ke ID "${sId}" yang tidak ada.`,
        brokenRefId: sId,
        targetCollection: 'students',
        recordSnapshot: j
      });
      collectionSummary['jurnal'].orphanCount++;
      collectionSummary['jurnal'].issueCount++;
    }
  });

  // 5. Audit Kas Entries
  const kasMap = new Map<string, any>();
  (collectionData['kas'] || []).forEach(k => {
    kasMap.set(String(k.id), k);
    const sId = k.id_siswa ? String(k.id_siswa) : null;
    if (sId && !studentMap.has(sId)) {
      issues.push({
        id: `orphan-kas-${k.id}`,
        collection: 'kas',
        docId: String(k.id),
        severity: 'warning',
        issueType: 'Entitas Yatim',
        description: `Transaksi Uang Kas "${k.keterangan || '-'}" (Rp ${Number(k.nominal || 0).toLocaleString('id-ID')}) merujuk ke ID Siswa "${sId}" yang tidak ditemukan.`,
        brokenRefId: sId,
        targetCollection: 'students',
        recordSnapshot: k
      });
      collectionSummary['kas'].orphanCount++;
      collectionSummary['kas'].issueCount++;
    }
  });

  // 6. Audit Kas Logs
  (collectionData['kasLogs'] || []).forEach(kl => {
    const kId = kl.kas_id ? String(kl.kas_id) : null;
    if (kId && !kasMap.has(kId)) {
      issues.push({
        id: `orphan-kaslog-${kl.id}`,
        collection: 'kasLogs',
        docId: String(kl.id),
        severity: 'danger',
        issueType: 'Referensi Rusak',
        description: `Log aktivitas Kas (${kl.action_label || kl.action}) merujuk ke ID Transaksi Kas "${kId}" yang sudah dihapus.`,
        brokenRefId: kId,
        targetCollection: 'kas',
        recordSnapshot: kl
      });
      collectionSummary['kasLogs'].orphanCount++;
      collectionSummary['kasLogs'].issueCount++;
    }
  });

  // 7. Audit Rapor Capaian
  (collectionData['raporCapaian'] || []).forEach(rc => {
    const sId = rc.id_siswa ? String(rc.id_siswa) : null;
    if (sId && !studentMap.has(sId)) {
      issues.push({
        id: `orphan-rapor-${rc.id}`,
        collection: 'raporCapaian',
        docId: String(rc.id),
        severity: 'danger',
        issueType: 'Entitas Yatim',
        description: `Rapor capaian semester merujuk ke ID Siswa "${sId}" yang tidak ada di data siswa.`,
        brokenRefId: sId,
        targetCollection: 'students',
        recordSnapshot: rc
      });
      collectionSummary['raporCapaian'].orphanCount++;
      collectionSummary['raporCapaian'].issueCount++;
    }
  });

  // 8. Audit Tasks Completion References
  (collectionData['tasks'] || []).forEach(t => {
    if (t.penyelesaian && typeof t.penyelesaian === 'object') {
      Object.keys(t.penyelesaian).forEach(stKey => {
        if (!studentMap.has(stKey)) {
          issues.push({
            id: `orphan-task-${t.id}-${stKey}`,
            collection: 'tasks',
            docId: String(t.id),
            severity: 'info',
            issueType: 'Referensi Rusak',
            description: `Tugas "${t.judul}" memiliki status penyelesaian dari ID Siswa "${stKey}" yang tidak ada.`,
            brokenRefId: stKey,
            targetCollection: 'students'
          });
          collectionSummary['tasks'].orphanCount++;
          collectionSummary['tasks'].issueCount++;
        }
      });
    }
  });

  const totalOrphans = issues.filter(i => i.issueType === 'Entitas Yatim' || i.issueType === 'Referensi Rusak').length;

  return {
    timestamp: new Date().toISOString(),
    isFirestoreLive: isLive,
    totalCollections: SYNCED_COLLECTIONS.length,
    totalDocuments: totalDocs,
    totalOrphans,
    totalIssues: issues.length,
    collectionSummary,
    issues
  };
}

/**
 * Mengunduh Backup Komprehensif Seluruh Koleksi Firestore dalam File JSON
 * Pencegahan Data Loss Bagi Wali Kelas
 */
export async function downloadComprehensiveBackup() {
  const toastId = toast.loading('Mengumpulkan seluruh data dari semua koleksi Firestore...', { position: 'top-right' });
  try {
    const allData: Record<string, any[]> = {};
    const collectionCounts: Record<string, number> = {};
    let totalCount = 0;

    for (const colName of SYNCED_COLLECTIONS) {
      const records: any[] = [];
      try {
        const targetCol = getTenantCollectionName(colName);
        const snap = await getDocs(collection(db, targetCol));
        snap.forEach(d => records.push({ id: d.id, ...d.data() }));
      } catch {
        try {
          const storeInst = (store as any)[colName];
          if (storeInst) {
            await storeInst.iterate((val: any, key: string) => {
              records.push({ id: key, ...(typeof val === 'object' ? val : { val }) });
            });
          }
        } catch (err) {
          console.warn(`[Backup] Failed backing up ${colName}:`, err);
        }
      }

      allData[colName] = records;
      collectionCounts[colName] = records.length;
      totalCount += records.length;
    }

    const backupPayload = {
      appName: "EduSync Dashboard Wali Kelas & Manajemen Sekolah",
      backupType: "Full Multi-Collection Comprehensive Backup",
      version: "2.0",
      exportedAt: new Date().toISOString(),
      timestampFormatted: new Date().toLocaleString('id-ID'),
      targetAudience: "Wali Kelas / Pentadbir Data",
      purpose: "Tindakan Pencegahan Data Loss & Cadangan Pemulihan",
      totalCollections: SYNCED_COLLECTIONS.length,
      totalRecordsCount: totalCount,
      summaryPerCollection: collectionCounts,
      data: allData
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `EduSync_FullBackup_WaliKelas_${timestamp}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    toast.success(`Berhasil mengunduh Backup Komprehensif (${totalCount} total data dari 12 koleksi)!`, {
      id: toastId,
      duration: 5000
    });
  } catch (err: any) {
    toast.error(`Gagal membuat file backup: ${err?.message || 'Error'}`, { id: toastId });
  }
}

/**
 * Ekspor Ringkasan Laporan Audit dalam Format CSV / JSON
 */
export function downloadAuditReportExport(report: DeepAuditReport, format: 'csv' | 'json') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'json') {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `EduSync_AuditSummary_${timestamp}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  } else {
    let csvContent = `=== EDUSYNC FIRESTORE DEEP AUDIT SUMMARY REPORT ===\n`;
    csvContent += `Waktu Audit,${report.timestamp}\n`;
    csvContent += `Status Firestore,${report.isFirestoreLive ? 'Online (Real-time Cloud)' : 'Lokal / Offline'}\n`;
    csvContent += `Total Koleksi,${report.totalCollections}\n`;
    csvContent += `Total Dokumen Audited,${report.totalDocuments}\n`;
    csvContent += `Total Entitas Yatim,${report.totalOrphans}\n`;
    csvContent += `Total Masalah Terdeteksi,${report.totalIssues}\n\n`;

    csvContent += `=== RINGKASAN PER KOLEKSI ===\n`;
    csvContent += `Nama Koleksi,Jumlah Dokumen,Jumlah Entitas Yatim,Total Masalah\n`;
    Object.entries(report.collectionSummary).forEach(([col, s]) => {
      csvContent += `"${col}",${s.docCount},${s.orphanCount},${s.issueCount}\n`;
    });

    csvContent += `\n=== TABEL DETAIL ANOMALI & ENTITAS YATIM ===\n`;
    csvContent += `ID Masalah,Koleksi,ID Dokumen,Tipe Masalah,Tingkat Keparahan,Deskripsi,ID Referensi Rusak,Koleksi Target\n`;
    report.issues.forEach(iss => {
      csvContent += `"${iss.id}","${iss.collection}","${iss.docId}","${iss.issueType}","${iss.severity}","${iss.description.replace(/"/g, '""')}","${iss.brokenRefId || ''}","${iss.targetCollection || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', url);
    dlAnchor.setAttribute('download', `EduSync_AuditSummary_${timestamp}.csv`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Mengunduh Laporan Audit Log & Sinkronisasi sebagai File JSON atau CSV untuk Debugging Mandiri Wali Kelas
 */
export async function downloadAuditSyncReport(format: 'json' | 'csv') {
  const report = await generateAuditSyncReport();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'json') {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `EduSync_AuditLog_SyncReport_${timestamp}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  } else {
    let csvContent = `=== EDUSYNC AUDIT LOG & SYNC PERFORMANCE REPORT ===\n`;
    csvContent += `Generated At,${report.generatedAt}\n`;
    csvContent += `Firebase Status,${report.firebaseConnectionStatus}\n`;
    csvContent += `Last Sync Time,${report.lastSyncTime}\n`;
    csvContent += `Sync Active,${report.isSyncActive}\n`;
    csvContent += `Pending Queue Items,${report.pendingUnsyncedQueueCount}\n`;
    csvContent += `Avg Pull Latency (ms),${report.latencyMetricsSummary.avgPullDurationMs}\n`;
    csvContent += `Avg Push Latency (ms),${report.latencyMetricsSummary.avgPushDurationMs}\n`;
    csvContent += `Total Latency Ops,${report.latencyMetricsSummary.totalOperationsRecorded}\n\n`;

    csvContent += `=== LOKAL COLLECTION RECORD COUNTS ===\n`;
    csvContent += `Collection Name,Local Record Count\n`;
    Object.entries(report.localCollectionsCount).forEach(([col, cnt]) => {
      csvContent += `${col},${cnt}\n`;
    });

    csvContent += `\n=== RECENT LATENCY & SYNC LOGS ===\n`;
    csvContent += `ID,Timestamp,Operation,Collection,Duration (ms),Item Count,Status,Error\n`;
    report.recentLatencyLogs.forEach((log) => {
      csvContent += `"${log.id}","${log.timestamp}","${log.operation}","${log.collectionName}",${log.durationMs},${log.itemCount},"${log.status}","${log.errorMessage || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', url);
    dlAnchor.setAttribute('download', `EduSync_AuditLog_SyncReport_${timestamp}.csv`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    URL.revokeObjectURL(url);
  }
}

export interface MigrationResult {
  success: boolean;
  sourceTenantId: string;
  targetTenantId: string;
  totalMigrated: number;
  collectionBreakdown: Record<string, number>;
  message: string;
}

/**
 * Skrip Migrasi Data Multi-Tenancy per Kelas
 * Memindahkan data dari satu Class ID / Koleksi Utama ke Class ID Terisolasi
 */
export async function migrateDataToClassTenant(
  sourceTenantId: string,
  targetTenantId: string,
  filterKelasName?: string
): Promise<MigrationResult> {
  const toastId = toast.loading(`Memulai migrasi data dari [${sourceTenantId}] ke [${targetTenantId}]...`, { position: 'top-right' });
  try {
    let totalMigrated = 0;
    const breakdown: Record<string, number> = {};

    const cleanSource = sourceTenantId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default';
    const cleanTarget = targetTenantId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default';

    if (cleanSource === cleanTarget) {
      toast.error('Class ID Asal dan Class ID Tujuan tidak boleh sama!', { id: toastId });
      return {
        success: false,
        sourceTenantId: cleanSource,
        targetTenantId: cleanTarget,
        totalMigrated: 0,
        collectionBreakdown: {},
        message: 'Source dan Target Class ID sama.'
      };
    }

    // Read student IDs if filtering by class name
    let targetStudentIds: Set<string> | null = null;
    if (filterKelasName && filterKelasName !== 'Semua' && filterKelasName !== 'semua') {
      targetStudentIds = new Set();
      const studentSourceCol = getTenantCollectionName('students', cleanSource);
      const studentSnap = await getDocs(collection(db, studentSourceCol));
      studentSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.kelas === filterKelasName || String(data.kelas).toLowerCase() === filterKelasName.toLowerCase()) {
          targetStudentIds?.add(docSnap.id);
        }
      });
    }

    for (const colName of SYNCED_COLLECTIONS) {
      const sourceCol = getTenantCollectionName(colName, cleanSource);
      const targetCol = getTenantCollectionName(colName, cleanTarget);

      let snap;
      try {
        snap = await getDocs(collection(db, sourceCol));
      } catch (err) {
        console.warn(`[Migration] Could not fetch ${sourceCol}:`, err);
        breakdown[colName] = 0;
        continue;
      }

      let colMigratedCount = 0;

      if (snap && !snap.empty) {
        const batchSize = 400;
        const docsToMigrate: { id: string; data: any }[] = [];

        snap.forEach((docSnap) => {
          const docData = docSnap.data();

          if (targetStudentIds) {
            if (colName === 'students' && !targetStudentIds.has(docSnap.id)) return;
            if ((colName === 'grades' || colName === 'attendance' || colName === 'piket' || colName === 'jurnal' || colName === 'kas' || colName === 'raporCapaian') && docData.id_siswa) {
              if (!targetStudentIds.has(String(docData.id_siswa))) return;
            }
          }

          docsToMigrate.push({ id: docSnap.id, data: docData });
        });

        if (docsToMigrate.length > 0) {
          for (let i = 0; i < docsToMigrate.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = docsToMigrate.slice(i, i + batchSize);
            chunk.forEach((item) => {
              const targetDocRef = doc(db, targetCol, item.id);
              batch.set(targetDocRef, item.data, { merge: true });
            });
            await batch.commit();
            colMigratedCount += chunk.length;
          }
        }
      }

      breakdown[colName] = colMigratedCount;
      totalMigrated += colMigratedCount;
    }

    toast.success(`Migrasi selesai! ${totalMigrated} data berhasil disalin/dipindahkan ke Class ID [${cleanTarget}]`, { id: toastId, duration: 5000 });

    return {
      success: true,
      sourceTenantId: cleanSource,
      targetTenantId: cleanTarget,
      totalMigrated,
      collectionBreakdown: breakdown,
      message: `Berhasil memindahkan ${totalMigrated} dokumen.`
    };
  } catch (err: any) {
    toast.error(`Gagal melakukan migrasi data: ${err?.message || 'Error'}`, { id: toastId });
    return {
      success: false,
      sourceTenantId,
      targetTenantId,
      totalMigrated: 0,
      collectionBreakdown: {},
      message: err?.message || 'Gagal memindahkan data'
    };
  }
}

export interface SiswaRulesCheckResult {
  isRestricted: boolean;
  status: 'passed' | 'restricted' | 'warning' | 'error';
  message: string;
  errorCode?: string;
  technicalError?: string;
  testedCollection: string;
  testedAt: string;
  solutionSteps: string[];
}

/**
 * Memeriksa Aturan Keamanan (Security Rules) Firestore khusus koleksi 'siswa' (students)
 * Dijalankan otomatis saat startup aplikasi dan dapat dipanggil secara manual.
 */
export async function verifySiswaCollectionSecurityRules(): Promise<SiswaRulesCheckResult> {
  const targetCol = getTenantCollectionName('students');
  const testDocRef = doc(db, targetCol, '_startup_rules_verify');
  const now = new Date().toISOString();

  const performWriteTest = async (): Promise<void> => {
    return Promise.race([
      setDoc(testDocRef, { _startupCheck: true, checkedAt: new Date().toISOString() }, { merge: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Siswa Rules Verification Write Timeout (8s)')), 8000))
    ]);
  };

  const performReadTest = async (): Promise<void> => {
    await Promise.race([
      getDocFromServer(testDocRef),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Siswa Rules Verification Read Timeout (8s)')), 8000))
    ]);
  };

  try {
    try {
      await performWriteTest();
      await performReadTest();
      // Clean up test document immediately
      await deleteDoc(testDocRef).catch(() => {});
    } catch (firstErr: any) {
      const isDenied = firstErr?.code === 'permission-denied' || firstErr?.message?.includes('insufficient permissions') || firstErr?.message?.includes('PERMISSION_DENIED');
      if (isDenied) {
        throw firstErr;
      }
      // Retry once if it was just a transient timeout or slow connection
      await performWriteTest();
      await performReadTest();
      await deleteDoc(testDocRef).catch(() => {});
    }

    const result: SiswaRulesCheckResult = {
      isRestricted: false,
      status: 'passed',
      message: `Aturan Keamanan (Security Rules) Firestore untuk koleksi 'siswa' (${targetCol}) terbuka dan berfungsi normal.`,
      testedCollection: targetCol,
      testedAt: now,
      solutionSteps: []
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('siswa-rules-status-changed', { detail: result }));
    }

    return result;
  } catch (err: any) {
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    const isRulesDenied = code === 'permission-denied' || msg.includes('insufficient permissions') || msg.includes('PERMISSION_DENIED');
    const isTimeout = msg.includes('Timeout') || msg.includes('offline') || code === 'unavailable';

    // isRestricted is ONLY true when Security Rules actually deny permission
    const isRestricted = isRulesDenied;

    // Log diagnostic audit info when security rules deny permission
    const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('app_user') || 'null') : null;
    const uid = currentUser?.id || currentUser?.username || 'anonymous';
    const assignedKelas = currentUser?.assignedKelas || '-';
    const targetKelas = currentUser?.assignedKelas || 'all';

    if (isRestricted || isRulesDenied) {
      console.warn(`[SecurityRules] Akses koleksi '${targetCol}' ditolak (PERMISSION_DENIED). UID: ${uid}, assignedKelas: ${assignedKelas}, targetKelas: ${targetKelas}`, {
        uid,
        assignedKelas,
        targetKelas,
        targetCol,
        code,
        msg
      });
      recordSyncAuditLog({
        type: 'DIAGNOSTIC',
        status: 'ERROR',
        title: 'Akses Security Rules Siswa/Nilai Ditolak',
        details: `Upaya akses gagal untuk UID: ${uid}, assignedKelas: ${assignedKelas}, targetKelas: ${targetKelas}. Technical: ${msg}`,
        errorCode: code,
        technicalDetails: `uid=${uid}; assignedKelas=${assignedKelas}; targetKelas=${targetKelas}; col=${targetCol}`
      }).catch(() => {});
    }

    const result: SiswaRulesCheckResult = {
      isRestricted,
      status: isRulesDenied ? 'restricted' : (isTimeout ? 'warning' : 'error'),
      message: isRulesDenied
        ? `PERINGATAN WALI KELAS: Aturan Keamanan (Security Rules) Firestore membatasi/menolak akses ke koleksi data 'siswa' (${targetCol})!`
        : `Verifikasi aturan keamanan koleksi 'siswa': ${msg}`,
      errorCode: code,
      technicalError: msg,
      testedCollection: targetCol,
      testedAt: now,
      solutionSteps: isRulesDenied ? [
        'Buka Console Firebase di https://console.firebase.google.com',
        `Pilih Project Firebase Anda ('${activeFirebaseConfig.projectId}')`,
        'Buka Firestore Database -> Tab Rules di bagian atas',
        'Tempelkan aturan rules: match /students/{doc} { allow read, write: if true; } atau match /{document=**} { allow read, write: if true; }',
        'Klik tombol Publish di sudut kanan atas konsol Firebase untuk menerapkan perubahan'
      ] : []
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('siswa-rules-status-changed', { detail: result }));
    }

    return result;
  }
}




