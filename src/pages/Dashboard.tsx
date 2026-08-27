import React, { useState, useEffect, lazy, Suspense } from 'react';
import { store, Student, Grade, Attendance, Settings, getSubjectKKM } from '../lib/store';
import { getSyncStats } from '../lib/sync';
import { 
  listenRealtimeKasStatsFromFirestore, 
  fetchKasPaginatedFromFirestore, 
  fetchStudentsPaginatedFromFirestore, 
  KasRealtimeStats 
} from '../lib/firebaseSync';
import { 
  verifyFirestoreReferenceIntegrity, 
  getStoredReferenceIntegritySummary, 
  ReferenceIntegritySummary 
} from '../lib/integrityObserver';
import { Users, BookOpen, CheckSquare, TrendingUp, Filter, BarChart2, PieChart as PieIcon, Cloud, AlertCircle, CheckSquare as CheckIcon, Clock, Calendar, Download, Phone, AlertTriangle, CheckCircle2, Wallet, RefreshCw, ShieldAlert, Layers, Box, Sparkles, GraduationCap } from 'lucide-react';
import NaikKelasModal from '../components/NaikKelasModal';
import { startOfMonth, endOfMonth, parseISO, format, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { formatWhatsAppNumber } from '../lib/WhatsAppSender';
import { id } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid, AreaChart, Area, ReferenceLine } from 'recharts';
import toast from 'react-hot-toast';
import TaskNotificationWidget from '../components/TaskNotificationWidget';

// Code-splitting non-critical heavy subcomponents in Dashboard
const AttendanceHeatmap = lazy(() => import('../components/AttendanceHeatmap'));
const UserManagement = lazy(() => import('../components/UserManagement'));
const AuditAndBackupSection = lazy(() => import('../components/AuditAndBackupSection'));


interface DashboardProps {
  role?: string;
  semester: string;
  syncData?: () => Promise<void>;
  onPullData?: () => Promise<void>;
  isSyncing?: boolean;
}

// Skeleton Loading Components for Dashboard
const Skeleton = ({ className = "" }: { className?: string; key?: React.Key }) => (
  <div className={`animate-pulse bg-slate-700/50 rounded-lg ${className}`} />
);

const CardGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg flex flex-col justify-between">
        <div className="flex justify-between items-start mb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    ))}
    <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg sm:col-span-2 lg:col-span-2 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-24 mb-2" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  </div>
);

