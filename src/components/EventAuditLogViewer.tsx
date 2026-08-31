import React, { useState, useEffect } from 'react';
import { fetchFirestoreAuditLogs, getAuditLogs, AuditLogEntry, logAuditEvent } from '../lib/auditLogger';
import { 
  History, 
  RefreshCw, 
  Search, 
  Filter, 
  Database, 
  UserPlus, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  User, 
  Tag, 
  ShieldAlert,
  ArrowUpRight,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function EventAuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'IMPORTS' | 'USER_ADDITIONS' | 'SYSTEM'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PERSISTED' | 'FAILED'>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const loadEventLogs = async () => {
    setLoading(true);
    try {
      // Fetch directly from Firestore audit_logs collection
      const firestoreData = await fetchFirestoreAuditLogs(300);
      setLogs(firestoreData);
    } catch (err: any) {
      console.error('Error fetching event audit logs from Firestore:', err);
      // Fallback to local logs
      const localData = await getAuditLogs();
      setLogs(localData);
      toast.error('Memuat dari cache lokal (Gagal terhubung ke Cloud Firestore audit_logs)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventLogs();

    const handleAuditAdded = () => {
      loadEventLogs();
    };

    window.addEventListener('audit-log-added', handleAuditAdded);
    return () => {
      window.removeEventListener('audit-log-added', handleAuditAdded);
    };
  }, []);

  // Calculate statistics
  const totalEvents = logs.length;
  const importEvents = logs.filter(l => l.action === 'IMPORT_ACTION' || l.entity === 'Import' || l.entity === 'ImporData');
  const userAdditionEvents = logs.filter(l => l.action === 'USER_ADDITION' || (l.action === 'CREATE' && l.entity === 'Pengguna'));
  const failedPersistenceEvents = logs.filter(l => l.persistence_status === 'FIRESTORE_FAILED');

  const filteredLogs = logs.filter(l => {
    // Category filter
    if (categoryFilter === 'IMPORTS') {
      const isImport = l.action === 'IMPORT_ACTION' || l.entity === 'Import' || l.entity === 'ImporData' || l.details.toLowerCase().includes('impor');
      if (!isImport) return false;
    } else if (categoryFilter === 'USER_ADDITIONS') {
      const isUserAdd = l.action === 'USER_ADDITION' || (l.action === 'CREATE' && (l.entity === 'Pengguna' || l.entity === 'User')) || l.details.toLowerCase().includes('buat akun') || l.details.toLowerCase().includes('tambah akun');
      if (!isUserAdd) return false;
    } else if (categoryFilter === 'SYSTEM') {
      const isSystem = l.action === 'SYSTEM' || l.action === 'SETTINGS';
      if (!isSystem) return false;
    }

    // Status filter
    if (statusFilter === 'PERSISTED' && l.persistence_status === 'FIRESTORE_FAILED') return false;
    if (statusFilter === 'FAILED' && l.persistence_status !== 'FIRESTORE_FAILED') return false;

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchUser = (l.user_name || '').toLowerCase().includes(q) || (l.username || '').toLowerCase().includes(q);
      const matchEntity = (l.entity || '').toLowerCase().includes(q);
      const matchDetails = (l.details || '').toLowerCase().includes(q);
      const matchAction = (l.action || '').toLowerCase().includes(q);
      return matchUser || matchEntity || matchDetails || matchAction;
    }

    return true;
  });

  const handleCreateTestLog = async () => {
    toast.loading('Mencatat log sampel ke Firestore audit_logs...', { id: 'test-log' });
    const result = await logAuditEvent({
      action: 'IMPORT_ACTION',
      entity: 'Import',
      entity_id: 'sample-import-check',
      details: 'Pengujian verifikasi persistensi audit log ke koleksi audit_logs Cloud Firestore oleh Admin',
      persistence_status: 'PERSISTED_TO_FIRESTORE'
    });

    if (result) {
      toast.success('Log audit berhasil dicatat ke Firestore!', { id: 'test-log' });
      loadEventLogs();
    } else {
      toast.error('Gagal mencatat audit log', { id: 'test-log' });
    }
  };

  const exportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error('Tidak ada data audit log untuk diekspor');
      return;
    }

    const headers = ['ID Log', 'Waktu', 'Pengguna', 'Role', 'Aksi', 'Entitas', 'Status Persistensi', 'Detail'];
    const rows = [headers.join(',')];

    filteredLogs.forEach(l => {
      rows.push([
        `"${l.id}"`,
        `"${new Date(l.timestamp).toLocaleString('id-ID')}"`,
        `"${(l.user_name || l.username || 'System').replace(/"/g, '""')}"`,
        `"${l.user_role}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${l.persistence_status || 'PERSISTED_TO_FIRESTORE'}"`,
        `"${(l.details || '').replace(/"/g, '""')}"`
      ].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `firestore_event_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Log audit berhasil diekspor ke CSV');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <History size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Event Audit Trail (Cloud Firestore)
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  audit_logs Collection
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Riwayat terpusat untuk aktivitas impor data, pendaftaran akun pengguna, dan kegagalan persistensi data.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateTestLog}
              className="px-3 py-2 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-indigo-300 transition-all cursor-pointer flex items-center gap-1.5"
              title="Buat sampel log audit pengujian"
            >
              <Database size={14} />
              <span>Tes Catat Audit Log</span>
            </button>

            <button
              onClick={exportCSV}
              className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download size={14} />
              <span>Ekspor CSV</span>
            </button>

            <button
              onClick={loadEventLogs}
              disabled={loading}
              className="px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Memuat...' : 'Segarkan Firestore'}</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Total Event</span>
              <History size={14} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-slate-100 mt-1">{totalEvents}</div>
          </div>

          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Aksi Impor Data</span>
              <FileSpreadsheet size={14} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">{importEvents.length}</div>
          </div>

          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Penambahan Akun</span>
              <UserPlus size={14} className="text-sky-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-sky-400 mt-1">{userAdditionEvents.length}</div>
          </div>

          <div className={`p-3.5 bg-slate-950/60 border rounded-xl ${failedPersistenceEvents.length > 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-800/80'}`}>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Kegagalan Firestore</span>
              <AlertTriangle size={14} className={failedPersistenceEvents.length > 0 ? 'text-rose-400' : 'text-slate-500'} />
            </div>
            <div className={`text-2xl font-mono font-bold mt-1 ${failedPersistenceEvents.length > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {failedPersistenceEvents.length}
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              placeholder="Cari kata kunci, nama, detail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {/* Category Filter Pills */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${categoryFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Semua Event
              </button>
              <button
                onClick={() => setCategoryFilter('IMPORTS')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${categoryFilter === 'IMPORTS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <FileSpreadsheet size={12} />
                <span>Impor Data</span>
              </button>
              <button
                onClick={() => setCategoryFilter('USER_ADDITIONS')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${categoryFilter === 'USER_ADDITIONS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <UserPlus size={12} />
                <span>Tambah Akun</span>
              </button>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="PERSISTED">Firestore Persisted</option>
              <option value="FAILED">Gagal Persistensi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events List / Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="animate-spin mx-auto mb-3 text-indigo-400" size={28} />
            <p className="text-sm font-medium">Memuat event audit dari koleksi Cloud Firestore...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History className="mx-auto mb-3 text-slate-600" size={32} />
            <p className="text-sm font-medium">Tidak ada event audit log yang cocok.</p>
            <p className="text-xs text-slate-500 mt-1">Coba sesuaikan pencarian atau tombol filter di atas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-xs font-semibold border-b border-slate-800">
                  <th className="py-3.5 px-4">Waktu & Tanggal</th>
                  <th className="py-3.5 px-4">Pengguna / Role</th>
                  <th className="py-3.5 px-4">Aksi & Entitas</th>
                  <th className="py-3.5 px-4">Detail Aktivitas</th>
                  <th className="py-3.5 px-4">Status Persistensi</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredLogs.map((log) => {
                  const isImport = log.action === 'IMPORT_ACTION' || log.entity === 'Import' || log.entity === 'ImporData';
                  const isUserAdd = log.action === 'USER_ADDITION' || (log.action === 'CREATE' && (log.entity === 'Pengguna' || log.entity === 'User'));
                  const isFailed = log.persistence_status === 'FIRESTORE_FAILED';

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-500" />
                          <span>{new Date(log.timestamp).toLocaleTimeString('id-ID')}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(log.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{log.user_name || log.username || 'System'}</div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[10px] rounded bg-slate-800 text-slate-400 uppercase font-mono">
                          {log.user_role}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isImport ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                              <FileSpreadsheet size={10} />
                              IMPOR DATA
                            </span>
                          ) : isUserAdd ? (
                            <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold flex items-center gap-1">
                              <UserPlus size={10} />
                              TAMBAH AKUN
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                              {log.action}
                            </span>
                          )}
                          <span className="text-slate-400 font-mono">({log.entity})</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-md">
                        <p className="text-slate-300 line-clamp-2">{log.details}</p>
                        {log.entity_id && (
                          <span className="text-[10px] font-mono text-slate-500">ID: {log.entity_id}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isFailed ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium flex items-center gap-1">
                            <XCircle size={12} />
                            Firestore Gagal
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Tersimpan (Firestore)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedEntry(log)}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <span>Detail</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <History className="text-indigo-400" size={18} />
                Detail Audit Log ({selectedEntry.action})
              </h4>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">Waktu Record:</span>
                  <span className="font-mono text-slate-200">{new Date(selectedEntry.timestamp).toLocaleString('id-ID')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Pengguna:</span>
                  <span className="font-semibold text-slate-200">{selectedEntry.user_name} (@{selectedEntry.username})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Peran Pengguna:</span>
                  <span className="font-mono text-indigo-400 uppercase">{selectedEntry.user_role}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status Persistensi:</span>
                  <span className={selectedEntry.persistence_status === 'FIRESTORE_FAILED' ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedEntry.persistence_status || 'PERSISTED_TO_FIRESTORE'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-1">Rincian Deskripsi:</span>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedEntry.details}
                </div>
              </div>

              {selectedEntry.error_message && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300">
                  <span className="font-bold block mb-1">Pesan Error Firestore:</span>
                  <span className="font-mono text-[11px]">{selectedEntry.error_message}</span>
                </div>
              )}

              {selectedEntry.new_value && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Nilai Data Baru (JSON):</span>
                  <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-[11px] max-h-40 overflow-y-auto">
                    {JSON.stringify(selectedEntry.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
