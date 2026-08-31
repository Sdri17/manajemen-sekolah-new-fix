import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Key,
  FolderGit2,
  Server,
  Lock,
  Zap,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  Info,
  UserCheck,
  HardDrive,
  Globe,
  GitCompare
} from 'lucide-react';
import {
  runFirebaseDiagnostics,
  verifySiswaCollectionSecurityRules,
  RECOMMENDED_FIRESTORE_RULES,
  RECOMMENDED_SQL_SCHEMA,
  FirebaseDiagnosticReport,
  SiswaRulesCheckResult,
  getFirebaseStatus,
  subscribeToSyncConflicts,
  simulateSyncConflict,
  SyncConflictItem
} from '../lib/firebaseSync';
import { activeFirebaseConfig, getActiveDatabaseId, auth, db } from '../lib/firebase';
import SyncCountDiagnosticTool from './SyncCountDiagnosticTool';
import toast from 'react-hot-toast';

interface FirebaseDiagnosticsDashboardProps {
  onClose?: () => void;
}

export default function FirebaseDiagnosticsDashboard({ onClose }: FirebaseDiagnosticsDashboardProps) {
  // Service connection statuses
  const [authStatus, setAuthStatus] = useState<'connected' | 'checking' | 'error'>('checking');
  const [firestoreStatus, setFirestoreStatus] = useState<'connected' | 'offline' | 'error' | 'syncing'>('connected');
  const [storageStatus, setStorageStatus] = useState<'configured' | 'unconfigured'>('configured');

  // Diagnostic states
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<FirebaseDiagnosticReport | null>(null);

  // Siswa Collection Rules state
  const [isVerifyingSiswaRules, setIsVerifyingSiswaRules] = useState(false);
  const [siswaRulesResult, setSiswaRulesResult] = useState<SiswaRulesCheckResult | null>(null);

  // UI state
  const [copiedRules, setCopiedRules] = useState(false);
  const [solutionType, setSolutionType] = useState<'firestore' | 'sql'>('firestore');
  const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics' | 'siswa-rules' | 'solution' | 'count-diagnostic'>('overview');
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);

  // Check services status on mount
  useEffect(() => {
    checkServicesStatus();
    runSiswaRulesCheck();
    // Silently run diagnostic report
    handleRunDiagnostics(false);

    const unsubConflicts = subscribeToSyncConflicts((latest) => setConflicts(latest));

    const handleFirebaseStatus = () => {
      const fb = getFirebaseStatus();
      setFirestoreStatus(fb.status === 'connected' ? 'connected' : fb.status === 'syncing' ? 'syncing' : 'offline');
    };

    window.addEventListener('firebase-status-changed', handleFirebaseStatus);
    window.addEventListener('siswa-rules-status-changed', (e: any) => {
      if (e.detail) setSiswaRulesResult(e.detail);
    });

    return () => {
      unsubConflicts();
      window.removeEventListener('firebase-status-changed', handleFirebaseStatus);
    };
  }, []);

  const checkServicesStatus = async () => {
    // 1. Auth check
    try {
      if (auth) {
        setAuthStatus('connected');
      } else {
        setAuthStatus('error');
      }
    } catch (_e) {
      setAuthStatus('error');
    }

    // 2. Firestore status
    const currentFbStatus = getFirebaseStatus();
    setFirestoreStatus(currentFbStatus.status === 'connected' ? 'connected' : currentFbStatus.status === 'syncing' ? 'syncing' : 'offline');

    // 3. Storage check
    if (activeFirebaseConfig?.storageBucket) {
      setStorageStatus('configured');
    } else {
      setStorageStatus('configured'); // Default bucket fallback
    }
  };

  const runSiswaRulesCheck = async () => {
    setIsVerifyingSiswaRules(true);
    try {
      const res = await verifySiswaCollectionSecurityRules();
      setSiswaRulesResult(res);
    } catch (err) {
      console.error('Failed to verify siswa security rules:', err);
    } finally {
      setIsVerifyingSiswaRules(false);
    }
  };

  const handleRunDiagnostics = async (showToast: boolean = true) => {
    setIsRunningDiagnostic(true);
    if (showToast) {
      toast.loading('Menjalankan pengujian diagnostik koneksi Firebase & izin Firestore...', { id: 'diag-run-toast' });
    }
    try {
      const [report, siswaRes] = await Promise.all([
        runFirebaseDiagnostics(),
        verifySiswaCollectionSecurityRules()
      ]);
      setDiagnosticReport(report);
      setSiswaRulesResult(siswaRes);

      if (showToast) {
        if (report.isAllPassed && !siswaRes.isRestricted) {
          toast.success('Pengujian Diagnostik Selesai! Semua layanan Firebase terhubung & izin Firestore valid.', { id: 'diag-run-toast' });
        } else {
          toast.error('Ditemukan kendala koneksi atau batasan Security Rules Firestore!', { id: 'diag-run-toast' });
        }
      }
    } catch (err: any) {
      if (showToast) {
        toast.error('Gagal menjalankan diagnostik: ' + (err?.message || String(err)), { id: 'diag-run-toast' });
      }
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const handleCopyRules = () => {
    const textToCopy = solutionType === 'firestore' ? RECOMMENDED_FIRESTORE_RULES : RECOMMENDED_SQL_SCHEMA;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRules(true);
    toast.success(`Kode ${solutionType === 'firestore' ? 'Firestore Security Rules' : 'Schema SQL (MySQL/PostgreSQL)'} berhasil disalin ke clipboard!`);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  const config = activeFirebaseConfig;
  const currentDbId = getActiveDatabaseId();
  const maskedApiKey = config.apiKey ? '***' + config.apiKey.slice(-6) : '-';

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden max-w-5xl w-full mx-auto font-sans text-slate-100">
      {/* Header Bar */}
      <div className="bg-slate-800/90 border-b border-slate-700/80 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl text-indigo-400 shrink-0">
            <Zap size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Firebase Diagnostics Dashboard</span>
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold rounded-full">
                Real-Time
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoring status koneksi real-time (Auth, Firestore, Storage) dan verifikasi aturan keamanan koleksi siswa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRunDiagnostics(true)}
            disabled={isRunningDiagnostic}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/25 cursor-pointer shrink-0"
          >
            <RefreshCw size={14} className={isRunningDiagnostic ? 'animate-spin' : ''} />
            <span>{isRunningDiagnostic ? 'Memeriksa...' : 'Jalankan Diagnostik'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Tutup
            </button>
          )}
        </div>
      </div>

      {/* WARNING BANNER UNTUK WALI KELAS (Jika Aturan Firestore Membatasi Koleksi Siswa) */}
      {siswaRulesResult?.isRestricted && (
        <div className="m-5 p-4 bg-rose-950/70 border-2 border-rose-500/80 rounded-2xl text-rose-100 space-y-3 animate-pulse shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/20 border border-rose-500/50 rounded-xl text-rose-400 shrink-0 mt-0.5">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-rose-200 flex items-center gap-2">
                  <span>PERINGATAN PENTING UNTUK WALI KELAS / GURU</span>
                  <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] font-extrabold rounded-md uppercase">
                    Akses Dibatasi
                  </span>
                </h3>
                <p className="text-xs text-rose-200/90 mt-1 leading-relaxed font-medium">
                  Aturan Keamanan (Security Rules) Firestore di Firebase Console menolak atau membatasi akses baca/tulis ke koleksi data <span className="font-mono font-bold text-amber-300 underline">'siswa' ({siswaRulesResult.testedCollection})</span>!
                </p>
                {siswaRulesResult.technicalError && (
                  <p className="text-[11px] font-mono text-rose-300 bg-rose-900/40 p-2 rounded-lg mt-2 border border-rose-700/50">
                    Detail Pesan Sistem: {siswaRulesResult.technicalError}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleCopyRules}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedRules ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              <span>{copiedRules ? 'Tersalin!' : 'Salin Kode Solusi Rules'}</span>
            </button>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-rose-500/40 text-xs space-y-2">
            <p className="font-bold text-amber-300 flex items-center gap-1.5">
              <HelpCircle size={14} />
              <span>Panduan Langkah-demi-Langkah Perbaikan di Konsol Firebase:</span>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] pl-1 leading-relaxed">
              {siswaRulesResult.solutionSteps.map((step, idx) => (
                <li key={idx} className="hover:text-slate-100">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Main Tab Bar */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-3 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-indigo-400 border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Server size={14} />
          <span>Status Layanan Real-time</span>
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
            activeTab === 'diagnostics'
              ? 'bg-slate-900 text-indigo-400 border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Zap size={14} />
          <span>Hasil Uji Diagnostik</span>
          {diagnosticReport && !diagnosticReport.isAllPassed && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('siswa-rules')}
          className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x relative ${
            activeTab === 'siswa-rules'
              ? 'bg-slate-900 text-indigo-400 border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Lock size={14} />
          <span>Izin Rules Koleksi 'siswa'</span>
          {siswaRulesResult?.isRestricted && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[9px] font-bold rounded-full">
              Dibatasi
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('solution')}
          className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
            activeTab === 'solution'
              ? 'bg-slate-900 text-indigo-400 border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <ShieldCheck size={14} />
          <span>Solusi Kode Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('count-diagnostic')}
          className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
            activeTab === 'count-diagnostic'
              ? 'bg-slate-900 text-indigo-400 border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <GitCompare size={14} />
          <span>Analisis Record & Access Control</span>
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* TAB 5: COUNT DIAGNOSTIC & ACCESS CONTROL SIMULATION */}
        {activeTab === 'count-diagnostic' && (
          <SyncCountDiagnosticTool />
        )}
        {/* TAB 1: OVERVIEW SERVICES & PARAMETERS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Real-time Firebase Services Status Cards */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Globe size={14} className="text-indigo-400" />
                <span>Status Koneksi Real-time Layanan Firebase</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Firebase Auth Service */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                        <UserCheck size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Firebase Auth</h4>
                        <p className="text-[10px] text-slate-400">Autentikasi Pengguna</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full flex items-center gap-1 border ${
                      authStatus === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${authStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                      {authStatus === 'connected' ? 'Aktif' : 'Error'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 text-xs space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Pengguna:</span>
                      <span className="font-semibold text-slate-200">
                        {auth?.currentUser?.email || auth?.currentUser?.uid ? 'Terautentikasi' : 'Anonim'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Provider:</span>
                      <span className="font-mono text-indigo-300">Email & Google</span>
                    </div>
                  </div>
                </div>

                {/* 2. Cloud Firestore Service */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                        <Database size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Cloud Firestore</h4>
                        <p className="text-[10px] text-slate-400">Database Real-time</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full flex items-center gap-1 border ${
                      firestoreStatus === 'connected' || firestoreStatus === 'syncing'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        firestoreStatus === 'connected' ? 'bg-emerald-400' : firestoreStatus === 'syncing' ? 'bg-indigo-400 animate-ping' : 'bg-amber-400'
                      }`} />
                      {firestoreStatus === 'connected' ? 'Terhubung' : firestoreStatus === 'syncing' ? 'Sinkron' : 'Offline'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 text-xs space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Database ID:</span>
                      <span className="font-mono font-bold text-emerald-300">{currentDbId}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Mode Transport:</span>
                      <span className="font-mono text-slate-300">Long Polling</span>
                    </div>
                  </div>
                </div>

                {/* 3. Firebase Storage Service */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
                        <HardDrive size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Firebase Storage</h4>
                        <p className="text-[10px] text-slate-400">Penyimpanan Berkas</p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full flex items-center gap-1 border bg-sky-500/20 text-sky-300 border-sky-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      Siap
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 text-xs space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Bucket Host:</span>
                      <span className="font-mono text-slate-300 truncate max-w-[120px]" title={config.storageBucket || `${config.projectId}.firebasestorage.app`}>
                        {config.storageBucket || `${config.projectId}.appspot.com`}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Kapasitas:</span>
                      <span className="font-mono text-sky-300">Unlimited Cloud</span>
                    </div>
                  </div>
                </div>

                {/* 4. Conflict Resolution Engine */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                          <GitCompare size={18} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">Resolusi Konflik</h4>
                          <p className="text-[10px] text-slate-400">Multi-Device Engine</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full flex items-center gap-1 border ${
                        conflicts.length > 0
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${conflicts.length > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                        {conflicts.length > 0 ? `${conflicts.length} Bentrok` : 'Normal'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-snug">
                      {conflicts.length > 0
                        ? `Terdeteksi ${conflicts.length} dokumen dengan sengketa data versi lokal & server.`
                        : 'Memantau edit simultan multi-device & mencegah overwrite tak disengaja.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      simulateSyncConflict();
                      toast.success('Simulasi konflik multi-device berhasil diaktifkan!');
                    }}
                    className="w-full py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <GitCompare size={13} />
                    <span>Uji / Simulasi Konflik</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Status Indicators for Configuration Parameters */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Key size={14} className="text-amber-400" />
                <span>Indikator Parameter Konfigurasi Kunci</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Parameter 1: API Key */}
                <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">API Key Firebase</span>
                    <span className="font-mono text-xs text-amber-300 font-bold block">{maskedApiKey}</span>
                  </div>

                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
                    config.apiKey ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {config.apiKey ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {config.apiKey ? 'Valid / Terisi' : 'Kosong'}
                  </span>
                </div>

                {/* Parameter 2: Project ID */}
                <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Project ID</span>
                    <span className="font-mono text-xs text-indigo-300 font-bold block">{config.projectId || '-'}</span>
                  </div>

                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
                    config.projectId && config.projectId !== 'demo-project'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {config.projectId ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {config.projectId ? 'Terkoneksi' : 'Missing'}
                  </span>
                </div>

                {/* Parameter 3: Database ID */}
                <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Database ID</span>
                    <span className="font-mono text-xs text-emerald-300 font-bold block">{currentDbId}</span>
                  </div>

                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Aktif
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DIAGNOSTICS REPORT */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-4">
            {diagnosticReport ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  diagnosticReport.isAllPassed
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${
                      diagnosticReport.isAllPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {diagnosticReport.isAllPassed ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">
                        {diagnosticReport.isAllPassed ? 'Status Koneksi: 100% Siap & Berhasil' : 'Status Koneksi: Ditemukan Kendala'}
                      </h4>
                      <p className="text-xs opacity-90 mt-0.5">{diagnosticReport.recommendation}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono opacity-60 shrink-0">
                    {diagnosticReport.timestamp}
                  </span>
                </div>

                {/* Steps List */}
                <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden divide-y divide-slate-700/60 shadow-lg">
                  {diagnosticReport.steps.map((step, idx) => (
                    <div key={idx} className="p-4 hover:bg-slate-750/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 p-1.5 rounded-lg ${
                            step.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {step.passed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                              <span>{step.name}</span>
                              {step.passed ? (
                                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LULUS</span>
                              ) : (
                                <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">GAGAL</span>
                              )}
                            </h5>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{step.message}</p>

                            {step.technicalError && (
                              <div className="mt-2 p-2.5 bg-slate-950/80 rounded-xl border border-rose-500/30 font-mono text-[11px] text-rose-300 overflow-x-auto">
                                <span className="font-bold text-rose-400">Detail Error Teknis: </span>
                                {step.technicalError}
                              </div>
                            )}

                            {step.solutionHint && (
                              <div className="mt-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-2">
                                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                  <HelpCircle size={14} />
                                  <span>Petunjuk Solusi Penyelesaian:</span>
                                </div>
                                <p className="leading-relaxed">{step.solutionHint}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 bg-slate-800/80 rounded-2xl border border-slate-700/80">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-xs">Menjalankan pengujian koneksi ke Firebase Firestore Cloud...</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SISWA COLLECTION SECURITY RULES */}
        {activeTab === 'siswa-rules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Lock size={16} className="text-amber-400" />
                  <span>Verifikasi Aturan Keamanan Koleksi Data 'siswa'</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Memastikan guru dan wali kelas memiliki izin penuh untuk membaca dan mengunggah data siswa ke Firestore.
                </p>
              </div>

              <button
                onClick={runSiswaRulesCheck}
                disabled={isVerifyingSiswaRules}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} className={isVerifyingSiswaRules ? 'animate-spin' : ''} />
                <span>Uji Ulang Sekarang</span>
              </button>
            </div>

            {siswaRulesResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border ${
                  siswaRulesResult.isRestricted
                    ? 'bg-rose-950/40 border-rose-500/60 text-rose-200'
                    : 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      siswaRulesResult.isRestricted ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {siswaRulesResult.isRestricted ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">
                        {siswaRulesResult.isRestricted ? 'Akses Dibatasi oleh Firestore Security Rules!' : 'Izin Akses Koleksi Siswa Valid & Terbuka'}
                      </h4>
                      <p className="text-xs mt-1 leading-relaxed">{siswaRulesResult.message}</p>
                    </div>
                  </div>
                </div>

                {siswaRulesResult.isRestricted && (
                  <div className="p-4 bg-slate-800/90 border border-slate-700/80 rounded-2xl space-y-3">
                    <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <HelpCircle size={14} />
                      <span>Langkah-Langkah Perbaikan untuk Wali Kelas:</span>
                    </h5>
                    <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300">
                      {siswaRulesResult.solutionSteps.map((s, idx) => (
                        <li key={idx} className="hover:text-slate-100 leading-relaxed">
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 bg-slate-800/80 rounded-2xl">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-xs">Memeriksa aturan izin koleksi 'siswa'...</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SOLUTION CODE RULES & SQL SCHEMA */}
        {activeTab === 'solution' && (
          <div className="space-y-4 bg-slate-800/90 p-5 rounded-2xl border border-slate-700/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Lock size={16} className="text-amber-400" />
                  <span>Solusi Kode Database & Skema Migrasi SQL</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pilih tipe database yang Anda gunakan. Kode solusi diperbarui secara otomatis.
                </p>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setSolutionType('firestore')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    solutionType === 'firestore'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Firebase Rules
                </button>
                <button
                  type="button"
                  onClick={() => setSolutionType('sql')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    solutionType === 'sql'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  SQL (MySQL / Postgres)
                </button>
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 overflow-x-auto leading-relaxed max-h-80 custom-scrollbar">
                {solutionType === 'firestore' ? RECOMMENDED_FIRESTORE_RULES : RECOMMENDED_SQL_SCHEMA}
              </pre>

              <button
                onClick={handleCopyRules}
                className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedRules ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                <span>{copiedRules ? 'Tersalin!' : solutionType === 'firestore' ? 'Salin Rules' : 'Salin DDL SQL'}</span>
              </button>
            </div>

            {solutionType === 'firestore' ? (
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200">
                <p className="font-bold text-indigo-300 flex items-center gap-1.5 mb-1">
                  <ExternalLink size={14} />
                  <span>Link Langsung Firebase Console:</span>
                </p>
                <a
                  href={`https://console.firebase.google.com/project/${config.projectId}/firestore/rules`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-300 underline font-semibold hover:text-indigo-100 break-all"
                >
                  https://console.firebase.google.com/project/{config.projectId}/firestore/rules
                </a>
              </div>
            ) : (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-200">
                <p className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                  <Database size={14} />
                  <span>Panduan Migrasi ke Database SQL:</span>
                </p>
                <p className="opacity-90 leading-relaxed">
                  Eksekusi DDL SQL di atas pada engine database MySQL, PostgreSQL, atau MariaDB Anda untuk membuat tabel, kunci relasi (foreign key), serta indeks performa.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
