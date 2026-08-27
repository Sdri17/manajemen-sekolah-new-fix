import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Download, 
  Upload,
  Search, 
  AlertTriangle, 
  Database, 
  FileSpreadsheet, 
  FileCode, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers,
  FileText
} from 'lucide-react';
import { 
  performDeepFirestoreAudit, 
  downloadComprehensiveBackup, 
  downloadAuditReportExport, 
  DeepAuditReport,
  AuditIssue,
  pushAllLocalDataToFirebase
} from '../lib/firebaseSync';
import { parseAndNormalizeBackup } from '../lib/backupHelper';
import { store, pauseNotifications, resumeNotifications, pauseSyncQueue, resumeSyncQueue } from '../lib/store';
import toast from 'react-hot-toast';

export default function AuditAndBackupSection() {
  const [auditReport, setAuditReport] = useState<DeepAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCollection, setSelectedCollection] = useState<string>('semua');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('semua');

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const report = await performDeepFirestoreAudit();
      setAuditReport(report);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    // Run initial audit on load
    runAudit();
  }, []);

  const handleDownloadBackup = async () => {
    setIsBackingUp(true);
    try {
      await downloadComprehensiveBackup();
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Membaca & memulihkan berkas cadangan database...', { position: 'top-right' });
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const rawJson = JSON.parse(e.target?.result as string);
        const normalized = parseAndNormalizeBackup(rawJson);

        if (!normalized) {
          throw new Error('Format file backup tidak valid. Harus berupa file JSON backup EduSync / Firestore.');
        }

        pauseNotifications();
        pauseSyncQueue();

        const batchProcess = async <T,>(items: T[], fn: (item: T) => Promise<void>, batchSize = 200) => {
          for (let i = 0; i < items.length; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            await Promise.all(chunk.map(item => fn(item)));
          }
        };

        let totalRestored = 0;
        const collectionsRestored: string[] = [];

        if (normalized.students && normalized.students.length > 0) {
          await batchProcess(normalized.students, async (s) => {
            await store.students.setItem(s.id, s);
            await store.syncQueue.setItem(`students::${s.id}`, 'updated');
          });
          totalRestored += normalized.students.length;
          collectionsRestored.push(`${normalized.students.length} Siswa`);
        }

        if (normalized.grades && normalized.grades.length > 0) {
          await batchProcess(normalized.grades, async (g) => {
            await store.grades.setItem(g.id, g);
            await store.syncQueue.setItem(`grades::${g.id}`, 'updated');
          });
          totalRestored += normalized.grades.length;
          collectionsRestored.push(`${normalized.grades.length} Nilai`);
        }

        if (normalized.attendance && normalized.attendance.length > 0) {
          await batchProcess(normalized.attendance, async (a) => {
            await store.attendance.setItem(a.id, a);
            await store.syncQueue.setItem(`attendance::${a.id}`, 'updated');
          });
          totalRestored += normalized.attendance.length;
          collectionsRestored.push(`${normalized.attendance.length} Absensi`);
        }

        if (normalized.kas && normalized.kas.length > 0) {
          await batchProcess(normalized.kas, async (k) => {
            await store.kas.setItem(k.id, k);
            await store.syncQueue.setItem(`kas::${k.id}`, 'updated');
          });
          totalRestored += normalized.kas.length;
          collectionsRestored.push(`${normalized.kas.length} Kas`);
        }

        if (normalized.kasLogs && normalized.kasLogs.length > 0) {
          await batchProcess(normalized.kasLogs, async (kl) => {
            await store.kasLogs.setItem(kl.id, kl);
            await store.syncQueue.setItem(`kasLogs::${kl.id}`, 'updated');
          });
          totalRestored += normalized.kasLogs.length;
        }

        if (normalized.roster && normalized.roster.length > 0) {
          await batchProcess(normalized.roster, async (r) => {
            await store.roster.setItem(r.id, r);
            await store.syncQueue.setItem(`roster::${r.id}`, 'updated');
          });
          totalRestored += normalized.roster.length;
          collectionsRestored.push(`${normalized.roster.length} Jadwal`);
        }

        if (normalized.piket && normalized.piket.length > 0) {
          await batchProcess(normalized.piket, async (p) => {
            await store.piket.setItem(p.id, p);
            await store.syncQueue.setItem(`piket::${p.id}`, 'updated');
          });
          totalRestored += normalized.piket.length;
          collectionsRestored.push(`${normalized.piket.length} Piket`);
        }

        if (normalized.tasks && normalized.tasks.length > 0) {
          await batchProcess(normalized.tasks, async (t) => {
            await store.tasks.setItem(t.id, t);
            await store.syncQueue.setItem(`tasks::${t.id}`, 'updated');
          });
          totalRestored += normalized.tasks.length;
          collectionsRestored.push(`${normalized.tasks.length} Tugas`);
        }

        if (normalized.jurnal && normalized.jurnal.length > 0) {
          await batchProcess(normalized.jurnal, async (j) => {
            await store.jurnal.setItem(j.id, j);
            await store.syncQueue.setItem(`jurnal::${j.id}`, 'updated');
          });
          totalRestored += normalized.jurnal.length;
          collectionsRestored.push(`${normalized.jurnal.length} Jurnal`);
        }

        if (normalized.raporCapaian && normalized.raporCapaian.length > 0) {
          await batchProcess(normalized.raporCapaian, async (rc) => {
            await store.raporCapaian.setItem(rc.id, rc);
            await store.syncQueue.setItem(`raporCapaian::${rc.id}`, 'updated');
          });
          totalRestored += normalized.raporCapaian.length;
          collectionsRestored.push(`${normalized.raporCapaian.length} Rapor`);
        }

        if (normalized.settings) {
          await store.settings.setItem('app_settings', normalized.settings);
        }

        resumeNotifications(true);
        resumeSyncQueue();

        window.dispatchEvent(new Event('data-changed'));
        window.dispatchEvent(new Event('sync-status-changed'));

        try {
          await pushAllLocalDataToFirebase();
        } catch (e) {
          console.warn('[AuditAndBackup] Auto push to firebase on restore:', e);
        }

        runAudit();

        toast.success(`Berhasil memulihkan ${totalRestored} data (${collectionsRestored.join(', ')}) ke database!`, { id: toastId, duration: 6000 });
      } catch (err: any) {
        toast.error('Gagal memulihkan backup: ' + (err?.message || err), { id: toastId });
      } finally {
        resumeNotifications(true);
        resumeSyncQueue();
        fileInput.value = '';
      }
    };

    reader.readAsText(file);
  };

  const filteredIssues = (auditReport?.issues || []).filter(issue => {
    const matchesSearch = 
      issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.docId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (issue.brokenRefId && issue.brokenRefId.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCollection = selectedCollection === 'semua' || issue.collection === selectedCollection;
    const matchesSeverity = selectedSeverity === 'semua' || issue.severity === selectedSeverity;

    return matchesSearch && matchesCollection && matchesSeverity;
  });

  return (
    <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-6">
      {/* Header & Quick Action Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-700/60">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-400" size={24} />
            <h2 className="text-xl font-bold text-slate-100">Audit Firestore & Backup Sistem</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deteksi otomatis entitas yatim, referensi ID rusak antar koleksi, dan tindakan pencegahan data loss wali kelas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Main Download Backup Button */}
          <button
            onClick={handleDownloadBackup}
            disabled={isBackingUp}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            title="Mengunduh seluruh data dari 12 koleksi Firestore dalam 1 file JSON komprehensif"
          >
            <Download size={16} className={isBackingUp ? 'animate-bounce' : ''} />
            <span>{isBackingUp ? 'Menyiapkan Backup...' : 'Download Backup JSON'}</span>
            <span className="hidden sm:inline-block ml-1 text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.5 rounded-md font-mono">
              Pencegahan Data Loss
            </span>
          </button>

          {/* Import / Restore Backup Button */}
          <label
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700/80 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
            title="Unggah dan pulihkan seluruh data database dari file JSON backup"
          >
            <Upload size={16} />
            <span>Import Backup JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreBackup}
              className="hidden"
            />
          </label>

          {/* Run Audit Button */}
          <button
            onClick={runAudit}
            disabled={isAuditing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50 border border-indigo-400/30"
          >
            <RefreshCw size={14} className={isAuditing ? 'animate-spin' : ''} />
            <span>{isAuditing ? 'Menaudit...' : 'Audit Ulang Database'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-medium">Total Koleksi</span>
            <Layers size={16} className="text-indigo-400" />
          </div>
          <h4 className="text-2xl font-bold text-slate-100">{auditReport?.totalCollections || 12}</h4>
          <span className="text-[10px] text-slate-400 mt-1">Firestore Real-time DB</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-medium">Dokumen Diaudit</span>
            <Database size={16} className="text-sky-400" />
          </div>
          <h4 className="text-2xl font-bold text-slate-100">{auditReport?.totalDocuments || 0}</h4>
          <span className="text-[10px] text-sky-400 mt-1">Keseluruhan entitas tersimpan</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-medium">Integritas Data</span>
            {auditReport && auditReport.totalIssues === 0 ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <AlertCircle size={16} className="text-amber-400" />
            )}
          </div>
          <h4 className={`text-2xl font-bold ${auditReport?.totalIssues === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {auditReport?.totalIssues === 0 ? 'Sehat (100%)' : `${auditReport?.totalIssues} Anomali`}
          </h4>
          <span className="text-[10px] text-slate-400 mt-1">
            {auditReport?.totalIssues === 0 ? 'Semua referensi valid' : 'Memerlukan penanganan'}
          </span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-medium">Entitas Yatim</span>
            <AlertTriangle size={16} className={auditReport && auditReport.totalOrphans > 0 ? 'text-rose-400' : 'text-slate-500'} />
          </div>
          <h4 className={`text-2xl font-bold ${auditReport && auditReport.totalOrphans > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
            {auditReport?.totalOrphans || 0}
          </h4>
          <span className="text-[10px] text-rose-400 mt-1">ID Siswa/Kas tidak ditemukan</span>
        </div>
      </div>

      {/* Export & Controls Bar for Audit Table */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
        {/* Search & Collection Selector */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari deskripsi / ID rusak..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="px-3 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="semua">Semua Koleksi</option>
            <option value="grades">grades (Nilai)</option>
            <option value="attendance">attendance (Absensi)</option>
            <option value="students">students (Siswa)</option>
            <option value="piket">piket (Jadwal Piket)</option>
            <option value="jurnal">jurnal (Jurnal Karakter)</option>
            <option value="kas">kas (Uang Kas)</option>
            <option value="kasLogs">kasLogs (Log Kas)</option>
            <option value="raporCapaian">raporCapaian (Rapor)</option>
            <option value="tasks">tasks (Tugas)</option>
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="semua">Semua Status</option>
            <option value="danger">Danger (Bahaya)</option>
            <option value="warning">Warning (Peringatan)</option>
            <option value="info">Info (Informasi)</option>
          </select>
        </div>

        {/* Audit Table Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => auditReport && downloadAuditReportExport(auditReport, 'csv')}
            disabled={!auditReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
            title="Ekspor Ringkasan Hasil Audit Ke CSV"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>Ekspor Audit CSV</span>
          </button>

          <button
            onClick={() => auditReport && downloadAuditReportExport(auditReport, 'json')}
            disabled={!auditReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
            title="Ekspor Ringkasan Hasil Audit Ke JSON"
          >
            <FileCode size={14} className="text-sky-400" />
            <span>Ekspor Audit JSON</span>
          </button>
        </div>
      </div>

      {/* Audit Results Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-900/70">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Koleksi</th>
              <th className="px-4 py-3">Tipe Masalah</th>
              <th className="px-4 py-3">Tingkat Keparahan</th>
              <th className="px-4 py-3">Deskripsi Anomali</th>
              <th className="px-4 py-3">ID Referensi Rusak</th>
              <th className="px-4 py-3">ID Dokumen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredIssues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                  {auditReport?.totalIssues === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <CheckCircle2 size={32} className="text-emerald-400" />
                      <span className="text-slate-200 font-semibold text-sm">Database Firestore Sangat Bersih!</span>
                      <span className="text-xs text-slate-400 max-w-md">Tidak ditemukan entitas yatim atau referensi ID rusak antar koleksi. Seluruh relasi data valid.</span>
                    </div>
                  ) : (
                    <span>Tidak ada anomali yang sesuai dengan filter pencarian.</span>
                  )}
                </td>
              </tr>
            ) : (
              filteredIssues.map((issue) => (
                <tr key={issue.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-200">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-indigo-300">
                      {issue.collection}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      issue.issueType === 'Entitas Yatim'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-500/30'
                        : issue.issueType === 'Referensi Rusak'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
                        : 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {issue.issueType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      issue.severity === 'danger'
                        ? 'bg-rose-500/20 text-rose-400'
                        : issue.severity === 'warning'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-sky-500/20 text-sky-400'
                    }`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-md">
                    {issue.description}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-300">
                    {issue.brokenRefId ? (
                      <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-amber-500/30">
                        {issue.brokenRefId}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400 text-[11px] truncate max-w-[120px]">
                    {issue.docId}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 gap-2 border-t border-slate-800 pt-3">
        <span>
          Terakhir diaudit: {auditReport?.timestamp ? new Date(auditReport.timestamp).toLocaleString('id-ID') : '-'}
        </span>
        <span className="flex items-center gap-1.5">
          <FileText size={12} />
          <span>Cadangan otomatis direkomendasikan sebelum semester baru atau impor data besar.</span>
        </span>
      </div>
    </div>
  );
}
