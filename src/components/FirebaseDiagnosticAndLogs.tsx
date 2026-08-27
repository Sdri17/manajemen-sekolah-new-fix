import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download, 
  Trash2, 
  Clock, 
  FileText, 
  Activity, 
  Copy, 
  Check, 
  ExternalLink,
  Wifi,
  Database,
  Server,
  Lock,
  Zap,
  HelpCircle,
  Code
} from 'lucide-react';
import { 
  getSyncAuditLogs, 
  clearSyncAuditLogs, 
  runFirebaseDiagnostics, 
  RECOMMENDED_FIRESTORE_RULES, 
  RECOMMENDED_SQL_SCHEMA,
  SyncAuditLogEntry, 
  FirebaseDiagnosticReport 
} from '../lib/firebaseSync';
import { activeFirebaseConfig, getActiveDatabaseId } from '../lib/firebase';
import toast from 'react-hot-toast';

import FirebaseDiagnosticsDashboard from './FirebaseDiagnosticsDashboard';

export default function FirebaseDiagnosticAndLogs() {
  const [activeSubTab, setActiveSubTab] = useState<'diagnostic' | 'logs' | 'rules'>('diagnostic');
  const [solutionType, setSolutionType] = useState<'firestore' | 'sql'>('firestore');
  const [logs, setLogs] = useState<SyncAuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Copied state
  const [copiedRules, setCopiedRules] = useState(false);

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await getSyncAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load sync audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleRunDiagnostics = async (showToast: boolean = true) => {
    if (showToast) {
      toast.loading('Menjalankan pengujian diagnostik koneksi Firebase...', { id: 'diagnostic-toast' });
    }
    try {
      const report = await runFirebaseDiagnostics();
      if (showToast) {
        if (report.isAllPassed) {
          toast.success('Pengujian Berhasil! Firebase Firestore terhubung & siap digunakan.', { id: 'diagnostic-toast' });
        } else {
          toast.error('Pengujian Menemukan Kendala. Periksa laporan diagnostik di bawah.', { id: 'diagnostic-toast' });
        }
      }
      await loadLogs();
    } catch (err: any) {
      if (showToast) {
        toast.error('Gagal menjalankan pengujian diagnostik: ' + (err?.message || String(err)), { id: 'diagnostic-toast' });
      }
    }
  };

  useEffect(() => {
    loadLogs();
    // Automatically run diagnostic on mount silently (without cluttering toast popups)
    handleRunDiagnostics(false);

    const handleAuditAdded = () => {
      loadLogs();
    };

    window.addEventListener('sync-audit-log-added', handleAuditAdded);
    window.addEventListener('sync-audit-logs-cleared', loadLogs);

    return () => {
      window.removeEventListener('sync-audit-log-added', handleAuditAdded);
      window.removeEventListener('sync-audit-logs-cleared', loadLogs);
    };
  }, []);

  const handleClearLogs = async () => {
    if (confirm('Apakah Anda yakin ingin membersihkan seluruh riwayat log sinkronisasi?')) {
      await clearSyncAuditLogs();
      setLogs([]);
      toast.success('Riwayat log sinkronisasi berhasil dibersihkan');
    }
  };

  const handleCopyRules = () => {
    const textToCopy = solutionType === 'firestore' ? RECOMMENDED_FIRESTORE_RULES : RECOMMENDED_SQL_SCHEMA;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRules(true);
    toast.success(`Kode ${solutionType === 'firestore' ? 'Firestore Security Rules' : 'Schema SQL (MySQL/PostgreSQL)'} berhasil disalin ke clipboard!`);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.errorMessage || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.errorCode || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || log.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit"><CheckCircle2 size={12} /> BERHASIL</span>;
      case 'ERROR':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit"><XCircle size={12} /> ERROR</span>;
      case 'WARN':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> PERINGATAN</span>;
      default:
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-slate-500/20 text-slate-300 border border-slate-500/30 w-fit">{status}</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'PUSH':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">UNGGAH (PUSH)</span>;
      case 'PULL':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">UNDUH (PULL)</span>;
      case 'REALTIME':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">REAL-TIME</span>;
      case 'DIAGNOSTIC':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">DIAGNOSTIK</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-500/20 text-slate-300">{type}</span>;
    }
  };

  const errorLogsCount = logs.filter(l => l.status === 'ERROR').length;
  const successLogsCount = logs.filter(l => l.status === 'SUCCESS').length;

  return (
    <div className="space-y-6">
      {/* Sub Tab Navigation */}
      <div className="flex border-b border-slate-700/80 bg-slate-900/60 p-1.5 rounded-xl">
        <button
          onClick={() => setActiveSubTab('diagnostic')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'diagnostic'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Zap size={15} />
          <span>Diagnostik & Uji Koneksi</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
            activeSubTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FileText size={15} />
          <span>Audit Logs Sinkronisasi</span>
          {errorLogsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
              {errorLogsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('rules')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'rules'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Lock size={15} />
          <span>Solusi Rules Firebase</span>
        </button>
      </div>

      {/* SUB TAB 1: DIAGNOSTIC DASHBOARD */}
      {activeSubTab === 'diagnostic' && (
        <FirebaseDiagnosticsDashboard />
      )}

      {/* SUB TAB 2: AUDIT LOGS */}
      {activeSubTab === 'logs' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                <Activity size={18} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Total Riwayat Operasi</p>
                <p className="text-lg font-bold text-slate-100">{logs.length}</p>
              </div>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Operasi Berhasil</p>
                <p className="text-lg font-bold text-emerald-300">{successLogsCount}</p>
              </div>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 flex items-center gap-3">
              <div className="p-2.5 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-400">
                <XCircle size={18} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Error / Gagal Terkirim</p>
                <p className="text-lg font-bold text-rose-300">{errorLogsCount}</p>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cari pesan error, judul, kata kunci..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900/60 border border-slate-700/80 text-xs text-slate-200 rounded-xl px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status</option>
                <option value="SUCCESS">Berhasil (Success)</option>
                <option value="ERROR">Error / Gagal</option>
                <option value="WARN">Peringatan</option>
              </select>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="bg-slate-900/60 border border-slate-700/80 text-xs text-slate-200 rounded-xl px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="ALL">Semua Tipe Sinkronisasi</option>
                <option value="PUSH">Unggah (Push)</option>
                <option value="PULL">Unduh (Pull)</option>
                <option value="REALTIME">Real-time Stream</option>
                <option value="DIAGNOSTIC">Uji Diagnostik</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={loadLogs}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors cursor-pointer"
                title="Muat Ulang Log"
              >
                <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
              </button>

              <button
                onClick={handleClearLogs}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Bersihkan Log</span>
              </button>
            </div>
          </div>

          {/* Logs List */}
          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-lg">
            {loadingLogs ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-xs">Memuat log sinkronisasi Firebase...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Activity size={28} className="mx-auto mb-2 opacity-40 text-slate-500" />
                <p className="text-xs font-semibold text-slate-300">Belum Ada Catatan Log Sinkronisasi</p>
                <p className="text-[11px] text-slate-500 mt-1">Seluruh proses pengiriman data & pesan error Firebase akan tercatat di sini secara otomatis.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/60 max-h-[420px] overflow-y-auto custom-scrollbar">
                {filteredLogs.map(log => (
                  <div key={log.id} className="p-4 hover:bg-slate-750/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(log.status)}
                          {getTypeBadge(log.type)}
                          <h5 className="text-xs font-bold text-slate-100">{log.title}</h5>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{log.details}</p>

                        {log.errorCode && (
                          <div className="mt-2 p-2 bg-slate-950/80 rounded-xl border border-rose-500/30 font-mono text-[11px] text-rose-300 flex items-center gap-2">
                            <span className="font-bold text-rose-400">Kode Error:</span>
                            <span>{log.errorCode}</span>
                          </div>
                        )}

                        {log.errorMessage && log.errorMessage !== log.details && (
                          <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-400 overflow-x-auto">
                            {log.errorMessage}
                          </div>
                        )}

                        {log.solutionHint && (
                          <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
                            <span className="font-bold text-amber-300">Solusi: </span>
                            {log.solutionHint}
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono shrink-0 flex items-center gap-1 sm:self-start">
                        <Clock size={11} />
                        <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB TAB 3: RULES & SQL SCHEMA HELPER */}
      {activeSubTab === 'rules' && (
        <div className="space-y-5 bg-slate-800/90 p-5 rounded-2xl border border-slate-700/80 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Lock className="text-amber-400" size={18} />
                <span>Solusi Kode Database & Skema Migrasi SQL</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Pilih jenis database yang Anda gunakan. Kode otomatis diperbarui sesuai konfigurasi sistem terbaru.
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
            <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 overflow-x-auto leading-relaxed max-h-96 custom-scrollbar">
              {solutionType === 'firestore' ? RECOMMENDED_FIRESTORE_RULES : RECOMMENDED_SQL_SCHEMA}
            </pre>

            <button
              onClick={handleCopyRules}
              className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              {copiedRules ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              <span>{copiedRules ? 'Tersalin!' : solutionType === 'firestore' ? 'Salin Kode Rules' : 'Salin DDL SQL'}</span>
            </button>
          </div>

          {solutionType === 'firestore' ? (
            <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 space-y-2">
              <h4 className="font-bold text-indigo-300 flex items-center gap-1.5">
                <ExternalLink size={14} />
                <span>Cara Memasang di Firebase Console:</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 opacity-90 pl-1 leading-relaxed">
                <li>Buka <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-semibold text-indigo-300 hover:text-indigo-200">Firebase Console</a> di browser Anda.</li>
                <li>Pilih Project Firebase Anda (misal: <b>sekolahku-4154c</b>).</li>
                <li>Buka menu <b>Firestore Database</b> di bilah navigasi kiri.</li>
                <li>Klik tab <b>Rules</b> di bagian atas.</li>
                <li>Ganti seluruh isi teks dengan kode di atas, lalu klik tombol <b>Publish</b>.</li>
              </ol>
            </div>
          ) : (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 space-y-2">
              <h4 className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Database size={14} />
                <span>Petunjuk Migrasi ke Database SQL (MySQL / PostgreSQL / MariaDB):</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 opacity-90 pl-1 leading-relaxed">
                <li>Buka phpMyAdmin, DBeaver, PGAdmin, atau terminal database SQL Anda.</li>
                <li>Buat database baru (contoh: <code className="bg-emerald-900/60 px-1 py-0.5 rounded">CREATE DATABASE edusync_db;</code>).</li>
                <li>Salin skema DDL SQL di atas dan eksekusi pada query editor database Anda.</li>
                <li>Gunakan tabel & index yang sudah dioptimalkan di atas untuk menjamin query super cepat hingga jutaan baris data.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
