import { store } from './store';

export type DatabaseDialect = 'postgres' | 'mysql';

/**
 * Escape string for SQL literals
 */
function sqlEscape(val: any, dialect: DatabaseDialect): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (typeof val === 'number') {
    return isNaN(val) ? 'NULL' : String(val);
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return dialect === 'postgres' ? `'${jsonStr}'::jsonb` : `'${jsonStr}'`;
  }
  const str = String(val).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${str}'`;
}

/**
 * Generate DDL Schema for PostgreSQL / Supabase
 */
export function generatePostgresSchema(): string {
  return `-- ==========================================
-- DDL Schema for Supabase / PostgreSQL (EduSync)
-- ==========================================

-- 1. Table: settings
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(64) PRIMARY KEY,
  nama_sekolah VARCHAR(255),
  npsn VARCHAR(50),
  alamat_sekolah TEXT,
  nama_kepala_sekolah VARCHAR(255),
  nip_kepala_sekolah VARCHAR(100),
  nama_wali_kelas VARCHAR(255),
  nip_wali_kelas VARCHAR(100),
  tahun_ajaran VARCHAR(50),
  semester_aktif VARCHAR(50),
  target_kas_mingguan NUMERIC(15,2) DEFAULT 0,
  logo_url TEXT,
  ttd_kepsek_url TEXT,
  ttd_walikelas_url TEXT,
  catatan_wali_kelas_templates JSONB,
  capaian_kompetensi_templates JSONB,
  mata_pelajaran JSONB,
  pilihan_mata_pelajaran JSONB,
  wa_group_links JSONB,
  raw_data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table: users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  nama_lengkap VARCHAR(255),
  role VARCHAR(50) NOT NULL,
  pin VARCHAR(50),
  kelas TEXT,
  mata_pelajaran TEXT,
  nip VARCHAR(100),
  email VARCHAR(255),
  no_hp VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table: students
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(64) PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  nisn VARCHAR(50),
  nipd VARCHAR(50),
  gender VARCHAR(20),
  kelas VARCHAR(50) NOT NULL,
  no_telp_ortu VARCHAR(50),
  alamat TEXT,
  status VARCHAR(50) DEFAULT 'aktif',
  foto_url TEXT,
  qr_code TEXT,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table: grades
CREATE TABLE IF NOT EXISTS grades (
  id VARCHAR(64) PRIMARY KEY,
  id_siswa VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
  nama_siswa VARCHAR(255),
  kelas VARCHAR(50),
  mata_pelajaran VARCHAR(100) NOT NULL,
  semester VARCHAR(50) NOT NULL,
  jenis_penilaian VARCHAR(50),
  nilai NUMERIC(5,2),
  kategori VARCHAR(50),
  catatan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table: attendance
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(64) PRIMARY KEY,
  id_siswa VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
  nama_siswa VARCHAR(255),
  kelas VARCHAR(50),
  tanggal DATE NOT NULL,
  status VARCHAR(50) NOT NULL, -- Hadir, Izin, Sakit, Alpa
  keterangan TEXT,
  semester VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Table: kas
CREATE TABLE IF NOT EXISTS kas (
  id VARCHAR(64) PRIMARY KEY,
  tanggal DATE NOT NULL,
  jenis VARCHAR(20) NOT NULL, -- Masuk / Keluar
  kategori VARCHAR(100),
  jumlah NUMERIC(15,2) NOT NULL,
  keterangan TEXT,
  id_siswa VARCHAR(64),
  nama_siswa VARCHAR(255),
  kelas VARCHAR(50),
  semester VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Table: kas_logs
CREATE TABLE IF NOT EXISTS kas_logs (
  id VARCHAR(64) PRIMARY KEY,
  id_kas VARCHAR(64),
  action VARCHAR(50),
  user_name VARCHAR(255),
  details TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Table: tasks
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  judul VARCHAR(255) NOT NULL,
  deskripsi TEXT,
  kelas VARCHAR(50),
  mata_pelajaran VARCHAR(100),
  tgl_deadline DATE,
  semester VARCHAR(50),
  status VARCHAR(50) DEFAULT 'Aktif',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Table: jurnal
CREATE TABLE IF NOT EXISTS jurnal (
  id VARCHAR(64) PRIMARY KEY,
  tanggal DATE NOT NULL,
  id_siswa VARCHAR(64),
  nama_siswa VARCHAR(255),
  kelas VARCHAR(50),
  jenis VARCHAR(50), -- Pelanggaran / Prestasi / Catatan
  catatan TEXT NOT NULL,
  tindakan TEXT,
  poin INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Table: piket
CREATE TABLE IF NOT EXISTS piket (
  id VARCHAR(64) PRIMARY KEY,
  hari VARCHAR(20) NOT NULL,
  kelas VARCHAR(50),
  siswa_ids JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Table: roster
CREATE TABLE IF NOT EXISTS roster (
  id VARCHAR(64) PRIMARY KEY,
  hari VARCHAR(20) NOT NULL,
  kelas VARCHAR(50),
  jam_ke VARCHAR(20),
  mata_pelajaran VARCHAR(100),
  nama_guru VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Table: rapor_capaian
CREATE TABLE IF NOT EXISTS rapor_capaian (
  id VARCHAR(64) PRIMARY KEY,
  id_siswa VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
  semester VARCHAR(50),
  catatan_akademik TEXT,
  catatan_karakter TEXT,
  saran_pengembangan TEXT,
  ekstrakurikuler JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance optimization
CREATE INDEX IF NOT EXISTS idx_students_kelas ON students(kelas);
CREATE INDEX IF NOT EXISTS idx_grades_siswa ON grades(id_siswa);
CREATE INDEX IF NOT EXISTS idx_attendance_tanggal ON attendance(tanggal);
CREATE INDEX IF NOT EXISTS idx_kas_tanggal ON kas(tanggal);
`;
}

