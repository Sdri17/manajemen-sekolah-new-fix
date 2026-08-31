import { store, Student, Grade, Attendance } from './store';
import { pushAllLocalDataToFirebase, deleteDocFromFirebase } from './firebaseSync';
import { safeLocalStorageSetItem } from './firebase';

export interface IntegrityReport {
  isValid: boolean;
  issues: string[];
  anomalyCount: number;
  checkedStoresCount: number;
  checkedAt: string;
}

export interface ReferenceIntegritySummary {
  checkedAt: string;
  totalOrphanRecords: number;
  classReferenceIssues: string[];
  studentReferenceIssues: string[];
  details: {
    orphanGradesCount: number;
    orphanAttendanceCount: number;
    orphanRosterCount: number;
    orphanPiketCount: number;
  };
}

let cachedReport: IntegrityReport | null = null;
let cachedRefSummary: ReferenceIntegritySummary | null = null;

export function getStoredReferenceIntegritySummary(): ReferenceIntegritySummary | null {
  if (cachedRefSummary) return cachedRefSummary;
  try {
    const raw = localStorage.getItem('firestore_reference_integrity_report');
    if (raw) {
      cachedRefSummary = JSON.parse(raw);
      return cachedRefSummary;
    }
  } catch (e) {
    console.warn('[IntegrityObserver] Failed to read stored reference integrity report', e);
  }
  return null;
}

