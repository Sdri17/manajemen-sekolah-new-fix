import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Key, Database, AlertCircle, CheckCircle2, XCircle, Search, Terminal, Eye, FileText, Layers, X, Copy, RefreshCw } from 'lucide-react';
import { AppUser } from '../lib/store';
import { getCurrentUser, getAssignedClasses, getDisplayRoleLabel, isUserAdmin } from '../lib/rbac';
import { getTenantCollectionName, verifyWaliKelasSecurityRules } from '../lib/firebaseSync';
import toast from 'react-hot-toast';

interface ContextInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

export interface CollectionPermissionRule {
  collection: string;
  tenantCollectionPath: string;
  status: 'GRANTED_FULL' | 'GRANTED_FILTERED' | 'RESTRICTED';
  scopeDescription: string;
  assignedFilter: string;
}

export default function ContextInspectorModal({ isOpen, onClose, user }: ContextInspectorModalProps) {
  const [testClassName, setTestClassName] = useState<string>('');
  const [testResult, setTestResult] = useState<{ isAllowed: boolean; reason: string } | null>(null);
  const [isTestingRules, setIsTestingRules] = useState(false);
  const [ruleTestLogs, setRuleTestLogs] = useState<string[]>([]);

  const assignedClasses = getAssignedClasses(user);
  const isUnrestricted = assignedClasses.includes('*') || isUserAdmin(user) || user.role === 'kepsek';

  useEffect(() => {
    if (isOpen) {
      console.log('[Security Context Inspector] User Security Context Logged:', {
        uid: user.id || user.username,
        username: user.username,
        nama: user.name || user.username,
        email: (user as any).email || user.email_pemulihan || 'N/A',
        role: user.role,
        displayRole: getDisplayRoleLabel(user),
        assignedKelas: user.assignedKelas || 'N/A',
        assignedMapel: user.assignedMapel || 'N/A',
        assignedClasses,
        isUnrestricted,
        timestamp: new Date().toISOString()
      });
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const collectionPermissions: CollectionPermissionRule[] = [
    {
      collection: 'students',
      tenantCollectionPath: getTenantCollectionName('students'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke seluruh siswa' : `Dibatasi untuk kelas: ${assignedClasses.join(', ')}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter (Semua Rombel)' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'roster',
      tenantCollectionPath: getTenantCollectionName('roster'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke seluruh jadwal' : `Dibatasi untuk kelas: ${assignedClasses.join(', ')}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'piket',
      tenantCollectionPath: getTenantCollectionName('piket'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke jadwal piket' : `Dibatasi untuk kelas: ${assignedClasses.join(', ')}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'nilai',
      tenantCollectionPath: getTenantCollectionName('nilai'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke rekapan nilai' : `Dibatasi kelas ${assignedClasses.join(', ')}${user.assignedMapel ? ` & Mapel ${user.assignedMapel}` : ''}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'absensi',
      tenantCollectionPath: getTenantCollectionName('absensi'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke absensi' : `Dibatasi untuk kelas: ${assignedClasses.join(', ')}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'kas_kelas',
      tenantCollectionPath: getTenantCollectionName('kas_kelas'),
      status: isUnrestricted ? 'GRANTED_FULL' : assignedClasses.length > 0 ? 'GRANTED_FILTERED' : 'RESTRICTED',
      scopeDescription: isUnrestricted ? 'Akses penuh ke jurnal kas' : `Dibatasi untuk kelas: ${assignedClasses.join(', ')}`,
      assignedFilter: isUnrestricted ? 'Tanpa Filter' : `where('kelas', 'in', [${assignedClasses.join(', ')}])`
    },
    {
      collection: 'jurnal_guru',
      tenantCollectionPath: getTenantCollectionName('jurnal_guru'),
      status: 'GRANTED_FULL',
      scopeDescription: 'Dapat membaca & mengedit jurnal pribadi',
      assignedFilter: `where('userId', '==', '${user.id || user.username}')`
    },
    {
      collection: 'audit_logs',
      tenantCollectionPath: getTenantCollectionName('audit_logs'),
      status: isUserAdmin(user) ? 'GRANTED_FULL' : 'RESTRICTED',
      scopeDescription: isUserAdmin(user) ? 'Akses Administrator Penuh' : 'Dibatasi (Hanya untuk Role Administrator)',
      assignedFilter: isUserAdmin(user) ? 'Tanpa Filter' : 'Akses ditolak oleh Security Rules'
    },
    {
      collection: 'users',
      tenantCollectionPath: getTenantCollectionName('users'),
      status: isUserAdmin(user) ? 'GRANTED_FULL' : 'RESTRICTED',
      scopeDescription: isUserAdmin(user) ? 'Akses Manajemen Pengguna' : 'Dibatasi (Hanya untuk Role Administrator)',
      assignedFilter: isUserAdmin(user) ? 'Tanpa Filter' : 'Akses ditolak oleh Security Rules'
    }
  ];

  const handleTestClassPermission = () => {
    if (!testClassName.trim()) {
      setTestResult(null);
      return;
    }
    const target = testClassName.trim().toLowerCase();
    if (isUnrestricted) {
      setTestResult({
        isAllowed: true,
        reason: `Pengguna memiliki role '${user.role}' dengan hak akses penuh (*). Seluruh kelas termasuk '${testClassName}' dapat diakses.`
      });
      return;
    }

    const matches = assignedClasses.some(c => c.trim().toLowerCase() === target);
    if (matches) {
      setTestResult({
        isAllowed: true,
        reason: `Kelas '${testClassName}' Cocok dengan atribut assignedKelas pengguna ([${assignedClasses.join(', ')}]). Akses Firestore DIINIZINKAN.`
      });
    } else {
      setTestResult({
        isAllowed: false,
        reason: `Kelas '${testClassName}' TIDAK ADA di atribut assignedKelas pengguna ([${assignedClasses.join(', ')}]). Data kelas ini ditapis oleh RBAC & Rules.`
      });
    }
  };

  const handleRunSecurityRulesDiagnostic = async () => {
    setIsTestingRules(true);
    setRuleTestLogs([]);
    try {
      toast.loading('Menjalankan pengujian Security Rules Firestore...', { id: 'diag-rule' });
      const logs: string[] = [];
      const testClass = user.assignedKelas || '7-A';
      logs.push(`🔍 Menguji Security Rules Firestore untuk User: ${user.username} (${user.role})`);
      logs.push(`📌 Class Scope Assigned: [${assignedClasses.join(', ')}]`);

      const res = await verifyWaliKelasSecurityRules(testClass);
      if (res.sampleStudentTestRead.passed) {
        logs.push(`✅ [IZIN Firestore DISERTAKAN] ${res.sampleStudentTestRead.details}`);
      } else {
        logs.push(`⚠️ [PERINGATAN Firestore] ${res.sampleStudentTestRead.error || res.summary}`);
      }
      logs.push(`📋 ${res.summary}`);
      setRuleTestLogs(logs);
      toast.success('Pengujian diagnostik Security Rules selesai!', { id: 'diag-rule' });
    } catch (err: any) {
      toast.error('Gagal menjalankan pengujian Security Rules: ' + (err?.message || 'Error'), { id: 'diag-rule' });
    } finally {
      setIsTestingRules(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Context Inspector Security & Rules
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                  {getDisplayRoleLabel(user)}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Observabilitas konteks keamanan runtime Firestore & verifikasi pembatasan Rombel
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          
          {/* User Context Card */}
          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <User size={14} /> Security Context Aktif
              </span>
              <button 
                onClick={() => {
                  console.log('[Security Context Inspector]', user);
                  toast.success('Konteks keamanan telah dicatat ke Console browser!');
                }}
                className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 underline cursor-pointer"
              >
                <Terminal size={12} /> Log Ke Browser Console
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-medium">User ID / Username</span>
                <span className="font-mono font-bold text-slate-100">{user.id || user.username}</span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-medium">Peran / Role</span>
                <span className="font-bold text-indigo-300">{user.role} ({getDisplayRoleLabel(user)})</span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-medium">Assigned Kelas (Atribut)</span>
                <span className="font-mono font-bold text-emerald-400">
                  {user.assignedKelas || (isUnrestricted ? '* (Semua Kelas)' : 'Belum Ditugaskan')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-medium">Assigned Mapel</span>
                <span className="font-bold text-slate-200">{user.assignedMapel || '-'}</span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 sm:col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase font-medium">Daftar Rombel Terotorisasi</span>
                <span className="font-mono text-slate-300 font-semibold truncate block">
                  [{assignedClasses.join(', ')}]
                </span>
              </div>
            </div>
          </div>

          {/* Active Collection Permissions Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-400" /> Path & Izin Baca Firestore Koleksi Aktif
            </h3>
            
            <div className="border border-slate-700/80 rounded-xl overflow-hidden bg-slate-900/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-700/80">
                    <tr>
                      <th className="px-3.5 py-2.5">Koleksi</th>
                      <th className="px-3.5 py-2.5">Path Firestore Tenant</th>
                      <th className="px-3.5 py-2.5">Status Izin</th>
                      <th className="px-3.5 py-2.5">Cakupan / Filter RBAC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {collectionPermissions.map((perm) => (
                      <tr key={perm.collection} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-200 font-mono">
                          /{perm.collection}
                        </td>
                        <td className="px-3.5 py-2.5 text-[11px] font-mono text-slate-400 truncate max-w-[180px]">
                          {perm.tenantCollectionPath}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {perm.status === 'GRANTED_FULL' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 size={12} /> Full Read
                            </span>
                          ) : perm.status === 'GRANTED_FILTERED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Eye size={12} /> Filtered Scope
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <XCircle size={12} /> Restricted
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-300 text-[11px]">
                          <div>{perm.scopeDescription}</div>
                          <code className="text-[10px] text-indigo-300 font-mono block mt-0.5">{perm.assignedFilter}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Interactive Class Permission Tester */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/70 space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Search size={14} className="text-indigo-400" /> Tester Izin Akses Rombel / Kelas
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Masukkan ID Kelas (Contoh: 7-A, 8-B, Alumni)..."
                value={testClassName}
                onChange={(e) => setTestClassName(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleTestClassPermission}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Uji Otorisasi
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                testResult.isAllowed 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}>
                {testResult.isAllowed ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />}
                <div>
                  <div className="font-bold">{testResult.isAllowed ? 'IZIN DIBERIKAN' : 'AKSES DITOLAK / DITAPIS'}</div>
                  <div className="mt-0.5 text-[11px] opacity-90">{testResult.reason}</div>
                </div>
              </div>
            )}
          </div>

          {/* Rules Diagnostic & Debug Hints */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/70 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle size={14} className="text-amber-400" /> Panduan Debug & Uji Rules Real-Time
              </h4>
              <button
                type="button"
                onClick={handleRunSecurityRulesDiagnostic}
                disabled={isTestingRules}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-indigo-300 border border-indigo-500/30 rounded-md font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={isTestingRules ? 'animate-spin' : ''} />
                Uji Firestore Rules Live
              </button>
            </div>

            <div className="text-xs text-slate-400 space-y-1.5">
              <p>• Jika data siswa tidak tampil pada akun Wali Kelas, pastikan atribut <code className="text-indigo-300">assignedKelas</code> di data pengguna persis sama dengan nama kelas siswa (contoh: <code className="text-emerald-300">"7-A"</code> vs <code className="text-rose-300">"7A"</code>).</p>
              <p>• Periksa daftar kelas yang diizinkan pada baris <code className="text-indigo-300">Assigned Kelas</code> di atas.</p>
            </div>

            {ruleTestLogs.length > 0 && (
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-300 space-y-1">
                {ruleTestLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-800/90 border-t border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 font-mono">
            Security Context Version: 1.4.0 • Active Tenant
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Tutup Inspector
          </button>
        </div>

      </div>
    </div>
  );
}
