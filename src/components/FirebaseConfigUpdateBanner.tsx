import React, { useState, useEffect } from 'react';
import { Database, Sparkles, ArrowRight, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { saveCustomFirebaseConfig } from '../lib/firebase';
import { getPendingConfigUpdate, clearPendingConfigUpdate, FirebaseConfigUpdateEventDetail } from '../lib/firebaseSync';
import { FirebaseConfigType } from '../lib/remoteConfigLoader';
import toast from 'react-hot-toast';

export default function FirebaseConfigUpdateBanner() {
  const [configUpdate, setConfigUpdate] = useState<FirebaseConfigType | null>(() => getPendingConfigUpdate());
  const [isApplying, setIsApplying] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handleConfigUpdateDetected = (e: Event) => {
      const customEvt = e as CustomEvent<FirebaseConfigUpdateEventDetail>;
      if (customEvt.detail?.newConfig) {
        setConfigUpdate(customEvt.detail.newConfig);
        setIsDismissed(false);
      }
    };

    window.addEventListener('firebase-config-update-detected', handleConfigUpdateDetected);
    return () => {
      window.removeEventListener('firebase-config-update-detected', handleConfigUpdateDetected);
    };
  }, []);

  if (!configUpdate || isDismissed) {
    return null;
  }

  const handleApplyUpdate = async () => {
    setIsApplying(true);
    try {
      // Apply new Firebase config immediately without refreshing the whole app
      saveCustomFirebaseConfig(configUpdate);
      clearPendingConfigUpdate();
      setIsDismissed(true);
      setConfigUpdate(null);
      toast.success(
        `Koneksi berhasil diperbarui ke Project ID: ${configUpdate.projectId}! (Sistem terhubung tanpa reload halaman)`,
        { duration: 5000, id: 'config-update-applied' }
      );
    } catch (err: any) {
      toast.error('Gagal memperbarui koneksi database: ' + (err?.message || String(err)));
    } finally {
      setIsApplying(false);
    }
  };

  const handleDismiss = () => {
    clearPendingConfigUpdate();
    setIsDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-500/40 px-4 py-2.5 text-white shadow-xl relative z-50 animate-fadeIn">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 flex items-center gap-1">
                Perubahan Database Terdeteksi
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px] border border-indigo-500/30">
                Polling 60s
              </span>
            </div>
            <p className="text-slate-300 mt-0.5">
              File <code className="text-amber-300 font-mono">public/firebase-applet-config.json</code> diperbarui. Project ID baru:{' '}
              <span className="font-bold font-mono text-indigo-200">{configUpdate.projectId}</span>
              {configUpdate.firestoreDatabaseId && (
                <span> | Database ID: <code className="text-emerald-300 font-mono">{configUpdate.firestoreDatabaseId}</code></span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleApplyUpdate}
            disabled={isApplying}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isApplying ? (
              <span>Menyambungkan...</span>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hubungkan ke Database Baru</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Abaikan pembaruan ini"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
