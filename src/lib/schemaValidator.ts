import { store } from './store';
import { deleteDocFromFirebase } from './firebaseSync';
import { logAuditEvent } from './auditLogger';

export interface ValidationIssue {
  collection: string;
  docId: string;
  origin: 'DIAGNOSTIC_DOC' | 'MISSING_REQUIRED_FIELDS' | 'INVALID_DATA_TYPES' | 'ORPHAN_REFERENCE' | 'CORRUPT_PAYLOAD';
  reason: string;
  payloadSnippet?: string;
}

export interface SchemaCleanupResult {
  success: boolean;
  timestamp: string;
  totalScanned: number;
  purgedCount: number;
  purgedDetails: ValidationIssue[];
  auditLogEntriesCreated: number;
  message: string;
}

/**
 * Validates document payload structure for a given collection
 */
export function validateDocumentSchema(collectionName: string, docId: string, data: any): { isValid: boolean; issue?: ValidationIssue } {
  const dId = String(docId || '');

  // 1. Check for Diagnostic/Test Documents
  if (!dId || dId.startsWith('_') || dId.includes('diagnostic') || dId.includes('verify') || dId.includes('test_write')) {
    return {
      isValid: false,
      issue: {
        collection: collectionName,
        docId: dId,
        origin: 'DIAGNOSTIC_DOC',
        reason: `Dokumen penguji/diagnostik otomatis berawalan '${dId.substring(0, 5)}...'`,
        payloadSnippet: JSON.stringify(data || {}).substring(0, 100)
      }
    };
  }

  // 2. Check for Corrupt/Non-Object Payload
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      issue: {
        collection: collectionName,
        docId: dId,
        origin: 'CORRUPT_PAYLOAD',
        reason: 'Format data bukan berupa objek JSON valid',
        payloadSnippet: String(data)
      }
    };
  }

  // 3. Collection-Specific Mandatory Field Validation
  if (collectionName === 'students') {
    const name = String(data.nama || '').trim();
    if (!name || name === '-' || name.toLowerCase() === 'undefined' || name.toLowerCase() === 'null') {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'MISSING_REQUIRED_FIELDS',
          reason: 'Data siswa tidak memiliki field mandatory nama_lengkap yang valid',
          payloadSnippet: JSON.stringify({ id: dId, nama: data.nama, kelas: data.kelas })
        }
      };
    }
  } else if (collectionName === 'grades') {
    if (!data.id_siswa && !data.nisn) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'MISSING_REQUIRED_FIELDS',
          reason: 'Record nilai tidak memiliki id_siswa atau nisn',
          payloadSnippet: JSON.stringify({ id: dId, mapel: data.mata_pelajaran, nilai: data.nilai })
        }
      };
    }
    if (data.nilai !== undefined && data.nilai !== null && isNaN(Number(data.nilai))) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'INVALID_DATA_TYPES',
          reason: 'Skor nilai berisi tipe data non-numerik / NaN',
          payloadSnippet: JSON.stringify({ id: dId, nilai: data.nilai })
        }
      };
    }
  } else if (collectionName === 'attendance') {
    if (!data.id_siswa) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'MISSING_REQUIRED_FIELDS',
          reason: 'Record presensi tidak memiliki referensi id_siswa',
          payloadSnippet: JSON.stringify({ id: dId, tanggal: data.tanggal })
        }
      };
    }
    if (!data.tanggal || typeof data.tanggal !== 'string' || data.tanggal.length < 8) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'INVALID_DATA_TYPES',
          reason: 'Format tanggal presensi tidak valid',
          payloadSnippet: JSON.stringify({ id: dId, tanggal: data.tanggal })
        }
      };
    }
  } else if (collectionName === 'users') {
    if (!data.username || typeof data.username !== 'string' || !data.username.trim()) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'MISSING_REQUIRED_FIELDS',
          reason: 'Akun pengguna tidak memiliki username valid',
          payloadSnippet: JSON.stringify({ id: dId, role: data.role })
        }
      };
    }
  } else if (collectionName === 'kas') {
    if (data.nominal !== undefined && isNaN(Number(data.nominal))) {
      return {
        isValid: false,
        issue: {
          collection: collectionName,
          docId: dId,
          origin: 'INVALID_DATA_TYPES',
          reason: 'Nominal transaksi kas bernilai NaN',
          payloadSnippet: JSON.stringify({ id: dId, nominal: data.nominal })
        }
      };
    }
  }

  return { isValid: true };
}

/**
 * Sweeps Firestore Cloud & Local IndexedDB stores, purges anomaly documents,
 * and records detailed audit log entries tracking origin of bad data.
 */
