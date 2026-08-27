import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsType, store, defaultSettings, AppUser, pauseNotifications, resumeNotifications, pauseSyncQueue, resumeSyncQueue, clearEntireDatabase } from '../lib/store';
import { Save, Plus, Trash2, UserPlus, ShieldAlert, Key, Pencil, X, Download, Upload, Database, ChevronUp, ChevronDown, SearchCode, ArrowRightLeft, Table, RotateCcw, Sparkles, Wand2, AlertCircle, CheckCircle2, XCircle, AlertTriangle, FileCode, Eye, EyeOff, Check, Filter, Cloud, Settings as SettingsIcon, RefreshCw, Loader2, Mic } from 'lucide-react';
import { googleSignIn } from '../lib/auth';
import { checkDatabaseIntegrity, getStoredIntegrityReport, repairDatabaseFromCloud, IntegrityReport } from '../lib/integrityObserver';
import { getFirebaseStatus, pushAllLocalDataToFirebase, purgeAllFirebaseData, verifyDatabaseIsEmpty, DatabaseVerificationResult } from '../lib/firebaseSync';
import UserManagement from '../components/UserManagement';
import AdminManagementPanel from '../components/AdminManagementPanel';
import { DatabaseMigrationModal } from '../components/DatabaseMigrationModal';
import { parseAndNormalizeBackup } from '../lib/backupHelper';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

const STUDENT_FIELDS_MAP_CONFIG = [
  { field: 'nisn', label: 'NISN', defaultName: 'NISN', description: 'Nomor Induk Siswa Nasional' },
  { field: 'jenis_kelamin', label: 'Jenis Kelamin', defaultName: 'jenis kelamin', description: 'Jenis kelamin (L / P / Laki-laki / Perempuan)' },
  { field: 'kelas', label: 'Kelas', defaultName: 'Kelas', description: 'Tingkat kelas / Rombel' },
  { field: 'nama', label: 'Nama Siswa', defaultName: 'Nama', description: 'Nama lengkap siswa' },
  { field: 'nipd', label: 'NIPD / No Induk', defaultName: 'NIPD', description: 'Nomor Induk Peserta Didik' },
  { field: 'tempat_lahir', label: 'Tempat Lahir', defaultName: 'Tempat Lahir', description: 'Kota / Tempat kelahiran' },
  { field: 'tanggal_lahir', label: 'Tanggal Lahir', defaultName: 'Tanggal Lahir', description: 'Tanggal lahir siswa' },
  { field: 'nama_ayah', label: 'Nama Ayah', defaultName: 'Nama Ayah', description: 'Nama ayah kandung / wali' },
  { field: 'nama_ibu', label: 'Nama Ibu', defaultName: 'Nama Ibu', description: 'Nama ibu kandung' },
  { field: 'no_telp_ortu', label: 'No HP / WA Ortu', defaultName: 'No Telp Ortu', description: 'Nomor HP orang tua' }
];

const ATTENDANCE_FIELDS_MAP_CONFIG = [
  { field: 'tanggal', label: 'Tanggal Absensi', defaultName: 'Tanggal / tgl', description: 'Tanggal catatan absensi' },
  { field: 'nisn', label: 'NISN Siswa', defaultName: 'NISN', description: 'Nomor Induk Siswa Nasional' },
  { field: 'nama', label: 'Nama Siswa', defaultName: 'Nama', description: 'Nama lengkap siswa' },
  { field: 'status', label: 'Status Kehadiran', defaultName: 'Status / Keterangan', description: 'Status: Hadir, Sakit, Izin, Alpa' },
  { field: 'semester', label: 'Semester', defaultName: 'Semester', description: 'Semester pencatatan' },
  { field: 'mata_pelajaran', label: 'Mata Pelajaran', defaultName: 'Mata Pelajaran / Mapel', description: 'Mata pelajaran (Opsional)' }
];

const GRADE_FIELDS_MAP_CONFIG = [
  { field: 'nisn', label: 'NISN Siswa', defaultName: 'NISN', description: 'Nomor Induk Siswa Nasional' },
  { field: 'nama', label: 'Nama Siswa', defaultName: 'Nama', description: 'Nama lengkap siswa' },
  { field: 'mata_pelajaran', label: 'Mata Pelajaran', defaultName: 'Mata Pelajaran / Mapel', description: 'Nama mata pelajaran' },
  { field: 'jenis_nilai', label: 'Jenis Nilai', defaultName: 'Jenis Nilai / Kategori', description: 'Kategori: Harian, Tugas, Ujian' },
  { field: 'nama_kolom', label: 'Nama Kolom / Aspek', defaultName: 'Nama Kolom / Aspek', description: 'Judul nilai (PH 1, Tugas 2, dsb)' },
  { field: 'nilai', label: 'Angka Nilai', defaultName: 'Nilai / Score', description: 'Nilai angka (0-100)' },
  { field: 'semester', label: 'Semester', defaultName: 'Semester', description: 'Semester pencatatan' }
];

interface ValidationIssue {
  id: string;
  category: 'Siswa' | 'Nilai' | 'Absensi' | 'Kas' | 'Roster' | 'Piket' | 'Tugas' | 'Jurnal' | 'Rapor' | 'Pengaturan' | 'Pengguna' | 'Struktur';
  recordId?: string;
  severity: 'error' | 'warning';
  message: string;
}

interface ValidationSummary {
  totalRecords: number;
  studentsCount: number;
  gradesCount: number;
  attendanceCount: number;
  tasksCount: number;
  rosterCount: number;
  piketCount: number;
  jurnalCount: number;
  kasCount: number;
  kasLogsCount: number;
  raporCount: number;
  usersCount: number;
  hasSettings: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: ValidationIssue[];
}

