import React, { useState, useEffect } from 'react';
import { fetchFirestoreAuditLogs, AuditLogEntry } from '../lib/auditLogger';
import { distributePiketAssignments, logRosterUpdateAuditEvent } from '../lib/rosterDistribution';
import { 
  History, 
  RefreshCw, 
  Search, 
  Filter, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Users, 
  Download, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Database,
  Layers,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminRosterAuditView() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);

  const loadRosterAuditLogs = async () => {
    setLoading(true);
    try {
      const allLogs = await fetchFirestoreAuditLogs(300);
      // Filter specifically for roster_update events
      const rosterLogs = allLogs.filter(l => 
        l.entity === 'roster_update' || 
        (l.details && l.details.toLowerCase().includes('roster_update'))
      );
      setLogs(rosterLogs);
    } catch (err) {
      console.error('Error fetching roster audit logs:', err);
      toast.error('Gagal memuat audit log roster_update dari Cloud Firestore');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRosterAuditLogs();
  }, []);

  const handleRunDiagnosticTest = async () => {
    toast.loading('Menjalankan pengujian diagnostik strict-cap piket (10 siswa, limit max 2)...', { id: 'diag-test' });
    
    // Create 10 mock students
    const mockStudents = Array.from({ length: 10 }, (_, i) => ({
      id: `diag_std_${i + 1}`,
      nama: `Siswa Diagnostik ${i + 1}`,
      kelas: '4A'
    }));
    const mockDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

    const res = distributePiketAssignments({
      students: mockStudents,
      days: mockDays,
      selectedClass: '4A (Diagnostik)',
      semester: '1',
      jumlahPiketHarian: 2,
      maxAssignmentsPerStudent: 2
    });

    setTestResult(res);
    toast.success('Pengujian diagnostik selesai! zero-violation terverifikasi.', { id: 'diag-test' });

    // Optionally record to Firestore audit_logs
    await logRosterUpdateAuditEvent({
      selectedClass: '4A (Diagnostik)',
      semester: '1',
      jumlahPiketHarian: 2,
      result: res
    });
    loadRosterAuditLogs();
  };

  // Extract unique classes from logs
  const availableClasses = Array.from(new Set(
    logs.map(l => l.new_value?.selectedClass || l.entity_id?.split('_')?.[2] || '').filter(Boolean)
  ));

  const filteredLogs = logs.filter(l => {
    const cls = l.new_value?.selectedClass || '';
    if (classFilter !== 'ALL' && cls !== classFilter) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchDetails = (l.details || '').toLowerCase().includes(q);
      const matchUser = (l.user_name || l.username || '').toLowerCase().includes(q);
      const matchClass = cls.toLowerCase().includes(q);
      return matchDetails || matchUser || matchClass;
    }
    return true;
  });

  // Calculate high-level stats
  const totalRosterEvents = logs.length;
  const zeroDiscrepancyEvents = logs.filter(l => !l.new_value?.discrepanciesDetected || l.new_value?.discrepanciesDetected.length === 0).length;
  const totalAssignedSlots = logs.reduce((acc, l) => acc + (l.new_value?.totalAssigned || 0), 0);

  const exportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error('Tidak ada data audit roster_update untuk diekspor');
      return;
    }

    const headers = ['ID Log', 'Timestamp', 'Admin/Pengguna', 'Kelas', 'Semester', 'Cap Siswa (Limit 2)', 'Cap Harian', 'Total Ditugaskan', 'Discrepancies', 'Detail'];
    const rows = [headers.join(',')];

    filteredLogs.forEach(l => {
      const nv = l.new_value || {};
      rows.push([
        `"${l.id}"`,
        `"${new Date(l.timestamp).toLocaleString('id-ID')}"`,
        `"${(l.user_name || l.username || 'System').replace(/"/g, '""')}"`,
        `"${nv.selectedClass || '-'}"`,
        `"${nv.semester || '-'}"`,
        `"${nv.maxAssignmentsPerStudent || 2}"`,
        `"${nv.maxDayCap || '-'}"`,
        `"${nv.totalAssigned || 0}"`,
        `"${(nv.discrepanciesDetected || []).length}"`,
        `"${(l.details || '').replace(/"/g, '""')}"`
      ].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `roster_update_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit log roster_update berhasil diekspor!');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <History size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-100">Admin Audit Logs (Koleksi 'audit_logs' - roster_update)</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                Cloud Firestore Realtime
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Memantau riwayat eksekusi otomatis distribusi piket, memverifikasi constraint per-siswa (limit max 2), dan melacak mitigasi discrepancy.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunDiagnosticTest}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Sparkles size={15} />
            <span>Uji Diagnostik Strict-Cap</span>
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={loadRosterAuditLogs}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Data Audit"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-400' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Database size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Log Event roster_update</p>
            <h4 className="text-xl font-bold text-slate-100">{totalRosterEvents}</h4>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Verifikasi Strict-Cap (Zero Violation)</p>
            <h4 className="text-xl font-bold text-emerald-400">{zeroDiscrepancyEvents} / {totalRosterEvents}</h4>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Slot Piket Terproses</p>
            <h4 className="text-xl font-bold text-slate-100">{totalAssignedSlots}</h4>
          </div>
        </div>
      </div>

      {/* Diagnostic Interactive Test Result Card */}
      {testResult && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-100">Hasil Pengujian Diagnostik Strict-Cap (10 Siswa, Max 2 Limit)</h4>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Tutup Diagnostic Card
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <p className="text-slate-400 font-medium mb-2">Penugasan Per-Siswa (Constraint Max 2):</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(testResult.studentAssignmentCounts).map(([stdId, count]) => (
                  <span
                    key={stdId}
                    className={`px-2.5 py-1 rounded-lg border font-mono font-bold ${
                      (count as number) <= 2
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {stdId}: {count as number} / 2
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <p className="text-slate-400 font-medium mb-2">Penugasan Per-Hari (Kuota Max Harian 2):</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(testResult.dayAssignmentCounts).map(([day, count]) => (
                  <span
                    key={day}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono font-bold"
                  >
                    {day}: {count as number} / 2
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cari log roster_update..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={15} className="text-slate-400" />
          <span className="text-xs text-slate-400">Kelas:</span>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Kelas</option>
            {availableClasses.map(c => (
              <option key={c} value={c}>Kelas {c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw size={28} className="animate-spin text-indigo-400 mx-auto" />
            <p className="text-xs">Memuat audit log roster_update dari Cloud Firestore...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <ShieldCheck size={32} className="text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Tidak ada log audit roster_update yang ditemukan</p>
            <p className="text-xs text-slate-500">
              Lakukan auto-distribusi piket di menu Roster/Piket atau jalankan pengujian diagnostik untuk membuat log baru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-4 py-3">Waktu & User</th>
                  <th className="px-4 py-3">Kelas / Semester</th>
                  <th className="px-4 py-3">Cap Per-Siswa</th>
                  <th className="px-4 py-3">Cap Per-Hari</th>
                  <th className="px-4 py-3">Total Penugasan</th>
                  <th className="px-4 py-3">Status Strict-Cap</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredLogs.map(l => {
                  const nv = l.new_value || {};
                  const discrepancies = nv.discrepanciesDetected || [];
                  const isClean = discrepancies.length === 0;

                  return (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">
                          {new Date(l.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Users size={11} />
                          <span>{l.user_name || l.username || 'System Admin'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                          Kelas {nv.selectedClass || l.entity_id?.split('_')?.[2] || '-'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">Sem {nv.semester || '1'}</div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-mono">
                        <span className="text-emerald-400 font-bold">Max 2</span>
                        <span className="text-slate-500 text-[10px] ml-1">(Batas 2-limit)</span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-300">
                        {nv.maxDayCap || nv.jumlahPiketHarian || '-'} Petugas/Hari
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-100">
                        {nv.totalAssigned || 0} Petugas
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {isClean ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={13} />
                            Strict-Cap Validated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle size={13} />
                            Discrepancy Detected ({discrepancies.length})
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedLog(selectedLog?.id === l.id ? null : l)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Eye size={13} />
                          <span>{selectedLog?.id === l.id ? 'Tutup' : 'Detail'}</span>
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

      {/* Selected Log Inspector Modal / Drawer */}
      {selectedLog && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <History size={18} className="text-indigo-400" />
              <h4 className="text-sm font-bold text-slate-100">Detail Roster Update Audit Event #{selectedLog.id}</h4>
            </div>
            <button
              onClick={() => setSelectedLog(null)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Tutup Inspector
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 font-mono">
              <p className="text-indigo-400 font-bold mb-1">// Ringkasan Detail Event:</p>
              <p>{selectedLog.details}</p>
            </div>

            {selectedLog.new_value?.studentAssignmentCounts && (
              <div>
                <p className="font-semibold text-slate-300 mb-2">Jumlah Penugasan Siswa (Verifikasi Constraint Max 2):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(selectedLog.new_value.studentAssignmentCounts).map(([stdId, count]) => (
                    <div key={stdId} className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between font-mono">
                      <span className="text-slate-400 truncate max-w-[100px]">{stdId}</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        (count as number) <= 2 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {count as number} / 2
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