export async function runFirestoreSchemaCleanupAndAudit(): Promise<SchemaCleanupResult> {
  const collectionsToCheck = [
    { name: 'students', storeInst: store.students, label: 'Siswa' },
    { name: 'grades', storeInst: store.grades, label: 'Nilai' },
    { name: 'attendance', storeInst: store.attendance, label: 'Absensi' },
    { name: 'tasks', storeInst: store.tasks, label: 'Tugas' },
    { name: 'users', storeInst: store.users, label: 'Pengguna' },
    { name: 'jurnal', storeInst: store.jurnal, label: 'Jurnal Guru' },
    { name: 'kas', storeInst: store.kas, label: 'Kas Kelas' },
    { name: 'kasLogs', storeInst: store.kasLogs, label: 'Log Kas' },
    { name: 'roster', storeInst: store.roster, label: 'Roster' },
    { name: 'piket', storeInst: store.piket, label: 'Piket' },
  ];

  let totalScanned = 0;
  let auditLogEntriesCreated = 0;
  const purgedDetails: ValidationIssue[] = [];

  // Build valid student IDs set for orphan checking
  const validStudentIds = new Set<string>();
  try {
    await store.students.iterate((s: any, key: string) => {
      if (s && key && !key.startsWith('_') && s.nama && s.nama.trim().length > 1) {
        validStudentIds.add(String(key));
        if (s.id) validStudentIds.add(String(s.id));
      }
    });
  } catch (e) {}

  for (const colConfig of collectionsToCheck) {
    const { name, storeInst, label } = colConfig;
    const itemsToPurge: ValidationIssue[] = [];

    try {
      await storeInst.iterate((val: any, key: string) => {
        totalScanned++;
        const { isValid, issue } = validateDocumentSchema(name, key, val);

        if (!isValid && issue) {
          itemsToPurge.push(issue);
        } else if (name === 'grades' || name === 'attendance') {
          // Check orphan references
          const sId = String(val?.id_siswa || '');
          const sNisn = String(val?.nisn || '').trim();
          const sNama = String(val?.nama || '').trim();
          if (sId && !validStudentIds.has(sId) && (!sNisn || sNisn === '-') && !sNama) {
            itemsToPurge.push({
              collection: name,
              docId: key,
              origin: 'ORPHAN_REFERENCE',
              reason: `Record ${label} merujuk ke ID siswa (${sId}) yang sudah tidak ada di Database Induk`,
              payloadSnippet: JSON.stringify({ key, id_siswa: sId })
            });
          }
        }
      });

      // Execute Purge & Write Audit Logs for flagged items
      for (const issue of itemsToPurge) {
        purgedDetails.push(issue);

        // Remove from local IndexedDB
        await storeInst.removeItem(issue.docId).catch(() => {});

        // Delete from Firestore Cloud
        deleteDocFromFirebase(name, issue.docId).catch(() => {});

        // Log to centralized audit trail
        await logAuditEvent({
          action: 'SYSTEM',
          entity: `${label} (Anomali)`,
          entity_id: issue.docId,
          details: `[CLEANUP & AUDIT] Menghapus dokumen anomali [Asal-usul: ${issue.origin}]. Alasan: ${issue.reason}`,
          previous_value: { collection: name, docId: issue.docId, origin: issue.origin, snippet: issue.payloadSnippet },
          new_value: null
        }).catch(() => {});

        auditLogEntriesCreated++;
      }
    } catch (colErr) {
      console.warn(`[SchemaCleanup] Error sweeping collection ${name}:`, colErr);
    }
  }

  // Also sweep document_locks for expired or orphan locks
  try {
    const now = Date.now();
    await store.documentLocks.iterate((lock: any, key: string) => {
      if (!lock || !lock.expiresAt || lock.expiresAt <= now) {
        store.documentLocks.removeItem(key).catch(() => {});
        deleteDocFromFirebase('document_locks', key).catch(() => {});
      }
    });
  } catch (e) {}

  const result: SchemaCleanupResult = {
    success: true,
    timestamp: new Date().toISOString(),
    totalScanned,
    purgedCount: purgedDetails.length,
    purgedDetails,
    auditLogEntriesCreated,
    message: purgedDetails.length > 0 
      ? `Pembersihan selesai: ${purgedDetails.length} dokumen anomali berhasil disapu dan dicatat dalam Log Audit.`
      : `Database 100% bersih: Dari ${totalScanned} dokumen yang diperiksa, tidak ditemukan skema anomali.`
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('schema-cleanup-completed', { detail: result }));
    window.dispatchEvent(new Event('data-changed'));
  }

  return result;
}
