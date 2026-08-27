import { describe, it, expect, beforeEach } from 'vitest';
import { 
  sanitizeInput, 
  sanitizeUsername, 
  containsSqlInjection, 
  getLockoutStatus, 
  recordFailedAttempt, 
  resetFailedAttempts 
} from '../lib/security';

describe('Security & Sanitization Helper Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('sanitizeInput', () => {
    it('should strip malicious script tags and event handlers', () => {
      const malicious = '<script>alert("hack")</script>Hello <img src="x" onerror="alert(1)"> World';
      const clean = sanitizeInput(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onerror=');
      expect(clean).toContain('Hello');
      expect(clean).toContain('World');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('sanitizeUsername', () => {
    it('should strip SQL quotes, slashes, and control characters', () => {
      const dirtyUser = "admin' OR '1'='1; --";
      const cleanUser = sanitizeUsername(dirtyUser);
      expect(cleanUser).toBe('admin OR 1=1');
      expect(cleanUser).not.toContain("'");
      expect(cleanUser).not.toContain(';');
      expect(cleanUser).not.toContain('--');
    });
  });

  describe('containsSqlInjection', () => {
    it('should detect SQL Injection patterns', () => {
      expect(containsSqlInjection("admin' OR '1'='1")).toBe(true);
      expect(containsSqlInjection("UNION SELECT * FROM users")).toBe(true);
      expect(containsSqlInjection("; DROP TABLE students")).toBe(true);
      expect(containsSqlInjection("normal_user123")).toBe(false);
    });
  });

  describe('Login Lockout Calculations', () => {
    it('should start unlocked with 0 attempts', () => {
      const status = getLockoutStatus();
      expect(status.isLocked).toBe(false);
      expect(status.attemptsCount).toBe(0);
      expect(status.remainingSeconds).toBe(0);
    });

    it('should increment attempt count and lock after 5 failed attempts', () => {
      recordFailedAttempt(); // 1
      recordFailedAttempt(); // 2
      recordFailedAttempt(); // 3
      recordFailedAttempt(); // 4
      const statusAfter4 = getLockoutStatus();
      expect(statusAfter4.isLocked).toBe(false);
      expect(statusAfter4.attemptsCount).toBe(4);

      const statusAfter5 = recordFailedAttempt(); // 5th attempt trigger lockout
      expect(statusAfter5.isLocked).toBe(true);
      expect(statusAfter5.attemptsCount).toBe(5);
      expect(statusAfter5.remainingSeconds).toBeGreaterThan(0);
    });

    it('should reset failed attempts upon successful login reset', () => {
      recordFailedAttempt();
      recordFailedAttempt();
      resetFailedAttempts();

      const status = getLockoutStatus();
      expect(status.isLocked).toBe(false);
      expect(status.attemptsCount).toBe(0);
    });
  });
});
