import { store, Student, Grade, Attendance, Settings, AppUser, pauseNotifications, resumeNotifications, pauseSyncQueue, resumeSyncQueue } from './store';
import { pushAllLocalDataToFirebase, pullAllRemoteDataFromFirebase, deleteDocFromFirebase, purgeStudentDataFromFirebase } from './firebaseSync';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

export interface SyncProgressState {
  isSyncing: boolean;
  stage: 'Connecting' | 'Fetching Data' | 'Validating Schema' | 'Writing to Database' | 'Verifying Integrity' | 'Preparing Data' | 'Pushing to Cloud' | 'Finalizing' | 'Completed' | 'Idle';
  stageLabel: string;
  percent: number;
  processedItems?: number;
  totalItems?: number;
  direction?: 'push' | 'pull';
}

let currentSyncProgress: SyncProgressState = {
  isSyncing: false,
  stage: 'Idle',
  stageLabel: '',
  percent: 0
};

export function updateSyncProgress(progress: Partial<SyncProgressState>) {
  currentSyncProgress = { ...currentSyncProgress, ...progress };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sync-progress-updated', { detail: currentSyncProgress }));
  }
}

export function getSyncProgressState(): SyncProgressState {
  return currentSyncProgress;
}

export async function validateStudentDataExport(studentsToPush: any[]): Promise<boolean> {
  for (const s of studentsToPush) {
    if (!s) continue;
    if (!s.nisn || String(s.nisn).trim() === '') s.nisn = '-';
    if (!s.kelas || String(s.kelas).trim() === '') s.kelas = '1';
    if (!s.jenis_kelamin || String(s.jenis_kelamin).trim() === '') s.jenis_kelamin = 'Laki-laki';
    if (!s.nama_orang_tua || String(s.nama_orang_tua).trim() === '') {
      s.nama_orang_tua = [s.nama_ayah, s.nama_ibu].filter(Boolean).join(' / ') || '-';
    }
  }
  return true;
}

export async function addSyncLog(type: 'push' | 'pull' | 'delta', status: 'success' | 'failure', message: string, itemsCount: number) {
  try {
    const id = Math.random().toString(36).substring(2, 11) + Date.now().toString();
    const log = {
      id,
      timestamp: new Date().toISOString(),
      type,
      status,
      message,
      itemsCount
    };
    await store.syncLogs.setItem(id, log);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-log-changed'));
    }
  } catch (e) {
    console.error('Failed to add sync log', e);
  }
}

export async function getSyncStats() {
  try {
    const [studentCount, gradeCount, attendanceCount, rosterCount, piketCount, raporCapaianCount, kasCount, kasLogsCount, queueKeys] = await Promise.all([
      store.students.length(),
      store.grades.length(),
      store.attendance.length(),
      store.roster.length(),
      store.piket.length(),
      store.raporCapaian.length(),
      store.kas.length(),
      store.kasLogs.length(),
      store.syncQueue.keys()
    ]);
    const totalItems = studentCount + gradeCount + attendanceCount + rosterCount + piketCount + raporCapaianCount + kasCount + kasLogsCount;
    const unsyncedCount = queueKeys.length;
    
    // Get list of queue items for details in parallel
    const queueItems = await Promise.all(queueKeys.map(async (key) => {
      const parts = key.split('::');
      const val = await store.syncQueue.getItem<string>(key);
      return {
        store: parts[0] || 'Unknown',
        id: parts[1] || 'Unknown',
        action: typeof val === 'string' ? val : 'updated'
      };
    }));

    const syncedCount = Math.max(0, totalItems - unsyncedCount);
    const percentage = totalItems === 0 ? 100 : Math.round((syncedCount / totalItems) * 100);

    return {
      totalItems,
      unsyncedCount,
      syncedCount,
      percentage,
      queueItems
    };
  } catch (e) {
    return {
      totalItems: 0,
      unsyncedCount: 0,
      syncedCount: 0,
      percentage: 100,
      queueItems: []
    };
  }
}

export function inspectStudentBeforeSync(student: any): void {
  console.log(`[Diagnostic] Inspecting student: ${student.nama || 'Unnamed'} (ID: ${student.id || 'No ID'})`);
}

