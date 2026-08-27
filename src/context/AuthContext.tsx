import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { AppUser, store } from '../lib/store';
import { getEntityTimestamp, isIncomingDataNewer } from '../lib/firebaseSync';

interface AuthContextType {
  user: AppUser | null;
  role: AppUser['role'] | null;
  isInitializing: boolean;
  setUserState: (user: AppUser | null) => void;
  login: (user: AppUser) => void;
  logout: () => void;
  verifySession: () => AppUser | null;
  verifyMultiSessionState: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUserData(u: AppUser): AppUser {
  if (!u) return u;
  const user = { ...u };
  if (!user.lastModified) {
    user.lastModified = user.updatedAt || new Date().toISOString();
  }
  if (!user.updatedAt) {
    user.updatedAt = user.lastModified;
  }
  if (user.assignedKelas && (!user.assignedClasses || user.assignedClasses.length === 0)) {
    user.assignedClasses = [user.assignedKelas];
  }
  if (user.assignedMapel && (!user.assignedSubjects || user.assignedSubjects.length === 0)) {
    user.assignedSubjects = [user.assignedMapel];
  }
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const saved = localStorage.getItem('app_user');
      if (saved) {
        const u = JSON.parse(saved) as AppUser;
        if (u && u.id && u.username && u.role) return normalizeUserData(u);
      }
    } catch (e) {
      console.error('[AuthContext] Failed to parse saved app_user from localStorage:', e);
      localStorage.removeItem('app_user');
    }
    return null;
  });

  const [role, setRole] = useState<AppUser['role'] | null>(user?.role || null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Instant local session verification method
  const verifySession = useCallback((): AppUser | null => {
    try {
      const saved = localStorage.getItem('app_user');
      if (!saved) return null;
      const u = JSON.parse(saved) as AppUser;
      if (u && u.id && u.username && u.role) {
        return normalizeUserData(u);
      }
    } catch (e) {
      console.error('[AuthContext] Error during verifySession:', e);
      localStorage.removeItem('app_user');
    }
    return null;
  }, []);

  // Comprehensive multi-session state verification check
  const verifyMultiSessionState = useCallback(async (): Promise<boolean> => {
    const localSession = verifySession();
    console.log('[AuthContext] Executing verifyMultiSessionState check...', {
      hasLocalSession: !!localSession,
      localUsername: localSession?.username,
      firebaseAuthUser: auth?.currentUser?.email || auth?.currentUser?.uid || 'None'
    });

    if (!localSession) {
      console.log('[AuthContext] No local session found during multi-session check.');
      return false;
    }

    try {
      // Check if user account still exists in local store or was updated/deleted on another device
      const dbUser = await store.users.getItem<AppUser>(localSession.id).catch(() => null)
        || await store.users.getItem<AppUser>(localSession.username.toLowerCase()).catch(() => null);

      if (dbUser) {
        // Timestamp check: only update if incoming dbUser is newer than or credentials altered
        const isDbUserNewer = isIncomingDataNewer(dbUser, localSession);
        const hasAuthCredentialChanged = dbUser.role !== localSession.role || dbUser.password !== localSession.password;

        if (isDbUserNewer && hasAuthCredentialChanged) {
          console.warn('[AuthContext] Multi-session conflict/update detected! User credentials/role changed remotely and is newer:', {
            storedRole: dbUser.role,
            sessionRole: localSession.role,
            dbUserTimestamp: dbUser.lastModified || dbUser.updatedAt,
            localTimestamp: localSession.lastModified || localSession.updatedAt
          });
          const normalized = normalizeUserData(dbUser);
          setUser(normalized);
          setRole(normalized.role);
          localStorage.setItem('app_user', JSON.stringify(normalized));
          return true;
        } else if (!isDbUserNewer) {
          console.log('[AuthContext] Maintained active local session: local session timestamp is equal or newer than remote DB copy.');
        }
      } else {
        console.warn(`[AuthContext] Multi-session warning: User @${localSession.username} not found in local store cache yet.`);
      }
    } catch (err) {
      console.error('[AuthContext] Error verifying multi-session state:', err);
    }

    return true;
  }, [verifySession]);

  const setUserState = useCallback((u: AppUser | null) => {
    let normalized = u ? normalizeUserData(u) : null;
    if (normalized) {
      normalized.lastModified = new Date().toISOString();
      normalized.updatedAt = normalized.lastModified;
    }
    console.log('[AuthContext] Setting user state:', normalized ? `User @${normalized.username} (${normalized.role})` : 'Logged out');
    setUser(normalized);
    setRole(normalized?.role || null);
    if (normalized) {
      localStorage.setItem('app_user', JSON.stringify(normalized));
    } else {
      localStorage.removeItem('app_user');
    }
  }, []);

  const login = useCallback((u: AppUser) => {
    const normalized = normalizeUserData(u);
    normalized.lastModified = new Date().toISOString();
    normalized.updatedAt = normalized.lastModified;
    console.log('[AuthContext] User login action executed:', `@${normalized.username} (${normalized.role})`);
    localStorage.setItem('app_user', JSON.stringify(normalized));
    setUser(normalized);
    setRole(normalized.role);
  }, []);

  const logout = useCallback(() => {
    console.log('[AuthContext] User logout action executed');
    localStorage.removeItem('app_user');
    setUser(null);
    setRole(null);
  }, []);

  // Firebase Auth listener with comprehensive multi-session logging & verification
  useEffect(() => {
    console.log('[AuthContext] Subscribing to Firebase onAuthStateChanged listener...');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log('[AuthContext] onAuthStateChanged triggered:', {
        firebaseUser: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, isAnonymous: firebaseUser.isAnonymous } : null,
        localAppUser: user ? { id: user.id, username: user.username, role: user.role } : null
      });

      if (firebaseUser) {
        console.log('[AuthContext] Firebase Auth active user detected:', firebaseUser.email || firebaseUser.uid);
        await verifyMultiSessionState();
      } else {
        console.log('[AuthContext] No active Firebase Auth user session. Checking local AppUser session...');
        const currentLocal = verifySession();
        if (currentLocal) {
          console.log('[AuthContext] Active local session maintained for custom AppUser:', `@${currentLocal.username}`);
        } else {
          console.log('[AuthContext] No local session active.');
        }
      }

      setIsInitializing(false);
    });

    return () => {
      console.log('[AuthContext] Unsubscribing from onAuthStateChanged listener.');
      unsubscribe();
    };
  }, [user, verifySession, verifyMultiSessionState]);

  // Sync multi-tab / multi-window storage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'app_user') {
        console.log('[AuthContext] Storage event detected for app_user across sessions/tabs:', e.newValue ? 'User updated/logged in' : 'User logged out');
        if (e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue) as AppUser;
            const normalized = normalizeUserData(parsed);
            setUser(normalized);
            setRole(normalized.role);
          } catch (err) {
            console.error('[AuthContext] Failed to parse app_user from storage event:', err);
          }
        } else {
          setUser(null);
          setRole(null);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Memoized provider context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      user,
      role,
      isInitializing,
      setUserState,
      login,
      logout,
      verifySession,
      verifyMultiSessionState
    }),
    [user, role, isInitializing, setUserState, login, logout, verifySession, verifyMultiSessionState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