export async function verifyFirestoreReferenceIntegrity(): Promise<ReferenceIntegritySummary> {
  const classReferenceIssues: string[] = [];
  const studentReferenceIssues: string[] = [];
  
  let orphanGradesCount = 0;
  let orphanAttendanceCount = 0;
  let orphanRosterCount = 0;
  let orphanPiketCount = 0;

  try {
    // 1. Gather valid class IDs/names from Settings and Active Students
    const validClasses = new Set<string>();
    const appSettings = await store.settings.getItem<any>('app_settings');
    if (appSettings?.nama_kelas) validClasses.add(appSettings.nama_kelas.trim());
    if (Array.isArray(appSettings?.daftar_kelas)) {
      appSettings.daftar_kelas.forEach((c: any) => { if (c) validClasses.add(String(c).trim()); });
    }

    // 2. Gather valid student IDs, NISNs, and Names
    const validStudentIds = new Set<string>();
    const validStudentNisns = new Set<string>();
    const validStudentNames = new Set<string>();

    await store.students.iterate<Student, void>((s, id) => {
      if (s) {
        if (id) validStudentIds.add(String(id));
        if (s.id) validStudentIds.add(String(s.id));
        if (s.nisn) validStudentNisns.add(String(s.nisn).trim());
        if (s.nama) validStudentNames.add(s.nama.trim().toLowerCase());
        if (s.kelas && s.kelas !== 'Alumni') validClasses.add(s.kelas.trim());
      }
    });

    // Helper to check if student reference exists
    const isStudentValid = (sId?: string, sNisn?: string, sNama?: string) => {
      if (sId && validStudentIds.has(String(sId))) return true;
      if (sNisn && validStudentNisns.has(String(sNisn).trim())) return true;
      if (sNama && validStudentNames.has(sNama.trim().toLowerCase())) return true;
      return false;
    };

    // 3. Verify Grades Store References
    await store.grades.iterate<Grade, void>((g, key) => {
      const hasStudent = isStudentValid(g.id_siswa, g.nisn, g.nama);
      if (!hasStudent) {
        orphanGradesCount++;
        studentReferenceIssues.push(`Nilai [${g.mata_pelajaran || 'Mapel'} - ${g.nama_kolom || 'Kolom'}]: ID Siswa (${g.id_siswa || 'Kosong'}) tidak terhubung ke Siswa Induk.`);
      }

      const gKelas = (g as any).kelas;
      if (gKelas && validClasses.size > 0 && !validClasses.has(String(gKelas).trim())) {
        classReferenceIssues.push(`Nilai [${g.mata_pelajaran || 'Mapel'}]: ID Kelas '${gKelas}' hilang atau tidak terdaftar.`);
      }
    });

    // 4. Verify Attendance Store References
    await store.attendance.iterate<Attendance, void>((a, key) => {
      const hasStudent = isStudentValid(a.id_siswa, a.nisn, a.nama);
      if (!hasStudent) {
        orphanAttendanceCount++;
        studentReferenceIssues.push(`Absensi [Tgl: ${a.tanggal || 'Kosong'}]: ID Siswa (${a.id_siswa || 'Kosong'}) tidak terhubung ke Siswa Induk.`);
      }

      const aKelas = (a as any).kelas;
      if (aKelas && validClasses.size > 0 && !validClasses.has(String(aKelas).trim())) {
        classReferenceIssues.push(`Absensi [Tgl: ${a.tanggal || 'Kosong'}]: ID Kelas '${aKelas}' hilang atau tidak terdaftar.`);
      }
    });

    // 5. Verify Roster Store Class References
    await store.roster.iterate<any, void>((r, key) => {
      const targetClass = (r.kelas || r.id_kelas || '').trim();
      if (targetClass && validClasses.size > 0 && !validClasses.has(targetClass)) {
        orphanRosterCount++;
        classReferenceIssues.push(`Jadwal Pelajaran [${r.mata_pelajaran || 'Mapel'} - ${r.hari || 'Hari'}]: ID Kelas '${targetClass}' telah dihapus/hilang.`);
      }
    });

    // 6. Verify Piket Store Student & Class References
    await store.piket.iterate<any, void>((p, key) => {
      const hasStudent = isStudentValid(p.id_siswa, p.nisn, p.nama_siswa);
      const targetClass = (p.kelas || p.id_kelas || '').trim();
      if (!hasStudent) {
        orphanPiketCount++;
        studentReferenceIssues.push(`Jadwal Piket [${p.hari || 'Hari'}]: ID Siswa (${p.id_siswa || 'Kosong'}) tidak terhubung ke Siswa Induk.`);
      }
      if (targetClass && validClasses.size > 0 && !validClasses.has(targetClass)) {
        classReferenceIssues.push(`Jadwal Piket [${p.hari || 'Hari'}]: ID Kelas '${targetClass}' telah dihapus/hilang.`);
      }
    });

  } catch (err: any) {
    console.warn('[IntegrityObserver] Error verifying reference integrity:', err);
  }

  const totalOrphanRecords = orphanGradesCount + orphanAttendanceCount + orphanRosterCount + orphanPiketCount;

  const summary: ReferenceIntegritySummary = {
    checkedAt: new Date().toISOString(),
    totalOrphanRecords,
    classReferenceIssues,
    studentReferenceIssues,
    details: {
      orphanGradesCount,
      orphanAttendanceCount,
      orphanRosterCount,
      orphanPiketCount
    }
  };

  cachedRefSummary = summary;
  try {
    safeLocalStorageSetItem('firestore_reference_integrity_report', JSON.stringify(summary));
    window.dispatchEvent(new CustomEvent('reference-integrity-updated', { detail: summary }));
  } catch (e) {
    console.warn('[IntegrityObserver] Failed to save reference integrity report', e);
  }

  return summary;
}

export function getStoredIntegrityReport(): IntegrityReport | null {
  if (cachedReport) return cachedReport;
  try {
    const raw = localStorage.getItem('db_integrity_report');
    if (raw) {
      cachedReport = JSON.parse(raw);
      return cachedReport;
    }
  } catch (e) {
    console.warn('[IntegrityObserver] Failed to read stored integrity report', e);
  }
  return null;
}

