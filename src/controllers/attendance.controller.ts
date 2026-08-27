import { Attendance, AttendanceSummary, calculateAttendanceStats } from '../models/attendance.model';
import { store } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';

export class AttendanceController {
  /**
   * Get attendances for a specific date and semester
   */
  static async getAttendancesByDate(dateStr: string, semester: string): Promise<Attendance[]> {
    const list: Attendance[] = [];
    await store.attendance.iterate<Attendance, void>((item) => {
      if (item && item.tanggal === dateStr && (item.semester === semester || !item.semester)) {
        list.push(item);
      }
    });
    return list;
  }

  /**
   * Record single attendance
   */
  static async recordAttendance(
    studentId: string,
    status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa',
    dateStr: string,
    semester: string,
    mapel?: string,
    keterangan?: string
  ): Promise<Attendance> {
    let existing: Attendance | null = null;
    await store.attendance.iterate<Attendance, void>((item) => {
      if (item && item.id_siswa === studentId && item.tanggal === dateStr && item.semester === semester) {
        existing = item;
      }
    });

    const record: Attendance = {
      id: existing ? (existing as Attendance).id : uuidv4(),
      id_siswa: studentId,
      tanggal: dateStr,
      status,
      semester,
      mata_pelajaran: mapel,
      keterangan: keterangan || '',
      created_at: existing ? (existing as Attendance).created_at : new Date().toISOString()
    };

    await store.attendance.setItem(record.id, record);
    return record;
  }

  /**
   * Mass update attendance status for a list of students on a specific date
   */
  static async massRecordAttendance(
    studentIds: string[],
    status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa',
    dateStr: string,
    semester: string
  ): Promise<void> {
    for (const id of studentIds) {
      await this.recordAttendance(id, status, dateStr, semester);
    }
  }

  /**
   * Get attendance summary for a student
   */
  static async getStudentAttendanceSummary(studentId: string, semester: string): Promise<AttendanceSummary> {
    const studentRecords: Attendance[] = [];
    await store.attendance.iterate<Attendance, void>((item) => {
      if (item && item.id_siswa === studentId && (item.semester === semester || !item.semester)) {
        studentRecords.push(item);
      }
    });
    return calculateAttendanceStats(studentRecords);
  }
}
