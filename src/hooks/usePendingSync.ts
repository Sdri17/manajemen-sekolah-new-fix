import { useState, useEffect, useCallback } from 'react';
import { store } from '../lib/store';

export function usePendingSync() {
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const refreshQueue = useCallback(async () => {
    try {
      const keys = await store.syncQueue.keys();
      setPendingKeys(new Set(keys));
    } catch (e) {
      console.error('Failed to read syncQueue keys:', e);
    }
  }, []);

  useEffect(() => {
    refreshQueue();

    const handleChange = () => {
      refreshQueue();
    };

    window.addEventListener('sync-status-changed', handleChange);
    window.addEventListener('data-changed', handleChange);

    return () => {
      window.removeEventListener('sync-status-changed', handleChange);
      window.removeEventListener('data-changed', handleChange);
    };
  }, [refreshQueue]);

  const isPending = useCallback((storeName: string, id: string) => {
    return pendingKeys.has(`${storeName}::${id}`);
  }, [pendingKeys]);

  return { pendingKeys, isPending, refreshQueue };
}
