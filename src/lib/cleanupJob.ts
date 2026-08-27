import { store, Attendance, Student, Grade, StudentTask, HolidayConfig, Settings } from './store';
import { parseISO, format } from 'date-fns';

export interface CleanupJobSummary {
  timestamp: string;
  holidayAttendanceRemoved: number;
  orphanedAttendanceRemoved: number;
  orphanedGradesRemoved: number;
  staleSyncLogsPurged: number;
  expiredLocksPurged: number;
  totalPurged: number;
  details: string[];
}

/**
 * Validates whether a date string (YYYY-MM-DD) falls on a Sunday, Saturday (if 5-day school),
 * or inside a registered custom holiday in holiday_config / settings.
 */
export async function isDateHoliday(dateStr: string): Promise<{ isHoliday: boolean; reason: string }> {
  if (!dateStr || dateStr.length < 10) return { isHoliday: false, reason: '' };
  const cleanDateStr = dateStr.substring(0, 10);
  try {
    const d = parseISO(cleanDateStr);
    if (isNaN(d.getTime())) return { isHoliday: false, reason: '' };

    // Sunday check
    if (d.getDay() === 0) {
      return { isHoliday: true, reason: 'Hari Minggu' };
    }

    // Check school settings for 5-day school week (Saturday)
    const settings = await store.settings.getItem<Settings>('app_settings').catch(() => null);
    const isFiveDaySchool = (settings?.hari_sekolah ?? 5) === 5;
    if (isFiveDaySchool && d.getDay() === 6) {
      return { isHoliday: true, reason: 'Hari Sabtu (Libur Akhir Pekan)' };
    }

    // Check centralized holiday_config store
    let holidays: HolidayConfig[] = [];
    await store.holiday_config.iterate<HolidayConfig, void>((h) => {
      if (h && h.tanggal_mulai && h.tanggal_selesai) {
        holidays.push(h);
      }
    }).catch(() => {});

    // Fallback check settings custom holidays
    if (settings?.holidays && Array.isArray(settings.holidays)) {
      settings.holidays.forEach(h => {
        if (h.tanggal_mulai && h.tanggal_selesai) {
          holidays.push({
            id: h.id || Math.random().toString(),
            nama: h.nama,
            tanggal_mulai: h.tanggal_mulai,
            tanggal_selesai: h.tanggal_selesai,
            catatan: h.catatan
          });
        }
      });
    }

    const found = holidays.find(h => cleanDateStr >= h.tanggal_mulai && cleanDateStr <= h.tanggal_selesai);
    if (found) {
      return { isHoliday: true, reason: found.nama || 'Hari Libur Terdaftar' };
    }
  } catch (e) {}

  return { isHoliday: false, reason: '' };
}

/**
 * Executes a comprehensive cleanup job to purge anomalous, orphaned, and stale data.
 */
