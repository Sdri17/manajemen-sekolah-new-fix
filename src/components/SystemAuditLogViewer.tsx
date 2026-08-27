import React, { useState, useEffect } from 'react';
import { getAuditLogs, clearAuditLogs, AuditLogEntry } from '../lib/auditLogger';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Filter, 
  Calendar, 
  Download, 
  Trash2, 
  Eye, 
  User, 
  Clock, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Activity,
  Layers,
  Sparkles,
  ChevronDown,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SystemAuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogEntry | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      toast.error('Gagal memuat log aktivitas sistem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();

    const handleAuditAdded = () => {
      loadLogs();
    };
    const handleDataChanged = () => {
      loadLogs();
    };

    window.addEventListener('audit-log-added', handleAuditAdded);
    window.addEventListener('data-changed', handleDataChanged);

    return () => {
      window.removeEventListener('audit-log-added', handleAuditAdded);
      window.removeEventListener('data-changed', handleDataChanged);
    };
  }, []);

  const handleClearLogs = async () => {
    try {
      await clearAuditLogs();
      setLogs([]);
      setShowClearModal(false);
      toast.success('Seluruh riwayat log audit telah dibersihkan');
    } catch (err) {
      toast.error('Gagal membersihkan log audit');
    }
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error('Tidak ada log untuk diekspor');
      return;
    }

    const headers = ['ID Log', 'Waktu', 'User', 'Username', 'Peran', 'Aksi', 'Entitas', 'Detail'];
    const csvRows = [headers.join(',')];

    filteredLogs.forEach(l => {
      const row = [
        `"${l.id}"`,
        `"${new Date(l.timestamp).toLocaleString('id-ID')}"`,
        `"${(l.user_name || '').replace(/"/g, '""')}"`,
        `"${(l.username || '').replace(/"/g, '""')}"`,
        `"${l.user_role}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${(l.details || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Log audit berhasil diekspor ke format CSV');
  };

  // Extract unique entities
  const uniqueEntities = Array.from(new Set(logs.map(l => l.entity))).filter(Boolean);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity_id || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'ALL' || log.entity === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">TAMBAH (CREATE)</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">EDIT (UPDATE)</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">HAPUS (DELETE)</span>;
      case 'LOGIN':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">MASUK (LOGIN)</span>;
      case 'SETTINGS':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">PENGATURAN</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-500/20 text-slate-300 border border-slate-500/30">{action}</span>;
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return {
        full: date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
        relative: getRelativeTimeString(date)
      };
    } catch (e) {
      return { full: ts, relative: '' };
    }
  };

  function getRelativeTimeString(date: Date): string {
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 10) return 'Baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} hari lalu`;
  }

  // Calculate statistics
  const createCount = logs.filter(l => l.action === 'CREATE').length;
  const updateCount = logs.filter(l => l.action === 'UPDATE').length;
  const deleteCount = logs.filter(l => l.action === 'DELETE').length;
  const loginCount = logs.filter(l => l.action === 'LOGIN').length;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Aktivitas</p>
            <p className="text-xl font-bold text-slate-100 mt-0.5">{logs.length}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Penambahan (Create)</p>
            <p className="text-xl font-bold text-emerald-300 mt-0.5">{createCount}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-sky-500/20 border border-sky-500/30 rounded-xl text-sky-400">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Perubahan (Update)</p>
            <p className="text-xl font-bold text-sky-300 mt-0.5">{updateCount}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-400">
            <XCircle size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Penghapusan (Delete)</p>
            <p className="text-xl font-bold text-rose-300 mt-0.5">{deleteCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari kata kunci, nama user, detail..."
              className="w-full pl-9 pr-4 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-slate-200"
            />
          </div>

          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/80 text-xs text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Aksi (CRUD)</option>
            <option value="CREATE">Tambah (CREATE)</option>
            <option value="UPDATE">Edit (UPDATE)</option>
            <option value="DELETE">Hapus (DELETE)</option>
            <option value="LOGIN">Masuk (LOGIN)</option>
            <option value="SETTINGS">Pengaturan</option>
          </select>

          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/80 text-xs text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Entitas Data</option>
            {uniqueEntities.map(ent => (
              <option key={ent} value={ent}>{ent}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadLogs}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors cursor-pointer"
            title="Muat Ulang Log"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={14} />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={() => setShowClearModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Bersihkan</span>
          </button>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/80 overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
            <p className="text-xs">Memuat riwayat log audit sistem...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Activity size={32} className="mx-auto mb-3 opacity-40 text-slate-500" />
            <p className="text-sm font-semibold text-slate-300">Belum Ada Catatan Log Aktivitas</p>
            <p className="text-xs text-slate-500 mt-1">Seluruh aksi CRUD pengguna akan secara otomatis tercatat di halaman audit log ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-700/80">
                <tr>
                  <th className="px-4 py-3">Waktu & Tanggal</th>
                  <th className="px-4 py-3">Pengguna (User)</th>
                  <th className="px-4 py-3">Aksi (CRUD)</th>
                  <th className="px-4 py-3">Entitas</th>
                  <th className="px-4 py-3">Deskripsi / Detail Perubahan</th>
                  <th className="px-4 py-3 text-center">Inspeksi Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-200">
                {filteredLogs.map(log => {
                  const timeObj = formatTimestamp(log.timestamp);
                  const hasDiff = log.previous_value || log.new_value;

                  return (
                    <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-slate-200 font-medium">{timeObj.full}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          <span>{timeObj.relative}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-xs uppercase border border-indigo-500/30">
                            {(log.user_name || 'S').charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{log.user_name || 'System Admin'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">@{log.username || 'system'}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-900/60 text-slate-300 font-semibold border border-slate-700/60 text-[11px]">
                          {log.entity}
                        </span>
                      </td>

                      <td className="px-4 py-3 max-w-xs sm:max-w-md break-words">
                        <p className="text-slate-200 font-medium leading-relaxed">{log.details}</p>
                      </td>

                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {hasDiff ? (
                          <button
                            onClick={() => setSelectedLogForDiff(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg font-medium text-[11px] transition-all cursor-pointer shadow-sm"
                          >
                            <Eye size={12} />
                            <span>Bandingkan Nilai</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diff Inspector Modal */}
      {selectedLogForDiff && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative my-8 animate-fadeIn">
            <button
              onClick={() => setSelectedLogForDiff(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-700/60">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>Inspeksi Perubahan Data (Diff)</span>
                  {getActionBadge(selectedLogForDiff.action)}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dilakukan oleh <span className="font-semibold text-slate-200">{selectedLogForDiff.user_name} (@{selectedLogForDiff.username})</span> pada {new Date(selectedLogForDiff.timestamp).toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <div className="mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-xs text-slate-300">
              <span className="font-semibold text-indigo-300">Aktivitas:</span> {selectedLogForDiff.details}
            </div>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous Value */}
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-rose-500/20 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <span>Nilai Sebelum (Previous State)</span>
                  <XCircle size={14} />
                </div>
                {selectedLogForDiff.previous_value ? (
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-3 rounded-lg overflow-x-auto max-h-60 custom-scrollbar border border-slate-800">
                    {JSON.stringify(selectedLogForDiff.previous_value, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-500 italic p-4 text-center">Tidak ada data sebelumnya (Data Baru Dibuat)</p>
                )}
              </div>

              {/* New Value */}
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-emerald-500/20 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <span>Nilai Sesudah (New State)</span>
                  <CheckCircle2 size={14} />
                </div>
                {selectedLogForDiff.new_value ? (
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-3 rounded-lg overflow-x-auto max-h-60 custom-scrollbar border border-slate-800">
                    {JSON.stringify(selectedLogForDiff.new_value, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-500 italic p-4 text-center">Data Telah Dihapus</p>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700/60 flex justify-end">
              <button
                onClick={() => setSelectedLogForDiff(null)}
                className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Tutup Inspeksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Logs Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 mx-auto">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-base font-bold text-center text-slate-100 mb-2">Hapus Seluruh Audit Log?</h3>
            <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
              Tindakan ini akan menghapus seluruh catatan audit riwayat aktivitas pengguna dari database lokal secara permanen.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleClearLogs}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-lg shadow-rose-600/20"
              >
                Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
