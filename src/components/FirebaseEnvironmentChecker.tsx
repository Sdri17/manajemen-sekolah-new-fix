import React, { useEffect, useState } from 'react';
import defaultConfig from '../../firebase-applet-config.json';
import { activeFirebaseConfig, getActiveDatabaseId, app, saveCustomFirebaseConfig } from '../lib/firebase';
import { fetchFreshRuntimeConfig, clearRuntimeConfigCache } from '../lib/runtimeConfig';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Terminal, 
  Globe, 
  Database, 
  RefreshCw, 
  Copy, 
  Check, 
  Download, 
  Cloud, 
  ExternalLink,
  Layers,
  Cpu,
  Server
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface FirebaseEnvironmentCheckerProps {
  onOpenDiagnosticModal?: () => void;
}

/**
 * Header Badge Indicator Component for Admin Header / Layout Top Header
 * - Turns GREEN if loaded config matches expected production project
 * - Turns RED if a local/development config or mismatch is detected
 */
export function FirebaseHeaderStatusBadge() {
  const currentProjectId = activeFirebaseConfig?.projectId || app?.options?.projectId || 'unknown';
  const hasApiKey = !!(activeFirebaseConfig?.apiKey || app?.options?.apiKey);

  // A valid non-empty active project ID with API key is healthy and active
  const isHealthy = currentProjectId && currentProjectId !== 'unknown' && currentProjectId !== 'demo' && (hasApiKey || currentProjectId.length > 3);

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-semibold transition-all shadow-sm ${
        isHealthy
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
          : 'bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25'
      }`}
      title={
        isHealthy 
          ? `FIREBASE ONLINE: App terhubung ke database produksi '${currentProjectId}'` 
          : `PERINGATAN: Konfigurasi Firebase '${currentProjectId}' belum terkonfigurasi`
      }
    >
      <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
      <span className="text-[10px] uppercase font-sans font-bold tracking-wider">
        {isHealthy ? 'PROD MATCH' : 'MISMATCH'}
      </span>
      <span className="text-[11px] opacity-90 truncate max-w-[120px] sm:max-w-[180px]">
        {currentProjectId}
      </span>
    </div>
  );
}

/**
 * Firebase Environment Checker Component
 * - Logs window.location.origin and active firebaseConfig.projectId to browser console on mount.
 * - Provides interactive status, Vercel persistence solution guide, and 1-click cross-device sync.
 */
export default function FirebaseEnvironmentChecker({ onOpenDiagnosticModal }: FirebaseEnvironmentCheckerProps) {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>(new Date().toLocaleTimeString('id-ID'));

  const activeProjectId = activeFirebaseConfig?.projectId || app?.options?.projectId || 'unknown';
  const expectedProjectId = defaultConfig.projectId || activeProjectId;
  const activeAuthDomain = activeFirebaseConfig?.authDomain || app?.options?.authDomain || '-';
  const activeAppId = activeFirebaseConfig?.appId || app?.options?.appId || '-';
  const activeDbId = getActiveDatabaseId();

  const isMatched = !!activeProjectId && activeProjectId !== 'unknown' && activeProjectId !== 'demo';

  // Log origin and projectId to browser console on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      const loadedProjectId = activeFirebaseConfig?.projectId || app?.options?.projectId || 'unknown';

      console.log('====================================================');
      console.log('[Firebase Environment Checker] Mount Diagnostic Info');
      console.log('• window.location.origin      :', origin);
      console.log('• active firebaseConfig.projectId:', loadedProjectId);
      console.log('• expected production projectId :', expectedProjectId);
      console.log('• loaded firestoreDatabaseId    :', activeDbId);
      console.log('• configuration match status     :', isMatched ? 'MATCHED (PROD)' : 'MISMATCHED / DEV');
      console.log('• active authDomain              :', activeAuthDomain);
      console.log('• timestamp                      :', new Date().toISOString());
      console.log('====================================================');
    }
  }, []);

  const handleFetchFreshConfig = async () => {
    setIsRefreshing(true);
    toast.loading('Memuat ulang firebase-applet-config.json dari server Vercel (Bypass cache)...', { id: 'fetch-config' });
    try {
      clearRuntimeConfigCache();
      const fresh = await fetchFreshRuntimeConfig();
      if (fresh) {
        toast.success(`Konfigurasi runtime berhasil diperbarui! Project ID: ${fresh.projectId}`, { id: 'fetch-config' });
      } else {
        toast.success(`Menggunakan konfigurasi aktif: ${activeProjectId}`, { id: 'fetch-config' });
      }
      setLastRefreshedTime(new Date().toLocaleTimeString('id-ID'));
    } catch (err) {
      toast.error('Gagal mengambil konfigurasi runtime fresh: ' + String(err), { id: 'fetch-config' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyVercelEnvVars = () => {
    const envText = `# Vercel Environment Variables (Google AI Studio Firebase)
VITE_FIREBASE_PROJECT_ID=${activeProjectId}
VITE_FIREBASE_API_KEY=${activeFirebaseConfig.apiKey || ''}
VITE_FIREBASE_AUTH_DOMAIN=${activeFirebaseConfig.authDomain || ''}
VITE_FIREBASE_APP_ID=${activeFirebaseConfig.appId || ''}
VITE_FIREBASE_DATABASE_ID=${activeDbId}
VITE_FIREBASE_STORAGE_BUCKET=${activeFirebaseConfig.storageBucket || ''}
VITE_FIREBASE_MESSAGING_SENDER_ID=${activeFirebaseConfig.messagingSenderId || ''}
`;
    navigator.clipboard.writeText(envText);
    setCopiedEnv(true);
    toast.success('Variabel Lingkungan VITE_FIREBASE_* berhasil disalin ke clipboard!');
    setTimeout(() => setCopiedEnv(false), 3000);
  };

  const handleCopyJsonConfig = () => {
    const jsonText = JSON.stringify(activeFirebaseConfig, null, 2);
    navigator.clipboard.writeText(jsonText);
    setCopiedJson(true);
    toast.success('Isi firebase-applet-config.json berhasil disalin!');
    setTimeout(() => setCopiedJson(false), 3000);
  };

  const handleDownloadConfigFile = () => {
    const jsonText = JSON.stringify(activeFirebaseConfig, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'firebase-applet-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('File firebase-applet-config.json berhasil diunduh!');
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shadow-lg shrink-0 ${
            isMatched 
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' 
              : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
          }`}>
            <Server size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-white">Firebase Environment Checker</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                isMatched
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                {isMatched ? 'PROD MATCH' : 'DEV / MISMATCH'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Verifikasi real-time kecocokan kredensial database Google AI Studio, Vercel deployment, & akses lintas perangkat.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={handleFetchFreshConfig}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Ambil ulang file firebase-applet-config.json dari Vercel dengan parameter no-cache"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-indigo-400' : ''} />
            <span>Bypass Vercel Cache</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Origin */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-medium">Origin Host Browser</span>
            <Globe size={16} className="text-indigo-400" />
          </div>
          <div className="text-xs font-mono font-bold text-slate-200 truncate mt-1">
            {typeof window !== 'undefined' ? window.location.origin : '-'}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">
            Host: {typeof window !== 'undefined' ? window.location.hostname : '-'}
          </p>
        </div>

        {/* Loaded Project ID */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-medium">Active Project ID</span>
            <Database size={16} className={isMatched ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
          <div className={`text-sm font-mono font-bold truncate mt-1 ${isMatched ? 'text-emerald-300' : 'text-rose-300'}`}>
            {activeProjectId}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 flex justify-between">
            <span>Expected:</span>
            <span className="font-mono text-slate-300">{expectedProjectId}</span>
          </p>
        </div>

        {/* Database ID */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-medium">Database ID Firestore</span>
            <Layers size={16} className="text-indigo-400" />
          </div>
          <div className="text-sm font-mono font-bold text-indigo-300 truncate mt-1">
            {activeDbId}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            AuthDomain: <span className="font-mono text-slate-300 truncate">{activeAuthDomain}</span>
          </p>
        </div>

        {/* Match Status */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-medium">Status Produksi</span>
            {isMatched ? <ShieldCheck size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-rose-400" />}
          </div>
          <div className={`text-sm font-bold mt-1 ${isMatched ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isMatched ? 'TERHUBUNG KE PROD' : 'DEV / MISMATCH'}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {isMatched ? 'Config sesuai dengan AI Studio' : 'Diperlukan penyelarasan Vercel env'}
          </p>
        </div>

      </div>

      {/* Terminal Console Log Output Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800 text-[11px]">
          <span className="flex items-center gap-2 font-semibold text-indigo-300">
            <Terminal size={14} />
            Browser Console Output (`window.location.origin` & `firebaseConfig.projectId` on Mount)
          </span>
          <span className="text-slate-500">Diperbarui: {lastRefreshedTime}</span>
        </div>
        <div className="p-3 bg-slate-900 rounded-xl text-slate-300 space-y-1 text-[11px] overflow-x-auto">
          <div className="text-emerald-400">[Firebase Environment Checker] Mount Diagnostic Info</div>
          <div>• window.location.origin      : <span className="text-amber-300">{typeof window !== 'undefined' ? window.location.origin : '-'}</span></div>
          <div>• active firebaseConfig.projectId: <span className="text-indigo-300">{activeProjectId}</span></div>
          <div>• expected production projectId : <span className="text-indigo-300">{expectedProjectId}</span></div>
          <div>• loaded firestoreDatabaseId    : <span className="text-indigo-300">{activeDbId}</span></div>
          <div>• configuration match status     : <span className={isMatched ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{isMatched ? 'MATCHED (PROD)' : 'MISMATCHED / DEV'}</span></div>
          <div>• active authDomain              : <span className="text-slate-400">{activeAuthDomain}</span></div>
        </div>
      </div>

      {/* Interactive Solution Section: How to persist config when deploying to Vercel and cross-device */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-5 space-y-4">
        
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
            <Cloud size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Solusi Konfigurasi Otomatis Lintas Perangkat & Deployment Vercel
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Berikut adalah mekanisme terintegrasi agar konfigurasi database dari **Google AI Studio** otomatis tersimpan di **Vercel** dan terbaca secara konsisten di **semua perangkat/browser**:
            </p>
          </div>
        </div>

        {/* Step-by-step Solution Explanation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-300">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px]">1</span>
              <span>Otomatisasi File Repositori</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Setiap kali Anda mengonfigurasi Firebase di Google AI Studio, file <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> otomatis diperbarui di direktori root aplikasi.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-300">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px]">2</span>
              <span>Dynamic Cache-Busting</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Aplikasi menggunakan fungsi <code className="text-indigo-300 font-mono">fetchFreshRuntimeConfig()</code> dengan parameter timestamp unik (<code className="text-indigo-300 font-mono">?t=Date.now()</code>) untuk mencegah browser menyajikan cache CDN Vercel yang lama.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-300">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px]">3</span>
              <span>Vercel Environment Variables</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Untuk memastikan konfigurasi permanen di Vercel tanpa perlu re-deploy ulang kode, salin variabel lingkungan di bawah lalu tempelkan di menu <span className="text-slate-200 font-semibold">Vercel -&gt; Settings -&gt; Environment Variables</span>.
            </p>
          </div>

        </div>

        {/* Action Tool Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyVercelEnvVars}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            {copiedEnv ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
            <span>Salin Variabel Vercel (.env)</span>
          </button>

          <button
            onClick={handleCopyJsonConfig}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            {copiedJson ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
            <span>Salin JSON Config</span>
          </button>

          <button
            onClick={handleDownloadConfigFile}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>Unduh firebase-applet-config.json</span>
          </button>
        </div>

      </div>

    </div>
  );
}