export async function checkDatabaseIntegrity(): Promise<IntegrityReport> {
  const issues: string[] = [];
  let checkedStoresCount = 0;

  try {
    // 1. Check Students Store
    checkedStoresCount++;
    const studentIds = new Set<string>();
    await store.students.iterate<Student, void>((student, id) => {
      if (!id || typeof id !== 'string') {
        issues.push(`Data Siswa: Record memiliki key ID tidak valid/kosong (${String(id)}).`);
      } else {
        studentIds.add(id);
      }
      if (!student || typeof student !== 'object') {
        issues.push(`Data Siswa [${id}]: Format objek siswa rusak.`);
      } else {
        if (!student.nama || typeof student.nama !== 'string' || !student.nama.trim()) {
          issues.push(`Data Siswa [${id}]: Nama siswa kosong atau tidak valid.`);
        }
        if (student.no !== undefined && typeof student.no !== 'number' && isNaN(Number(student.no))) {
          issues.push(`Data Siswa [${id}]: Nomor urut (no) bukan angka.`);
        }
      }
    });

    // 2. Check Grades Store
    checkedStoresCount++;
    await store.grades.iterate<Grade, void>((grade, id) => {
      if (!id) {
        issues.push(`Data Nilai: Record memiliki key ID kosong.`);
      }
      if (!grade || typeof grade !== 'object') {
        issues.push(`Data Nilai [${id}]: Format objek nilai rusak.`);
      } else {
        if (!grade.id_siswa) {
          issues.push(`Data Nilai [${id}]: 'id_siswa' kosong.`);
        } else if (studentIds.size > 0 && !studentIds.has(grade.id_siswa) && grade.nisn !== '-' && !grade.nama) {
          // Orphan grade warning
          issues.push(`Data Nilai [${id}]: 'id_siswa' (${grade.id_siswa}) tidak terhubung dengan siswa manapun.`);
        }
        if (grade.nilai !== undefined && isNaN(Number(grade.nilai))) {
          issues.push(`Data Nilai [${id}]: Skor nilai berisi angka NaN atau tidak valid.`);
        }
      }
    });

    // 3. Check Attendance Store
    checkedStoresCount++;
    await store.attendance.iterate<Attendance, void>((att, id) => {
      if (!id) {
        issues.push(`Data Absensi: Record memiliki key ID kosong.`);
      }
      if (!att || typeof att !== 'object') {
        issues.push(`Data Absensi [${id}]: Format objek absensi rusak.`);
      } else {
        if (!att.id_siswa) {
          issues.push(`Data Absensi [${id}]: 'id_siswa' kosong.`);
        }
        if (!att.tanggal || typeof att.tanggal !== 'string' || att.tanggal.length < 8) {
          issues.push(`Data Absensi [${id}]: Format tanggal absensi tidak valid (${att.tanggal}).`);
        }
      }
    });

    // 4. Check Kas Store
    checkedStoresCount++;
    await store.kas.iterate<any, void>((kas, id) => {
      if (!id) {
        issues.push(`Data Kas: Transaksi kas memiliki ID kosong.`);
      } else if (!kas || typeof kas !== 'object') {
        issues.push(`Data Kas [${id}]: Format objek transaksi kas rusak.`);
      } else {
        if (kas.nominal !== undefined && isNaN(Number(kas.nominal))) {
          issues.push(`Data Kas [${id}]: Nominal transaksi bernilai NaN.`);
        }
      }
    });

    // 5. Check Kas Logs Store
    checkedStoresCount++;
    await store.kasLogs.iterate<any, void>((log, id) => {
      if (!id || !log || typeof log !== 'object') {
        issues.push(`Log Kas [${id}]: Record log kas rusak atau kosong.`);
      }
    });

    // 6. Check Jurnal Store
    checkedStoresCount++;
    await store.jurnal.iterate<any, void>((j, id) => {
      if (!id || !j || typeof j !== 'object') {
        issues.push(`Jurnal Guru [${id}]: Record jurnal rusak atau kosong.`);
      }
    });

    // 7. Check Tasks Store
    checkedStoresCount++;
    await store.tasks.iterate<any, void>((t, id) => {
      if (!id || !t || typeof t !== 'object') {
        issues.push(`Manajemen Tugas [${id}]: Record tugas rusak atau kosong.`);
      }
    });

    // 8. Check Users Store
    checkedStoresCount++;
    await store.users.iterate<any, void>((u, id) => {
      if (!id || !u || typeof u !== 'object') {
        issues.push(`Pengguna [${id}]: Record pengguna rusak.`);
      } else if (!u.username || !u.role) {
        issues.push(`Pengguna [${id}]: Field username atau role kosong.`);
      }
    });

  } catch (err: any) {
    issues.push(`Gagal mengeksekusi pemeriksaan integritas database: ${err?.message || err}`);
  }

  const report: IntegrityReport = {
    isValid: issues.length === 0,
    issues,
    anomalyCount: issues.length,
    checkedStoresCount,
    checkedAt: new Date().toISOString()
  };

  cachedReport = report;
  try {
    safeLocalStorageSetItem('db_integrity_report', JSON.stringify(report));
    window.dispatchEvent(new CustomEvent('integrity-report-updated', { detail: report }));
  } catch (e) {
    console.warn('[IntegrityObserver] Failed to save integrity report', e);
  }

  return report;
}

