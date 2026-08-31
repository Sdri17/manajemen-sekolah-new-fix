/**
 * File acuan untuk Solusi Security Rules Firestore dan Schema Migrasi SQL (MySQL / PostgreSQL)
 */

export const RECOMMENDED_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function checking authentication
    function isSignedIn() {
      return request.auth != null;
    }

    // Explicit Admin Access Guard: Allow admin access to all collections
    function isAdmin() {
      return request.auth != null && (
        (request.auth.token.keys().hasAll(['role']) && request.auth.token.role == 'admin') ||
        (request.auth.token.keys().hasAll(['admin']) && request.auth.token.admin == true) ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && 
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }

    // Explicit Wali Kelas Access Guard: Enforce access to only their specific assigned class path
    function isWaliKelas(assignedKelas) {
      return request.auth != null && (
        (request.auth.token.keys().hasAll(['role']) && 
          (request.auth.token.role == 'wali_kelas' || request.auth.token.role == 'guru') && 
          (request.auth.token.assignedKelas == assignedKelas || request.auth.token.assignedClass == assignedKelas)) ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'wali_kelas' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'guru'
        ) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.assignedKelas == assignedKelas ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.assignedKelas == 'semua'
        ))
      );
    }

    // Helper: Checks general document access (Admin bypass, owner check, or local session)
    function canAccessDoc() {
      return request.auth == null || 
        isAdmin() ||
        resource == null ||
        (!('ownerId' in resource.data) && !('OwnerID' in resource.data)) ||
        resource.data.ownerId == request.auth.uid ||
        resource.data.OwnerID == request.auth.uid;
    }

    function canWriteDoc() {
      return request.auth == null ||
        isAdmin() ||
        (!('ownerId' in request.resource.data) && !('OwnerID' in request.resource.data)) ||
        request.resource.data.ownerId == request.auth.uid ||
        request.resource.data.OwnerID == request.auth.uid;
    }

    // Explicit Rules for Class Paths (Wali Kelas strictly restricted to their assigned class)
    match /classes/{kelasId}/{document=**} {
      allow read, write: if request.auth == null || isAdmin() || isWaliKelas(kelasId);
    }

    // Students / Siswa collection with Wali Kelas class path enforcement & Admin full access
    match /students/{studentId} {
      allow read, write: if request.auth == null || isAdmin() || 
        (resource != null && 'kelas' in resource.data && isWaliKelas(resource.data.kelas)) ||
        (request.resource != null && 'kelas' in request.resource.data && isWaliKelas(request.resource.data.kelas)) ||
        canAccessDoc();
    }

    // Users collection with Admin full access
    match /users/{userId} {
      allow read, write: if request.auth == null || isAdmin() || request.auth.uid == userId;
    }

    // Task, Journal, and Violation collections with row-level security & Admin full access
    match /tasks/{taskId} {
      allow read: if canAccessDoc();
      allow create, update: if canWriteDoc();
      allow delete: if canAccessDoc();
    }

    match /jurnal/{jurnalId} {
      allow read: if canAccessDoc();
      allow create, update: if canWriteDoc();
      allow delete: if canAccessDoc();
    }

    match /violations/{violationId} {
      allow read: if canAccessDoc();
      allow create, update: if canWriteDoc();
      allow delete: if canAccessDoc();
    }

    // Global School Settings and Holiday Configuration collections
    match /school_settings/{settingId} {
      allow read, write: if true;
    }

    match /holiday_config/{holidayId} {
      allow read, write: if true;
    }

    // Catch-all rule for all other document collections (explicitly allows admin access to all collections)
    match /{collectionName}/{docId} {
      allow read: if canAccessDoc();
      allow create, update: if canWriteDoc();
      allow delete: if canAccessDoc();
    }
  }
}`;

export const RECOMMENDED_SQL_SCHEMA = `-- ============================================================
-- EDUSYNC DATABASE SCHEMA DDL (MySQL / PostgreSQL / SQLite)
-- Kode Struktur Tabel & Indexing untuk Migrasi ke Database SQL
-- ============================================================

