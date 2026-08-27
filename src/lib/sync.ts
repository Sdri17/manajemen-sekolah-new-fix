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

export async function validateStudentData(): Promise<boolean> {
  console.log('[Validation] Auto-sanitizing student data before sync...');
  await store.students.iterate<Student, void>((s, key) => {
    let modified = false;
    if (!s.nisn || String(s.nisn).trim() === '') { s.nisn = '-'; modified = true; }
    if (!s.kelas || String(s.kelas).trim() === '') { s.kelas = '1'; modified = true; }
    if (!s.jenis_kelamin || (s.jenis_kelamin !== 'Laki-laki' && s.jenis_kelamin !== 'Perempuan')) {
      s.jenis_kelamin = 'Laki-laki';
      modified = true;
    }
    if (!s.nama_orang_tua || String(s.nama_orang_tua).trim() === '') {
      s.nama_orang_tua = [s.nama_ayah, s.nama_ibu].filter(Boolean).join(' / ') || '-';
      modified = true;
    }
    if (modified) {
      store.students.setItem(key, s);
    }
  });
  console.log('[Validation] Student data auto-sanitized successfully!');
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
