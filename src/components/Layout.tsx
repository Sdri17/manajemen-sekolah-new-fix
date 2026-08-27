import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Users, FileSpreadsheet, CheckSquare, Settings as SettingsIcon, LogOut, Cloud, LayoutDashboard, School, HelpCircle, Download, Menu, X, Sun, Moon, Calendar, ClipboardList, BookOpen, ChevronDown, ChevronRight, MessageSquare, ShieldCheck, Wifi, WifiOff, Signal, RefreshCw, Wallet, Database, Bell } from 'lucide-react';
import SyncProgressBar from './SyncProgressBar';
import { Settings, AppUser, store } from '../lib/store';
import { canAccessMenu, canCrudMenu, isUserAdmin, getDisplayRoleLabel, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import toast from 'react-hot-toast';
import TaskNotificationWidget from './TaskNotificationWidget';
// Helper for resilient lazy loading with auto-retry on transient fetch errors
function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await importFn();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('chunk_reload_attempts');
      }
      return module;
    } catch (error) {
      console.warn('[LazyWithRetry] Dynamic import failed, attempting retry...', error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await importFn();
      } catch (retryError) {
        if (typeof window !== 'undefined' && !sessionStorage.getItem('chunk_reload_attempts')) {
          sessionStorage.setItem('chunk_reload_attempts', 'true');
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
        throw retryError;
      }
    }
  });
}

// Code-splitting with React.lazy and retry handler for non-critical pages
const Dashboard = lazyWithRetry(() => import('../pages/Dashboard'));
const DataSiswa = lazyWithRetry(() => import('../pages/DataSiswa'));
const Nilai = lazyWithRetry(() => import('../pages/Nilai'));
const Absensi = lazyWithRetry(() => import('../pages/Absensi'));
const ManajemenTugas = lazyWithRetry(() => import('../pages/ManajemenTugas'));
const RosterPiket = lazyWithRetry(() => import('../pages/RosterPiket'));
const Pengaturan = lazyWithRetry(() => import('../pages/Pengaturan'));
const IdentitasSekolah = lazyWithRetry(() => import('../pages/IdentitasSekolah'));
const Panduan = lazyWithRetry(() => import('../pages/Panduan'));
const EksporTerpadu = lazyWithRetry(() => import('../pages/EksporTerpadu'));
const Rapor = lazyWithRetry(() => import('../pages/Rapor'));
const Dokumentasi = lazyWithRetry(() => import('../pages/Dokumentasi'));
const NotifikasiWA = lazyWithRetry(() => import('../pages/NotifikasiWA'));
const DiagnostikDatabase = lazyWithRetry(() => import('../pages/DiagnostikDatabase'));
const JurnalGuru = lazyWithRetry(() => import('../pages/JurnalGuru'));
const KasKelas = lazyWithRetry(() => import('../pages/KasKelas'));
import WeeklyBackupModal from './WeeklyBackupModal';
import GlobalStudentSearch from './GlobalStudentSearch';
import StudentDossierModal from './StudentDossierModal';
import DatabaseConnectModal from './DatabaseConnectModal';
import ConflictResolutionModal from './ConflictResolutionModal';
import { ManualSyncQueueModal } from './ManualSyncQueueModal';
import { usePendingSync } from '../hooks/usePendingSync';
import { getFirebaseStatus } from '../lib/firebaseSync';
import { 
  registerServiceWorker, 
  getNotificationPermissionStatus, 
  requestNotificationPermission 
} from '../lib/notificationService';

const PageLoader = () => (
  <div className="p-6 space-y-6 animate-pulse w-full h-full min-h-[500px]">
    <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="w-48 h-6 bg-slate-700 rounded-lg"></div>
        <div className="w-80 h-3.5 bg-slate-700/60 rounded-md"></div>
      </div>
      <div className="w-32 h-9 bg-slate-700/80 rounded-xl"></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="p-5 bg-slate-800/40 rounded-2xl border border-slate-700/40 space-y-3">
          <div className="w-24 h-4 bg-slate-700 rounded-md"></div>
          <div className="w-16 h-8 bg-slate-700/80 rounded-lg"></div>
        </div>
      ))}
    </div>
    <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-700/40 space-y-4">
      <div className="w-40 h-5 bg-slate-700 rounded-md"></div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-slate-800/80 rounded-xl border border-slate-700/30"></div>
        ))}
      </div>
    </div>
  </div>
);