export async function runScheduledCleanupJob(): Promise<CleanupJobSummary> {
  const summary: CleanupJobSummary = {
    timestamp: new Date().toISOString(),
    holidayAttendanceRemoved: 0,
    orphanedAttendanceRemoved: 0,
    orphanedGradesRemoved: 0,
    staleSyncLogsPurged: 0,
    expiredLocksPurged: 0,
    totalPurged: 0,
    details: []
  };

  try {
    console.log('[CleanupJob] Starting scheduled data cleanup & anomaly purge...');

    // 1. Load active student ID map for orphan detection
    const validStudentIds = new Set<string>();
    await store.students.iterate<Student, void>((s) => {
      if (s && s.id) validStudentIds.add(String(s.id));
    }).catch(() => {});

    // 2. Scan and purge anomalous attendance records (holiday attendance or orphaned student ID)
    const attendanceToDelete: string[] = [];
    await store.attendance.iterate<Attendance, void>(async (att, key) => {
      if (!att) return;

      // Check orphan student ID
      const studentId = (att as any).siswaId || att.id_siswa || (att as any).studentId;
      if (studentId && validStudentIds.size > 0 && !validStudentIds.has(String(studentId))) {
        attendanceToDelete.push(key);
        summary.orphanedAttendanceRemoved++;
        return;
      }

      // Check date against holiday list
      if (att.tanggal) {
        const hol = await isDateHoliday(String(att.tanggal));
        if (hol.isHoliday && att.status === 'Hadir') {
          attendanceToDelete.push(key);
          summary.holidayAttendanceRemoved++;
        }
      }
    }).catch(() => {});

    for (const key of attendanceToDelete) {
      await store.attendance.removeItem(key).catch(() => {});
    }

    // 3. Scan and purge orphaned grade records
    const gradesToDelete: string[] = [];
    await store.grades.iterate<Grade, void>((g, key) => {
      if (!g) return;
      const sId = (g as any).siswaId || g.id_siswa || (g as any).studentId;
      if (sId && validStudentIds.size > 0 && !validStudentIds.has(String(sId))) {
        gradesToDelete.push(key);
        summary.orphanedGradesRemoved++;
      }
    }).catch(() => {});

    for (const key of gradesToDelete) {
      await store.grades.removeItem(key).catch(() => {});
    }

    // 4. Purge stale sync audit logs older than 30 days
    const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const staleLogsToDelete: string[] = [];
    await store.syncLogs.iterate<any, void>((log, key) => {
      if (log && log.timestamp) {
        const logTime = new Date(log.timestamp).getTime();
        if (!isNaN(logTime) && logTime < thirtyDaysAgoMs) {
          staleLogsToDelete.push(key);
          summary.staleSyncLogsPurged++;
        }
      }
    }).catch(() => {});

    for (const key of staleLogsToDelete) {
      await store.syncLogs.removeItem(key).catch(() => {});
    }

    // 5. Purge expired document locks
    const nowMs = Date.now();
    const expiredLocksToDelete: string[] = [];
    await store.documentLocks.iterate<any, void>((lock, key) => {
      if (lock && lock.expiresAt) {
        const exp = new Date(lock.expiresAt).getTime();
        if (!isNaN(exp) && exp < nowMs) {
          expiredLocksToDelete.push(key);
          summary.expiredLocksPurged++;
        }
      }
    }).catch(() => {});

    for (const key of expiredLocksToDelete) {
      await store.documentLocks.removeItem(key).catch(() => {});
    }

    summary.totalPurged = 
      summary.holidayAttendanceRemoved + 
      summary.orphanedAttendanceRemoved + 
      summary.orphanedGradesRemoved + 
      summary.staleSyncLogsPurged + 
      summary.expiredLocksPurged;

    summary.details.push(`Absensi Libur Dihapus: ${summary.holidayAttendanceRemoved}`);
    summary.details.push(`Absensi Yatim Dihapus: ${summary.orphanedAttendanceRemoved}`);
    summary.details.push(`Nilai Yatim Dihapus: ${summary.orphanedGradesRemoved}`);
    summary.details.push(`Log Usang Dihapus: ${summary.staleSyncLogsPurged}`);
    summary.details.push(`Lock Kadaluarsa Dihapus: ${summary.expiredLocksPurged}`);

    console.log(`[CleanupJob Completed] Purged ${summary.totalPurged} stale/anomalous items:`, summary);

    if (summary.totalPurged > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
    }
  } catch (err) {
    console.error('[CleanupJob Error]', err);
  }

  return summary;
}

let scheduledTimer: any = null;

/**
 * Initializes auto-running scheduled cleanup job on boot and every configured interval.
 */
export function initScheduledCleanupJob(intervalMs: number = 3600000) { // Default: 1 hour
  if (typeof window === 'undefined') return;
  
  // Run cleanup 10 seconds after boot to avoid slowing initial page load
  setTimeout(() => {
    runScheduledCleanupJob().catch(() => {});
  }, 10000);

  if (scheduledTimer) clearInterval(scheduledTimer);
  scheduledTimer = setInterval(() => {
    runScheduledCleanupJob().catch(() => {});
  }, intervalMs);
}
