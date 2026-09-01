import React, { useState, useEffect } from 'react';
import { app, activeFirebaseConfig, getActiveDatabaseId } from '../lib/firebase';
import { getRuntimeFirebaseConfig, fetchFreshRuntimeConfig, FirebaseConfigType } from '../lib/runtimeConfig';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Server, 
  Database, 
  Copy, 
  Trash2, 
  ShieldCheck, 
  Cpu, 
  ExternalLink 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DeploymentDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeploymentDiagnosticModal({ isOpen, onClose }: DeploymentDiagnosticModalProps) {
  const [loading, setLoading] = useState(false);
  const [serverJsonConfig, setServerJsonConfig] = useState<FirebaseConfigType | null>(null);
  const [lastCheckedTime, setLastCheckedTime] = useState<string>(new Date().toLocaleTimeString('id-ID'));
  const [copied, setCopied] = useState(false);

  // Directly access initialized Firebase SDK options (firebase.app().options.projectId)
  const sdkOptions = app?.options || {};
  const sdkProjectId = sdkOptions.projectId || 'unknown';
  const sdkAuthDomain = sdkOptions.authDomain || '-';
  const sdkAppId = sdkOptions.appId || '-';
  const sdkDatabaseId = getActiveDatabaseId();

  // Active runtime configuration snapshot
  const runtimeConfig = getRuntimeFirebaseConfig();

  const handleFetchServerConfig = async () => {
    setLoading(true);
    try {
      const freshJson = await fetchFreshRuntimeConfig();
      setServerJsonConfig(freshJson);
      setLastCheckedTime(new Date().toLocaleTimeString('id-ID'));
      if (freshJson) {
        toast.success(`Berhasil mengambil /firebase-applet-config.json dari server (Project: ${freshJson.projectId})`);
      } else {
        toast.error('Tidak dapat membaca /firebase-applet-config.json dari server');
      }
    } catch (_err) {
      toast.error('Gagal memverifikasi file konfigurasi server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleFetchServerConfig();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Check if SDK options match live server JSON
  const hasServerJson = !!serverJsonConfig;
  const isMatch = hasServerJson ? serverJsonConfig.projectId === sdkProjectId : true;
  const localStorageCustom = typeof window !== 'undefined' ? localStorage.getItem('custom_firebase_config') : null;

  const handleCopyReport = () => {
    const reportText = `[DEPLOYMENT DIAGNOSTIC REPORT]
Checked At: ${new Date().toISOString()}
Host: ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}
firebase.app().options.projectId: ${sdkProjectId}
firebase.app().options.authDomain: ${sdkAuthDomain}
firebase.app().options.appId: ${sdkAppId}
Firestore Database ID: ${sdkDatabaseId}
Runtime Config Project ID: ${runtimeConfig.projectId}
Server JSON Project ID: ${serverJsonConfig?.projectId || 'Not fetched'}
LocalStorage Custom Config: ${localStorageCustom ? 'PRESENT' : 'NONE'}
Vercel Cache Mismatch Status: ${!isMatch ? 'MISMATCH DETECTED' : 'OK / MATCHED'}
`;
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    toast.success('Laporan diagnostik disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearCacheAndReload = () => {
    if (confirm('Bersihkan cache konfigurasi lokal dan muat ulang aplikasi?')) {
      try {
        localStorage.removeItem('custom_firebase_config');
        localStorage.removeItem('active_firestore_database_id');
      } catch (_e) {}
      toast.loading('Memuat ulang aplikasi...');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cpu size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Deployment Diagnostic
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                  SDK Inspector
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Verifikasi real-time koneksi Firebase SDK (`firebase.app().options`) & troubleshooting cache Vercel.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">

          {/* Primary Highlight Banner: firebase.app().options.projectId */}
          <div className={`p-4 rounded-2xl border ${
            isMatch 
              ? 'bg-emerald-950/30 border-emerald-500/40' 
              : 'bg-amber-950/40 border-amber-500/50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                  <ShieldCheck size={14} className={isMatch ? 'text-emerald-400' : 'text-amber-400'} />
                  firebase.app().options.projectId (SDK Aktif)
                </span>
                <div className="text-2xl font-mono font-extrabold text-white mt-1 tracking-tight flex items-center gap-2">
                  <span className={isMatch ? 'text-emerald-300' : 'text-amber-300'}>
                    {sdkProjectId}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-mono border ${
                  isMatch
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {isMatch ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {isMatch ? 'DEPLOYMENT CACHE MATCH' : 'CACHE MISMATCH DETECTED'}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">Diverifikasi: {lastCheckedTime}</p>
              </div>
            </div>

            {!isMatch && (
              <div className="mt-3 pt-3 border-t border-amber-500/20 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Terdeteksi Perbedaan Konfigurasi Vercel:</strong> SDK Firebase di browser menjalankan Project 
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-900/60 font-mono text-amber-100">{sdkProjectId}</code>, 
                  namun file <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-900/60 font-mono text-amber-100">firebase-applet-config.json</code> di server berisi 
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-900/60 font-mono text-amber-100">{serverJsonConfig?.projectId}</code>. 
                  Ini menandakan Vercel masih menyajikan *cached build* lama.
                </div>
              </div>
            )}
          </div>

          {/* Comparison Matrix Table */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Perbandingan Sumber Konfigurasi Firebase</span>
              <button
                onClick={handleFetchServerConfig}
                disabled={loading}
                className="text-[11px] font-normal text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh Server Fetch
              </button>
            </h3>

            <div className="space-y-2 font-mono text-xs">
              {/* Row 1: SDK Initialized Options */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-emerald-400" />
                  <span className="text-slate-300 font-sans font-medium">1. Firebase SDK (`app.options`)</span>
                </div>
                <span className="font-bold text-emerald-300">{sdkProjectId}</span>
              </div>

              {/* Row 2: Live Server JSON */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Server size={14} className="text-indigo-400" />
                  <span className="text-slate-300 font-sans font-medium">2. Live Server JSON (`/firebase-applet-config.json`)</span>
                </div>
                <span className="font-bold text-indigo-300">
                  {loading ? 'Memuat...' : (serverJsonConfig?.projectId || 'Tidak Terbaca')}
                </span>
              </div>

              {/* Row 3: LocalStorage Override */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-amber-400" />
                  <span className="text-slate-300 font-sans font-medium">3. LocalStorage (`custom_firebase_config`)</span>
                </div>
                <span className="font-bold text-amber-300">
                  {localStorageCustom ? (JSON.parse(localStorageCustom)?.projectId || 'Terisi') : 'TIDAK ADA (Default)'}
                </span>
              </div>
            </div>
          </div>

          {/* Full SDK Options Technical Specs */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Parameter Rinci Firebase SDK (`firebase.app().options`)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Project ID:</span>
                <span className="text-white font-semibold">{sdkProjectId}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Auth Domain:</span>
                <span className="text-white font-semibold truncate block">{sdkAuthDomain}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">App ID:</span>
                <span className="text-white font-semibold truncate block">{sdkAppId}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Firestore Database ID:</span>
                <span className="text-emerald-400 font-semibold">{sdkDatabaseId}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Storage Bucket:</span>
                <span className="text-white font-semibold truncate block">{sdkOptions.storageBucket || '-'}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Messaging Sender ID:</span>
                <span className="text-white font-semibold">{sdkOptions.messagingSenderId || '-'}</span>
              </div>
            </div>
          </div>

          {/* Solution & Troubleshooting Steps */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl text-xs space-y-2 text-indigo-200/90">
            <h4 className="font-bold text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck size={14} />
              Langkah Penyelesaian Jika Vercel Menggunakan Config Lama:
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
              <li>Buka Dashboard Vercel &gt; Project Anda &gt; <strong>Deployments</strong>.</li>
              <li>Klik ikon titik tiga di sebelah deployment paling atas &gt; pilih <strong>Redeploy</strong> (pastikan centang "Use existing Build Cache" DIHAPUS jika opsi tersedia).</li>
              <li>Proses redeploy akan memaksa Vercel membaca ulang file <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> terbaru.</li>
            </ol>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleClearCacheAndReload}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-2 rounded-xl border border-rose-500/20 transition-all cursor-pointer w-full sm:w-auto justify-center"
          >
            <Trash2 size={14} />
            <span>Reset Cache & Reload</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-all cursor-pointer"
            >
              <Copy size={14} />
              <span>{copied ? 'Tersalin!' : 'Salin Laporan'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
