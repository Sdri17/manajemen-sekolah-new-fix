import React, { useEffect, useState } from 'react';
import { store, Student, Grade, Attendance, Settings } from '../lib/store';
import { repairDatabaseFromCloud } from '../lib/integrityObserver';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw, Trash2, Wrench, 
  Search, FileText, Database, UserX, AlertCircle, ArrowRight, Download, Filter, Wand2,
  Clock, Zap, Activity, Cloud, Lock, Server
} from 'lucide-react';
import { getLatencySummary, pullAllRemoteDataFromFirebase, verifyAndForceSyncGrades, inspectAndLogFirestoreCollections, downloadAuditSyncReport } from '../lib/firebaseSync';
import { runFirestoreSchemaCleanupAndAudit, SchemaCleanupResult } from '../lib/schemaValidator';
import FirebaseDiagnosticAndLogs from '../components/FirebaseDiagnosticAndLogs';
import toast from 'react-hot-toast';
import DatabaseConnectModal from '../components/DatabaseConnectModal';

export interface OrphanIssue {
  id: string;
  table: 'grades' | 'attendance' | 'roster' | 'piket' | 'raporCapaian';
  tableLabel: string;
  recordId: string;
  orphanNisn: string;
  orphanStudentId: string;
  recordName: string;
  subjectOrDate: string;
  matchedStudent?: Student;
}

export interface DuplicateNisnIssue {
  nisn: string;
  count: number;
  students: Student[];
}

export interface MissingNisnIssue {
  studentId: string;
  studentName: string;
  kelas: string;
}

export interface TableSummary {
  table: string;
  label: string;
  totalRows: number;
  validLinkedRows: number;
  orphanRows: number;
}

