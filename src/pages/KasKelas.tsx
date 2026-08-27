import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Plus, 
  Minus, 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  Printer, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  ChevronDown, 
  DollarSign, 
  BarChart2, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Check, 
  X,
  CreditCard,
  Building,
  UserCheck,
  History,
  Clock,
  Activity,
  Eye,
  Info,
  User
} from 'lucide-react';
import { store, KasEntry, KasActivityLog, Student, Settings } from '../lib/store';
import toast from 'react-hot-toast';
import BackgroundDataBanner from '../components/BackgroundDataBanner';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

interface KasKelasProps {
  role: 'guru' | 'kepsek';
  semester: string;
  settings: Settings | null;
}

export default function KasKelas({ role, semester, settings }: KasKelasProps) {
  const [kasEntries, setKasEntries] = useState<KasEntry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab State
  const [activeTab, setActiveTab] = useState<'transaksi' | 'masuk' | 'massal' | 'keluar' | 'rekap' | 'log'>('transaksi');

  // Activity Logs States
  const [kasLogs, setKasLogs] = useState<KasActivityLog[]>([]);
  const [selectedEntryLogs, setSelectedEntryLogs] = useState<{ entry: KasEntry; logs: KasActivityLog[] } | null>(null);
  const [filterLogAction, setFilterLogAction] = useState<'semua' | 'create' | 'update' | 'delete'>('semua');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenis, setFilterJenis] = useState<'semua' | 'masuk' | 'keluar'>('semua');
  const [filterKategori, setFilterKategori] = useState<string>('semua');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterKelas, setFilterKelas] = useState<string>('semua');

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const assignedClassesKey = assignedClasses.join(',');
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    if (isRestrictedClass && assignedClasses.length > 0) {
      if (filterKelas === 'semua' || !assignedClasses.some(c => c.toLowerCase() === filterKelas.toLowerCase())) {
        if (assignedClasses[0] && filterKelas !== assignedClasses[0]) {
          setFilterKelas(assignedClasses[0]);
        }
      }
    }
  }, [isRestrictedClass, assignedClassesKey]);

  // Print Modal States
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printStartDate, setPrintStartDate] = useState<string>('');
  const [printEndDate, setPrintEndDate] = useState<string>('');
  const [printJenis, setPrintJenis] = useState<'semua' | 'masuk' | 'keluar'>('semua');
  const [printKategori, setPrintKategori] = useState<string>('semua');

  // Form States - Uang Masuk / Single
  const [singleStudentId, setSingleStudentId] = useState('');
  const [singleTanggal, setSingleTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [singleNominal, setSingleNominal] = useState<number | ''>(5000);
  const [singleKategori, setSingleKategori] = useState('Iuran Wajib Kas');
  const [singleMetode, setSingleMetode] = useState<'Tunai' | 'Transfer' | 'QRIS' | 'Lainnya'>('Tunai');
  const [singleKeterangan, setSingleKeterangan] = useState('');

  // Form States - Uang Masuk / Batch Massal
  const [batchTanggal, setBatchTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [batchNominal, setBatchNominal] = useState<number>(2000);
  const [batchKategori, setBatchKategori] = useState('Iuran Wajib Mingguan');
  const [batchKeterangan, setBatchKeterangan] = useState('Iuran Kas Mingguan');
  const [batchSelectedStudents, setBatchSelectedStudents] = useState<Record<string, boolean>>({});

  // Form States - Pengeluaran
  const [expTanggal, setExpTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [expNominal, setExpNominal] = useState<number | ''>('');
  const [expKategori, setExpKategori] = useState('Perlengkapan Kelas');
  const [expKeterangan, setExpKeterangan] = useState('');
  const [expPencatat, setExpPencatat] = useState(settings?.nama_wali_kelas || 'Pengurus Kelas');

  // Edit & Delete State
  const [editingEntry, setEditingEntry] = useState<KasEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<KasEntry | null>(null);

  // Target Iuran Settings (Local state with fallback)
  const [targetIuranPerMinggu, setTargetIuranPerMinggu] = useState<number>(2000);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load kas entries
      const kasKeys = await store.kas.keys();
      const kasList = await Promise.all(kasKeys.map(k => store.kas.getItem<KasEntry>(k)));
      const validKas = kasList.filter(Boolean) as KasEntry[];
      const userFilteredKas = filterRecordsForUser(currentUser, validKas);
      setKasEntries(userFilteredKas);

      // Load students
      const studKeys = await store.students.keys();
      const studList = await Promise.all(studKeys.map(k => store.students.getItem<Student>(k)));
      const validStuds = studList.filter(Boolean) as Student[];
      const userFilteredStuds = filterStudentsForUser(currentUser, validStuds);
      const sortedStuds = userFilteredStuds.sort((a, b) => (a.no || 0) - (b.no || 0));
      setStudents(sortedStuds);

      // Pre-select all students for batch payment default
      const defaultSelected: Record<string, boolean> = {};
      sortedStuds.forEach(s => {
        defaultSelected[s.id] = true;
      });
      setBatchSelectedStudents(defaultSelected);

      // Load kas activity logs
      const logKeys = await store.kasLogs.keys();
      const rawLogs = await Promise.all(logKeys.map(k => store.kasLogs.getItem<KasActivityLog>(k)));
      const validLogs = rawLogs.filter(Boolean) as KasActivityLog[];
      validLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setKasLogs(validLogs);

    } catch (err) {
      console.error('Failed to load Kas data:', err);
      toast.error('Gagal memuat data Kas Kelas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleDataChange = () => loadData();
    window.addEventListener('data-changed', handleDataChange);
    window.addEventListener('apply-buffered-data', handleDataChange);
    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      window.removeEventListener('apply-buffered-data', handleDataChange);
    };
  }, []);

  // Filtered Entries
  const filteredEntries = useMemo(() => {
    return kasEntries.filter(entry => {
      // Semester Filter (if defined)
      if (semester && entry.semester && entry.semester !== semester) {
        return false;
      }
      // Jenis Filter
      if (filterJenis !== 'semua' && entry.jenis !== filterJenis) {
        return false;
      }
      // Kategori Filter
      if (filterKategori !== 'semua' && entry.kategori !== filterKategori) {
        return false;
      }
      // Kelas Filter
      if (filterKelas !== 'semua' && entry.kelas && entry.kelas !== filterKelas) {
        return false;
      }
      // Date Range Filter
      if (startDate && entry.tanggal < startDate) {
        return false;
      }
      if (endDate && entry.tanggal > endDate) {
        return false;
      }
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKet = entry.keterangan?.toLowerCase().includes(q);
        const matchKat = entry.kategori?.toLowerCase().includes(q);
        const matchSis = entry.nama_siswa?.toLowerCase().includes(q);
        const matchNom = entry.nominal?.toString().includes(q);
        if (!matchKet && !matchKat && !matchSis && !matchNom) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [kasEntries, semester, filterJenis, filterKategori, filterKelas, startDate, endDate, searchQuery]);

  // Total Calculations
  const totalPemasukan = useMemo(() => {
    return kasEntries
      .filter(e => e.jenis === 'masuk' && (!semester || e.semester === semester))
      .reduce((acc, curr) => acc + (Number(curr.nominal) || 0), 0);
  }, [kasEntries, semester]);

  const totalPengeluaran = useMemo(() => {
    return kasEntries
      .filter(e => e.jenis === 'keluar' && (!semester || e.semester === semester))
      .reduce((acc, curr) => acc + (Number(curr.nominal) || 0), 0);
  }, [kasEntries, semester]);

  const saldoKas = totalPemasukan - totalPengeluaran;

  // Student Summary for Rekap
  const studentKasSummary = useMemo(() => {
    const summaryMap: Record<string, { student: Student; totalMasuk: number; countMasuk: number; lastPaidDate: string }> = {};

    students.forEach(s => {
      summaryMap[s.id] = {
        student: s,
        totalMasuk: 0,
        countMasuk: 0,
        lastPaidDate: '-'
      };
    });

    kasEntries.forEach(entry => {
      if (entry.jenis === 'masuk' && entry.id_siswa && summaryMap[entry.id_siswa]) {
        summaryMap[entry.id_siswa].totalMasuk += Number(entry.nominal) || 0;
        summaryMap[entry.id_siswa].countMasuk += 1;
        if (summaryMap[entry.id_siswa].lastPaidDate === '-' || entry.tanggal > summaryMap[entry.id_siswa].lastPaidDate) {
          summaryMap[entry.id_siswa].lastPaidDate = entry.tanggal;
        }
      }
    });

    return Object.values(summaryMap).sort((a, b) => (a.student.no || 0) - (b.student.no || 0));
  }, [students, kasEntries]);

  // Chart Timeframe Filter State
  const [chartTimeframe, setChartTimeframe] = useState<'harian' | 'mingguan' | 'bulanan'>('bulanan');

  // Dynamic Chart Data Preparation (Harian, Mingguan, Bulanan)
  const dynamicChartData = useMemo(() => {
    if (chartTimeframe === 'harian') {
      const dailyMap: Record<string, { label: string; Pemasukan: number; Pengeluaran: number }> = {};
      kasEntries.forEach(e => {
        if (!e.tanggal) return;
        const d = e.tanggal;
        if (!dailyMap[d]) {
          const dt = new Date(d + 'T00:00:00');
          const label = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
          dailyMap[d] = { label, Pemasukan: 0, Pengeluaran: 0 };
        }
        if (e.jenis === 'masuk') dailyMap[d].Pemasukan += Number(e.nominal) || 0;
        else dailyMap[d].Pengeluaran += Number(e.nominal) || 0;
      });
      return Object.keys(dailyMap).sort().slice(-14).map(k => dailyMap[k]);
    } else if (chartTimeframe === 'mingguan') {
      const weeklyMap: Record<string, { label: string; Pemasukan: number; Pengeluaran: number }> = {};
      kasEntries.forEach(e => {
        if (!e.tanggal) return;
        const dt = new Date(e.tanggal + 'T00:00:00');
        const year = dt.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const pastDays = Math.floor((dt.getTime() - startOfYear.getTime()) / 86400000);
        const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
        const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
        const label = `Mg ${weekNum}`;
        if (!weeklyMap[key]) {
          weeklyMap[key] = { label, Pemasukan: 0, Pengeluaran: 0 };
        }
        if (e.jenis === 'masuk') weeklyMap[key].Pemasukan += Number(e.nominal) || 0;
        else weeklyMap[key].Pengeluaran += Number(e.nominal) || 0;
      });
      return Object.keys(weeklyMap).sort().slice(-10).map(k => weeklyMap[k]);
    } else {
      const monthlyMap: Record<string, { label: string; Pemasukan: number; Pengeluaran: number }> = {};
      kasEntries.forEach(e => {
        if (!e.tanggal) return;
        const monthYear = e.tanggal.substring(0, 7);
        if (!monthlyMap[monthYear]) {
          const d = new Date(e.tanggal + 'T00:00:00');
          const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
          monthlyMap[monthYear] = { label, Pemasukan: 0, Pengeluaran: 0 };
        }
        if (e.jenis === 'masuk') monthlyMap[monthYear].Pemasukan += Number(e.nominal) || 0;
        else monthlyMap[monthYear].Pengeluaran += Number(e.nominal) || 0;
      });
      return Object.keys(monthlyMap).sort().map(k => monthlyMap[k]);
    }
  }, [kasEntries, chartTimeframe]);

  const categoryPieData = useMemo(() => {
    const catMap: Record<string, number> = {};
    kasEntries.forEach(e => {
      if (e.jenis === 'keluar') {
        const cat = e.kategori || 'Lainnya';
        catMap[cat] = (catMap[cat] || 0) + (Number(e.nominal) || 0);
      }
    });
    return Object.entries(catMap).map(([name, value]) => ({ name, value }));
  }, [kasEntries]);

  const PIE_COLORS = ['#38bdf8', '#818cf8', '#f43f5e', '#fbbf24', '#34d399', '#c084fc'];

  // Helper to fetch/synthesize logs for an entry
  const getItemLogs = (entry: KasEntry): KasActivityLog[] => {
    if (entry.history && entry.history.length > 0) {
      return entry.history;
    }
    const matching = kasLogs.filter(l => l.kas_id === entry.id);
    if (matching.length > 0) {
      return matching;
    }
    return [{
      id: 'syn-' + entry.id,
      kas_id: entry.id,
      timestamp: entry.created_at || (entry.tanggal + 'T08:00:00.000Z'),
      action: 'create',
      action_label: 'Menginput',
      user: entry.penerima_pencatat || (role === 'kepsek' ? 'Kepala Sekolah' : settings?.nama_wali_kelas || 'Wali Kelas / Pengurus'),
      user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
      keterangan_transaksi: entry.keterangan,
      nominal: entry.nominal,
      jenis: entry.jenis,
      details: `Diinput awal pada ${entry.tanggal} oleh ${entry.penerima_pencatat || 'Sistem'}`
    }];
  };

  const filteredLogs = useMemo(() => {
    return kasLogs.filter(log => {
      if (filterLogAction !== 'semua' && log.action !== filterLogAction) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const matchUser = log.user?.toLowerCase().includes(q);
        const matchKet = log.keterangan_transaksi?.toLowerCase().includes(q);
        const matchDet = log.details?.toLowerCase().includes(q);
        const matchNom = log.nominal?.toString().includes(q);
        if (!matchUser && !matchKet && !matchDet && !matchNom) return false;
      }
      return true;
    });
  }, [kasLogs, filterLogAction, logSearchQuery]);

  // Submit Uang Masuk (Single)
  const handleSaveSinglePemasukan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleNominal || Number(singleNominal) <= 0) {
      toast.error('Masukkan nominal uang yang valid');
      return;
    }
    const student = students.find(s => s.id === singleStudentId);
    const currentUser = settings?.nama_wali_kelas || (role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas / Pengurus');

    const entryId = uuidv4();
    const logId = uuidv4();

    const initialLog: KasActivityLog = {
      id: logId,
      kas_id: entryId,
      timestamp: new Date().toISOString(),
      action: 'create',
      action_label: 'Menginput',
      user: currentUser,
      user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
      keterangan_transaksi: singleKeterangan || `Pembayaran Kas dari ${student ? student.nama : 'Siswa'}`,
      nominal: Number(singleNominal),
      jenis: 'masuk',
      details: `Menginput Uang Masuk Rp ${Number(singleNominal).toLocaleString('id-ID')} (${singleKategori}) ${student ? `untuk ${student.nama}` : ''}`
    };

    const newEntry: KasEntry = {
      id: entryId,
      jenis: 'masuk',
      tanggal: singleTanggal,
      nominal: Number(singleNominal),
      kategori: singleKategori,
      keterangan: singleKeterangan || `Pembayaran Kas dari ${student ? student.nama : 'Siswa'}`,
      id_siswa: singleStudentId || undefined,
      nama_siswa: student ? student.nama : undefined,
      kelas: student ? student.kelas : (settings?.nama_kelas || '1'),
      semester: semester || 'Ganjil 2026',
      penerima_pencatat: currentUser,
      metode_pembayaran: singleMetode,
      created_at: new Date().toISOString(),
      history: [initialLog]
    };

    try {
      await store.kas.setItem(newEntry.id, newEntry);
      await store.kasLogs.setItem(logId, initialLog);
      await store.syncQueue.setItem(`kas::${newEntry.id}`, 'updated');
      toast.success(`Uang masuk Kas Rp ${Number(singleNominal).toLocaleString('id-ID')} berhasil dicatat!`);
      setSingleNominal('');
      setSingleKeterangan('');
      setActiveTab('transaksi');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      loadData();
    } catch (err) {
      toast.error('Gagal menyimpan catatan kas');
    }
  };

  // Submit Uang Masuk (Batch / Massal)
  const handleSaveBatchPemasukan = async () => {
    const selectedStudentIds = Object.keys(batchSelectedStudents).filter(id => batchSelectedStudents[id]);
    if (selectedStudentIds.length === 0) {
      toast.error('Pilih setidaknya satu siswa untuk pencatatan massal');
      return;
    }
    if (!batchNominal || batchNominal <= 0) {
      toast.error('Masukkan nominal iuran massal yang valid');
      return;
    }
    const currentUser = settings?.nama_wali_kelas || (role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas / Pengurus');

    try {
      let savedCount = 0;
      for (const studentId of selectedStudentIds) {
        const student = students.find(s => s.id === studentId);
        if (!student) continue;

        const entryId = uuidv4();
        const logId = uuidv4();

        const initialLog: KasActivityLog = {
          id: logId,
          kas_id: entryId,
          timestamp: new Date().toISOString(),
          action: 'create',
          action_label: 'Menginput',
          user: currentUser,
          user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
          keterangan_transaksi: `${batchKeterangan} - ${student.nama}`,
          nominal: Number(batchNominal),
          jenis: 'masuk',
          details: `Menginput Iuran Massal Kelas Rp ${Number(batchNominal).toLocaleString('id-ID')} untuk siswa ${student.nama}`
        };

        const newEntry: KasEntry = {
          id: entryId,
          jenis: 'masuk',
          tanggal: batchTanggal,
          nominal: Number(batchNominal),
          kategori: batchKategori,
          keterangan: `${batchKeterangan} - ${student.nama}`,
          id_siswa: student.id,
          nama_siswa: student.nama,
          kelas: student.kelas || settings?.nama_kelas || '1',
          semester: semester || 'Ganjil 2026',
          penerima_pencatat: currentUser,
          metode_pembayaran: 'Tunai',
          created_at: new Date().toISOString(),
          history: [initialLog]
        };

        await store.kas.setItem(newEntry.id, newEntry);
        await store.kasLogs.setItem(logId, initialLog);
        await store.syncQueue.setItem(`kas::${newEntry.id}`, 'updated');
        savedCount++;
      }

      toast.success(`Berhasil mencatat iuran kas massal untuk ${savedCount} siswa!`);
      setActiveTab('transaksi');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      loadData();
    } catch (err) {
      toast.error('Gagal memproses pencatatan iuran massal');
    }
  };

  // Submit Pengeluaran
  const handleSavePengeluaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expNominal || Number(expNominal) <= 0) {
      toast.error('Masukkan nominal pengeluaran yang valid');
      return;
    }
    if (Number(expNominal) > saldoKas) {
      toast.error(`Pengeluaran (Rp ${Number(expNominal).toLocaleString('id-ID')}) melebihi total saldo kas saat ini (Rp ${saldoKas.toLocaleString('id-ID')})`);
      return;
    }
    if (!expKeterangan.trim()) {
      toast.error('Masukkan keterangan / keperluan pengeluaran');
      return;
    }
    const currentUser = expPencatat || settings?.nama_wali_kelas || (role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas');

    const entryId = uuidv4();
    const logId = uuidv4();

    const initialLog: KasActivityLog = {
      id: logId,
      kas_id: entryId,
      timestamp: new Date().toISOString(),
      action: 'create',
      action_label: 'Menginput',
      user: currentUser,
      user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
      keterangan_transaksi: expKeterangan.trim(),
      nominal: Number(expNominal),
      jenis: 'keluar',
      details: `Menginput Pengeluaran Kas Rp ${Number(expNominal).toLocaleString('id-ID')} (${expKategori})`
    };

    const newEntry: KasEntry = {
      id: entryId,
      jenis: 'keluar',
      tanggal: expTanggal,
      nominal: Number(expNominal),
      kategori: expKategori,
      keterangan: expKeterangan.trim(),
      kelas: settings?.nama_kelas || '1',
      semester: semester || 'Ganjil 2026',
      penerima_pencatat: currentUser,
      created_at: new Date().toISOString(),
      history: [initialLog]
    };

    try {
      await store.kas.setItem(newEntry.id, newEntry);
      await store.kasLogs.setItem(logId, initialLog);
      await store.syncQueue.setItem(`kas::${newEntry.id}`, 'updated');
      toast.success(`Pengeluaran Kas Rp ${Number(expNominal).toLocaleString('id-ID')} berhasil dicatat!`);
      setExpNominal('');
      setExpKeterangan('');
      setActiveTab('transaksi');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      loadData();
    } catch (err) {
      toast.error('Gagal menyimpan pengeluaran kas');
    }
  };

  // Delete Entry Modal Action
  const handleConfirmDeleteEntry = async () => {
    if (!deletingEntry) return;
    const currentUser = settings?.nama_wali_kelas || (role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas');
    const logId = uuidv4();

    const deleteLog: KasActivityLog = {
      id: logId,
      kas_id: deletingEntry.id,
      timestamp: new Date().toISOString(),
      action: 'delete',
      action_label: 'Menghapus',
      user: currentUser,
      user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
      keterangan_transaksi: deletingEntry.keterangan,
      nominal: deletingEntry.nominal,
      jenis: deletingEntry.jenis,
      details: `Menghapus transaksi Kas (${deletingEntry.jenis === 'masuk' ? 'Uang Masuk' : 'Pengeluaran'}) Rp ${deletingEntry.nominal?.toLocaleString('id-ID')} [${deletingEntry.keterangan}]`
    };

    try {
      await store.kasLogs.setItem(logId, deleteLog);
      await store.kas.removeItem(deletingEntry.id);
      await store.syncQueue.setItem(`kas::${deletingEntry.id}`, 'deleted');
      toast.success('Catatan transaksi kas berhasil dihapus');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      setDeletingEntry(null);
      loadData();
    } catch (err) {
      toast.error('Gagal menghapus catatan kas');
    }
  };

  // Edit Entry Handlers
  const [editTanggal, setEditTanggal] = useState('');
  const [editJenis, setEditJenis] = useState<'masuk' | 'keluar'>('masuk');
  const [editNominal, setEditNominal] = useState<number | ''>('');
  const [editKategori, setEditKategori] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [editNamaSiswa, setEditNamaSiswa] = useState('');

  const handleStartEdit = (entry: KasEntry) => {
    setEditingEntry(entry);
    setEditTanggal(entry.tanggal || new Date().toISOString().split('T')[0]);
    setEditJenis(entry.jenis || 'masuk');
    setEditNominal(entry.nominal || 0);
    setEditKategori(entry.kategori || 'Iuran Wajib Kas');
    setEditKeterangan(entry.keterangan || '');
    setEditNamaSiswa(entry.nama_siswa || '');
  };

  const handleSaveEditEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    if (!editNominal || Number(editNominal) <= 0) {
      toast.error('Masukkan nominal transaksi kas yang valid');
      return;
    }
    if (editJenis === 'keluar') {
      const currentAvailable = saldoKas + (editingEntry.jenis === 'keluar' ? (editingEntry.nominal || 0) : -(editingEntry.nominal || 0));
      if (Number(editNominal) > currentAvailable) {
        toast.error(`Nominal pengeluaran (Rp ${Number(editNominal).toLocaleString('id-ID')}) melebihi saldo kas yang tersedia (Rp ${currentAvailable.toLocaleString('id-ID')})`);
        return;
      }
    }
    if (!editKeterangan.trim()) {
      toast.error('Masukkan keterangan transaksi kas');
      return;
    }

    const currentUser = settings?.nama_wali_kelas || (role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas');
    const changes: string[] = [];

    if (editingEntry.nominal !== Number(editNominal)) {
      changes.push(`Nominal: Rp ${editingEntry.nominal?.toLocaleString('id-ID')} ➔ Rp ${Number(editNominal).toLocaleString('id-ID')}`);
    }
    if (editingEntry.keterangan !== editKeterangan.trim()) {
      changes.push(`Keterangan: "${editingEntry.keterangan}" ➔ "${editKeterangan.trim()}"`);
    }
    if (editingEntry.tanggal !== editTanggal) {
      changes.push(`Tanggal: ${editingEntry.tanggal} ➔ ${editTanggal}`);
    }
    if (editingEntry.kategori !== editKategori) {
      changes.push(`Kategori: ${editingEntry.kategori} ➔ ${editKategori}`);
    }

    const detailsStr = changes.length > 0 ? changes.join('; ') : 'Pembaruan rincian data transaksi';
    const logId = uuidv4();

    const editLog: KasActivityLog = {
      id: logId,
      kas_id: editingEntry.id,
      timestamp: new Date().toISOString(),
      action: 'update',
      action_label: 'Mengedit',
      user: currentUser,
      user_role: role === 'kepsek' ? 'Kepala Sekolah' : 'Wali Kelas',
      keterangan_transaksi: editKeterangan.trim(),
      nominal: Number(editNominal),
      jenis: editJenis,
      details: `Mengedit data: ${detailsStr}`
    };

    const updated: KasEntry = {
      ...editingEntry,
      tanggal: editTanggal,
      jenis: editJenis,
      nominal: Number(editNominal),
      kategori: editKategori,
      keterangan: editKeterangan.trim(),
      nama_siswa: editJenis === 'masuk' ? editNamaSiswa.trim() : undefined,
      updated_at: new Date().toISOString(),
      last_modified_by: currentUser,
      history: [...(editingEntry.history || []), editLog]
    };

    try {
      await store.kas.setItem(editingEntry.id, updated);
      await store.kasLogs.setItem(logId, editLog);
      await store.syncQueue.setItem(`kas::${editingEntry.id}`, 'updated');
      toast.success('Transaksi kas berhasil diperbarui');
      setEditingEntry(null);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      loadData();
    } catch (err) {
      toast.error('Gagal memperbarui transaksi kas');
    }
  };

  // Print Laporan Kas (Window.print PDF formatting)
  const handlePrintKasReport = (
    optStartDate = printStartDate || startDate,
    optEndDate = printEndDate || endDate,
    optJenis = printJenis || filterJenis,
    optKategori = printKategori || filterKategori
  ) => {
    // Filter entries specifically for report
    const reportEntries = kasEntries.filter(e => {
      if (semester && e.semester && e.semester !== semester) return false;
      if (optJenis !== 'semua' && e.jenis !== optJenis) return false;
      if (optKategori !== 'semua' && e.kategori !== optKategori) return false;
      if (optStartDate && e.tanggal < optStartDate) return false;
      if (optEndDate && e.tanggal > optEndDate) return false;
      return true;
    }).sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

    if (reportEntries.length === 0) {
      toast.error('Tidak ada data transaksi kas yang sesuai dengan filter cetak.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Gagal membuka jendela cetak. Izinkan pop-up pada browser Anda.');
      return;
    }

    const schoolName = settings?.nama_sekolah || 'SEKOLAH DASAR / MENENGAH';
    const schoolAddress = settings?.alamat || 'Jl. Pendidikan No. 1';
    const currentKelas = settings?.nama_kelas || '1';

    let rPemasukan = 0;
    let rPengeluaran = 0;

    let runningBalance = 0;
    const entriesRows = reportEntries.map((e, idx) => {
      const isMasuk = e.jenis === 'masuk';
      const nom = Number(e.nominal) || 0;
      if (isMasuk) {
        rPemasukan += nom;
        runningBalance += nom;
      } else {
        rPengeluaran += nom;
        runningBalance -= nom;
      }

      return `
        <tr>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${e.tanggal}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${isMasuk ? '#059669' : '#dc2626'};">
            ${isMasuk ? 'UANG MASUK' : 'PENGELUARAN'}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${e.kategori || '-'}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${e.keterangan || '-'} ${e.nama_siswa ? `(${e.nama_siswa})` : ''}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; color: #059669; font-weight: bold;">
            ${isMasuk ? `Rp ${nom.toLocaleString('id-ID')}` : '-'}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; color: #dc2626; font-weight: bold;">
            ${!isMasuk ? `Rp ${nom.toLocaleString('id-ID')}` : '-'}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">
            Rp ${runningBalance.toLocaleString('id-ID')}
          </td>
        </tr>
      `;
    }).join('');

    const jenisLabel = optJenis === 'masuk' ? 'PEMASUKAN' : optJenis === 'keluar' ? 'PENGELUARAN' : 'PEMASUKAN & PENGELUARAN';
    const rentangLabel = optStartDate || optEndDate 
      ? `${optStartDate || 'Awal'} s.d. ${optEndDate || 'Hari Ini'}`
      : 'Semua Waktu';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Uang Kas Kelas - ${currentKelas}</title>
          <style>
            body { font-family: 'Arial', sans-serif; color: #0f172a; padding: 24px; font-size: 11px; line-height: 1.4; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px; }
            .header h1 { margin: 0; font-size: 16px; text-transform: uppercase; }
            .header p { margin: 2px 0 0; color: #475569; font-size: 10px; }
            .title { text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; text-decoration: underline; }
            .subtitle { text-align: center; font-size: 10px; font-weight: bold; margin-bottom: 16px; color: #475569; }
            .summary-cards { display: flex; gap: 12px; margin-bottom: 16px; }
            .card { flex: 1; border: 1px solid #cbd5e1; padding: 8px 10px; border-radius: 6px; text-align: center; background: #f8fafc; }
            .card .val { font-size: 13px; font-weight: bold; margin-top: 2px; }
            .card .lbl { font-size: 9px; color: #475569; text-transform: uppercase; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #e2e8f0; border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; text-align: left; }
            .signatures { margin-top: 36px; display: flex; justify-content: space-between; page-break-inside: avoid; }
            .sign-box { text-align: center; width: 200px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${schoolName}</h1>
            <p>${schoolAddress}</p>
            <p>LAPORAN KAS KELAS ${currentKelas} • PERIODE ${semester}</p>
          </div>

          <div class="title">LEMBAR PERTANGGUNGJAWABAN TRANSAKSI UANG KAS</div>
          <div class="subtitle">Filter Jenis: ${jenisLabel} | Rentang Waktu: ${rentangLabel}</div>

          <div class="summary-cards">
            <div class="card">
              <div class="lbl">Total Uang Masuk</div>
              <div class="val" style="color: #059669;">Rp ${rPemasukan.toLocaleString('id-ID')}</div>
            </div>
            <div class="card">
              <div class="lbl">Total Pengeluaran</div>
              <div class="val" style="color: #dc2626;">Rp ${rPengeluaran.toLocaleString('id-ID')}</div>
            </div>
            <div class="card">
              <div class="lbl">Selisih Periode ini</div>
              <div class="val" style="color: #0284c7;">Rp ${(rPemasukan - rPengeluaran).toLocaleString('id-ID')}</div>
            </div>
            <div class="card">
              <div class="lbl">Saldo Akumulasi Kas</div>
              <div class="val" style="color: #4f46e5;">Rp ${saldoKas.toLocaleString('id-ID')}</div>
            </div>
          </div>

          <h3>RINCIAN TRANSAKSI TRANSAKSI (${reportEntries.length} Records)</h3>
          <table>
            <thead>
              <tr>
                <th width="30" style="text-align:center;">No</th>
                <th width="75" style="text-align:center;">Tanggal</th>
                <th width="85" style="text-align:center;">Jenis</th>
                <th width="110">Kategori</th>
                <th>Keterangan Transaksi</th>
                <th width="90" style="text-align:right;">Masuk</th>
                <th width="90" style="text-align:right;">Keluar</th>
                <th width="95" style="text-align:right;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${entriesRows}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sign-box">
              <p>Mengetahui,<br>Ketua / Bendahara Kelas</p>
              <br><br><br>
              <p style="border-bottom: 1px solid #000; font-weight: bold;">( ......................................... )</p>
            </div>
            <div class="sign-box">
              <p>Wali Kelas ${currentKelas}</p>
              <br><br><br>
              <p style="border-bottom: 1px solid #000; font-weight: bold;"><strong>${settings?.nama_wali_kelas || 'Wali Kelas'}</strong><br><span style="font-size:9px; font-weight:normal;">NIP. ${settings?.nip_wali_kelas || '-'}</span></p>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setShowPrintModal(false);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      toast.error('Tidak ada data transaksi kas untuk diekspor');
      return;
    }

    const headers = ['ID', 'Tanggal', 'Jenis', 'Nominal', 'Kategori', 'Nama Siswa', 'Keterangan', 'Kelas', 'Semester', 'Pencatat'];
    const rows = filteredEntries.map(e => [
      e.id,
      e.tanggal,
      e.jenis === 'masuk' ? 'Uang Masuk' : 'Pengeluaran',
      e.nominal,
      `"${(e.kategori || '').replace(/"/g, '""')}"`,
      `"${(e.nama_siswa || '-').replace(/"/g, '""')}"`,
      `"${(e.keterangan || '').replace(/"/g, '""')}"`,
      e.kelas || '',
      e.semester || '',
      `"${(e.penerima_pencatat || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Kas_Kelas_${settings?.nama_kelas || '1'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Data Kas berhasil diekspor ke file CSV');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100 animate-fadeIn">
      <BackgroundDataBanner collectionName="kas" />
      {/* Top Header Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Wallet size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Pengelolaan Uang KAS Kelas
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
                  Kelas {settings?.nama_kelas || '1'}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Pencatatan iuran masuk siswa, pengeluaran perlengkapan/kegiatan kelas, rekapitulasi, & laporan resmi
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Printer size={15} className="text-indigo-400" />
            <span>Cetak Laporan PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Download size={15} className="text-emerald-400" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Saldo Kas */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Saldo Kas Saat Ini</span>
            <div className={`p-2 rounded-xl border ${saldoKas >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold font-mono ${saldoKas >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Rp {saldoKas.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Siap digunakan untuk kegiatan kelas
          </p>
        </div>

        {/* Card 2: Total Uang Masuk */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Uang Masuk</span>
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <ArrowDownLeft size={18} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-sky-400">
              Rp {totalPemasukan.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Dari {kasEntries.filter(e => e.jenis === 'masuk').length} transaksi iuran siswa
          </p>
        </div>

        {/* Card 3: Total Pengeluaran */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Pengeluaran</span>
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-rose-400">
              Rp {totalPengeluaran.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Untuk {kasEntries.filter(e => e.jenis === 'keluar').length} keperluan perlengkapan/kegiatan
          </p>
        </div>

        {/* Card 4: Total Siswa Pembayar */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Partisipasi Siswa</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-indigo-300">
              {studentKasSummary.filter(s => s.totalMasuk > 0).length} / {students.length}
            </span>
            <span className="text-xs text-indigo-400 font-bold">
              ({students.length > 0 ? Math.round((studentKasSummary.filter(s => s.totalMasuk > 0).length / students.length) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Siswa pernah membayar iuran kas
          </p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-700/80 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('transaksi')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'transaksi'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileText size={15} />
          <span>Riwayat Transaksi Kas</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-900/40 text-[10px]">
            {filteredEntries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('masuk')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'masuk'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Plus size={15} />
          <span>+ Catat Uang Masuk</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('massal')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'massal'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <UserCheck size={15} />
          <span>⚡ Catat Massal Kelas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('keluar')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'keluar'
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Minus size={15} />
          <span>- Catat Pengeluaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <BarChart2 size={15} />
          <span>Laporan & Rekapitulasi Siswa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'log'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <History size={15} />
          <span>Log Aktivitas Auditing</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-900/40 text-[10px]">
            {kasLogs.length}
          </span>
        </button>
      </div>

      {/* TAB 1: RIWAYAT TRANSAKSI KAS */}
      {activeTab === 'transaksi' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-sm backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Search size={16} className="text-slate-400 ml-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari keterangan, siswa, nominal, atau kategori..."
                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Jenis */}
              <select
                value={filterJenis}
                onChange={e => setFilterJenis(e.target.value as any)}
                className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="semua">Semua Jenis Transaksi</option>
                <option value="masuk">Uang Masuk (Pemasukan)</option>
                <option value="keluar">Pengeluaran Kelas</option>
              </select>

              {/* Filter Date Range */}
              <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1 text-xs text-slate-300">
                <Calendar size={13} className="text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-slate-200 text-xs cursor-pointer"
                  title="Dari Tanggal"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-slate-200 text-xs cursor-pointer"
                  title="Sampai Tanggal"
                />
              </div>

              {(searchQuery || filterJenis !== 'semua' || startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterJenis('semua');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Reset Filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-300 font-semibold border-b border-slate-700/80 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5 text-center w-12">No</th>
                    <th className="p-3.5">Tanggal</th>
                    <th className="p-3.5">Jenis</th>
                    <th className="p-3.5">Kategori</th>
                    <th className="p-3.5">Keterangan / Siswa</th>
                    <th className="p-3.5 text-right">Nominal (Rp)</th>
                    <th className="p-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-200">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        <Wallet size={36} className="mx-auto text-slate-600 mb-2 opacity-60" />
                        <p className="font-medium text-sm">Belum ada data transaksi Kas Kelas</p>
                        <p className="text-xs text-slate-500 mt-1">Gunakan tombol "+ Catat Uang Masuk" atau "- Catat Pengeluaran" di atas untuk menambah data.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3.5 font-medium text-slate-300 whitespace-nowrap">{entry.tanggal}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          {entry.jenis === 'masuk' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <ArrowDownLeft size={12} />
                              Uang Masuk
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              <ArrowUpRight size={12} />
                              Pengeluaran
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900/60 text-slate-300 border border-slate-700 text-[11px]">
                            {entry.kategori || 'Umum'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-100">{entry.keterangan || '-'}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {entry.nama_siswa && (
                              <div className="text-[11px] text-indigo-300 flex items-center gap-1">
                                <Users size={11} />
                                <span>Siswa: {entry.nama_siswa}</span>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <User size={10} />
                              <span>
                                {entry.last_modified_by ? `Diedit: ${entry.last_modified_by}` : `Pencatat: ${entry.penerima_pencatat || 'Wali Kelas'}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className={`p-3.5 text-right font-bold font-mono text-sm ${entry.jenis === 'masuk' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {entry.jenis === 'masuk' ? '+' : '-'} Rp {(entry.nominal || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const logs = getItemLogs(entry);
                                setSelectedEntryLogs({ entry, logs });
                              }}
                              className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg transition-colors cursor-pointer"
                              title="Lihat Log Audit Aktivitas Transaksi"
                            >
                              <History size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(entry)}
                              className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors cursor-pointer"
                              title="Edit Transaksi Kas"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingEntry(entry)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors cursor-pointer"
                              title="Hapus Transaksi Kas"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATAT UANG MASUK (SINGLE) */}
      {activeTab === 'masuk' && (
        <div className="max-w-2xl mx-auto bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3 border-b border-slate-700/80 pb-4 mb-5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Catat Uang Masuk (Pemasukan Kas)</h2>
              <p className="text-xs text-slate-400">Pencatatan iuran per siswa atau dana pemasukan kas kelas lainnya</p>
            </div>
          </div>

          <form onSubmit={handleSaveSinglePemasukan} className="space-y-4 text-xs">
            {/* Student Select */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Siswa Pembayar (Opsional):</label>
              <select
                value={singleStudentId}
                onChange={e => setSingleStudentId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Pilih Siswa (Atau Biarkan Kosong Jika Pemasukan Umum) --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.no ? `${s.no}. ` : ''}{s.nama} (NISN: {s.nisn || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tanggal */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tanggal Masuk Uang:*</label>
                <input
                  type="date"
                  required
                  value={singleTanggal}
                  onChange={e => setSingleTanggal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nominal Uang (Rp):*</label>
                <input
                  type="number"
                  required
                  min={500}
                  step={500}
                  value={singleNominal}
                  onChange={e => setSingleNominal(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Contoh: 5000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kategori */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Kategori Uang Masuk:</label>
                <select
                  value={singleKategori}
                  onChange={e => setSingleKategori(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Iuran Wajib Kas">Iuran Wajib Kas</option>
                  <option value="Iuran Sukarela">Iuran Sukarela</option>
                  <option value="Sumbangan Ortu / Donatur">Sumbangan Ortu / Donatur</option>
                  <option value="Sisa Kegiatan Lalu">Sisa Kegiatan Lalu</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {/* Metode */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Metode Pembayaran:</label>
                <select
                  value={singleMetode}
                  onChange={e => setSingleMetode(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Tunai">Tunai</option>
                  <option value="Transfer">Transfer Bank</option>
                  <option value="QRIS">QRIS / E-Wallet</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
            </div>

            {/* Keterangan */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Keterangan / Catatan Tambahan:</label>
              <textarea
                rows={2}
                value={singleKeterangan}
                onChange={e => setSingleKeterangan(e.target.value)}
                placeholder="Contoh: Pembayaran iuran kas bulan Agustus..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveTab('transaksi')}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                <span>Simpan Uang Masuk</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: CATAT KAS MASSAL (BATCH CLASS ENTRY) */}
      {activeTab === 'massal' && (
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-5">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <UserCheck size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Pencatatan Kas Massal Seluruh Kelas</h2>
                <p className="text-xs text-slate-400">Centang siswa yang membayar iuran mingguan / bulanan secara bersamaan</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  students.forEach(s => all[s.id] = true);
                  setBatchSelectedStudents(all);
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold text-slate-200 cursor-pointer"
              >
                Pilih Semua
              </button>
              <button
                type="button"
                onClick={() => setBatchSelectedStudents({})}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold text-slate-200 cursor-pointer"
              >
                Hapus Semua
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tanggal Masuk:*</label>
              <input
                type="date"
                value={batchTanggal}
                onChange={e => setBatchTanggal(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nominal Iuran Per Siswa (Rp):*</label>
              <input
                type="number"
                min={500}
                step={500}
                value={batchNominal}
                onChange={e => setBatchNominal(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-bold font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Kategori / Deskripsi:</label>
              <input
                type="text"
                value={batchKeterangan}
                onChange={e => setBatchKeterangan(e.target.value)}
                placeholder="Contoh: Iuran Kas Minggu Ke-1"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100"
              />
            </div>
          </div>

          {/* Student Selection Grid */}
          <div className="border border-slate-700/80 rounded-xl p-4 bg-slate-900/60 max-h-96 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {students.map(student => {
                const isSelected = !!batchSelectedStudents[student.id];
                return (
                  <div
                    key={student.id}
                    onClick={() => {
                      setBatchSelectedStudents(prev => ({
                        ...prev,
                        [student.id]: !prev[student.id]
                      }));
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isSelected
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-indigo-500 text-white' : 'border border-slate-600'
                      }`}>
                        {isSelected && <Check size={13} />}
                      </div>
                      <span className="text-xs font-semibold truncate">
                        {student.no ? `${student.no}. ` : ''}{student.nama}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      Rp {batchNominal.toLocaleString('id-ID')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-700/80">
            <span className="text-xs text-slate-300 font-semibold">
              Siswa Terpilih: <strong className="text-indigo-400 font-mono text-sm">{Object.keys(batchSelectedStudents).filter(k => batchSelectedStudents[k]).length}</strong> dari {students.length} Siswa | Total Kas: <strong className="text-emerald-400 font-mono text-sm">Rp {(Object.keys(batchSelectedStudents).filter(k => batchSelectedStudents[k]).length * batchNominal).toLocaleString('id-ID')}</strong>
            </span>

            <button
              type="button"
              onClick={handleSaveBatchPemasukan}
              className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 cursor-pointer text-xs"
            >
              <Check size={16} />
              <span>Simpan Pembayaran Kas Massal</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: CATAT PENGELUARAN KELAS */}
      {activeTab === 'keluar' && (
        <div className="max-w-2xl mx-auto bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
                <Minus size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Catat Pengeluaran Uang Kas Kelas</h2>
                <p className="text-xs text-slate-400">Pencatatan biaya pembelanjaan alat tulis, kegiatan, kebersihan, atau sosial kelas</p>
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-slate-300 font-mono shrink-0">
              Saldo Kas: <span className={`font-bold ${saldoKas < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>Rp {saldoKas.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <form onSubmit={handleSavePengeluaran} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tanggal */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tanggal Keluar Uang:*</label>
                <input
                  type="date"
                  required
                  value={expTanggal}
                  onChange={e => setExpTanggal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Nominal */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-300 font-semibold">Nominal Pengeluaran (Rp):*</label>
                  {expNominal !== '' && (
                    <span className={`text-[10px] font-bold ${Number(expNominal) > saldoKas ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {Number(expNominal) > saldoKas ? '⚠️ Melebihi Saldo' : '✓ Saldo Cukup'}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min={500}
                  step={500}
                  value={expNominal}
                  onChange={e => setExpNominal(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Contoh: 15000"
                  className={`w-full bg-slate-900 border rounded-xl p-2.5 text-slate-100 font-mono font-bold text-sm focus:outline-none transition-all ${
                    expNominal !== '' && Number(expNominal) > saldoKas
                      ? 'border-rose-500 bg-rose-500/10 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/30 text-rose-200'
                      : 'border-slate-700 focus:border-rose-500'
                  }`}
                />
                {expNominal !== '' && Number(expNominal) > saldoKas && (
                  <div className="mt-2.5 p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn shadow-lg shadow-rose-950/30">
                    <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-200">Peringatan Validasi Real-Time:</p>
                      <p className="text-[11px] text-rose-300/90 mt-0.5 leading-relaxed">
                        Nominal pengeluaran (<strong>Rp {Number(expNominal).toLocaleString('id-ID')}</strong>) melebihi total saldo kas saat ini (<strong>Rp {saldoKas.toLocaleString('id-ID')}</strong>) sebesar <strong className="text-rose-200 underline">Rp {(Number(expNominal) - saldoKas).toLocaleString('id-ID')}</strong>. Saldo tidak mencukupi untuk transaksi ini!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kategori */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Kategori Pengeluaran:</label>
                <select
                  value={expKategori}
                  onChange={e => setExpKategori(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="Perlengkapan Kelas">Perlengkapan / ATK Kelas</option>
                  <option value="Kebersihan & Alat">Alat Kebersihan Kelas</option>
                  <option value="Kegiatan & Acara">Kegiatan / Acara Kelas</option>
                  <option value="Sosial & Jenguk">Sosial / Jenguk Teman Sakit</option>
                  <option value="Foto & Cetak">Cetak Dokumen / Foto</option>
                  <option value="Konsumsi">Konsumsi</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {/* Pencatat / Penanggungjawab */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Pencatat / Penanggungjawab:</label>
                <input
                  type="text"
                  value={expPencatat}
                  onChange={e => setExpPencatat(e.target.value)}
                  placeholder="Nama Bendahara / Wali Kelas"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Keterangan Detail */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Keterangan Keperluan / Bukti Belanja:*</label>
              <textarea
                rows={3}
                required
                value={expKeterangan}
                onChange={e => setExpKeterangan(e.target.value)}
                placeholder="Contoh: Pembelian spidol whiteboard 3 pcs dan sapu lantai kelas..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveTab('transaksi')}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                <span>Simpan Pengeluaran Kas</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 5: LAPORAN & REKAPITULASI SISWA */}
      {activeTab === 'rekap' && (
        <div className="space-y-6">
          {/* Visual Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Pemasukan vs Pengeluaran Interaktif */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <BarChart2 size={16} className="text-indigo-400" />
                  <span>Grafik Arus Kas (Pemasukan vs Pengeluaran)</span>
                </h3>
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => setChartTimeframe('harian')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      chartTimeframe === 'harian' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Harian
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTimeframe('mingguan')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      chartTimeframe === 'mingguan' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mingguan
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTimeframe('bulanan')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      chartTimeframe === 'bulanan' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Bulanan
                  </button>
                </div>
              </div>

              <div className="h-64 w-full">
                {dynamicChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Belum ada data transaksi kas.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dynamicChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `Rp${v/1000}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }} 
                        formatter={(val: any) => [`Rp ${Number(val).toLocaleString('id-ID')}`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="Pemasukan" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pengeluaran" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Distribusi Pengeluaran Per Kategori */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md">
              <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
                <PieChartIcon size={16} className="text-rose-400" />
                <span>Distribusi Kategori Pengeluaran Kelas</span>
              </h3>
              <div className="h-64 w-full">
                {categoryPieData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Belum ada data pengeluaran recorded.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {categoryPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                        formatter={(val: any) => [`Rp ${Number(val).toLocaleString('id-ID')}`, 'Nominal']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Student Rekapitulasi Table */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-emerald-400" />
                  <span>Rekapitulasi Kontribusi Iuran Per Siswa</span>
                </h3>
                <p className="text-xs text-slate-400">Total akumulasi pembayaran kas per individu siswa kelas</p>
              </div>

              <div className="text-xs text-slate-300 font-medium">
                Total Siswa Active: <span className="font-bold text-indigo-400 font-mono">{students.length} Siswa</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-300 font-semibold border-b border-slate-700/80 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3 text-center w-12">No</th>
                    <th className="p-3">Nama Siswa</th>
                    <th className="p-3">NISN</th>
                    <th className="p-3 text-center">Frekuensi Bayar</th>
                    <th className="p-3 text-right">Total Kas Terbayar</th>
                    <th className="p-3 text-center">Pembayaran Terakhir</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-200">
                  {studentKasSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        Belum ada siswa terdaftar di kelas.
                      </td>
                    </tr>
                  ) : (
                    studentKasSummary.map(({ student, totalMasuk, countMasuk, lastPaidDate }, idx) => (
                      <tr key={student.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-semibold text-slate-100">{student.nama}</td>
                        <td className="p-3 font-mono text-slate-400">{student.nisn || '-'}</td>
                        <td className="p-3 text-center font-mono font-bold text-indigo-300">{countMasuk} x</td>
                        <td className="p-3 text-right font-bold font-mono text-emerald-400">
                          Rp {totalMasuk.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center text-slate-400 font-mono">{lastPaidDate}</td>
                        <td className="p-3 text-center">
                          {totalMasuk > 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Aktif Membayar
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Belum Pernah
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LOG AKTIVITAS AUDITING */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl">
                <History size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Log Riwayat Aktivitas Transaksi Kas</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-semibold">
                    Auditing Trail
                  </span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Rekam jejak transparan siapa yang menginput, mengedit, atau menghapus setiap data kas
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="bg-slate-900/80 border border-slate-700 p-2.5 rounded-xl text-center min-w-[90px]">
                <div className="text-emerald-400 font-bold">{kasLogs.filter(l => l.action === 'create').length}</div>
                <div className="text-[10px] text-slate-400 uppercase">Input</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700 p-2.5 rounded-xl text-center min-w-[90px]">
                <div className="text-amber-400 font-bold">{kasLogs.filter(l => l.action === 'update').length}</div>
                <div className="text-[10px] text-slate-400 uppercase">Edit</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700 p-2.5 rounded-xl text-center min-w-[90px]">
                <div className="text-rose-400 font-bold">{kasLogs.filter(l => l.action === 'delete').length}</div>
                <div className="text-[10px] text-slate-400 uppercase">Hapus</div>
              </div>
            </div>
          </div>

          {/* Log Filters Bar */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-sm backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Search size={16} className="text-slate-400 ml-2" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={e => setLogSearchQuery(e.target.value)}
                placeholder="Cari nama penginput, keterangan, nominal, atau rincian..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Filter Aksi:</span>
              <select
                value={filterLogAction}
                onChange={e => setFilterLogAction(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
              >
                <option value="semua">Semua Aktivitas ({kasLogs.length})</option>
                <option value="create">🟢 Menginput ({kasLogs.filter(l => l.action === 'create').length})</option>
                <option value="update">🔵 Mengedit ({kasLogs.filter(l => l.action === 'update').length})</option>
                <option value="delete">🔴 Menghapus ({kasLogs.filter(l => l.action === 'delete').length})</option>
              </select>
            </div>
          </div>

          {/* Activity Logs Table */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-300 font-semibold border-b border-slate-700/80 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Waktu Aktivitas</th>
                    <th className="p-3.5 text-center">Tindakan / Aksi</th>
                    <th className="p-3.5">Pengguna / Operator</th>
                    <th className="p-3.5">Transaksi Terkait</th>
                    <th className="p-3.5 text-right">Nominal</th>
                    <th className="p-3.5">Rincian & Catatan Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-200">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 space-y-2">
                        <Activity size={32} className="mx-auto text-slate-500 opacity-60" />
                        <p className="font-semibold text-slate-300">Belum ada riwayat log aktivitas transaksi.</p>
                        <p className="text-[11px] text-slate-500">Setiap transaksi baru, perubahan, atau penghapusan kas akan dicatat secara otomatis di sini.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => {
                      const dt = new Date(log.timestamp);
                      const formattedDate = isNaN(dt.getTime()) 
                        ? log.timestamp 
                        : dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                      return (
                        <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <Clock size={13} className="text-amber-400" />
                              <span>{formattedDate}</span>
                            </div>
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            {log.action === 'create' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center gap-1 w-24 mx-auto">
                                <Plus size={11} /> Menginput
                              </span>
                            ) : log.action === 'update' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-1 w-24 mx-auto">
                                <Pencil size={11} /> Mengedit
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center gap-1 w-24 mx-auto">
                                <Trash2 size={11} /> Menghapus
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              <User size={12} className="text-indigo-400" />
                              <span>{log.user || 'Sistem'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium ml-4">
                              {log.user_role || 'Wali Kelas / Pengurus'}
                            </div>
                          </td>
                          <td className="p-3.5 max-w-[200px]">
                            <div className="font-medium text-slate-200 truncate" title={log.keterangan_transaksi}>
                              {log.keterangan_transaksi || '-'}
                            </div>
                            {log.jenis && (
                              <span className={`text-[10px] font-bold uppercase ${log.jenis === 'masuk' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {log.jenis === 'masuk' ? 'Uang Masuk' : 'Pengeluaran'}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                            {log.nominal ? `Rp ${log.nominal.toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="p-3.5 text-slate-300 max-w-xs text-[11px]">
                            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-700/60 leading-relaxed font-sans text-slate-300">
                              {log.details || 'Aktivitas transaksi tercatat.'}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* MODAL CETAK LAPORAN KAS DENGAN FILTER RENTANG WAKTU & JENIS TRANSAKSI */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 p-5 sm:p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Printer size={18} className="text-indigo-400" />
                  <span>Cetak Laporan KAS Kelas</span>
                </h3>
                <p className="text-xs text-slate-400">Pilih rentang waktu & jenis transaksi untuk dicetak ke PDF</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Filter Jenis Transaksi */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  1. Jenis Transaksi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintJenis('semua')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      printJenis === 'semua'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Keduanya (Masuk & Keluar)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintJenis('masuk')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      printJenis === 'masuk'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Uang Masuk Saja
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintJenis('keluar')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      printJenis === 'keluar'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Pengeluaran Saja
                  </button>
                </div>
              </div>

              {/* Filter Rentang Waktu */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  2. Rentang Tanggal Transaksi
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Dari Tanggal:</span>
                    <input 
                      type="date"
                      value={printStartDate}
                      onChange={e => setPrintStartDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Sampai Tanggal:</span>
                    <input 
                      type="date"
                      value={printEndDate}
                      onChange={e => setPrintEndDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = now.toISOString().split('T')[0];
                      setPrintStartDate(firstDay);
                      setPrintEndDate(lastDay);
                    }}
                    className="text-[11px] px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 text-indigo-300 rounded-lg transition-colors cursor-pointer"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintStartDate('');
                      setPrintEndDate('');
                    }}
                    className="text-[11px] px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                  >
                    Semua Tanggal
                  </button>
                </div>
              </div>

              {/* Preview Info */}
              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/60 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Semester Aktif:</span>
                  <span className="font-bold text-indigo-400 font-mono">{semester}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rentang Terpilih:</span>
                  <span className="font-bold text-slate-200 font-mono">
                    {printStartDate || printEndDate ? `${printStartDate || 'Awal'} s.d. ${printEndDate || 'Hari Ini'}` : 'Semua Transaksi'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Filter Jenis:</span>
                  <span className="font-bold text-emerald-400 uppercase font-mono">{printJenis}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handlePrintKasReport(printStartDate, printEndDate, printJenis, printKategori)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
              >
                <Printer size={15} />
                <span>Cetak Laporan PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TRANSACTION MODAL */}
      {editingEntry && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
            <div className="flex items-center justify-between border-b border-slate-700 p-4 sm:p-5 shrink-0 bg-slate-800/90">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil size={18} className="text-amber-400" />
                Edit Transaksi Kas Kelas
              </h3>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditEntry} className="flex-1 flex flex-col overflow-hidden text-xs">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Tanggal Transaksi</label>
                    <input
                      type="date"
                      required
                      value={editTanggal}
                      onChange={(e) => setEditTanggal(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Jenis Transaksi</label>
                    <select
                      value={editJenis}
                      onChange={(e) => setEditJenis(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="masuk">Uang Masuk (Pemasukan)</option>
                      <option value="keluar">Pengeluaran Kelas</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-300">Nominal Transaksi (Rp)</label>
                    {editJenis === 'keluar' && editNominal !== '' && (() => {
                      const available = saldoKas + (editingEntry.jenis === 'keluar' ? (editingEntry.nominal || 0) : -(editingEntry.nominal || 0));
                      return (
                        <span className={`text-[10px] font-bold ${Number(editNominal) > available ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {Number(editNominal) > available ? '⚠️ Melebihi Saldo' : '✓ Saldo Cukup'}
                        </span>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editNominal}
                    onChange={(e) => setEditNominal(e.target.value ? Number(e.target.value) : '')}
                    className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono ${
                      editJenis === 'keluar' && editNominal !== '' && (() => {
                        const available = saldoKas + (editingEntry.jenis === 'keluar' ? (editingEntry.nominal || 0) : -(editingEntry.nominal || 0));
                        return Number(editNominal) > available;
                      })()
                        ? 'border-rose-500 bg-rose-500/10 focus:border-rose-400'
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  />
                  {editJenis === 'keluar' && editNominal !== '' && (() => {
                    const available = saldoKas + (editingEntry.jenis === 'keluar' ? (editingEntry.nominal || 0) : -(editingEntry.nominal || 0));
                    if (Number(editNominal) > available) {
                      return (
                        <div className="mt-2 p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-[11px] flex items-start gap-2">
                          <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-rose-200">Peringatan:</span> Nominal pengeluaran (Rp {Number(editNominal).toLocaleString('id-ID')}) melebihi saldo kas yang tersedia (Rp {available.toLocaleString('id-ID')}).
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Kategori</label>
                  <input
                    type="text"
                    required
                    value={editKategori}
                    onChange={(e) => setEditKategori(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Keterangan / Keperluan</label>
                  <input
                    type="text"
                    required
                    value={editKeterangan}
                    onChange={(e) => setEditKeterangan(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {editJenis === 'masuk' && (
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Nama Siswa (Opsional)</label>
                    <input
                      type="text"
                      value={editNamaSiswa}
                      onChange={(e) => setEditNamaSiswa(e.target.value)}
                      placeholder="Contoh: Derissa Fawnia Simamora"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-slate-700 shrink-0 bg-slate-800/90">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors shadow-lg cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TRANSACTION CONFIRMATION MODAL */}
      {deletingEntry && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 text-left my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 size={18} className="text-rose-400" />
                Konfirmasi Hapus Transaksi Kas
              </h3>
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Tanggal:</span>
                <span className="font-mono font-semibold">{deletingEntry.tanggal}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Jenis Transaksi:</span>
                <span className={`font-semibold ${deletingEntry.jenis === 'masuk' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {deletingEntry.jenis === 'masuk' ? 'Uang Masuk (+)' : 'Pengeluaran (-)'}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Nominal:</span>
                <span className="font-mono font-bold text-white">Rp {(deletingEntry.nominal || 0).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Keterangan:</span>
                <span className="font-medium text-slate-200">{deletingEntry.keterangan || '-'}</span>
              </div>
              {deletingEntry.nama_siswa && (
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Nama Siswa:</span>
                  <span className="font-medium text-indigo-300">{deletingEntry.nama_siswa}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-rose-300/90 leading-relaxed bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              Apakah Anda yakin ingin menghapus catatan transaksi ini? Data transaksi akan dihapus dari database lokal dan disinkronkan ke Firebase Cloud.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEntry}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                Ya, Hapus Transaksi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL AUDIT LOG DETAILS FOR INDIVIDUAL TRANSACTION */}
      {selectedEntryLogs && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-5 text-left my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History size={18} className="text-amber-400" />
                <span>Riwayat Jejak Audit Transaksi Kas</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedEntryLogs(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-700/80 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Keterangan:</span>
                <span className="font-bold text-white">{selectedEntryLogs.entry.keterangan || '-'}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Nominal:</span>
                <span className={`font-mono font-bold ${selectedEntryLogs.entry.jenis === 'masuk' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Rp {(selectedEntryLogs.entry.nominal || 0).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Tanggal Transaksi:</span>
                <span className="font-mono text-slate-200">{selectedEntryLogs.entry.tanggal}</span>
              </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="text-indigo-400" />
                <span>Kronologi Aktivitas ({selectedEntryLogs.logs.length} Rekam)</span>
              </h4>

              <div className="space-y-2 relative border-l-2 border-slate-700 ml-3 pl-4">
                {selectedEntryLogs.logs.map((log, index) => {
                  const dt = new Date(log.timestamp);
                  const formattedDate = isNaN(dt.getTime())
                    ? log.timestamp
                    : dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={log.id || index} className="relative bg-slate-900/70 border border-slate-700/60 p-3 rounded-xl space-y-1 text-xs">
                      {/* Timeline dot */}
                      <span className={`absolute -left-[23px] top-3.5 w-3 h-3 rounded-full border-2 border-slate-800 ${
                        log.action === 'create' ? 'bg-emerald-400' : log.action === 'update' ? 'bg-amber-400' : 'bg-rose-400'
                      }`} />

                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-[11px] uppercase ${
                          log.action === 'create' ? 'text-emerald-300' : log.action === 'update' ? 'text-amber-300' : 'text-rose-300'
                        }`}>
                          {log.action_label || (log.action === 'create' ? 'Menginput' : log.action === 'update' ? 'Mengedit' : 'Menghapus')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{formattedDate}</span>
                      </div>

                      <div className="text-slate-200 font-medium flex items-center gap-1.5">
                        <User size={11} className="text-indigo-400 shrink-0" />
                        <span>{log.user || 'Sistem'} ({log.user_role || 'Wali Kelas'})</span>
                      </div>

                      <p className="text-[11px] text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800 mt-1 leading-relaxed">
                        {log.details || 'Aktivitas transaksi.'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setSelectedEntryLogs(null)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
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
