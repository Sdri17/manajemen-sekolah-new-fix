import React, { useState, useEffect, useCallback } from 'react';
import { app, activeFirebaseConfig, getActiveDatabaseId, saveCustomFirebaseConfig } from '../lib/firebase';
import { fetchRemoteFirebaseConfig, FirebaseConfigType } from '../lib/remoteConfigLoader';
import { clearRuntimeConfigCache } from '../lib/runtimeConfig';
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
  Sparkles,
  Zap,
  Globe,
  Key
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DeploymentDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeploymentDiagnosticModal({ isOpen, onClose }: DeploymentDiagnosticModalProps) {
  const [loading, setLoading] = useState(false);
  const [serverJsonConfig, setServerJsonConfig] = useState<FirebaseConfigType | null>(null);
  const [lastCheckedTime, setLastCheckedTime] = useState<string>('');
  const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState<number>(Date.now());
  const [copied, setCopied] = useState(false);
  const [showFullApiKey, setShowFullApiKey] = useState(false);

  // Directly access initialized Firebase SDK options (firebase.app().options)
  const sdkOptions = app?.options || {};
  const sdkProjectId = activeFirebaseConfig?.projectId || sdkOptions.projectId || 'Uninitialized';
  const sdkApiKey = activeFirebaseConfig?.apiKey || sdkOptions.apiKey || '';
  const sdkAuthDomain = activeFirebaseConfig?.authDomain || sdkOptions.authDomain || '-';
  const sdkAppId = activeFirebaseConfig?.appId || sdkOptions.appId || '-';
  const sdkStorageBucket = activeFirebaseConfig?.storageBucket || sdkOptions.storageBucket || '-';
  const sdkMessagingSenderId = activeFirebaseConfig?.messagingSenderId || sdkOptions.messagingSenderId || '-';
  const sdkDatabaseId = getActiveDatabaseId();

  // Perform runtime fetch of /firebase-applet-config.json
  const handleVerifyConnection = useCallback(async (showToastNotice = true) => {
    setLoading(true);
    const now = new Date();
    try {
      const freshJson = await fetchRemoteFirebaseConfig();
      setServerJsonConfig(freshJson);
      setLastCheckedTime(now.toLocaleTimeString('id-ID'));
      setLastCheckedTimestamp(now.getTime());

      if (showToastNotice) {
        if (freshJson.projectId === sdkProjectId) {
          toast.success(`Koneksi Terverifikasi Sesuai! Server & SDK Project ID: [${freshJson.projectId}]`, {
            id: 'verify-conn-success',
            duration: 4000
          });
        } else {
          toast.error(`Peringatan Vercel Cache! Server JSON (${freshJson.projectId}) berbeda dengan SDK Memory (${sdkProjectId})`, {
            id: 'verify-conn-mismatch',
            duration: 5000
          });
        }
      }
    } catch (err: any) {
      toast.error('Gagal mengambil /firebase-applet-config.json dari server: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, [sdkProjectId]);

  useEffect(() => {
    if (isOpen) {
      handleVerifyConnection(false);
    }
  }, [isOpen, handleVerifyConnection]);

  if (!isOpen) return null;

  // Compare SDK instance vs parsed server JSON
  const hasServerJson = !!serverJsonConfig;
  const isProjectIdMatch = hasServerJson ? serverJsonConfig.projectId === sdkProjectId : true;
  const isDatabaseIdMatch = hasServerJson ? (serverJsonConfig.firestoreDatabaseId || '(default)') === sdkDatabaseId : true;
  const isApiKeyMatch = hasServerJson ? serverJsonConfig.apiKey === sdkApiKey : true;
  const isAllMatched = isProjectIdMatch && isDatabaseIdMatch && isApiKeyMatch;

  const maskVal = (val: string) => {
    if (!val) return '(empty)';
    if (showFullApiKey) return val;
    if (val.length <= 12) return val;
    return `${val.substring(0, 8)}...${val.slice(-4)}`;
  };

  const comparisonFields = [
    {
      key: 'projectId',
      label: 'Project ID',
      serverVal: serverJsonConfig?.projectId || 'Not fetched',
      sdkVal: sdkProjectId,
      match: isProjectIdMatch
    },
    {
      key: 'firestoreDatabaseId',
      label: 'Firestore Database ID',
      serverVal: serverJsonConfig?.firestoreDatabaseId || '(default)',
      sdkVal: sdkDatabaseId,
      match: isDatabaseIdMatch
    },
    {
      key: 'apiKey',
      label: 'API Key',
      serverVal: maskVal(serverJsonConfig?.apiKey || ''),
      sdkVal: maskVal(sdkApiKey),
      match: isApiKeyMatch
    },
    {
      key: 'authDomain',
      label: 'Auth Domain',
      serverVal: serverJsonConfig?.authDomain || '-',
      sdkVal: sdkAuthDomain,
      match: (serverJsonConfig?.authDomain || '-') === sdkAuthDomain
    },
    {
      key: 'appId',
      label: 'App ID',
      serverVal: serverJsonConfig?.appId || '-',
      sdkVal: sdkAppId,
      match: (serverJsonConfig?.appId || '-') === sdkAppId
    },
    {
      key: 'storageBucket',
      label: 'Storage Bucket',
      serverVal: serverJsonConfig?.storageBucket || '-',
      sdkVal: sdkStorageBucket,
      match: (serverJsonConfig?.storageBucket || '-') === sdkStorageBucket
    },
    {
      key: 'messagingSenderId',
      label: 'Messaging Sender ID',
      serverVal: serverJsonConfig?.messagingSenderId || '-',
      sdkVal: sdkMessagingSenderId,
      match: (serverJsonConfig?.messagingSenderId || '-') === sdkMessagingSenderId
    }
  ];

  const handleApplyServerConfig = () => {
    if (serverJsonConfig) {
      clearRuntimeConfigCache();
      saveCustomFirebaseConfig(serverJsonConfig);
      toast.success(`Konfigurasi server [${serverJsonConfig.projectId}] berhasil dipasang ke memory SDK!`, { duration: 4000 });
      handleVerifyConnection(false);
    }
  };

  const handleCopyReport = () => {
    const reportText = JSON.stringify({
      title: 'DEPLOYMENT DIAGNOSTIC REPORT',
      timestamp: new Date().toISOString(),
      verifiedAt: lastCheckedTime,
      status: isAllMatched ? 'MATCHED' : 'VERCEL_CACHE_MISMATCH_DETECTED',
      serverParsedJson: serverJsonConfig,
      sdkInstanceMemoryState: {
        projectId: sdkProjectId,
        firestoreDatabaseId: sdkDatabaseId,
        authDomain: sdkAuthDomain,
        appId: sdkAppId,
        storageBucket: sdkStorageBucket,
        messagingSenderId: sdkMessagingSenderId,
        hasApiKey: Boolean(sdkApiKey)
      }
    }, null, 2);

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    toast.success('Laporan diagnostik berhasil disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Cpu size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Deployment Diagnostic
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                  Runtime Inspector
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Inspeksi komparatif langsung antara file JSON publik server Vercel dengan nilai instance memori Firebase SDK.
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

          {/* Top Status Verdict Banner */}
          <div className={`p-4 rounded-2xl border ${
            isAllMatched 
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
              : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
          }`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                {isAllMatched ? (
                  <ShieldCheck size={28} className="text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle size={28} className="text-amber-400 shrink-0" />
                )}
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {isAllMatched 
                      ? 'KONEKSI SERTA MEMORI SDK MATCHED' 
                      : 'TERDETEKSI PERBEDAAN VERCEL CACHE / DEPLOYMENT'}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isAllMatched ? (
                      <>File <code className="text-amber-300 font-mono">/firebase-applet-config.json</code> di server Vercel memiliki nilai yang persis sama dengan instance Firebase SDK aktif.</>
                    ) : (
                      <>File <code className="text-amber-300 font-mono">/firebase-applet-config.json</code> di server (<strong className="text-amber-200">{serverJsonConfig?.projectId}</strong>) berbeda dengan instance SDK aktif (<strong className="text-amber-200">{sdkProjectId}</strong>).</>
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-mono border ${
                  isAllMatched
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {isAllMatched ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {isAllMatched ? 'DEPLOYMENT OK' : 'STALE CACHE DETECTED'}
                </span>
                {lastCheckedTime && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    Waktu Pengecekan: {lastCheckedTime}
                  </span>
                )}
              </div>
            </div>

            {/* If Mismatch, provide immediate action button */}
            {!isAllMatched && serverJsonConfig && (
              <div className="mt-3 pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-amber-200/90">
                  Vercel menyajikan data JSON baru. Klik tombol di kanan untuk menyinkronkan memori SDK secara instan.
                </span>
                <button
                  onClick={handleApplyServerConfig}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Zap size={14} />
                  <span>Sinkronkan ke Memory SDK Sekarang</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Bar & 'Verify Connection' Primary Control */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                <span>Uji Koneksi Runtime Real-Time</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Melakukan HTTP request segar ke <code className="text-amber-300 font-mono">/firebase-applet-config.json?t={lastCheckedTimestamp}</code> tanpa cache browser.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowFullApiKey(!showFullApiKey)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition-all cursor-pointer"
              >
                {showFullApiKey ? 'Mask Key' : 'Unmask Key'}
              </button>

              <button
                onClick={() => handleVerifyConnection(true)}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Verify Connection</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison Matrix */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Server size={14} className="text-indigo-400" />
                Matriks Komparasi Parameter Side-by-Side
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Server Fetch vs Memory SDK
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-mono tracking-wider">
                    <th className="p-3 pl-4">Parameter</th>
                    <th className="p-3 text-indigo-300">
                      <div className="flex items-center gap-1">
                        <Globe size={12} />
                        <span>Parsed Server JSON (`fetch`)</span>
                      </div>
                    </th>
                    <th className="p-3 text-sky-300">
                      <div className="flex items-center gap-1">
                        <Cpu size={12} />
                        <span>Current Firebase SDK Instance</span>
                      </div>
                    </th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                  {comparisonFields.map((field) => (
                    <tr key={field.key} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 pl-4 font-sans font-semibold text-slate-300">
                        {field.label}
                      </td>

                      {/* Server Parsed JSON */}
                      <td className="p-3 text-indigo-300 bg-indigo-950/10">
                        <span className="break-all">
                          {loading ? 'Memuat...' : field.serverVal}
                        </span>
                      </td>

                      {/* SDK Memory Instance */}
                      <td className="p-3 text-sky-300 bg-sky-950/10">
                        <span className="break-all">{field.sdkVal}</span>
                      </td>

                      {/* Status Match */}
                      <td className="p-3 text-center">
                        {field.match ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            <CheckCircle2 size={11} />
                            MATCH
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            <AlertTriangle size={11} />
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

          {/* Vercel Redeploy Guidance */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl text-xs space-y-2 text-indigo-200/90">
            <h4 className="font-bold text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck size={14} />
              Tips Penyelesaian Vercel Build Caching:
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-300 leading-relaxed text-[11px]">
              <li>Jika Vercel serving JSON lama, buka Vercel Dashboard &gt; Deployments &gt; Klik titik tiga &gt; <strong>Redeploy</strong>.</li>
              <li>Parameter fetch di aplikasi ini melampirkan <code className="text-amber-300 font-mono">?t=timestamp</code> sehingga otomatis mem-bypass browser cache lokal.</li>
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-all cursor-pointer w-full sm:w-auto justify-center"
          >
            <Copy size={14} />
            <span>{copied ? 'Report Tersalin!' : 'Salin Laporan JSON'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => handleVerifyConnection(true)}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Verify Connection</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

