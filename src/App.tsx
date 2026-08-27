import React, { useEffect, useState, useRef } from 'react';
import { store, initializeStore, Settings, AppUser } from './lib/store';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SchoolProvider } from './context/SchoolContext';
import Layout from './components/Layout';
import Loading from './components/Loading';
import SkeletonScreen from './components/SkeletonScreen';
import SessionTimeoutModal from './components/SessionTimeoutModal';
import SyncProgressToast from './components/SyncProgressToast';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { pushDataToSheets, pullDataFromSheets, getSyncStats, validateStudentData } from './lib/sync';
import { startBackgroundIntegrityObserver } from './lib/integrityObserver';
import { initFirebaseRealtimeSync, pushAllLocalDataToFirebase, pullAllRemoteDataFromFirebase, fetchLatestUsersFromFirebase, verifySiswaCollectionSecurityRules } from './lib/firebaseSync';
import { sanitizeInput, sanitizeUsername, containsSqlInjection, getLockoutStatus, recordFailedAttempt, resetFailedAttempts } from './lib/security';
import { logAuditEvent } from './lib/auditLogger';
import { RefreshCw, Eye, EyeOff, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';

function MainAppContent() {
  const { user, role, login, logout, verifySession } = useAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Login credentials & Security
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [lockoutStatus, setLockoutStatus] = useState(() => {
    try {
      return getLockoutStatus();
    } catch (e) {
      return { isLocked: false, remainingSeconds: 0, attemptsCount: 0 };
    }
  });

  // Forgot Password state & Password visibility
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [foundRecoveryUser, setFoundRecoveryUser] = useState<AppUser | null>(null);
  const [recoveryMethod, setRecoveryMethod] = useState<'question' | 'email'>('question');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [enteredEmail, setEnteredEmail] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSentStatus, setOtpSentStatus] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'username' | 'verify' | 'reset'>('username');

  // Session Timeout State (15 mins inactivity auto-logout, 13 mins warning)
  const lastActivityRef = useRef<number>(Date.now());
  const [showTimeoutModal, setShowTimeoutModal] = useState<boolean>(false);
  const [timeoutRemainingSeconds, setTimeoutRemainingSeconds] = useState<number>(120);

  // Background/Manual Synchronization status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [hasSyncFailed, setHasSyncFailed] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncStats, setSyncStats] = useState({
    percentage: 100,
    unsyncedCount: 0,
    syncedCount: 0,
    totalItems: 0,
    queueItems: [] as { store: string; id: string; action: string }[]
  });

  const loadSyncStats = async () => {
    const statsObj = await getSyncStats();
    setSyncStats(statsObj);
  };

  useEffect(() => {
    loadSyncStats();
    window.addEventListener('data-changed', loadSyncStats);
    window.addEventListener('sync-status-changed', loadSyncStats);
    return () => {
      window.removeEventListener('data-changed', loadSyncStats);
      window.removeEventListener('sync-status-changed', loadSyncStats);
    };
  }, []);

  useEffect(() => {
    const handleDataChange = (e: Event) => {
      if ((e as CustomEvent).detail?.source === 'sync') return;
      setHasUnsyncedChanges(true);
    };

    const handleSettingsUpdate = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.storeName === 'settings' || detail.collectionName === 'settings') {
        const fresh = await store.settings.getItem<Settings>('app_settings');
        if (fresh) {
          setSettings(fresh);
        }
      }
    };

    window.addEventListener('data-changed', handleDataChange);
    window.addEventListener('delta-data-changed', handleSettingsUpdate);
    window.addEventListener('sync-status-changed', handleSettingsUpdate);

    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      window.removeEventListener('delta-data-changed', handleSettingsUpdate);
      window.removeEventListener('sync-status-changed', handleSettingsUpdate);
    };
  }, []);

  const runBackgroundSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const [pushRes, pullRes] = await Promise.all([
        pushAllLocalDataToFirebase(false, true),
        pullAllRemoteDataFromFirebase(false, true)
      ]);
      if (pushRes.success || pullRes.success) {
        setHasSyncFailed(false);
      } else {
        setHasSyncFailed(true);
      }
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      toast.dismiss('bg-sync-error');
      // Dispatch data-changed event with source flag to update React state smoothly without loops or reloads
      if ((pushRes.count || 0) > 0 || (pullRes.count || 0) > 0) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('data-changed', { detail: { source: 'sync' } }));
        }
      }
      console.log('Background Sync: Berhasil disinkronkan dua arah ke Firebase pada', new Date().toLocaleTimeString());
    } catch (err: any) {
      setHasSyncFailed(true);
      console.warn('Background Sync: Gagal melakukan sinkronisasi otomatis', err?.message || err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      loadSyncStats();
    }
  };

  // Background Sync Engine (Offline-First to Firebase Cloud sync in background with 3-second debounce or immediate trigger)
  useEffect(() => {
    if (!user) return;

    let syncTimeout: NodeJS.Timeout;

    if (hasUnsyncedChanges) {
      syncTimeout = setTimeout(() => {
        runBackgroundSync();
      }, 3000);
    }

    const handleOnline = () => {
      if (hasUnsyncedChanges) {
        runBackgroundSync();
      }
    };

    const handleImmediateSync = () => {
      runBackgroundSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('trigger-immediate-sync', handleImmediateSync);

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('trigger-immediate-sync', handleImmediateSync);
    };
  }, [user, hasUnsyncedChanges]);

  const handleManualSync = async () => {
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }

    const isValid = await validateStudentData();
    if (!isValid) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const [pushRes, pullRes] = await Promise.all([
        pushAllLocalDataToFirebase(),
        pullAllRemoteDataFromFirebase()
      ]);
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);

      // Trigger automatic soft update of data across views without reloading
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('data-changed', { detail: { source: 'sync' } }));
      }

      if (pushRes.success || pullRes.success) {
        setHasSyncFailed(false);
        const total = (pushRes.count || 0) + (pullRes.count || 0);
        toast.success(`Sinkronisasi selesai! (${total} data diperbarui, UI diperbarui otomatis)`, { id: 'manual-sync-success' });
      } else {
        setHasSyncFailed(true);
        toast.error('Sinkronisasi Firebase: ' + (pushRes.message || pullRes.message));
      }
    } catch (err: any) {
      setHasSyncFailed(true);
      console.error(err);
      toast.error('Gagal melakukan sinkronisasi: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      loadSyncStats();
    }
  };

  const handleForceSync = async () => {
    setHasSyncFailed(false);
    await handleManualSync();
  };

  const handleFullBackupCloud = async () => {
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }

    const isValid = await validateStudentData();
    if (!isValid) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const res = await pushAllLocalDataToFirebase();
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      toast.success('Pencadangan penuh seluruh data ke Cloud Firebase berhasil!');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal melakukan pencadangan penuh: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  const handlePullDataCloud = async () => {
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const res = await pushAllLocalDataToFirebase();
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      window.dispatchEvent(new CustomEvent('data-changed', { detail: { source: 'sync' } }));
      toast.success('Status data tersinkronisasi sempurna dengan Cloud Firebase!');
    } catch (err: any) {
      console.error('[App] Gagal memulihkan data dari Cloud:', err);
      toast.error('Gagal mengambil data dari Cloud: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    // Ultra-fast local session verification via AuthContext
    verifySession();

    setIsInitializing(true);
    try {
      // Execute store initialization and settings load in parallel
      const [, currentSettings, adminUser] = await Promise.all([
        initializeStore(),
        store.settings.getItem<Settings>('app_settings'),
        store.users.getItem<AppUser>('admin').catch(() => null)
      ]);

      if (currentSettings) {
        setSettings(currentSettings);
      }

      // Ensure default admin user exists if not found
      if (!adminUser) {
        let hasAdminInStore = false;
        await store.users.iterate((u: AppUser) => {
          if (u.username === 'admin') hasAdminInStore = true;
        });

        if (!hasAdminInStore) {
          await store.users.setItem('admin', { 
            id: 'admin', 
            username: 'admin', 
            password: 'admin', 
            role: 'admin', 
            name: 'Administrator',
            assignedClasses: ['*'],
            pertanyaan_keamanan: 'Nama SD Pertama Anda?',
            jawaban_keamanan: 'sd',
            email_pemulihan: 'admin@edusync.id'
          });
        }
      }

      // Defer heavy background tasks (integrity check & realtime sync & rules verification) to allow instant UI paint
      setTimeout(() => {
        startBackgroundIntegrityObserver();
        initFirebaseRealtimeSync();
        verifySiswaCollectionSecurityRules();
      }, 50);
    } catch (e) {
      console.error('Initialization error:', e);
    } finally {
      setIsInitializing(false);
    }
  };

  // Lockout countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutStatus.isLocked) {
      timer = setInterval(() => {
        const status = getLockoutStatus();
        setLockoutStatus(status);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutStatus.isLocked]);

  // Session Inactivity Auto-Logout Engine
  useEffect(() => {
    if (!user) {
      setShowTimeoutModal(false);
      return;
    }

    const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes session timeout
    const WARNING_THRESHOLD_MS = 13 * 60 * 1000;  // 13 minutes inactivity warning

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      setShowTimeoutModal((prev) => (prev ? false : prev));
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        // Auto-logout user on inactivity timeout
        logout();
        setShowTimeoutModal(false);
        toast.error('Sesi Anda telah berakhir secara otomatis demi keamanan karena tidak ada aktivitas selama 15 menit. Silakan masuk kembali.', {
          duration: 8000,
          id: 'session-timeout-toast'
        });
      } else if (elapsed >= WARNING_THRESHOLD_MS) {
        const remainingSec = Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000);
        setTimeoutRemainingSeconds(remainingSec);
        setShowTimeoutModal(true);
      } else {
        setShowTimeoutModal((prev) => (prev ? false : prev));
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
    };
  }, [user, logout]);

  const handleExtendSession = () => {
    lastActivityRef.current = Date.now();
    setShowTimeoutModal(false);
    toast.success('Sesi Anda berhasil diperpanjang!');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Check honeypot field (anti-bot)
    if (honeypot) {
      toast.error('Akses ditolak (Deteksi Bot/Script Otomatis)');
      return;
    }

    // 2. Check brute-force lockout status
    const currentLockout = getLockoutStatus();
    if (currentLockout.isLocked) {
      toast.error(`Akses dikunci sementara karena ${currentLockout.attemptsCount}x percobaan login gagal. Silakan tunggu ${currentLockout.remainingSeconds} detik lagi.`, { id: 'lockout-toast' });
      return;
    }

    // 3. Anti-SQL Injection & Anti-Script Injection Safeguards
    if (containsSqlInjection(username) || containsSqlInjection(password)) {
      toast.error('Peringatan Keamanan: Karakter/Pola perintah berbahaya (SQL/Script Injection) terdeteksi!', { duration: 5000 });
      const status = recordFailedAttempt();
      setLockoutStatus(status);
      return;
    }

    const cleanUsername = sanitizeUsername(username);
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      toast.error('Username dan password harus diisi');
      return;
    }

    let foundUser: AppUser | null = null;

    // Helper to search local user store
    const findLocalUser = async (): Promise<AppUser | null> => {
      let matched: AppUser | null = null;
      const directUser = await store.users.getItem<AppUser>(cleanUsername.toLowerCase()).catch(() => null);
      if (directUser && directUser.password === cleanPassword) {
        return directUser;
      }
      await store.users.iterate((u: AppUser) => {
        if (u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === cleanPassword) {
          matched = u;
        }
      });
      return matched;
    };

    // First attempt: Search local IndexedDB
    foundUser = await findLocalUser();

    // Second attempt: If user not found locally or password mismatch, fetch fresh users directly from Cloud Firestore
    if (!foundUser) {
      try {
        await fetchLatestUsersFromFirebase();
        foundUser = await findLocalUser();
      } catch (err) {
        console.warn('Error fetching remote users on login:', err);
      }
    }

    if (foundUser) {
      const u = foundUser as AppUser;
      resetFailedAttempts();
      setLockoutStatus({ isLocked: false, remainingSeconds: 0, attemptsCount: 0 });
      login(u);
      lastActivityRef.current = Date.now();
      logAuditEvent({
        action: 'LOGIN',
        entity: 'Autentikasi',
        details: `Pengguna @${u.username} (${u.name}) berhasil masuk sistem.`,
        user: u
      }).catch(() => {});
      toast.success(`Selamat datang, ${u.name}`);
    } else {
      const status = recordFailedAttempt();
      setLockoutStatus(status);
      if (status.isLocked) {
        toast.error(`Batas percobaan login tercapai (5/5). Akses dikunci selama 5 menit untuk keamanan!`, { duration: 6000 });
      } else {
        toast.error(`Username atau password salah. Sisa percobaan: ${5 - status.attemptsCount}`);
      }
    }
  };

  // Find user for recovery
  const handleFindRecoveryUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      toast.error('Silakan masukkan username');
      return;
    }

    let found: AppUser | null = null;
    await store.users.iterate((u: AppUser) => {
      if (u.username.toLowerCase() === forgotUsername.toLowerCase()) {
        found = u;
      }
    });

    if (!found) {
      // Fetch latest users from Cloud Firestore if recovery username not found locally
      await fetchLatestUsersFromFirebase().catch(() => {});
      await store.users.iterate((u: AppUser) => {
        if (u.username.toLowerCase() === forgotUsername.toLowerCase()) {
          found = u;
        }
      });
    }

    if (found) {
      const u = found as AppUser;
      setFoundRecoveryUser(u);
      setRecoveryStep('verify');
      setRecoveryMethod(u.pertanyaan_keamanan ? 'question' : 'email');
      setSecurityAnswer('');
      setEnteredEmail('');
      setSentOtp('');
      setEnteredOtp('');
      setOtpSentStatus(false);
    } else {
      toast.error('Username tidak ditemukan');
    }
  };

  // Simulate sending recovery email OTP
  const handleSendEmailOtp = () => {
    if (!foundRecoveryUser) return;
    const targetEmail = foundRecoveryUser.email_pemulihan || 'admin@edusync.id';
    
    // Validate if they enter their email for secure confirmation
    if (!enteredEmail.trim()) {
      toast.error('Silakan masukkan alamat email pemulihan terdaftar untuk konfirmasi');
      return;
    }

    if (enteredEmail.toLowerCase().trim() !== targetEmail.toLowerCase().trim()) {
      toast.error('Alamat email pemulihan tidak cocok!');
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(otp);
    setOtpSentStatus(true);
    
    // Show OTP in toaster realistically for simulated local environment
    toast.success(`OTP dikirim ke ${targetEmail}. Kode: ${otp}`, { duration: 10000 });
  };

  // Verify recovery credentials
  const handleVerifyRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRecoveryUser) return;

    if (recoveryMethod === 'question') {
      const actualAnswer = foundRecoveryUser.jawaban_keamanan || 'sd';
      if (securityAnswer.toLowerCase().trim() === actualAnswer.toLowerCase().trim()) {
        setRecoveryStep('reset');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toast.error('Jawaban pertanyaan keamanan salah!');
      }
    } else {
      if (!sentOtp) {
        toast.error('Silakan kirim kode OTP terlebih dahulu');
        return;
      }
      if (enteredOtp.trim() === sentOtp) {
        setRecoveryStep('reset');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toast.error('Kode OTP salah atau tidak valid');
      }
    }
  };

  // Reset the password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRecoveryUser) return;

    if (newPassword.length < 4) {
      toast.error('Password minimal 4 karakter');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }

    const updatedUser: AppUser = {
      ...foundRecoveryUser,
      password: newPassword
    };

    await store.users.setItem(updatedUser.id, updatedUser);
    toast.success('Password berhasil diperbarui! Silakan masuk.');
    
    // Clean up recovery states and go back
    setIsForgotPassword(false);
    setFoundRecoveryUser(null);
    setRecoveryStep('username');
    setForgotUsername('');
    setUsername(updatedUser.username);
    setPassword('');
  };

  if (isInitializing) {
    return <SkeletonScreen />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 relative font-sans">
        <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }} />
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.08)_0%,transparent_100%)]"></div>
        <div className="bg-slate-800 border border-slate-700/80 p-8 rounded-2xl max-w-md w-full space-y-6 relative z-10 shadow-2xl">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center text-slate-100">Selamat Datang</h1>
          <p className="text-slate-400 mb-8 text-sm text-center">Sistem Informasi Manajemen Kelas Terpadu</p>
          
          {!isForgotPassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Hidden honeypot field to block automated bot attacks */}
              <input
                type="text"
                name="website_url_hp"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />

              {/* Lockout Warning Banner */}
              {lockoutStatus.isLocked && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-pulse">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-200">Keamanan: Login Dikunci Sementara</p>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Batas percobaan gagal ({lockoutStatus.attemptsCount}/5). Coba lagi dalam{' '}
                      <span className="font-extrabold text-amber-300 font-mono">{lockoutStatus.remainingSeconds}s</span>
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Username</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  placeholder="Masukkan username"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                  required 
                  disabled={lockoutStatus.isLocked}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Masukkan password"
                    className="w-full pl-4 pr-11 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                    required 
                    disabled={lockoutStatus.isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                    title={showPassword ? "Sembunyikan Password" : "Tampilkan Password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => { setIsForgotPassword(true); setRecoveryStep('username'); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer">
                  Lupa Password?
                </button>
              </div>

              <button 
                type="submit" 
                disabled={lockoutStatus.isLocked}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all mt-2 cursor-pointer flex items-center justify-center gap-2"
              >
                <Lock size={16} />
                <span>Masuk Sistem</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                <h3 className="font-semibold text-slate-200 text-sm">Lupa Password</h3>
                <button onClick={() => setIsForgotPassword(false)} className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">Batal</button>
              </div>

              {recoveryStep === 'username' && (
                <form onSubmit={handleFindRecoveryUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Masukkan Username</label>
                    <input type="text" value={forgotUsername} onChange={e => setForgotUsername(e.target.value)} placeholder="Contoh: admin" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    Verifikasi Akun
                  </button>
                </form>
              )}

              {recoveryStep === 'verify' && foundRecoveryUser && (
                <form onSubmit={handleVerifyRecovery} className="space-y-4">
                  <div className="text-xs text-slate-400 mb-2">
                    Akun: <span className="font-semibold text-slate-200">{foundRecoveryUser.name} ({foundRecoveryUser.username})</span>
                  </div>

                  {foundRecoveryUser.pertanyaan_keamanan && foundRecoveryUser.email_pemulihan && (
                    <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700/50 text-xs mb-3">
                      <button type="button" onClick={() => setRecoveryMethod('question')} className={`flex-1 py-1.5 rounded-lg text-center font-medium transition-all ${recoveryMethod === 'question' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                        Pertanyaan Keamanan
                      </button>
                      <button type="button" onClick={() => setRecoveryMethod('email')} className={`flex-1 py-1.5 rounded-lg text-center font-medium transition-all ${recoveryMethod === 'email' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                        Email Pemulihan
                      </button>
                    </div>
                  )}

                  {recoveryMethod === 'question' ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900/30 border border-slate-700/40 rounded-xl">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Pertanyaan Keamanan:</p>
                        <p className="text-sm font-medium text-slate-200">{foundRecoveryUser.pertanyaan_keamanan || 'Nama SD Pertama Anda?'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Jawaban Anda</label>
                        <input type="text" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} placeholder="Masukkan jawaban" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900/30 border border-slate-700/40 rounded-xl text-xs">
                        <p className="text-slate-400 uppercase tracking-wider mb-1">Email Terdaftar:</p>
                        <p className="font-medium text-slate-200">
                          {(() => {
                            const email = foundRecoveryUser.email_pemulihan || 'admin@edusync.id';
                            const [userPart, domainPart] = email.split('@');
                            return `${userPart[0]}***${userPart[userPart.length - 1] || ''}@${domainPart}`;
                          })()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Ketik Ulang Email Pemulihan Lengkap</label>
                        <div className="flex gap-2">
                          <input type="email" value={enteredEmail} onChange={e => setEnteredEmail(e.target.value)} placeholder="admin@edusync.id" className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required={recoveryMethod === 'email'} />
                          <button type="button" onClick={handleSendEmailOtp} className="px-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-xs font-semibold text-white transition-all whitespace-nowrap cursor-pointer">
                            Kirim OTP
                          </button>
                        </div>
                      </div>

                      {otpSentStatus && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kode OTP (6 Digit)</label>
                          <input type="text" maxLength={6} value={enteredOtp} onChange={e => setEnteredOtp(e.target.value)} placeholder="Masukkan kode OTP" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                        </div>
                      )}
                    </div>
                  )}

                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    Lanjutkan Reset
                  </button>
                </form>
              )}

              {recoveryStep === 'reset' && foundRecoveryUser && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password Baru</label>
                    <div className="relative">
                      <input 
                        type={showNewPassword ? 'text' : 'password'} 
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)} 
                        placeholder="Minimal 4 karakter"
                        className="w-full pl-4 pr-11 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                        title={showNewPassword ? "Sembunyikan Password" : "Tampilkan Password"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Konfirmasi Password Baru</label>
                    <div className="relative">
                      <input 
                        type={showConfirmNewPassword ? 'text' : 'password'} 
                        value={confirmNewPassword} 
                        onChange={e => setConfirmNewPassword(e.target.value)} 
                        placeholder="Ulangi password baru"
                        className="w-full pl-4 pr-11 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                        title={showConfirmNewPassword ? "Sembunyikan Password" : "Tampilkan Password"}
                      >
                        {showConfirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    Perbarui Password
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }} />
      <SyncProgressToast isSyncing={isSyncing} />
      <SessionTimeoutModal
        isOpen={showTimeoutModal}
        remainingSeconds={timeoutRemainingSeconds}
        onExtendSession={handleExtendSession}
        onLogoutNow={logout}
      />
      <Layout 
        user={user as any} 
        role={role || 'guru'}
        onLogout={logout} 
        syncData={handleManualSync} 
        onForceSync={handleForceSync}
        hasSyncFailed={hasSyncFailed}
        onFullBackup={handleFullBackupCloud}
        onPullData={handlePullDataCloud}
        isSyncing={isSyncing} 
        settings={settings}
        setSettings={setSettings}
        hasUnsyncedChanges={hasUnsyncedChanges}
        syncStats={syncStats}
        lastSynced={lastSynced}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SchoolProvider>
        <MainAppContent />
      </SchoolProvider>
    </AuthProvider>
  );
}