export interface StudentFieldCheck {
  fieldKey: string;
  fieldLabel: string;
  value: any;
  status: 'OK' | 'MISSING' | 'INVALID_FORMAT';
  isRequired: boolean;
  autoFixValue?: any;
  message?: string;
}

export interface StudentValidationPreviewItem {
  rowIndex?: number;
  id?: string;
  nama: string;
  nisn: string;
  kelas: string;
  jenis_kelamin?: string;
  tanggal_lahir?: string;
  nama_orang_tua?: string;
  status: 'VALID' | 'MISSING_REQUIRED' | 'WARNING';
  missingFields: string[];
  missingRequiredFields: string[];
  fieldChecks: StudentFieldCheck[];
  sanitizedRecord: any;
  issueSummary: string;
}

export interface StudentValidationReport {
  isValid: boolean;
  dataQualityScore: number;
  totalRecords: number;
  validCount: number;
  missingRequiredCount: number;
  warningCount: number;
  items: StudentValidationPreviewItem[];
  missingFieldsDistribution: Record<string, number>;
  sanitizedStudents: any[];
}

export async function validateStudentDataWithReport(
  studentsInput?: any[],
  options: { autoFix?: boolean } = {}
): Promise<StudentValidationReport> {
  const { autoFix = true } = options;
  let rawList: any[] = [];

  if (Array.isArray(studentsInput) && studentsInput.length > 0) {
    rawList = studentsInput;
  } else {
    await store.students.iterate<Student, void>((s) => {
      if (s) rawList.push(s);
    });
  }

  const items: StudentValidationPreviewItem[] = [];
  const missingFieldsDistribution: Record<string, number> = {};
  let validCount = 0;
  let missingRequiredCount = 0;
  let warningCount = 0;
  const sanitizedStudents: any[] = [];

  for (let idx = 0; idx < rawList.length; idx++) {
    const s = rawList[idx];
    if (!s) continue;

    const fieldChecks: StudentFieldCheck[] = [];
    const missingFields: string[] = [];
    const missingRequiredFields: string[] = [];
    const sanitized = { ...s };

    // 1. Nama (CRITICAL REQUIRED)
    const rawNama = String(s.nama || s.nama_lengkap || s.nama_siswa || '').trim();
    if (!rawNama || rawNama === '-' || rawNama.toLowerCase() === 'undefined' || rawNama.toLowerCase() === 'null') {
      fieldChecks.push({
        fieldKey: 'nama',
        fieldLabel: 'Nama Lengkap',
        value: s.nama,
        status: 'MISSING',
        isRequired: true,
        autoFixValue: 'Siswa Tanpa Nama',
        message: 'Nama siswa kosong atau tidak valid.'
      });
      missingFields.push('Nama');
      missingRequiredFields.push('Nama');
      sanitized.nama = 'Siswa Tanpa Nama';
    } else {
      fieldChecks.push({
        fieldKey: 'nama',
        fieldLabel: 'Nama Lengkap',
        value: rawNama,
        status: 'OK',
        isRequired: true
      });
      sanitized.nama = rawNama;
    }

    // 2. NISN
    const rawNisn = String(s.nisn || '').trim();
    if (!rawNisn || rawNisn === '-' || rawNisn === '0') {
      fieldChecks.push({
        fieldKey: 'nisn',
        fieldLabel: 'NISN',
        value: s.nisn,
        status: 'MISSING',
        isRequired: false,
        autoFixValue: '-',
        message: 'NISN belum diisi.'
      });
      missingFields.push('NISN');
      sanitized.nisn = '-';
    } else {
      fieldChecks.push({
        fieldKey: 'nisn',
        fieldLabel: 'NISN',
        value: rawNisn,
        status: 'OK',
        isRequired: false
      });
      sanitized.nisn = rawNisn;
    }

    // 3. Kelas
    const rawKelas = String(s.kelas || '').trim();
    if (!rawKelas || rawKelas === '-') {
      fieldChecks.push({
        fieldKey: 'kelas',
        fieldLabel: 'Kelas',
        value: s.kelas,
        status: 'MISSING',
        isRequired: false,
        autoFixValue: '1',
        message: 'Kelas belum ditentukan.'
      });
      missingFields.push('Kelas');
      sanitized.kelas = '1';
    } else {
      fieldChecks.push({
        fieldKey: 'kelas',
        fieldLabel: 'Kelas',
        value: rawKelas,
        status: 'OK',
        isRequired: false
      });
      sanitized.kelas = rawKelas;
    }

    // 4. Jenis Kelamin
    const rawJk = String(s.jenis_kelamin || s.jk || '').trim();
    if (!rawJk || (rawJk !== 'Laki-laki' && rawJk !== 'Perempuan' && rawJk !== 'L' && rawJk !== 'P')) {
      fieldChecks.push({
        fieldKey: 'jenis_kelamin',
        fieldLabel: 'Jenis Kelamin',
        value: s.jenis_kelamin,
        status: 'MISSING',
        isRequired: false,
        autoFixValue: 'Laki-laki',
        message: 'Jenis kelamin belum dipilih.'
      });
      missingFields.push('Jenis Kelamin');
      sanitized.jenis_kelamin = 'Laki-laki';
    } else {
      const normalizedJk = (rawJk === 'L' || rawJk.toLowerCase() === 'laki-laki') ? 'Laki-laki' : 'Perempuan';
      fieldChecks.push({
        fieldKey: 'jenis_kelamin',
        fieldLabel: 'Jenis Kelamin',
        value: normalizedJk,
        status: 'OK',
        isRequired: false
      });
      sanitized.jenis_kelamin = normalizedJk;
    }

    // 5. Tanggal Lahir
    const rawTgl = String(s.tanggal_lahir || s.tgl_lahir || '').trim();
    if (!rawTgl || rawTgl === '-') {
      fieldChecks.push({
        fieldKey: 'tanggal_lahir',
        fieldLabel: 'Tanggal Lahir',
        value: s.tanggal_lahir,
        status: 'MISSING',
        isRequired: false,
        autoFixValue: '-',
        message: 'Tanggal lahir belum diisi.'
      });
      missingFields.push('Tanggal Lahir');
      sanitized.tanggal_lahir = '-';
    } else {
      fieldChecks.push({
        fieldKey: 'tanggal_lahir',
        fieldLabel: 'Tanggal Lahir',
        value: rawTgl,
        status: 'OK',
        isRequired: false
      });
      sanitized.tanggal_lahir = rawTgl;
    }

    // 6. Nama Orang Tua / Wali
    const rawOrtu = String(s.nama_orang_tua || s.nama_ayah || s.nama_ibu || '').trim();
    if (!rawOrtu || rawOrtu === '-') {
      fieldChecks.push({
        fieldKey: 'nama_orang_tua',
        fieldLabel: 'Nama Orang Tua',
        value: s.nama_orang_tua,
        status: 'MISSING',
        isRequired: false,
        autoFixValue: '-',
        message: 'Nama orang tua/wali belum diisi.'
      });
      missingFields.push('Nama Orang Tua');
      sanitized.nama_orang_tua = '-';
    } else {
      fieldChecks.push({
        fieldKey: 'nama_orang_tua',
        fieldLabel: 'Nama Orang Tua',
        value: rawOrtu,
        status: 'OK',
        isRequired: false
      });
      sanitized.nama_orang_tua = rawOrtu;
    }

    missingFields.forEach(f => {
      missingFieldsDistribution[f] = (missingFieldsDistribution[f] || 0) + 1;
    });

    let status: 'VALID' | 'MISSING_REQUIRED' | 'WARNING' = 'VALID';
    if (missingRequiredFields.length > 0) {
      status = 'MISSING_REQUIRED';
      missingRequiredCount++;
    } else if (missingFields.length > 0) {
      status = 'WARNING';
      warningCount++;
    } else {
      validCount++;
    }

    let issueSummary = 'Lengkap & Valid';
    if (missingRequiredFields.length > 0) {
      issueSummary = `Wajib Diisi Kosong: ${missingRequiredFields.join(', ')}`;
    } else if (missingFields.length > 0) {
      issueSummary = `Perlu Melengkapi: ${missingFields.join(', ')}`;
    }

    items.push({
      rowIndex: idx + 1,
      id: s.id,
      nama: sanitized.nama,
      nisn: sanitized.nisn,
      kelas: sanitized.kelas,
      jenis_kelamin: sanitized.jenis_kelamin,
      tanggal_lahir: sanitized.tanggal_lahir,
      nama_orang_tua: sanitized.nama_orang_tua,
      status,
      missingFields,
      missingRequiredFields,
      fieldChecks,
      sanitizedRecord: autoFix ? sanitized : s,
      issueSummary
    });

    sanitizedStudents.push(autoFix ? sanitized : s);
  }

  const totalRecords = rawList.length;
  let dataQualityScore = 100;
  if (totalRecords > 0) {
    const totalFieldsCheck = totalRecords * 6;
    let missingFieldsTotal = 0;
    items.forEach(it => { missingFieldsTotal += it.missingFields.length; });
    dataQualityScore = Math.max(0, Math.round(((totalFieldsCheck - missingFieldsTotal) / totalFieldsCheck) * 100));
  }

  return {
    isValid: missingRequiredCount === 0,
    dataQualityScore,
    totalRecords,
    validCount,
    missingRequiredCount,
    warningCount,
    items,
    missingFieldsDistribution,
    sanitizedStudents
  };
}

