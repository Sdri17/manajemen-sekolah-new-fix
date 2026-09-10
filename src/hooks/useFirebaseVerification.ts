import { useState, useEffect, useCallback } from 'react';
import { verifyFirestoreConfigPing, reinitializeFirebaseServices, activeFirebaseConfig } from '../lib/firebase';

export interface FirebaseVerificationState {
  isVerifying: boolean;
  activeProjectId: string;
  isReinitialized: boolean;
  lastVerifiedAt: string | null;
  error: string | null;
}

/**
 * Custom React hook that runs a verification ping to the Firestore configuration endpoint
 * during initial component mount. If a project ID mismatch is detected against local storage,
 * it automatically triggers a re-initialization of all Firebase services.
 */
export function useFirebaseVerification(autoRun: boolean = true) {
  const [state, setState] = useState<FirebaseVerificationState>({
    isVerifying: false,
    activeProjectId: activeFirebaseConfig.projectId,
    isReinitialized: false,
    lastVerifiedAt: null,
    error: null,
  });

  const runPingVerification = useCallback(async () => {
    setState((prev) => ({ ...prev, isVerifying: true, error: null }));
    try {
      const pingResult = await verifyFirestoreConfigPing();
      setState({
        isVerifying: false,
        activeProjectId: pingResult.activeProjectId,
        isReinitialized: pingResult.reinitialized,
        lastVerifiedAt: new Date().toLocaleTimeString('id-ID'),
        error: null,
      });
      return pingResult;
    } catch (err: any) {
      const errMsg = err?.message || 'Verification ping error';
      setState((prev) => ({
        ...prev,
        isVerifying: false,
        error: errMsg,
      }));
      return { reinitialized: false, activeProjectId: activeFirebaseConfig.projectId };
    }
  }, []);

  useEffect(() => {
    if (autoRun) {
      runPingVerification();
    }
  }, [autoRun, runPingVerification]);

  const forceReinitialize = useCallback((newConfig?: any) => {
    const updatedDb = reinitializeFirebaseServices(newConfig);
    setState((prev) => ({
      ...prev,
      activeProjectId: activeFirebaseConfig.projectId,
      isReinitialized: true,
      lastVerifiedAt: new Date().toLocaleTimeString('id-ID'),
    }));
    return updatedDb;
  }, []);

  return {
    ...state,
    runPingVerification,
    forceReinitialize,
  };
}
