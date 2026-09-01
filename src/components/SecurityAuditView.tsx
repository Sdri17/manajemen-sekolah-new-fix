import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, UserCheck, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Search, Trash2, Edit2, Database, Key, Check } from 'lucide-react';
import { store, AppUser, Student, Settings } from '../lib/store';
import { db } from '../lib/firebase';
import { getTenantCollectionName } from '../lib/firebaseSync';
import { collection, query, where, getDocs, getDocsFromServer } from 'firebase/firestore';
import toast from 'react-hot-toast';

export interface AuditUserRecord {
  user: AppUser;
  assignedClasses: string[];
  classExistence: {
    className: string;
    existsInMaster: boolean;
    studentCountInStore: number;
    studentCountInFirestore: number;
    status: 'VALID' | 'ORPHANED_NO_STUDENTS' | 'INVALID_CLASS_NAME';
  }[];
  overallStatus: 'VALID' | 'ORPHANED' | 'UNASSIGNED';
  issues: string[];
}

export default function SecurityAuditView() {
  const [auditRecords, setAuditRecords] = useState<AuditUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORPHANED' | 'UNASSIGNED' | 'VALID'>('ALL');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [newAssignedKelas, setNewAssignedKelas] = useState<string>('');

  useEffect(() => {
    runSecurityAudit();
  }, []);

  const runSecurityAudit = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch all users
      const allUsers: AppUser[] = [];
      await store.users.iterate<AppUser, void>((u) => {
        if (u && u.username) allUsers.push(u);
      });

      // Filter for non-admin users
      const nonAdminUsers = allUsers.filter(u => u.role !== 'admin');

      // 2. Fetch all student records from local store to build master class map
      const studentsInStore: Student[] = [];
      await store.students.iterate<Student, void>((s) => {
        if (s && s.kelas && s.kelas.toLowerCase() !== 'alumni') {
          studentsInStore.push(s);
        }
      });

      // Master classes list
      const masterClasses = Array.from(new Set(studentsInStore.map(s => s.kelas.trim()))).filter(Boolean);

      // Map count per class locally
      const localCountMap: Record<string, number> = {};
      studentsInStore.forEach(s => {
        const key = s.kelas.trim().toLowerCase();
        localCountMap[key] = (localCountMap[key] || 0) + 1;
      });

      // 3. For each non-admin user, cross-reference assigned classes against Firestore & Store
      const auditResults: AuditUserRecord[] = [];

      for (const user of nonAdminUsers) {
        const rawAssigned = user.assignedKelas ? user.assignedKelas.split(',').map(c => c.trim()).filter(Boolean) : [];
        if (rawAssigned.length === 0 && user.assignedClasses) {
          rawAssigned.push(...user.assignedClasses);
        }

        const classExistence: AuditUserRecord['classExistence'] = [];
        const issues: string[] = [];

        if (rawAssigned.length === 0 || rawAssigned.includes('*')) {
          if (user.role === 'wali_kelas' && rawAssigned.length === 0) {
            issues.push('Wali Kelas belum memiliki kelas binaan (assignedKelas kosong)');
          }
        }

        for (const className of rawAssigned) {
          if (className === '*') continue;
          const normalized = className.trim().toLowerCase();
          const existsInMaster = masterClasses.some(m => m.trim().toLowerCase() === normalized);
          const studentCountInStore = localCountMap[normalized] || 0;
          let studentCountInFirestore = studentCountInStore;

          // Try querying Firestore directly for actual document existence
          try {
            const tenantColName = getTenantCollectionName('students');
            const colRef = collection(db, tenantColName);
            const q = query(colRef, where('kelas', '==', className));
            const snap = await getDocsFromServer(q).catch(() => getDocs(q));
            if (snap && typeof snap.size === 'number') {
              studentCountInFirestore = snap.size;
            }
          } catch (err) {
            // Firestore offline or permission check, fall back to store count
          }

          let status: AuditUserRecord['classExistence'][0]['status'] = 'VALID';
          if (!existsInMaster && studentCountInFirestore === 0) {
            status = 'INVALID_CLASS_NAME';
            issues.push(`Kelas '${className}' tidak ditemukan di database & tidak memiliki dokumen siswa di Firestore`);
          } else if (studentCountInFirestore === 0) {
            status = 'ORPHANED_NO_STUDENTS';
            issues.push(`Kelas '${className}' tidak memiliki dokumen siswa aktif di Firestore (Orphaned Permission)`);
          }

          classExistence.push({
            className,
            existsInMaster,
            studentCountInStore,
            studentCountInFirestore,
            status
          });
        }

        let overallStatus: AuditUserRecord['overallStatus'] = 'VALID';
        if (issues.length > 0) {
          if (rawAssigned.length === 0) {
            overallStatus = 'UNASSIGNED';
          } else {
            overallStatus = 'ORPHANED';
          }
        }

        auditResults.push({
          user,
          assignedClasses: rawAssigned,
          classExistence,
          overallStatus,
          issues
        });
      }

      setAuditRecords(auditResults);
      toast.success('Audit Keamanan Izin Rombel Selesai!');
    } catch (err: any) {
      toast.error('Gagal menjalankan Audit Keamanan: ' + (err?.message || 'Error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFixOrphanedUser = async (userRecord: AuditUserRecord) => {
    try {
      const updatedUser: AppUser = {
        ...userRecord.user,
        assignedKelas: '',
        assignedClasses: []
      };
      await store.users.setItem(updatedUser.username, updatedUser);
      await store.syncQueue.setItem(`users::${updatedUser.username}`, 'updated');
      toast.success(`Berhasil membersihkan izin orphaned untuk user ${userRecord.user.username}`);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      runSecurityAudit();
    } catch (err) {
      toast.error('Gagal memperbarui data pengguna');
    }
  };

  const handleSaveClassUpdate = async () => {
    if (!editingUser) return;
    try {
      const updatedUser: AppUser = {
        ...editingUser,
        assignedKelas: newAssignedKelas.trim()
      };
      await store.users.setItem(updatedUser.username, updatedUser);
      await store.syncQueue.setItem(`users::${updatedUser.username}`, 'updated');
      toast.success(`Kelas assigned for ${editingUser.username} berhasil diperbarui ke '${newAssignedKelas.trim()}'`);
      setEditingUser(null);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      runSecurityAudit();
    } catch (err) {
      toast.error('Gagal mengupdate penugasan kelas');
    }
  };

  // Stats calculation
  const totalAudited = auditRecords.length;
  const validCount = auditRecords.filter(r => r.overallStatus === 'VALID').length;
  const orphanedCount = auditRecords.filter(r => r.overallStatus === 'ORPHANED').length;
  const unassignedCount = auditRecords.filter(r => r.overallStatus === 'UNASSIGNED').length;

  const filteredRecords = auditRecords.filter(r => {
    const matchSearch = r.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (r.user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (r.user.assignedKelas || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || r.overallStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* View Header */}
      <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-700/80 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert size={22} className="text-amber-400" />
            Audit Keamanan & Otentisitas Izin Rombel Firestore
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Silang-referensi atribut Metadata assignedClasses seluruh akun Non-Admin terhadap eksistensi fisik dokumen di Firestore.
          </p>
        </div>

        <button
          type="button"
          onClick={runSecurityAudit}
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Jalankan Ulang Audit
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Audited Non-Admin</span>
            <span className="text-2xl font-black text-slate-100 mt-1 block">{totalAudited}</span>
          </div>
          <div className="p-3 bg-slate-700/50 rounded-xl text-indigo-400">
            <Database size={24} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/80 rounded-2xl border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">Valid Class Assignments</span>
            <span className="text-2xl font-black text-emerald-300 mt-1 block">{validCount}</span>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/80 rounded-2xl border border-amber-500/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">Orphaned / Invalid Permissions</span>
            <span className="text-2xl font-black text-amber-300 mt-1 block">{orphanedCount}</span>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/30">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Belum Ditugaskan (Empty)</span>
            <span className="text-2xl font-black text-slate-300 mt-1 block">{unassignedCount}</span>
          </div>
          <div className="p-3 bg-slate-700/50 rounded-xl text-slate-400">
            <UserCheck size={24} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Pengguna atau Kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs font-medium">
          <span className="text-slate-400 mr-1">Filter Status:</span>
          {(['ALL', 'ORPHANED', 'UNASSIGNED', 'VALID'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                statusFilter === f 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {f === 'ALL' ? 'Semua' : f === 'ORPHANED' ? 'Orphaned / Bermasalah' : f === 'UNASSIGNED' ? 'Belum Ada Kelas' : 'Valid'}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Results Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-700/80">
              <tr>
                <th className="px-4 py-3">Pengguna & Peran</th>
                <th className="px-4 py-3">Metadata assignedKelas</th>
                <th className="px-4 py-3">Pemeriksaan Dokumen Firestore</th>
                <th className="px-4 py-3">Status Audit</th>
                <th className="px-4 py-3">Temuan / Catatan</th>
                <th className="px-4 py-3 text-right">Aksi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto text-indigo-400 mb-2" />
                    Sedang memeriksa silang seluruh dokumen Firestore...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Tidak ada catatan audit yang sesuai dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.user.username} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{record.user.name || record.user.username}</div>
                      <div className="text-[10px] text-slate-400 font-mono">@{record.user.username} • <span className="text-indigo-400 font-semibold">{record.user.role}</span></div>
                    </td>

                    <td className="px-4 py-3">
                      {record.assignedClasses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {record.assignedClasses.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-slate-200">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">(Tidak ada)</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {record.classExistence.length > 0 ? (
                        <div className="space-y-1">
                          {record.classExistence.map(ce => (
                            <div key={ce.className} className="flex items-center gap-1.5 text-[11px]">
                              <span className="font-mono text-slate-200 font-bold">{ce.className}:</span>
                              {ce.status === 'VALID' ? (
                                <span className="text-emerald-400 font-medium">
                                  {ce.studentCountInFirestore} Dokumen Siswa
                                </span>
                              ) : (
                                <span className="text-rose-400 font-bold">
                                  0 Dokumen (Orphaned Path)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {record.overallStatus === 'VALID' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 size={12} /> Valid Permission
                        </span>
                      ) : record.overallStatus === 'ORPHANED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                          <AlertTriangle size={12} /> Orphaned Class
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[11px]">
                      {record.issues.length > 0 ? (
                        <div className="text-amber-300 space-y-0.5">
                          {record.issues.map((iss, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <span>•</span>
                              <span>{iss}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-emerald-400/80">Semua path kelas terverifikasi di Firestore</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(record.user);
                            setNewAssignedKelas(record.user.assignedKelas || '');
                          }}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg border border-indigo-500/30 transition-colors cursor-pointer"
                          title="Edit Atribut assignedKelas"
                        >
                          <Edit2 size={14} />
                        </button>

                        {record.overallStatus === 'ORPHANED' && (
                          <button
                            type="button"
                            onClick={() => handleFixOrphanedUser(record)}
                            className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg border border-amber-500/40 text-[10px] font-bold transition-all cursor-pointer"
                          >
                            Bersihkan Izin Orphaned
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Assigned Class Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 size={18} className="text-indigo-400" />
              Perbaiki Kelas Penugasan untuk @{editingUser.username}
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Atribut assignedKelas
              </label>
              <input
                type="text"
                value={newAssignedKelas}
                onChange={(e) => setNewAssignedKelas(e.target.value)}
                placeholder="Contoh: 7-A, 8-B"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Gunakan koma jika Wali Kelas ditugaskan ke lebih dari 1 kelas.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveClassUpdate}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30"
              >
                Simpan Penugasan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
