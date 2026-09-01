import React, { useState, useEffect } from 'react';
import { getActiveProjectDetails, fetchRuntimeFirebaseConfig, ActiveProjectDetails } from '../lib/configLoader';
import { app } from '../lib/firebase';
import DeploymentDiagnosticModal from './DeploymentDiagnosticModal';
import { Database, CheckCircle2, RefreshCw, Server, Cpu, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ActiveDatabaseIndicator() {
  const [projectDetails, setProjectDetails] = useState<ActiveProjectDetails>(getActiveProjectDetails());
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<any | null>(null);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);

  useEffect(() => {
    // Initial sync
    setProjectDetails(getActiveProjectDetails());

    // Listen to firebase config changes
    const handleConfigChanged = () => {
      setProjectDetails(getActiveProjectDetails());
    };

    window.addEventListener('firebase-config-changed', handleConfigChanged);
    window.addEventListener('database-switched', handleConfigChanged);

    return () => {
      window.removeEventListener('firebase-config-changed', handleConfigChanged);
      window.removeEventListener('database-switched', handleConfigChanged);
    };
  }, []);

  const handleVerifyRuntimeConfig = async () => {
    setCheckingRuntime(true);
    toast.loading('Memeriksa berkas konfigurasi runtime dari server / CDN...', { id: 'verify-runtime' });

    try {
      const liveConfig = await fetchRuntimeFirebaseConfig();
      if (liveConfig) {
        setRuntimeConfig(liveConfig);
        toast.success(`Terverifikasi! Project ID server: ${liveConfig.projectId}`, { id: 'verify-runtime' });
      } else {
        toast.error('Tidak dapat membaca firebase-applet-config.json runtime', { id: 'verify-runtime' });
      }
    } catch (err) {
      toast.error('Gagal memverifikasi konfigurasi runtime server', { id: 'verify-runtime' });
    } finally {
      setCheckingRuntime(false);
      setProjectDetails(getActiveProjectDetails());
    }
  };

  const sdkProjectId = app?.options?.projectId || projectDetails.projectId;

  return (
    <>
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Side: Active SDK Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Firebase Project ID:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  {sdkProjectId}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  Db: {projectDetails.firestoreDatabaseId}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>Domain: <strong className="text-slate-300 font-mono">{projectDetails.authDomain}</strong></span>
                <span>•</span>
                <span className="text-slate-400">Sumber Config: <strong className="text-indigo-300 font-mono">{projectDetails.source}</strong></span>
              </p>
            </div>
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setIsDiagnosticModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              title="Buka Modal Diagnostik Deployment (Inspector SDK)"
            >
              <Cpu size={14} />
              <span>Deployment Diagnostic</span>
            </button>

            <button
              onClick={handleVerifyRuntimeConfig}
              disabled={checkingRuntime}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
              title="Verifikasi langsung dari file runtime firebase-applet-config.json tanpa cache"
            >
              <RefreshCw size={14} className={checkingRuntime ? 'animate-spin text-emerald-400' : ''} />
              <span>Verifikasi Runtime Config</span>
            </button>
          </div>
        </div>

        {/* Runtime details overlay if verified */}
        {runtimeConfig && (
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-indigo-400" />
              <span>Live Server JSON: <strong className="text-slate-200 font-mono">{runtimeConfig.projectId}</strong></span>
              <span className="text-slate-500">({runtimeConfig.authDomain})</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Terverifikasi Tidak Outdated
            </span>
          </div>
        )}
      </div>

      <DeploymentDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
      />
    </>
  );
}