export async function validateStudentData(
  studentsInput?: any[],
  options: { autoFix?: boolean; saveToStore?: boolean } = {}
): Promise<boolean> {
  const { autoFix = true, saveToStore = true } = options;
  console.log('[Validation] Auto-sanitizing student data before sync...');

  const report = await validateStudentDataWithReport(studentsInput, { autoFix });

  if (saveToStore && !studentsInput) {
    for (const item of report.items) {
      if (item.missingFields.length > 0 && item.id) {
        await store.students.setItem(item.id, item.sanitizedRecord).catch(() => {});
      }
    }
  }

  console.log(`[Validation] Student validation complete. Quality score: ${report.dataQualityScore}%. Total: ${report.totalRecords}, Valid: ${report.validCount}`);
  return true;
}

export function mapStudentForPush(s: any): any {
  if (!s) return s;
  const mapped: any = { ...s };
  if (!mapped.nisn || String(mapped.nisn).trim() === '') mapped.nisn = '-';
  if (!mapped.kelas || String(mapped.kelas).trim() === '') mapped.kelas = '1';
  if (!mapped.jenis_kelamin) mapped.jenis_kelamin = 'Laki-laki';
  if (!mapped.nama_orang_tua) {
    mapped.nama_orang_tua = [mapped.nama_ayah, mapped.nama_ibu].filter(Boolean).join(' / ') || '-';
  }
  return mapped;
}