function validateImportJson(json: any): ValidationSummary {
  const issues: ValidationIssue[] = [];
  let totalRecords = 0;
  let studentsCount = 0;
  let gradesCount = 0;
  let attendanceCount = 0;
  let tasksCount = 0;
  let rosterCount = 0;
  let piketCount = 0;
  let jurnalCount = 0;
  let kasCount = 0;
  let kasLogsCount = 0;
  let raporCount = 0;
  let usersCount = 0;
  let hasSettings = false;

  if (!json || typeof json !== 'object') {
    issues.push({
      id: 'root-invalid',
      category: 'Struktur',
      severity: 'error',
      message: 'Format file JSON tidak valid atau berkas bukan objek JSON.'
    });
    return {
      totalRecords: 0,
      studentsCount: 0,
      gradesCount: 0,
      attendanceCount: 0,
      tasksCount: 0,
      rosterCount: 0,
      piketCount: 0,
      jurnalCount: 0,
      kasCount: 0,
      kasLogsCount: 0,
      raporCount: 0,
      usersCount: 0,
      hasSettings: false,
      errorsCount: 1,
      warningsCount: 0,
      issues
    };
  }

  // Validate Students
  if (Array.isArray(json.students)) {
    studentsCount = json.students.length;
    totalRecords += studentsCount;
    json.students.forEach((s: any, idx: number) => {
      const recId = s?.id || `Siswa #${idx + 1}`;
      if (!s || typeof s !== 'object') {
        issues.push({
          id: `std-invalid-${idx}`,
          category: 'Siswa',
          recordId: recId,
          severity: 'error',
          message: `Record siswa pada baris #${idx + 1} tidak valid.`
        });
        return;
      }
      if (!s.id) {
        issues.push({
          id: `std-noid-${idx}`,
          category: 'Siswa',
          recordId: recId,
          severity: 'error',
          message: `Siswa '${s.nama || idx + 1}' tidak memiliki field wajib 'id'.`
        });
      }
      if (!s.nama || !String(s.nama).trim()) {
        issues.push({
          id: `std-noname-${idx}`,
          category: 'Siswa',
          recordId: recId,
          severity: 'error',
          message: `Siswa ID '${recId}' tidak memiliki nama lengkap.`
        });
      }
      if (!s.nisn && !s.nipd) {
        issues.push({
          id: `std-nonisn-${idx}`,
          category: 'Siswa',
          recordId: recId,
          severity: 'warning',
          message: `Siswa '${s.nama || recId}' belum mengisi nomor NISN/NIPD.`
        });
      }
      if (!s.jenis_kelamin && !s.jk && !s.gender) {
        issues.push({
          id: `std-nojk-${idx}`,
          category: 'Siswa',
          recordId: recId,
          severity: 'warning',
          message: `Siswa '${s.nama || recId}' belum memiliki data jenis kelamin.`
        });
      }
    });
  }

  // Validate Grades
  if (Array.isArray(json.grades)) {
    gradesCount = json.grades.length;
    totalRecords += gradesCount;
    json.grades.forEach((g: any, idx: number) => {
      const recId = g?.id || `Nilai #${idx + 1}`;
      if (!g || typeof g !== 'object') {
        issues.push({
          id: `grd-invalid-${idx}`,
          category: 'Nilai',
          recordId: recId,
          severity: 'error',
          message: `Record nilai pada baris #${idx + 1} tidak valid.`
        });
        return;
      }
      if (!g.id) {
        issues.push({
          id: `grd-noid-${idx}`,
          category: 'Nilai',
          recordId: recId,
          severity: 'error',
          message: `Record nilai tidak memiliki field wajib 'id'.`
        });
      }
      if (!g.id_siswa && !g.nisn && !g.nama) {
        issues.push({
          id: `grd-noref-${idx}`,
          category: 'Nilai',
          recordId: recId,
          severity: 'error',
          message: `Record nilai ID ${recId} tidak memiliki referensi siswa (id_siswa/nisn/nama).`
        });
      }
      if (!g.mata_pelajaran) {
        issues.push({
          id: `grd-nomapel-${idx}`,
          category: 'Nilai',
          recordId: recId,
          severity: 'warning',
          message: `Record nilai belum menyertakan nama mata pelajaran.`
        });
      }
      const numVal = Number(g.nilai);
      if (isNaN(numVal) || numVal < 0 || numVal > 100) {
        issues.push({
          id: `grd-badval-${idx}`,
          category: 'Nilai',
          recordId: recId,
          severity: 'warning',
          message: `Nilai '${g.nilai}' pada mapel '${g.mata_pelajaran || '-'}' di luar rentang standar (0-100).`
        });
      }
    });
  }

  // Validate Attendance
  if (Array.isArray(json.attendance)) {
    attendanceCount = json.attendance.length;
    totalRecords += attendanceCount;
    json.attendance.forEach((a: any, idx: number) => {
      const recId = a?.id || `Absen #${idx + 1}`;
      if (!a || typeof a !== 'object') {
        issues.push({
          id: `att-invalid-${idx}`,
          category: 'Absensi',
          recordId: recId,
          severity: 'error',
          message: `Record absensi #${idx + 1} tidak valid.`
        });
        return;
      }
      if (!a.id_siswa && !a.nisn && !a.nama) {
        issues.push({
          id: `att-noref-${idx}`,
          category: 'Absensi',
          recordId: recId,
          severity: 'error',
          message: `Record absensi ID ${recId} tidak terhubung dengan siswa.`
        });
      }
      if (!a.tanggal) {
        issues.push({
          id: `att-nodate-${idx}`,
          category: 'Absensi',
          recordId: recId,
          severity: 'warning',
          message: `Record absensi belum memiliki tanggal.`
        });
      }
      const validStatuses = ['Hadir', 'Sakit', 'Izin', 'Alpa', 'H', 'S', 'I', 'A'];
      if (a.status && !validStatuses.includes(String(a.status).trim())) {
        issues.push({
          id: `att-badstatus-${idx}`,
          category: 'Absensi',
          recordId: recId,
          severity: 'warning',
          message: `Status absensi '${a.status}' tidak standar (dianjurkan Hadir, Sakit, Izin, atau Alpa).`
        });
      }
    });
  }

  // Validate Kas
  if (Array.isArray(json.kas)) {
    kasCount = json.kas.length;
    totalRecords += kasCount;
    json.kas.forEach((k: any, idx: number) => {
      const recId = k?.id || `Kas #${idx + 1}`;
      if (!k || typeof k !== 'object') {
        issues.push({ id: `kas-invalid-${idx}`, category: 'Kas', recordId: recId, severity: 'error', message: `Record kas #${idx + 1} tidak valid.` });
        return;
      }
      if (!k.id) {
        issues.push({ id: `kas-noid-${idx}`, category: 'Kas', recordId: recId, severity: 'error', message: `Record kas transaksi #${idx + 1} tidak memiliki ID.` });
      }
      if (!k.nominal && k.nominal !== 0) {
        issues.push({ id: `kas-nomoney-${idx}`, category: 'Kas', recordId: recId, severity: 'warning', message: `Transaksi kas #${idx + 1} tidak memiliki nilai nominal.` });
      }
    });
  }

  if (Array.isArray(json.kasLogs)) {
    kasLogsCount = json.kasLogs.length;
    totalRecords += kasLogsCount;
  }

  // Validate Roster
  if (Array.isArray(json.roster)) {
    rosterCount = json.roster.length;
    totalRecords += rosterCount;
    json.roster.forEach((r: any, idx: number) => {
      const recId = r?.id || `Roster #${idx + 1}`;
      if (!r || typeof r !== 'object') {
        issues.push({ id: `rst-invalid-${idx}`, category: 'Roster', recordId: recId, severity: 'error', message: `Jadwal roster #${idx + 1} tidak valid.` });
        return;
      }
      if (!r.id) {
        issues.push({ id: `rst-noid-${idx}`, category: 'Roster', recordId: recId, severity: 'error', message: `Jadwal roster '${r.mata_pelajaran || idx + 1}' tidak memiliki ID.` });
      }
    });
  }

  // Validate Piket
  if (Array.isArray(json.piket)) {
    piketCount = json.piket.length;
    totalRecords += piketCount;
  }

  // Validate Tasks
  if (Array.isArray(json.tasks)) {
    tasksCount = json.tasks.length;
    totalRecords += tasksCount;
    json.tasks.forEach((t: any, idx: number) => {
      const recId = t?.id || `Tugas #${idx + 1}`;
      if (!t || typeof t !== 'object') {
        issues.push({ id: `tsk-invalid-${idx}`, category: 'Tugas', recordId: recId, severity: 'error', message: `Record tugas #${idx + 1} tidak valid.` });
        return;
      }
      if (!t.id) {
        issues.push({ id: `tsk-noid-${idx}`, category: 'Tugas', recordId: recId, severity: 'error', message: `Tugas '${t.judul || idx + 1}' tidak memiliki ID.` });
      }
    });
  }

  // Validate Jurnal & Pelanggaran
  if (Array.isArray(json.jurnal)) {
    jurnalCount = json.jurnal.length;
    totalRecords += jurnalCount;
    json.jurnal.forEach((j: any, idx: number) => {
      const recId = j?.id || `Jurnal #${idx + 1}`;
      if (!j || typeof j !== 'object') {
        issues.push({ id: `jrn-invalid-${idx}`, category: 'Jurnal', recordId: recId, severity: 'error', message: `Catatan jurnal #${idx + 1} tidak valid.` });
        return;
      }
      if (!j.id) {
        issues.push({ id: `jrn-noid-${idx}`, category: 'Jurnal', recordId: recId, severity: 'error', message: `Jurnal #${idx + 1} tidak memiliki ID.` });
      }
    });
  }

  if (Array.isArray(json.raporCapaian)) {
    raporCount = json.raporCapaian.length;
    totalRecords += raporCount;
  }

  if (json.settings) {
    hasSettings = true;
    totalRecords += 1;
  }

  if (Array.isArray(json.users)) {
    usersCount = json.users.length;
    totalRecords += usersCount;
  }

  const errorsCount = issues.filter(i => i.severity === 'error').length;
  const warningsCount = issues.filter(i => i.severity === 'warning').length;

  return {
    totalRecords,
    studentsCount,
    gradesCount,
    attendanceCount,
    tasksCount,
    rosterCount,
    piketCount,
    jurnalCount,
    kasCount,
    kasLogsCount,
    raporCount,
    usersCount,
    hasSettings,
    errorsCount,
    warningsCount,
    issues
  };
}

