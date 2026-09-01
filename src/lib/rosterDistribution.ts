import { v4 as uuidv4 } from 'uuid';
import { logAuditEvent } from './auditLogger';

export interface StudentCandidate {
  id: string;
  nama: string;
  kelas?: string;
}

export interface PiketAssignmentItem {
  id: string;
  hari: string;
  id_siswa: string;
  kelas: string;
  semester: string;
}

export interface DistributionStepLog {
  step: number;
  day: string;
  studentId: string;
  studentName: string;
  currentStudentAssignmentCount: number;
  maxAssignmentsPerStudent: number;
  currentDayAssignmentCount: number;
  maxDayCap: number;
  allowed: boolean;
  reason: string;
}

export interface DistributionResult {
  piketList: PiketAssignmentItem[];
  studentAssignmentCounts: Record<string, number>;
  dayAssignmentCounts: Record<string, number>;
  logs: DistributionStepLog[];
  discrepanciesDetected: string[];
  maxAssignmentsPerStudent: number;
  maxDayCap: number;
}

/**
 * Strict-Cap Validation Function
 * Executed BEFORE adding a student to a specific date/period.
 * Ensures:
 * 1. The student does NOT exceed the maximum allowed total assignments (the '2-limit' constraint).
 * 2. The day/period does NOT exceed the maximum allowed daily capacity (maxDayCap / jumlahPiketHarian).
 * 3. The student is NOT already assigned on the same day.
 */
export function isAssignmentAllowed(params: {
  studentId: string;
  studentName?: string;
  day: string;
  studentAssignmentCounts: Record<string, number>;
  dayAssignmentCounts: Record<string, number>;
  maxAssignmentsPerStudent: number;
  maxDayCap: number;
  assignedThisDay: Set<string>;
}): { allowed: boolean; reason: string } {
  const {
    studentId,
    studentName = studentId,
    day,
    studentAssignmentCounts,
    dayAssignmentCounts,
    maxAssignmentsPerStudent,
    maxDayCap,
    assignedThisDay
  } = params;

  // Gate 1: Check duplicate on the same day
  if (assignedThisDay.has(studentId)) {
    return {
      allowed: false,
      reason: `Siswa ${studentName} (${studentId}) sudah ditugaskan pada hari ${day}.`
    };
  }

  // Gate 2: Check student assignment count cap (the 2-limit constraint)
  const currentStudentCount = studentAssignmentCounts[studentId] || 0;
  if (currentStudentCount >= maxAssignmentsPerStudent) {
    return {
      allowed: false,
      reason: `Strict-Cap Per-Siswa: ${studentName} sudah mencapai batas maksimum ${maxAssignmentsPerStudent} penugasan (${currentStudentCount}/${maxAssignmentsPerStudent}). Constraint 2-limit ditegakkan.`
    };
  }

  // Gate 3: Check day assignment count cap (max daily capacity)
  const currentDayCount = dayAssignmentCounts[day] || 0;
  if (currentDayCount >= maxDayCap) {
    return {
      allowed: false,
      reason: `Strict-Cap Per-Hari: Hari ${day} sudah mencapai batas kuota harian ${maxDayCap} petugas (${currentDayCount}/${maxDayCap}).`
    };
  }

  return {
    allowed: true,
    reason: `Lolos semua validasi strict-cap (${currentStudentCount + 1}/${maxAssignmentsPerStudent} penugasan siswa, ${currentDayCount + 1}/${maxDayCap} petugas hari ${day}).`
  };
}

/**
 * Automatic Piket Distribution Algorithm with Strict-Cap Enforcement & Diagnostic Logging
 */