/**
 * Generate DDL Schema for MySQL / MariaDB
 */
export function generateMySQLSchema(): string {
  return `-- ==========================================
-- DDL Schema for MySQL / MariaDB (EduSync)
-- ==========================================

CREATE TABLE IF NOT EXISTS \`settings\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`nama_sekolah\` VARCHAR(255),
  \`npsn\` VARCHAR(50),
  \`alamat_sekolah\` TEXT,
  \`nama_kepala_sekolah\` VARCHAR(255),
  \`nip_kepala_sekolah\` VARCHAR(100),
  \`nama_wali_kelas\` VARCHAR(255),
  \`nip_wali_kelas\` VARCHAR(100),
  \`tahun_ajaran\` VARCHAR(50),
  \`semester_aktif\` VARCHAR(50),
  \`target_kas_mingguan\` DECIMAL(15,2) DEFAULT 0,
  \`logo_url\` TEXT,
  \`ttd_kepsek_url\` TEXT,
  \`ttd_walikelas_url\` TEXT,
  \`catatan_wali_kelas_templates\` JSON,
  \`capaian_kompetensi_templates\` JSON,
  \`mata_pelajaran\` JSON,
  \`pilihan_mata_pelajaran\` JSON,
  \`wa_group_links\` JSON,
  \`raw_data\` JSON,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`username\` VARCHAR(100) NOT NULL UNIQUE,
  \`nama_lengkap\` VARCHAR(255),
  \`role\` VARCHAR(50) NOT NULL,
  \`pin\` VARCHAR(50),
  \`kelas\` TEXT,
  \`mata_pelajaran\` TEXT,
  \`nip\` VARCHAR(100),
  \`email\` VARCHAR(255),
  \`no_hp\` VARCHAR(50),
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`students\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`nama\` VARCHAR(255) NOT NULL,
  \`nisn\` VARCHAR(50),
  \`nipd\` VARCHAR(50),
  \`gender\` VARCHAR(20),
  \`kelas\` VARCHAR(50) NOT NULL,
  \`no_telp_ortu\` VARCHAR(50),
  \`alamat\` TEXT,
  \`status\` VARCHAR(50) DEFAULT 'aktif',
  \`foto_url\` TEXT,
  \`qr_code\` TEXT,
  \`raw_data\` JSON,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_students_kelas\` (\`kelas\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`grades\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`id_siswa\` VARCHAR(64),
  \`nama_siswa\` VARCHAR(255),
  \`kelas\` VARCHAR(50),
  \`mata_pelajaran\` VARCHAR(100) NOT NULL,
  \`semester\` VARCHAR(50) NOT NULL,
  \`jenis_penilaian\` VARCHAR(50),
  \`nilai\` DECIMAL(5,2),
  \`kategori\` VARCHAR(50),
  \`catatan\` TEXT,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (\`id_siswa\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
  INDEX \`idx_grades_siswa\` (\`id_siswa\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`attendance\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`id_siswa\` VARCHAR(64),
  \`nama_siswa\` VARCHAR(255),
  \`kelas\` VARCHAR(50),
  \`tanggal\` DATE NOT NULL,
  \`status\` VARCHAR(50) NOT NULL,
  \`keterangan\` TEXT,
  \`semester\` VARCHAR(50),
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (\`id_siswa\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
  INDEX \`idx_attendance_tanggal\` (\`tanggal\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`kas\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`tanggal\` DATE NOT NULL,
  \`jenis\` VARCHAR(20) NOT NULL,
  \`kategori\` VARCHAR(100),
  \`jumlah\` DECIMAL(15,2) NOT NULL,
  \`keterangan\` TEXT,
  \`id_siswa\` VARCHAR(64),
  \`nama_siswa\` VARCHAR(255),
  \`kelas\` VARCHAR(50),
  \`semester\` VARCHAR(50),
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_kas_tanggal\` (\`tanggal\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`kas_logs\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`id_kas\` VARCHAR(64),
  \`action\` VARCHAR(50),
  \`user_name\` VARCHAR(255),
  \`details\` TEXT,
  \`timestamp\` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`tasks\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`judul\` VARCHAR(255) NOT NULL,
  \`deskripsi\` TEXT,
  \`kelas\` VARCHAR(50),
  \`mata_pelajaran\` VARCHAR(100),
  \`tgl_deadline\` DATE,
  \`semester\` VARCHAR(50),
  \`status\` VARCHAR(50) DEFAULT 'Aktif',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`jurnal\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`tanggal\` DATE NOT NULL,
  \`id_siswa\` VARCHAR(64),
  \`nama_siswa\` VARCHAR(255),
  \`kelas\` VARCHAR(50),
  \`jenis\` VARCHAR(50),
  \`catatan\` TEXT NOT NULL,
  \`tindakan\` TEXT,
  \`poin\` INT DEFAULT 0,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`piket\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`hari\` VARCHAR(20) NOT NULL,
  \`kelas\` VARCHAR(50),
  \`siswa_ids\` JSON,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`roster\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`hari\` VARCHAR(20) NOT NULL,
  \`kelas\` VARCHAR(50),
  \`jam_ke\` VARCHAR(20),
  \`mata_pelajaran\` VARCHAR(100),
  \`nama_guru\` VARCHAR(255),
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`rapor_capaian\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`id_siswa\` VARCHAR(64),
  \`semester\` VARCHAR(50),
  \`catatan_akademik\` TEXT,
  \`catatan_karakter\` TEXT,
  \`saran_pengembangan\` TEXT,
  \`ekstrakurikuler\` JSON,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (\`id_siswa\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
}

/**
 * Dump current database to JSON object
 */
export async function exportDatabaseToJSON(): Promise<Record<string, any>> {
  const result: Record<string, any[]> = {};
  
  const storesToExport = [
    { key: 'students', storeInst: store.students },
    { key: 'grades', storeInst: store.grades },
    { key: 'attendance', storeInst: store.attendance },
    { key: 'tasks', storeInst: store.tasks },
    { key: 'settings', storeInst: store.settings },
    { key: 'users', storeInst: store.users },
    { key: 'roster', storeInst: store.roster },
    { key: 'piket', storeInst: store.piket },
    { key: 'raporCapaian', storeInst: store.raporCapaian },
    { key: 'jurnal', storeInst: store.jurnal },
    { key: 'kas', storeInst: store.kas },
    { key: 'kasLogs', storeInst: store.kasLogs },
  ];

  for (const item of storesToExport) {
    const list: any[] = [];
    await item.storeInst.iterate((val: any, id: string) => {
      list.push({ ...val, id: val?.id || id });
    }).catch(() => {});
    result[item.key] = list;
  }

  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: result
  };
}

/**
 * Dump current database to SQL Insert Scripts
 */
export async function exportDatabaseToSQL(dialect: DatabaseDialect): Promise<string> {
  const jsonDump = await exportDatabaseToJSON();
  const data = jsonDump.data;
  const lines: string[] = [];

  lines.push(`-- EduSync SQL Data Export (${dialect.toUpperCase()})`);
  lines.push(`-- Generated on: ${new Date().toLocaleString('id-ID')}`);
  lines.push(`-- Target Database: ${dialect === 'postgres' ? 'Supabase / PostgreSQL' : 'MySQL / MariaDB'}\n`);

  if (dialect === 'postgres') {
    lines.push('BEGIN;');
  } else {
    lines.push('SET FOREIGN_KEY_CHECKS = 0;');
    lines.push('START TRANSACTION;');
  }

  // 1. Settings
  if (data.settings && data.settings.length > 0) {
    lines.push(`\n-- Table: settings`);
    for (const s of data.settings) {
      const id = sqlEscape(s.id || 'app_settings', dialect);
      const nama_sekolah = sqlEscape(s.nama_sekolah, dialect);
      const npsn = sqlEscape(s.npsn, dialect);
      const alamat_sekolah = sqlEscape(s.alamat_sekolah, dialect);
      const nama_kepala_sekolah = sqlEscape(s.nama_kepala_sekolah, dialect);
      const nip_kepala_sekolah = sqlEscape(s.nip_kepala_sekolah, dialect);
      const nama_wali_kelas = sqlEscape(s.nama_wali_kelas, dialect);
      const nip_wali_kelas = sqlEscape(s.nip_wali_kelas, dialect);
      const tahun_ajaran = sqlEscape(s.tahun_ajaran, dialect);
      const semester_aktif = sqlEscape(s.semester_aktif, dialect);
      const target_kas_mingguan = sqlEscape(s.target_kas_mingguan || 0, dialect);
      const logo_url = sqlEscape(s.logo_url, dialect);
      const ttd_kepsek_url = sqlEscape(s.ttd_kepsek_url, dialect);
      const ttd_walikelas_url = sqlEscape(s.ttd_walikelas_url, dialect);
      const catatan_wali_kelas_templates = sqlEscape(s.catatan_wali_kelas_templates, dialect);
      const capaian_kompetensi_templates = sqlEscape(s.capaian_kompetensi_templates, dialect);
      const mata_pelajaran = sqlEscape(s.mata_pelajaran, dialect);
      const pilihan_mata_pelajaran = sqlEscape(s.pilihan_mata_pelajaran, dialect);
      const wa_group_links = sqlEscape(s.wa_group_links, dialect);

      lines.push(`INSERT INTO settings (id, nama_sekolah, npsn, alamat_sekolah, nama_kepala_sekolah, nip_kepala_sekolah, nama_wali_kelas, nip_wali_kelas, tahun_ajaran, semester_aktif, target_kas_mingguan, logo_url, ttd_kepsek_url, ttd_walikelas_url, catatan_wali_kelas_templates, capaian_kompetensi_templates, mata_pelajaran, pilihan_mata_pelajaran, wa_group_links) VALUES (${id}, ${nama_sekolah}, ${npsn}, ${alamat_sekolah}, ${nama_kepala_sekolah}, ${nip_kepala_sekolah}, ${nama_wali_kelas}, ${nip_wali_kelas}, ${tahun_ajaran}, ${semester_aktif}, ${target_kas_mingguan}, ${logo_url}, ${ttd_kepsek_url}, ${ttd_walikelas_url}, ${catatan_wali_kelas_templates}, ${capaian_kompetensi_templates}, ${mata_pelajaran}, ${pilihan_mata_pelajaran}, ${wa_group_links});`);
    }
  }

  // 2. Users
  if (data.users && data.users.length > 0) {
    lines.push(`\n-- Table: users`);
    for (const u of data.users) {
      const id = sqlEscape(u.id, dialect);
      const username = sqlEscape(u.username, dialect);
      const nama_lengkap = sqlEscape(u.nama_lengkap, dialect);
      const role = sqlEscape(u.role, dialect);
      const pin = sqlEscape(u.pin, dialect);
      const kelas = sqlEscape(Array.isArray(u.kelas) ? u.kelas.join(',') : u.kelas, dialect);
      const mata_pelajaran = sqlEscape(Array.isArray(u.mata_pelajaran) ? u.mata_pelajaran.join(',') : u.mata_pelajaran, dialect);
      const nip = sqlEscape(u.nip, dialect);
      const email = sqlEscape(u.email, dialect);
      const no_hp = sqlEscape(u.no_hp, dialect);

      lines.push(`INSERT INTO users (id, username, nama_lengkap, role, pin, kelas, mata_pelajaran, nip, email, no_hp) VALUES (${id}, ${username}, ${nama_lengkap}, ${role}, ${pin}, ${kelas}, ${mata_pelajaran}, ${nip}, ${email}, ${no_hp});`);
    }
  }

  // 3. Students
  if (data.students && data.students.length > 0) {
    lines.push(`\n-- Table: students`);
    for (const s of data.students) {
      const id = sqlEscape(s.id, dialect);
      const nama = sqlEscape(s.nama, dialect);
      const nisn = sqlEscape(s.nisn, dialect);
      const nipd = sqlEscape(s.nipd, dialect);
      const gender = sqlEscape(s.gender || s.jenis_kelamin, dialect);
      const kelas = sqlEscape(s.kelas, dialect);
      const no_telp_ortu = sqlEscape(s.no_telp_ortu || s.nomor_telepon, dialect);
      const alamat = sqlEscape(s.alamat, dialect);
      const status = sqlEscape(s.status || 'aktif', dialect);

      lines.push(`INSERT INTO students (id, nama, nisn, nipd, gender, kelas, no_telp_ortu, alamat, status) VALUES (${id}, ${nama}, ${nisn}, ${nipd}, ${gender}, ${kelas}, ${no_telp_ortu}, ${alamat}, ${status});`);
    }
  }

  // 4. Grades
  if (data.grades && data.grades.length > 0) {
    lines.push(`\n-- Table: grades`);
    for (const g of data.grades) {
      const id = sqlEscape(g.id, dialect);
      const id_siswa = sqlEscape(g.id_siswa, dialect);
      const nama_siswa = sqlEscape(g.nama_siswa, dialect);
      const kelas = sqlEscape(g.kelas, dialect);
      const mata_pelajaran = sqlEscape(g.mata_pelajaran, dialect);
      const semester = sqlEscape(g.semester, dialect);
      const jenis_penilaian = sqlEscape(g.jenis_penilaian, dialect);
      const nilai = sqlEscape(g.nilai, dialect);
      const kategori = sqlEscape(g.kategori, dialect);
      const catatan = sqlEscape(g.catatan, dialect);

      lines.push(`INSERT INTO grades (id, id_siswa, nama_siswa, kelas, mata_pelajaran, semester, jenis_penilaian, nilai, kategori, catatan) VALUES (${id}, ${id_siswa}, ${nama_siswa}, ${kelas}, ${mata_pelajaran}, ${semester}, ${jenis_penilaian}, ${nilai}, ${kategori}, ${catatan});`);
    }
  }

  // 5. Attendance
  if (data.attendance && data.attendance.length > 0) {
    lines.push(`\n-- Table: attendance`);
    for (const a of data.attendance) {
      const id = sqlEscape(a.id, dialect);
      const id_siswa = sqlEscape(a.id_siswa, dialect);
      const nama_siswa = sqlEscape(a.nama_siswa, dialect);
      const kelas = sqlEscape(a.kelas, dialect);
      const tanggal = sqlEscape(a.tanggal, dialect);
      const status = sqlEscape(a.status, dialect);
      const keterangan = sqlEscape(a.keterangan, dialect);
      const semester = sqlEscape(a.semester, dialect);

      lines.push(`INSERT INTO attendance (id, id_siswa, nama_siswa, kelas, tanggal, status, keterangan, semester) VALUES (${id}, ${id_siswa}, ${nama_siswa}, ${kelas}, ${tanggal}, ${status}, ${keterangan}, ${semester});`);
    }
  }

  // 6. Kas
  if (data.kas && data.kas.length > 0) {
    lines.push(`\n-- Table: kas`);
    for (const k of data.kas) {
      const id = sqlEscape(k.id, dialect);
      const tanggal = sqlEscape(k.tanggal, dialect);
      const jenis = sqlEscape(k.jenis, dialect);
      const kategori = sqlEscape(k.kategori, dialect);
      const jumlah = sqlEscape(k.jumlah, dialect);
      const keterangan = sqlEscape(k.keterangan, dialect);
      const id_siswa = sqlEscape(k.id_siswa, dialect);
      const nama_siswa = sqlEscape(k.nama_siswa, dialect);
      const kelas = sqlEscape(k.kelas, dialect);
      const semester = sqlEscape(k.semester, dialect);

      lines.push(`INSERT INTO kas (id, tanggal, jenis, kategori, jumlah, keterangan, id_siswa, nama_siswa, kelas, semester) VALUES (${id}, ${tanggal}, ${jenis}, ${kategori}, ${jumlah}, ${keterangan}, ${id_siswa}, ${nama_siswa}, ${kelas}, ${semester});`);
    }
  }

  // 7. Tasks
  if (data.tasks && data.tasks.length > 0) {
    lines.push(`\n-- Table: tasks`);
    for (const t of data.tasks) {
      const id = sqlEscape(t.id, dialect);
      const judul = sqlEscape(t.judul, dialect);
      const deskripsi = sqlEscape(t.deskripsi, dialect);
      const kelas = sqlEscape(t.kelas, dialect);
      const mata_pelajaran = sqlEscape(t.mata_pelajaran, dialect);
      const tgl_deadline = sqlEscape(t.tgl_deadline, dialect);
      const semester = sqlEscape(t.semester, dialect);
      const status = sqlEscape(t.status || 'Aktif', dialect);

      lines.push(`INSERT INTO tasks (id, judul, deskripsi, kelas, mata_pelajaran, tgl_deadline, semester, status) VALUES (${id}, ${judul}, ${deskripsi}, ${kelas}, ${mata_pelajaran}, ${tgl_deadline}, ${semester}, ${status});`);
    }
  }

  // 8. Jurnal
  if (data.jurnal && data.jurnal.length > 0) {
    lines.push(`\n-- Table: jurnal`);
    for (const j of data.jurnal) {
      const id = sqlEscape(j.id, dialect);
      const tanggal = sqlEscape(j.tanggal, dialect);
      const id_siswa = sqlEscape(j.id_siswa, dialect);
      const nama_siswa = sqlEscape(j.nama_siswa, dialect);
      const kelas = sqlEscape(j.kelas, dialect);
      const jenis = sqlEscape(j.jenis, dialect);
      const catatan = sqlEscape(j.catatan, dialect);
      const tindakan = sqlEscape(j.tindakan, dialect);
      const poin = sqlEscape(j.poin || 0, dialect);

      lines.push(`INSERT INTO jurnal (id, tanggal, id_siswa, nama_siswa, kelas, jenis, catatan, tindakan, poin) VALUES (${id}, ${tanggal}, ${id_siswa}, ${nama_siswa}, ${kelas}, ${jenis}, ${catatan}, ${tindakan}, ${poin});`);
    }
  }

  if (dialect === 'postgres') {
    lines.push('\nCOMMIT;');
  } else {
    lines.push('\nCOMMIT;');
    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  }

  return lines.join('\n');
}
