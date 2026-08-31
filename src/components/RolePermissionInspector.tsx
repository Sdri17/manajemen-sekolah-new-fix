import React, { useState, useEffect } from 'react';
import { getCurrentUser, ROLE_CONFIGS } from '../lib/rbac';
import { AppUser } from '../lib/store';
import { verifyWaliKelasSecurityRules, WaliKelasRulesDiagnosticResult } from '../lib/firebaseSync';
import { auth } from '../lib/firebase';
import { 
  UserCheck, 
  Shield, 
  Key, 
  Layers, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Play, 
  Terminal,
  Database,
  Lock,
  Unlock,
  Building2,
  Mail,
  User,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function RolePermissionInspector() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [testClassInput, setTestClassInput] = useState<string>('7-A');
  const [visibilityResult, setVisibilityResult] = useState<{
    classId: string;
    isAllowed: boolean;
    reason: string;
    scopeType: string;
  } | null>(null);

  const [rulesTestLoading, setRulesTestLoading] = useState(false);
  const [rulesTestResult, setRulesTestResult] = useState<WaliKelasRulesDiagnosticResult | null>(null);

  const refreshUserData = () => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if (user?.assignedKelas) {
      setTestClassInput(user.assignedKelas);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, []);

  // Evaluate class visibility for test input
  const evaluateVisibility = (classIdToTest: string) => {
    if (!currentUser) {
      setVisibilityResult({
        classId: classIdToTest,
        isAllowed: false,
        reason: 'Sesi pengguna tidak terautentikasi.',
        scopeType: 'NO_SESSION'
      });
      return;
    }

    const role = currentUser.role || 'wali_kelas';
    const assigned = currentUser.assignedKelas || '';

    if (role === 'admin' || role === 'kepsek') {
      setVisibilityResult({
        classId: classIdToTest,
        isAllowed: true,
        reason: `Peran '${role}' memiliki hak akses penuh (Global Scope) ke seluruh rombel & kelas.`,
        scopeType: 'GLOBAL_ADMIN'
      });
    } else if (role === 'wali_kelas') {
      const isMatch = String(assigned).trim().toLowerCase() === String(classIdToTest).trim().toLowerCase();
      if (isMatch) {
        setVisibilityResult({
          classId: classIdToTest,
          isAllowed: true,
          reason: `Kelas '${classIdToTest}' cocok dengan kelas binaan Wali Kelas ('${assigned}').`,
          scopeType: 'MATCHED_WALI_KELAS'
        });
      } else {
        setVisibilityResult({
          classId: classIdToTest,
          isAllowed: false,
          reason: `Akses ditolak: Wali Kelas binaan '${assigned}' dibatasi dan tidak memiliki izin mengakses kelas '${classIdToTest}'.`,
          scopeType: 'RESTRICTED_WALI_KELAS'
        });
      }
    } else if (role === 'guru' || role === 'guru_mapel') {
      // Guru mapel access logic
      const isAssigned = !assigned || assigned === 'semua' || String(assigned).trim().toLowerCase() === String(classIdToTest).trim().toLowerCase();
      if (isAssigned) {
        setVisibilityResult({
          classId: classIdToTest,
          isAllowed: true,
          reason: `Guru Memiliki akses ke kelas '${classIdToTest}'.`,
          scopeType: 'GURU_ACCESS'
        });
      } else {
        setVisibilityResult({
          classId: classIdToTest,
          isAllowed: false,
          reason: `Guru hanya ditugaskan untuk kelas '${assigned}' dan dibatasi dari kelas '${classIdToTest}'.`,
          scopeType: 'RESTRICTED_GURU'
        });
      }
    } else {
      setVisibilityResult({
        classId: classIdToTest,
        isAllowed: false,
        reason: `Peran '${role}' tidak memiliki izin membaca data rombel.`,
        scopeType: 'DENIED_OTHER_ROLE'
      });
    }
  };

  const handleRunSecurityRulesDiagnostic = async () => {
    setRulesTestLoading(true);
    toast.loading('Menjalankan pengujian testRead aturan keamanan Firestore...', { id: 'rules-test' });
    try {
      const res = await verifyWaliKelasSecurityRules(testClassInput);
      setRulesTestResult(res);
      if (res.isRulesFilteringCorrectly) {
        toast.success('Pengujian Aturan Keamanan Firestore SUKSES!', { id: 'rules-test' });
      } else {
        toast.error('Pengujian Aturan Keamanan memerlukan penyesuaian', { id: 'rules-test' });
      }
    } catch (err: any) {
      toast.error(`Gagal menjalankan diagnostik: ${err?.message || err}`, { id: 'rules-test' });
    } finally {
      setRulesTestLoading(false);
    }
  };

  const roleConfig = currentUser?.role ? (ROLE_CONFIGS as any)[currentUser.role] : null;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Inspector Peran & Izin Akses (RBAC)
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  Runtime Metadata
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Periksa metadata autentikasi aktif, isolasi rombel, dan jalankan simulasi pengujian aturan keamanan Firestore.
              </p>
            </div>
          </div>

          <button
            onClick={refreshUserData}
            className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto"
          >
            <RefreshCw size={14} />
            <span>Segarkan Metadata Sesi</span>
          </button>
        </div>

        {/* User Metadata Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Box 1: Profile Info */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
              <User size={14} className="text-indigo-400" />
              <span>Pengguna Terautentikasi</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Lengkap:</span>
                <span className="font-semibold text-slate-200">{currentUser?.name || 'Sistem / Guest'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Username:</span>
                <span className="font-mono text-indigo-300">@{currentUser?.username || 'admin'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-300 text-[11px]">{(currentUser as any)?.email || auth?.currentUser?.email || 'admin@sekolah.id'}</span>
              </div>
            </div>
          </div>

          {/* Box 2: Active Role */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
              <Shield size={14} className="text-emerald-400" />
              <span>Peran Aktif (Role)</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Role ID:</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono font-bold uppercase">
                  {currentUser?.role || 'admin'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Label Peran:</span>
                <span className="font-semibold text-slate-200">{roleConfig?.name || roleConfig?.label || 'Administrator Utama'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scope Izin:</span>
                <span className="font-mono text-emerald-400">
                  {currentUser?.role === 'admin' ? 'Akses Penuh Global' : 'Isolasi Rombel Binaan'}
                </span>
              </div>
            </div>
          </div>

          {/* Box 3: Class Scope */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
              <Building2 size={14} className="text-sky-400" />
              <span>Cakupan Rombel (Assigned Class)</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Kelas Binaan:</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono font-bold">
                  {currentUser?.assignedKelas || (currentUser?.role === 'admin' ? 'Semua Kelas (Global)' : 'Tidak Ada')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Path Rules:</span>
                <span className="font-mono text-slate-400 text-[10px]">
                  {currentUser?.assignedKelas ? `/classes/${currentUser.assignedKelas}/*` : '/students/* (All)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Filter:</span>
                <span className="font-semibold text-emerald-400">Aktif Terisolasi</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator & Diagnostic Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Class Visibility Simulator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Eye size={18} className="text-indigo-400" />
            <h4 className="text-base font-bold text-slate-100">Simulator Visibilitas Data Rombel</h4>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Uji apakah pengguna yang sedang terautentikasi memiliki hak akses membaca & mengelola data untuk target ID kelas tertentu.
          </p>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Masukkan ID Kelas (misal: 7-A, 8-B, 9-C)..."
                value={testClassInput}
                onChange={(e) => setTestClassInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              onClick={() => evaluateVisibility(testClassInput)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <Play size={14} />
              <span>Simulasi Akses</span>
            </button>
          </div>

          {visibilityResult && (
            <div className={`p-4 rounded-xl border text-xs space-y-2 ${visibilityResult.isAllowed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {visibilityResult.isAllowed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  Hasil Simulasi Untuk Kelas '{visibilityResult.classId}':
                </span>
                <span className="font-mono px-2 py-0.5 rounded bg-slate-950 uppercase text-[10px]">
                  {visibilityResult.isAllowed ? 'AKSES DIIZINKAN' : 'AKSES DITOLAK'}
                </span>
              </div>
              <p className="leading-relaxed font-sans text-slate-200">
                {visibilityResult.reason}
              </p>
              <div className="text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800/60">
                Evaluasi Kode Rules: <span className="text-indigo-400">{visibilityResult.scopeType}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Card: Security Rules testRead Diagnostic */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock size={18} className="text-amber-400" />
              <h4 className="text-base font-bold text-slate-100">Uji Aturan Keamanan Firestore (testRead)</h4>
            </div>
            <button
              onClick={handleRunSecurityRulesDiagnostic}
              disabled={rulesTestLoading}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-600/20 disabled:opacity-50"
            >
              <Terminal size={14} />
              <span>{rulesTestLoading ? 'Menguji...' : 'Jalankan testRead'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Menjalankan query sampel langsung ke Cloud Firestore SDK untuk menguji apakah perizinan `read` untuk kelas binaan dan isolasi koleksi terlarang berjalan secara presisi.
          </p>

          {rulesTestResult ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <span>1. TestRead Sampel Kelas Binaan ({rulesTestResult.sampleStudentTestRead.classId}):</span>
                  <span className={rulesTestResult.sampleStudentTestRead.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {rulesTestResult.sampleStudentTestRead.passed ? 'PASSED (200 OK)' : 'FAILED'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] pl-2 border-l-2 border-indigo-500">
                  {rulesTestResult.sampleStudentTestRead.details}
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <span>2. TestRead Koleksi/Kelas Terlarang ({rulesTestResult.restrictedCollectionTestRead.restrictedClassId}):</span>
                  <span className={rulesTestResult.restrictedCollectionTestRead.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {rulesTestResult.restrictedCollectionTestRead.passed ? 'PASSED (ISOLATED)' : 'FAILED'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] pl-2 border-l-2 border-amber-500">
                  {rulesTestResult.restrictedCollectionTestRead.details}
                </p>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-slate-200">
                <span className="font-bold text-indigo-300 block mb-1">Kesimpulan Diagnostik Rules:</span>
                <span>{rulesTestResult.summary}</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
              Klik tombol <strong className="text-amber-400 font-mono">"Jalankan testRead"</strong> di atas untuk memverifikasi isolasi keamanan Firestore secara langsung.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