async function sanitizeLocalDatabase() {
  try {
    const studentKeysToRemove: string[] = [];
    await store.students.iterate<Student, void>((student, id) => {
      if (!id || typeof id !== 'string' || !student || typeof student !== 'object') {
        if (id) studentKeysToRemove.push(String(id));
      } else {
        const sName = String(student.nama || '').trim();
        if (!sName || sName === '-' || sName.toLowerCase() === 'undefined' || sName.toLowerCase() === 'null') {
          if (id) studentKeysToRemove.push(String(id));
        }
      }
    });
    for (const k of studentKeysToRemove) {
      await store.students.removeItem(k);
      deleteDocFromFirebase('students', k).catch(() => {});
    }

    const gradeKeysToRemove: string[] = [];
    await store.grades.iterate<Grade, void>((grade, id) => {
      if (!id || !grade || typeof grade !== 'object' || !grade.id_siswa) {
        if (id) gradeKeysToRemove.push(String(id));
      }
    });
    for (const k of gradeKeysToRemove) {
      await store.grades.removeItem(k);
    }

    const attKeysToRemove: string[] = [];
    await store.attendance.iterate<Attendance, void>((att, id) => {
      if (!id || !att || typeof att !== 'object' || !att.id_siswa || !att.tanggal) {
        if (id) attKeysToRemove.push(String(id));
      }
    });
    for (const k of attKeysToRemove) {
      await store.attendance.removeItem(k);
    }

    const kasKeysToRemove: string[] = [];
    await store.kas.iterate<any, void>((kas, id) => {
      if (!id || !kas || typeof kas !== 'object') {
        if (id) kasKeysToRemove.push(String(id));
      }
    });
    for (const k of kasKeysToRemove) {
      await store.kas.removeItem(k);
    }
  } catch (err) {
    console.warn('[SanitizeLocalDatabase] Error sanitizing local stores:', err);
  }
}

export async function repairDatabaseFromCloud(): Promise<{ success: boolean; report: IntegrityReport; message: string }> {
  console.log('[RepairDatabase] Starting full clean database repair...');
  try {
    // Perform local database sanitization
    await sanitizeLocalDatabase();

    let syncedWithCloud = false;
    try {
      await pushAllLocalDataToFirebase();
      syncedWithCloud = true;
    } catch (cloudErr: any) {
      console.warn('[RepairDatabase] Firebase push warning:', cloudErr);
    }

    // Run integrity check on freshly sanitized state
    const report = await checkDatabaseIntegrity();
    
    const statusMsg = syncedWithCloud 
      ? 'Database lokal berhasil disanitasi & disinkronkan ke Firebase Cloud!'
      : 'Database lokal berhasil diperbaiki & disanitasi dari anomali data!';

    return {
      success: true,
      report,
      message: report.isValid 
        ? `${statusMsg} Database dalam kondisi 100% sehat!` 
        : `${statusMsg} Terdapat ${report.anomalyCount} peringatan minor.`
    };
  } catch (err: any) {
    console.error('[RepairDatabase] Error repairing database:', err);
    const report = await checkDatabaseIntegrity();
    return {
      success: false,
      report,
      message: `Gagal memperbaiki database: ${err?.message || err}`
    };
  }
}

export const repairDatabaseFromSheets = repairDatabaseFromCloud;

let observerTimer: any = null;

export function startBackgroundIntegrityObserver(intervalMs = 300000) {
  if (observerTimer) clearInterval(observerTimer);
  
  // Run initial check asynchronously
  setTimeout(() => {
    checkDatabaseIntegrity().catch(err => console.warn('[IntegrityObserver] Background check failed:', err));
    verifyFirestoreReferenceIntegrity().catch(err => console.warn('[IntegrityObserver] Reference integrity check failed:', err));
  }, 3000);

  // Periodically check every 5 minutes
  observerTimer = setInterval(() => {
    checkDatabaseIntegrity().catch(err => console.warn('[IntegrityObserver] Background check failed:', err));
    verifyFirestoreReferenceIntegrity().catch(err => console.warn('[IntegrityObserver] Reference integrity check failed:', err));
  }, intervalMs);
}
