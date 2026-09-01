import React, { useState, useEffect } from 'react';
import { fetchFirestoreAuditLogs, getAuditLogs, logAuditEvent, AuditLogEntry } from '../lib/auditLogger';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Database, 
  User, 
  AlertTriangle, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Filter,
  ShieldCheck,
  Send
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SyncStatusWidget() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [studentOnlyFilter, setStudentOnlyFilter] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('-');

  const loadSyncLogs = async () => {
    setLoading(true);
    try {
      // Fetch latest logs from Firestore 'audit_logs' collection
      const fetchedLogs = await fetchFirestoreAuditLogs(50);
      setLogs(fetchedLogs);
      setLastUpdated(new Date().toLocaleTimeString('id-ID'));
    } catch (err) {
      console.warn('Gagal membaca audit logs dari Firestore, mengambil dari local storage:', err);
      const localLogs = await getAuditLogs();
      setLogs(localLogs);
      setLastUpdated(new Date().toLocaleTimeString('id-ID'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSyncLogs();

    // Auto refresh on new audit events locally
    const handleAuditLogAdded = () => {
      loadSyncLogs();
    };

    window.addEventListener('audit-log-added', handleAuditLogAdded);
    return () => {
      window.removeEventListener('audit-log-added', handleAuditLogAdded);
    };
  }, []);

  // Filter for student-related or display top 10
  const filteredLogs = logs.filter(log => {
    if (!studentOnlyFilter) return true;
    const isStudentEntity = log.entity?.toLowerCase().includes('siswa') || log.entity?.toLowerCase().includes('student');
    const isStudentDetails = log.details?.toLowerCase().includes('siswa') || log.details?.toLowerCase().includes('student');
    return isStudentEntity || isStudentDetails;
  });

  const displayLogs = filteredLogs.slice(0, 10);

  const handleTestSyncLog = async () => {
    toast.loading('Mencoba tes kirim log sinkronisasi ke Firestore audit_logs...', { id: 'test-sync' });
    try {
      const res = await logAuditEvent({
        action: 'UPDATE',
        entity: 'Siswa',
        entity_id: 'TEST_SISWA_' + Date.now().toString().slice(-4),
        details: 'Tes verifikasi sinkronisasi audit_logs untuk record siswa oleh Admin',
        previous_value: { status_sync: 'test_before' },
        new_value: { status_sync: 'test_after_success' }
      });

      if (res?.persistence_status === 'PERSISTED_TO_FIRESTORE') {
        toast.success('Tes sinkronisasi Firestore BERHASIL dicatat di audit_logs!', { id: 'test-sync' });
      } else {
        toast.error(`Tes tersimpan di lokal (Gagal ke Cloud Firestore: ${res?.error_message || 'offline'})`, { id: 'test-sync' });
      }
      await loadSyncLogs();
    } catch (err: any) {
      toast.error('Gagal menjalankan tes sinkronisasi: ' + (err.message || String(err)), { id: 'test-sync' });
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Database size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Status Sinkronisasi Firestore (10 Operasi Terakhir)
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                Koleksi 'audit_logs'
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Pantau status keberhasilan/kegagalan sinkronisasi Firestore untuk data siswa dan record sistem.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setStudentOnlyFilter(!studentOnlyFilter)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              studentOnlyFilter
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Filter hanya menampilkan log operasi data siswa"
          >
            <Filter size={13} />
            <span>Hanya Data Siswa</span>
          </button>

          <button
            onClick={handleTestSyncLog}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-medium border border-indigo-500/30 transition-all cursor-pointer"
            title="Kirim event tes sinkronisasi ke Firestore audit_logs"
          >
            <Send size={13} />
            <span>Tes Sync</span>
          </button>

          <button
            onClick={loadSyncLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
            title="Muat ulang 10 log sinkronisasi terbaru dari Firestore audit_logs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-indigo-400' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Sync Status Log List */}
      {displayLogs.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
          <Clock size={28} className="mx-auto mb-2 text-slate-500 opacity-60" />
          <p>Belum ada catatan log sinkronisasi Firestore dalam koleksi 'audit_logs'.</p>
          <p className="text-[11px] text-slate-500 mt-1">Klik "Tes Sync" di atas untuk membuat log diagnostik pertama.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayLogs.map((log, idx) => {
            const isSuccess = log.persistence_status === 'PERSISTED_TO_FIRESTORE' || !log.error_message;
            const isFailed = log.persistence_status === 'FIRESTORE_FAILED' || !!log.error_message;
            const isExpanded = expandedLogId === log.id;
            const isStudent = log.entity?.toLowerCase().includes('siswa') || log.details?.toLowerCase().includes('siswa');

            return (
              <div 
                key={log.id || idx}
                className="bg-slate-950/60 border border-slate-800/90 hover:border-slate-700 rounded-xl p-3 text-xs transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Left: Event Details & Entity */}
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-[10px] ${
                      isSuccess 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {isSuccess ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                          log.action === 'CREATE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                          log.action === 'DELETE' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
                          'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        }`}>
                          {log.action}
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          isStudent 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-mono'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {log.entity}
                        </span>

                        {log.entity_id && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[120px]">
                            ID: {log.entity_id}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-300 mt-1 line-clamp-1 text-[11px]">
                        {log.details}
                      </p>
                    </div>
                  </div>

                  {/* Right: Timestamp & Status Badge */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <div className="text-right">
                      <div className="text-[11px] font-mono text-slate-300">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {log.timestamp ? new Date(log.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : ''}
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 border ${
                      isSuccess
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : isFailed
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}>
                      {isSuccess ? 'PERSISTED (Cloud)' : isFailed ? 'FAILED (Sync Error)' : 'LOCAL ONLY'}
                    </span>

                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-900 border border-slate-800 transition-all cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Log Details */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] space-y-2 bg-slate-900/50 p-2.5 rounded-lg font-mono">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>User: <strong className="text-slate-200 font-sans">{log.user_name || log.username || 'System'} ({log.user_role || 'admin'})</strong></span>
                      <span>Log ID: <strong className="text-indigo-300">{log.id}</strong></span>
                    </div>

                    {log.error_message && (
                      <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg text-rose-300 text-[10px]">
                        <strong>Error Message:</strong> {log.error_message}
                      </div>
                    )}

                    {(log.previous_value || log.new_value) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                        {log.previous_value && (
                          <div className="bg-slate-950 p-2 rounded border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">Previous Value:</span>
                            <pre className="text-rose-300/90 whitespace-pre-wrap overflow-x-auto">
                              {JSON.stringify(log.previous_value, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.new_value && (
                          <div className="bg-slate-950 p-2 rounded border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">New Value:</span>
                            <pre className="text-emerald-300/90 whitespace-pre-wrap overflow-x-auto">
                              {JSON.stringify(log.new_value, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Timestamp info */}
      <div className="mt-3 text-[10px] text-slate-500 flex items-center justify-between px-1">
        <span>Menampilkan 10 operasi sinkronisasi audit log paling baru</span>
        <span>Terakhir diperbarui: {lastUpdated}</span>
      </div>
    </div>
  );
}
