/**
 * Security & Anti-Injection Helper Utilities
 * Provides input sanitization, SQL/XSS injection checks, and brute-force lockout handling.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout

export interface LockoutStatus {
  isLocked: boolean;
  remainingSeconds: number;
  attemptsCount: number;
}

/**
 * Sanitizes input string to prevent SQL Injection & XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script tags
    .replace(/javascript:/gi, '') // Strip inline javascript URLs
    .replace(/onload\s*=/gi, '')
    .replace(/onerror\s*=/gi, '')
    .replace(/onclick\s*=/gi, '')
    .trim();
}

/**
 * Sanitizes username strictly to prevent injection patterns
 */
export function sanitizeUsername(username: string): string {
  if (!username) return '';
  // Remove control characters, quotes, and dangerous SQL characters
  return username.replace(/['"\\;\-/*#]/g, '').trim();
}

/**
 * Detects obvious SQL Injection patterns in input string
 */
export function containsSqlInjection(input: string): boolean {
  if (!input) return false;
  const sqlPatterns = [
    /('|\")\s*(or|and)\s*('|\")?\d+('|\")?\s*=\s*('|\")?\d+/i, // ' OR '1'='1
    /('|\")\s*(or|and)\s*true/i,
    /union\s+select/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /update\s+.*\s+set/i,
    /exec(\s|\+)+(s|x)p_/i,
    /--/,
    /\/\*/,
    /;\s*drop/i,
    /;\s*delete/i,
    /;\s*update/i
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Get current failed attempts and lockout status from localStorage
 */
export function getLockoutStatus(): LockoutStatus {
  try {
    const raw = localStorage.getItem('auth_lockout_data');
    if (!raw) {
      return { isLocked: false, remainingSeconds: 0, attemptsCount: 0 };
    }

    const data = JSON.parse(raw);
    const now = Date.now();

    if (data.lockedUntil && now < data.lockedUntil) {
      const remainingSeconds = Math.ceil((data.lockedUntil - now) / 1000);
      return {
        isLocked: true,
        remainingSeconds,
        attemptsCount: data.attemptsCount || MAX_FAILED_ATTEMPTS
      };
    }

    // Lockout expired, reset if timestamp passed
    if (data.lockedUntil && now >= data.lockedUntil) {
      resetFailedAttempts();
      return { isLocked: false, remainingSeconds: 0, attemptsCount: 0 };
    }

    return {
      isLocked: false,
      remainingSeconds: 0,
      attemptsCount: data.attemptsCount || 0
    };
  } catch (e) {
    return { isLocked: false, remainingSeconds: 0, attemptsCount: 0 };
  }
}

/**
 * Records a failed login attempt and locks account if threshold exceeded
 */
export function recordFailedAttempt(): LockoutStatus {
  try {
    const currentStatus = getLockoutStatus();
    const newCount = currentStatus.attemptsCount + 1;
    const now = Date.now();

    let lockedUntil: number | null = null;
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = now + LOCKOUT_DURATION_MS;
    }

    const data = {
      attemptsCount: newCount,
      lockedUntil
    };

    localStorage.setItem('auth_lockout_data', JSON.stringify(data));

    const remainingSeconds = lockedUntil ? Math.ceil(LOCKOUT_DURATION_MS / 1000) : 0;
    return {
      isLocked: !!lockedUntil,
      remainingSeconds,
      attemptsCount: newCount
    };
  } catch (e) {
    return { isLocked: false, remainingSeconds: 0, attemptsCount: 0 };
  }
}

/**
 * Resets failed attempts counter upon successful login
 */
export function resetFailedAttempts(): void {
  try {
    localStorage.removeItem('auth_lockout_data');
  } catch (e) {
    console.error('Failed to clear auth lockout data:', e);
  }
}