const KasPanelSkeleton = () => (
  <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
      </div>
      <Skeleton className="h-7 w-36 rounded-xl" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>

    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/40 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-60" />
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 h-[380px] flex flex-col justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
      <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 h-[380px] flex flex-col justify-between">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-3 flex-1 my-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-32 rounded" />
        </div>
      </div>
    </div>
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg flex flex-col h-[380px]">
    <div className="flex justify-between items-center mb-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-8 w-24 rounded-lg" />
    </div>
    <div className="flex-1 flex items-end gap-3 pt-6 pb-2 px-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          <Skeleton className={`w-full rounded-t-md ${
            i % 3 === 0 ? 'h-[75%]' : i % 2 === 0 ? 'h-[45%]' : 'h-[85%]'
          }`} />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  </div>
);

export default function Dashboard({ role, semester, syncData, onPullData, isSyncing }: DashboardProps) {
  const safeNum = (val: number | undefined | null, digits = 1): string => {
    if (val === undefined || val === null || isNaN(val)) return '0.0';
    return val.toFixed(digits);
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isKasLoading, setIsKasLoading] = useState(true);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [filterKelas, setFilterKelas] = useState<string>('Semua');
  const [filterWaktu, setFilterWaktu] = useState<'Hari Ini' | 'Minggu Ini' | 'Bulan Ini' | 'Semester' | 'Kustom'>('Semester');
  const [filterMapel, setFilterMapel] = useState<string>('Semua');
  const [activeTrendTab, setActiveTrendTab] = useState<'kehadiran' | 'nilai'>('kehadiran');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [tasksToday, setTasksToday] = useState<any[]>([]);
  
  const [customStartDate, setCustomStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  
  const [weeklyAttendance, setWeeklyAttendance] = useState<number>(-1);
  const [studentsAttention, setStudentsAttention] = useState<any[]>([]);
  
  const [attendanceChartData, setAttendanceChartData] = useState<any[]>([]);
  const [subjectChartData, setSubjectChartData] = useState<any[]>([]);
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);
  const [gradeTrendData, setGradeTrendData] = useState<any[]>([]);
  const [kasStats, setKasStats] = useState({
    totalPemasukan: 0,
    totalPengeluaran: 0,
    saldoKas: 0,
    totalTransactions: 0
  });
  const [kasChartData, setKasChartData] = useState<any[]>([]);
  const [recentKas, setRecentKas] = useState<any[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [showPullConfirm, setShowPullConfirm] = useState(false);

  // Realtime Firestore Kas Stats & Pagination States
  const [realtimeKas, setRealtimeKas] = useState<KasRealtimeStats>({
    totalPemasukan: 0,
    totalPengeluaran: 0,
    saldoKas: 0,
    sisaKas: 0,
    totalTransaksi: 0,
    lastUpdated: '-'
  });
  const [isFirestoreKasConnected, setIsFirestoreKasConnected] = useState(false);

  // Pagination states for Kas transactions in Dashboard
  const [kasPage, setKasPage] = useState(1);
  const [kasLimit, setKasLimit] = useState(10);
  const [isNaikKelasOpen, setIsNaikKelasOpen] = useState(false);

  // Reference Integrity Summary States
  const [refSummary, setRefSummary] = useState<ReferenceIntegritySummary | null>(null);
  const [isCheckingRef, setIsCheckingRef] = useState(false);

  useEffect(() => {
    const loadRefIntegrity = async () => {
      const cached = getStoredReferenceIntegritySummary();
      if (cached) setRefSummary(cached);
      const updated = await verifyFirestoreReferenceIntegrity();
      setRefSummary(updated);
    };
    loadRefIntegrity();

    const handleRefUpdated = (e: any) => {
      if (e.detail) setRefSummary(e.detail);
    };
    window.addEventListener('reference-integrity-updated', handleRefUpdated);
    return () => {
      window.removeEventListener('reference-integrity-updated', handleRefUpdated);
    };
  }, []);

  useEffect(() => {
    // Setup real-time listener for Uang KAS stats from Firestore
    const unsubscribe = listenRealtimeKasStatsFromFirestore((stats) => {
      setRealtimeKas(stats);
      setIsFirestoreKasConnected(true);
      setIsKasLoading(false);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Contact Parent Modal States
  const [selectedContactStudent, setSelectedContactStudent] = useState<any | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<'akademik' | 'kehadiran' | 'keduanya' | 'kustom'>('akademik');
  const [editedMessage, setEditedMessage] = useState('');

  useEffect(() => {
    const handleDataChange = () => {
      setDataVersion(prev => prev + 1);
    };
    window.addEventListener('data-changed', handleDataChange);
    return () => {
      window.removeEventListener('data-changed', handleDataChange);
    };
  }, []);

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const isRestrictedClass = !assignedClasses.includes('*');

  // Compute active Kas stats based on user role and class filter
  const displayKas = (filterKelas !== 'Semua' || isRestrictedClass || !isFirestoreKasConnected)
    ? kasStats
    : (realtimeKas.totalPemasukan ? realtimeKas : kasStats);

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);

  const [syncStats, setSyncStats] = useState({
    percentage: 100,
    unsyncedCount: 0,
    totalItems: 0,
    queueItems: [] as { store: string; id: string; action: string }[]
  });

  const [stats, setStats] = useState({
    totalStudents: 0,
    classes: 0,
    attendanceToday: 0,
    attendanceTodayOnly: -1,
    avgGrades: 0,
    totalAlumni: 0
  });

  const [rosterToday, setRosterToday] = useState<any[]>([]);
  const [piketToday, setPiketToday] = useState<any[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [classAchievementStats, setClassAchievementStats] = useState<{
    sangatBaik: number;
    baik: number;
    perluBimbingan: number;
    totalEvaluated: number;
    chartData: { name: string; value: number; color: string }[];
  }>({
    sangatBaik: 0,
    baik: 0,
    perluBimbingan: 0,
    totalEvaluated: 0,
    chartData: []
  });

  const [chartTheme, setChartTheme] = useState<'professional' | 'high_contrast'>(() => {
    return (localStorage.getItem('dashboard_chart_theme') as any) || 'professional';
  });



  const handleThemeChange = (newTheme: 'professional' | 'high_contrast') => {
    setChartTheme(newTheme);
    localStorage.setItem('dashboard_chart_theme', newTheme);
    toast.success(`Tema grafik diubah ke ${newTheme === 'professional' ? 'Professional Blue' : 'High Contrast'}`);
  };

  const themeColors = chartTheme === 'professional' ? {
    attendance: {
      Hadir: '#2563eb', // Royal Blue
      Sakit: '#38bdf8', // Sky Blue
      Izin: '#818cf8',  // Indigo
      Alpa: '#ef4444'   // Rose
    },
    trendPrimary: '#3b82f6',
    trendSecondary: '#1d4ed8',
    gradePrimary: '#0284c7',
    gradeSecondary: '#0369a1',
    barFill: '#3b82f6',
    barFillHighlight: '#60a5fa',
    kkmLine: '#f59e0b',
    gridStroke: 'rgba(51, 65, 85, 0.3)',
    axisStroke: '#94a3b8',
    tooltipStyle: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderRadius: '10px',
      borderColor: 'rgba(59, 130, 246, 0.5)',
      color: '#f8fafc'
    }
  } : {
    attendance: {
      Hadir: '#00ff66', // Neon Green
      Sakit: '#ffff00', // Neon Yellow
      Izin: '#00e5ff',  // Electric Cyan
      Alpa: '#ff0055'   // Neon Pink
    },
    trendPrimary: '#ffff00',
    trendSecondary: '#ca8a04',
    gradePrimary: '#00ffff',
    gradeSecondary: '#0284c7',
    barFill: '#00e5ff',
    barFillHighlight: '#ffff00',
    kkmLine: '#ff6600',
    gridStroke: 'rgba(203, 213, 225, 0.5)',
    axisStroke: '#ffffff',
    tooltipStyle: {
      backgroundColor: '#090d16',
      borderRadius: '10px',
      borderColor: '#ffffff',
      borderWidth: '2px',
      color: '#ffffff',
      fontWeight: 'bold'
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      const s = await store.settings.getItem<Settings>('app_settings');
      setSettings(s);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadSync = async () => {
      const statsObj = await getSyncStats();
      setSyncStats(statsObj);
    };
    loadSync();
    
    window.addEventListener('data-changed', loadSync);
    window.addEventListener('sync-status-changed', loadSync);
    return () => {
      window.removeEventListener('data-changed', loadSync);
      window.removeEventListener('sync-status-changed', loadSync);
    };
  }, []);

  useEffect(() => {
    const loadSyncLogs = async () => {
      const list: any[] = [];
      await store.syncLogs.iterate((v) => {
        list.push(v);
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setSyncLogs(list.slice(0, 10)); // Top 10 logs
    };
    loadSyncLogs();
    window.addEventListener('sync-log-changed', loadSyncLogs);
    return () => {
      window.removeEventListener('sync-log-changed', loadSyncLogs);
    };
  }, []);

  const isInitialLoadDone = React.useRef(false);
  const prevSyncingRef = React.useRef(isSyncing);

  const loadStats = React.useCallback(async () => {
    if (!isInitialLoadDone.current) {
      setIsLoading(true);
    }
    try {
      // Parallelize all local IndexedDB queries for maximum speed during sync
      const [
        sList,
        rawGList,
        rawAList,
        kasList,
        rosterListRaw,
        piketListRaw,
        taskListRaw,
        currentSettings
      ] = await Promise.all([
        (async () => {
          const list: Student[] = [];
          await store.students.iterate<Student, void>((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: Grade[] = [];
          await store.grades.iterate<Grade, void>((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: Attendance[] = [];
          await store.attendance.iterate<Attendance, void>((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: any[] = [];
          await store.kas.iterate((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: any[] = [];
          await store.roster.iterate((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: any[] = [];
          await store.piket.iterate((v) => { if (v) list.push(v); });
          return list;
        })(),
        (async () => {
          const list: any[] = [];
          await store.tasks.iterate((v) => { if (v) list.push(v); });
          return list;
        })(),
        store.settings.getItem<Settings>('app_settings')
      ]);

      const currentUser = getCurrentUser();
      const assignedClasses = getAssignedClasses(currentUser);
      const isRestrictedClass = !assignedClasses.includes('*');

      // Student class mapping for accurate record filtering
      const studentClassMap: Record<string, string> = {};
      sList.forEach(s => {
        if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
        if (s.nisn && s.kelas) studentClassMap[s.nisn] = s.kelas;
        if (s.nipd && s.kelas) studentClassMap[s.nipd] = s.kelas;
      });

      const userFilteredStudents = filterStudentsForUser(currentUser, sList);
      const userFilteredGrades = filterRecordsForUser(currentUser, rawGList, studentClassMap);
      const userFilteredAttendance = filterRecordsForUser(currentUser, rawAList, studentClassMap);
      const userFilteredKas = filterRecordsForUser(currentUser, kasList, studentClassMap);
      const userFilteredTasks = filterRecordsForUser(currentUser, taskListRaw, studentClassMap);

      setAllStudents(userFilteredStudents);
      setAllGrades(userFilteredGrades);
      setAllAttendance(userFilteredAttendance);

      const uniqueClassesAll = Array.from(new Set(sList.map(s => s.kelas).filter(Boolean)));
      const uniqueClasses = isRestrictedClass
        ? uniqueClassesAll.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
        : uniqueClassesAll;
      setAvailableClasses(uniqueClasses);

      if (isRestrictedClass && uniqueClasses.length > 0 && (filterKelas === 'Semua' || !uniqueClasses.includes(filterKelas))) {
        if (uniqueClasses[0] && filterKelas !== uniqueClasses[0]) {
          setFilterKelas(uniqueClasses[0]);
        }
      }

      const totalAlumni = userFilteredStudents.filter(s => s.kelas && s.kelas.toLowerCase() === 'alumni').length;
      const activeClassesCount = uniqueClasses.filter(c => c && c.toLowerCase() !== 'alumni').length;

      let filteredStudents = userFilteredStudents;
      if (filterKelas === 'Semua') {
        filteredStudents = userFilteredStudents.filter(s => !s.kelas || s.kelas.toLowerCase() !== 'alumni');
      } else {
        filteredStudents = userFilteredStudents.filter(s => s.kelas && s.kelas.trim().toLowerCase() === filterKelas.trim().toLowerCase());
      }

      // Filter Kas entries strictly by selected class or assigned class
      let classFilteredKas = userFilteredKas;
      if (filterKelas !== 'Semua') {
        classFilteredKas = userFilteredKas.filter(k => {
          const kClass = k.kelas || (k.id_siswa ? studentClassMap[k.id_siswa] : undefined);
          if (!kClass) return false;
          return kClass.trim().toLowerCase() === filterKelas.trim().toLowerCase();
        });
      } else if (isRestrictedClass) {
        classFilteredKas = userFilteredKas.filter(k => {
          const kClass = k.kelas || (k.id_siswa ? studentClassMap[k.id_siswa] : undefined);
          if (!kClass) return false;
          return assignedClasses.some(ac => ac.trim().toLowerCase() === kClass.trim().toLowerCase());
        });
      }

      // Process Kas entries for Cash Flow stats & chart
      let kasMasuk = 0;
      let kasKeluar = 0;
      const monthlyKasMap: Record<string, { bulan: string; pemasukan: number; pengeluaran: number; saldo: number }> = {};

      classFilteredKas.forEach(k => {
        const amt = Number(k.nominal ?? k.jumlah) || 0;
        const isMasuk = k.jenis === 'Pemasukan' || k.jenis === 'masuk';
        const isKeluar = k.jenis === 'Pengeluaran' || k.jenis === 'keluar';

        if (isMasuk) {
          kasMasuk += amt;
        } else if (isKeluar) {
          kasKeluar += amt;
        }

        if (k.tanggal) {
          try {
            const d = parseISO(k.tanggal);
            if (!isNaN(d.getTime())) {
              const monthKey = format(d, 'MMM yyyy', { locale: id });
              if (!monthlyKasMap[monthKey]) {
                monthlyKasMap[monthKey] = { bulan: monthKey, pemasukan: 0, pengeluaran: 0, saldo: 0 };
              }
              if (isMasuk) monthlyKasMap[monthKey].pemasukan += amt;
              else if (isKeluar) monthlyKasMap[monthKey].pengeluaran += amt;
              monthlyKasMap[monthKey].saldo = monthlyKasMap[monthKey].pemasukan - monthlyKasMap[monthKey].pengeluaran;
            }
          } catch (e) {}
        }
      });

      const sortedKas = [...classFilteredKas].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
      setRecentKas(sortedKas.slice(0, 15));

      setKasStats({
        totalPemasukan: kasMasuk,
        totalPengeluaran: kasKeluar,
        saldoKas: kasMasuk - kasKeluar,
        totalTransactions: classFilteredKas.length
      });
      setKasChartData(Object.values(monthlyKasMap));
      setIsKasLoading(false);

      // Student match helper
      const studentMatchSet = new Set<string>();
      filteredStudents.forEach(s => {
        if (s.id) studentMatchSet.add(String(s.id).trim().toLowerCase());
        if (s.nisn) studentMatchSet.add(String(s.nisn).trim().toLowerCase());
        if (s.nipd) studentMatchSet.add(String(s.nipd).trim().toLowerCase());
        if (s.nama) studentMatchSet.add(String(s.nama).trim().toLowerCase());
      });

      const isStudentMatch = (sId?: string, sNisn?: string, sNama?: string) => {
        if (sId && studentMatchSet.has(String(sId).trim().toLowerCase())) return true;
        if (sNisn && studentMatchSet.has(String(sNisn).trim().toLowerCase())) return true;
        if (sNama && studentMatchSet.has(String(sNama).trim().toLowerCase())) return true;
        return false;
      };

      const checkSemMatch = (vSemStr?: string) => {
        const vSem = String(vSemStr || '').toLowerCase().trim();
        const sSem = String(semester || '').toLowerCase().trim();
        return !vSem || !sSem || vSem === sSem || vSem.includes(sSem) || sSem.includes(vSem);
      };

      const aList: Attendance[] = [];
      const today = new Date();

      let startDate = new Date(2000, 0, 1);
      let endDate = new Date(2100, 0, 1);

      if (filterWaktu === 'Hari Ini') {
        startDate = today;
        endDate = today;
      } else if (filterWaktu === 'Minggu Ini') {
        startDate = startOfWeek(today);
        endDate = endOfWeek(today);
      } else if (filterWaktu === 'Bulan Ini') {
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
      } else if (filterWaktu === 'Kustom') {
        startDate = parseISO(customStartDate);
        endDate = parseISO(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      }

      userFilteredAttendance.forEach((v) => {
        if (!checkSemMatch(v.semester)) return;
        if (filterMapel !== 'Semua' && v.mata_pelajaran && v.mata_pelajaran !== filterMapel) return;

        const attDate = new Date(v.tanggal);
        if (filterWaktu === 'Semester' || !v.tanggal) {
          aList.push(v);
        } else if (isWithinInterval(attDate, { start: startDate, end: endDate })) {
          aList.push(v);
        }
      });

      const gList: Grade[] = [];
      userFilteredGrades.forEach((v) => {
        if (!checkSemMatch(v.semester)) return;
        if (filterMapel !== 'Semua' && v.mata_pelajaran && v.mata_pelajaran !== filterMapel) return;

        if (filterWaktu === 'Semester' || !v.tanggal) {
          gList.push(v);
        } else {
          const gDate = new Date(v.tanggal);
          if (isWithinInterval(gDate, { start: startDate, end: endDate })) {
            gList.push(v);
          }
        }
      });

      const filteredAList = aList.filter(a => isStudentMatch(a.id_siswa, a.nisn, a.nama));
      const filteredGList = gList.filter(g => isStudentMatch(g.id_siswa, g.nisn, g.nama));

      const presentCount = filteredAList.filter(a => a.status === 'Hadir').length;
      const attendancePerc = filteredStudents.length > 0 && filteredAList.length > 0 ? (presentCount / filteredAList.length) * 100 : 0;

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayAttendance = userFilteredAttendance.filter(a => String(a.tanggal || '').substring(0, 10) === todayStr && checkSemMatch(a.semester));
      const filteredTodayAttendance = todayAttendance.filter(a => isStudentMatch(a.id_siswa, a.nisn, a.nama));
      const presentToday = filteredTodayAttendance.filter(a => a.status === 'Hadir').length;
      const attendanceTodayPerc = filteredStudents.length > 0 && filteredTodayAttendance.length > 0
        ? (presentToday / filteredTodayAttendance.length) * 100
        : -1;

      const validGrades = filteredGList.filter(g => g.nilai !== undefined && g.nilai !== null && !isNaN(Number(g.nilai)));
      const avgG = validGrades.length > 0 ? validGrades.reduce((a, b) => a + Number(b.nilai), 0) / validGrades.length : 0;

      // Weekly Attendance calculation
      const startOfCurWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
      const endOfCurWeek = endOfWeek(new Date(), { weekStartsOn: 1 });
      const weeklyAttendances = userFilteredAttendance.filter(a => {
        if (!checkSemMatch(a.semester)) return false;

        if (filterKelas !== 'Semua') {
          const studentObj = userFilteredStudents.find(s => isStudentMatch(a.id_siswa, a.nisn, a.nama));
          if (!studentObj || studentObj.kelas !== filterKelas) return false;
        } else {
          const studentObj = userFilteredStudents.find(s => isStudentMatch(a.id_siswa, a.nisn, a.nama));
          if (!studentObj || (studentObj.kelas && studentObj.kelas.toLowerCase() === 'alumni')) return false;
        }

        try {
          const d = parseISO(a.tanggal);
          return isWithinInterval(d, { start: startOfCurWeek, end: endOfCurWeek });
        } catch (e) {
          return false;
        }
      });
      const weeklyPresent = weeklyAttendances.filter(a => a.status === 'Hadir').length;
      const weeklyTotal = weeklyAttendances.length;
      const weeklyAttendancePerc = weeklyTotal > 0 ? (weeklyPresent / weeklyTotal) * 100 : -1;
      setWeeklyAttendance(weeklyAttendancePerc);

      // Student warning list
      const attentionList: any[] = [];
      filteredStudents.forEach(s => {
        if (s.kelas && s.kelas.toLowerCase() === 'alumni') return;

        const sGrades = userFilteredGrades.filter(g => (g.id_siswa === s.id || (s.nisn && g.nisn === s.nisn) || (s.nama && g.nama === s.nama)) && checkSemMatch(g.semester) && g.nilai > 0);
        const avgGrade = sGrades.length > 0
          ? sGrades.reduce((acc, curr) => acc + curr.nilai, 0) / sGrades.length
          : null;

        const hasBelowKKM = sGrades.some(g => g.nilai < 75);
        const belowKKMSubjects = sGrades.filter(g => g.nilai < 75).map(g => `${g.mata_pelajaran || 'Umum'} (${g.nama_kolom}: ${g.nilai})`);

        const sAtt = userFilteredAttendance.filter(a => (a.id_siswa === s.id || (s.nisn && a.nisn === s.nisn) || (s.nama && a.nama === s.nama)) && checkSemMatch(a.semester));
        const totalAtt = sAtt.length;
        const hadirAtt = sAtt.filter(a => a.status === 'Hadir').length;
        const studentAttendancePerc = totalAtt > 0 ? (hadirAtt / totalAtt) * 100 : null;

        const isLowAttendance = studentAttendancePerc !== null && studentAttendancePerc < 80;
        const isLowGrade = avgGrade !== null && (avgGrade < 75 || hasBelowKKM);

        if (isLowGrade || isLowAttendance) {
          let tipe: 'nilai' | 'absen' | 'keduanya' = 'nilai';
          if (isLowGrade && isLowAttendance) tipe = 'keduanya';
          else if (isLowAttendance) tipe = 'absen';

          const detailNilai = belowKKMSubjects.length > 0
            ? `Nilai di bawah KKM: ${belowKKMSubjects.slice(0, 2).join(', ')}${belowKKMSubjects.length > 2 ? '...' : ''}`
            : avgGrade !== null && avgGrade < 75
              ? `Rata-rata nilai (${avgGrade.toFixed(1)}) di bawah KKM (75)`
              : undefined;

          const detailAbsen = studentAttendancePerc !== null
            ? `Kehadiran ${studentAttendancePerc.toFixed(1)}% (di bawah target 80%)`
            : undefined;

          attentionList.push({
            id: s.id,
            nama: s.nama,
            kelas: s.kelas || '',
            tipe,
            detailNilai,
            detailAbsen,
            nilaiRata: avgGrade !== null ? Number(avgGrade.toFixed(1)) : undefined,
            absenPersen: studentAttendancePerc !== null ? Number(studentAttendancePerc.toFixed(1)) : undefined
          });
        }
      });
      setStudentsAttention(attentionList);

      // Class Achievement Tier Distribution
      let sbCount = 0;
      let bCount = 0;
      let pbCount = 0;
      let totalEval = 0;

      const studentGradesMap = new Map<string, number[]>();

      rawGList.forEach(g => {
        if (!checkSemMatch(g.semester)) return;
        if (filterMapel !== 'Semua' && g.mata_pelajaran && g.mata_pelajaran !== filterMapel) return;
        if (g.nilai <= 0) return;

        const matchedStudent = filteredStudents.find(s =>
          (g.id_siswa && s.id === g.id_siswa) ||
          (s.nisn && g.nisn && String(s.nisn).trim() === String(g.nisn).trim()) ||
          (s.nama && g.nama && s.nama.toLowerCase().trim() === g.nama.toLowerCase().trim())
        ) || sList.find(s =>
          (g.id_siswa && s.id === g.id_siswa) ||
          (s.nisn && g.nisn && String(s.nisn).trim() === String(g.nisn).trim()) ||
          (s.nama && g.nama && s.nama.toLowerCase().trim() === g.nama.toLowerCase().trim())
        );

        if (matchedStudent) {
          if (matchedStudent.kelas && matchedStudent.kelas.toLowerCase() === 'alumni') return;
          if (filterKelas !== 'Semua' && matchedStudent.kelas !== filterKelas) return;

          const key = matchedStudent.id || matchedStudent.nisn || matchedStudent.nama;
          if (!studentGradesMap.has(key)) {
            studentGradesMap.set(key, []);
          }
          studentGradesMap.get(key)!.push(g.nilai);
        } else if (filterKelas === 'Semua') {
          const sKey = g.nama || g.id_siswa || g.nisn;
          if (sKey) {
            if (!studentGradesMap.has(sKey)) {
              studentGradesMap.set(sKey, []);
            }
            studentGradesMap.get(sKey)!.push(g.nilai);
          }
        }
      });

      studentGradesMap.forEach((gradeVals) => {
        if (gradeVals.length > 0) {
          totalEval++;
          const avg = gradeVals.reduce((a, b) => a + b, 0) / gradeVals.length;
          if (avg >= 85) sbCount++;
          else if (avg >= 75) bCount++;
          else pbCount++;
        }
      });

      setClassAchievementStats({
        sangatBaik: sbCount,
        baik: bCount,
        perluBimbingan: pbCount,
        totalEvaluated: totalEval,
        chartData: [
          { name: 'Sangat Baik (≥85)', value: sbCount, color: '#10b981' },
          { name: 'Baik (75-84)', value: bCount, color: '#3b82f6' },
          { name: 'Perlu Bimbingan (<75)', value: pbCount, color: '#f43f5e' }
        ].filter(d => d.value > 0)
      });

      setStats({
        totalStudents: filteredStudents.length,
        classes: activeClassesCount,
        attendanceToday: attendancePerc,
        attendanceTodayOnly: attendanceTodayPerc,
        avgGrades: avgG,
        totalAlumni
      });

      // Today Roster and Piket
      const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const todayDayName = INDO_DAYS[new Date().getDay()];

      const todayRoster = rosterListRaw
        .filter(v => v.semester === semester && (filterKelas === 'Semua' || v.kelas === filterKelas) && v.hari === todayDayName)
        .sort((a, b) => (a.jam_mulai || '').localeCompare(b.jam_mulai || ''));

      const todayPiket = piketListRaw
        .filter(v => v.semester === semester && (filterKelas === 'Semua' || v.kelas === filterKelas) && v.hari === todayDayName)
        .map(p => {
          const studentObj = filteredStudents.find(s => s.id === p.id_siswa);
          return {
            ...p,
            nama_siswa: studentObj ? studentObj.nama : 'Siswa'
          };
        });

      setRosterToday(todayRoster);
      setPiketToday(todayPiket);

      const todayDateStr = format(new Date(), 'yyyy-MM-dd');
      const dueToday = taskListRaw.filter(v => v.semester === semester && (filterKelas === 'Semua' || v.kelas === filterKelas) && v.tanggal_kumpul === todayDateStr);
      setTasksToday(dueToday);

      const activeHolidays = currentSettings?.holidays || [];
      const todayDate = new Date();
      const next30Days = new Date();
      next30Days.setDate(todayDate.getDate() + 30);

      const filteredHols = activeHolidays.filter(h => {
        try {
          const start = parseISO(h.tanggal_mulai);
          const end = parseISO(h.tanggal_selesai);
          return (start >= todayDate && start <= next30Days) || (end >= todayDate && end <= next30Days) || (start <= todayDate && end >= todayDate);
        } catch (e) {
          return false;
        }
      });
      setUpcomingHolidays(filteredHols);

      // Pie chart data
      const statusCounts = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
      filteredAList.forEach(a => {
        if (a.status in statusCounts) {
          statusCounts[a.status as keyof typeof statusCounts]++;
        }
      });
      setAttendanceChartData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      // Subject chart data
      const mapelAvg: Record<string, { sum: number; count: number }> = {};
      filteredGList.forEach(g => {
        const mapel = g.mata_pelajaran || 'Umum';
        if (g.nilai > 0) {
          if (!mapelAvg[mapel]) {
            mapelAvg[mapel] = { sum: 0, count: 0 };
          }
          mapelAvg[mapel].sum += g.nilai;
          mapelAvg[mapel].count++;
        }
      });
      const mapelChartData = Object.entries(mapelAvg).map(([name, val]) => ({
        name,
        'Rata-rata': Number((val.sum / val.count).toFixed(1))
      })).sort((a, b) => b['Rata-rata'] - a['Rata-rata']);
      setSubjectChartData(mapelChartData);

      // Trends
      const attTrendMap: Record<string, { total: number; hadir: number }> = {};
      filteredAList.forEach(a => {
        if (!a.tanggal) return;
        const dateStr = a.tanggal;
        if (!attTrendMap[dateStr]) {
          attTrendMap[dateStr] = { total: 0, hadir: 0 };
        }
        attTrendMap[dateStr].total++;
        if (a.status === 'Hadir') {
          attTrendMap[dateStr].hadir++;
        }
      });

      const attTrendData = Object.entries(attTrendMap)
        .map(([date, val]) => {
          let formatted = date;
          try {
            formatted = format(parseISO(date), 'dd MMM');
          } catch (e) {}
          return {
            tanggal: date,
            formattedTanggal: formatted,
            'Persentase Hadir': Number(((val.hadir / val.total) * 100).toFixed(1))
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      setAttendanceTrendData(attTrendData);

      const currentActiveKKM = filterMapel !== 'Semua'
        ? getSubjectKKM(filterMapel, currentSettings)
        : (currentSettings?.kkm_bulanan || 75);

      const grTrendMap: Record<string, { sum: number; count: number; label: string; dateKey: string }> = {};
      const hasDatedGrades = filteredGList.filter(g => g.tanggal && g.nilai > 0).length >= 2;

      filteredGList.forEach(g => {
        if (g.nilai <= 0) return;
        let groupKey = '';
        let label = '';

        if (hasDatedGrades && g.tanggal) {
          groupKey = g.tanggal;
          try {
            label = format(parseISO(g.tanggal), 'dd MMM');
          } catch (e) {
            label = g.tanggal;
          }
        } else {
          groupKey = (g.jenis_nilai ? `${g.jenis_nilai}: ` : '') + (g.nama_kolom || 'Nilai');
          label = g.nama_kolom || 'Nilai';
        }

        if (!grTrendMap[groupKey]) {
          grTrendMap[groupKey] = { sum: 0, count: 0, label, dateKey: g.tanggal || groupKey };
        }
        grTrendMap[groupKey].sum += g.nilai;
        grTrendMap[groupKey].count++;
      });

      const grTrendData = Object.entries(grTrendMap)
        .map(([key, val]) => {
          return {
            tanggal: key,
            formattedTanggal: val.label,
            'Rata-rata': Number((val.sum / val.count).toFixed(1)),
            'KKM': currentActiveKKM
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      setGradeTrendData(grTrendData);
    } catch (err) {
      console.error("Error loading stats:", err);
    } finally {
      setIsLoading(false);
      isInitialLoadDone.current = true;
    }
  }, [semester, filterKelas, filterWaktu, customStartDate, customEndDate, filterMapel]);

  useEffect(() => {
    loadStats();
  }, [loadStats, dataVersion]);

  // Listen for sync status changes & auto-update dashboard stats when sync completes
  useEffect(() => {
    const handleSyncCompleteOrDataChange = () => {
      loadStats();
    };

    window.addEventListener('data-changed', handleSyncCompleteOrDataChange);

    return () => {
      window.removeEventListener('data-changed', handleSyncCompleteOrDataChange);
    };
  }, [loadStats]);

  // Automatically refresh stats when isSyncing transitions from true to false
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing) {
      loadStats();
      verifyFirestoreReferenceIntegrity().then(summary => setRefSummary(summary)).catch(() => {});
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, loadStats]);

  // Check if charts have any data
  const hasAttendanceData = attendanceChartData.some(d => d.value > 0);
  const hasSubjectData = subjectChartData.length > 0;

  const getQueueItemDetails = (item: { store: string; id: string; action: string }, studentsList: Student[], gradesList: Grade[], attendanceList: Attendance[]) => {
    const actionLabel = item.action === 'delete' ? 'Hapus' : 'Ubah';
    let targetName = 'Data';
    let desc = `ID: ${item.id}`;

    if (item.store === 'students') {
      targetName = 'Siswa';
      const std = studentsList.find(s => s.id === item.id);
      if (std) desc = std.nama;
    } else if (item.store === 'grades') {
      targetName = 'Nilai';
      const gr = gradesList.find(g => g.id === item.id);
      if (gr) {
        const std = studentsList.find(s => s.id === gr.id_siswa);
        desc = `${std ? std.nama : 'Siswa'} - ${gr.mata_pelajaran || 'Umum'} (${gr.nama_kolom}: ${gr.nilai})`;
      }
    } else if (item.store === 'attendance') {
      targetName = 'Absen';
      const att = attendanceList.find(a => a.id === item.id);
      if (att) {
        const std = studentsList.find(s => s.id === att.id_siswa);
        desc = `${std ? std.nama : 'Siswa'} - ${att.tanggal} (${att.status})`;
      }
    }

    return { targetName, actionLabel, desc };
  };

  const getWhatsAppTemplate = (
    student: any,
    teacherName: string,
    schoolName: string,
    type: 'akademik' | 'kehadiran' | 'keduanya' | 'kustom'
  ) => {
    const sName = student.nama || '';
    const sClass = student.kelas || '';
    const tName = teacherName || 'Wali Kelas';
    const schName = schoolName || 'Sekolah';
    const aPersen = student.absenPersen !== undefined ? `${student.absenPersen}%` : '-';

    if (type === 'akademik') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin menginformasikan mengenai perkembangan hasil belajar akademik ${sName} di kelas ${sClass}.\n\nSaat ini, rata-rata nilai akademik ${sName} memerlukan perhatian khusus karena berada di bawah batas Kriteria Ketuntasan Minimal (KKM). ${student.detailNilai ? `(${student.detailNilai})` : ''}\n\nMohon bantuannya untuk mendampingi, memberikan bimbingan, serta memotivasi putra/putri Bapak/Ibu saat belajar di rumah agar dapat memperbaiki nilai-nilainya.\n\nTerima kasih atas perhatian dan kerja samanya. 🙏`;
    }
    
    if (type === 'kehadiran') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin menginformasikan mengenai tingkat kehadiran ${sName} di sekolah.\n\nSaat ini persentase kehadiran ${sName} di kelas adalah ${aPersen}, yang mana berada di bawah target minimal 80%. Kehadiran yang rutin sangat penting untuk memastikan kelancaran proses pembelajaran putra/putri Bapak/Ibu.\n\nMohon bantuan dan kerja samanya untuk memotivasi serta memastikan ${sName} dapat hadir ke sekolah secara rutin dan tepat waktu.\n\nTerima kasih banyak atas perhatian Bapak/Ibu. 🙏`;
    }
    
    if (type === 'keduanya') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin berkonsultasi mengenai perkembangan putra/putri Bapak/Ibu, ${sName}.\n\nKami mendapati bahwa saat ini ${sName} memerlukan dukungan dan perhatian ekstra, baik di bidang kehadiran maupun hasil belajar akademik. Tingkat kehadirannya saat ini ${aPersen} (di bawah target 80%), serta terdapat beberapa capaian nilai yang berada di bawah KKM. ${student.detailNilai ? `(${student.detailNilai})` : ''}\n\nKami sangat mengharapkan kerja sama Bapak/Ibu untuk memberikan perhatian lebih, membimbing belajarnya di rumah, serta memastikan kesiapannya hadir ke sekolah secara rutin.\n\nTerima kasih atas perhatian dan kerja samanya. 🙏`;
    }

    return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin bersilaturahmi sekaligus menginformasikan perkembangan ${sName} di kelas ${sClass}.\n\n[Tulis pesan kustom Anda di sini]\n\nTerima kasih atas perhatian Bapak/Ibu. 🙏`;
  };

  const handleContactParent = (studentId: string, studentName: string) => {
    const student = allStudents.find(s => s.id === studentId);
    const alert = studentsAttention.find(a => a.id === studentId);
    if (student) {
      const parentPhone = student.no_telp_ortu || '';
      if (parentPhone) {
        const combined = {
          ...student,
          tipe: alert?.tipe || 'kustom',
          detailNilai: alert?.detailNilai,
          detailAbsen: alert?.detailAbsen,
          nilaiRata: alert?.nilaiRata,
          absenPersen: alert?.absenPersen
        };

        const defaultType = alert?.tipe === 'nilai' ? 'akademik' : alert?.tipe === 'absen' ? 'kehadiran' : alert?.tipe === 'keduanya' ? 'keduanya' : 'kustom';

        setSelectedContactStudent(combined);
        setSelectedTemplateType(defaultType);
        
        const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
        const schoolName = settings?.nama_sekolah || 'Sekolah';
        const initialText = getWhatsAppTemplate(combined, teacherName, schoolName, defaultType);
        setEditedMessage(initialText);
      } else {
        toast.error(`Nomor telepon orang tua untuk ${studentName} belum dicatat.`);
      }
    }
  };

  // Uses formatWhatsAppNumber from ../lib/WhatsAppSender

  const handleTemplateTypeChange = (type: 'akademik' | 'kehadiran' | 'keduanya' | 'kustom') => {
    setSelectedTemplateType(type);
    if (selectedContactStudent) {
      const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
      const schoolName = settings?.nama_sekolah || 'Sekolah';
      const text = getWhatsAppTemplate(selectedContactStudent, teacherName, schoolName, type);
      setEditedMessage(text);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col gap-6 text-slate-200">
      {/* Background Syncing Banner (Non-intrusive) */}
      {isSyncing && (
        <div className="bg-indigo-950/60 border border-indigo-500/40 p-3 px-4 rounded-2xl flex items-center justify-between shadow-lg backdrop-blur-md animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-indigo-200">
              Sinkronisasi data latar belakang sedang berlangsung... Dashboard tetap aktif dan dapat digunakan.
            </span>
          </div>
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-mono font-medium shrink-0">
            Background Sync
          </span>
        </div>
      )}

      {/* Firestore Reference & Parent ID Integrity Summary Card */}
      {refSummary && (
        <div className={`p-4 rounded-2xl border backdrop-blur-md shadow-lg transition-all ${
          refSummary.totalOrphanRecords > 0 || refSummary.classReferenceIssues.length > 0
            ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${
                refSummary.totalOrphanRecords > 0 || refSummary.classReferenceIssues.length > 0
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              }`}>
                {refSummary.totalOrphanRecords > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-100">
                    Integritas Relasi Referensi & Parent ID
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    refSummary.totalOrphanRecords > 0 || refSummary.classReferenceIssues.length > 0
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  }`}>
                    {refSummary.totalOrphanRecords === 0 && refSummary.classReferenceIssues.length === 0
                      ? '100% Valid & Terhubung'
                      : `${refSummary.totalOrphanRecords} Rekord Yatim / Anomali`}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {refSummary.totalOrphanRecords === 0 && refSummary.classReferenceIssues.length === 0
                    ? 'Seluruh data nilai, absensi, roster, dan piket terhubung dengan ID Kelas & ID Siswa induk yang valid.'
                    : `Terdeteksi ${refSummary.classReferenceIssues.length} masalah ID Kelas hilang/dihapus dan ${refSummary.studentReferenceIssues.length} data tanpa ID Siswa induk.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isCheckingRef}
                onClick={async () => {
                  setIsCheckingRef(true);
                  const res = await verifyFirestoreReferenceIntegrity();
                  setRefSummary(res);
                  setIsCheckingRef(false);
                  toast.success('Pemeriksaan integritas referensi selesai!');
                }}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold rounded-xl border border-slate-600/50 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isCheckingRef ? 'animate-spin' : ''} />
                <span>{isCheckingRef ? 'Memeriksa...' : 'Verifikasi Ulang'}</span>
              </button>
            </div>
          </div>

          {(refSummary.classReferenceIssues.length > 0 || refSummary.studentReferenceIssues.length > 0) && (
            <div className="mt-3 pt-3 border-t border-amber-500/30 text-xs space-y-1.5">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>Rincian Anomali Relasi Parent ID:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] max-h-28 overflow-y-auto custom-scrollbar">
                {refSummary.classReferenceIssues.map((iss, i) => (
                  <li key={`cls-${i}`} className="text-amber-200">{iss}</li>
                ))}
                {refSummary.studentReferenceIssues.slice(0, 5).map((iss, i) => (
                  <li key={`std-${i}`} className="text-rose-200">{iss}</li>
                ))}
                {refSummary.studentReferenceIssues.length > 5 && (
                  <li className="text-slate-400 italic">...dan {refSummary.studentReferenceIssues.length - 5} anomali ID siswa lainnya.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Wali Kelas Dashboard Banner */}
      {(() => {
        const u = getCurrentUser();
        const assigned = getAssignedClasses(u);
        const isRestricted = !assigned.includes('*');
        if (!isRestricted && u?.role !== 'wali_kelas') return null;

        const classLabel = assigned.includes('*') ? 'Semua Kelas' : assigned.join(', ');
        return (
          <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-indigo-950/90 border border-emerald-500/40 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
                <Users size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Wali Kelas Dashboard
                  </span>
                  <span className="text-xs text-emerald-400 font-mono font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60">
                    Kelas Binaan: {classLabel}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-1">
                  Dashboard Otomatis Rombel {classLabel}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Menampilkan data terfilter khusus untuk siswa, absensi, nilai, tugas, dan kas kelas binaan {u?.name || u?.username || 'Wali Kelas'}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
              <div className="bg-slate-900/80 border border-slate-700/60 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono font-semibold">Total Siswa Binaan</p>
                  <p className="font-bold text-emerald-300 text-sm">{allStudents.length} Siswa</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive Header Filters with Glassmorphism */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter size={18} />
            <span className="text-sm font-medium uppercase tracking-wider">Filter Dashboard:</span>
          </div>
          
          <select 
            value={filterKelas}
            onChange={e => setFilterKelas(e.target.value)}
            className="px-4 py-2 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
          >
            <option value="Semua">Semua Kelas</option>
            {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <select 
              value={filterWaktu}
              onChange={e => {
                const val = e.target.value as any;
                setFilterWaktu(val);
                toast.success(`Filter rentang waktu diubah ke: ${val}`, { id: 'time-filter-toast', icon: '🗓️' });
              }}
              className="px-4 py-2 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
            >
              <option value="Semester">Semester Ini</option>
              <option value="Hari Ini">Hari Ini</option>
              <option value="Minggu Ini">Minggu Ini</option>
              <option value="Bulan Ini">Bulan Ini</option>
              <option value="Kustom">Kustom</option>
            </select>

            {filterWaktu === 'Kustom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
                <span className="text-slate-500">-</span>
                <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                let rangeLabel: string = filterWaktu;
                if (filterWaktu === 'Kustom') {
                  rangeLabel = `${customStartDate || 'Awal'} s/d ${customEndDate || 'Akhir'}`;
                }
                toast.success(`Data dashboard disesuaikan dengan rentang waktu: ${rangeLabel} (${filterKelas === 'Semua' ? 'Semua Kelas' : 'Kelas ' + filterKelas})`, {
                  id: 'confirm-filter-toast',
                  icon: '✅',
                  duration: 4000
                });
              }}
              className="ml-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 border border-indigo-400/30 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              title="Konfirmasi & Terapkan Filter Waktu"
            >
              <CheckCircle2 size={14} />
              <span>Terapkan Filter</span>
            </button>

            {/* Quick Action: Naik Kelas */}
            <button
              type="button"
              onClick={() => setIsNaikKelasOpen(true)}
              className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 border border-emerald-400/30 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              title="Buka Sistem Naik Kelas & Kelulusan"
            >
              <GraduationCap size={15} />
              <span>Sistem Naik Kelas</span>
            </button>
          </div>
        </div>

        {/* Visual Style Theme Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Color Theme Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/60">
            <span className="text-xs font-semibold text-slate-400 px-2 flex items-center gap-1">
              <BarChart2 size={14} className="text-indigo-400" /> Tema:
            </span>
            <button
              type="button"
              onClick={() => handleThemeChange('professional')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartTheme === 'professional'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Professional
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('high_contrast')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartTheme === 'high_contrast'
                  ? 'bg-yellow-400 text-slate-950 font-bold shadow-lg shadow-yellow-400/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              High Contrast
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Active Filter Confirmation Banner */}
      <div className="bg-slate-800/60 border border-indigo-500/30 px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-200 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
          <span>
            <strong>Filter Rentang Waktu Aktif:</strong> Data yang ditampilkan telah disesuaikan berdasarkan rentang waktu{' '}
            <strong className="text-amber-300 font-bold">
              {filterWaktu === 'Kustom' ? `${customStartDate || 'Tanggal Awal'} s/d ${customEndDate || 'Tanggal Akhir'}` : filterWaktu}
            </strong>
            {' '}• Kelas: <strong className="text-indigo-300 font-bold">{filterKelas}</strong>
            {' '}• Mapel: <strong className="text-indigo-300 font-bold">{filterMapel}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Data Tersaring Sesuai Periode
          </span>
        </div>
      </div>

      {/* Summary Cards Grid with Glassmorphism - 2 Rows Layout */}
      {isLoading ? (
        <CardGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Total Siswa Aktif</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><Users size={20} /></div>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{stats.totalStudents}</h3>
          <div className="mt-2 text-xs text-indigo-400 font-medium">{filterKelas === 'Semua' ? `${stats.classes} Kelas Aktif` : `Kelas ${filterKelas}`}</div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Siswa Non Aktif</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg"><Users size={20} /></div>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{stats.totalAlumni}</h3>
          <div className="mt-2 text-xs text-rose-400 font-medium">Total Alumni/Lulus</div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Kehadiran Hari Ini</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><CheckSquare size={20} /></div>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">
            {stats.attendanceTodayOnly === -1 ? 'Belum Diisi' : `${safeNum(stats.attendanceTodayOnly)}%`}
          </h3>
          <div className="mt-2 text-xs text-emerald-400 font-medium">Rata-rata {filterWaktu}: {safeNum(stats.attendanceToday)}%</div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Kehadiran Mingguan</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><Clock size={20} /></div>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">
            {weeklyAttendance === -1 ? 'Belum Diisi' : `${safeNum(weeklyAttendance)}%`}
          </h3>
          <div className="mt-2 text-xs text-indigo-400 font-medium">Rata-rata minggu berjalan</div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Rata-rata Nilai</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><TrendingUp size={20} /></div>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{safeNum(stats.avgGrades)}</h3>
          <div className="mt-2 text-xs text-amber-400 italic font-medium">Keseluruhan Tugas & Harian</div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm font-medium">Saldo Kas Kelas</p>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Sync</span>
                </span>
              )}
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Wallet size={20} /></div>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-100 font-mono truncate">
            Rp {(displayKas.saldoKas).toLocaleString('id-ID')}
          </h3>
          <div className="mt-2 text-xs text-slate-400 flex justify-between gap-1 font-mono">
            <span className="text-emerald-400 font-medium">In: Rp {(displayKas.totalPemasukan).toLocaleString('id-ID')}</span>
            <span className="text-rose-400 font-medium">Out: Rp {(displayKas.totalPengeluaran).toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="relative overflow-hidden bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50 sm:col-span-2 lg:col-span-2 flex flex-col justify-between">
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse rounded-t-2xl z-10" />
          )}
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-400 text-sm font-medium">Sinkronisasi Database</p>
            <div className={`p-2 rounded-lg ${syncStats.unsyncedCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
              <Cloud size={20} className={syncStats.unsyncedCount > 0 || isSyncing ? 'animate-pulse' : ''} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-100">{syncStats.percentage}%</h3>
            <span className="text-xs text-slate-400 font-medium">Tersinkron dengan Cloud</span>
          </div>
          
          <div className="mt-3 space-y-1.5">
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${syncStats.unsyncedCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${syncStats.percentage}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                {isSyncing ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
                    <span className="text-indigo-300 font-semibold">Proses sinkronisasi berjalan di latar belakang...</span>
                  </>
                ) : syncStats.unsyncedCount > 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    <span className="text-amber-400 font-semibold">{syncStats.unsyncedCount} antrean data belum terkirim</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="text-emerald-400 font-semibold">Semua data tersimpan aman</span>
                  </>
                )}
              </span>
              <span className="font-mono text-[11px]">({syncStats.totalItems - syncStats.unsyncedCount}/{syncStats.totalItems} item)</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Dashboard Ringkasan Visual Statistik & Pencapaian Kelas (Wali Kelas) */}
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-emerald-400 w-5 h-5" />
            <div>
              <h3 className="text-md font-semibold text-slate-100">Ringkasan Statistik & Distribusi Pencapaian Siswa</h3>
              <p className="text-xs text-slate-400">Evaluasi visual tingkat kelulusan/ketercapaian KKM siswa untuk wali kelas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full">
              Total Dievaluasi: {classAchievementStats.totalEvaluated} Siswa
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Recharts Pie Donut Chart */}
          <div className="min-h-52 relative flex items-center justify-center">
            {classAchievementStats.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={classAchievementStats.chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {classAchievementStats.chartData.map((entry, index) => (
                      <Cell key={`cell-tier-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-slate-500 text-xs py-10">Belum ada data nilai terevaluasi</div>
            )}
          </div>

          {/* Breakdown KPI Cards */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Sangat Baik (≥85)</span>
                <h4 className="text-2xl font-black text-slate-100 mt-1">{classAchievementStats.sangatBaik} Siswa</h4>
              </div>
              <p className="text-[11px] text-emerald-300/80 mt-2">
                {classAchievementStats.totalEvaluated > 0 
                  ? `${((classAchievementStats.sangatBaik / classAchievementStats.totalEvaluated) * 100).toFixed(1)}% dari kelas`
                  : '0%'}
              </p>
            </div>

            <div className="bg-blue-950/20 border border-blue-500/30 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Baik (75 - 84)</span>
                <h4 className="text-2xl font-black text-slate-100 mt-1">{classAchievementStats.baik} Siswa</h4>
              </div>
              <p className="text-[11px] text-blue-300/80 mt-2">
                {classAchievementStats.totalEvaluated > 0 
                  ? `${((classAchievementStats.baik / classAchievementStats.totalEvaluated) * 100).toFixed(1)}% dari kelas`
                  : '0%'}
              </p>
            </div>

            <div className="bg-rose-950/20 border border-rose-500/30 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Perlu Bimbingan (&lt;75)</span>
                <h4 className="text-2xl font-black text-slate-100 mt-1">{classAchievementStats.perluBimbingan} Siswa</h4>
              </div>
              <p className="text-[11px] text-rose-300/80 mt-2">
                {classAchievementStats.totalEvaluated > 0 
                  ? `${((classAchievementStats.perluBimbingan / classAchievementStats.totalEvaluated) * 100).toFixed(1)}% perlu remidi`
                  : '0%'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pusat Perhatian Wali Kelas - Siswa Perlu Perhatian Khusus */}
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-rose-400 w-5 h-5 animate-pulse" />
            <div>
              <h3 className="text-md font-semibold text-slate-100">Pusat Perhatian Wali Kelas (Siswa Perlu Tindak Lanjut)</h3>
              <p className="text-xs text-slate-400">Menampilkan siswa dengan pencapaian di bawah KKM (75) atau kehadiran di bawah target (80%)</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-rose-500/15 text-rose-300 rounded-full border border-rose-500/20">
            {studentsAttention.length} Peringatan Aktif
          </span>
        </div>

        {studentsAttention.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 bg-slate-900/20 rounded-xl border border-dashed border-slate-800 p-4">
            <CheckIcon className="text-emerald-400 w-8 h-8 mb-2" />
            <p className="font-semibold text-slate-200">Seluruh Siswa Aman</p>
            <p className="text-xs max-w-sm mt-1">Luar biasa! Tidak ada siswa dengan nilai rata-rata di bawah KKM atau kehadiran di bawah batas minimum.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {studentsAttention.map(alert => (
              <div 
                key={alert.id} 
                className={`p-4 rounded-xl border transition-all hover:scale-[1.01] flex flex-col justify-between ${
                  alert.tipe === 'keduanya' 
                    ? 'bg-purple-950/15 border-purple-500/30' 
                    : alert.tipe === 'nilai' 
                      ? 'bg-rose-950/15 border-rose-500/30' 
                      : 'bg-amber-950/15 border-amber-500/30'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="truncate">
                      <h4 className="font-semibold text-slate-200 text-sm leading-tight truncate">{alert.nama}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Kelas: <span className="font-medium text-slate-300">{alert.kelas}</span></p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      alert.tipe === 'keduanya' 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                        : alert.tipe === 'nilai' 
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {alert.tipe === 'keduanya' ? 'Nilai & Absen' : alert.tipe === 'nilai' ? 'Nilai KKM' : 'Kehadiran'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300 mt-2">
                    {alert.detailNilai && (
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{alert.detailNilai}</span>
                      </div>
                    )}
                    {alert.detailAbsen && (
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{alert.detailAbsen}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => handleContactParent(alert.id, alert.nama)}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-900/60 hover:bg-slate-900 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700/60 transition-all cursor-pointer"
                >
                  <Phone size={12} />
                  <span>Hubungi Orang Tua</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row with Trend Chart and Sync queue Details */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Interactive Trends Panel */}
        <div className="xl:col-span-2 bg-slate-800/40 p-5 sm:p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col min-h-[440px] overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-indigo-400 w-5 h-5 shrink-0" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Analisis Tren Real-Time</h3>
                <p className="text-xs text-slate-400">Tren statistik kehadiran dan pencapaian akademik harian</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Subject Filter inside Trend Panel */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Mata Pelajaran:</span>
                <select 
                  value={filterMapel}
                  onChange={e => setFilterMapel(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
                >
                  <option value="Semua">Semua Mapel</option>
                  {(settings?.mata_pelajaran || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Chart Type Toggle (Garis vs Batang) */}
              <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/40 shrink-0">
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    chartType === 'line'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Grafik Garis / Area"
                >
                  Garis
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    chartType === 'bar'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Grafik Batang / Bar"
                >
                  Batang
                </button>
              </div>

              {/* Tab Switcher */}
              <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/40 shrink-0">
                <button
                  onClick={() => setActiveTrendTab('kehadiran')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTrendTab === 'kehadiran'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Kehadiran
                </button>
                <button
                  onClick={() => setActiveTrendTab('nilai')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTrendTab === 'nilai'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Rata-rata Nilai
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            {isLoading ? (
              <div className="w-full h-full flex items-end gap-3 pt-6 pb-2 px-2 animate-pulse">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <Skeleton className={`w-full rounded-t-md ${i % 2 === 0 ? 'h-[60%]' : 'h-[80%]'}`} />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            ) : activeTrendTab === 'kehadiran' ? (
              attendanceTrendData.length > 0 ? (
                <ResponsiveContainer key={`trend-att-${chartTheme}-${chartType}`} width="100%" height="100%">
                  {chartType === 'line' ? (
                    <AreaChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`colorHadir-${chartTheme}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={themeColors.trendPrimary} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={themeColors.trendSecondary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                      <XAxis dataKey="formattedTanggal" stroke={themeColors.axisStroke} fontSize={10} tickLine={false} />
                      <YAxis stroke={themeColors.axisStroke} fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip 
                        contentStyle={themeColors.tooltipStyle} 
                        formatter={(value: any) => [`${value}%`, 'Tingkat Kehadiran']}
                      />
                      <Area type="monotone" dataKey="Persentase Hadir" stroke={themeColors.trendPrimary} strokeWidth={2.5} fillOpacity={1} fill={`url(#colorHadir-${chartTheme})`} />
                    </AreaChart>
                  ) : (
                    <BarChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                      <XAxis dataKey="formattedTanggal" stroke={themeColors.axisStroke} fontSize={10} tickLine={false} />
                      <YAxis stroke={themeColors.axisStroke} fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip 
                        contentStyle={themeColors.tooltipStyle} 
                        formatter={(value: any) => [`${value}%`, 'Tingkat Kehadiran']}
                      />
                      <Bar dataKey="Persentase Hadir" fill={themeColors.trendPrimary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                  <CheckIcon size={36} className="text-slate-500 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">Tidak ada data tren kehadiran</p>
                  <p className="text-slate-500 text-xs mt-1">Ganti filter waktu atau input data absen di halaman Absensi.</p>
                </div>
              )
            ) : (
              gradeTrendData.length > 0 ? (
                <ResponsiveContainer key={`trend-grade-${chartTheme}-${chartType}`} width="100%" height="100%">
                  {chartType === 'line' ? (
                    <AreaChart data={gradeTrendData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`colorNilai-${chartTheme}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={themeColors.gradePrimary} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={themeColors.gradeSecondary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                      <XAxis dataKey="formattedTanggal" stroke={themeColors.axisStroke} fontSize={10} tickLine={false} />
                      <YAxis stroke={themeColors.axisStroke} fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={themeColors.tooltipStyle} 
                        formatter={(value: any, name: string) => [value, name === 'Rata-rata' ? 'Rata-Rata Kelas' : name]}
                      />
                      <ReferenceLine 
                        y={filterMapel !== 'Semua' ? getSubjectKKM(filterMapel, settings) : (settings?.kkm_bulanan || 75)} 
                        stroke={themeColors.kkmLine} 
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        label={{ 
                          value: `KKM (${filterMapel !== 'Semua' ? getSubjectKKM(filterMapel, settings) : (settings?.kkm_bulanan || 75)})`, 
                          fill: themeColors.kkmLine, 
                          fontSize: 10, 
                          fontWeight: 700,
                          position: 'insideTopRight' 
                        }}
                      />
                      <Area type="monotone" dataKey="Rata-rata" stroke={themeColors.gradePrimary} strokeWidth={2.5} fillOpacity={1} fill={`url(#colorNilai-${chartTheme})`} />
                    </AreaChart>
                  ) : (
                    <BarChart data={gradeTrendData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                      <XAxis dataKey="formattedTanggal" stroke={themeColors.axisStroke} fontSize={10} tickLine={false} />
                      <YAxis stroke={themeColors.axisStroke} fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={themeColors.tooltipStyle} 
                        formatter={(value: any, name: string) => [value, name === 'Rata-rata' ? 'Rata-Rata Kelas' : name]}
                      />
                      <ReferenceLine 
                        y={filterMapel !== 'Semua' ? getSubjectKKM(filterMapel, settings) : (settings?.kkm_bulanan || 75)} 
                        stroke={themeColors.kkmLine} 
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        label={{ 
                          value: `KKM (${filterMapel !== 'Semua' ? getSubjectKKM(filterMapel, settings) : (settings?.kkm_bulanan || 75)})`, 
                          fill: themeColors.kkmLine, 
                          fontSize: 10, 
                          fontWeight: 700,
                          position: 'insideTopRight' 
                        }}
                      />
                      <Bar dataKey="Rata-rata" fill={themeColors.gradePrimary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                  <BarChart2 size={36} className="text-slate-500 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">Tidak ada data tren nilai</p>
                  <p className="text-slate-500 text-xs mt-1">Ganti filter waktu atau input nilai ber-tanggal di halaman Nilai.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Visibilitas Status Sinkronisasi & Antrean Data */}
        <div className="bg-slate-800/40 p-5 sm:p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col min-h-[440px] overflow-hidden">
          <div className="flex flex-wrap gap-3 justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Cloud className="text-indigo-400 w-5 h-5 shrink-0" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Status Sinkronisasi</h3>
                <p className="text-xs text-slate-400">Antrean perubahan data tertunda (pending)</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {onPullData && (
                <button 
                  onClick={() => setShowPullConfirm(true)}
                  disabled={isSyncing}
                  className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 disabled:opacity-40 rounded-xl text-xs font-semibold shadow-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Ambil / tarik seluruh data dari Cloud Firebase"
                >
                  <Download size={12} />
                  <span>Tarik/Ambil Data</span>
                </button>
              )}
              {syncData && (
                <button 
                  onClick={syncData}
                  disabled={isSyncing || syncStats.unsyncedCount === 0}
                  className="px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkron'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Overall progress indicator */}
          <div className="bg-slate-900/40 border border-slate-700/50 p-4 rounded-xl mb-4 shrink-0 flex items-center gap-4">
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="rgba(51, 65, 85, 0.4)" strokeWidth="4" fill="transparent" />
                <circle 
                  cx="24" 
                  cy="24" 
                  r="20" 
                  stroke={syncStats.unsyncedCount > 0 ? '#f59e0b' : '#10b981'} 
                  strokeWidth="4" 
                  fill="transparent" 
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - syncStats.percentage / 100)}`}
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute text-xs font-bold font-mono text-slate-200">{syncStats.percentage}%</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-300">
                {syncStats.unsyncedCount > 0 ? 'Beberapa Perubahan Tertunda' : 'Semua Data Tersinkron'}
              </h4>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                {syncStats.unsyncedCount > 0 
                  ? `${syncStats.unsyncedCount} perubahan tersimpan secara lokal dan akan disinkronkan.` 
                  : 'Data lokal Anda sinkron dengan Cloud Firebase.'}
              </p>
            </div>
          </div>

          {/* Pending sync queue list */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Daftar Antrean</h4>
            
            <div className="space-y-2">
              {syncStats.queueItems && syncStats.queueItems.length > 0 ? (
                syncStats.queueItems.map((item, index) => {
                  const resolved = getQueueItemDetails(item, allStudents, allGrades, allAttendance);
                  return (
                    <div 
                      key={`${item.store}-${item.id}-${index}`} 
                      className="bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 rounded-xl p-3 flex justify-between items-center gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 capitalize shrink-0">
                            {resolved.targetName}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                            resolved.actionLabel === 'Hapus' 
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {resolved.actionLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium truncate mt-1.5" title={resolved.desc}>{resolved.desc}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Tunda</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30 py-10">
                  <CheckIcon size={24} className="text-emerald-400/80 mb-2" />
                  <p className="text-slate-400 text-xs font-semibold">Tidak ada antrean tertunda</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">Semua modifikasi Anda berhasil ter-sync!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Charts Panel with Glassmorphism */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Statistics (Pie Chart) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[395px]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <PieIcon className="text-indigo-400 w-5 h-5" />
              <h3 className="text-md font-semibold text-slate-100">Distribusi Kehadiran Siswa</h3>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Rentang:</span>
              <select 
                value={filterWaktu}
                onChange={e => setFilterWaktu(e.target.value as any)}
                className="px-2.5 py-1 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900 font-semibold"
              >
                <option value="Semester">Semester Ini</option>
                <option value="Minggu Ini">Minggu Ini</option>
                <option value="Bulan Ini">Bulan Ini</option>
                <option value="Hari Ini">Hari Ini</option>
                <option value="Kustom">Kustom Date</option>
              </select>

              {filterWaktu === 'Kustom' && (
                <div className="flex items-center gap-1 text-xs">
                  <input 
                    type="date" 
                    value={customStartDate} 
                    onChange={e => setCustomStartDate(e.target.value)} 
                    className="px-2 py-0.5 bg-slate-900/90 border border-slate-700 rounded-lg text-[11px] text-slate-200 outline-none [color-scheme:dark]" 
                  />
                  <span className="text-slate-500">-</span>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={e => setCustomEndDate(e.target.value)} 
                    className="px-2 py-0.5 bg-slate-900/90 border border-slate-700 rounded-lg text-[11px] text-slate-200 outline-none [color-scheme:dark]" 
                  />
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 min-h-0 relative">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center animate-pulse">
                <Skeleton className="w-44 h-44 rounded-full" />
              </div>
            ) : hasAttendanceData ? (
              <ResponsiveContainer key={`pie-att-${chartTheme}`} width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendanceChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {attendanceChartData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`} 
                        fill={themeColors.attendance[entry.name as keyof typeof themeColors.attendance] || themeColors.trendPrimary} 
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={themeColors.tooltipStyle} />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-slate-300 text-xs font-semibold">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                <CheckSquare size={36} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-sm font-medium">Belum ada data absensi</p>
                <p className="text-slate-500 text-xs mt-1">Silakan tambahkan data absensi untuk menampilkan statistik visual.</p>
              </div>
            )}
          </div>
        </div>

        {/* Grades Statistics (Bar Chart) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col min-h-[380px]">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <BarChart2 className="text-emerald-400 w-5 h-5" />
            <h3 className="text-md font-semibold text-slate-100">Rata-rata Nilai per Mata Pelajaran</h3>
          </div>
          
          <div className="flex-1 min-h-0 relative">
            {isLoading ? (
              <div className="w-full h-full flex items-end gap-3 pt-6 pb-2 px-2 animate-pulse">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <Skeleton className={`w-full rounded-t-md ${i % 2 === 0 ? 'h-[70%]' : 'h-[50%]'}`} />
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>
            ) : hasSubjectData ? (
              <ResponsiveContainer key={`bar-subj-${chartTheme}`} width="100%" height="100%">
                <BarChart data={subjectChartData} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                  <XAxis 
                    dataKey="name" 
                    stroke={themeColors.axisStroke} 
                    fontSize={10} 
                    tickLine={false}
                  />
                  <YAxis 
                    stroke={themeColors.axisStroke} 
                    fontSize={10} 
                    domain={[0, 100]} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={themeColors.tooltipStyle} />
                  <Bar 
                    dataKey="Rata-rata" 
                    fill={themeColors.barFill} 
                    radius={[6, 6, 0, 0]}
                  >
                    {subjectChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index % 2 === 0 ? themeColors.barFill : themeColors.barFillHighlight} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                <BarChart2 size={36} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-sm font-medium">Belum ada data nilai</p>
                <p className="text-slate-500 text-xs mt-1">Silakan tambahkan data nilai mata pelajaran untuk melihat perbandingan statistik.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visual Section & Panel Visualisasi Ringkas Database Uang KAS (Real-time Firestore) */}
      {(isLoading && isKasLoading) ? (
        <KasPanelSkeleton />
      ) : (
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-6">
        {/* Panel Header & Real-time Connection Badge */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Panel Visualisasi Ringkas Database Uang KAS</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Real-time Firestore
                </span>
              </h3>
              <p className="text-xs text-slate-400">Statistik penggunaan uang KAS kelas terhubung langsung secara real-time dengan database Cloud Firestore</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-[11px] text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-700/50 font-mono">
              Update Terakhir: <strong className="text-indigo-300">{realtimeKas.lastUpdated || 'Baru saja'}</strong>
            </span>
          </div>
        </div>

        {/* 4 Cards Grid for Realtime Kas Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Saldo Kas */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-emerald-500/30 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Total Saldo Kas</span>
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg"><Wallet size={16} /></span>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-emerald-400 truncate">
              Rp {displayKas.saldoKas.toLocaleString('id-ID')}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="text-emerald-400 font-semibold">Saldo Bersih Saat Ini</span>
            </div>
          </div>

          {/* Card 2: Total Pengeluaran */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-rose-500/30 shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Total Pengeluaran</span>
              <span className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg"><TrendingUp size={16} className="rotate-180" /></span>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-rose-400 truncate">
              Rp {displayKas.totalPengeluaran.toLocaleString('id-ID')}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              <span>Rasio Terpakai: </span>
              <strong className="text-rose-300 font-mono">
                {displayKas.totalPemasukan > 0 
                  ? ((displayKas.totalPengeluaran / displayKas.totalPemasukan) * 100).toFixed(1) 
                  : 0}%
              </strong>
            </div>
          </div>

          {/* Card 3: Sisa Kas */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-indigo-500/30 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Sisa Kas Tersedia</span>
              <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg"><CheckCircle2 size={16} /></span>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-indigo-300 truncate">
              Rp {((displayKas as any).sisaKas ?? displayKas.saldoKas).toLocaleString('id-ID')}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              <span className="text-indigo-400 font-medium">Dana Efektif Bebas Digunakan</span>
            </div>
          </div>

          {/* Card 4: Total Pemasukan & Records */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-amber-500/30 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Total Pemasukan</span>
              <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><TrendingUp size={16} /></span>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-amber-300 truncate">
              Rp {displayKas.totalPemasukan.toLocaleString('id-ID')}
            </div>
            <div className="mt-2 text-[10px] text-slate-400 flex justify-between items-center">
              <span>{(displayKas as any).totalTransactions ?? (displayKas as any).totalTransaksi ?? kasStats.totalTransactions} Transaksi</span>
              <span className="text-emerald-400 font-bold">100% Synced</span>
            </div>
          </div>
        </div>

        {/* Visual Progress Ratio Bar for Kas Usage */}
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/40 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs text-slate-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <BarChart2 size={14} className="text-indigo-400" />
              <span>Visualisasi Alokasi Dana Kas Kelas</span>
            </span>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-emerald-400">Pemasukan: Rp {displayKas.totalPemasukan.toLocaleString('id-ID')}</span>
              <span className="text-rose-400">Pengeluaran: Rp {displayKas.totalPengeluaran.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-3 flex overflow-hidden p-0.5 border border-slate-700/60">
            {(() => {
              const totalIn = displayKas.totalPemasukan || 1;
              const totalOut = displayKas.totalPengeluaran || 0;
              const outPercent = Math.min(100, Math.round((totalOut / totalIn) * 100));
              const remainPercent = 100 - outPercent;
              return (
                <>
                  <div 
                    style={{ width: `${remainPercent}%` }} 
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-l-full transition-all duration-500"
                    title={`Sisa Kas: ${remainPercent}%`}
                  />
                  <div 
                    style={{ width: `${outPercent}%` }} 
                    className="bg-gradient-to-r from-rose-500 to-red-400 h-full rounded-r-full transition-all duration-500"
                    title={`Pengeluaran: ${outPercent}%`}
                  />
                </>
              );
            })()}
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 font-medium">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Sisa Kas / Tersedia: {
                displayKas.totalPemasukan > 0 
                  ? (100 - ((displayKas.totalPengeluaran / displayKas.totalPemasukan) * 100)).toFixed(1) 
                  : 100
              }%
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Terpakai: {
                displayKas.totalPemasukan > 0 
                  ? ((displayKas.totalPengeluaran / displayKas.totalPemasukan) * 100).toFixed(1) 
                  : 0
              }%
            </span>
          </div>
        </div>

        {/* Content Grid: Monthly Cash Flow Chart + Paginated Recent Transactions Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart Panel */}
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 flex flex-col h-[380px]">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BarChart2 size={14} className="text-emerald-400" />
                <span>Grafik Arus Kas per Bulan</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Dinamis</span>
            </h4>
            
            {kasChartData.length > 0 ? (
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kasChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridStroke} />
                    <XAxis dataKey="bulan" stroke={themeColors.axisStroke} fontSize={10} />
                    <YAxis stroke={themeColors.axisStroke} fontSize={10} tickFormatter={(v) => `Rp ${v >= 1000 ? (v/1000) + 'k' : v}`} />
                    <Tooltip 
                      contentStyle={themeColors.tooltipStyle} 
                      formatter={(val: any) => [`Rp ${Number(val).toLocaleString('id-ID')}`, '']} 
                    />
                    <Legend />
                    <Bar dataKey="pemasukan" name="Pemasukan" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/20 rounded-xl border border-dashed border-slate-700/50">
                <Wallet size={32} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-xs font-semibold">Belum ada grafik bulanan</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Input transaksi kas untuk membentuk statistik grafik.</p>
              </div>
            )}
          </div>

          {/* Paginated Recent Transactions Table Panel */}
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 flex flex-col h-[380px]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-700/40 pb-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-400" />
                <span>Transaksi Uang Kas ({recentKas.length})</span>
              </h4>

              {/* Limit selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[10px] text-slate-400">Limit:</span>
                <select 
                  value={kasLimit}
                  onChange={(e) => {
                    setKasLimit(Number(e.target.value));
                    setKasPage(1);
                  }}
                  className="bg-slate-800 text-slate-200 text-[10px] px-2 py-0.5 rounded border border-slate-700 outline-none cursor-pointer"
                >
                  <option value={5}>5 / hal</option>
                  <option value={10}>10 / hal</option>
                  <option value={15}>15 / hal</option>
                  <option value={25}>25 / hal</option>
                </select>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              {recentKas.length > 0 ? (
                (() => {
                  const totalPages = Math.ceil(recentKas.length / kasLimit) || 1;
                  const startIndex = (kasPage - 1) * kasLimit;
                  const currentItems = recentKas.slice(startIndex, startIndex + kasLimit);

                  return (
                    <div className="flex flex-col h-full justify-between gap-2">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-700/50 text-[10px] text-slate-400 uppercase font-bold sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
                            <th className="py-2 px-2">Tanggal</th>
                            <th className="py-2 px-2">Keterangan / Siswa</th>
                            <th className="py-2 px-2">Jenis</th>
                            <th className="py-2 px-2 text-right">Jumlah</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-xs">
                          {currentItems.map((k, idx) => {
                            const isMasuk = k.jenis === 'Pemasukan' || k.jenis === 'masuk';
                            const labelNama = k.nama_siswa || k.keterangan || k.uraian || 'Kas Kelas';
                            return (
                              <tr key={k.id || idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-2 px-2 text-slate-400 text-[10px] font-mono whitespace-nowrap">
                                  {k.tanggal ? format(parseISO(k.tanggal), 'dd/MM/yyyy') : '-'}
                                </td>
                                <td className="py-2 px-2 text-slate-200 font-medium truncate max-w-[130px]" title={labelNama}>
                                  {labelNama}
                                </td>
                                <td className="py-2 px-2 whitespace-nowrap">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                    isMasuk 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  }`}>
                                    {isMasuk ? 'Pemasukan' : 'Pengeluaran'}
                                  </span>
                                </td>
                                <td className={`py-2 px-2 text-right font-mono font-bold whitespace-nowrap ${
                                  isMasuk ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {isMasuk ? '+' : '-'} Rp {(Number(k.jumlah || k.nominal) || 0).toLocaleString('id-ID')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pagination Controls */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                        <span>
                          Hal <strong className="text-slate-200">{kasPage}</strong> dari <strong className="text-slate-200">{totalPages}</strong> ({recentKas.length} item)
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={kasPage <= 1}
                            onClick={() => setKasPage(p => Math.max(1, p - 1))}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded border border-slate-700 transition-all font-medium cursor-pointer"
                          >
                            Sebelumnya
                          </button>
                          <button
                            type="button"
                            disabled={kasPage >= totalPages}
                            onClick={() => setKasPage(p => Math.min(totalPages, p + 1))}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded border border-slate-700 transition-all font-medium cursor-pointer"
                          >
                            Selanjutnya
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-900/20 rounded-xl border border-dashed border-slate-700/50">
                  <Wallet size={32} className="text-slate-500 mb-2" />
                  <p className="text-slate-400 text-xs font-semibold">Belum ada transaksi kas kelas</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">Catatan transaksi kas yang diinput akan muncul secara otomatis di sini.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Attendance Heatmap Visualizer */}
      <Suspense fallback={<CardGridSkeleton />}>
        <AttendanceHeatmap 
          attendances={allAttendance} 
          students={allStudents} 
          settings={settings} 
          filterClass={filterKelas} 
        />
      </Suspense>

      {/* Audit Mendalam Firestore & Backup Data Komprehensif Wali Kelas */}
      <Suspense fallback={<CardGridSkeleton />}>
        <AuditAndBackupSection />
      </Suspense>

      {/* Row with Upcoming Schedule & Sync History Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-2">
        {/* Jadwal & Agenda Hari Ini */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <BookOpen className="text-indigo-400 w-5 h-5" />
            <div>
              <h3 className="text-md font-semibold text-slate-100">Jadwal & Agenda Kelas Hari Ini</h3>
              <p className="text-xs text-slate-400">Roster, petugas piket harian, dan agenda mendatang</p>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 text-slate-300">
            {/* Hari & Tanggal */}
            <div className="flex justify-between items-center bg-slate-900/40 border border-slate-700/40 px-4 py-2.5 rounded-xl text-xs font-semibold">
              <span className="text-slate-300">Hari ini: <span className="text-indigo-400 font-bold uppercase">{['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]}</span></span>
              <span className="text-slate-400 font-mono">{format(new Date(), 'dd MMMM yyyy', { locale: id })}</span>
            </div>

            {/* Interactive Task Completion & Notification Widget */}
            <TaskNotificationWidget semester={settings?.semester_aktif || ''} />

            {/* Roster, Piket & Tasks Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Roster Card */}
              <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl flex flex-col">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Clock size={14} /> Roster Belajar
                </h4>
                {rosterToday.length > 0 ? (
                  <div className="space-y-2">
                    {rosterToday.map((r, i) => (
                      <div key={r.id || i} className="text-xs border-b border-slate-700/30 pb-2 last:border-0 last:pb-0">
                        <p className="font-bold text-slate-200 truncate">{r.mata_pelajaran}</p>
                        <p className="text-slate-400 text-[10px] flex items-center gap-1 mt-0.5 font-mono">
                          <span>{r.jam_mulai} - {r.jam_selesai}</span>
                          {r.guru && <span className="text-slate-500">({r.guru})</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic my-auto py-4">Tidak ada jadwal belajar hari ini.</p>
                )}
              </div>

              {/* Piket Card */}
              <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl flex flex-col">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Users size={14} /> Petugas Piket
                </h4>
                {piketToday.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {piketToday.map((p, i) => (
                      <span key={p.id || i} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-medium">
                        {p.nama_siswa}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic my-auto py-4">Tidak ada petugas piket hari ini.</p>
                )}
              </div>

              {/* Tasks Due Today Card */}
              <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl flex flex-col col-span-1 sm:col-span-2 lg:col-span-1">
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <CheckIcon size={14} /> Tugas Dikumpul Hari Ini
                </h4>
                {tasksToday.length > 0 ? (
                  <div className="space-y-2">
                    {tasksToday.map((t, i) => (
                      <div key={t.id || i} className="text-xs border-b border-slate-700/30 pb-2 last:border-0 last:pb-0">
                        <p className="font-bold text-slate-200 truncate">{t.judul}</p>
                        <p className="text-slate-400 text-[10px] flex items-center gap-1 mt-0.5">
                          <span className="text-indigo-400 font-semibold">{t.mata_pelajaran}</span>
                          <span>•</span>
                          <span className="text-slate-400 font-mono">Kelas {t.kelas}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic my-auto py-4">Tidak ada deadline tugas hari ini.</p>
                )}
              </div>
            </div>

            {/* Upcoming Holidays / Agenda */}
            <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                <Calendar size={14} /> Agenda Libur / Event Mendatang (30 Hari)
              </h4>
              {upcomingHolidays.length > 0 ? (
                <div className="space-y-2.5">
                  {upcomingHolidays.map((h, i) => {
                    const isTodayHoliday = format(new Date(), 'yyyy-MM-dd') >= h.tanggal_mulai && format(new Date(), 'yyyy-MM-dd') <= h.tanggal_selesai;
                    return (
                      <div key={h.id || i} className={`text-xs p-2.5 rounded-lg border ${isTodayHoliday ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-800/30 border-slate-700/30'} flex justify-between items-center gap-3`}>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{h.nama}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {format(parseISO(h.tanggal_mulai), 'd MMM yyyy', { locale: id })} - {format(parseISO(h.tanggal_selesai), 'd MMM yyyy', { locale: id })}
                          </p>
                        </div>
                        {isTodayHoliday && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase tracking-wider shrink-0">Sedang Berlangsung</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic py-2">Tidak ada agenda libur/event dalam 30 hari ke depan.</p>
              )}
            </div>
          </div>
        </div>

        {/* Riwayat Sinkronisasi (Log) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Cloud className="text-emerald-400 w-5 h-5" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Riwayat Sinkronisasi (Log)</h3>
                <p className="text-xs text-slate-400">Daftar log keberhasilan & kegagalan sinkronisasi data</p>
              </div>
            </div>
            
            <button 
              onClick={async () => {
                await store.syncLogs.clear();
                window.dispatchEvent(new CustomEvent('sync-log-changed'));
                toast.success('Log sinkronisasi dikosongkan!');
              }}
              className="px-2.5 py-1 text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 rounded-lg text-[10px] font-bold uppercase transition-colors tracking-wider"
            >
              Hapus Log
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
            {syncLogs.length > 0 ? (
              syncLogs.map((log, index) => {
                const isSuccess = log.status === 'success';
                const formattedTime = (() => {
                  try {
                    return format(parseISO(log.timestamp), 'dd MMM, HH:mm:ss');
                  } catch (e) {
                    return log.timestamp;
                  }
                })();
                return (
                  <div 
                    key={log.id || index} 
                    className={`p-3 rounded-xl border ${
                      isSuccess 
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-300' 
                        : 'bg-rose-500/5 border-rose-500/20 text-slate-300'
                    } flex justify-between items-center gap-4`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                          log.type === 'pull'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {log.type === 'pull' ? 'Ambil (Pull)' : 'Kirim (Push)'}
                        </span>
                        
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isSuccess ? 'Sukses' : 'Gagal'}
                        </span>

                        <span className="text-[10px] text-slate-500 font-mono font-medium ml-auto">
                          {formattedTime}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-semibold mt-2">{log.message}</p>
                      {log.recordsCount !== undefined && log.recordsCount > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">
                          Jumlah Record: <span className="font-bold text-slate-300">{log.recordsCount}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30 h-full">
                <Cloud size={32} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-xs font-semibold">Tidak ada log sinkronisasi</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Lakukan sinkronisasi data untuk memantau integritas.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* USER MANAGEMENT SECTION (For Kepsek / Admin / Guru) */}
      <div className="pt-2">
        <Suspense fallback={<CardGridSkeleton />}>
          <UserManagement role={role} />
        </Suspense>
      </div>

      {showPullConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Download className="text-emerald-400" size={24} />
              Konfirmasi Tarik Data
            </h3>
            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              Apakah Anda yakin ingin mengambil seluruh data dari Cloud Firebase? 
              <br/><br/>
              <span className="text-rose-400 font-semibold">
                Perhatian: Perubahan lokal yang belum disinkronkan akan ditimpa oleh data dari cloud.
              </span>
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowPullConfirm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  setShowPullConfirm(false);
                  if (onPullData) {
                    await onPullData();
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
              >
                Ya, Tarik Data
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedContactStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Phone className="text-indigo-400 animate-bounce-slow" size={20} />
                  Kirim Pesan Perhatian kepada Orang Tua
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Siswa: <strong className="text-indigo-300">{selectedContactStudent.nama}</strong> | Kelas: {selectedContactStudent.kelas}
                </p>
              </div>
              <button 
                onClick={() => setSelectedContactStudent(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-850 transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1 space-y-4">
              {/* Parent Info & Warning Detail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 text-xs">
                <div className="space-y-1">
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Informasi Orang Tua</p>
                  <p className="text-slate-300"><span className="text-slate-500">No. WA:</span> <strong className="text-slate-200 font-mono">{selectedContactStudent.no_telp_ortu}</strong></p>
                  <p className="text-slate-300"><span className="text-slate-500">Nama Ayah:</span> {selectedContactStudent.nama_ayah || '-'}</p>
                  <p className="text-slate-300"><span className="text-slate-500">Nama Ibu:</span> {selectedContactStudent.nama_ibu || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Pusat Perhatian Guru</p>
                  {selectedContactStudent.detailNilai && (
                    <div className="text-rose-400 flex items-start gap-1">
                      <span className="mt-0.5">•</span>
                      <span>{selectedContactStudent.detailNilai}</span>
                    </div>
                  )}
                  {selectedContactStudent.detailAbsen && (
                    <div className="text-amber-400 flex items-start gap-1">
                      <span className="mt-0.5">•</span>
                      <span>{selectedContactStudent.detailAbsen}</span>
                    </div>
                  )}
                  {!selectedContactStudent.detailNilai && !selectedContactStudent.detailAbsen && (
                    <p className="text-slate-400 italic">Tidak ada detail peringatan sistem.</p>
                  )}
                </div>
              </div>

              {/* Template Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Template Pesan WhatsApp:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('akademik')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'akademik'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/50 shadow-md shadow-rose-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Akademik</span>
                    <span className="truncate mt-1 text-[11px]">⚠️ Nilai & KKM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('kehadiran')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'kehadiran'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Absensi</span>
                    <span className="truncate mt-1 text-[11px]">📅 Kehadiran</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('keduanya')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'keduanya'
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/50 shadow-md shadow-purple-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Keduanya</span>
                    <span className="truncate mt-1 text-[11px]">🚨 Nilai & Absen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('kustom')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'kustom'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Bebas</span>
                    <span className="truncate mt-1 text-[11px]">✏️ Pesan Kustom</span>
                  </button>
                </div>
              </div>

              {/* Message Input / Editor */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Isi Pesan WhatsApp:</label>
                  <span className="text-[10px] text-slate-500 font-medium font-mono">Dapat diedit langsung sesuai kebutuhan</span>
                </div>
                <textarea
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={8}
                  className="w-full p-4 bg-slate-950 text-slate-200 border border-slate-850 focus:border-indigo-500/60 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans leading-relaxed custom-scrollbar"
                  placeholder="Ketik pesan Anda untuk orang tua siswa..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between border-t border-slate-800 pt-4 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(editedMessage);
                  toast.success('Pesan berhasil disalin ke clipboard!');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700/30"
              >
                Salin Pesan
              </button>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedContactStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-transparent"
                >
                  Batal
                </button>
                <a
                  href={`https://wa.me/${formatWhatsAppNumber(selectedContactStudent.no_telp_ortu)}?text=${encodeURIComponent(editedMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSelectedContactStudent(null)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-1.5"
                >
                  Kirim via WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Naik Kelas Modal */}
      <NaikKelasModal
        isOpen={isNaikKelasOpen}
        onClose={() => setIsNaikKelasOpen(false)}
        onSuccess={() => setDataVersion(prev => prev + 1)}
        defaultSourceClass={filterKelas !== 'Semua' ? filterKelas : undefined}
      />
    </div>
  );
}
