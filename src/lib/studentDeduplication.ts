import { store, pauseSyncQueue, resumeSyncQueue, pauseNotifications, resumeNotifications, Student, Grade, Attendance, StudentTask, RaporCapaian } from './store';
import { recordSyncAuditLog } from './firebaseSync';
import toast from 'react-hot-toast';

export interface MergeStudentsResult {
  duplicatesFound: number;
  mergedGroupsCount: number;
  removedDocIds: string[];
  relinkedGradesCount: number;
  relinkedAttendanceCount: number;
  relinkedTasksCount: number;
  relinkedRaporCount: number;
}

/**
 * Normalizes string for composite key generation
 */
function normalizeKeyStr(str?: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Migration & Data Hygiene Script:
 * Merges duplicate student records based on combination of 'nama' and 'nisn' (or 'nama' + 'kelas' if NISN blank).
 * Selects one 'Source of Truth' primary student document and relinks all grades, attendance,
 * tasks, and report cards before removing duplicate student records.
 */
export async function mergeDuplicateStudents(): Promise<MergeStudentsResult> {
  const result: MergeStudentsResult = {
    duplicatesFound: 0,
    mergedGroupsCount: 0,
    removedDocIds: [],
    relinkedGradesCount: 0,
    relinkedAttendanceCount: 0,
    relinkedTasksCount: 0,
    relinkedRaporCount: 0
  };

  pauseNotifications(true);
  pauseSyncQueue();

  try {
    const allStudents: Student[] = [];
    await store.students.iterate<Student, void>((s) => {
      if (s && s.id && s.nama) {
        allStudents.push(s);
      }
    });

    if (allStudents.length <= 1) {
      return result;
    }

    // Group students by composite key (NISN + Nama) or (Nama + Kelas)
    const groupsMap = new Map<string, Student[]>();

    for (const student of allStudents) {
      const normNama = normalizeKeyStr(student.nama);
      const normNisn = normalizeKeyStr(student.nisn);
      const normKelas = normalizeKeyStr(student.kelas);

      let groupKey = '';
      if (normNisn && normNisn !== '-') {
        groupKey = `nisn::${normNisn}::${normNama}`;
      } else {
        groupKey = `nama_kelas::${normNama}::${normKelas}`;
      }

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      groupsMap.get(groupKey)!.push(student);
    }

    // Process duplicate groups
    for (const [key, studentList] of groupsMap.entries()) {
      if (studentList.length > 1) {
        result.mergedGroupsCount++;
        result.duplicatesFound += (studentList.length - 1);

        // Sort to find the best primary student record (Source of Truth):
        // Prefer record with valid NISN, filled details, or oldest/most recent complete record
        studentList.sort((a, b) => {
          const scoreA = (a.nisn ? 10 : 0) + (a.nik ? 5 : 0) + (a.nama_ayah || a.nama_ibu ? 5 : 0) + (a.foto ? 5 : 0);
          const scoreB = (b.nisn ? 10 : 0) + (b.nik ? 5 : 0) + (b.nama_ayah || b.nama_ibu ? 5 : 0) + (b.foto ? 5 : 0);
          return scoreB - scoreA;
        });

        const primaryStudent = studentList[0];
        const duplicates = studentList.slice(1);
        const duplicateIds = new Set(duplicates.map(d => d.id));

        // Merge any non-empty fields from duplicates into primaryStudent
        let primaryUpdated = false;
        for (const dup of duplicates) {
          if (!primaryStudent.nisn && dup.nisn) { primaryStudent.nisn = dup.nisn; primaryUpdated = true; }
          if (!primaryStudent.nik && dup.nik) { primaryStudent.nik = dup.nik; primaryUpdated = true; }
          if (!primaryStudent.jenis_kelamin && dup.jenis_kelamin) { primaryStudent.jenis_kelamin = dup.jenis_kelamin; primaryUpdated = true; }
          if (!primaryStudent.tempat_lahir && dup.tempat_lahir) { primaryStudent.tempat_lahir = dup.tempat_lahir; primaryUpdated = true; }
          if (!primaryStudent.tanggal_lahir && dup.tanggal_lahir) { primaryStudent.tanggal_lahir = dup.tanggal_lahir; primaryUpdated = true; }
          if (!primaryStudent.nama_ayah && dup.nama_ayah) { primaryStudent.nama_ayah = dup.nama_ayah; primaryUpdated = true; }
          if (!primaryStudent.nama_ibu && dup.nama_ibu) { primaryStudent.nama_ibu = dup.nama_ibu; primaryUpdated = true; }
          if (!primaryStudent.no_telp_ortu && dup.no_telp_ortu) { primaryStudent.no_telp_ortu = dup.no_telp_ortu; primaryUpdated = true; }
          if (!primaryStudent.foto && dup.foto) { primaryStudent.foto = dup.foto; primaryUpdated = true; }
        }

        if (primaryUpdated) {
          await store.students.setItem(primaryStudent.id, primaryStudent);
        }

        // Relink Grades
        await store.grades.iterate<Grade, void>(async (g, id) => {
          if (g && g.id_siswa && duplicateIds.has(g.id_siswa)) {
            g.id_siswa = primaryStudent.id;
            g.nama = primaryStudent.nama;
            g.nisn = primaryStudent.nisn;
            (g as any).kelas = primaryStudent.kelas;
            await store.grades.setItem(id, g);
            result.relinkedGradesCount++;
          }
        });

        // Relink Attendance
        await store.attendance.iterate<Attendance, void>(async (a, id) => {
          if (a && a.id_siswa && duplicateIds.has(a.id_siswa)) {
            a.id_siswa = primaryStudent.id;
            (a as any).nama_siswa = primaryStudent.nama;
            a.kelas = primaryStudent.kelas;
            await store.attendance.setItem(id, a);
            result.relinkedAttendanceCount++;
          }
        });

        // Relink Tasks
        await store.tasks.iterate<StudentTask, void>(async (t, id) => {
          const taskAny = t as any;
          if (taskAny && taskAny.id_siswa && duplicateIds.has(taskAny.id_siswa)) {
            taskAny.id_siswa = primaryStudent.id;
            taskAny.nama_siswa = primaryStudent.nama;
            await store.tasks.setItem(id, t);
            result.relinkedTasksCount++;
          }
        });

        // Relink Rapor Capaian
        await store.raporCapaian.iterate<RaporCapaian, void>(async (c, id) => {
          if (c && c.id_siswa && duplicateIds.has(c.id_siswa)) {
            c.id_siswa = primaryStudent.id;
            await store.raporCapaian.setItem(id, c);
            result.relinkedRaporCount++;
          }
        });

        // Delete duplicate student documents
        for (const dup of duplicates) {
          await store.students.removeItem(dup.id);
          result.removedDocIds.push(dup.id);
        }
      }
    }

    if (result.duplicatesFound > 0) {
      await recordSyncAuditLog({
        type: 'DIAGNOSTIC',
        status: 'SUCCESS',
        title: 'Penggabungan Data Siswa Duplikat',
        details: `Berhasil menggabungkan ${result.duplicatesFound} data siswa duplikat ke 1 Source of Truth. Relink: ${result.relinkedGradesCount} Nilai, ${result.relinkedAttendanceCount} Absensi.`
      });
      console.log('[Migration] Student deduplication completed:', result);
    }

    return result;
  } catch (err: any) {
    console.error('[Migration] Error merging duplicate students:', err);
    throw err;
  } finally {
    resumeSyncQueue();
    resumeNotifications(true);
  }
}
