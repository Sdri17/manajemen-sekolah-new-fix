import React, { useState, useEffect, useCallback } from 'react';
import { activeFirebaseConfig, app, getActiveDatabaseId, saveCustomFirebaseConfig, db } from '../lib/firebase';
import { 
  fetchRemoteFirebaseConfig, 
  FirebaseConfigType 
} from '../lib/remoteConfigLoader';
import { clearRuntimeConfigCache, fetchFreshRuntimeConfig } from '../lib/runtimeConfig';
import DeploymentDiagnosticModal from './DeploymentDiagnosticModal';
import { 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  Cpu, 
  Globe, 
  Terminal, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  FileCode2, 
  Clock, 
  Sparkles,
  Database,
  Layers,
  Activity
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDiagnosticsView() {
  const [loading, setLoading] = useState<boolean>(false);
  const [publicConfig, setPublicConfig] = useState<FirebaseConfigType | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showFullApiKey, setShowFullApiKey] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState<boolean>(false);

  // 1. Read Active Firestore SDK Memory State
  const sdkOptions = app?.options || {};
  const sdkProjectId = activeFirebaseConfig?.projectId || sdkOptions.projectId || 'Not Initialized';
  const sdkApiKey = activeFirebaseConfig?.apiKey || sdkOptions.apiKey || '';
  const sdkAuthDomain = activeFirebaseConfig?.authDomain || sdkOptions.authDomain || '';
  const sdkAppId = activeFirebaseConfig?.appId || sdkOptions.appId || '';
  const sdkStorageBucket = activeFirebaseConfig?.storageBucket || sdkOptions.storageBucket || '';
  const sdkMessagingSenderId = activeFirebaseConfig?.messagingSenderId || sdkOptions.messagingSenderId || '';
  const sdkDatabaseId = getActiveDatabaseId();
  const isSdkInitialized = Boolean(app && app.name);
  const isFirestoreActive = Boolean(db);

  // 2. Read Vite / Vercel Environment Variables
  const envMeta = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};
  const envProjectId = envMeta.VITE_FIREBASE_PROJECT_ID || 'Not Defined in .env';
  const envApiKey = envMeta.VITE_FIREBASE_API_KEY || 'Not Defined in .env';
  const envDatabaseId = envMeta.VITE_FIREBASE_DATABASE_ID || 'Not Defined in .env';

  // 3. Fetch External JSON Config with Cache-Bust Timestamp
  const runDiagnostics = useCallback(async (showNotification = false) => {
    setLoading(true);
    try {
      const fetched = await fetchRemoteFirebaseConfig();
      setPublicConfig(fetched);
      setLastChecked(new Date());
      if (showNotification) {
        toast.success(`Diagnostik diperbarui! Public Project ID: ${fetched.projectId}`);
      }
    } catch (err: any) {
      toast.error('Gagal mengambil public/firebase-applet-config.json: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics(false);
  }, [runDiagnostics]);

  const handleForceRebind = async () => {
    setLoading(true);
    try {
      clearRuntimeConfigCache();
      const fresh = await fetchFreshRuntimeConfig();
      if (fresh) {
        setPublicConfig(fresh);
        saveCustomFirebaseConfig(fresh);
        setLastChecked(new Date());
        toast.success(`Berhasil re-bind memory SDK ke Project ID: [${fresh.projectId}]!`, {
          id: 'force-rebind-success',
          duration: 4000
        });
      } else {
        await runDiagnostics(true);
      }
    } catch (err: any) {
      toast.error('Gagal melakukan force re-bind: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const maskValue = (val: string) => {
    if (!val) return '(kosong)';
    if (showFullApiKey) return val;
    if (val.length <= 12) return val;
    return `${val.substring(0, 8)}...${val.slice(-4)}`;
  };

  // Field Comparison Matrix
  const comparisonRows = [
    {
      key: 'projectId',
      label: 'Project ID',
      memoryVal: sdkProjectId,
      jsonVal: publicConfig?.projectId || '-',
      envVal: envProjectId,
      isMatch: sdkProjectId === (publicConfig?.projectId || '')
    },
    {
      key: 'firestoreDatabaseId',
      label: 'Firestore Database ID',
      memoryVal: sdkDatabaseId,
      jsonVal: publicConfig?.firestoreDatabaseId || '(default)',
      envVal: envDatabaseId,
      isMatch: sdkDatabaseId === (publicConfig?.firestoreDatabaseId || '(default)')
    },
    {
      key: 'apiKey',
      label: 'API Key',
      memoryVal: maskValue(sdkApiKey),
      jsonVal: maskValue(publicConfig?.apiKey || ''),
      envVal: maskValue(envApiKey.includes('Not Defined') ? '' : envApiKey),
      isMatch: sdkApiKey === (publicConfig?.apiKey || '')
    },
    {
      key: 'authDomain',
      label: 'Auth Domain',
      memoryVal: sdkAuthDomain || '-',
      jsonVal: publicConfig?.authDomain || '-',
      envVal: envProjectId.includes('Not Defined') ? '-' : `${envProjectId}.firebaseapp.com`,
      isMatch: (sdkAuthDomain || '-') === (publicConfig?.authDomain || '-')
    },
    {
      key: 'appId',
      label: 'App ID',
      memoryVal: sdkAppId || '-',
      jsonVal: publicConfig?.appId || '-',
      envVal: '-',
      isMatch: (sdkAppId || '-') === (publicConfig?.appId || '-')
    },
    {
      key: 'storageBucket',
      label: 'Storage Bucket',
      memoryVal: sdkStorageBucket || '-',
      jsonVal: publicConfig?.storageBucket || '-',
      envVal: '-',
      isMatch: (sdkStorageBucket || '-') === (publicConfig?.storageBucket || '-')
    },
    {
      key: 'messagingSenderId',
      label: 'Messaging Sender ID',
      memoryVal: sdkMessagingSenderId || '-',
      jsonVal: publicConfig?.messagingSenderId || '-',
      envVal: '-',
      isMatch: (sdkMessagingSenderId || '-') === (publicConfig?.messagingSenderId || '-')
    }
  ];

  const allMatch = comparisonRows.every(r => r.isMatch);

  const handleCopyReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      status: allMatch ? 'MATCHED' : 'MISMATCH',
      memorySdkState: {
        projectId: sdkProjectId,
        firestoreDatabaseId: sdkDatabaseId,
        authDomain: sdkAuthDomain,
        appId: sdkAppId,
        storageBucket: sdkStorageBucket,
        messagingSenderId: sdkMessagingSenderId,
        apiKey: sdkApiKey ? 'PRESENT' : 'MISSING',
        isSdkInitialized,
        isFirestoreActive
      },
      externalJsonConfig: publicConfig,
      environmentVariables: {
        VITE_FIREBASE_PROJECT_ID: envProjectId,
        VITE_FIREBASE_DATABASE_ID: envDatabaseId,
        VITE_FIREBASE_API_KEY: envApiKey ? 'PRESENT' : 'NOT_SET'
      }
    };

    navigator.clipboard.writeText(JSON.stringify(reportData, null, 2));
    setCopiedReport(true);
    toast.success('Laporan Diagnostik Admin berhasil disalin ke clipboard!');
    setTimeout(() => setCopiedReport(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-indigo-500/30 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 z-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shadow-lg shrink-0">
            <Cpu size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">Admin Diagnostics (Firestore SDK Memory vs Vercel)</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                allMatch 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {allMatch ? 'MEMORI SDK SINKRON' : 'CACHE MISMATCH DETECTED'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Verifikasi mendalam status konfigurasi internal pada memori Firestore SDK aktif disandingkan dengan file eksternal <code className="text-amber-300 font-mono">public/firebase-applet-config.json</code> untuk memastikan tidak ada masalah build-time caching di Vercel.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap z-10">
          <button
            onClick={() => setIsDiagnosticModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
            title="Buka Deployment Diagnostic Modal (Side-by-side & Verify Connection)"
          >
            <Activity size={14} />
            <span>Verify Connection Modal</span>
          </button>

          <button
            onClick={() => setShowFullApiKey(!showFullApiKey)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            title="Tampilkan / Sembunyikan API Key lengkap"
          >
            {showFullApiKey ? <EyeOff size={14} className="text-amber-400" /> : <Eye size={14} className="text-indigo-400" />}
            <span>{showFullApiKey ? 'Sembunyikan Key' : 'Tampilkan Key'}</span>
          </button>

          <button
            onClick={handleForceRebind}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
            title="Bypass cache runtime dan paksa memori SDK mengikat konfigurasi JSON publik terbaru"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Force Re-bind Memory</span>
          </button>

          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-all"
          >
            {copiedReport ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>Salin Report JSON</span>
          </button>
        </div>
      </div>

      {/* Main Analysis Verdict Box */}
      <div className={`p-5 rounded-2xl border flex items-start gap-4 text-xs leading-relaxed shadow-lg ${
        allMatch 
          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
          : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
      }`}>
        {allMatch ? (
          <ShieldCheck size={28} className="text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={28} className="text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-sm text-white">
              {allMatch 
                ? '✅ VERIFIKASI BERHASIL: Nilai Memori SDK Persis Sama dengan File JSON Eksternal' 
                : '⚠️ TERDETEKSI CACHE BEDA: Konfigurasi Memori SDK Belum Menyelaraskan JSON Eksternal!'}
            </h3>
            {lastChecked && (
              <span className="text-[11px] font-mono opacity-80 flex items-center gap-1 text-slate-300">
                <Clock size={12} className="text-indigo-400" />
                Pengecekan: {lastChecked.toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>

          <p className="opacity-95 text-xs">
            {allMatch ? (
              <>
                Instance Firestore SDK yang sedang berjalan di memori browser telah mengonfirmasi <strong className="text-white">Project ID ({sdkProjectId})</strong> dan <strong className="text-white">Database ID ({sdkDatabaseId})</strong> yang identik dengan file <code className="text-amber-300 font-mono">public/firebase-applet-config.json</code> di server Vercel. Tidak ada isu build-time caching yang memblokir perubahan.
              </>
            ) : (
              <>
                Konfigurasi yang dimuat oleh SDK Firebase di memori saat ini berbeda dengan file <code className="text-amber-300 font-mono">public/firebase-applet-config.json</code> dari server Vercel. Klik tombol <strong>"Force Re-bind Memory"</strong> di atas untuk menyinkronkan ulang instance tanpa reload halaman.
              </>
            )}
          </p>

          <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-indigo-300 flex-wrap">
            <span className="flex items-center gap-1 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/60">
              <Sparkles size={12} className="text-amber-400 shrink-0" />
              Cache-Bust Fetch: <code className="text-amber-300">/firebase-applet-config.json?t={lastChecked ? lastChecked.getTime() : Date.now()}</code>
            </span>
            <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
              <Database size={12} className="text-emerald-400 shrink-0" />
              Firestore Instance: <code className="text-emerald-300">{isFirestoreActive ? 'ACTIVE ([DEFAULT])' : 'UNINITIALIZED'}</code>
            </span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Three-Way Comparison Table */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode2 size={18} className="text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Tabel Perbandingan Tiga-Arah (Side-by-Side Comparison)</h3>
          </div>
          <span className="text-xs text-slate-400">
            Memori SDK vs Server Public JSON vs Vercel .env
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 font-semibold text-[11px] uppercase tracking-wider">
                <th className="p-3.5 pl-5">Property Name</th>
                <th className="p-3.5">
                  <div className="flex items-center gap-1.5 text-sky-300">
                    <Cpu size={14} />
                    <span>1. SDK Memory State (`app.options`)</span>
                  </div>
                </th>
                <th className="p-3.5">
                  <div className="flex items-center gap-1.5 text-indigo-300">
                    <Globe size={14} />
                    <span>2. External JSON (`public/fetch`)</span>
                  </div>
                </th>
                <th className="p-3.5">
                  <div className="flex items-center gap-1.5 text-purple-300">
                    <Terminal size={14} />
                    <span>3. Vercel Env (`VITE_FIREBASE_*`)</span>
                  </div>
                </th>
                <th className="p-3.5 text-center">Hasil Validasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {comparisonRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 pl-5 font-semibold text-slate-200">
                    {row.label}
                  </td>

                  {/* 1. SDK Memory */}
                  <td className="p-3.5 font-mono text-sky-300 bg-sky-950/10">
                    <span className="break-all">{row.memoryVal}</span>
                  </td>

                  {/* 2. Public JSON */}
                  <td className="p-3.5 font-mono text-indigo-300 bg-indigo-950/10">
                    <span className="break-all">{row.jsonVal}</span>
                  </td>

                  {/* 3. Vercel Env */}
                  <td className="p-3.5 font-mono text-purple-300 bg-purple-950/10">
                    <span className="break-all">{row.envVal}</span>
                  </td>

                  {/* Validation Match Status */}
                  <td className="p-3.5 text-center">
                    {row.isMatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                        <CheckCircle2 size={12} />
                        MATCHED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        <XCircle size={12} />
                        MISMATCH
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Internal Runtime SDK Metadata Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
            <Layers size={16} />
            <span>Firebase App Name</span>
          </div>
          <p className="font-mono text-sm text-white font-semibold">
            {app?.name || '[DEFAULT]'}
          </p>
          <p className="text-[11px] text-slate-400">
            Internal instance ID yang teregistrasi dalam memori SDK JavaScript.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <Database size={16} />
            <span>Active Database Engine</span>
          </div>
          <p className="font-mono text-sm text-emerald-300 font-semibold">
            Cloud Firestore ({sdkDatabaseId})
          </p>
          <p className="text-[11px] text-slate-400">
            Database ID aktif yang ditargetkan untuk query koleksi realtime.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
            <Cpu size={16} />
            <span>Cache Strategy</span>
          </div>
          <p className="font-mono text-sm text-purple-300 font-semibold">
            Timestamp Query + HTTP No-Cache
          </p>
          <p className="text-[11px] text-slate-400">
            Mencegah Vercel CDN & Edge Worker menyimpan cache statis lama.
          </p>
        </div>
      </div>

      <DeploymentDiagnosticModal 
        isOpen={isDiagnosticModalOpen} 
        onClose={() => setIsDiagnosticModalOpen(false)} 
      />
    </div>
  );
}
