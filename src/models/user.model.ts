export type MenuPermissionLevel = 'none' | 'read' | 'crud';

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'kepsek' | 'wali_kelas' | 'guru_mapel' | 'staf' | 'guru';
  name: string;
  nama?: string;
  assignedKelas?: string; // e.g. "7-A" or "7-A, 7-B" or "Semua"
  assignedClasses?: string[];
  assignedMapel?: string; // e.g. "Matematika" or "Bahasa Indonesia" or "Semua"
  assignedSubjects?: string[];
  canManageUsers?: boolean;
  canEditSettings?: boolean;
  canExportData?: boolean;
  isReadonly?: boolean;
  menuPermissions?: Record<string, MenuPermissionLevel>;
  pertanyaan_keamanan?: string;
  jawaban_keamanan?: string;
  email_pemulihan?: string;
  updatedAt?: string;
  lastModified?: string;
}

export function isUserAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin';
}

export function isUserReadOnly(user: AppUser | null): boolean {
  return Boolean(user?.isReadonly || user?.role === 'kepsek');
}
