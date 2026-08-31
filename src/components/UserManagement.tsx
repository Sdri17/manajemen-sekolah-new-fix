import React, { useState, useEffect, useRef } from 'react';
import { store, AppUser, Settings, MenuPermissionLevel } from '../lib/store';
import { syncAndGetClasses } from '../lib/classHelper';
import { 
  ROLE_CONFIGS, 
  UserRole, 
  isUserAdmin, 
  canManageUsers,
  getCurrentUser,
  APP_MENUS,
  AppMenuDefinition
} from '../lib/rbac';
import { 
  Users, 
  UserPlus, 
  Edit, 
  Trash2, 
  Shield, 
  Key, 
  CheckCircle, 
  Search, 
  RefreshCw, 
  X,
  BookOpen,
  Layers,
  AlertTriangle,
  Check,
  Lock,
  Eye,
  Settings as SettingsIcon,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Sliders,
  CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import BackgroundDataBanner from './BackgroundDataBanner';
import { runUsersDiagnosticAndSync } from '../lib/userDiagnostic';
import { fetchLatestUsersFromFirebase } from '../lib/firebaseSync';

interface UserManagementProps {
  role?: string;
  onUserUpdated?: () => void;
}

const PRESET_SUBJECTS = ['Semua', 'Matematika', 'IPA', 'IPS', 'Bahasa Indonesia', 'Bahasa Inggris', 'PAI', 'PJOK', 'Pancasila', 'Seni Budaya', 'Informatika'];

export default function UserManagement({ role, onUserUpdated }: UserManagementProps) {
  const { setUserState, logout: authLogout } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [availableClasses, setAvailableClasses] = useState<string[]>(['Semua']);

  // Add User Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('wali_kelas');
  const [newAssignedKelas, setNewAssignedKelas] = useState('Semua');
  const [newAssignedMapel, setNewAssignedMapel] = useState('Semua');
  const [newCanManageUsers, setNewCanManageUsers] = useState(false);
  const [newCanEditSettings, setNewCanEditSettings] = useState(false);
  const [newCanExportData, setNewCanExportData] = useState(true);
  const [newIsReadonly, setNewIsReadonly] = useState(false);
  const [newMenuPermissions, setNewMenuPermissions] = useState<Record<string, MenuPermissionLevel>>({});

  // Edit User Form States
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('wali_kelas');
  const [editAssignedKelas, setEditAssignedKelas] = useState('Semua');
  const [editAssignedMapel, setEditAssignedMapel] = useState('Semua');
  const [editCanManageUsers, setEditCanManageUsers] = useState(false);
  const [editCanEditSettings, setEditCanEditSettings] = useState(false);
  const [editCanExportData, setEditCanExportData] = useState(true);
  const [editIsReadonly, setEditIsReadonly] = useState(false);
  const [editMenuPermissions, setEditMenuPermissions] = useState<Record<string, MenuPermissionLevel>>({});

  // Active Tab in User Modal (General vs RBAC Menu Matrix)
  const [modalTab, setModalTab] = useState<'info' | 'rbac'>('info');

  // Delete Confirmation State
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const currentUser = getCurrentUser();
  const isAuthorizedAdmin = isUserAdmin(currentUser) || currentUser?.username === 'admin' || canManageUsers(currentUser);

  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);

  const handleRunDiagnostic = async () => {
    setIsDiagnosticRunning(true);
    const toastId = toast.loading('Menjalankan diagnostik & verifikasi akun pengguna (RBAC)...');
    try {
      const res = await runUsersDiagnosticAndSync();
      if (res.success) {
        toast.success(
          `Diagnostik Selesai! Checked: ${res.totalUsersChecked} | Cloud Synced: ${res.cloudUsersSynced} | Repaired: ${res.repairedCount}`,
          { id: toastId, duration: 4000 }
        );
      } else {
        toast.error('Diagnostik selesai dengan catatan/peringatan.', { id: toastId });
      }
      await loadClassesAndUsers();
    } catch (err: any) {
      toast.error('Gagal menjalankan diagnostik: ' + (err?.message || String(err)), { id: toastId });
    } finally {
      setIsDiagnosticRunning(false);
    }
  };

  const isLoadingRef = useRef(false);

  const loadClassesAndUsers = async (fetchRemote: boolean = true) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    try {
      // 0. Sync latest user accounts from Cloud Firestore if requested
      if (fetchRemote) {
        await fetchLatestUsersFromFirebase(true).catch(() => {});
      }

      // 1. Load Classes from Settings merged with Student Data
      const syncedClasses = await syncAndGetClasses();
      setAvailableClasses(['Semua', ...syncedClasses]);

      // 2. Load Users
      const userList: AppUser[] = [];
      const seenIds = new Set<string>();
      await store.users.iterate((u: AppUser) => {
        if (!u) return;
        const keyId = u.id || u.username;
        if (keyId && !seenIds.has(keyId.toLowerCase())) {
          seenIds.add(keyId.toLowerCase());
          userList.push(u);
        }
      });
      setUsers(userList);
    } catch (err) {
      console.error('Failed to load users/classes:', err);
      toast.error('Gagal memuat data pengguna');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    loadClassesAndUsers(true);

    const handleDataChange = () => {
      loadClassesAndUsers(false);
    };
    window.addEventListener('data-changed', handleDataChange);
    window.addEventListener('users-updated', handleDataChange);
    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      window.removeEventListener('users-updated', handleDataChange);
    };
  }, []);

  const initDefaultMenuPermissions = (r: UserRole): Record<string, MenuPermissionLevel> => {
    const defaultPerms: Record<string, MenuPermissionLevel> = {};
    APP_MENUS.forEach(m => {
      if (r === 'admin') {
        defaultPerms[m.id] = 'crud';
      } else if (r === 'kepsek') {
        defaultPerms[m.id] = ['pengaturan', 'users', 'diagnostik'].includes(m.id) ? 'none' : 'read';
      } else if (r === 'wali_kelas' || r === 'guru_mapel' || r === 'guru') {
        if (['pengaturan', 'users', 'diagnostik', 'identitas'].includes(m.id)) {
          defaultPerms[m.id] = 'none';
        } else {
          defaultPerms[m.id] = 'crud';
        }
      } else if (r === 'staf') {
        if (['pengaturan', 'users', 'diagnostik'].includes(m.id)) {
          defaultPerms[m.id] = 'none';
        } else {
          defaultPerms[m.id] = 'crud';
        }
      } else {
        defaultPerms[m.id] = 'crud';
      }
    });
    return defaultPerms;
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = newUsername.trim().toLowerCase().replace(/\s+/g, '');
    const cleanName = newName.trim();

    if (!cleanUsername || !cleanName || !newPassword) {
      toast.error('Semua bidang (Username, Nama, Password) wajib diisi');
      return;
    }

    if (cleanUsername.length < 3) {
      toast.error('Username minimal 3 karakter');
      return;
    }

    const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      toast.error('Username sudah digunakan');
      return;
    }

    const newUser: AppUser = {
      id: uuidv4(),
      username: cleanUsername,
      password: newPassword,
      name: cleanName,
      role: newRole,
      assignedKelas: newAssignedKelas,
      assignedMapel: newAssignedMapel,
      canManageUsers: newRole === 'admin' ? true : newCanManageUsers,
      canEditSettings: newRole === 'admin' ? true : newCanEditSettings,
      canExportData: newCanExportData,
      isReadonly: newIsReadonly,
      menuPermissions: Object.keys(newMenuPermissions).length > 0 ? newMenuPermissions : initDefaultMenuPermissions(newRole),
      updatedAt: new Date().toISOString()
    };

    try {
      await store.users.setItem(newUser.id, newUser);
      await store.users.setItem(cleanUsername, newUser);
      await store.syncQueue.setItem(`users::${newUser.id}`, 'updated');

      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));

      await fetchLatestUsersFromFirebase(true).catch(() => {});

      toast.success(`Akun @${cleanUsername} (${ROLE_CONFIGS[newRole]?.label || newRole}) berhasil dibuat`);
      setShowAddModal(false);
      resetAddForm();
      loadClassesAndUsers();
      if (onUserUpdated) onUserUpdated();
    } catch (err) {
      toast.error('Gagal menambahkan pengguna');
    }
  };

  const resetAddForm = () => {
    setNewUsername('');
    setNewName('');
    setNewPassword('');
    setNewRole('wali_kelas');
    setNewAssignedKelas(availableClasses[1] || 'Semua');
    setNewAssignedMapel('Semua');
    setNewCanManageUsers(false);
    setNewCanEditSettings(false);
    setNewCanExportData(true);
    setNewIsReadonly(false);
    setNewMenuPermissions(initDefaultMenuPermissions('wali_kelas'));
    setModalTab('info');
  };

  const handleStartEdit = (u: AppUser) => {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditName(u.name);
    setEditPassword('');
    setEditRole(u.role || 'wali_kelas');
    setEditAssignedKelas(u.assignedKelas || 'Semua');
    setEditAssignedMapel(u.assignedMapel || 'Semua');
    setEditCanManageUsers(u.canManageUsers ?? (u.role === 'admin'));
    setEditCanEditSettings(u.canEditSettings ?? (u.role === 'admin'));
    setEditCanExportData(u.canExportData ?? true);
    setEditIsReadonly(u.isReadonly ?? false);
    setEditMenuPermissions(u.menuPermissions || initDefaultMenuPermissions(u.role || 'wali_kelas'));
    setModalTab('info');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const cleanUsername = editUsername.trim().toLowerCase().replace(/\s+/g, '');
    const cleanName = editName.trim();

    if (!cleanUsername || !cleanName) {
      toast.error('Username dan Nama Lengkap tidak boleh kosong');
      return;
    }

    if (cleanUsername !== editingUser.username.toLowerCase()) {
      const usernameTaken = users.some(u => u.id !== editingUser.id && u.username.toLowerCase() === cleanUsername);
      if (usernameTaken) {
        toast.error('Username sudah digunakan oleh pengguna lain');
        return;
      }
    }

    const updatedUser: AppUser = {
      ...editingUser,
      username: cleanUsername,
      name: cleanName,
      role: editRole,
      assignedKelas: editRole === 'admin' ? 'Semua' : editAssignedKelas,
      assignedMapel: editRole === 'admin' ? 'Semua' : editAssignedMapel,
      canManageUsers: editRole === 'admin' ? true : editCanManageUsers,
      canEditSettings: editRole === 'admin' ? true : editCanEditSettings,
      canExportData: editCanExportData,
      isReadonly: editIsReadonly,
      menuPermissions: editRole === 'admin' ? initDefaultMenuPermissions('admin') : editMenuPermissions,
      updatedAt: new Date().toISOString()
    };

    if (editPassword) {
      updatedUser.password = editPassword;
    }

    try {
      await store.users.setItem(editingUser.id, updatedUser);
      await store.users.setItem(cleanUsername, updatedUser);
      await store.syncQueue.setItem(`users::${editingUser.id}`, 'updated');

      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));

      if (currentUser && currentUser.id === editingUser.id) {
        localStorage.setItem('app_user', JSON.stringify(updatedUser));
      }

      toast.success(`Profil & Matriks Hak Akses @${cleanUsername} berhasil diperbarui`);
      setEditingUser(null);
      loadClassesAndUsers();
      if (onUserUpdated) onUserUpdated();
    } catch (err) {
      toast.error('Gagal memperbarui pengguna');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;

    const isSelf = currentUser && (currentUser.id === userToDelete.id || currentUser.username === userToDelete.username);

    try {
      await store.users.removeItem(userToDelete.id);
      if (userToDelete.username) {
        await store.users.removeItem(userToDelete.username.toLowerCase()).catch(() => {});
      }
      await store.syncQueue.setItem(`users::${userToDelete.id}`, 'deleted');

      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));

      toast.success(`Pengguna @${userToDelete.username} berhasil dihapus`);
      setUserToDelete(null);

      if (isSelf) {
        toast.loading('Akun Anda sendiri telah dihapus. Mengalihkan ke halaman login...');
        setTimeout(() => {
          authLogout();
        }, 1200);
        return;
      }

      loadClassesAndUsers();
      if (onUserUpdated) onUserUpdated();
    } catch (err) {
      toast.error('Gagal menghapus pengguna');
    }
  };

  // Switch login simulation (Impersonation)
  const handleSimulateUserSession = (u: AppUser) => {
    setUserState(u);
    toast.success(`Simulasi Login sebagai @${u.username} (${u.name}). State diperbarui!`, { duration: 3000 });
    if (onUserUpdated) onUserUpdated();
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.assignedKelas && u.assignedKelas.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.assignedMapel && u.assignedMapel.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const categories = ['Utama', 'Pengelolaan', 'Laporan', 'Sistem', 'Informasi'] as const;

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      <BackgroundDataBanner collectionName="users" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-inner">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>Manajemen Pengguna & Matriks RBAC</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {users.length} Akun Terdaftar
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Atur hak akses pengguna, penugasan Rombel/Kelas (dari data input Admin), serta batasi menu tertentu (Read-Only vs CRUD).
            </p>
          </div>
        </div>

        {isAuthorizedAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRunDiagnostic}
              disabled={isDiagnosticRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
              title="Periksa dan pulihkan akun admin, sinkronisasi Firestore Cloud, serta verifikasi izin RBAC"
            >
              <RefreshCw size={15} className={isDiagnosticRunning ? 'animate-spin' : ''} />
              <span>Diagnostik RBAC</span>
            </button>
            <button
              onClick={() => {
                resetAddForm();
                setShowAddModal(true);
              }}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer shrink-0"
            >
              <UserPlus size={16} />
              <span>Tambah Pengguna Baru</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari berdasarkan nama, username, kelas, atau mapel..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-900/80 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Peran (Role)</option>
            <option value="admin">Administrator</option>
            <option value="wali_kelas">Wali Kelas</option>
            <option value="guru_mapel">Guru Mapel</option>
            <option value="kepsek">Kepala Sekolah</option>
            <option value="staf">Staf TU</option>
          </select>

          <button
            onClick={() => loadClassesAndUsers(true)}
            className="p-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors cursor-pointer"
            title="Segarkan Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/50">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="px-4 py-3">Pengguna</th>
              <th className="px-4 py-3">Peran (Role)</th>
              <th className="px-4 py-3">Rombel / Kelas Binaan</th>
              <th className="px-4 py-3">Mata Pelajaran</th>
              <th className="px-4 py-3">Status Izin & Menu</th>
              <th className="px-4 py-3 text-center">Aksi (Admin)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-400" />
                  <span>Memuat daftar pengguna...</span>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  <Users size={28} className="mx-auto mb-2 opacity-40 text-slate-500" />
                  <span>Tidak ada pengguna yang sesuai dengan pencarian</span>
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const roleConf = ROLE_CONFIGS[u.role] || ROLE_CONFIGS.wali_kelas;
                const isCurrentUser = currentUser?.id === u.id;

                return (
                  <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center border border-indigo-500/30 uppercase text-xs shrink-0">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                            <span>{u.name}</span>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">Anda</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">@{u.username}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${roleConf.badgeBg} ${roleConf.badgeText} ${roleConf.badgeBorder}`}>
                        {roleConf.label}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[11px] border border-slate-700">
                        {u.assignedKelas === 'Semua' ? 'Semua Kelas' : `Kelas ${u.assignedKelas}`}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-300">{u.assignedMapel || 'Semua Mapel'}</span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {u.isReadonly ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Read-Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Akses CRUD
                          </span>
                        )}

                        {u.menuPermissions && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {Object.values(u.menuPermissions).filter(p => p !== 'none').length} Menu Aktif
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleStartEdit(u)}
                          className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Edit Akun & Matriks RBAC"
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          onClick={() => handleSimulateUserSession(u)}
                          className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Simulasi Login sebagai User Ini"
                        >
                          <Eye size={14} />
                        </button>

                        <button
                          onClick={() => setUserToDelete(u)}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Hapus Akun"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Buat Akun Pengguna Baru</h3>
                  <p className="text-xs text-slate-400">Pilih Rombel Kelas dan konfigurasi izin menu pengguna.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 text-xs font-semibold gap-4">
              <button
                onClick={() => setModalTab('info')}
                className={`pb-2 transition-all cursor-pointer ${
                  modalTab === 'info'
                    ? 'border-b-2 border-indigo-500 text-indigo-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1. Data Akun & Penugasan
              </button>
              <button
                onClick={() => setModalTab('rbac')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalTab === 'rbac'
                    ? 'border-b-2 border-indigo-500 text-indigo-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders size={14} />
                <span>2. Matriks Izin Menu (RBAC)</span>
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              {modalTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Nama Lengkap Guru / Staf</label>
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Contoh: Drs. Ahmad Dahlan, M.Pd"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Username Login</label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Contoh: ahmad_dahlan"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Password Pertama Login</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan password awal..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Role Selection */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Peran Utama (Role)</label>
                    <select
                      value={newRole}
                      onChange={(e) => {
                        const r = e.target.value as UserRole;
                        setNewRole(r);
                        setNewMenuPermissions(initDefaultMenuPermissions(r));
                        if (r === 'admin') {
                          setNewAssignedKelas('Semua');
                          setNewAssignedMapel('Semua');
                          setNewCanManageUsers(true);
                          setNewCanEditSettings(true);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="wali_kelas">Wali Kelas (Mengelola Rombel Binaan)</option>
                      <option value="guru_mapel">Guru Mapel (Mengelola Penilaian & Jurnal)</option>
                      <option value="admin">Administrator Utama (Akses Penuh)</option>
                      <option value="kepsek">Kepala Sekolah (Supervisi & Monitoring)</option>
                      <option value="staf">Staf TU / Pengawas</option>
                    </select>
                  </div>

                  {/* Assigned Class (Dynamic from Admin settings) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Penugasan Rombel / Kelas</label>
                      <select
                        value={newAssignedKelas}
                        onChange={(e) => setNewAssignedKelas(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {availableClasses.map(cls => (
                          <option key={cls} value={cls}>
                            {cls === 'Semua' ? 'Semua Kelas (Akses Global)' : `Kelas ${cls}`}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Daftar kelas diambil dari data input Admin</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Penugasan Mata Pelajaran</label>
                      <select
                        value={newAssignedMapel}
                        onChange={(e) => setNewAssignedMapel(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {PRESET_SUBJECTS.map(subj => (
                          <option key={subj} value={subj}>{subj === 'Semua' ? 'Semua Mapel' : subj}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Mode Readonly toggle */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-200 block">Mode Read-Only Global</span>
                      <span className="text-[10px] text-slate-400">Jika diaktifkan, user hanya dapat melihat tanpa bisa melakukan CRUD di semua halaman.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={newIsReadonly}
                      onChange={(e) => setNewIsReadonly(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {modalTab === 'rbac' && (
                <div className="space-y-4">
                  {/* Quick Preset Bar */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-300">Set Preset Cepat:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setNewMenuPermissions(initDefaultMenuPermissions('admin'))}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Semua CRUD (Penuh)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewMenuPermissions(initDefaultMenuPermissions('kepsek'))}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Semua Read-Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewMenuPermissions(initDefaultMenuPermissions('wali_kelas'))}
                        className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Reset Sesuai Peran
                      </button>
                    </div>
                  </div>

                  {/* Menu Permission List */}
                  <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                    {categories.map(cat => {
                      const catMenus = APP_MENUS.filter(m => m.category === cat);
                      if (catMenus.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block px-1">{cat}</span>
                          <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                            {catMenus.map(m => {
                              const currentPerm = newMenuPermissions[m.id] || 'crud';

                              return (
                                <div key={m.id} className="p-2.5 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-slate-200">{m.label}</div>
                                    <div className="text-[10px] text-slate-400">{m.description}</div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0 bg-slate-900 p-1 rounded-lg border border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => setNewMenuPermissions({ ...newMenuPermissions, [m.id]: 'none' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'none'
                                          ? 'bg-rose-500 text-white shadow'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Sembunyi
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setNewMenuPermissions({ ...newMenuPermissions, [m.id]: 'read' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'read'
                                          ? 'bg-amber-500 text-slate-950 shadow font-extrabold'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Hanya Lihat
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setNewMenuPermissions({ ...newMenuPermissions, [m.id]: 'crud' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'crud'
                                          ? 'bg-emerald-500 text-slate-950 shadow font-extrabold'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      CRUD (Penuh)
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle size={14} />
                  Simpan Akun Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Akun & RBAC Menu @{editingUser.username}</h3>
                  <p className="text-xs text-slate-400">Atur Rombel/Kelas dan matriks izin menu pengguna ini.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 text-xs font-semibold gap-4">
              <button
                onClick={() => setModalTab('info')}
                className={`pb-2 transition-all cursor-pointer ${
                  modalTab === 'info'
                    ? 'border-b-2 border-amber-500 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1. Data Akun & Penugasan
              </button>
              <button
                onClick={() => setModalTab('rbac')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalTab === 'rbac'
                    ? 'border-b-2 border-amber-500 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders size={14} />
                <span>2. Matriks Izin Menu (RBAC)</span>
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
              {modalTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Username Login</label>
                      <input
                        type="text"
                        required
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Password Baru <span className="text-slate-500 font-normal">(Kosongkan jika tidak diubah)</span>
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Ketik password baru..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Role Selection */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Peran Utama (Role)</label>
                    <select
                      value={editRole}
                      onChange={(e) => {
                        const r = e.target.value as UserRole;
                        setEditRole(r);
                        setEditMenuPermissions(initDefaultMenuPermissions(r));
                        if (r === 'admin') {
                          setEditAssignedKelas('Semua');
                          setEditAssignedMapel('Semua');
                          setEditCanManageUsers(true);
                          setEditCanEditSettings(true);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="wali_kelas">Wali Kelas (Mengelola Rombel Binaan)</option>
                      <option value="guru_mapel">Guru Mapel (Mengelola Penilaian & Jurnal)</option>
                      <option value="admin">Administrator Utama (Akses Penuh)</option>
                      <option value="kepsek">Kepala Sekolah (Supervisi & Monitoring)</option>
                      <option value="staf">Staf TU / Pengawas</option>
                    </select>
                  </div>

                  {/* Assigned Class & Subject */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Penugasan Rombel / Kelas</label>
                      <select
                        value={editAssignedKelas}
                        onChange={(e) => setEditAssignedKelas(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        {availableClasses.map(cls => (
                          <option key={cls} value={cls}>
                            {cls === 'Semua' ? 'Semua Kelas (Akses Global)' : `Kelas ${cls}`}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Daftar kelas diambil dari data input Admin</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Penugasan Mata Pelajaran</label>
                      <select
                        value={editAssignedMapel}
                        onChange={(e) => setEditAssignedMapel(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        {PRESET_SUBJECTS.map(subj => (
                          <option key={subj} value={subj}>{subj === 'Semua' ? 'Semua Mapel' : subj}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Mode Readonly toggle */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-200 block">Mode Read-Only Global</span>
                      <span className="text-[10px] text-slate-400">Jika diaktifkan, user hanya dapat melihat tanpa bisa melakukan CRUD.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editIsReadonly}
                      onChange={(e) => setEditIsReadonly(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {modalTab === 'rbac' && (
                <div className="space-y-4">
                  {/* Quick Preset Bar */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-300">Set Preset Cepat:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditMenuPermissions(initDefaultMenuPermissions('admin'))}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Semua CRUD (Penuh)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMenuPermissions(initDefaultMenuPermissions('kepsek'))}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Semua Read-Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMenuPermissions(initDefaultMenuPermissions(editRole))}
                        className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Reset Sesuai Peran
                      </button>
                    </div>
                  </div>

                  {/* Menu Permission List */}
                  <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                    {categories.map(cat => {
                      const catMenus = APP_MENUS.filter(m => m.category === cat);
                      if (catMenus.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block px-1">{cat}</span>
                          <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                            {catMenus.map(m => {
                              const currentPerm = editMenuPermissions[m.id] || 'crud';

                              return (
                                <div key={m.id} className="p-2.5 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-slate-200">{m.label}</div>
                                    <div className="text-[10px] text-slate-400">{m.description}</div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0 bg-slate-900 p-1 rounded-lg border border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => setEditMenuPermissions({ ...editMenuPermissions, [m.id]: 'none' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'none'
                                          ? 'bg-rose-500 text-white shadow'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Sembunyi
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setEditMenuPermissions({ ...editMenuPermissions, [m.id]: 'read' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'read'
                                          ? 'bg-amber-500 text-slate-950 shadow font-extrabold'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Hanya Lihat
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setEditMenuPermissions({ ...editMenuPermissions, [m.id]: 'crud' })}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        currentPerm === 'crud'
                                          ? 'bg-emerald-500 text-slate-950 shadow font-extrabold'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      CRUD (Penuh)
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-lg cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle size={14} />
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 text-center my-auto max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <Trash2 size={24} />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Konfirmasi Hapus Akun Pengguna</h3>
              <p className="text-xs text-slate-400 mt-1">
                Apakah Anda yakin ingin menghapus akun pengguna berikut dari sistem?
              </p>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-left text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-200 font-bold text-sm">
                <span>{userToDelete.name}</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 font-semibold capitalize">
                  {userToDelete.role}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                <span>Username: <strong className="text-slate-200">@{userToDelete.username}</strong></span>
                {userToDelete.assignedKelas && (
                  <span>• Kelas: <strong className="text-slate-200">{userToDelete.assignedKelas}</strong></span>
                )}
                {userToDelete.assignedMapel && (
                  <span>• Mapel: <strong className="text-slate-200">{userToDelete.assignedMapel}</strong></span>
                )}
              </div>
            </div>

            <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-left text-xs text-rose-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-rose-400">
                <AlertTriangle size={14} /> Peringatan Penghapusan Akun
              </p>
              <p className="text-[11px] text-rose-300/90 leading-relaxed">
                Aksi ini akan mencabut akses login pengguna dari sistem secara permanen. Pengguna tidak akan dapat masuk kembali hingga akun baru dibuat.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={15} />
                Ya, Hapus Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