export function distributePiketAssignments(params: {
  students: StudentCandidate[];
  days: string[];
  selectedClass: string;
  semester: string;
  jumlahPiketHarian: number;
  maxAssignmentsPerStudent?: number; // Default 2
}): DistributionResult {
  const {
    students,
    days,
    selectedClass,
    semester,
    jumlahPiketHarian,
    maxAssignmentsPerStudent = 2
  } = params;

  const logs: DistributionStepLog[] = [];
  const discrepanciesDetected: string[] = [];
  const studentAssignmentCounts: Record<string, number> = {};
  const dayAssignmentCounts: Record<string, number> = {};
  const piketList: PiketAssignmentItem[] = [];

  // Initialize counts for all students
  students.forEach(s => {
    studentAssignmentCounts[s.id] = 0;
  });

  // Initialize counts for all days
  days.forEach(d => {
    dayAssignmentCounts[d] = 0;
  });

  const maxDayCap = Math.max(1, Math.min(students.length, jumlahPiketHarian));
  let studentIndex = 0;
  let stepCounter = 0;

  console.info(`[RosterPiket Distribution] Starting auto-distribution for Class ${selectedClass}. Students: ${students.length}, Days: ${days.length}, Target per day: ${maxDayCap}, Max cap per student: ${maxAssignmentsPerStudent}`);

  for (const day of days) {
    const assignedThisDay = new Set<string>();
    let attempts = 0;
    const maxAttempts = students.length * 2;

    while (dayAssignmentCounts[day] < maxDayCap && attempts < maxAttempts) {
      stepCounter++;
      const std = students[studentIndex % students.length];

      const validation = isAssignmentAllowed({
        studentId: std.id,
        studentName: std.nama,
        day,
        studentAssignmentCounts,
        dayAssignmentCounts,
        maxAssignmentsPerStudent,
        maxDayCap,
        assignedThisDay
      });

      const currentStudentCount = studentAssignmentCounts[std.id] || 0;
      const currentDayCount = dayAssignmentCounts[day] || 0;

      const logEntry: DistributionStepLog = {
        step: stepCounter,
        day,
        studentId: std.id,
        studentName: std.nama,
        currentStudentAssignmentCount: currentStudentCount,
        maxAssignmentsPerStudent,
        currentDayAssignmentCount: currentDayCount,
        maxDayCap,
        allowed: validation.allowed,
        reason: validation.reason
      };

      logs.push(logEntry);

      if (validation.allowed) {
        assignedThisDay.add(std.id);
        studentAssignmentCounts[std.id] = currentStudentCount + 1;
        dayAssignmentCounts[day] = currentDayCount + 1;

        const newItem: PiketAssignmentItem = {
          id: uuidv4(),
          hari: day,
          id_siswa: std.id,
          kelas: selectedClass,
          semester
        };
        piketList.push(newItem);

        console.info(`[RosterPiket Step #${stepCounter}] ASSIGNED: ${std.nama} -> ${day} (Student Total: ${studentAssignmentCounts[std.id]}/${maxAssignmentsPerStudent}, Day Total: ${dayAssignmentCounts[day]}/${maxDayCap})`);
      } else {
        console.warn(`[RosterPiket Step #${stepCounter}] SKIPPED: ${std.nama} -> ${day} | Reason: ${validation.reason}`);
      }

      studentIndex++;
      attempts++;
    }
  }

  // Double-Check / Post-Verification Safety Gate
  // Assert that NO student assignment count exceeds maxAssignmentsPerStudent
  Object.entries(studentAssignmentCounts).forEach(([sId, count]) => {
    if (count > maxAssignmentsPerStudent) {
      const std = students.find(s => s.id === sId);
      const name = std ? std.nama : sId;
      const discrepancyMsg = `Discrepancy Violation Detected! Student ${name} received ${count} assignments (exceeds 2-limit cap of ${maxAssignmentsPerStudent}).`;
      discrepanciesDetected.push(discrepancyMsg);
      console.error(`[RosterPiket Security Alert] ${discrepancyMsg}`);
    }
  });

  // Assert that NO day count exceeds maxDayCap
  Object.entries(dayAssignmentCounts).forEach(([d, count]) => {
    if (count > maxDayCap) {
      const discrepancyMsg = `Discrepancy Violation Detected! Day ${d} received ${count} assignments (exceeds daily cap of ${maxDayCap}).`;
      discrepanciesDetected.push(discrepancyMsg);
      console.error(`[RosterPiket Security Alert] ${discrepancyMsg}`);
    }
  });

  return {
    piketList,
    studentAssignmentCounts,
    dayAssignmentCounts,
    logs,
    discrepanciesDetected,
    maxAssignmentsPerStudent,
    maxDayCap
  };
}

/**
 * Log a roster_update distribution event to Firestore 'audit_logs' collection
 */
export async function logRosterUpdateAuditEvent(params: {
  selectedClass: string;
  semester: string;
  jumlahPiketHarian: number;
  result: DistributionResult;
}) {
  const { selectedClass, semester, jumlahPiketHarian, result } = params;

  const totalAssigned = result.piketList.length;
  const discrepancyCount = result.discrepanciesDetected.length;
  const statusSummary = discrepancyCount === 0 ? 'SUCCESS_STRICT_CAP' : 'DISCREPANCY_DETECTED';

  const details = `roster_update: Auto distribusi piket Kelas ${selectedClass} (Semester ${semester}) berhasil diproses. Total Penugasan: ${totalAssigned}. Cap Siswa: ${result.maxAssignmentsPerStudent}, Cap Harian: ${result.maxDayCap}. Status: ${statusSummary}.`;

  await logAuditEvent({
    action: 'UPDATE',
    entity: 'roster_update',
    entity_id: `roster_update_${selectedClass}_${Date.now()}`,
    details,
    new_value: {
      selectedClass,
      semester,
      jumlahPiketHarian,
      maxAssignmentsPerStudent: result.maxAssignmentsPerStudent,
      maxDayCap: result.maxDayCap,
      totalAssigned,
      studentAssignmentCounts: result.studentAssignmentCounts,
      dayAssignmentCounts: result.dayAssignmentCounts,
      discrepanciesDetected: result.discrepanciesDetected,
      logsSummary: result.logs.slice(0, 30) // sample step logs
    }
  });
}
