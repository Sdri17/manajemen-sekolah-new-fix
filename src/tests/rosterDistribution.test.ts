import { describe, it, expect } from 'vitest';
import { 
  distributePiketAssignments, 
  isAssignmentAllowed, 
  StudentCandidate 
} from '../lib/rosterDistribution';

describe('Roster/Piket Automatic Distribution Diagnostic Test Suite', () => {

  const generateMockStudents = (count: number): StudentCandidate[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `std_${i + 1}`,
      nama: `Siswa ${i + 1}`,
      kelas: '4A'
    }));
  };

  const standardDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

  describe('Strict-Cap Validation Function (isAssignmentAllowed)', () => {
    it('should allow valid assignment when counts are below max caps', () => {
      const result = isAssignmentAllowed({
        studentId: 'std_1',
        studentName: 'Siswa 1',
        day: 'Senin',
        studentAssignmentCounts: { std_1: 0 },
        dayAssignmentCounts: { Senin: 1 },
        maxAssignmentsPerStudent: 2,
        maxDayCap: 2,
        assignedThisDay: new Set()
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Lolos semua validasi');
    });

    it('should REJECT assignment when student reached 2-limit constraint (maxAssignmentsPerStudent)', () => {
      const result = isAssignmentAllowed({
        studentId: 'std_1',
        studentName: 'Siswa 1',
        day: 'Selasa',
        studentAssignmentCounts: { std_1: 2 }, // Already has 2 assignments
        dayAssignmentCounts: { Selasa: 0 },
        maxAssignmentsPerStudent: 2,
        maxDayCap: 2,
        assignedThisDay: new Set()
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Strict-Cap Per-Siswa');
      expect(result.reason).toContain('Constraint 2-limit ditegakkan');
    });

    it('should REJECT assignment when day reached daily maximum capacity (maxDayCap)', () => {
      const result = isAssignmentAllowed({
        studentId: 'std_2',
        studentName: 'Siswa 2',
        day: 'Senin',
        studentAssignmentCounts: { std_2: 0 },
        dayAssignmentCounts: { Senin: 2 }, // Day Senin already has 2 students
        maxAssignmentsPerStudent: 2,
        maxDayCap: 2,
        assignedThisDay: new Set()
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Strict-Cap Per-Hari');
    });

    it('should REJECT assignment when student is already assigned on the same day', () => {
      const result = isAssignmentAllowed({
        studentId: 'std_1',
        studentName: 'Siswa 1',
        day: 'Senin',
        studentAssignmentCounts: { std_1: 0 },
        dayAssignmentCounts: { Senin: 0 },
        maxAssignmentsPerStudent: 2,
        maxDayCap: 2,
        assignedThisDay: new Set(['std_1'])
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('sudah ditugaskan pada hari Senin');
    });
  });

  describe('Automatic Distribution Logic (10 Students, 2 Max Cap per Student, 2 Daily Cap)', () => {
    it('should distribute assignments evenly without any student exceeding the 2-limit cap', () => {
      const students = generateMockStudents(10);
      const result = distributePiketAssignments({
        students,
        days: standardDays,
        selectedClass: '4A',
        semester: '1',
        jumlahPiketHarian: 2,
        maxAssignmentsPerStudent: 2
      });

      // Assert zero discrepancies
      expect(result.discrepanciesDetected).toHaveLength(0);

      // Assert no student has > 2 assignments
      Object.entries(result.studentAssignmentCounts).forEach(([studentId, count]) => {
        expect(count).toBeLessThanOrEqual(2);
      });

      // Assert no day has > 2 assignments
      Object.entries(result.dayAssignmentCounts).forEach(([day, count]) => {
        expect(count).toBeLessThanOrEqual(2);
      });

      // Assert total assignments equals total daily slots (5 days * 2 = 10 assignments)
      expect(result.piketList).toHaveLength(10);
    });

    it('should enforce strict 2-limit cap when class is very small (3 Students, 5 Days, 2 Daily Cap = 10 total slots)', () => {
      // With 3 students and 2 cap per student, maximum possible assignments = 3 * 2 = 6 assignments.
      // Remaining 4 slots should NOT be filled by bypassing the 2-limit cap.
      const students = generateMockStudents(3);
      const result = distributePiketAssignments({
        students,
        days: standardDays,
        selectedClass: '4A',
        semester: '1',
        jumlahPiketHarian: 2,
        maxAssignmentsPerStudent: 2
      });

      expect(result.discrepanciesDetected).toHaveLength(0);

      // Every student must have EXACTLY 2 assignments (none can have 3 or more!)
      Object.entries(result.studentAssignmentCounts).forEach(([studentId, count]) => {
        expect(count).toBe(2);
      });

      // Total assignments should be capped at 6 (3 students * 2 max cap)
      expect(result.piketList).toHaveLength(6);
    });

    it('should handle large class (30 Students, 5 Days, 3 Daily Cap = 15 slots total)', () => {
      const students = generateMockStudents(30);
      const result = distributePiketAssignments({
        students,
        days: standardDays,
        selectedClass: '5B',
        semester: '2',
        jumlahPiketHarian: 3,
        maxAssignmentsPerStudent: 2
      });

      expect(result.discrepanciesDetected).toHaveLength(0);
      expect(result.piketList).toHaveLength(15);

      // Exactly 15 students get assigned 1 time, remaining 15 get 0 times
      const assignedCount = Object.values(result.studentAssignmentCounts).filter(c => c === 1).length;
      expect(assignedCount).toBe(15);
    });

    it('should strictly limit a single student to max 2 assignments even if 5 days are available', () => {
      const students = generateMockStudents(1); // Single student
      const result = distributePiketAssignments({
        students,
        days: standardDays,
        selectedClass: '6A',
        semester: '1',
        jumlahPiketHarian: 2,
        maxAssignmentsPerStudent: 2
      });

      expect(result.discrepanciesDetected).toHaveLength(0);
      expect(result.piketList).toHaveLength(2); // Only assigned to 2 days
      expect(result.studentAssignmentCounts['std_1']).toBe(2);
    });
  });

  describe('Logging & Diagnostic Tracing', () => {
    it('should generate detailed step logs tracking current student assignment count before each decision', () => {
      const students = generateMockStudents(5);
      const result = distributePiketAssignments({
        students,
        days: standardDays,
        selectedClass: '4A',
        semester: '1',
        jumlahPiketHarian: 2,
        maxAssignmentsPerStudent: 2
      });

      expect(result.logs.length).toBeGreaterThan(0);
      const firstLog = result.logs[0];
      expect(firstLog).toHaveProperty('step', 1);
      expect(firstLog).toHaveProperty('day', 'Senin');
      expect(firstLog).toHaveProperty('currentStudentAssignmentCount');
      expect(firstLog).toHaveProperty('allowed');
      expect(firstLog).toHaveProperty('reason');
    });
  });

});
