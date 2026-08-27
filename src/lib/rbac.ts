import { AppUser } from './store';

export type UserRole = 'admin' | 'kepsek' | 'wali_kelas' | 'guru_mapel' | 'staf' | 'guru';

export interface RoleConfig {
  role: UserRole;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  description: string;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  admin: {
    role: 'admin',
    label: 'Administrator',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/30',
    description: 'Akses penuh seluruh data, manajemen user, RBAC, & sistem.'
  },
  kepsek: {
    role: 'kepsek',
    label: 'Kepala Sekolah',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/30',
    description: 'Akses monitoring, supervisi, & laporan rapor semua kelas.'
  },
  wali_kelas: {
    role: 'wali_kelas',
    label: 'Wali Kelas',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
    description: 'Mengelola data siswa, absensi, nilai, & kas pada Rombel binaannya.'
  },
  guru_mapel: {
    role: 'guru_mapel',
    label: 'Guru Mata Pelajaran',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/30',
    description: 'Mengelola penilaian & jurnal mengajar untuk mata pelajaran diampunya.'
  },
  staf: {
    role: 'staf',
    label: 'Staf / Tata Usaha',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/30',
    description: 'Akses tata usaha & entri data umum sesuai izin kustom.'
  },
  guru: {
    role: 'guru',
    label: 'Guru Umumm / Wali Kelas',
    badgeBg: 'bg-indigo-500/15',
    badgeText: 'text-indigo-300',
    badgeBorder: 'border-indigo-500/30',
    description: 'Akses standar guru & pengelola kelas.'
  }
};

export function getDisplayRoleLabel(user?: AppUser | null): string {
  if (!user) return 'Pengguna';
  if (user.role === 'admin' || user.username === 'admin') return 'Administrator';
  if (user.role === 'kepsek') return 'Kepala Sekolah';
  if (user.role === 'staf') return 'Staf / Tata Usaha';
  if (user.role === 'guru_mapel') {
    const mapel = user.assignedMapel && user.assignedMapel !== 'semua' 
      ? user.assignedMapel 
      : (user.assignedSubjects && user.assignedSubjects[0] !== '*' ? user.assignedSubjects.join(', ') : '');
    return mapel ? `Guru ${mapel}` : 'Guru Mata Pelajaran';
  }
  if (user.role === 'guru' || user.role === 'wali_kelas') {
    const kelas = user.assignedKelas && user.assignedKelas !== 'semua' 
      ? user.assignedKelas 
      : (user.assignedClasses && user.assignedClasses[0] !== '*' ? user.assignedClasses.join(', ') : '');
    return kelas ? `Wali Kelas ${kelas}` : 'Guru Kelas';
  }
  return user.role ? String(user.role).toUpperCase() : 'Pengguna';
}

/**
 * Mendapatkan objek AppUser aktif dari localStorage
 */
export function getCurrentUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('app_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Cek apakah user adalah Admin / Kepala Sekolah Utama
 */
export function isUserAdmin(user?: AppUser | null): boolean {
  const target = user || getCurrentUser();
  if (!target) return false;
  return target.role === 'admin' || target.username === 'admin' || target.role === 'kepsek' || target.canManageUsers === true;
}

/**
 * Cek apakah user dapat mengelola user lain (RBAC Admin)
 */
export function canManageUsers(user?: AppUser | null): boolean {
  const target = user || getCurrentUser();
  if (!target) return false;
  return target.role === 'admin' || target.username === 'admin' || target.canManageUsers === true;
}

/**
 * Mendapatkan daftar Kelas / Rombel yang ditugaskan kepada user
 */
export function getAssignedClasses(user?: AppUser | null): string[] {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target) return ['*'];
  
  if (isUserAdmin(target) || target.role === 'admin' || target.role === 'kepsek') {
    return ['*'];
  }

  const isTeacherRole = target.role === 'guru' || target.role === 'wali_kelas' || target.role === 'guru_mapel';

  let rawList: string[] = [];
  if (Array.isArray(target.assignedClasses) && target.assignedClasses.length > 0) {
    rawList = target.assignedClasses.map(c => String(c).trim()).filter(Boolean);
  } else if (target.assignedKelas && typeof target.assignedKelas === 'string') {
    rawList = target.assignedKelas.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!isTeacherRole && (rawList.includes('*') || rawList.some(c => c.toLowerCase() === 'semua'))) {
    return ['*'];
  }

  const cleanClasses = rawList.filter(c => c !== '*' && c.toLowerCase() !== 'semua');
  if (cleanClasses.length > 0) {
    return cleanClasses;
  }

  if (isTeacherRole) {
    return [];
  }

  return ['*'];
}