export default function DiagnostikDatabase() {
  const [isScanning, setIsScanning] = useState(false);
  const [healthScore, setHealthScore] = useState<number>(100);
  const [scanTimestamp, setScanTimestamp] = useState<string | null>(null);

  // Stats
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [totalGrades, setTotalGrades] = useState<number>(0);
  const [totalAttendance, setTotalAttendance] = useState<number>(0);
  const [totalRoster, setTotalRoster] = useState<number>(0);
  const [totalPiket, setTotalPiket] = useState<number>(0);
  const [totalRapor, setTotalRapor] = useState<number>(0);

  // Integrity Issues
  const [orphans, setOrphans] = useState<OrphanIssue[]>([]);
  const [duplicateNisns, setDuplicateNisns] = useState<DuplicateNisnIssue[]>([]);
  const [missingNisns, setMissingNisns] = useState<MissingNisnIssue[]>([]);
  const [tableSummaries, setTableSummaries] = useState<TableSummary[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<'orphans' | 'duplicates' | 'missing' | 'matrix' | 'latency'>('orphans');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [isFixing, setIsFixing] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isCleaningSchema, setIsCleaningSchema] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<SchemaCleanupResult | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);

  const handleRunSchemaCleanup = async () => {
    setIsCleaningSchema(true);
    toast.loading('Menyapu dokumen anomali & mencatat audit log Firestore...', { id: 'schema-cleanup' });
    try {
      const res = await runFirestoreSchemaCleanupAndAudit();
      setCleanupResult(res);
      setShowCleanupModal(true);
      toast.success(res.message, { id: 'schema-cleanup' });
      await runDiagnosticScan();
    } catch (err: any) {
      toast.error('Gagal menjalankan pembersihan skema: ' + err.message, { id: 'schema-cleanup' });
    } finally {
      setIsCleaningSchema(false);
    }
  };

  // Latency Metrics State
  const [latencyMetrics, setLatencyMetrics] = useState(() => getLatencySummary());
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  useEffect(() => {
    const handleLatencyUpdate = () => {
      setLatencyMetrics(getLatencySummary());
    };
    window.addEventListener('firestore-latency-updated', handleLatencyUpdate);
    return () => {
      window.removeEventListener('firestore-latency-updated', handleLatencyUpdate);
    };
  }, []);

  const handleRunLatencyBenchmark = async () => {
    setIsTestingLatency(true);
    toast.loading('Menguji latensi query & unduhan Cloud Firebase...', { id: 'latency-test' });
    try {
      const result = await pullAllRemoteDataFromFirebase();
      setLatencyMetrics(getLatencySummary());
      toast.success(result.message, { id: 'latency-test' });
    } catch (e: any) {
      toast.error('Uji latensi gagal: ' + e.message, { id: 'latency-test' });
    } finally {
      setIsTestingLatency(false);
    }
  };

  const handleRepairAction = async () => {
    setIsRepairing(true);
    toast.loading('Memperbaiki database dan menyinkronkan data dengan Cloud Firebase...', { id: 'diag-repair' });
    try {
      const res = await repairDatabaseFromCloud();
      if (res.success) {
        toast.success(res.message, { id: 'diag-repair' });
      } else {
        toast.error(res.message, { id: 'diag-repair' });
      }
      await runDiagnosticScan();
    } catch (e: any) {
      toast.error('Gagal memperbaiki database: ' + e.message, { id: 'diag-repair' });
    } finally {
      setIsRepairing(false);
    }
  };

  useEffect(() => {
    runDiagnosticScan();
  }, []);

  const runDiagnosticScan = async () => {
    setIsScanning(true);
    try {
      // 1. Fetch all master students
      const studentMap = new Map<string, Student>(); // Key by student.id
      const nisnMap = new Map<string, Student[]>(); // Key by student.nisn
      const studentNameMap = new Map<string, Student>(); // Key by lowercase student.nama
      const allStudents: Student[] = [];
      const appSettings = await store.settings.getItem<Settings>('app_settings');

      await store.students.iterate<Student, void>((s) => {
        if (!s) return;
        allStudents.push(s);
        const sid = String(s.id || s.nisn || '').trim();
        if (sid) studentMap.set(sid, s);

        const cleanNisn = s.nisn ? String(s.nisn).trim() : '';
        if (cleanNisn && cleanNisn !== '-') {
          const existing = nisnMap.get(cleanNisn) || [];
          existing.push(s);
          nisnMap.set(cleanNisn, existing);
        }

        if (s.nama) {
          studentNameMap.set(s.nama.trim().toLowerCase(), s);
        }
      });

      setTotalStudents(allStudents.length);

      // 2. Identify duplicate NISNs
      const dups: DuplicateNisnIssue[] = [];
      nisnMap.forEach((students, nisn) => {
        if (students.length > 1) {
          dups.push({ nisn, count: students.length, students });
        }
      });
      setDuplicateNisns(dups);

      // 3. Identify students missing NISN
      const missing: MissingNisnIssue[] = [];
      allStudents.forEach((s) => {
        const nisn = s.nisn ? String(s.nisn).trim() : '';
        if (!nisn || nisn === '-') {
          missing.push({
            studentId: s.id || s.nisn || '',
            studentName: s.nama || 'Tanpa Nama',
            kelas: s.kelas || '-'
          });
        }
      });
      setMissingNisns(missing);

      // 4. Scan Sub-tables for Orphaned NISN/ID references
      const orphanList: OrphanIssue[] = [];

      // A. Scan Grades (Nilai)
      let countGrades = 0;
      let validGrades = 0;
      let orphanGrades = 0;

      await store.grades.iterate<Grade, void>((g, key) => {
        countGrades++;
        const targetId = g.id_siswa ? String(g.id_siswa).trim() : '';
        const targetNisn = g.nisn ? String(g.nisn).trim() : '';
        const found = (targetId && studentMap.has(targetId)) || (targetNisn && nisnMap.has(targetNisn));

        if (found) {
          validGrades++;
        } else {
          orphanGrades++;
          // Attempt name matching for auto-repair candidate
          const recName = g.nama || (g as any).nama_siswa || '';
          const matchByName = recName ? studentNameMap.get(recName.trim().toLowerCase()) : undefined;

          orphanList.push({
            id: `grades-${key}`,
            table: 'grades',
            tableLabel: 'Nilai Siswa',
            recordId: key,
            orphanNisn: targetNisn || '-',
            orphanStudentId: targetId || '-',
            recordName: recName || 'Tanpa Nama',
            subjectOrDate: `${g.mata_pelajaran || (g as any).mapel || 'Mapel'} (${g.jenis_nilai || (g as any).kategori || 'Nilai'})`,
            matchedStudent: matchByName
          });
        }
      });
      setTotalGrades(countGrades);

      // B. Scan Attendance (Absensi)
      let countAttendance = 0;
      let validAttendance = 0;
      let orphanAttendance = 0;

      await store.attendance.iterate<Attendance, void>((a, key) => {
        countAttendance++;
        const targetId = a.id_siswa ? String(a.id_siswa).trim() : '';
        const targetNisn = a.nisn ? String(a.nisn).trim() : '';
        const found = (targetId && studentMap.has(targetId)) || (targetNisn && nisnMap.has(targetNisn));

        if (found) {
          validAttendance++;
        } else {
          orphanAttendance++;
          const recName = a.nama || (a as any).nama_siswa || '';
          const matchByName = recName ? studentNameMap.get(recName.trim().toLowerCase()) : undefined;

          orphanList.push({
            id: `attendance-${key}`,
            table: 'attendance',
            tableLabel: 'Absensi Siswa',
            recordId: key,
            orphanNisn: targetNisn || '-',
            orphanStudentId: targetId || '-',
            recordName: recName || 'Tanpa Nama',
            subjectOrDate: `${a.tanggal || '-'} (${a.status || 'Hadir'})`,
            matchedStudent: matchByName
          });
        }
      });
      setTotalAttendance(countAttendance);

      // C. Scan Roster (Jadwal Pelajaran Kelas - verifikasi relasi induk ID Kelas)
      const validClasses = new Set<string>();
      if (appSettings?.nama_kelas) validClasses.add(appSettings.nama_kelas.trim());
      if (Array.isArray((appSettings as any)?.daftar_kelas)) {
        (appSettings as any).daftar_kelas.forEach((c: any) => { if (c) validClasses.add(String(c).trim()); });
      }
      allStudents.forEach(s => {
        if (s.kelas && s.kelas !== 'Alumni') validClasses.add(s.kelas.trim());
      });

      let countRoster = 0;
      let validRoster = 0;
      let orphanRoster = 0;

      await store.roster.iterate<any, void>((r, key) => {
        countRoster++;
        const targetClass = (r.kelas || r.id_kelas || '').trim();
        const hasValidClass = targetClass ? (validClasses.has(targetClass) || validClasses.size === 0) : false;

        if (hasValidClass) {
          validRoster++;
        } else {
          orphanRoster++;
          orphanList.push({
            id: `roster-${key}`,
            table: 'roster',
            tableLabel: 'Roster Pelajaran',
            recordId: key,
            orphanNisn: '-',
            orphanStudentId: '-',
            recordName: `Jadwal ${r.mata_pelajaran || r.mapel || 'Tanpa Mapel'} (${r.hari || 'Hari -'})`,
            subjectOrDate: targetClass ? `Kelas: "${targetClass}"` : 'Kelas Kosong / Hilang',
            matchedStudent: undefined
          });
        }
      });
      setTotalRoster(countRoster);

      // D. Scan Piket
      let countPiket = 0;
      let validPiket = 0;
      let orphanPiket = 0;

      await store.piket.iterate<any, void>((p, key) => {
        countPiket++;
        const targetId = p.id_siswa ? String(p.id_siswa).trim() : '';
        const targetNisn = p.nisn ? String(p.nisn).trim() : '';
        const found = (targetId && studentMap.has(targetId)) || (targetNisn && nisnMap.has(targetNisn));

        if (found) {
          validPiket++;
        } else {
          orphanPiket++;
          const recName = p.nama || p.nama_siswa || '';
          const matchByName = recName ? studentNameMap.get(recName.trim().toLowerCase()) : undefined;

          orphanList.push({
            id: `piket-${key}`,
            table: 'piket',
            tableLabel: 'Jadwal Piket',
            recordId: key,
            orphanNisn: targetNisn || '-',
            orphanStudentId: targetId || '-',
            recordName: recName || 'Tanpa Nama',
            subjectOrDate: `Hari ${p.hari || '-'}`,
            matchedStudent: matchByName
          });
        }
      });
      setTotalPiket(countPiket);

      // E. Scan Rapor Capaian
      let countRapor = 0;
      let validRapor = 0;
      let orphanRapor = 0;

      await store.raporCapaian.iterate<any, void>((rc, key) => {
        countRapor++;
        const targetId = rc.id_siswa ? String(rc.id_siswa).trim() : '';
        const targetNisn = rc.nisn ? String(rc.nisn).trim() : '';
        const found = (targetId && studentMap.has(targetId)) || (targetNisn && nisnMap.has(targetNisn));

        if (found) {
          validRapor++;
        } else {
          orphanRapor++;
          const recName = rc.nama_siswa || rc.nama || '';
          const matchByName = recName ? studentNameMap.get(recName.trim().toLowerCase()) : undefined;

          orphanList.push({
            id: `raporCapaian-${key}`,
            table: 'raporCapaian',
            tableLabel: 'Rapor Capaian',
            recordId: key,
            orphanNisn: targetNisn || '-',
            orphanStudentId: targetId || '-',
            recordName: recName || 'Tanpa Nama',
            subjectOrDate: rc.mapel || 'Mata Pelajaran',
            matchedStudent: matchByName
          });
        }
      });
      setTotalRapor(countRapor);

      setOrphans(orphanList);

      // Matrix Summaries
      setTableSummaries([
        { table: 'students', label: 'Data Master Siswa', totalRows: allStudents.length, validLinkedRows: allStudents.length - missing.length, orphanRows: missing.length },
        { table: 'grades', label: 'Tabel Nilai Siswa', totalRows: countGrades, validLinkedRows: validGrades, orphanRows: orphanGrades },
        { table: 'attendance', label: 'Tabel Absensi Siswa', totalRows: countAttendance, validLinkedRows: validAttendance, orphanRows: orphanAttendance },
        { table: 'roster', label: 'Tabel Roster Kelas (Jadwal)', totalRows: countRoster, validLinkedRows: validRoster, orphanRows: orphanRoster },
        { table: 'piket', label: 'Tabel Jadwal Piket', totalRows: countPiket, validLinkedRows: validPiket, orphanRows: orphanPiket },
        { table: 'raporCapaian', label: 'Tabel Rapor Capaian', totalRows: countRapor, validLinkedRows: validRapor, orphanRows: orphanRapor }
      ]);

      // Calculate health score: 100 - (2 * orphanList.length) - (5 * dups.length) - (1 * missing.length)
      const penalty = (orphanList.length * 2) + (dups.length * 5) + (missing.length * 1);
      const score = Math.max(0, Math.min(100, 100 - penalty));
      setHealthScore(score);
      setScanTimestamp(new Date().toLocaleTimeString('id-ID'));

    } catch (err: any) {
      console.error('Error during diagnostic scan:', err);
      toast.error('Gagal menjalankan diagnostik: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Auto Repair matchable orphans
  const handleAutoRepairOrphans = async () => {
    const matchable = orphans.filter(o => o.matchedStudent);
    if (matchable.length === 0) {
      toast.error('Tidak ada entitas yatim yang memiliki kecocokan nama otomatis.');
      return;
    }

    setIsFixing(true);
    let repairedCount = 0;

    try {
      for (const item of matchable) {
        if (!item.matchedStudent) continue;
        const s = item.matchedStudent;
        const targetNisn = s.nisn || s.id;
        const targetId = s.id || s.nisn;

        if (item.table === 'grades') {
          const g = await store.grades.getItem<any>(item.recordId);
          if (g) {
            g.id_siswa = targetId;
            g.nisn = targetNisn;
            g.nama_siswa = s.nama;
            await store.grades.setItem(item.recordId, g);
            repairedCount++;
          }
        } else if (item.table === 'attendance') {
          const a = await store.attendance.getItem<any>(item.recordId);
          if (a) {
            a.id_siswa = targetId;
            a.nisn = targetNisn;
            a.nama = s.nama;
            await store.attendance.setItem(item.recordId, a);
            repairedCount++;
          }
        } else if (item.table === 'piket') {
          const p = await store.piket.getItem<any>(item.recordId);
          if (p) {
            p.id_siswa = targetId;
            p.nisn = targetNisn;
            p.nama = s.nama;
            await store.piket.setItem(item.recordId, p);
            repairedCount++;
          }
        } else if (item.table === 'raporCapaian') {
          const rc = await store.raporCapaian.getItem<any>(item.recordId);
          if (rc) {
            rc.id_siswa = targetId;
            rc.nisn = targetNisn;
            rc.nama_siswa = s.nama;
            await store.raporCapaian.setItem(item.recordId, rc);
            repairedCount++;
          }
        }
      }

      window.dispatchEvent(new Event('data-changed'));
      toast.success(`Berhasil memperbaiki ${repairedCount} relasi data yatim!`);
      await runDiagnosticScan();
    } catch (err: any) {
      toast.error('Gagal saat perbaikan otomatis: ' + err.message);
    } finally {
      setIsFixing(false);
    }
  };

  // Delete an orphan record
  const handleDeleteOrphan = async (issue: OrphanIssue) => {
    try {
      if (issue.table === 'grades') await store.grades.removeItem(issue.recordId);
      if (issue.table === 'attendance') await store.attendance.removeItem(issue.recordId);
      if (issue.table === 'roster') await store.roster.removeItem(issue.recordId);
      if (issue.table === 'piket') await store.piket.removeItem(issue.recordId);
      if (issue.table === 'raporCapaian') await store.raporCapaian.removeItem(issue.recordId);

      window.dispatchEvent(new Event('data-changed'));
      toast.success('Record yatim berhasil dihapus.');
      await runDiagnosticScan();
    } catch (err: any) {
      toast.error('Gagal menghapus record: ' + err.message);
    }
  };

  // Cleanup ALL orphan records at once
  const handleCleanupAllOrphans = async () => {
    if (orphans.length === 0) {
      toast.error('Tidak ada entitas yatim untuk dibersihkan.');
      return;
    }

    setIsFixing(true);
    let deletedCount = 0;
    try {
      for (const item of orphans) {
        if (item.table === 'grades') await store.grades.removeItem(item.recordId);
        if (item.table === 'attendance') await store.attendance.removeItem(item.recordId);
        if (item.table === 'roster') await store.roster.removeItem(item.recordId);
        if (item.table === 'piket') await store.piket.removeItem(item.recordId);
        if (item.table === 'raporCapaian') await store.raporCapaian.removeItem(item.recordId);
        deletedCount++;
      }

      window.dispatchEvent(new Event('data-changed'));
      toast.success(`Berhasil membersihkan ${deletedCount} record yatim dari IndexedDB!`);
      await runDiagnosticScan();
    } catch (err: any) {
      toast.error('Gagal membersihkan data yatim: ' + err.message);
    } finally {
      setIsFixing(false);
    }
  };

  // Auto-Generate missing NISN
  const handleAutoGenerateMissingNisns = async () => {
    if (missingNisns.length === 0) return;
    setIsFixing(true);
    let countGen = 0;
    try {
      for (const item of missingNisns) {
        const student = await store.students.getItem<Student>(item.studentId);
        if (student) {
          const generatedNisn = `300${Math.floor(1000000 + Math.random() * 9000000)}`;
          student.nisn = generatedNisn;
          if (!student.id) student.id = generatedNisn;
          await store.students.setItem(student.id, student);
          countGen++;
        }
      }
      window.dispatchEvent(new Event('data-changed'));
      toast.success(`Berhasil membuat NISN otomatis untuk ${countGen} siswa!`);
      await runDiagnosticScan();
    } catch (err: any) {
      toast.error('Gagal saat membuat NISN otomatis: ' + err.message);
    } finally {
      setIsFixing(false);
    }
  };

  // Export diagnostic report
  const handleExportReport = () => {
    const reportData = {
      appName: 'EduSync',
      reportType: 'Database Integrity & Orphan Scan',
      timestamp: new Date().toISOString(),
      healthScore,
      summary: {
        totalStudents,
        totalGrades,
        totalAttendance,
        totalRoster,
        totalPiket,
        totalRapor,
        orphanCount: orphans.length,
        duplicateNisnCount: duplicateNisns.length,
        missingNisnCount: missingNisns.length
      },
      orphans: orphans.map(o => ({
        table: o.tableLabel,
        recordId: o.recordId,
        orphanNisn: o.orphanNisn,
        recordName: o.recordName,
        subjectOrDate: o.subjectOrDate,
        autoMatchFound: !!o.matchedStudent
      })),
      duplicateNisns,
      missingNisns
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Laporan_Diagnostik_Database_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('Laporan diagnostik berhasil diunduh!');
  };

  // Filtered orphans list
  const filteredOrphans = orphans.filter(o => {
    const matchTable = tableFilter === 'all' || o.table === tableFilter;
    const matchSearch = searchTerm === '' || 
      o.recordName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      o.orphanNisn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.subjectOrDate.toLowerCase().includes(searchTerm.toLowerCase());
    return matchTable && matchSearch;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* Top Banner & Scan Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-4">
          <div className={`p-4 rounded-2xl border ${
            healthScore >= 90 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : healthScore >= 70 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <ShieldCheck size={36} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Diagnostik & Integritas Relasi NISN</h2>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                healthScore >= 90 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                healthScore >= 70 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                Skor Kesehatan: {healthScore}%
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Memindai seluruh tabel (Nilai, Absensi, Piket, Rapor) untuk mendeteksi relasi NISN yatim & profil tidak valid.
              {scanTimestamp && <span className="ml-2 text-indigo-300">• Pemindaian terakhir: {scanTimestamp}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsConnectModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer border border-indigo-400/30"
          >
            <Database size={15} className="animate-pulse" />
            <span>Hubungkan Database Hosting</span>
          </button>

          <button
            onClick={handleRepairAction}
            disabled={isRepairing}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer border border-emerald-400/30"
          >
            {isRepairing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memperbaiki...</span>
              </>
            ) : (
              <>
                <Wand2 size={15} />
                <span>Perbaiki Database (Repair)</span>
              </>
            )}
          </button>

          <button
            onClick={handleRunSchemaCleanup}
            disabled={isCleaningSchema}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50 cursor-pointer border border-amber-400/30"
            title="Sapu dan bersihkan dokumen tanpa ID siswa atau field mandatory yang valid"
          >
            {isCleaningSchema ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Menyapu Anomali...</span>
              </>
            ) : (
              <>
                <Trash2 size={15} />
                <span>Sapu Clean-up Anomali</span>
              </>
            )}
          </button>

          <button
            onClick={runDiagnosticScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? 'Memindai...' : 'Pindai Ulang Database'}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-700/80">
            <button
              onClick={() => {
                downloadAuditSyncReport('csv');
                toast.success('Log Audit & Laporan Sinkronisasi (CSV) berhasil diunduh!');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              title="Unduh Laporan Audit Log & Performa Sinkronisasi format CSV"
            >
              <Download size={13} />
              <span>Audit CSV</span>
            </button>
            <button
              onClick={() => {
                downloadAuditSyncReport('json');
                toast.success('Log Audit & Laporan Sinkronisasi (JSON) berhasil diunduh!');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              title="Unduh Laporan Audit Log & Performa Sinkronisasi format JSON"
            >
              <Download size={13} />
              <span>Audit JSON</span>
            </button>
          </div>

          <button
            onClick={handleExportReport}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Laporan Diagnostik</span>
          </button>
        </div>
      </div>

      {/* Firebase Connection Diagnostic & Sync Audit Logs */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Activity size={18} className="text-indigo-400 animate-pulse" />
          <span>Pengujian Diagnostik Firebase & Audit Log Sinkronisasi Real-Time</span>
        </h3>
        <FirebaseDiagnosticAndLogs />
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Record Yatim (Orphan)</p>
            <p className={`text-2xl font-bold mt-1 ${orphans.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {orphans.length} <span className="text-xs font-normal text-slate-400">item</span>
            </p>
          </div>
          <div className={`p-3 rounded-xl ${orphans.length > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            <UserX size={20} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">NISN Duplikat</p>
            <p className={`text-2xl font-bold mt-1 ${duplicateNisns.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {duplicateNisns.length} <span className="text-xs font-normal text-slate-400">kasus</span>
            </p>
          </div>
          <div className={`p-3 rounded-xl ${duplicateNisns.length > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Siswa Tanpa NISN</p>
            <p className={`text-2xl font-bold mt-1 ${missingNisns.length > 0 ? 'text-indigo-400' : 'text-emerald-400'}`}>
              {missingNisns.length} <span className="text-xs font-normal text-slate-400">siswa</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Profil Siswa</p>
            <p className="text-2xl font-bold mt-1 text-slate-100">
              {totalStudents} <span className="text-xs font-normal text-slate-400">siswa</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-700/50 text-slate-300">
            <Database size={20} />
          </div>
        </div>
      </div>

      {/* Tabs Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('orphans')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'orphans'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            Entitas Yatim ({orphans.length})
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'duplicates'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            NISN Duplikat ({duplicateNisns.length})
          </button>
          <button
            onClick={() => setActiveTab('missing')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'missing'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            Profil Tanpa NISN ({missingNisns.length})
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            Matriks Tabel
          </button>
          <button
            onClick={() => setActiveTab('latency')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'latency'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            <Clock size={14} />
            <span>Latensi Firestore</span>
          </button>
        </div>

        {/* Global Tab Actions */}
        {activeTab === 'orphans' && (
          <div className="flex items-center gap-2">
            {orphans.some(o => o.matchedStudent) && (
              <button
                onClick={handleAutoRepairOrphans}
                disabled={isFixing}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <Wrench size={14} />
                <span>Perbaiki Relasi Nama Otomatis ({orphans.filter(o => o.matchedStudent).length})</span>
              </button>
            )}
            {orphans.length > 0 && (
              <button
                onClick={handleCleanupAllOrphans}
                disabled={isFixing}
                className="flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-rose-600/20"
              >
                <Trash2 size={14} />
                <span>Pembersihan Massal Data Yatim ({orphans.length})</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'missing' && missingNisns.length > 0 && (
          <button
            onClick={handleAutoGenerateMissingNisns}
            disabled={isFixing}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Wrench size={14} />
            <span>Generasi NISN Otomatis ({missingNisns.length})</span>
          </button>
        )}
      </div>

      {/* Tab 1: Entitas Yatim */}
      {activeTab === 'orphans' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Cari nama siswa, NISN, atau mata pelajaran/tanggal..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={15} className="text-slate-400" />
              <select
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                className="bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-slate-200 px-3 py-2 outline-none cursor-pointer"
              >
                <option value="all">Semua Tabel ({orphans.length})</option>
                <option value="grades">Nilai Siswa ({orphans.filter(o => o.table === 'grades').length})</option>
                <option value="attendance">Absensi ({orphans.filter(o => o.table === 'attendance').length})</option>
                <option value="roster">Roster ({orphans.filter(o => o.table === 'roster').length})</option>
                <option value="piket">Piket ({orphans.filter(o => o.table === 'piket').length})</option>
                <option value="raporCapaian">Rapor ({orphans.filter(o => o.table === 'raporCapaian').length})</option>
              </select>
            </div>
          </div>

          {filteredOrphans.length === 0 ? (
            <div className="p-12 text-center bg-slate-800/20 border border-slate-800 rounded-2xl">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Tidak Ada Entitas Yatim Ditemukan!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Seluruh data di tabel Nilai, Absensi, Piket, dan Rapor terhubung secara sempurna dengan profil master siswa di IndexedDB.
              </p>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="p-3">Tabel / Sumber</th>
                      <th className="p-3">Nama di Record</th>
                      <th className="p-3">NISN / ID Ref</th>
                      <th className="p-3">Keterangan / Detil</th>
                      <th className="p-3">Rekomendasi Perbaikan</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredOrphans.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/60 transition-colors">
                        <td className="p-3 font-medium text-indigo-300">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px]">
                            {item.tableLabel}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-200">{item.recordName}</td>
                        <td className="p-3 font-mono text-slate-400">{item.orphanNisn !== '-' ? item.orphanNisn : item.orphanStudentId}</td>
                        <td className="p-3 text-slate-300">{item.subjectOrDate}</td>
                        <td className="p-3">
                          {item.matchedStudent ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                              <CheckCircle2 size={13} />
                              <span>Cocok dengan: <strong>{item.matchedStudent.nama}</strong> (NISN: {item.matchedStudent.nisn})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                              <AlertCircle size={13} />
                              <span>Profil siswa tidak ditemukan di master</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteOrphan(item)}
                            className="p-1.5 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
                            title="Hapus record yatim"
                          >
                            <Trash2 size={15} />
                          </button>
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

      {/* Tab 2: NISN Duplikat */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          {duplicateNisns.length === 0 ? (
            <div className="p-12 text-center bg-slate-800/20 border border-slate-800 rounded-2xl">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Tidak Ada NISN Duplikat!</h3>
              <p className="text-xs text-slate-400 mt-1">Setiap siswa di master data memiliki NISN unik yang valid.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {duplicateNisns.map((dup) => (
                <div key={dup.nisn} className="p-4 bg-slate-800/50 border border-rose-500/30 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-rose-400" />
                      <span className="font-semibold text-sm text-slate-200">NISN: {dup.nisn}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {dup.count} Profil Ganda
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dup.students.map((s, idx) => (
                      <div key={s.id || idx} className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-medium text-slate-200">{s.nama}</p>
                          <p className="text-[10px] text-slate-400">Kelas: {s.kelas || '-'} • ID: {s.id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Profil Tanpa NISN */}
      {activeTab === 'missing' && (
        <div className="space-y-4">
          {missingNisns.length === 0 ? (
            <div className="p-12 text-center bg-slate-800/20 border border-slate-800 rounded-2xl">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Seluruh Siswa Memiliki NISN Valid!</h3>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="p-3">Nama Siswa</th>
                    <th className="p-3">Kelas</th>
                    <th className="p-3">ID Siswa</th>
                    <th className="p-3">Status NISN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {missingNisns.map((m) => (
                    <tr key={m.studentId} className="hover:bg-slate-800/60 transition-colors">
                      <td className="p-3 font-semibold text-slate-200">{m.studentName}</td>
                      <td className="p-3 text-slate-300">{m.kelas}</td>
                      <td className="p-3 font-mono text-slate-400">{m.studentId}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium">
                          NISN Kosong / Hyphen
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Matriks Relasi Tabel */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-3">Nama Tabel Database</th>
                  <th className="p-3 text-center">Total Baris</th>
                  <th className="p-3 text-center">Terhubung Valid</th>
                  <th className="p-3 text-center">Masalah / Yatim</th>
                  <th className="p-3 text-right">Integritas Relasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {tableSummaries.map((summary) => {
                  const pct = summary.totalRows === 0 ? 100 : Math.round((summary.validLinkedRows / summary.totalRows) * 100);
                  return (
                    <tr key={summary.table} className="hover:bg-slate-800/60 transition-colors">
                      <td className="p-3 font-semibold text-indigo-300">{summary.label}</td>
                      <td className="p-3 text-center font-mono font-medium text-slate-200">{summary.totalRows}</td>
                      <td className="p-3 text-center font-mono font-medium text-emerald-400">{summary.validLinkedRows}</td>
                      <td className="p-3 text-center font-mono font-medium text-amber-400">{summary.orphanRows}</td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          pct === 100 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Pelacakan Latensi Firestore */}
      {activeTab === 'latency' && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Rata-Rata Latensi Read</span>
                <Clock size={16} className="text-cyan-400" />
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {latencyMetrics.avgPullDurationMs} <span className="text-xs text-slate-400 font-normal">ms/koleksi</span>
              </p>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Zap size={12} /> Delta Sync Aktif
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Kecepatan Pemrosesan</span>
                <Zap size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {latencyMetrics.recentMetric?.itemsPerSecond || 0} <span className="text-xs text-slate-400 font-normal">item/detik</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {latencyMetrics.recentMetric?.updatedCount !== undefined 
                  ? `${latencyMetrics.recentMetric.updatedCount} diubah (${latencyMetrics.recentMetric.itemCount - latencyMetrics.recentMetric.updatedCount} dilewati)` 
                  : 'Siap uji'}
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Total Operasi Terlog</span>
                <Activity size={16} className="text-indigo-400" />
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {latencyMetrics.totalOperations} <span className="text-xs text-slate-400 font-normal">kueri</span>
              </p>
              <p className="text-[11px] text-indigo-400">
                Mencakup 12 Koleksi Firestore
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-2xl space-y-1 flex flex-col justify-between">
              <div>
                <span className="text-slate-400 text-xs">Uji Performa Langsung</span>
                <p className="text-xs text-slate-300 mt-1">Ukur latensi kueri realtime ke Firestore</p>
              </div>
              <button
                onClick={handleRunLatencyBenchmark}
                disabled={isTestingLatency}
                className="mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                <RefreshCw size={13} className={isTestingLatency ? 'animate-spin' : ''} />
                <span>{isTestingLatency ? 'Menguji...' : 'Uji Latensi Firestore'}</span>
              </button>
            </div>
          </div>

          {/* Latency Log Table */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl space-y-2 p-4">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-200">Log Pelacakan Latensi Kueri</h3>
                <p className="text-xs text-slate-400">Catatan waktu respon eksekusi Firestore per koleksi database</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium">
                Optimasi Delta Active
              </span>
            </div>

            {latencyMetrics.logs.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Clock size={36} className="mx-auto text-slate-600" />
                <p className="text-xs text-slate-400">Belum ada log latensi recorded. Klik tombol <strong>Uji Latensi Firestore</strong> di atas untuk mengukur kecepatan kueri.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="p-3">Waktu</th>
                      <th className="p-3">Koleksi</th>
                      <th className="p-3">Operasi</th>
                      <th className="p-3 text-center">Total Item</th>
                      <th className="p-3 text-center">Diperbarui / Dilewati</th>
                      <th className="p-3 text-center">Durasi (ms)</th>
                      <th className="p-3 text-center">Item/Detik</th>
                      <th className="p-3 text-right">Status Latensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {latencyMetrics.logs.map((log) => {
                      const speedCategory = log.durationMs < 250 ? 'Sangat Cepat' : log.durationMs < 800 ? 'Normal' : 'Lambat';
                      const speedBadge = log.durationMs < 250 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : log.durationMs < 800
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                      return (
                        <tr key={log.id} className="hover:bg-slate-800/60 transition-colors">
                          <td className="p-3 font-mono text-slate-400">{log.timestamp}</td>
                          <td className="p-3 font-semibold text-indigo-300">{log.collectionName}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-200">
                              {log.operation}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-medium text-slate-200">{log.itemCount}</td>
                          <td className="p-3 text-center font-mono text-slate-300">
                            {log.updatedCount !== undefined ? (
                              <span>
                                <strong className="text-emerald-400">{log.updatedCount}</strong> / <span className="text-slate-400">{log.itemCount - log.updatedCount}</span>
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-300">{log.durationMs} ms</td>
                          <td className="p-3 text-center font-mono text-slate-300">{log.itemsPerSecond}</td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${speedBadge}`}>
                              {speedCategory} ({log.durationMs}ms)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Laporan Cleanup Skema Firestore */}
      {showCleanupModal && cleanupResult && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">Laporan Pembersihan Skema Firestore</h3>
                  <p className="text-xs text-slate-400">Sapu anomali & pelacakan audit log otomatis</p>
                </div>
              </div>
              <button onClick={() => setShowCleanupModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900/80 border border-slate-700 rounded-xl text-center">
                  <div className="text-xs text-slate-400 font-medium">Total Diperiksa</div>
                  <div className="text-xl font-mono font-bold text-indigo-400 mt-1">{cleanupResult.totalScanned}</div>
                </div>
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-center">
                  <div className="text-xs text-amber-300 font-medium">Anomali Disapu</div>
                  <div className="text-xl font-mono font-bold text-amber-400 mt-1">{cleanupResult.purgedCount}</div>
                </div>
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-center">
                  <div className="text-xs text-emerald-300 font-medium">Log Audit Dicatat</div>
                  <div className="text-xl font-mono font-bold text-emerald-400 mt-1">{cleanupResult.auditLogEntriesCreated}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-300">
                <strong>Pesan Sistem:</strong> {cleanupResult.message}
              </div>

              {cleanupResult.purgedDetails.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rincian Dokumen Terhapus & Pelacakan Asal-Usul:</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {cleanupResult.purgedDetails.map((item, idx) => (
                      <div key={idx} className="p-3 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-200 font-mono font-bold">
                          <span>Koleksi: {item.collection} [ID: {item.docId}]</span>
                          <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] uppercase font-mono">
                            {item.origin}
                          </span>
                        </div>
                        <p className="text-slate-400">{item.reason}</p>
                        {item.payloadSnippet && (
                          <div className="p-2 bg-slate-950 rounded font-mono text-[10px] text-slate-400 overflow-x-auto">
                            Snippet: {item.payloadSnippet}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700/50 bg-slate-900/60 flex justify-end">
              <button
                onClick={() => setShowCleanupModal(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hubungkan Database Hosting */}
      <DatabaseConnectModal 
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />
    </div>
  );
}