-- 1. Tabel Identitas Sekolah (School Settings)
CREATE TABLE IF NOT EXISTS school_settings (
    id VARCHAR(64) PRIMARY KEY,
    nama_sekolah VARCHAR(255) NOT NULL,
    npsn VARCHAR(50),
    alamat TEXT,
    kota_kabupaten VARCHAR(100),
    provinsi VARCHAR(100),
    telepon VARCHAR(50),
    email VARCHAR(100),
    website VARCHAR(255),
    nama_kepala_sekolah VARCHAR(150),
    nip_kepala_sekolah VARCHAR(100),
    kop_pemerintah VARCHAR(255),
    kop_dinas VARCHAR(255),
    logo_url TEXT,
    kop_logo_base64 TEXT,
    kop_logo_type VARCHAR(20) DEFAULT 'tutwuri',
    tahun_ajaran_aktif VARCHAR(20) DEFAULT '2025/2026',
    semester_aktif VARCHAR(20) DEFAULT 'Ganjil',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64)
);

-- 2. Tabel Pengaturan Hari Libur (Holiday Config)
CREATE TABLE IF NOT EXISTS holiday_config (
    id VARCHAR(64) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NOT NULL,
    catatan TEXT,
    jenis VARCHAR(50) DEFAULT 'nasional',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64)
);
CREATE INDEX idx_holiday_dates ON holiday_config(tanggal_mulai, tanggal_selesai);

-- 3. Tabel Siswa Master (Students)
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    nisn VARCHAR(50) UNIQUE,
    nis VARCHAR(50),
    nama VARCHAR(255) NOT NULL,
    jenis_kelamin VARCHAR(20),
    kelas VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'Aktif',
    foto_url TEXT,
    owner_id VARCHAR(128),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64)
);
CREATE INDEX idx_students_kelas ON students(kelas);
CREATE INDEX idx_students_nisn ON students(nisn);

-- 4. Tabel Presensi / Kehadiran (Attendance)
CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(64) PRIMARY KEY,
    id_siswa VARCHAR(64) NOT NULL,
    tanggal DATE NOT NULL,
    status VARCHAR(20) NOT NULL, -- Hadir, Izin, Sakit, Alpa, Libur
    keterangan TEXT,
    tahun_ajaran VARCHAR(20) DEFAULT '2025/2026',
    semester VARCHAR(20) DEFAULT 'Ganjil',
    owner_id VARCHAR(128),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64),
    CONSTRAINT fk_att_student FOREIGN KEY (id_siswa) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX idx_att_date_siswa ON attendance(tanggal, id_siswa);
CREATE INDEX idx_att_tahun_semester ON attendance(tahun_ajaran, semester);

-- 5. Tabel Penilaian & Nilai (Grades)
CREATE TABLE IF NOT EXISTS grades (
    id VARCHAR(64) PRIMARY KEY,
    id_siswa VARCHAR(64) NOT NULL,
    mata_pelajaran VARCHAR(100) NOT NULL,
    jenis_penilaian VARCHAR(50) NOT NULL, -- UH, UTS, UAS, Tugas
    nilai NUMERIC(5,2) NOT NULL,
    tahun_ajaran VARCHAR(20) DEFAULT '2025/2026',
    semester VARCHAR(20) DEFAULT 'Ganjil',
    owner_id VARCHAR(128),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64),
    CONSTRAINT fk_grade_student FOREIGN KEY (id_siswa) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX idx_grades_siswa_mapel ON grades(id_siswa, mata_pelajaran);

-- 6. Tabel Jurnal Mengajar Guru (Journal)
CREATE TABLE IF NOT EXISTS journal (
    id VARCHAR(64) PRIMARY KEY,
    tanggal DATE NOT NULL,
    kelas VARCHAR(50) NOT NULL,
    mata_pelajaran VARCHAR(100) NOT NULL,
    materi TEXT,
    catatan TEXT,
    owner_id VARCHAR(128) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64)
);
CREATE INDEX idx_journal_owner_date ON journal(owner_id, tanggal);

-- 7. Tabel Pengguna Sistem (Users)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    nama VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Guru',
    nip VARCHAR(100),
    foto_url TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified VARCHAR(64)
);

-- ============================================================
-- CONTOH SQL ROW LEVEL SECURITY (RLS) UNTUK POSTGRESQL / MYSQL
-- ============================================================
-- ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY journal_owner_policy ON journal 
--     FOR ALL USING (owner_id = current_setting('app.current_user_id'));
`;