/**
 * Mendapatkan daftar Mata Pelajaran yang ditugaskan kepada user
 */
export function getAssignedSubjects(user?: AppUser | null): string[] {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target) return ['*'];
  if (
    isUserAdmin(target) || 
    target.role === 'wali_kelas' || 
    target.role === 'guru' || 
    target.role === 'kepsek' || 
    target.role === 'staf' || 
    target.assignedMapel === '*' || 
    target.assignedMapel === 'Semua' || 
    !target.assignedMapel
  ) {
    return ['*'];
  }
  return target.assignedMapel.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Memeriksa apakah user berhak mengakses Kelas / Rombel tertentu
 */
export function canAccessClass(user: AppUser | null, kelasName?: string): boolean {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target) return true; // Default fallback
  if (isUserAdmin(target)) return true;

  const assigned = getAssignedClasses(target);
  if (assigned.includes('*')) return true;

  if (!kelasName || kelasName.toLowerCase() === 'semua') return false;

  return assigned.some(c => c.toLowerCase() === kelasName.trim().toLowerCase());
}

/**
 * Memeriksa apakah user berhak mengakses Mata Pelajaran tertentu
 */
export function canAccessSubject(user: AppUser | null, mapelName?: string): boolean {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target) return true;
  if (isUserAdmin(target)) return true;

  const assigned = getAssignedSubjects(target);
  if (assigned.includes('*')) return true;

  if (!mapelName || mapelName.toLowerCase() === 'semua') return false;

  return assigned.some(m => m.toLowerCase() === mapelName.trim().toLowerCase());
}

/**
 * Memeriksa apakah user dapat melakukan aksi CRUD pada suatu item data
 */
export function canModifyData(
  user: AppUser | null, 
  itemKelas?: string, 
  itemMapel?: string
): boolean {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target) return true;
  if (target.isReadonly) return false;
  if (isUserAdmin(target)) return true;

  const classAllowed = canAccessClass(target, itemKelas);
  const mapelAllowed = canAccessSubject(target, itemMapel);

  return classAllowed && mapelAllowed;
}

/**
 * Helper untuk normalisasi nama kelas (misal "7-A" -> "7a", "7 A" -> "7a")
 */
function normalizeClass(name?: string): string {
  if (!name) return '';
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Filter array data Siswa berdasarkan hak akses kelas user
 */
export function filterStudentsForUser<T extends { kelas?: string }>(
  user: AppUser | null, 
  students: T[]
): T[] {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target || isUserAdmin(target)) return students;
  const assigned = getAssignedClasses(target);
  if (assigned.includes('*')) return students;

  const isWaliKelas = target.role === 'wali_kelas';

  return students.filter(s => {
    if (!s.kelas || s.kelas.trim() === '' || s.kelas.trim() === '-' || s.kelas.trim().toLowerCase() === 'umum') {
      // Untuk wali kelas, jangan tampilkan siswa tanpa kelas di dashboard rombelnya
      return !isWaliKelas;
    }
    const cleanStudentClass = normalizeClass(s.kelas);
    return assigned.some(c => {
      const cleanAssigned = normalizeClass(c);
      return cleanAssigned === cleanStudentClass || c.toLowerCase() === s.kelas?.trim().toLowerCase();
    });
  });
}

/**
 * Filter array data Nilai/Absensi/Jurnal berdasarkan hak akses user
 */
export function filterRecordsForUser<T extends { kelas?: string; mata_pelajaran?: string; id_siswa?: string }>(
  user: AppUser | null, 
  records: T[],
  studentClassMap?: Record<string, string>
): T[] {
  const target = user !== undefined ? user : getCurrentUser();
  if (!target || isUserAdmin(target)) return records;
  const assignedClasses = getAssignedClasses(target);
  const assignedSubjects = getAssignedSubjects(target);

  if (assignedClasses.includes('*') && assignedSubjects.includes('*')) return records;

  return records.filter(r => {
    const recordKelas = r.kelas || (r.id_siswa && studentClassMap ? studentClassMap[r.id_siswa] : undefined);
    
    let classOk = true;
    if (!assignedClasses.includes('*')) {
      if (recordKelas) {
        const cleanRecord = normalizeClass(recordKelas);
        classOk = assignedClasses.some(c => normalizeClass(c) === cleanRecord || c.toLowerCase() === recordKelas.trim().toLowerCase());
      } else {
        classOk = false;
      }
    }

    let mapelOk = true;
    if (!assignedSubjects.includes('*') && r.mata_pelajaran) {
      mapelOk = assignedSubjects.some(m => m.toLowerCase() === r.mata_pelajaran?.trim().toLowerCase());
    }

    return classOk && mapelOk;
  });
}