interface LayoutProps {
  user: AppUser;
  role: string;
  onLogout: () => void;
  syncData: () => Promise<void>;
  onForceSync?: () => Promise<void>;
  hasSyncFailed?: boolean;
  onFullBackup?: () => Promise<void>;
  onPullData?: () => Promise<void>;
  isSyncing: boolean;
  hasUnsyncedChanges?: boolean;
  settings: Settings | null;
  setSettings: (s: Settings | null) => void;
  syncStats?: {
    percentage: number;
    unsyncedCount: number;
    syncedCount: number;
    totalItems: number;
    queueItems: { store: string; id: string; action: string }[];
  };
  lastSynced?: Date | null;
}

export default function Layout({ 
  user, 
  role, 
  onLogout, 
  syncData, 
  onForceSync,
  hasSyncFailed,
  onFullBackup,
  onPullData,
  isSyncing, 
  hasUnsyncedChanges, 
  settings, 
  setSettings, 
  syncStats,
  lastSynced
}: LayoutProps) {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isLightMode, setIsLightMode] = useState(false);
  const [isAddingSemester, setIsAddingSemester] = useState(false);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [isSyncDropdownOpen, setIsSyncDropdownOpen] = useState(false);
  const [isPengelolaanKelasExpanded, setIsPengelolaanKelasExpanded] = useState(true);
  const [isSistemExpanded, setIsSistemExpanded] = useState(true);
  const [selectedStudentForDossier, setSelectedStudentForDossier] = useState<string | null>(null);
  const [isDbConnectModalOpen, setIsDbConnectModalOpen] = useState(false);
  const [isTaskNotificationOpen, setIsTaskNotificationOpen] = useState(false);
  const [todayPendingTaskCount, setTodayPendingTaskCount] = useState<number>(0);

  useEffect(() => {
    const calculateTodayPending = async () => {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const studentsList: any[] = [];
        await store.students.iterate((s: any) => {
          if (s.kelas && s.kelas.toLowerCase() !== 'alumni') studentsList.push(s);
        });

        const userFilteredStudents = filterStudentsForUser(user, studentsList);
        const studentClassMap: Record<string, string> = {};
        userFilteredStudents.forEach(s => {
          if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
        });

        const rawTasks: any[] = [];
        await store.tasks.iterate((t: any) => {
          rawTasks.push(t);
        });
        const userFilteredTasks = filterRecordsForUser(user, rawTasks, studentClassMap);

        let pendingCount = 0;
        userFilteredTasks.forEach((t: any) => {
          if (t.tanggal_kumpul === todayStr) {
            const classStudents = userFilteredStudents.filter(s => !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase());
            if (classStudents.length > 0) {
              const doneCount = classStudents.filter(s => !!t.penyelesaian?.[s.id]).length;
              if (doneCount < classStudents.length) {
                pendingCount++;
              }
            }
          }
        });
        setTodayPendingTaskCount(pendingCount);
      } catch (err) {
        console.warn('Error calculating today pending tasks:', err);
      }
    };

    calculateTodayPending();
    window.addEventListener('data-changed', calculateTodayPending);
    window.addEventListener('delta-data-changed', calculateTodayPending);
    return () => {
      window.removeEventListener('data-changed', calculateTodayPending);
      window.removeEventListener('delta-data-changed', calculateTodayPending);
    };
  }, []);

  // Responsive Screen Listener
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectMenu = (id: string) => {
    setActiveMenu(id);
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  // Connection & Restored Sync State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showRestoredBanner, setShowRestoredBanner] = useState<boolean>(false);
  
  // Offline Resilience & Notification State
  const { pendingKeys } = usePendingSync();
  const [isManualSyncModalOpen, setIsManualSyncModalOpen] = useState<boolean>(false);
  const [fbStatus, setFbStatus] = useState(getFirebaseStatus());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(getNotificationPermissionStatus());

  // Register Service Worker on mount & listen to Firebase status updates
  useEffect(() => {
    registerServiceWorker();

    const handleFbStatusChanged = () => {
      setFbStatus(getFirebaseStatus());
    };

    window.addEventListener('firebase-status-changed', handleFbStatusChanged);
    return () => {
      window.removeEventListener('firebase-status-changed', handleFbStatusChanged);
    };
  }, []);

  const handleToggleNotification = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(getNotificationPermissionStatus());
    if (granted) {
      toast.success('Notifikasi Push EduSync berhasil diaktifkan! Anda akan menerima update saat ada data kelas masuk.');
    } else {
      toast.error('Izin notifikasi belum diberikan di browser Anda.');
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestoredBanner(true);
      toast.success('Koneksi internet kembali terhubung!', { id: 'network-online-toast' });
      // Automatically attempt sync when coming back online
      if (syncData) {
        syncData().catch((err) => console.log('Auto sync on reconnection:', err));
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestoredBanner(false);
      toast.error('Koneksi internet terputus (Modus Offline)', { id: 'network-offline-toast' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncData]);

  const handleLocalBackup = async () => {
    try {
      const backupData: any = {
        app: 'EduSync',
        version: '1.0.0',
        backup_date: new Date().toISOString(),
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
        users: []
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
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("download", `Backup_DataMaster_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success('Backup data master (JSON) berhasil diunduh!');
    } catch (err: any) {
      toast.error('Gagal mengekspor data backup: ' + err.message);
    }
  };

  const handleConfirmAddSemester = async () => {
    if (!settings || !newSemesterName.trim()) return;
    const name = newSemesterName.trim();
    const list = settings.daftar_semester || ['Ganjil 2026', 'Genap 2026'];
    if (list.includes(name)) {
      toast.error('Semester sudah ada');
      return;
    }
    const newList = [...list, name];
    const newSettings = { ...settings, daftar_semester: newList, semester_aktif: name };
    setSettings(newSettings);
    await store.settings.setItem('app_settings', newSettings);
    toast.success(`Semester ${name} berhasil ditambahkan dan diaktifkan`);
    setIsAddingSemester(false);
  };

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isLightMode]);

  const allCoreMenus = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const allPengelolaanMenus = [
    { id: 'siswa', label: 'Data Siswa', icon: Users },
    { id: 'absensi', label: 'Absensi', icon: CheckSquare },
    { id: 'nilai', label: 'Nilai', icon: FileSpreadsheet },
    { id: 'tugas', label: 'Manajemen Tugas', icon: ClipboardList },
    { id: 'roster_piket', label: 'Roster & Piket', icon: Calendar },
    { id: 'jurnal_guru', label: 'Jurnal & Pelanggaran', icon: BookOpen },
    { id: 'kas_kelas', label: 'Kas Kelas', icon: Wallet },
    { id: 'notifikasi_wa', label: 'Notifikasi WA', icon: MessageSquare },
  ];

  const allReportMenus = [
    { id: 'rapor', label: 'Rapor (PDF)', icon: Download },
    { id: 'ekspor', label: 'Ekspor Terpadu', icon: Download },
  ];

  const allSystemMenus = [
    { id: 'identitas', label: 'Identitas Sekolah', icon: School },
    { id: 'users', label: 'Kelola Pengguna', icon: Users },
    { id: 'pengaturan', label: 'Pengaturan', icon: SettingsIcon },
    { id: 'diagnostik', label: 'Diagnostik Database', icon: ShieldCheck },
    { id: 'dokumentasi', label: 'Dokumentasi', icon: BookOpen },
    { id: 'panduan', label: 'Panduan', icon: HelpCircle },
  ];

  const isSystemAdmin = isUserAdmin(user) || user?.role === 'admin' || user?.username === 'admin';

  const coreMenus = allCoreMenus.filter(m => canAccessMenu(user, m.id));
  const pengelolaanMenus = allPengelolaanMenus.filter(m => canAccessMenu(user, m.id));
  const reportMenus = allReportMenus.filter(m => canAccessMenu(user, m.id));
  const systemMenus = allSystemMenus.filter(m => {
    if (m.id === 'users' && !isSystemAdmin) return false;
    return canAccessMenu(user, m.id);
  });

  const allMenus = [...allCoreMenus, ...allPengelolaanMenus, ...allReportMenus, ...allSystemMenus];

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans relative">
      {/* Subtle Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)] z-0"></div>
      
      {/* Mobile Drawer Overlay Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-slate-900/98 backdrop-blur-2xl border-r border-slate-800 shadow-2xl flex flex-col justify-between transition-all duration-300 ease-in-out print:hidden
        lg:static lg:z-10 lg:bg-slate-800/50 lg:backdrop-blur-xl lg:border-slate-700/50 lg:shadow-none
        ${isSidebarOpen 
            ? 'translate-x-0 lg:w-64 lg:opacity-100' 
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:overflow-hidden'}
      `}>
        <div className="w-full lg:w-64 flex flex-col h-[calc(100vh-120px)] overflow-hidden">
          <div className="p-5 lg:p-6 shrink-0 flex items-center justify-between">
            <div>
              <h2 className="text-lg lg:text-xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Cloud className="text-white w-5 h-5" />
                </div>
                <span className="tracking-tight">Administrasi Kelas</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 pl-10">{settings?.nama_sekolah || 'Nama Sekolah Belum Diatur'}</p>
            </div>
            {isMobile && (
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            )}
          </div>
          
          <nav className="px-3 lg:px-4 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar pb-6">
            {/* Group 1: Utama */}
            {coreMenus.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelectMenu(m.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all cursor-pointer ${
                    activeMenu === m.id 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' 
                      : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <Icon size={16} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                  {m.label}
                </button>
              );
            })}

            {/* Group 2: Pengelolaan Kelas (Collapsible) */}
            <div className="pt-2">
              <button
                onClick={() => setIsPengelolaanKelasExpanded(!isPengelolaanKelasExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-indigo-400/80 hover:text-indigo-300 uppercase tracking-wider text-left transition-all cursor-pointer select-none"
              >
                <span>Pengelolaan Kelas</span>
                {isPengelolaanKelasExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {isPengelolaanKelasExpanded && (
                <div className="pl-3 border-l border-slate-700/50 ml-3 space-y-1.5 mt-1 mb-2">
                  {pengelolaanMenus.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMenu(m.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                          activeMenu === m.id 
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium' 
                            : 'text-slate-400 hover:bg-slate-700/35 hover:text-slate-100 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={14} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                          <span>{m.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Group 3: Laporan & Cadangan */}
            <div className="pt-2">
              <div className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                Laporan & Cadangan
              </div>
              <div className="space-y-1.5">
                {reportMenus.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleSelectMenu(m.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all cursor-pointer ${
                        activeMenu === m.id 
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' 
                          : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-100 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group 4: Pengaturan & Sistem (Collapsible Main Menu) */}
            <div className="pt-2">
              <button
                onClick={() => setIsSistemExpanded(!isSistemExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-indigo-400/80 hover:text-indigo-300 uppercase tracking-wider text-left transition-all cursor-pointer select-none"
              >
                <span>Pengaturan & Sistem</span>
                {isSistemExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {isSistemExpanded && (
                <div className="pl-3 border-l border-slate-700/50 ml-3 space-y-1.5 mt-1 mb-2">
                  {systemMenus.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMenu(m.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                          activeMenu === m.id 
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium' 
                            : 'text-slate-400 hover:bg-slate-700/35 hover:text-slate-100 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={14} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                          <span>{m.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className="p-4 lg:p-6 mt-auto space-y-3 w-full lg:w-64">
          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex items-center gap-3 shadow-md">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-600 flex items-center justify-center text-xs font-bold text-white uppercase shadow-sm shrink-0">
              {user.name ? user.name.substring(0, 2) : user.username.substring(0, 2)}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-bold text-slate-100 truncate">{user.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30 truncate">
                  {user.role === 'admin' ? 'Administrator' : 
                   user.role === 'wali_kelas' ? `Wali Kelas ${user.assignedKelas || ''}` : 
                   user.role === 'guru_mapel' ? `Guru ${user.assignedMapel || ''}` : 
                   user.role === 'kepsek' ? 'Kepala Sekolah' : 'Guru Kelas'}
                </span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-400 border border-slate-700/60 hover:border-rose-500/30 hover:bg-rose-500/10 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut size={14} />
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10 min-w-0">
        <header className="min-h-[4.25rem] bg-slate-900/60 backdrop-blur-md border-b border-slate-700/50 px-3 sm:px-6 py-2.5 flex flex-wrap lg:flex-nowrap items-center justify-between shrink-0 z-30 relative gap-2 sm:gap-3 print:hidden">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold flex items-center gap-2 flex-wrap">
                <span className="truncate">{allMenus.find(m => m.id === activeMenu)?.label}</span>
                {role === 'kepsek' && <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider shrink-0">Mode Baca Saja</span>}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] sm:text-[11px] text-slate-400 font-medium tracking-wider uppercase">
                <span className="hidden sm:inline shrink-0">Semester:</span>
                <select 
                  value={settings?.semester_aktif || ''}
                  onChange={async (e) => {
                    if (!settings) return;
                    if (e.target.value === 'ADD_NEW') {
                      setNewSemesterName('');
                      setIsAddingSemester(true);
                    } else {
                      const newSettings = { ...settings, semester_aktif: e.target.value };
                      setSettings(newSettings);
                      await store.settings.setItem('app_settings', newSettings);
                    }
                  }}
                  className="bg-transparent border-none text-indigo-400 focus:ring-0 outline-none cursor-pointer appearance-none px-0 font-bold shrink-0"
                >
                  {(settings?.daftar_semester || ['Ganjil 2026', 'Genap 2026']).map(sem => (
                    <option key={sem} value={sem} className="bg-slate-800 text-slate-200">{sem}</option>
                  ))}
                  <option value="ADD_NEW" className="bg-slate-800 text-emerald-400 font-bold">+ Tambah Semester...</option>
                </select>
                <span className="text-slate-600 shrink-0">•</span>
                <span className="truncate max-w-[120px] sm:max-w-none">Kelas: {settings?.nama_kelas || '-'}</span>
              </div>
            </div>
          </div>

          {/* Prominent Current User & Role Indicator Badge in Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 border border-indigo-500/30 rounded-full text-slate-200 text-xs shadow-sm shrink-0">
            <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
              {(user?.nama || user?.username || 'U').charAt(0)}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-200 text-xs truncate max-w-[100px] sm:max-w-[150px]">
                {user?.nama || user?.username || 'Pengguna'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 uppercase tracking-wider">
                {getDisplayRoleLabel(user)}
              </span>
            </div>
          </div>

          {/* Global Student Search Component */}
          <div className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 max-w-full lg:max-w-md mx-0 lg:mx-2 z-40 relative">
            <GlobalStudentSearch onSelectStudent={(studentId) => setSelectedStudentForDossier(studentId)} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Prominent Force Sync Button (Only rendered when last sync status failed) */}
            {hasSyncFailed && (
              <button
                type="button"
                onClick={async () => {
                  if (onForceSync) {
                    await onForceSync();
                  } else {
                    await syncData();
                  }
                }}
                disabled={isSyncing}
                className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-full border border-rose-400/60 shadow-lg shadow-rose-600/30 flex items-center gap-1.5 animate-pulse cursor-pointer shrink-0 active:scale-95 transition-all"
                title="Status sinkronisasi terakhir gagal! Klik untuk Paksa Sinkron Ulang data ke Cloud."
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : "animate-bounce"} />
                <span>Force Sync</span>
              </button>
            )}

            {/* Clear Connection Status Signal Badge */}
            <button
              type="button"
              onClick={() => {
                if (isOnline) {
                  toast.promise(syncData(), {
                    loading: 'Memaksa sinkronisasi ulang data ke Firebase Cloud...',
                    success: 'Seluruh data berhasil disinkronkan!',
                    error: (err) => 'Gagal sinkron: ' + (err?.message || 'Periksa koneksi')
                  });
                } else {
                  toast.error('Perangkat Anda dalam kondisi Offline');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer select-none shadow-sm ${
                isOnline 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30 animate-pulse'
              }`}
              title={isOnline ? "Status: Online (Sinyal Stabil) • Klik untuk Paksa Sinkron Ulang" : "Status: Offline (Sinyal Terputus) • Klik untuk Mencoba Koneksi"}
            >
              {isOnline ? (
                <>
                  <Wifi size={14} className="text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline text-[11px] font-bold">Online</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                </>
              ) : (
                <>
                  <WifiOff size={14} className="text-rose-400 shrink-0" />
                  <span className="text-[11px] font-bold">Offline</span>
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                </>
              )}
            </button>

            {/* Subtle Sync Status Indicator Badge & Dropdown */}
            <div className="relative">
              <div 
                onClick={() => setIsSyncDropdownOpen(!isSyncDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-all select-none shadow-sm ${
                  isSyncing 
                    ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20' 
                    : (syncStats && syncStats.unsyncedCount > 0) 
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' 
                    : 'bg-slate-800/90 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'
                }`}
                title={
                  isSyncing 
                    ? "Sedang menyinkronkan data dengan Cloud Firebase... Klik untuk detail" 
                    : (syncStats && syncStats.unsyncedCount > 0) 
                    ? `${syncStats.unsyncedCount} perubahan belum terunggah. Klik untuk detail` 
                    : "Seluruh data tersimpan & tersinkronisasi. Klik untuk menu sinkronisasi"
                }
              >
                <div className="relative flex items-center justify-center shrink-0">
                  <Cloud 
                    size={15} 
                    className={
                      isSyncing 
                        ? "text-sky-400 animate-pulse" 
                        : (syncStats && syncStats.unsyncedCount > 0) 
                        ? "text-amber-400" 
                        : "text-emerald-400"
                    } 
                  />
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    {isSyncing ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                      </>
                    ) : (syncStats && syncStats.unsyncedCount > 0) ? (
                      <>
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    )}
                  </span>
                </div>

                <span className="text-[11px] font-semibold tracking-wide truncate max-w-[110px] sm:max-w-[150px]">
                  {isSyncing ? (
                    <span className="text-sky-300 animate-pulse">Sinkronisasi...</span>
                  ) : (syncStats && syncStats.unsyncedCount > 0) ? (
                    <span className="text-amber-300">{syncStats.unsyncedCount} Perubahan</span>
                  ) : (
                    <span className="text-emerald-400">Tersinkron</span>
                  )}
                </span>
              </div>

              {/* Dropdown panel */}
              {isSyncDropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsSyncDropdownOpen(false)} />
                  
                  <div className="absolute right-0 mt-3 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-2xl z-50 text-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <Cloud size={16} className="text-indigo-400" />
                        <span className="font-semibold text-sm">Status Sinkronisasi</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Firebase Cloud
                      </span>
                    </div>

                    <>
                      {/* Granular Progress Bar Component */}
                      <div className="mb-4">
                        <SyncProgressBar compact={true} />
                      </div>

                      {/* Detailed Stats */}
                      <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-3 space-y-2 mb-4 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Baris Data:</span>
                          <span className="font-semibold text-slate-200">{syncStats?.totalItems || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Data Tersinkron:</span>
                          <span className="font-semibold text-emerald-400">{syncStats?.syncedCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Antrean Perubahan:</span>
                          <span className={`font-semibold ${syncStats && syncStats.unsyncedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {syncStats?.unsyncedCount || 0} item
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800/80 pt-2 mt-1">
                          <span className="text-slate-400">Status Database:</span>
                          <span className="font-bold flex items-center gap-1 text-emerald-400">
                            <Wifi size={12} />
                            <span>Firestore Active</span>
                          </span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-slate-400">Waktu Sinkron:</span>
                          <span className="font-medium text-indigo-300">
                            {lastSynced ? lastSynced.toLocaleTimeString('id-ID') : 'Belum sinkron'}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="space-y-2 text-xs">
                        <button
                          type="button"
                          onClick={async () => {
                            setIsSyncDropdownOpen(false);
                            toast.promise(syncData(), {
                              loading: 'Memaksa sinkronisasi ulang data ke Firebase...',
                              success: 'Sinkronisasi ulang ke Firebase selesai!',
                              error: (err) => 'Gagal sinkron: ' + (err?.message || 'Gagal')
                            });
                          }}
                          disabled={isSyncing}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30 rounded-xl text-left font-medium transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
                        >
                          <RefreshCw size={15} className={isSyncing ? "animate-spin text-white" : "text-white"} />
                          <div className="flex-1">
                            <p className="font-semibold text-white">Paksa Sinkron Ulang Sekarang</p>
                            <p className="text-[10px] text-indigo-100/80">Kirim seluruh data lokal ke Firebase Cloud</p>
                          </div>
                        </button>

                        {role !== 'kepsek' && onFullBackup && (
                          <button
                            onClick={async () => {
                              await onFullBackup();
                              setIsSyncDropdownOpen(false);
                            }}
                            disabled={isSyncing}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-xl text-left text-indigo-300 font-medium transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Cloud size={16} className="text-indigo-400" />
                            <div className="flex-1">
                              <p className="font-semibold text-indigo-200">Cadangkan Penuh ke Firebase</p>
                              <p className="text-[10px] text-indigo-400/80">Salin seluruh database ke Cloud Firestore</p>
                            </div>
                          </button>
                        )}

                        {role !== 'kepsek' && onPullData && (
                          <button
                            onClick={async () => {
                              setIsSyncDropdownOpen(false);
                              await onPullData();
                            }}
                            disabled={isSyncing}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl text-left text-emerald-300 font-medium transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Cloud size={16} className="text-emerald-400" />
                            <div className="flex-1">
                              <p className="font-semibold text-emerald-200">Ambil Data dari Firebase</p>
                              <p className="text-[10px] text-emerald-400/80">Pulihkan/timpa dari Cloud Firestore</p>
                            </div>
                          </button>
                        )}
                      </div>
                    </>

                    <button
                      type="button"
                      onClick={() => {
                        handleLocalBackup();
                        setIsSyncDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/30 rounded-xl text-left text-slate-300 transition-all cursor-pointer mt-2"
                    >
                      <Download size={14} className="text-slate-400" />
                      <span className="font-medium text-[11px]">Unduh File Backup (JSON Lokal)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSyncDropdownOpen(false);
                        setIsDbConnectModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-left text-indigo-300 transition-all cursor-pointer mt-2"
                    >
                      <Database size={14} className="text-indigo-400" />
                      <div className="flex-1">
                        <p className="font-semibold text-[11px] text-indigo-200">Hubungkan Database & Hosting</p>
                        <p className="text-[10px] text-indigo-400/80">Copy .env / Set custom Firestore anti-ribet</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsDbConnectModalOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-full text-indigo-300 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              title="Kelola Integrasi Database & Deploy Hosting"
            >
              <Database size={13} className="text-indigo-400 animate-pulse" />
              <span className="hidden sm:inline">Database Cloud</span>
            </button>

            {/* Task Notification Bell Button & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTaskNotificationOpen(!isTaskNotificationOpen)}
                className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700/90 border border-indigo-500/40 p-2 rounded-full text-indigo-300 hover:text-white transition-all cursor-pointer relative shadow-sm"
                title="Pusat Notifikasi & Reminder Tugas Siswa"
              >
                <Bell size={16} />
                {todayPendingTaskCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-mono font-extrabold text-white shadow-md animate-pulse">
                    {todayPendingTaskCount}
                  </span>
                ) : (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 items-center justify-center rounded-full bg-emerald-500" />
                )}
              </button>

              {isTaskNotificationOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsTaskNotificationOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <TaskNotificationWidget
                      semester={settings?.semester_aktif || ''}
                      compact={true}
                      onSelectTask={(taskId) => {
                        setIsTaskNotificationOpen(false);
                        setActiveMenu('tugas');
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Cloud size={14} className={isSyncing ? 'animate-bounce' : ''} />
              <span>Offline-First</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-3 sm:p-5 lg:p-8 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Re-connection Notification Banner */}
          {showRestoredBanner && (
            <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-indigo-950/90 border border-emerald-500/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-100 shadow-xl relative animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-400 shrink-0">
                  <Wifi size={18} className="animate-pulse" />
                </div>
                <div>
                  <p className="font-bold text-sm text-emerald-300">Koneksi Internet Kembali Stabil!</p>
                  <p className="text-slate-300 text-xs mt-0.5">Sistem telah terhubung kembali dengan jaringan. Anda dapat menyinkronkan seluruh perubahan data lokal ke Firebase Cloud.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={async () => {
                    setShowRestoredBanner(false);
                    toast.promise(syncData(), {
                      loading: 'Memaksa sinkronisasi ulang data ke Firebase Cloud...',
                      success: 'Seluruh data berhasil disinkronkan!',
                      error: (err) => 'Gagal sinkron: ' + (err?.message || 'Terjadi kesalahan')
                    });
                  }}
                  disabled={isSyncing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer border border-emerald-400/30"
                >
                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                  <span>Paksa Sinkron Ulang Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestoredBanner(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer border border-slate-700/50"
                  title="Tutup Banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}



          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 backdrop-blur-sm min-h-full overflow-hidden pb-12">
            <Suspense fallback={<PageLoader />}>
              {activeMenu === 'dashboard' && (
                <Dashboard 
                  semester={settings?.semester_aktif || ''} 
                  syncData={syncData} 
                  onPullData={onPullData} 
                  isSyncing={isSyncing} 
                />
              )}
              {activeMenu === 'siswa' && <DataSiswa role={role as any} settings={settings} setSettings={setSettings} semester={settings?.semester_aktif || ''} />}
              {activeMenu === 'notifikasi_wa' && <NotifikasiWA role={role as any} />}
              {activeMenu === 'jurnal_guru' && <JurnalGuru role={role as any} semester={settings?.semester_aktif || ''} settings={settings} />}
              {activeMenu === 'kas_kelas' && <KasKelas role={role as any} semester={settings?.semester_aktif || ''} settings={settings} />}
              {activeMenu === 'nilai' && <Nilai role={role as any} semester={settings?.semester_aktif || ''} settings={settings} setSettings={setSettings} />}
              {activeMenu === 'absensi' && <Absensi role={role as any} semester={settings?.semester_aktif || ''} settings={settings} setSettings={setSettings} />}
              {activeMenu === 'tugas' && <ManajemenTugas role={role as any} semester={settings?.semester_aktif || ''} settings={settings} />}
              {activeMenu === 'roster_piket' && (
                <RosterPiket 
                  role={role as any} 
                  semester={settings?.semester_aktif || ''} 
                  settings={settings} 
                  syncData={syncData}
                  isSyncing={isSyncing}
                />
              )}
              {activeMenu === 'rapor' && <Rapor role={role as any} settings={settings} setSettings={setSettings} semester={settings?.semester_aktif || ''} />}
              {activeMenu === 'ekspor' && <EksporTerpadu settings={settings} />}
              {activeMenu === 'identitas' && canAccessMenu(user, 'identitas') && <IdentitasSekolah settings={settings} setSettings={setSettings} />}
              {activeMenu === 'users' && isSystemAdmin && <Pengaturan role={role as any} settings={settings} setSettings={setSettings} currentUser={user} initialTab="users" />}
              {activeMenu === 'pengaturan' && canAccessMenu(user, 'pengaturan') && <Pengaturan role={role as any} settings={settings} setSettings={setSettings} currentUser={user} initialTab="umum" />}
              {activeMenu === 'diagnostik' && canAccessMenu(user, 'diagnostik') && <DiagnostikDatabase />}
              {activeMenu === 'dokumentasi' && canAccessMenu(user, 'dokumentasi') && <Dokumentasi />}
              {activeMenu === 'panduan' && canAccessMenu(user, 'panduan') && <Panduan />}
            </Suspense>
          </div>
        </div>
      </main>

      {/* Fixed Detailed Bottom Footer Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/90 px-3 sm:px-4 py-1.5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 shadow-2xl print:hidden">
        {/* Left: Interactive Status & Sync Queue Trigger */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsManualSyncModalOpen(true)}
            className="flex items-center gap-2 hover:bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-800 transition-colors cursor-pointer group"
            title="Klik untuk membuka Pusat Antrean Sinkronisasi Manual & Monitoring Offline"
          >
            <span className={`w-2 h-2 rounded-full ${
              isOnline 
                ? (isSyncing ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse')
                : 'bg-rose-500'
            }`} />
            <span className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">
              {isOnline ? (isSyncing ? 'Sinkronisasi...' : 'Online') : 'Offline'}
            </span>

            <span className="text-slate-600 hidden md:inline">•</span>
            <span className="text-slate-400 font-mono text-[10px] hidden md:inline">
              {fbStatus.lastSyncTime ? `Sinkron: ${fbStatus.lastSyncTime}` : 'Belum sync'}
            </span>

            {/* Pending Queue Count Badge */}
            {pendingKeys.size > 0 ? (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.2 rounded-full flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                {pendingKeys.size} Pending
              </span>
            ) : (
              <span className="bg-slate-800 text-slate-400 text-[10px] font-medium px-2 py-0.2 rounded-full hidden sm:inline">
                0 Pending
              </span>
            )}
          </button>
        </div>

        {/* Right: Push Notification Permission Toggle & Developer Credit */}
        <div className="flex items-center gap-3 font-medium">
          {notifPermission !== 'unsupported' && (
            <button
              onClick={handleToggleNotification}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold transition-all ${
                notifPermission === 'granted'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 animate-bounce'
              }`}
              title={notifPermission === 'granted' ? 'Notifikasi Push Aktif' : 'Klik untuk mengaktifkan notifikasi push Firestore'}
            >
              <Bell className={`w-3 h-3 ${notifPermission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="hidden sm:inline">
                {notifPermission === 'granted' ? 'Notifikasi Push Aktif' : 'Aktifkan Notifikasi'}
              </span>
            </button>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 hidden sm:inline">Dibuat oleh</span>
            <span className="font-bold text-indigo-300 bg-gradient-to-r from-indigo-500/20 via-sky-500/20 to-purple-500/20 border border-indigo-500/40 px-2.5 py-0.5 rounded-md text-[11px] shadow-sm">
              Horas Siadari
            </span>
          </div>
        </div>
      </footer>

      {/* Modal Add Semester */}
      {isAddingSemester && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-medium text-slate-200 mb-4">Tambah Semester Baru</h3>
            <p className="text-sm text-slate-400 mb-4">Masukkan nama semester baru untuk ditambahkan dan diaktifkan:</p>
            <input 
              type="text"
              autoFocus
              value={newSemesterName}
              onChange={e => setNewSemesterName(e.target.value)}
              placeholder="Contoh: Ganjil 2027"
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all mb-6"
            />
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setIsAddingSemester(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirmAddSemester}
                disabled={!newSemesterName.trim()}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Backup Reminder Modal */}
      <WeeklyBackupModal role={role} syncData={syncData} isSyncing={isSyncing} />

      {/* Global Student Dossier Modal */}
      <StudentDossierModal
        isOpen={!!selectedStudentForDossier}
        studentId={selectedStudentForDossier}
        onClose={() => setSelectedStudentForDossier(null)}
        settings={settings}
      />

      {/* Manual Sync Queue & Offline Resilience Modal */}
      <ManualSyncQueueModal
        isOpen={isManualSyncModalOpen}
        onClose={() => setIsManualSyncModalOpen(false)}
        onSyncComplete={onPullData}
      />

      {/* Multi-Device Conflict Resolution Modal */}
      <ConflictResolutionModal />

      {/* Database & Hosting Connection Modal */}
      <Suspense fallback={null}>
        <DatabaseConnectModal
          isOpen={isDbConnectModalOpen}
          onClose={() => setIsDbConnectModalOpen(false)}
        />
      </Suspense>
    </div>
  );
}