export default function Pengaturan({ 
  settings, 
  setSettings, 
  role, 
  currentUser,
  initialTab = 'umum'
}: { 
  settings: SettingsType | null; 
  setSettings: (s: SettingsType | null) => void; 
  role: 'guru' | 'kepsek'; 
  currentUser?: AppUser;
  initialTab?: 'umum' | 'users' | 'sheets' | 'backup';
}) {
  const [activeTab, setActiveTab] = useState<'umum' | 'users' | 'sheets' | 'backup'>(initialTab);
  const [formData, setFormData] = useState<SettingsType>(settings || defaultSettings);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [highlightedMapelIndices, setHighlightedMapelIndices] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [showSchemaWizardModal, setShowSchemaWizardModal] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [showImportConfirmModal, setShowImportConfirmModal] = useState(false);
  const [pendingImportJson, setPendingImportJson] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [mappingTab, setMappingTab] = useState<'student' | 'attendance' | 'grade'>('student');

  // User Management Password Visibility Controls
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);

  // Reset Database State
  const [showResetDatabaseModal, setShowResetDatabaseModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; totalDeleted: number; message: string } | null>(null);
  const [resetVerificationResult, setResetVerificationResult] = useState<DatabaseVerificationResult | null>(null);

  // Database Integrity Observer States
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(getStoredIntegrityReport);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [isRepairingDb, setIsRepairingDb] = useState(false);

  // Firebase Realtime Cloud Sync States
  const [fbStatus, setFbStatus] = useState(() => getFirebaseStatus());
  const [isPushingFirebase, setIsPushingFirebase] = useState(false);

  useEffect(() => {
    const handleFbChange = () => {
      setFbStatus(getFirebaseStatus());
    };
    window.addEventListener('firebase-status-changed', handleFbChange);
    return () => window.removeEventListener('firebase-status-changed', handleFbChange);
  }, []);

  const handleManualFirebasePush = async () => {
    setIsPushingFirebase(true);
    try {
      const res = await pushAllLocalDataToFirebase();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error('Gagal menyinkronkan data ke Firebase: ' + err.message);
    } finally {
      setIsPushingFirebase(false);
    }
  };

  useEffect(() => {
    const handleReportUpdate = (e: any) => {
      if (e.detail) setIntegrityReport(e.detail);
    };
    window.addEventListener('integrity-report-updated', handleReportUpdate);
    return () => window.removeEventListener('integrity-report-updated', handleReportUpdate);
  }, []);

  const handleRunIntegrityCheck = async () => {
    setIsCheckingIntegrity(true);
    try {
      const rep = await checkDatabaseIntegrity();
      setIntegrityReport(rep);
      if (rep.isValid) {
        toast.success('Pemeriksaan selesai: Database 100% sehat dan sesuai skema!');
      } else {
        toast.error(`Pemeriksaan selesai: Ditemukan ${rep.anomalyCount} anomali data.`);
      }
    } catch (e: any) {
      toast.error('Gagal mengecek integritas: ' + e.message);
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleRepairDatabase = async () => {
    setIsRepairingDb(true);
    toast.loading('Memperbaiki database dan menyinkronkan data dengan Cloud Firebase...', { id: 'repair-db' });
    try {
      const res = await repairDatabaseFromCloud();
      setIntegrityReport(res.report);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      if (res.success) {
        toast.success(res.message, { id: 'repair-db', duration: 5000 });
      } else {
        toast.error(res.message, { id: 'repair-db', duration: 5000 });
      }
    } catch (e: any) {
      toast.error('Gagal memulihkan database: ' + e.message, { id: 'repair-db' });
    } finally {
      setIsRepairingDb(false);
    }
  };

  const handleExecuteResetDatabase = async () => {
    if (isResetting) return;
    if (resetConfirmInput.trim().toUpperCase() !== 'RESET') {
      toast.error('Ketik kata "RESET" dengan benar untuk mengonfirmasi pembersihan database!');
      return;
    }
    setIsResetting(true);
    setResetResult(null);
    setResetVerificationResult(null);
    toast.loading('Sedang membersihkan seluruh koleksi data siswa & Cloud Firebase...', { id: 'reset-db' });
    try {
      pauseSyncQueue();
      pauseNotifications(true);
      const res = await clearEntireDatabase(true);
      const totalDeleted = res?.totalDeleted ?? 0;
      setResetResult({
        success: res?.success ?? true,
        totalDeleted,
        message: res?.message || 'Database lokal & Cloud Firebase berhasil dibersihkan total!'
      });

      toast.loading('Sedang mengonfirmasi & memverifikasi status kebersihan database Firestore...', { id: 'reset-db' });
      const verifyRes = await verifyDatabaseIsEmpty();
      setResetVerificationResult(verifyRes);
      setIsResetting(false);

      if (verifyRes.isClean) {
        toast.success('Pembersihan & verifikasi database selesai! Database 100% bersih.', { id: 'reset-db', duration: 4000 });
      } else {
        toast.error('Terdapat data residu, harap ulangi proses', { id: 'reset-db', duration: 5000 });
      }
    } catch (err: any) {
      toast.error('Gagal membersihkan database: ' + (err?.message || 'Error'), { id: 'reset-db' });
      setIsResetting(false);
    }
  };

  const handleForceClearDatabase = async () => {
    if (isResetting) return;
    setIsResetting(true);
    toast.loading('Menjalankan pembersihan paksa (Force Clear) pada Firestore...', { id: 'reset-db' });
    try {
      pauseSyncQueue();
      pauseNotifications(true);
      await purgeAllFirebaseData();
      const res = await clearEntireDatabase(true);
      const totalDeleted = res?.totalDeleted ?? 0;
      setResetResult({
        success: res?.success ?? true,
        totalDeleted,
        message: res?.message || 'Pembersihan paksa berhasil dijalankan!'
      });

      toast.loading('Sedang memverifikasi ulang kebersihan data di Firestore...', { id: 'reset-db' });
      const verifyRes = await verifyDatabaseIsEmpty();
      setResetVerificationResult(verifyRes);
      setIsResetting(false);

      if (verifyRes.isClean) {
        toast.success('Pembersihan paksa berhasil! Database 100% bersih.', { id: 'reset-db', duration: 4000 });
      } else {
        toast.error('Terdapat data residu, harap ulangi proses', { id: 'reset-db', duration: 5000 });
      }
    } catch (err: any) {
      toast.error('Gagal melakukan pembersihan paksa: ' + (err?.message || 'Error'), { id: 'reset-db' });
      setIsResetting(false);
    }
  };

  // Pre-import Preview Modal State Controls
  const [importPreviewTab, setImportPreviewTab] = useState<'ringkasan' | 'isu' | 'raw'>('ringkasan');
  const [issueFilterSeverity, setIssueFilterSeverity] = useState<'semua' | 'error' | 'warning'>('semua');
  const [issueFilterCategory, setIssueFilterCategory] = useState<string>('semua');

  const handleColumnMappingChange = (category: 'student' | 'attendance' | 'grade', field: string, value: string) => {
    const keyMap = category === 'student' ? 'student_column_map' : category === 'attendance' ? 'attendance_column_map' : 'grade_column_map';
    setFormData(prev => ({
      ...prev,
      [keyMap]: {
        ...(prev[keyMap] || {}),
        [field]: value
      }
    }));
  };

  const handleResetMapping = () => {
    setFormData(prev => ({
      ...prev,
      student_column_map: {},
      attendance_column_map: {},
      grade_column_map: {}
    }));
    toast.success('Pemetaan kolom seluruh data dikembalikan ke mode deteksi otomatis.');
  };

  const handleApplyDefaultPreset = () => {
    const defaultStudentMap: Record<string, string> = {
      nama: 'Nama',
      nisn: 'NISN',
      nipd: 'NIPD',
      tempat_lahir: 'Tempat Lahir',
      tanggal_lahir: 'Tanggal Lahir',
      kelas: 'Kelas',
      nama_ayah: 'Nama Ayah',
      nama_ibu: 'Nama Ibu',
      no_telp_ortu: 'No Telp Ortu',
      jenis_kelamin: 'jenis kelamin'
    };
    const defaultAttendanceMap: Record<string, string> = {
      tanggal: 'Tanggal',
      nisn: 'NISN',
      nama: 'Nama',
      status: 'Status',
      semester: 'Semester',
      mata_pelajaran: 'Mata Pelajaran'
    };
    const defaultGradeMap: Record<string, string> = {
      nisn: 'NISN',
      nama: 'Nama',
      mata_pelajaran: 'Mata Pelajaran',
      jenis_nilai: 'Jenis Nilai',
      nama_kolom: 'Nama Kolom',
      nilai: 'Nilai',
      semester: 'Semester'
    };
    setFormData(prev => ({
      ...prev,
      student_column_map: defaultStudentMap,
      attendance_column_map: defaultAttendanceMap,
      grade_column_map: defaultGradeMap
    }));
    toast.success('Preset pemetaan kolom standar diterapkan!');
  };

  // Recovery Questions for Active User
  const [userEmail, setUserEmail] = useState('');
  const [userQuestion, setUserQuestion] = useState('Nama SD Pertama Anda?');
  const [userAnswer, setUserAnswer] = useState('');
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);

  // Voice Settings State
  const [voiceLang, setVoiceLang] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voice_transcription_lang') || 'id-ID';
    }
    return 'id-ID';
  });

  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    if (currentUser) {
      setUserEmail(currentUser.email_pemulihan || '');
      setUserQuestion(currentUser.pertanyaan_keamanan || 'Nama SD Pertama Anda?');
      setUserAnswer(currentUser.jawaban_keamanan || '');
    }
  }, [currentUser]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const list: AppUser[] = [];
    await store.users.iterate((u: AppUser) => {
      list.push(u);
    });
    setUsers(list);
  };

  const exportMasterBackup = async () => {
    try {
      const backupData: any = {
        students: [],
        grades: [],
        attendance: [],
        tasks: [],
        roster: [],
        piket: [],
        jurnal: [],
        kas: [],
        kasLogs: [],
        raporCapaian: [],
        users: [],
        settings: null,
        backup_date: new Date().toISOString(),
      };

      await store.students.iterate((v) => { backupData.students.push(v); });
      await store.grades.iterate((v) => { backupData.grades.push(v); });
      await store.attendance.iterate((v) => { backupData.attendance.push(v); });
      await store.tasks.iterate((v) => { backupData.tasks.push(v); });
      await store.roster.iterate((v) => { backupData.roster.push(v); });
      await store.piket.iterate((v) => { backupData.piket.push(v); });
      await store.jurnal.iterate((v) => { backupData.jurnal.push(v); });
      await store.kas.iterate((v) => { backupData.kas.push(v); });
      await store.kasLogs.iterate((v) => { backupData.kasLogs.push(v); });
      await store.raporCapaian.iterate((v) => { backupData.raporCapaian.push(v); });
      await store.users.iterate((v) => { backupData.users.push(v); });
      backupData.settings = await store.settings.getItem('app_settings');

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().slice(0,10);
      downloadAnchor.setAttribute("download", `Backup_DataMaster_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success('Pencadangan data master berhasil diunduh!');
    } catch (e: any) {
      toast.error('Gagal mencadangkan data master: ' + e.message);
    }
  };

  const importMasterBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawJson = JSON.parse(e.target?.result as string);
        const normalized = parseAndNormalizeBackup(rawJson);
        if (!normalized) {
          throw new Error('Format file backup tidak valid. File harus mengandung setidaknya satu komponen data yang dikenali (siswa, nilai, absensi, kas, roster, piket, tugas, jurnal, rapor, pengguna, atau pengaturan).');
        }

        setPendingImportJson(normalized);
        setShowImportConfirmModal(true);
      } catch (err: any) {
        toast.error('Gagal membaca file backup JSON: ' + err.message);
      } finally {
        fileInput.value = '';
      }
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (!pendingImportJson) return;
    setIsImporting(true);
    try {
      pauseNotifications();
      const json = pendingImportJson;
      
      // Batch writer helper for high performance IndexedDB insertion
      const batchProcess = async <T,>(items: T[], fn: (item: T) => Promise<void>, batchSize = 200) => {
        for (let i = 0; i < items.length; i += batchSize) {
          const chunk = items.slice(i, i + batchSize);
          await Promise.all(chunk.map(item => fn(item)));
        }
      };

      let restoredSummary: string[] = [];

      if (json.students && Array.isArray(json.students) && json.students.length > 0) {
        const validStudents = json.students.filter((s: any) => s && s.id);
        await batchProcess(validStudents, async (s: any) => {
          await Promise.all([
            store.students.setItem(s.id, s),
            store.syncQueue.setItem(`students::${s.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validStudents.length} Siswa`);
      }
      if (json.grades && Array.isArray(json.grades) && json.grades.length > 0) {
        const validGrades = json.grades.filter((g: any) => g && g.id);
        await batchProcess(validGrades, async (g: any) => {
          await Promise.all([
            store.grades.setItem(g.id, g),
            store.syncQueue.setItem(`grades::${g.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validGrades.length} Nilai`);
      }
      if (json.attendance && Array.isArray(json.attendance) && json.attendance.length > 0) {
        const validAttendance = json.attendance.filter((a: any) => a && a.id);
        await batchProcess(validAttendance, async (a: any) => {
          await Promise.all([
            store.attendance.setItem(a.id, a),
            store.syncQueue.setItem(`attendance::${a.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validAttendance.length} Absensi`);
      }
      if (json.kas && Array.isArray(json.kas) && json.kas.length > 0) {
        const validKas = json.kas.filter((k: any) => k && k.id);
        await batchProcess(validKas, async (k: any) => {
          await Promise.all([
            store.kas.setItem(k.id, k),
            store.syncQueue.setItem(`kas::${k.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validKas.length} Transaksi Kas`);
      }
      if (json.kasLogs && Array.isArray(json.kasLogs) && json.kasLogs.length > 0) {
        const validKasLogs = json.kasLogs.filter((kl: any) => kl && kl.id);
        await batchProcess(validKasLogs, async (kl: any) => {
          await Promise.all([
            store.kasLogs.setItem(kl.id, kl),
            store.syncQueue.setItem(`kasLogs::${kl.id}`, 'updated')
          ]);
        });
      }
      if (json.roster && Array.isArray(json.roster) && json.roster.length > 0) {
        const validRoster = json.roster.filter((r: any) => r && r.id);
        await batchProcess(validRoster, async (r: any) => {
          await Promise.all([
            store.roster.setItem(r.id, r),
            store.syncQueue.setItem(`roster::${r.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validRoster.length} Jadwal Roster`);
      }
      if (json.piket && Array.isArray(json.piket) && json.piket.length > 0) {
        const validPiket = json.piket.filter((p: any) => p && p.id);
        await batchProcess(validPiket, async (p: any) => {
          await Promise.all([
            store.piket.setItem(p.id, p),
            store.syncQueue.setItem(`piket::${p.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validPiket.length} Piket`);
      }
      if (json.tasks && Array.isArray(json.tasks) && json.tasks.length > 0) {
        const validTasks = json.tasks.filter((t: any) => t && t.id);
        await batchProcess(validTasks, async (t: any) => {
          await Promise.all([
            store.tasks.setItem(t.id, t),
            store.syncQueue.setItem(`tasks::${t.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validTasks.length} Tugas`);
      }
      if (json.jurnal && Array.isArray(json.jurnal) && json.jurnal.length > 0) {
        const validJurnal = json.jurnal.filter((j: any) => j && j.id);
        await batchProcess(validJurnal, async (j: any) => {
          await Promise.all([
            store.jurnal.setItem(j.id, j),
            store.syncQueue.setItem(`jurnal::${j.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validJurnal.length} Catatan Jurnal`);
      }
      if (json.raporCapaian && Array.isArray(json.raporCapaian) && json.raporCapaian.length > 0) {
        const validCapaian = json.raporCapaian.filter((c: any) => c && c.id);
        await batchProcess(validCapaian, async (c: any) => {
          await Promise.all([
            store.raporCapaian.setItem(c.id, c),
            store.syncQueue.setItem(`raporCapaian::${c.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validCapaian.length} Rapor Capaian`);
      }
      if (json.settings) {
        const current = await store.settings.getItem<SettingsType>('app_settings') || {} as SettingsType;
        if (json.settings.custom_student_columns && Array.isArray(json.settings.custom_student_columns)) {
          const stdKeys = ['id', 'no', 'nama', 'nisn', 'nipd', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'kelas', 'nama_ayah', 'nama_ibu', 'no_telp_ortu', 'nomor_telepon', 'nama_orang_tua', 'semester', 'tanggal_lulus', 'tahun_ajaran_lulus', 'jk', 'gender'];
          json.settings.custom_student_columns = json.settings.custom_student_columns.filter((col: string) => {
            const norm = String(col).toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
            return !stdKeys.includes(norm);
          });
        }
        const merged = { ...current, ...json.settings };
        await store.settings.setItem('app_settings', merged);
        setFormData(merged);
        setSettings(merged);
        restoredSummary.push('Pengaturan Aplikasi');
      }
      if (json.users && Array.isArray(json.users) && json.users.length > 0) {
        const validUsers = json.users.filter((u: any) => u && u.id && u.username !== 'admin');
        await batchProcess(validUsers, async (u: any) => {
          await Promise.all([
            store.users.setItem(u.id, u),
            store.syncQueue.setItem(`users::${u.id}`, 'updated')
          ]);
        });
        restoredSummary.push(`${validUsers.length} Pengguna System`);
      }

      toast.success('Pencadangan data master berhasil dipulihkan! Menghubungkan & menyinkronkan data ke Cloud Firebase...');
      resumeNotifications(true);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));

      // Automatically push restored data to Firebase Cloud database
      try {
        await pushAllLocalDataToFirebase();
      } catch (syncErr: any) {
        console.warn('Proses sinkronisasi otomatis pasca-impor terdeteksi offline / tertunda:', syncErr?.message);
      }

      setShowImportConfirmModal(false);
      setPendingImportJson(null);
      
      window.dispatchEvent(new Event('data-changed'));
      const summaryText = restoredSummary.length > 0 ? restoredSummary.join(', ') : 'Data';
      toast.success(`Berhasil pemulihan data: ${summaryText}!`);

    } catch (err: any) {
      toast.error('Gagal mengimpor file backup: ' + err.message);
    } finally {
      resumeSyncQueue();
      resumeNotifications(true);
      setIsImporting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('bobot')) {
      let numVal = value.replace(/^0+(?=\d)/, '');
      let parsed = parseInt(numVal, 10);
      if (isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (parsed > 100) parsed = 100;
      setFormData(prev => ({ ...prev, [name]: parsed }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const loadStandardMapel = () => {
    const standardList = [
      'Pendidikan Agama dan Budi Pekerti',
      'Pendidikan Pancasila dan Kewarganegaraan',
      'Bahasa Indonesia',
      'Matematika',
      'Ilmu Pengetahuan Alam dan Sosial',
      'Seni Musik',
      'Seni Tari',
      'Seni Rupa',
      'Seni Teater',
      'Pendidikan Jasmani, Olahraga dan Kesehatan',
      'Bahasa Inggris',
      'Bahasa Daerah Batak Toba'
    ];
    const standardPilihan = [
      'Seni Musik',
      'Seni Tari',
      'Seni Rupa',
      'Seni Teater'
    ];
    setFormData(prev => ({
      ...prev,
      mata_pelajaran: standardList,
      pilihan_mata_pelajaran: standardPilihan
    }));
    setHighlightedMapelIndices(standardList.map((_, i) => i));
    setTimeout(() => setHighlightedMapelIndices([]), 2500);
    toast.success('Berhasil memuat 12 Mata Pelajaran dari foto lampiran!');
  };

  const addMapel = () => {
    const nextIdx = (formData.mata_pelajaran || []).length;
    setFormData(prev => ({
      ...prev,
      mata_pelajaran: [...(prev.mata_pelajaran || []), '']
    }));
    setHighlightedMapelIndices([nextIdx]);
    setTimeout(() => setHighlightedMapelIndices([]), 2000);
  };

  const updateMapel = (index: number, value: string) => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      const oldValue = newMapel[index];
      newMapel[index] = value;
      let updatedPilihan = [...(prev.pilihan_mata_pelajaran || [])];
      if (oldValue && updatedPilihan.includes(oldValue)) {
        updatedPilihan = updatedPilihan.map(m => m === oldValue ? value : m);
      }
      return { ...prev, mata_pelajaran: newMapel, pilihan_mata_pelajaran: updatedPilihan };
    });
  };

  const removeMapel = (index: number) => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      const oldValue = newMapel[index];
      newMapel.splice(index, 1);
      let updatedPilihan = [...(prev.pilihan_mata_pelajaran || [])];
      if (oldValue) {
        updatedPilihan = updatedPilihan.filter(m => m !== oldValue);
      }
      return { ...prev, mata_pelajaran: newMapel, pilihan_mata_pelajaran: updatedPilihan };
    });
  };

  const moveMapel = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      if (direction === 'up' && index > 0) {
        const temp = newMapel[index];
        newMapel[index] = newMapel[index - 1];
        newMapel[index - 1] = temp;
      } else if (direction === 'down' && index < newMapel.length - 1) {
        const temp = newMapel[index];
        newMapel[index] = newMapel[index + 1];
        newMapel[index + 1] = temp;
      }
      return { ...prev, mata_pelajaran: newMapel };
    });
  };

  const [newKelasInput, setNewKelasInput] = useState('');

  const addKelas = () => {
    const val = newKelasInput.trim();
    if (!val) {
      toast.error('Masukkan nama kelas terlebih dahulu.');
      return;
    }
    const currentList = formData.daftar_kelas || [];
    if (currentList.some(k => k.toLowerCase() === val.toLowerCase())) {
      toast.error(`Kelas '${val}' sudah ada dalam daftar.`);
      return;
    }
    const updated = [...currentList, val];
    setFormData(prev => ({ ...prev, daftar_kelas: updated }));
    setNewKelasInput('');
    toast.success(`Kelas '${val}' berhasil ditambahkan! Silakan klik 'Simpan Pengaturan Database'.`);
  };

  const removeKelas = (kelasName: string) => {
    const currentList = formData.daftar_kelas || [];
    const updated = currentList.filter(k => k !== kelasName);
    setFormData(prev => ({ ...prev, daftar_kelas: updated }));
    toast.success(`Kelas '${kelasName}' dihapus dari daftar.`);
  };

  const handleAuthGoogle = async () => {
    try {
      const result = await googleSignIn();
      if (result?.accessToken) {
        toast.success('Berhasil terhubung ke Akun Google');
      } else {
        toast.error('Batal menghubungkan ke Akun Google');
      }
    } catch (e: any) {
      toast.error('Gagal menghubungkan: ' + e.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'kepsek') {
      toast.error('Akun Kepala Sekolah tidak memiliki hak akses untuk mengubah pengaturan.');
      return;
    }

    const bobotHarian = Number(formData.bobot_harian || 0);
    const bobotTugas = Number(formData.bobot_tugas || 0);
    const bobotUjian = Number(formData.bobot_ujian || 0);
    const totalBobot = bobotHarian + bobotTugas + bobotUjian;

    if (totalBobot !== 100) {
      toast.error(`Total bobot penilaian harus 100%! Saat ini total = ${totalBobot}%. Silakan sesuaikan bobot Harian (${bobotHarian}%), Tugas (${bobotTugas}%), dan Ujian (${bobotUjian}%).`);
      return;
    }

    setIsSaving(true);
    try {
      await store.settings.setItem('app_settings', formData);
      await store.settings.setItem('current', formData);
      setSettings(formData);
      window.dispatchEvent(new Event('data-changed'));
      toast.success('Pengaturan database berhasil disimpan!', { duration: 4000 });
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan pengaturan: ' + (err?.message || 'Error'), { duration: 3000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error('Gagal memverifikasi identitas Anda');
      return;
    }
    setIsSavingRecovery(true);
    try {
      const updated: AppUser = {
        ...currentUser,
        email_pemulihan: userEmail,
        pertanyaan_keamanan: userQuestion,
        jawaban_keamanan: userAnswer,
        updatedAt: new Date().toISOString()
      };
      await store.users.setItem(currentUser.id, updated);
      await store.syncQueue.setItem(`users::${currentUser.id}`, 'updated');
      localStorage.setItem('app_user', JSON.stringify(updated));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      toast.success('Informasi keamanan & pemulihan akun Anda diperbarui');
    } catch (e) {
      console.error(e);
      toast.error('Gagal memperbarui informasi pemulihan');
    } finally {
      setIsSavingRecovery(false);
    }
  };

  return (
    <div className="p-6 md:p-8 text-slate-200 h-full overflow-auto custom-scrollbar space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Top Navigation Tabs Header */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-1.5 rounded-2xl flex flex-wrap gap-1 shadow-md">
          <button
            type="button"
            onClick={() => setActiveTab('umum')}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'umum'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <SettingsIcon size={16} />
            <span>Pengaturan Umum</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <UserPlus size={16} />
            <span>Kelola Akun Pengguna</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900/60 font-mono">
              {users.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'sheets'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Cloud size={16} />
            <span>Firebase Cloud Sync</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'backup'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Database size={16} />
            <span>Backup & Pemulihan</span>
          </button>
        </div>
        {/* TAB 1: PENGATURAN UMUM */}
        {activeTab === 'umum' && (
          <form onSubmit={handleSave} className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
                <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex flex-wrap justify-between items-center gap-2">
                  <span className="flex items-center gap-2">
                    <span>Mata Pelajaran</span>
                    <motion.span 
                      key={formData.mata_pelajaran?.length || 0}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold px-2.5 py-0.5 rounded-full"
                    >
                      {formData.mata_pelajaran?.length || 0} Mapel
                    </motion.span>
                  </span>
                  {role !== 'kepsek' && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={loadStandardMapel} title="Muat 12 Mata Pelajaran dari Foto Lampiran" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 transition-all cursor-pointer font-semibold active:scale-95">
                        <Sparkles size={13} /> Muat Mapel Lampiran
                      </button>
                      <button type="button" onClick={addMapel} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30 transition-all cursor-pointer font-semibold active:scale-95">
                        <Plus size={13} /> Tambah Mapel
                      </button>
                    </div>
                  )}
                </h3>
                
                <div className="space-y-2.5 max-h-96 overflow-y-auto custom-scrollbar pr-2 relative">
                  <AnimatePresence mode="popLayout">
                    {(formData.mata_pelajaran || []).map((mapel, index) => {
                      const isHighlighted = highlightedMapelIndices.includes(index);
                      const isPilihan = (formData.pilihan_mata_pelajaran || []).includes(mapel);
                      return (
                        <motion.div 
                          key={mapel || `mapel-${index}`} 
                          layout
                          initial={{ opacity: 0, y: -12, scale: 0.95 }}
                          animate={{ 
                            opacity: 1, 
                            y: 0, 
                            scale: 1,
                            borderColor: isHighlighted ? 'rgba(129, 140, 248, 0.9)' : 'rgba(51, 65, 85, 0.5)',
                            backgroundColor: isHighlighted ? 'rgba(30, 27, 75, 0.5)' : 'rgba(15, 23, 42, 0.3)'
                          }}
                          exit={{ opacity: 0, scale: 0.9, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
                          transition={{ type: 'spring', stiffness: 450, damping: 28, layout: { duration: 0.22 } }}
                          className={`flex gap-2 items-center p-1.5 rounded-xl border transition-all ${
                            isHighlighted ? 'ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-950/50' : 'hover:border-slate-600/70'
                          }`}
                        >
                          <span className="text-xs font-bold text-slate-500 w-5 text-right shrink-0">{index + 1}.</span>
                          <input 
                            type="text" 
                            value={mapel} 
                            disabled={role === 'kepsek'}
                            onChange={(e) => updateMapel(index, e.target.value)} 
                            placeholder="Nama Mata Pelajaran"
                            className="flex-1 px-3.5 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-xs font-medium transition-all disabled:opacity-50" 
                            required 
                          />
                          <button
                            type="button"
                            disabled={role === 'kepsek'}
                            onClick={() => {
                              let updatedPilihan = [...(formData.pilihan_mata_pelajaran || [])];
                              if (isPilihan) {
                                updatedPilihan = updatedPilihan.filter(m => m !== mapel);
                              } else {
                                updatedPilihan.push(mapel);
                              }
                              setFormData(prev => ({ ...prev, pilihan_mata_pelajaran: updatedPilihan }));
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap min-w-[70px] text-center ${
                              isPilihan
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                            }`}
                          >
                            {isPilihan ? 'Pilihan' : 'Wajib'}
                          </button>
                          {role !== 'kepsek' && (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button type="button" onClick={() => moveMapel(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-indigo-300 disabled:opacity-20 transition-colors cursor-pointer" title="Naikkan">
                                <ChevronUp size={13} />
                              </button>
                              <button type="button" onClick={() => moveMapel(index, 'down')} disabled={index === (formData.mata_pelajaran?.length || 0) - 1} className="p-0.5 text-slate-400 hover:text-indigo-300 disabled:opacity-20 transition-colors cursor-pointer" title="Turunkan">
                                <ChevronDown size={13} />
                              </button>
                            </div>
                          )}
                          {role !== 'kepsek' && (
                            <button type="button" onClick={() => removeMapel(index)} className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer self-center shrink-0" title="Hapus Mapel">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {(formData.mata_pelajaran || []).length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center py-6 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-700/60 space-y-3"
                    >
                      <p className="text-sm text-slate-400 italic">Belum ada mata pelajaran.</p>
                      {role !== 'kepsek' && (
                        <button
                          type="button"
                          onClick={loadStandardMapel}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                        >
                          <Sparkles size={14} /> Muat 12 Mapel Standar (Foto Lampiran)
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
                <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3">Bobot Penilaian Akhir (%)</h3>
                
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Harian</label>
                  <input type="number" disabled={role === 'kepsek'} name="bobot_harian" value={formData.bobot_harian ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Tugas</label>
                  <input type="number" disabled={role === 'kepsek'} name="bobot_tugas" value={formData.bobot_tugas ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Ujian</label>
                  <input type="number" disabled={role === 'kepsek'} name="bobot_ujian" value={formData.bobot_ujian ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl mt-6">
                  <p className="text-sm text-indigo-300">
                    Total Bobot: <span className="font-bold text-indigo-200 text-lg ml-1">{formData.bobot_harian + formData.bobot_tugas + formData.bobot_ujian}%</span>
                  </p>
                  {formData.bobot_harian + formData.bobot_tugas + formData.bobot_ujian !== 100 && (
                    <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      Total bobot harus 100%.
                    </p>
                  )}
                </div>

                {/* KKM Section */}
                <div className="pt-4 border-t border-slate-700/50 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-200">Kriteria Ketuntasan Minimal (KKM)</h4>
                    <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/40 shrink-0">
                      <button
                        type="button"
                        disabled={role === 'kepsek'}
                        onClick={() => setFormData(prev => ({ ...prev, kkm_mode: 'kolektif' }))}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          (formData.kkm_mode || 'kolektif') === 'kolektif'
                            ? 'bg-indigo-500 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Kolektif
                      </button>
                      <button
                        type="button"
                        disabled={role === 'kepsek'}
                        onClick={() => setFormData(prev => ({ ...prev, kkm_mode: 'per_mapel' }))}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          formData.kkm_mode === 'per_mapel'
                            ? 'bg-indigo-500 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Per Mapel
                      </button>
                    </div>
                  </div>

                  {formData.kkm_mode === 'per_mapel' ? (
                    <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-700/40">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400 font-medium">Pengaturan KKM Per Mata Pelajaran</span>
                        <button
                          type="button"
                          disabled={role === 'kepsek'}
                          onClick={() => {
                            const val = prompt('Masukkan KKM untuk diterapkan ke SEMUA mata pelajaran:', String(formData.kkm_bulanan || 75));
                            if (val !== null) {
                              const num = parseInt(val, 10);
                              if (!isNaN(num) && num >= 0 && num <= 100) {
                                const newMap: Record<string, number> = {};
                                (formData.mata_pelajaran || []).forEach(m => { newMap[m] = num; });
                                setFormData(prev => ({ ...prev, kkm_bulanan: num, kkm_per_mapel: newMap }));
                                toast.success(`KKM ${num} diterapkan ke semua mata pelajaran.`);
                              }
                            }
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
                        >
                          Set Sama ke Semua
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                        <AnimatePresence mode="popLayout">
                          {(formData.mata_pelajaran || []).map((mapel) => {
                            const currentKkm = formData.kkm_per_mapel?.[mapel] ?? (formData.kkm_bulanan || 75);
                            return (
                              <motion.div 
                                key={mapel} 
                                layout
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center justify-between bg-slate-800/60 p-2 rounded-lg border border-slate-700/30 gap-2"
                              >
                                <span className="text-xs text-slate-300 font-medium truncate flex-1">{mapel}</span>
                                <input
                                  type="number"
                                  disabled={role === 'kepsek'}
                                  min="0"
                                  max="100"
                                  value={currentKkm}
                                  onChange={(e) => {
                                    let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10);
                                    if (isNaN(v)) v = 0;
                                    if (v > 100) v = 100;
                                    setFormData(prev => ({
                                      ...prev,
                                      kkm_per_mapel: {
                                        ...(prev.kkm_per_mapel || {}),
                                        [mapel]: v
                                      }
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-indigo-300 font-bold outline-none text-center focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                                />
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nilai KKM Kolektif</label>
                      <input
                        type="number"
                        disabled={role === 'kepsek'}
                        name="kkm_bulanan"
                        value={formData.kkm_bulanan ?? 75}
                        onChange={(e) => {
                          let v = parseInt(e.target.value, 10);
                          if (isNaN(v)) v = 0;
                          if (v > 100) v = 100;
                          setFormData(prev => ({ ...prev, kkm_bulanan: v }));
                        }}
                        min="0"
                        max="100"
                        className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Berlaku sebagai KKM standar untuk seluruh mata pelajaran.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* KELOLA DAFTAR KELAS SEKOLAH */}
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-indigo-500/30 backdrop-blur-sm space-y-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 pb-3">
                <div className="flex items-center gap-2">
                  <Table className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-medium text-slate-200">Kelola Daftar Kelas Sekolah</h3>
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold px-2.5 py-0.5 rounded-full">
                    {(formData.daftar_kelas || []).length} Kelas Terdaftar
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Tambah atau hapus daftar kelas yang digunakan untuk filter siswa, presensi harian, jurnal, piket, dan rekap nilai di seluruh aplikasi.
              </p>

              {/* Form Tambah Kelas Baru */}
              {role !== 'kepsek' && (
                <div className="flex items-center gap-2 max-w-lg">
                  <input
                    type="text"
                    value={newKelasInput}
                    onChange={e => setNewKelasInput(e.target.value)}
                    placeholder="Contoh: 7-C, X IPA 1, Kelas VIII B"
                    className="flex-1 px-4 py-2 bg-slate-900/80 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs font-medium"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addKelas();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addKelas}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
                  >
                    <Plus size={15} />
                    <span>Tambah Kelas</span>
                  </button>
                </div>
              )}

              {/* List Kelas Aktif */}
              <div className="flex flex-wrap gap-2.5 pt-2">
                {(formData.daftar_kelas || []).map((kelasItem) => (
                  <div
                    key={kelasItem}
                    className="flex items-center gap-2 px-3.5 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs font-bold text-indigo-200 shadow-sm hover:border-indigo-500/50 transition-all"
                  >
                    <span>{kelasItem}</span>
                    {role !== 'kepsek' && (
                      <button
                        type="button"
                        onClick={() => removeKelas(kelasItem)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                        title={`Hapus kelas ${kelasItem}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* PENGATURAN TRANSKRIPSI SUARA (VOICE SETTINGS) */}
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-indigo-500/30 backdrop-blur-sm space-y-4 shadow-lg">
              <div className="flex items-center gap-3 border-b border-slate-700/50 pb-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  <Mic size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-200">Pengaturan Suara & Transkripsi (Voice Settings)</h3>
                  <p className="text-xs text-slate-400">Pilih bahasa preferensi untuk dikte suara (Voice to Text) yang akan diteruskan ke SpeechRecognition.lang.</p>
                </div>
              </div>

              <div className="max-w-md space-y-2">
                <label className="block text-xs font-semibold text-slate-300">Bahasa Dikte Suara (SpeechRecognition.lang)</label>
                <select
                  value={voiceLang}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setVoiceLang(newLang);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('voice_transcription_lang', newLang);
                    }
                    toast.success(`Bahasa dikte suara diubah ke: ${newLang === 'id-ID' ? 'Bahasa Indonesia' : newLang}`);
                  }}
                  className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  <option value="id-ID">Bahasa Indonesia (id-ID)</option>
                  <option value="en-US">English - United States (en-US)</option>
                  <option value="jv-ID">Bahasa Jawa - Indonesia (jv-ID)</option>
                  <option value="sund-ID">Bahasa Sunda - Indonesia (sund-ID)</option>
                </select>
                <p className="text-[11px] text-indigo-300/80 italic">
                  *Pilihan bahasa ini otomatis aktif saat menekan tombol "Dikte Suara" pada catatan jurnal, pelanggaran, atau observasi siswa.
                </p>
              </div>
            </div>

            {role !== 'kepsek' && (
              <div className="pt-6 border-t border-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-400">
                  {(Number(formData.bobot_harian || 0) + Number(formData.bobot_tugas || 0) + Number(formData.bobot_ujian || 0) !== 100) && (
                    <span className="text-amber-400 flex items-center gap-1.5 font-medium bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                      <AlertTriangle size={14} /> Total bobot penilaian: {Number(formData.bobot_harian || 0) + Number(formData.bobot_tugas || 0) + Number(formData.bobot_ujian || 0)}% (Harus 100%)
                    </span>
                  )}
                </div>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/30 font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Simpan Pengaturan Database</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        )}

        {/* TAB 2: KELOLA AKUN PENGGUNA */}
        {activeTab === 'users' && (
          <div className="space-y-8 animate-fade-in">
            <AdminManagementPanel currentUser={currentUser} />

            {currentUser && (
              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-6">
                <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-400" />
                  Informasi Pemulihan Akun Anda (@{currentUser.username})
                </h3>
                <p className="text-xs text-slate-400">
                  Konfigurasikan email pemulihan dan pertanyaan keamanan Anda di bawah ini agar Anda dapat mereset kata sandi dengan aman jika lupa kredensial login Anda.
                </p>
                <form onSubmit={handleSaveRecovery} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Email Pemulihan</label>
                    <input 
                      type="email" 
                      value={userEmail} 
                      onChange={e => setUserEmail(e.target.value)} 
                      placeholder="Contoh: admin@sekolah.sch.id"
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Pertanyaan Keamanan</label>
                    <select 
                      value={userQuestion} 
                      onChange={e => setUserQuestion(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all"
                    >
                      <option value="Nama SD Pertama Anda?">Nama SD Pertama Anda?</option>
                      <option value="Nama Ibu Kandung Anda?">Nama Ibu Kandung Anda?</option>
                      <option value="Nama Hewan Peliharaan Pertama Anda?">Nama Hewan Peliharaan Pertama Anda?</option>
                      <option value="Kota Kelahiran Anda?">Kota Kelahiran Anda?</option>
                      <option value="Makanan Favorit Anda?">Makanan Favorit Anda?</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Jawaban Keamanan</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={userAnswer} 
                        onChange={e => setUserAnswer(e.target.value)} 
                        placeholder="Masukkan Jawaban Anda"
                        className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                        required
                      />
                      <button 
                        type="submit" 
                        disabled={isSavingRecovery}
                        className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-white font-medium text-sm transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Save size={16} />
                        Simpan
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FIREBASE CLOUD SYNC */}
        {activeTab === 'sheets' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-emerald-500/30 backdrop-blur-sm space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Cloud size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-100">
                        Firebase Realtime Cloud Database
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Real-Time Cloud Firestore Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Menyimpan seluruh perubahan data secara otomatis ke cloud Firebase secara real-time. Data Anda tersimpan aman dan sinkron secara otomatis di semua perangkat.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPushingFirebase}
                    onClick={handleManualFirebasePush}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-600/20 border border-emerald-400/30 shrink-0 disabled:opacity-50"
                  >
                    {isPushingFirebase ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <>
                        <Cloud size={16} />
                        <span>Unggah & Sinkronkan Seluruh Data Lokal ke Cloud</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-slate-400">Status Database:</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Terhubung (Cloud Firestore)
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-slate-400">Mode Sinkronisasi:</span>
                  <span className="font-semibold text-slate-200">Real-Time Listeners</span>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-slate-400">Waktu Terakhir:</span>
                  <span className="font-mono text-slate-300">{fbStatus.lastSyncTime || 'Baru saja'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BACKUP & PEMULIHAN */}
        {activeTab === 'backup' && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                Pencadangan & Pemulihan Manual (Data Master)
              </h3>
              <p className="text-sm text-slate-400">
                Antisipasi kehilangan data dengan mengunduh berkas cadangan (backup) data master secara instan dan realtime ke komputer Anda. Anda dapat memulihkan (import) berkas cadangan kapan saja untuk mengembalikan seluruh data siswa, nilai, dan absensi.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  type="button"
                  onClick={exportMasterBackup}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-indigo-600/10 transition-all cursor-pointer"
                >
                  <Download size={18} />
                  Cadangkan (Export JSON)
                </button>
                
                <div className="flex-1 relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={importMasterBackup}
                    id="import-backup-file"
                    className="hidden"
                  />
                  <label
                    htmlFor="import-backup-file"
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-5 py-3 rounded-xl font-medium border border-slate-600 cursor-pointer text-center transition-all"
                  >
                    <Upload size={18} />
                    Pulihkan (Import JSON)
                  </label>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                * Catatan: Proses pemulihan data akan memperbarui database lokal Anda saat ini. Pastikan berkas cadangan berasal dari aplikasi ini.
              </p>
            </div>

            {/* Database Migration Card (Supabase / MySQL / Cloud SQL) */}
            <div className="bg-gradient-to-r from-indigo-900/40 via-slate-800/40 to-slate-800/40 p-6 rounded-2xl border border-indigo-500/30 backdrop-blur-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 mt-0.5">
                    <Database size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                      Migrasi Database (Supabase / MySQL)
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xl mt-1">
                      Hasilkan skema DDL relasional dan ekspor seluruh data aktif menjadi perintah SQL Insert instan untuk Supabase (PostgreSQL), MySQL, atau Cloud SQL.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMigrationModal(true)}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Database size={16} />
                  <span>Buka Alat Migrasi SQL</span>
                </button>
              </div>
            </div>

            {/* Database Integrity & Background Repair Card */}
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-indigo-500/30 backdrop-blur-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${integrityReport?.isValid !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-200">
                      Integritas & Pemulihan Database (Background Observer)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Sistem pemantau otomatis mengecek struktur data IndexedDB terhadap batasan skema aplikasi.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isCheckingIntegrity}
                    onClick={handleRunIntegrityCheck}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-600 disabled:opacity-50"
                  >
                    <RotateCcw size={14} className={isCheckingIntegrity ? 'animate-spin' : ''} />
                    <span>{isCheckingIntegrity ? 'Memeriksa...' : 'Cek Kesehatan'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRepairingDb}
                    onClick={handleRepairDatabase}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-50 border border-emerald-400/30"
                  >
                    {isRepairingDb ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Memperbaiki...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 size={14} />
                        <span>Perbaiki Database (Repair)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {integrityReport ? (
                <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                  integrityReport.isValid 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-2">
                      {integrityReport.isValid ? (
                        <>
                          <CheckCircle2 size={16} className="text-emerald-400" />
                          <span>Status Database: Sehat &amp; Sesuai Skema</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={16} className="text-rose-400" />
                          <span>Status Database: Ditemukan {integrityReport.anomalyCount} Anomali Skema</span>
                        </>
                      )}
                    </span>
                    <span className="text-[11px] opacity-75 font-mono">
                      Dicek: {new Date(integrityReport.checkedAt).toLocaleTimeString('id-ID')}
                    </span>
                  </div>

                  {integrityReport.issues.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-rose-500/20 space-y-1">
                      <p className="font-semibold text-rose-300">Rincian Anomali Terdeteksi:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-300 font-mono text-[11px] max-h-32 overflow-y-auto">
                        {integrityReport.issues.map((iss, i) => (
                          <li key={i}>{iss}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-amber-300 mt-2 font-sans">
                        💡 Klik tombol <strong>Perbaiki Database (Repair)</strong> di atas untuk secara otomatis memverifikasi dan menyanitasi data IndexedDB tanpa kehilangan akun atau konfigurasi.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Belum ada laporan integritas. Klik "Cek Kesehatan" untuk memulai pemeriksaan.
                </p>
              )}
            </div>

            {/* Total Reset Database & Application Card */}
            <div className="bg-rose-950/20 p-6 rounded-2xl border border-rose-500/30 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-rose-300 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                  Reset Total Database & Aplikasi (Factory Reset)
                </h3>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-semibold px-2.5 py-1 rounded-full border border-rose-500/30">
                  Tindakan Permanen
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Fitur ini akan menghapus <strong>seluruh isi database lokal (IndexedDB)</strong> termasuk data siswa, nilai, absensi, roster, piket, tugas, rapor, serta log sinkronisasi secara permanen sehingga aplikasi dimuat kembali bersih dari awal.
              </p>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetConfirmInput('');
                    setResetResult(null);
                    setShowResetDatabaseModal(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 size={16} />
                  Reset & Bersihkan Seluruh Isi Database
                </button>
              </div>
            </div>
          </div>
        )}



        {showImportConfirmModal && pendingImportJson && (() => {
          const valSummary = validateImportJson(pendingImportJson);
          const filteredIssues = valSummary.issues.filter(issue => {
            if (issueFilterSeverity === 'error' && issue.severity !== 'error') return false;
            if (issueFilterSeverity === 'warning' && issue.severity !== 'warning') return false;
            if (issueFilterCategory !== 'semua' && issue.category !== issueFilterCategory) return false;
            return true;
          });

          return createPortal(
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] overflow-y-auto">
              <div className="bg-slate-900 rounded-2xl border border-slate-700/80 shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden my-auto">
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                      <Database size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        Pratinjau & Validasi Backup JSON
                      </h3>
                      <p className="text-xs text-slate-400">
                        Pemeriksaan integritas field & validasi error sebelum penggabungan ke store lokal
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportConfirmModal(false);
                      setPendingImportJson(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Validation Status Summary Banner */}
                <div className="p-6 bg-slate-950/50 border-b border-slate-800 shrink-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                      <p className="text-xs font-medium text-slate-400">Total Record</p>
                      <p className="text-2xl font-bold text-slate-100 mt-1">{valSummary.totalRecords}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Seluruh entitas dalam file</p>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                      <p className="text-xs font-medium text-slate-400">Status Validasi</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {valSummary.errorsCount === 0 && valSummary.warningsCount === 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold">
                            <CheckCircle2 size={14} /> 100% Valid
                          </span>
                        )}
                        {valSummary.errorsCount === 0 && valSummary.warningsCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold">
                            <AlertTriangle size={14} /> Ada Peringatan
                          </span>
                        )}
                        {valSummary.errorsCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold">
                            <XCircle size={14} /> Ada Error
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {valSummary.errorsCount > 0 ? 'Beberapa record memerlukan perhatian' : 'Data siap digabungkan'}
                      </p>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                      <p className="text-xs font-medium text-slate-400">Jumlah Error</p>
                      <p className={`text-2xl font-bold mt-1 ${valSummary.errorsCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {valSummary.errorsCount}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Field wajib/ID hilang</p>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                      <p className="text-xs font-medium text-slate-400">Peringatan</p>
                      <p className={`text-2xl font-bold mt-1 ${valSummary.warningsCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {valSummary.warningsCount}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Nilai/Atribut tidak lengkap</p>
                    </div>
                  </div>

                  {/* Modal Navigation Tabs */}
                  <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start">
                    <button
                      type="button"
                      onClick={() => setImportPreviewTab('ringkasan')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        importPreviewTab === 'ringkasan'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Ringkasan & Kategori Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportPreviewTab('isu')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        importPreviewTab === 'isu'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Detail Isu Validasi</span>
                      {valSummary.issues.length > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          valSummary.errorsCount > 0 ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950'
                        }`}>
                          {valSummary.issues.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportPreviewTab('raw')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        importPreviewTab === 'raw'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileCode size={14} />
                      <span>Inspeksi Raw JSON</span>
                    </button>
                  </div>
                </div>

                {/* Modal Body Content */}
                <div className="p-6 overflow-y-auto flex-1 min-h-[250px]">
                  {importPreviewTab === 'ringkasan' && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-200">Rincian Komponen Data Backup</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Data Siswa</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.studentsCount} record</p>
                            <p className="text-[11px] text-slate-500 mt-1">Identitas & Rombel</p>
                          </div>
                          <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-semibold">Siswa</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Data Nilai Akademik</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.gradesCount} record</p>
                            <p className="text-[11px] text-slate-500 mt-1">Mata pelajaran & KKM</p>
                          </div>
                          <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-semibold">Nilai</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Data Kehadiran</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.attendanceCount} record</p>
                            <p className="text-[11px] text-slate-500 mt-1">Presensi harian</p>
                          </div>
                          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-semibold">Absensi</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Data Kas Kelas</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.kasCount} record</p>
                            <p className="text-[11px] text-slate-500 mt-1">Uang Masuk & Keluar</p>
                          </div>
                          <span className="p-2 bg-teal-500/10 text-teal-400 rounded-lg text-xs font-semibold">Kas</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Roster Pelajaran</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.rosterCount} jadwal</p>
                            <p className="text-[11px] text-slate-500 mt-1">Jadwal Kelas</p>
                          </div>
                          <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-semibold">Roster</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Piket Kebersihan</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.piketCount} petugas</p>
                            <p className="text-[11px] text-slate-500 mt-1">Petugas Harian</p>
                          </div>
                          <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold">Piket</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Manajemen Tugas</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.tasksCount} tugas</p>
                            <p className="text-[11px] text-slate-500 mt-1">Daftar & Penyerahan</p>
                          </div>
                          <span className="p-2 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-semibold">Tugas</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Jurnal & Pelanggaran</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.jurnalCount} catatan</p>
                            <p className="text-[11px] text-slate-500 mt-1">Kejadian & Poin Sikap</p>
                          </div>
                          <span className="p-2 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-semibold">Jurnal</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Rapor Capaian</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.raporCount} record</p>
                            <p className="text-[11px] text-slate-500 mt-1">Catatan & Perkembangan</p>
                          </div>
                          <span className="p-2 bg-fuchsia-500/10 text-fuchsia-400 rounded-lg text-xs font-semibold">Rapor</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Pengaturan Aplikasi</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.hasSettings ? 'Tersedia' : 'Tidak ada'}</p>
                            <p className="text-[11px] text-slate-500 mt-1">Header & Pemetaan</p>
                          </div>
                          <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-semibold">Config</span>
                        </div>

                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start justify-between">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">Pengguna Sistem</p>
                            <p className="text-xl font-bold text-slate-100 mt-1">{valSummary.usersCount} akun</p>
                            <p className="text-[11px] text-slate-500 mt-1">Manajemen akun</p>
                          </div>
                          <span className="p-2 bg-sky-500/10 text-sky-400 rounded-lg text-xs font-semibold">User</span>
                        </div>
                      </div>

                      <div className="bg-indigo-950/30 p-4 rounded-xl border border-indigo-800/40 text-xs text-indigo-200/90 leading-relaxed space-y-1">
                        <p className="font-semibold text-indigo-300 flex items-center gap-1.5">
                          <CheckCircle2 size={16} /> Informasi Penggabungan Data:
                        </p>
                        <p>
                          File backup JSON ini akan digabungkan (merge) ke dalam penyimpanan IndexedDB komputer Anda. Record dengan ID yang sudah ada akan diperbarui secara otomatis, dan record baru akan ditambahkan tanpa menghapus data penting lainnya.
                        </p>
                      </div>
                    </div>
                  )}

                  {importPreviewTab === 'isu' && (
                    <div className="space-y-4">
                      {/* Filter controls for issues */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2">
                          <Filter size={16} className="text-indigo-400" />
                          <span className="text-xs font-medium text-slate-300">Filter Isu:</span>
                          <select
                            value={issueFilterSeverity}
                            onChange={e => setIssueFilterSeverity(e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="semua">Semua Tingkat (Error & Peringatan)</option>
                            <option value="error">Hanya Error (Kritis)</option>
                            <option value="warning">Hanya Peringatan</option>
                          </select>

                          <select
                            value={issueFilterCategory}
                            onChange={e => setIssueFilterCategory(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="semua">Semua Kategori</option>
                            <option value="Siswa">Siswa</option>
                            <option value="Nilai">Nilai</option>
                            <option value="Absensi">Absensi</option>
                            <option value="Kas">Kas</option>
                            <option value="Roster">Roster</option>
                            <option value="Piket">Piket</option>
                            <option value="Tugas">Tugas</option>
                            <option value="Jurnal">Jurnal</option>
                            <option value="Rapor">Rapor</option>
                            <option value="Pengaturan">Pengaturan</option>
                          </select>
                        </div>

                        <div className="text-xs text-slate-400">
                          Menampilkan <span className="font-bold text-slate-200">{filteredIssues.length}</span> dari {valSummary.issues.length} catatan
                        </div>
                      </div>

                      {filteredIssues.length > 0 ? (
                        <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-950/40">
                          {filteredIssues.map(issue => (
                            <div key={issue.id} className="p-3.5 flex items-start gap-3 hover:bg-slate-800/30 transition-colors">
                              {issue.severity === 'error' ? (
                                <XCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                              ) : (
                                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1 text-xs space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    issue.severity === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}>
                                    {issue.severity.toUpperCase()}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700/60">
                                    {issue.category}
                                  </span>
                                  {issue.recordId && (
                                    <span className="text-slate-400 font-mono text-[11px]">
                                      ID: {issue.recordId}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-200 leading-relaxed font-medium">
                                  {issue.message}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center bg-slate-950/30 rounded-xl border border-dashed border-slate-800 space-y-2">
                          <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
                          <p className="text-sm font-semibold text-slate-200">Tidak ada isu validasi terdeteksi</p>
                          <p className="text-xs text-slate-400">Seluruh struktur file backup memenuhi syarat untuk proses impor data.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {importPreviewTab === 'raw' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <span>Pratinjau Kode JSON (100 Baris Pertama)</span>
                      </div>
                      <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-emerald-400 font-mono overflow-x-auto max-h-[300px] leading-relaxed">
                        {JSON.stringify(pendingImportJson, null, 2).split('\n').slice(0, 100).join('\n')}
                        {JSON.stringify(pendingImportJson, null, 2).split('\n').length > 100 && '\n... (sisanya disembunyikan)'}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-6 border-t border-slate-800 bg-slate-900/90 flex justify-between items-center shrink-0">
                  <p className="text-xs text-slate-400">
                    {valSummary.errorsCount > 0 ? '⚠️ File memiliki beberapa error, namun record valid tetap dapat dipulihkan.' : '✓ Data terverifikasi dan siap diimpor.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportConfirmModal(false);
                        setPendingImportJson(null);
                      }}
                      disabled={isImporting}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={executeImport}
                      disabled={isImporting}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-600/30"
                    >
                      {isImporting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Memproses Impor...</span>
                        </>
                      ) : (
                        <>
                          <Database size={16} />
                          <span>Ya, Gabungkan & Pulihkan Data</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

        {/* Modal Konfirmasi Reset Total Database */}
        {showResetDatabaseModal && createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
            <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200 my-auto max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-100">Konfirmasi Reset Database</h3>
                    <p className="text-xs text-rose-400 font-medium">
                      {isResetting ? 'Proses pembersihan sedang berjalan...' : 'Tindakan ini tidak dapat dibatalkan!'}
                    </p>
                  </div>
                </div>
                {!isResetting && (
                  <button
                    type="button"
                    onClick={() => setShowResetDatabaseModal(false)}
                    className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {resetVerificationResult ? (
                resetVerificationResult.isClean ? (
                  <div className="py-6 px-2 text-center space-y-5 animate-in fade-in zoom-in duration-200">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 size={36} />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-slate-100">Database 100% Bersih &amp; Kosong Total!</h4>
                      <p className="text-xs text-emerald-400 font-medium">
                        Hasil Verifikasi: 0 Dokumen Sisa di Firestore. Seluruh data telah terhapus sempurna.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-left text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 size={14} /> Cloud Firestore (Verifikasi Server):
                        </span>
                        <span className="font-bold text-emerald-300">0 Dokumen Tersisa (Terverifikasi Clean)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 size={14} /> Total Dokumen Dihapus:
                        </span>
                        <span className="font-bold text-emerald-300">{resetResult?.totalDeleted || 0} Dokumen</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 size={14} /> IndexedDB (Siswa, Nilai, dll):
                        </span>
                        <span className="font-bold text-emerald-300">0 Data Tersisa (Kosong Total)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 size={14} /> Browser Storage:
                        </span>
                        <span className="font-bold text-emerald-300">Bersih Total</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-[11px] leading-relaxed">
                      Sistem sudah siap dari kondisi bersih. Klik tombol di bawah ini untuk memuat ulang halaman aplikasi.
                    </div>

                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new Event('data-changed'));
                          toast.success('State aplikasi telah dibersihkan & diperbarui');
                        }}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-2"
                      >
                        <RefreshCw size={14} />
                        <span>Selesai &amp; Perbarui Tampilan</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 px-2 text-center space-y-5 animate-in fade-in zoom-in duration-200">
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
                      <AlertTriangle size={36} />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-amber-400">Terdapat data residu, harap ulangi proses</h4>
                      <p className="text-xs text-rose-300 font-medium">
                        Sistem mendeteksi masih ada {resetVerificationResult.residualCount} dokumen sisa di Cloud Firestore.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 text-left text-xs font-mono space-y-2">
                      <div className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <AlertCircle size={14} /> Koleksi Residu Terdeteksi:
                      </div>
                      {resetVerificationResult.residualCollections.map((col, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-rose-300 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                          <XCircle size={14} className="text-rose-400 shrink-0" />
                          <span>{col}</span>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-[11px] leading-relaxed">
                      Anda dapat mencoba pembersihan paksa (Force Clear) untuk menghapus seluruh koleksi sisa secara menyeluruh.
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleForceClearDatabase}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
                      >
                        <ShieldAlert size={16} />
                        <span>Coba Pembersihan Paksa (Force Clear)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowResetDatabaseModal(false)}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all cursor-pointer w-full"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                )
              ) : isResetting ? (
                <div className="py-8 px-4 text-center space-y-5">
                  <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-rose-500/20 animate-ping" />
                    <div className="w-16 h-16 rounded-full border-4 border-rose-500/30 border-t-rose-500 animate-spin" />
                    <Trash2 size={24} className="text-rose-400 absolute animate-bounce" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base font-bold text-slate-100">Proses Membersihkan Database Berlangsung...</h4>
                    <p className="text-xs text-rose-300 max-w-md mx-auto leading-relaxed">
                      Aplikasi sedang berkomunikasi dengan server Cloud Firestore untuk menghapus koleksi data siswa &amp; data terkait, serta mengosongkan IndexedDB lokal secara permanen.
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-rose-400 shrink-0" />
                    <span>Mohon tunggu sebentar, jangan menutup halaman ini agar data terhapus bersih tanpa sisa...</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                    <p>
                      Apakah Anda yakin ingin mengosongkan dan membersihkan <strong>seluruh isi database</strong> lokal dan Cloud Firestore?
                    </p>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-slate-400 font-mono text-[11px]">
                      <p>❌ Seluruh Data Siswa &amp; Pengguna</p>
                      <p>❌ Seluruh Rekap Nilai &amp; Absensi</p>
                      <p>❌ Jadwal Roster &amp; Petugas Piket</p>
                      <p>❌ Catatan Rapor &amp; Pengaturan Kelas</p>
                    </div>

                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-200 text-[11px] space-y-1">
                      <p className="font-bold text-indigo-300">💡 Info Server Cloud Firestore:</p>
                      <p>• Seluruh dokumen di koleksi Cloud Firestore server akan dihapus total bersamaan dengan data lokal agar tidak terjadi konflik atau data sisa.</p>
                    </div>

                    <div className="pt-2 space-y-1.5">
                      <label className="block font-semibold text-slate-200 text-xs">
                        Ketik kata <strong className="text-rose-400 font-mono">RESET</strong> di bawah ini untuk melanjutkan:
                      </label>
                      <input
                        type="text"
                        value={resetConfirmInput}
                        onChange={(e) => setResetConfirmInput(e.target.value)}
                        placeholder="Ketik RESET"
                        disabled={isResetting}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-rose-300 font-mono tracking-widest focus:ring-2 focus:ring-rose-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowResetDatabaseModal(false)}
                      disabled={isResetting}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteResetDatabase}
                      disabled={isResetting || resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer flex items-center gap-2"
                    >
                      <RotateCcw size={14} />
                      <span>Ya, Bersihkan Database Total</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
        <DatabaseMigrationModal isOpen={showMigrationModal} onClose={() => setShowMigrationModal(false)} />
      </div>
    </div>
  );
}