export interface AppMenuDefinition {
  id: string;
  label: string;
  category: 'Utama' | 'Pengelolaan' | 'Laporan' | 'Sistem' | 'Informasi';
  description?: string;
}

export const APP_MENUS: AppMenuDefinition[] = [
  { id: 'dashboard', label: 'Dashboard Utama', category: 'Utama', description: 'Ringkasan statistik,grafik, dan rekap kelas' },
  { id: 'siswa', label: 'Data Siswa', category: 'Pengelolaan', description: 'Kelola profil, NISN, wali, dan biodata siswa' },
  { id: 'absensi', label: 'Absensi Siswa', category: 'Pengelolaan', description: 'Pencatatan rekap presensi harian & per mata pelajaran' },
  { id: 'nilai', label: 'Nilai & Evaluasi', category: 'Pengelolaan', description: 'Input nilai formatif, sumatif, dan bobot evaluasi' },
  { id: 'tugas', label: 'Manajemen Tugas', category: 'Pengelolaan', description: 'Monitoring penugasan dan checklist kelengkapan' },
  { id: 'roster_piket', label: 'Roster & Jadwal Piket', category: 'Pengelolaan', description: 'Pengaturan jadwal pelajaran harian & tim piket' },
  { id: 'jurnal_guru', label: 'Jurnal & Pelanggaran', category: 'Pengelolaan', description: 'Catatan kejadian kelas, kedisiplinan, & prestasi' },
  { id: 'kas_kelas', label: 'Kas Kelas', category: 'Pengelolaan', description: 'Pencatatan pemasukan & pengeluaran uang kas' },
  { id: 'notifikasi_wa', label: 'Notifikasi WhatsApp', category: 'Pengelolaan', description: 'Kirim pesan tagihan, absensi, & pengumuman ke wali' },
  { id: 'rapor', label: 'Cetak Rapor (PDF)', category: 'Laporan', description: 'Generate dan cetak lembar rapor capaian' },
  { id: 'ekspor', label: 'Ekspor Data Terpadu', category: 'Laporan', description: 'Unduh rekapitulasi data format Excel / CSV' },
  { id: 'identitas', label: 'Identitas Sekolah', category: 'Sistem', description: 'Pengaturan nama sekolah, NPSN, & kop surat' },
  { id: 'users', label: 'Kelola Pengguna (RBAC)', category: 'Sistem', description: 'Atur akun, peran, dan matriks izin menu pengguna' },
  { id: 'pengaturan', label: 'Pengaturan Sistem', category: 'Sistem', description: 'Atur semester, bobot nilai, dan daftar rombel kelas' },
  { id: 'diagnostik', label: 'Diagnostik Database', category: 'Sistem', description: 'Status sinkronisasi Firebase, gizi data, & perbaikan' },
  { id: 'dokumentasi', label: 'Dokumentasi', category: 'Informasi', description: 'Dokumentasi teknis aplikasi' },
  { id: 'panduan', label: 'Panduan Penggunaan', category: 'Informasi', description: 'Petunjuk penggunaan & integrasi database baru' },
];

/**
 * Mendapatkan tingkat izin akses pengguna untuk menu tertentu
 * Return: 'none' (tersembunyi/blokir), 'read' (hanya lihat), 'crud' (penuh)
 */
export function getMenuPermission(user: AppUser | null, menuId: string): 'none' | 'read' | 'crud' {
  if (!user) return 'crud';
  if (isUserAdmin(user)) return 'crud';

  // Explicit menu permissions configured by Admin
  if (user.menuPermissions && user.menuPermissions[menuId]) {
    const perm = user.menuPermissions[menuId];
    if (user.isReadonly && perm === 'crud') return 'read';
    return perm;
  }

  // Global Readonly mode
  if (user.isReadonly) return 'read';

  // Menu Kelola Pengguna memerlukan hak pengelolaan user
  if (menuId === 'users') {
    if (!canManageUsers(user)) {
      return 'none';
    }
  }

  // Menu Pengaturan & Diagnostik untuk Staf/Role khusus jika dibatasi
  if (['pengaturan', 'diagnostik', 'identitas'].includes(menuId)) {
    if (user.role === 'staf') {
      return 'none';
    }
  }

  return 'crud';
}

/**
 * Memeriksa apakah user dapat melihat menu di sidebar & membuka halamannya
 */
export function canAccessMenu(user: AppUser | null, menuId: string): boolean {
  return getMenuPermission(user, menuId) !== 'none';
}

/**
 * Memeriksa apakah user berhak melakukan operasi Tambah / Edit / Hapus pada menu tersebut
 */
export function canCrudMenu(user: AppUser | null, menuId: string): boolean {
  return getMenuPermission(user, menuId) === 'crud';
}