export async function pushDataToSheets(_appsScriptUrl?: string, forceFull = false) {
  updateSyncProgress({
    isSyncing: true,
    stage: 'Preparing Data',
    stageLabel: 'Menyinkronkan data dengan Firebase Cloud...',
    percent: 30,
    direction: 'push'
  });

  try {
    const res = await pushAllLocalDataToFirebase();
    updateSyncProgress({
      isSyncing: false,
      stage: 'Completed',
      stageLabel: 'Sinkronisasi ke Cloud Firebase selesai!',
      percent: 100
    });
    await addSyncLog(forceFull ? 'push' : 'delta', 'success', res.message, res.count);
    return res;
  } catch (err: any) {
    updateSyncProgress({
      isSyncing: false,
      stage: 'Idle',
      stageLabel: 'Sinkronisasi gagal: ' + err?.message,
      percent: 0
    });
    await addSyncLog(forceFull ? 'push' : 'delta', 'failure', err?.message || 'Sinkronisasi Firebase gagal', 0);
    throw err;
  }
}

export async function pullDataFromSheets(_appsScriptUrl?: string) {
  updateSyncProgress({
    isSyncing: true,
    stage: 'Fetching Data',
    stageLabel: 'Menyinkronkan data dengan Cloud Firebase...',
    percent: 30,
    direction: 'pull'
  });

  try {
    const [pullRes, pushRes] = await Promise.all([
      pullAllRemoteDataFromFirebase(),
      pushAllLocalDataToFirebase()
    ]);

    const totalCount = (pullRes.count || 0) + (pushRes.count || 0);

    updateSyncProgress({
      isSyncing: false,
      stage: 'Completed',
      stageLabel: 'Sinkronisasi dengan Cloud Firebase selesai!',
      percent: 100
    });

    return {
      success: true,
      totalCount,
      percentage: 100,
      message: `Sinkronisasi cepat selesai! (${pullRes.count || 0} data ditarik, ${pushRes.count || 0} data diunggah)`
    };
  } catch (err: any) {
    updateSyncProgress({
      isSyncing: false,
      stage: 'Idle',
      stageLabel: 'Gagal menyinkronkan data Firebase: ' + err?.message,
      percent: 0
    });
    throw err;
  }
}

