import { store } from './store';
import { getCurrentUser } from './rbac';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import { getTenantCollectionName } from './firebaseSync';
import { collection, doc, setDoc, getDocs, getDocsFromServer, query, limit } from 'firebase/firestore';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO String
  user_id?: string;
  username: string;
  user_name: string;
  user_role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'SETTINGS' | 'SYSTEM' | 'IMPORT_ACTION' | 'USER_ADDITION';
  entity: string; // e.g., 'Siswa', 'Nilai', 'Absensi', 'Jurnal', 'Kas', 'Pengguna', 'Pengaturan', 'Import', 'UserAddition'
  entity_id?: string;
  details: string;
  previous_value?: any;
  new_value?: any;
  persistence_status?: 'PERSISTED_TO_FIRESTORE' | 'LOCAL_ONLY' | 'FIRESTORE_FAILED';
  error_message?: string;
  propagation_ms?: number;
  payload_bytes?: number;
}

function sanitizeValueForAudit(val: any) {
  if (!val) return null;
  if (typeof val !== 'object') return val;
  const clone = JSON.parse(JSON.stringify(val));
  if (clone.password) clone.password = '******';
  if (clone.jawaban_keamanan) clone.jawaban_keamanan = '******';
  return clone;
}

/**
 * Record a centralized audit log entry (both locally in IndexedDB and remotely in Cloud Firestore audit_logs)
 */
export async function logAuditEvent(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'SETTINGS' | 'SYSTEM' | 'IMPORT_ACTION' | 'USER_ADDITION';
  entity: string;
  entity_id?: string;
  details: string;
  previous_value?: any;
  new_value?: any;
  user?: any;
  persistence_status?: 'PERSISTED_TO_FIRESTORE' | 'LOCAL_ONLY' | 'FIRESTORE_FAILED';
}): Promise<AuditLogEntry | null> {
  try {
    const actor = params.user || getCurrentUser();
    const entryId = uuidv4();
    const prevSan = params.previous_value ? sanitizeValueForAudit(params.previous_value) : null;
    const nextSan = params.new_value ? sanitizeValueForAudit(params.new_value) : null;
    
    // Estimate payload size in bytes
    const payloadStr = JSON.stringify({
      entity: params.entity,
      details: params.details,
      prev: prevSan,
      next: nextSan
    });
    const payloadBytes = typeof TextEncoder !== 'undefined' 
      ? new TextEncoder().encode(payloadStr).length 
      : payloadStr.length * 2;

    const entry: AuditLogEntry = {
      id: entryId,
      timestamp: new Date().toISOString(),
      user_id: actor?.id || 'system',
      username: actor?.username || 'system',
      user_name: actor?.name || 'Sistem Admin',
      user_role: actor?.role || 'admin',
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id || '',
      details: params.details,
      previous_value: prevSan,
      new_value: nextSan,
      persistence_status: params.persistence_status || 'PERSISTED_TO_FIRESTORE',
      payload_bytes: payloadBytes,
      propagation_ms: 0
    };

    // 1. Store in localforage auditLogs store
    await store.auditLogs.setItem(entry.id, entry);

    // 2. Asynchronously persist to Firestore 'audit_logs' collection
    const startTime = performance.now();
    try {
      const targetCol = getTenantCollectionName('audit_logs');
      const docRef = doc(db, targetCol, entry.id);
      await setDoc(docRef, entry);
      const latencyMs = Math.round(performance.now() - startTime);
      entry.propagation_ms = latencyMs;
      entry.persistence_status = 'PERSISTED_TO_FIRESTORE';
      await store.auditLogs.setItem(entry.id, entry);
    } catch (fsErr: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      console.warn('[auditLogger] FireStore write failed, saved locally:', fsErr);
      entry.propagation_ms = latencyMs;
      entry.persistence_status = 'FIRESTORE_FAILED';
      entry.error_message = fsErr?.message || String(fsErr);
      await store.auditLogs.setItem(entry.id, entry).catch(() => {});
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('audit-log-added', { detail: entry }));
    }
    return entry;
  } catch (err) {
    console.error('Failed to write audit log:', err);
    return null;
  }
}

/**
 * Retrieve all audit logs sorted by newest first
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const logs: AuditLogEntry[] = [];
  try {
    await store.auditLogs.iterate((log: AuditLogEntry) => {
      if (log && log.timestamp) {
        logs.push(log);
      }
    });
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.error('Failed to read audit logs:', err);
  }
  return logs;
}

/**
 * Fetch audit logs directly from the 'audit_logs' collection in Cloud Firestore
 */
export async function fetchFirestoreAuditLogs(maxCount: number = 200): Promise<AuditLogEntry[]> {
  try {
    const targetCol = getTenantCollectionName('audit_logs');
    const colRef = collection(db, targetCol);
    const q = query(colRef, limit(maxCount));
    const snap = await getDocsFromServer(q).catch(() => getDocs(q));

    const firestoreLogs: AuditLogEntry[] = [];
    if (snap && !snap.empty) {
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as AuditLogEntry;
        if (data && data.timestamp) {
          firestoreLogs.push({
            ...data,
            id: data.id || docSnap.id,
            persistence_status: 'PERSISTED_TO_FIRESTORE'
          });
        }
      });
    }

    // Sort by timestamp newest first
    firestoreLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return firestoreLogs;
  } catch (err) {
    console.warn('[fetchFirestoreAuditLogs] Failed to fetch remote audit logs from Firestore, falling back to local audit logs:', err);
    return await getAuditLogs();
  }
}

/**
 * Clear all audit logs
 */
export async function clearAuditLogs(): Promise<void> {
  try {
    await store.auditLogs.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
    }
  } catch (err) {
    console.error('Failed to clear audit logs:', err);
  }
}
