import React, { useState, useEffect, useCallback } from 'react';
import { activeFirebaseConfig, app, getActiveDatabaseId, saveCustomFirebaseConfig } from '../lib/firebase';
import { 
  fetchRemoteFirebaseConfig, 
  getRemoteFirebaseConfig, 
  subscribeRemoteConfigChange,
  FirebaseConfigType,
  isConfigDifferent
} from '../lib/remoteConfigLoader';
import { clearRuntimeConfigCache, fetchFreshRuntimeConfig } from '../lib/runtimeConfig';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  FileCode2, 
  Cpu, 
  Globe, 
  Check, 
  Copy,
  Info,
  Clock,
  ChevronUp,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ConfigFieldComparison {
  key: string;
  label: string;
  publicValue: string;
  sdkValue: string;
  isMatched: boolean;
}

/**
 * FirebaseConfigInspector Component
 * - Compares active Firebase SDK configuration with public/firebase-applet-config.json
 * - Provides a floating status indicator badge at bottom-right corner of admin dashboard:
 *   - Green dot if synced (matched)
 *   - Yellow/Amber dot if mismatch detected
 * - Provides a 'Refresh Config' button to force reloading config without browser refresh
 */
export default function FirebaseConfigInspector() {
  const [loading, setLoading] = useState<boolean>(false);
  const [publicConfig, setPublicConfig] = useState<FirebaseConfigType | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [autoDetectCount, setAutoDetectCount] = useState<number>(0);
  const [isFloatingExpanded, setIsFloatingExpanded] = useState<boolean>(false);

  // Read active SDK configuration
  const activeSdkProjectId = activeFirebaseConfig?.projectId || app?.options?.projectId || 'unknown';
  const activeSdkApiKey = activeFirebaseConfig?.apiKey || app?.options?.apiKey || '';
  const activeSdkAuthDomain = activeFirebaseConfig?.authDomain || app?.options?.authDomain || '';
  const activeSdkAppId = activeFirebaseConfig?.appId || app?.options?.appId || '';
  const activeSdkDbId = getActiveDatabaseId();

  // Load and compare public JSON vs active SDK
  const loadAndCompareConfig = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const fetched = await fetchRemoteFirebaseConfig();
      setPublicConfig(fetched);
      setLastChecked(new Date());
      if (showToast) {
        toast.success(`Config berhasil diperbarui! Public Project ID: ${fetched.projectId}`, { duration: 4000 });
      }
    } catch (err: any) {
      toast.error('Gagal membaca public/firebase-applet-config.json: ' + (err?.message || err), { duration: 4000 });
    } finally {
      setLoading(false);
    }
  }, []);

  // 'Refresh Config' handler: force re-fetch & clear runtime caches without browser refresh
  const handleRefreshConfig = async () => {
    setLoading(true);
    try {
      clearRuntimeConfigCache();
      const fresh = await fetchFreshRuntimeConfig();
      if (fresh) {
        setPublicConfig(fresh);
        setLastChecked(new Date());
        
        // Notify application components of config refresh
        saveCustomFirebaseConfig(fresh);

        toast.success(`Refresh Config berhasil! Project ID: [${fresh.projectId}]`, {
          id: 'refresh-firebase-config',
          duration: 4000
        });
      } else {
        await loadAndCompareConfig(true);
      }
    } catch (err: any) {
      toast.error('Gagal memuat ulang config: ' + (err?.message || err), { duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAndCompareConfig(false);

    // Subscribe to automatic polling updates from remoteConfigLoader
    const unsubscribe = subscribeRemoteConfigChange((newCfg) => {
      setPublicConfig(newCfg);
      setLastChecked(new Date());
      setAutoDetectCount(prev => prev + 1);
      toast.success(`Perubahan public/firebase-applet-config.json terdeteksi! (Project: ${newCfg.projectId})`, {
        id: 'remote-config-auto-detect',
        duration: 4000
      });
    });

    return () => {
      unsubscribe();
    };
  }, [loadAndCompareConfig]);

  // Construct comparison fields
  const comparisons: ConfigFieldComparison[] = [
    {
      key: 'projectId',
      label: 'Project ID',
      publicValue: publicConfig?.projectId || '-',
      sdkValue: activeSdkProjectId,
      isMatched: (publicConfig?.projectId || '') === activeSdkProjectId
    },
    {
      key: 'firestoreDatabaseId',
      label: 'Firestore Database ID',
      publicValue: publicConfig?.firestoreDatabaseId || '(default)',
      sdkValue: activeSdkDbId || '(default)',
      isMatched: (publicConfig?.firestoreDatabaseId || '(default)') === (activeSdkDbId || '(default)')
    },
    {
      key: 'authDomain',
      label: 'Auth Domain',
      publicValue: publicConfig?.authDomain || '-',
      sdkValue: activeSdkAuthDomain || '-',
      isMatched: (publicConfig?.authDomain || '') === activeSdkAuthDomain
    },
    {
      key: 'appId',
      label: 'App ID',
      publicValue: publicConfig?.appId || '-',
      sdkValue: activeSdkAppId || '-',
      isMatched: (publicConfig?.appId || '') === activeSdkAppId
    },
    {
      key: 'apiKey',
      label: 'API Key (Masked)',
      publicValue: publicConfig?.apiKey ? `${publicConfig.apiKey.substring(0, 8)}...${publicConfig.apiKey.slice(-4)}` : '-',
      sdkValue: activeSdkApiKey ? `${activeSdkApiKey.substring(0, 8)}...${activeSdkApiKey.slice(-4)}` : '-',
      isMatched: (publicConfig?.apiKey || '') === activeSdkApiKey
    }
  ];

  const allMatched = comparisons.every(c => c.isMatched);

  const handleCopyPublicJson = () => {
    if (!publicConfig) return;
    navigator.clipboard.writeText(JSON.stringify(publicConfig, null, 2));
    setCopiedKey(true);
    toast.success('Isi public/firebase-applet-config.json berhasil disalin ke clipboard!', { duration: 3000 });
    setTimeout(() => setCopiedKey(false), 3000);
  };

  return (
    <>
      {/* 1. Main Inspector Card Component */}
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shadow-lg shrink-0 ${
              allMatched 
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' 
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}>
              <FileCode2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white">Firebase Config Inspector</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  allMatched
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {allMatched ? 'VERCEL & SDK MATCHED' : 'CONFIG MISMATCH DETECTED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspeksi komparatif antara file <code className="text-indigo-300 font-mono">public/firebase-applet-config.json</code> dengan Firebase SDK instance aktif.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleRefreshConfig}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
              title="Memaksa pemuatan ulang config dari public JSON tanpa refresh browser"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Config</span>
            </button>
          </div>
        </div>

        {/* Top Status Alert */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
          allMatched 
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' 
            : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
        }`}>
          {allMatched ? (
            <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-bold text-sm">
              {allMatched 
                ? 'Konfigurasi Vercel Public JSON & SDK Firebase Sinkron 100%' 
                : 'Terdeteksi Ketidaksesuaian Konfigurasi!'}
            </p>
            <p className="opacity-90">
              {allMatched 
                ? 'File `public/firebase-applet-config.json` yang diakses dari server publik Vercel memiliki parameter yang persis sama dengan instance Firebase SDK yang sedang berjalan di browser.' 
                : 'Terdapat perbedaan nilai parameter antara file `public/firebase-applet-config.json` di server Vercel dengan instance SDK saat ini. Klik tombol "Refresh Config" untuk menyinkronkan ulang tanpa mendaur ulang halaman.'}
            </p>
            {lastChecked && (
              <p className="text-[11px] opacity-75 flex items-center gap-1.5 pt-1">
                <Clock size={12} />
                <span>Pengecekan Terakhir: {lastChecked.toLocaleTimeString('id-ID')}</span>
                {autoDetectCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">
                    Deteksi Otomatis Polling: {autoDetectCount}x
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Comparison Table */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="p-3.5 pl-4">Parameter Firebase</th>
                  <th className="p-3.5 flex items-center gap-1.5">
                    <Globe size={14} className="text-indigo-400" />
                    <span>Public Root JSON (`fetch`)</span>
                  </th>
                  <th className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <Cpu size={14} className="text-sky-400" />
                      <span>Active Firebase SDK Instance</span>
                    </div>
                  </th>
                  <th className="p-3.5 text-center">Hasil Validasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {comparisons.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3.5 pl-4 font-semibold text-slate-200">
                      {row.label}
                    </td>
                    <td className="p-3.5 font-mono text-indigo-300">
                      {row.publicValue}
                    </td>
                    <td className="p-3.5 font-mono text-sky-300">
                      {row.sdkValue}
                    </td>
                    <td className="p-3.5 text-center">
                      {row.isMatched ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          <CheckCircle2 size={12} />
                          MATCH
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

        {/* Footer Info & Quick Copy Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Info size={16} className="text-indigo-400 shrink-0" />
            <span>
              Setiap kali <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> berubah, sistem polling otomatis menyelaraskan data tanpa perlu re-deploy aplikasi Vercel.
            </span>
          </div>
          <button
            onClick={handleCopyPublicJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold shrink-0 cursor-pointer transition-all"
          >
            {copiedKey ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
            <span>Salin Data JSON Public</span>
          </button>
        </div>

      </div>

      {/* 2. Floating Bottom-Right Corner Status Indicator Badge */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end pointer-events-auto select-none">
        
        {/* Expanded Floating Popover Card */}
        {isFloatingExpanded && (
          <div className="mb-2 w-72 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-slate-200 space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode2 size={16} className="text-indigo-400" />
                <span className="font-bold text-xs text-white">Firebase Config Status</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${
                allMatched 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {allMatched ? 'Synced' : 'Mismatch'}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Public Project ID:</span>
                <span className="text-indigo-300 font-semibold truncate max-w-[130px]" title={publicConfig?.projectId || '-'}>
                  {publicConfig?.projectId || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">SDK Project ID:</span>
                <span className="text-sky-300 font-semibold truncate max-w-[130px]" title={activeSdkProjectId}>
                  {activeSdkProjectId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Database ID:</span>
                <span className="text-slate-300 font-semibold">{activeSdkDbId}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={handleRefreshConfig}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh Config</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom-Right Floating Indicator Pill */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full border shadow-2xl backdrop-blur-md transition-all duration-200 ${
          allMatched
            ? 'bg-slate-900/90 border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
            : 'bg-amber-950/90 border-amber-500/60 text-amber-200 hover:border-amber-400'
        }`}>
          {/* Status Dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {allMatched ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </>
            ) : (
              <>
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-90"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
              </>
            )}
          </span>

          {/* Indicator Text */}
          <span 
            onClick={() => setIsFloatingExpanded(!isFloatingExpanded)} 
            className="text-xs font-semibold tracking-wide cursor-pointer flex items-center gap-1 select-none"
          >
            <span>{allMatched ? 'Firebase Config: Sinkron' : 'Firebase Config: Mismatch!'}</span>
          </span>

          {/* Refresh Config Button directly on pill */}
          <button
            onClick={handleRefreshConfig}
            disabled={loading}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              allMatched 
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300' 
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200'
            }`}
            title="Refresh Config (Muat ulang config tanpa refresh browser)"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Expand Toggle Chevron */}
          <button
            onClick={() => setIsFloatingExpanded(!isFloatingExpanded)}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer pl-0.5"
            title={isFloatingExpanded ? "Tutup detail" : "Buka detail"}
          >
            {isFloatingExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

      </div>
    </>
  );
}