export async function sendDeleteToGoogleSheets(_storeName: string, _id: string) {
  return true;
}

export async function cascadeDeleteStudent(studentId: string) {
  resumeSyncQueue();
  // Get target student to check both ID and NISN
  const student = await store.students.getItem<Student>(studentId);
  const nisn = student?.nisn ? String(student.nisn).trim() : '';

  const matchesStudent = (idSiswa?: string, itemNisn?: string) => {
    if (idSiswa && (idSiswa === studentId || (nisn && idSiswa === nisn))) return true;
    if (itemNisn && nisn && itemNisn === nisn) return true;
    return false;
  };

  // 1. Cascade delete grades
  const gradesToDelete: string[] = [];
  await store.grades.iterate<Grade, void>((g) => {
    if (matchesStudent(g.id_siswa, g.nisn)) {
      gradesToDelete.push(g.id);
    }
  });
  await Promise.all(gradesToDelete.map(async (id) => {
    await store.grades.removeItem(id);
    await store.syncQueue.setItem(`grades::${id}`, 'deleted');
    deleteDocFromFirebase('grades', id).catch(() => {});
  }));

  // 2. Cascade delete attendance
  const attToDelete: string[] = [];
  await store.attendance.iterate<Attendance, void>((a) => {
    if (matchesStudent(a.id_siswa, a.nisn)) {
      attToDelete.push(a.id);
    }
  });
  await Promise.all(attToDelete.map(async (id) => {
    await store.attendance.removeItem(id);
    await store.syncQueue.setItem(`attendance::${id}`, 'deleted');
    deleteDocFromFirebase('attendance', id).catch(() => {});
  }));

  // 3. Cascade delete piket
  const piketToDelete: string[] = [];
  await store.piket.iterate<any, void>((p) => {
    if (matchesStudent(p.id_siswa, p.nisn)) {
      piketToDelete.push(p.id);
    }
  });
  await Promise.all(piketToDelete.map(async (id) => {
    await store.piket.removeItem(id);
    await store.syncQueue.setItem(`piket::${id}`, 'deleted');
    deleteDocFromFirebase('piket', id).catch(() => {});
  }));

  // 4. Cascade delete raporCapaian
  const raporToDelete: string[] = [];
  await store.raporCapaian.iterate<any, void>((r) => {
    if (matchesStudent(r.id_siswa, r.nisn)) {
      raporToDelete.push(r.id);
    }
  });
  await Promise.all(raporToDelete.map(async (id) => {
    await store.raporCapaian.removeItem(id);
    await store.syncQueue.setItem(`raporCapaian::${id}`, 'deleted');
    deleteDocFromFirebase('raporCapaian', id).catch(() => {});
  }));

  // 5. Delete student record itself
  await store.students.removeItem(studentId);
  await store.syncQueue.setItem(`students::${studentId}`, 'deleted');
  deleteDocFromFirebase('students', studentId).catch(() => {});
  if (nisn && nisn !== studentId) {
    deleteDocFromFirebase('students', nisn).catch(() => {});
  }
}

export async function cascadeDeleteSelectedStudents(studentIds: string[]) {
  for (const id of studentIds) {
    await cascadeDeleteStudent(id);
  }
}

export async function cascadeDeleteAllStudents() {
  resumeSyncQueue();
  // Clear local stores
  await store.students.clear();
  await store.grades.clear();
  await store.attendance.clear();
  await store.piket.clear();
  await store.raporCapaian.clear();
  await store.syncQueue.clear();

  // Purge student-related collections directly from Firebase Firestore Cloud
  try {
    await purgeStudentDataFromFirebase();
  } catch (fbErr) {
    console.warn('[cascadeDeleteAllStudents] Error purging student data from Firebase:', fbErr);
  }
}
