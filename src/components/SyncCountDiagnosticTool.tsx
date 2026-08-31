import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Cloud,
  Layers,
  Users,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Zap,
  Check,
  Info
} from 'lucide-react';
import {
  runCountComparisonDiagnostic,
  SyncCountDiagnosticReport,
  pullAllRemoteDataFromFirebase,
  pushAllLocalDataToFirebase,
  fetchLatestUsersFromFirebase
} from '../lib/firebaseSync';
import { runAccessControlTestSimulation, AccessControlSimulationReport } from '../lib/accessControlSimulation';
import toast from 'react-hot-toast';

export default function SyncCountDiagnosticTool() {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<SyncCountDiagnosticReport | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'count' | 'simulation'>('count');

  // Simulation states
  const [isRunningSimulation, setIsRunningSimulation] = useState(false);
  const [simulationReport, setSimulationReport] = useState<AccessControlSimulationReport | null>(null);
  const [assignedKelas, setAssignedKelas] = useState('7-A');
  const [unassignedKelas, setUnassignedKelas] = useState('9-B');

  useEffect(() => {
    handleRunDiagnostic(false);
  }, []);

  const handleRunDiagnostic = async (showToast: boolean = true) => {
    setIsRunning(true);
    if (showToast) {
      toast.loading('Menjalankan analisis perbandingan jumlah data (IndexedDB vs Cloud Firestore)...', { id: 'diag-count-toast' });
    }
    try {
      const res = await runCountComparisonDiagnostic();
      setReport(res);
      if (showToast) {
        if (res.isAllSynced) {
          toast.success('Analisis Selesai! Data Siswa & Pengguna 100% tersinkron sempurna.', { id: 'diag-count-toast' });
        } else {
          toast.error('Ditemukan ketidakcocokan jumlah data antara lokal & cloud!', { id: 'diag-count-toast' });
        }
      }
    } catch (err: any) {
      if (showToast) {
        toast.error('Gagal menganalisis data: ' + (err?.message || String(err)), { id: 'diag-count-toast' });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSimulation = async () => {
    setIsRunningSimulation(true);
    toast.loading('Menjalankan pengujian simulasi aturan hak akses (Access Control Test Simulation)...', { id: 'sim-toast' });
    try {
      const res = await runAccessControlTestSimulation(assignedKelas, unassignedKelas);
      setSimulationReport(res);
      if (res.overallPassed) {
        toast.success('Pengujian Simulasi Hak Akses Berhasil! Admin & Wali Kelas terverifikasi sesuai aturan.', { id: 'sim-toast' });
      } else {
        toast.error('Pengujian Simulasi Hak Akses menemukan potensi celah/penolakan!', { id: 'sim-toast' });
      }
    } catch (err: any) {
      toast.error('Gagal menjalankan simulasi: ' + (err?.message || String(err)), { id: 'sim-toast' });
    } finally {
      setIsRunningSimulation(false);
    }
  };

  const handleFixSync = async (target: 'all' | 'users' | 'students') => {
    toast.loading(`Memperbaiki & menyinkronkan ulang data ${target}...`, { id: 'fix-sync-toast' });
    try {
      if (target === 'users') {
        await fetchLatestUsersFromFirebase(true);
      }
      await pushAllLocalDataToFirebase(true, true);
      await pullAllRemoteDataFromFirebase(true, true);
      await handleRunDiagnostic(false);
      toast.success(`Berhasil menyinkronkan ulang data ${target}!`, { id: 'fix-sync-toast' });
    } catch (e: any) {
      toast.error(`Gagal menyinkronkan data: ${e?.message || String(e)}`, { id: 'fix-sync-toast' });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-slate-100 shadow-2xl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0 shadow-lg">
            <GitCompare size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-100">Alat Diagnostik & Simulasi Hak Akses Admin</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Firestore vs IndexedDB
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Bandingkan jumlah record koleksi 'siswa' & 'users' secara langsung untuk melacak titik kegagalan sinkronisasi dan uji simulasi hak akses role Admin & Wali Kelas.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveSubTab('count')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === 'count'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Analisis Jumlah Record
            </button>
            <button
              onClick={() => setActiveSubTab('simulation')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === 'simulation'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Simulasi Access Control
            </button>
          </div>

          <button
            onClick={() => handleRunDiagnostic(true)}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} />
            <span>{isRunning ? 'Menganalisis...' : 'Jalankan Analisis'}</span>
          </button>
        </div>
      </div>

      {/* Subtab 1: Count Comparison Analysis */}
      {activeSubTab === 'count' && (
        <div className="space-y-6">
          {report ? (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-xl border transition-all ${
                  report.isAllSynced
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status Sinkronisasi Total</span>
                    {report.isAllSynced ? <CheckCircle2 size={18} className="text-emerald-400" /> : <XCircle size={18} className="text-rose-400" />}
                  </div>
                  <div className="text-xl font-bold">
                    {report.isAllSynced ? '100% Identik & Tersinkron' : 'Ditemukan Ketidakcocokan Data'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{report.summary}</p>
                </div>

                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Record Lokal (IndexedDB)</span>
                    <Database size={18} className="text-sky-400" />
                  </div>
                  <div className="text-2xl font-bold text-sky-400">{report.totalLocalItems} <span className="text-xs font-normal text-slate-400">items</span></div>
                  <p className="text-[11px] text-slate-400 mt-2">Siswa: {report.siswaResult.localCount} | Users: {report.usersResult.localCount}</p>
                </div>

                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Record Cloud (Firestore)</span>
                    <Cloud size={18} className="text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-indigo-400">{report.totalRemoteItems} <span className="text-xs font-normal text-slate-400">items</span></div>
                  <p className="text-[11px] text-slate-400 mt-2">Siswa: {report.siswaResult.remoteCount} | Users: {report.usersResult.remoteCount}</p>
                </div>
              </div>

              {/* Detailed Collection Comparisons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Siswa / Students Diagnostic */}
                <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-xs">
                        <Users size={16} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-100">Koleksi 'Siswa' (Students)</h4>
                        <span className="text-[10px] text-slate-400">Target Firestore: /students</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      report.siswaResult.status === 'SYNCHRONIZED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {report.siswaResult.status === 'SYNCHRONIZED' ? 'Tersinkron' : report.siswaResult.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 mb-1">IndexedDB Lokal</div>
                      <div className="text-lg font-bold text-sky-400">{report.siswaResult.localCount} record</div>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 mb-1">Firestore Cloud</div>
                      <div className="text-lg font-bold text-indigo-400">{report.siswaResult.remoteCount} record</div>
                    </div>
                  </div>

                  {report.siswaResult.discrepancyCount > 0 && (
                    <div className="space-y-2 bg-amber-950/30 border border-amber-500/30 p-3.5 rounded-xl text-xs">
                      <div className="flex items-center justify-between font-semibold text-amber-300">
                        <span>Titik Kegagalan / Selisih: {report.siswaResult.discrepancyCount} Item</span>
                        <button
                          onClick={() => handleFixSync('students')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Sinkronkan Siswa
                        </button>
                      </div>
                      {report.siswaResult.missingInLocalDocIds.length > 0 && (
                        <div>
                          <span className="text-slate-400">Belum ada di lokal (ada di Cloud):</span>
                          <div className="font-mono text-[10px] text-amber-200 truncate max-w-full">
                            {report.siswaResult.missingInLocalDocIds.slice(0, 5).join(', ')}
                            {report.siswaResult.missingInLocalDocIds.length > 5 && ` (+${report.siswaResult.missingInLocalDocIds.length - 5} lainnya)`}
                          </div>
                        </div>
                      )}
                      {report.siswaResult.missingInRemoteDocIds.length > 0 && (
                        <div>
                          <span className="text-slate-400">Belum ada di Cloud (hanya di lokal):</span>
                          <div className="font-mono text-[10px] text-amber-200 truncate max-w-full">
                            {report.siswaResult.missingInRemoteDocIds.slice(0, 5).join(', ')}
                            {report.siswaResult.missingInRemoteDocIds.length > 5 && ` (+${report.siswaResult.missingInRemoteDocIds.length - 5} lainnya)`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Users Diagnostic */}
                <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-100">Koleksi 'Users' (Pengguna & RBAC)</h4>
                        <span className="text-[10px] text-slate-400">Target Firestore: /users</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      report.usersResult.status === 'SYNCHRONIZED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {report.usersResult.status === 'SYNCHRONIZED' ? 'Tersinkron' : report.usersResult.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 mb-1">IndexedDB Lokal</div>
                      <div className="text-lg font-bold text-sky-400">{report.usersResult.localCount} record</div>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 mb-1">Firestore Cloud</div>
                      <div className="text-lg font-bold text-indigo-400">{report.usersResult.remoteCount} record</div>
                    </div>
                  </div>

                  {report.usersResult.discrepancyCount > 0 && (
                    <div className="space-y-2 bg-amber-950/30 border border-amber-500/30 p-3.5 rounded-xl text-xs">
                      <div className="flex items-center justify-between font-semibold text-amber-300">
                        <span>Titik Kegagalan / Selisih: {report.usersResult.discrepancyCount} Item</span>
                        <button
                          onClick={() => handleFixSync('users')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Sinkronkan Users
                        </button>
                      </div>
                      {report.usersResult.missingInLocalDocIds.length > 0 && (
                        <div>
                          <span className="text-slate-400">Belum ada di lokal (ada di Cloud):</span>
                          <div className="font-mono text-[10px] text-amber-200 truncate max-w-full">
                            {report.usersResult.missingInLocalDocIds.slice(0, 5).join(', ')}
                            {report.usersResult.missingInLocalDocIds.length > 5 && ` (+${report.usersResult.missingInLocalDocIds.length - 5} lainnya)`}
                          </div>
                        </div>
                      )}
                      {report.usersResult.missingInRemoteDocIds.length > 0 && (
                        <div>
                          <span className="text-slate-400">Belum ada di Cloud (hanya di lokal):</span>
                          <div className="font-mono text-[10px] text-amber-200 truncate max-w-full">
                            {report.usersResult.missingInRemoteDocIds.slice(0, 5).join(', ')}
                            {report.usersResult.missingInRemoteDocIds.length > 5 && ` (+${report.usersResult.missingInRemoteDocIds.length - 5} lainnya)`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 p-4 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Info size={16} className="text-indigo-400" />
                  <span>Tekan tombol di samping untuk memaksa sinkronisasi atomic dua arah dan memperbaiki perbedaan record.</span>
                </div>
                <button
                  onClick={() => handleFixSync('all')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Sinkronkan Ulang Seluruh Data Atomic
                </button>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Menganalisis perbandingan jumlah data...
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Access Control Simulation */}
      {activeSubTab === 'simulation' && (
        <div className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700 space-y-3">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              Pengujian Simulasi Aturan Hak Akses (Security Rules Access Control Test)
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fungsi ini menyimulasikan percobaan pembacaan dan penulisan untuk memastikan bahwa role <strong className="text-indigo-300">Admin</strong> memiliki akses penuh ke seluruh koleksi, sedangkan role <strong className="text-amber-300">Wali Kelas</strong> secara ketat dibatasi hanya pada path rombel binaannya.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Rombel Binaan Wali Kelas (Assigned Class)</label>
                <input
                  type="text"
                  value={assignedKelas}
                  onChange={(e) => setAssignedKelas(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Rombel Lain (Mencoba Akses Tanpa Izin)</label>
                <input
                  type="text"
                  value={unassignedKelas}
                  onChange={(e) => setUnassignedKelas(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              onClick={handleRunSimulation}
              disabled={isRunningSimulation}
              className="mt-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw size={14} className={isRunningSimulation ? 'animate-spin' : ''} />
              <span>{isRunningSimulation ? 'Menjalankan Simulasi...' : 'Jalankan Pengujian Simulasi Access Control'}</span>
            </button>
          </div>

          {/* Simulation Report */}
          {simulationReport && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                simulationReport.overallPassed
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
              }`}>
                <div className="flex items-center gap-3">
                  {simulationReport.overallPassed ? <CheckCircle2 size={24} className="text-emerald-400" /> : <ShieldAlert size={24} className="text-rose-400" />}
                  <div>
                    <h5 className="font-bold text-sm">
                      {simulationReport.overallPassed ? 'Pengujian Simulasi Access Control Lolos' : 'Ditemukan Penolakan / Kegagalan Simulasi'}
                    </h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Admin Full Access: {simulationReport.adminAccessVerified ? 'Terverifikasi (Lolos)' : 'Gagal'} | Wali Kelas Path Isolation: {simulationReport.waliKelasIsolationVerified ? 'Terverifikasi (Terisolasi Ketat)' : 'Gagal'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Simulation Result Items */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-700 font-semibold">
                      <th className="p-3">Role</th>
                      <th className="p-3">Nama Pengujian</th>
                      <th className="p-3">Target Path</th>
                      <th className="p-3 text-center">Operasi</th>
                      <th className="p-3 text-center">Ekspektasi</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 font-sans">
                    {simulationReport.results.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 font-semibold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.role === 'admin' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {r.role}
                          </span>
                        </td>
                        <td className="p-3 text-slate-200 font-medium">{r.testName}</td>
                        <td className="p-3 font-mono text-[10px] text-slate-400">{r.targetPath}</td>
                        <td className="p-3 text-center font-bold text-slate-300">{r.operation}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            r.expectedAllowed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {r.expectedAllowed ? 'Diizinkan' : 'Ditolak'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">
                          {r.passed ? (
                            <span className="text-emerald-400 flex items-center justify-center gap-1">
                              <Check size={14} /> Lolos
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center justify-center gap-1">
                              <XCircle size={14} /> Gagal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
