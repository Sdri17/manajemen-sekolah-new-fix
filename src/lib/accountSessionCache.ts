/**
 * Account Session & Cookie Cache Management Module
 * - Provides per-user Cookie & LocalStorage persistence across devices & browser restarts
 * - Eliminates automatic page reloads during sync operations
 * - Tracks last sync timestamps per user account to enable instant local cache loading
 *   and background incremental (delta) sync across devices without starting from zero
 */

export interface AccountSessionData {
  userId: string;
  username: string;
  role: string;
  lastSyncTimestamp: string;
  updatedAt: string;
}

/**
 * Set a cookie with expiration and SameSite=Lax
 */
export function setCookie(name: string, value: string, days = 30): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }
  return null;
}

/**
 * Erase a cookie by name
 */
export function eraseCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=-99999999; path=/; SameSite=Lax`;
}

/**
 * Save user account session & metadata into Cookie and LocalStorage
 */
export function saveAccountSession(user: { id: string; username: string; role: string; [key: string]: any }): void {
  if (!user || !user.id) return;
  const userId = String(user.id);
  
  // Get existing last sync timestamp or set initial epoch
  const existingTs = getAccountLastSyncTs(userId) || new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  
  const sessionData: AccountSessionData = {
    userId,
    username: user.username || '',
    role: user.role || '',
    lastSyncTimestamp: existingTs,
    updatedAt: new Date().toISOString()
  };

  const jsonStr = JSON.stringify(sessionData);

  // 1. Write Cookie for persistent session
  setCookie(`edusync_session_${userId}`, jsonStr, 30);
  setCookie('edusync_active_user', userId, 30);

  // 2. Write LocalStorage for fast client access
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`edusync_account_session_${userId}`, jsonStr);
    localStorage.setItem('edusync_user_id', userId);
    if (!localStorage.getItem(`edusync_last_sync_ts_${userId}`)) {
      localStorage.setItem(`edusync_last_sync_ts_${userId}`, existingTs);
    }
  }
}

/**
 * Retrieve the last sync timestamp for a specific user account from Cookie or LocalStorage
 */
export function getAccountLastSyncTs(userId: string): string | null {
  if (!userId) return null;
  const uid = String(userId);

  // 1. Try account cookie first
  const cookieVal = getCookie(`edusync_session_${uid}`);
  if (cookieVal) {
    try {
      const parsed = JSON.parse(cookieVal);
      if (parsed?.lastSyncTimestamp) return parsed.lastSyncTimestamp;
    } catch (e) {}
  }

  // 2. Try direct timestamp cookie
  const directCookie = getCookie(`edusync_last_sync_${uid}`);
  if (directCookie) return directCookie;

  // 3. Try LocalStorage
  if (typeof localStorage !== 'undefined') {
    const lsAccount = localStorage.getItem(`edusync_account_session_${uid}`);
    if (lsAccount) {
      try {
        const parsed = JSON.parse(lsAccount);
        if (parsed?.lastSyncTimestamp) return parsed.lastSyncTimestamp;
      } catch (e) {}
    }
    const directLs = localStorage.getItem(`edusync_last_sync_ts_${uid}`);
    if (directLs) return directLs;
  }

  return null;
}

/**
 * Update the last sync timestamp for a user account in Cookie & LocalStorage
 */
export function updateAccountLastSyncTs(userId: string, timestamp?: string): void {
  if (!userId) return;
  const uid = String(userId);
  const ts = timestamp || new Date().toISOString();

  // 1. Update direct cookie & localStorage
  setCookie(`edusync_last_sync_${uid}`, ts, 30);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`edusync_last_sync_ts_${uid}`, ts);
  }

  // 2. Update session data structure
  const rawSession = getCookie(`edusync_session_${uid}`) || 
    (typeof localStorage !== 'undefined' ? localStorage.getItem(`edusync_account_session_${uid}`) : null);
  
  let sessionObj: AccountSessionData = {
    userId: uid,
    username: '',
    role: '',
    lastSyncTimestamp: ts,
    updatedAt: new Date().toISOString()
  };

  if (rawSession) {
    try {
      sessionObj = { ...JSON.parse(rawSession), lastSyncTimestamp: ts, updatedAt: new Date().toISOString() };
    } catch (e) {}
  }

  const jsonStr = JSON.stringify(sessionObj);
  setCookie(`edusync_session_${uid}`, jsonStr, 30);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`edusync_account_session_${uid}`, jsonStr);
  }
}
