import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { getCurrentUser } from './rbac';
import { store } from './store';
import { useEffect, useState } from 'react';

export interface DocumentLock {
  id: string; // Format: "${entityType}_${entityId}"
  entityType: string; // 'students' | 'grades' | 'tasks' | 'kas' | 'jurnal' | 'users'
  entityId: string;
  lockedBy: {
    id?: string;
    username: string;
    name: string;
    role?: string;
  };
  lockedAt: number; // Timestamp MS
  expiresAt: number; // Timestamp MS
}

const activeLocksMap = new Map<string, DocumentLock>();
let isLockListenerActive = false;
let unsubscribeLockListener: (() => void) | null = null;

function notifyLocksChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('document-locks-changed', {
      detail: Array.from(activeLocksMap.values())
    }));
  }
}

/**
 * Initialize real-time subscription for document locks in Firestore
 */
export function initDocumentLocksRealtimeListener() {
  if (isLockListenerActive) return;
  isLockListenerActive = true;

  try {
    const colRef = collection(db, 'document_locks');
    unsubscribeLockListener = onSnapshot(colRef, (snapshot) => {
      const now = Date.now();
      const currentKeys = new Set<string>();

      snapshot.docs.forEach((docSnap) => {
        const lockData = docSnap.data() as DocumentLock;
        if (lockData && lockData.expiresAt > now) {
          activeLocksMap.set(docSnap.id, lockData);
          currentKeys.add(docSnap.id);
          // Sync to local store for offline cache
          store.documentLocks.setItem(docSnap.id, lockData).catch(() => {});
        } else {
          // Expired lock
          activeLocksMap.delete(docSnap.id);
          store.documentLocks.removeItem(docSnap.id).catch(() => {});
        }
      });

      // Remove locks that are no longer in Firestore snapshot
      Array.from(activeLocksMap.keys()).forEach((key) => {
        if (!currentKeys.has(key)) {
          activeLocksMap.delete(key);
          store.documentLocks.removeItem(key).catch(() => {});
        }
      });

      notifyLocksChanged();
    }, (err) => {
      console.warn('[DocumentLock] Realtime lock listener warning:', err);
    });
  } catch (err) {
    console.warn('[DocumentLock] Failed to initialize lock listener:', err);
  }
}

/**
 * Acquire a lock for editing a specific entity
 */
export async function acquireDocumentLock(
  entityType: string,
  entityId: string,
  leaseMs = 120000 // 2 minutes lease
): Promise<boolean> {
  if (!entityType || !entityId) return false;
  const user = getCurrentUser();
  if (!user || !user.username) return false;

  const lockId = `${entityType}_${entityId}`;
  const now = Date.now();
  const expiresAt = now + leaseMs;

  const existingLock = activeLocksMap.get(lockId);
  if (existingLock && existingLock.expiresAt > now && existingLock.lockedBy.username !== user.username) {
    console.warn(`[DocumentLock] Document ${lockId} is currently locked by @${existingLock.lockedBy.username}`);
    return false; // Cannot acquire, locked by another user
  }

  const lockObj: DocumentLock = {
    id: lockId,
    entityType,
    entityId: String(entityId),
    lockedBy: {
      id: user.id,
      username: user.username,
      name: user.name || user.username,
      role: user.role
    },
    lockedAt: now,
    expiresAt
  };

  // Set locally
  activeLocksMap.set(lockId, lockObj);
  notifyLocksChanged();

  // Sync to Firestore
  try {
    const docRef = doc(db, 'document_locks', lockId);
    await setDoc(docRef, lockObj);
    await store.documentLocks.setItem(lockId, lockObj);
    return true;
  } catch (err) {
    console.warn(`[DocumentLock] Failed to push lock to Firestore for ${lockId}:`, err);
    return true; // Still allow local lock
  }
}

/**
 * Release lock when edit finishes or form closes
 */
export async function releaseDocumentLock(entityType: string, entityId: string): Promise<void> {
  if (!entityType || !entityId) return;
  const user = getCurrentUser();
  const lockId = `${entityType}_${entityId}`;

  const existingLock = activeLocksMap.get(lockId);
  if (existingLock && user && existingLock.lockedBy.username !== user.username) {
    // Only owner or admin can release lock
    if ((user.role as string) !== 'admin' && (user.role as string) !== 'kepsek') return;
  }

  activeLocksMap.delete(lockId);
  notifyLocksChanged();

  try {
    const docRef = doc(db, 'document_locks', lockId);
    await deleteDoc(docRef);
    await store.documentLocks.removeItem(lockId);
  } catch (err) {
    console.warn(`[DocumentLock] Failed to delete lock from Firestore for ${lockId}:`, err);
  }
}

/**
 * Refresh lease time for an active lock
 */
export async function heartbeatDocumentLock(
  entityType: string,
  entityId: string,
  extensionMs = 120000
): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  const lockId = `${entityType}_${entityId}`;
  const existing = activeLocksMap.get(lockId);
  if (existing && existing.lockedBy.username === user.username) {
    await acquireDocumentLock(entityType, entityId, extensionMs);
  }
}

/**
 * Get active lock information if entity is locked by ANOTHER user
 */
export function getActiveDocumentLock(entityType: string, entityId: string): DocumentLock | null {
  const lockId = `${entityType}_${entityId}`;
  const lock = activeLocksMap.get(lockId);
  if (!lock) return null;

  const now = Date.now();
  if (lock.expiresAt <= now) {
    activeLocksMap.delete(lockId);
    return null;
  }

  const currentUser = getCurrentUser();
  if (currentUser && lock.lockedBy.username === currentUser.username) {
    return null; // Self lock is not considered blocked
  }

  return lock;
}

/**
 * Custom React Hook to manage real-time document locking for forms and entities
 */
export function useDocumentLocking(entityType: string, entityId: string | null, isEditing: boolean) {
  const [lockInfo, setLockInfo] = useState<DocumentLock | null>(null);

  useEffect(() => {
    initDocumentLocksRealtimeListener();

    const checkLock = () => {
      if (entityType && entityId) {
        setLockInfo(getActiveDocumentLock(entityType, entityId));
      } else {
        setLockInfo(null);
      }
    };

    checkLock();

    const handleLocksChange = () => checkLock();
    window.addEventListener('document-locks-changed', handleLocksChange);

    return () => {
      window.removeEventListener('document-locks-changed', handleLocksChange);
    };
  }, [entityType, entityId]);

  useEffect(() => {
    if (!isEditing || !entityType || !entityId) return;

    // Acquire lock when editing starts
    acquireDocumentLock(entityType, entityId);

    // Heartbeat every 45 seconds to keep lock active
    const timer = setInterval(() => {
      heartbeatDocumentLock(entityType, entityId);
    }, 45000);

    return () => {
      clearInterval(timer);
      releaseDocumentLock(entityType, entityId);
    };
  }, [entityType, entityId, isEditing]);

  return {
    lockInfo,
    isLockedByOther: lockInfo !== null
  };
}
