import { Grade, StudentTask, calculateWeightedGrade } from '../models/grade.model';
import { store } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';

export class GradeController {
  /**
   * Get grades for a student in a semester
   */
  static async getStudentGrades(studentId: string, semester: string): Promise<Grade[]> {
    const list: Grade[] = [];
    await store.grades.iterate<Grade, void>((item) => {
      if (item && item.id_siswa === studentId && (item.semester === semester || !item.semester)) {
        list.push(item);
      }
    });
    return list;
  }

  /**
   * Upsert a grade entry
   */
  static async saveGrade(gradeData: Omit<Grade, 'id'> & { id?: string }): Promise<Grade> {
    const id = gradeData.id || uuidv4();
    const record: Grade = {
      ...gradeData,
      id,
      nilai: Number(gradeData.nilai) || 0
    };
    await store.grades.setItem(id, record);
    return record;
  }

  /**
   * Calculate final subject grade for a student
   */
  static computeSubjectGrade(
    grades: Grade[],
    mapel: string,
    bobotHarian: number,
    bobotTugas: number,
    bobotUjian: number
  ): number {
    const subjectGrades = grades.filter(g => g.mata_pelajaran === mapel);

    const harian = subjectGrades.filter(g => g.jenis_nilai === 'Harian');
    const tugas = subjectGrades.filter(g => g.jenis_nilai === 'Tugas');
    const ujian = subjectGrades.filter(g => g.jenis_nilai === 'Ujian');

    const avgHarian = harian.length ? harian.reduce((a, b) => a + b.nilai, 0) / harian.length : 0;
    const avgTugas = tugas.length ? tugas.reduce((a, b) => a + b.nilai, 0) / tugas.length : 0;
    const avgUjian = ujian.length ? ujian.reduce((a, b) => a + b.nilai, 0) / ujian.length : 0;

    return calculateWeightedGrade(avgHarian, avgTugas, avgUjian, bobotHarian, bobotTugas, bobotUjian);
  }

  /**
   * Get student tasks for a class and semester
   */
  static async getTasksByClass(kelas: string, semester: string): Promise<StudentTask[]> {
    const list: StudentTask[] = [];
    await store.tasks.iterate<StudentTask, void>((item) => {
      if (item && (item.kelas === kelas || !item.kelas) && (item.semester === semester || !item.semester)) {
        list.push(item);
      }
    });
    return list;
  }
}
