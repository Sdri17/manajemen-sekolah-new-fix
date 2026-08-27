import { Student, normalizeStudentHelper } from '../models/student.model';
import { store } from '../lib/store';
import { filterStudentsForUser } from '../lib/rbac';
import { AppUser } from '../models/user.model';

export class StudentController {
  /**
   * Fetch all active students from local storage or cloud
   */
  static async getAllStudents(): Promise<Student[]> {
    const list: Student[] = [];
    await store.students.iterate<any, void>((item) => {
      if (item) list.push(normalizeStudentHelper(item));
    });
    return list;
  }

  /**
   * Filter students according to current user's role and semester
   */
  static filterStudents(students: Student[], user: AppUser | null, semester: string): Student[] {
    const rbacFiltered = filterStudentsForUser(user, students);
    if (!semester) return rbacFiltered;
    return rbacFiltered.filter(s => !s.semester || s.semester === semester);
  }

  /**
   * Add a new student
   */
  static async addStudent(studentData: Partial<Student>): Promise<Student> {
    const normalized = normalizeStudentHelper(studentData);
    await store.students.setItem(normalized.id, normalized);
    return normalized;
  }

  /**
   * Update an existing student
   */
  static async updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
    const existing = (await store.students.getItem(id)) as Record<string, any> | null;
    const updated = normalizeStudentHelper({ ...(existing || {}), ...updates, id });
    await store.students.setItem(id, updated);
    return updated;
  }

  /**
   * Delete a student
   */
  static async deleteStudent(id: string): Promise<void> {
    await store.students.removeItem(id);
  }

  /**
   * Process class graduation for multiple students
   */
  static async processGraduation(studentIds: string[], graduationDate: string, schoolYear: string): Promise<void> {
    for (const id of studentIds) {
      const existing = (await store.students.getItem(id)) as Record<string, any> | null;
      if (existing) {
        const updated = normalizeStudentHelper({
          ...existing,
          kelas: 'Alumni',
          tanggal_lulus: graduationDate,
          tahun_ajaran_lulus: schoolYear
        });
        await store.students.setItem(id, updated);
      }
    }
  }
}
