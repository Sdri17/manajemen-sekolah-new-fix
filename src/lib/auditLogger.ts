import { store } from './store';
import { getCurrentUser } from './rbac';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO String
  user_id?: string;
  username: string;
  user_name: string;
  user_role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'SETTINGS' | 'SYSTEM';
  entity: string; // e.g., 'Siswa', 'Nilai', 'Absensi', 'Jurnal', 'Kas', 'Pengguna', 'Pengaturan'
  entity_id?: string;
  details: string;
  previous_value?: any;
  new_value?: any;
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
 * Record a centralized audit log entry
 */
export async function logAuditEvent(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'SETTINGS' | 'SYSTEM';
  entity: string;
  entity_id?: string;
  details: string;
  previous_value?: any;
  new_value?: any;
  user?: any;
}): Promise<AuditLogEntry | null> {
  try {
    const actor = params.user || getCurrentUser();
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      user_id: actor?.id || 'system',
      username: actor?.username || 'system',
      user_name: actor?.name || 'Sistem Admin',
      user_role: actor?.role || 'admin',
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id || '',
      details: params.details,
      previous_value: params.previous_value ? sanitizeValueForAudit(params.previous_value) : null,
      new_value: params.new_value ? sanitizeValueForAudit(params.new_value) : null,
    };

    // Store in localforage auditLogs store
    await store.auditLogs.setItem(entry.id, entry);

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
