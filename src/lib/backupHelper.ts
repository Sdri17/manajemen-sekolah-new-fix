import { v4 as uuidv4 } from 'uuid';

export interface NormalizedBackupData {
  students?: any[];
  grades?: any[];
  attendance?: any[];
  kas?: any[];
  kasLogs?: any[];
  roster?: any[];
  piket?: any[];
  tasks?: any[];
  jurnal?: any[];
  raporCapaian?: any[];
  users?: any[];
  settings?: any;
}

/**
 * Normalizes single student object (from JSON or Excel/CSV clean row)
 * Ensures every student record has a strictly unique primary ID to prevent overwriting.
 */
export function normalizeStudentRecord(s: any, fallbackIndex = 1, usedIdsSet?: Set<string>, defaultKelas?: string): any {
  if (!s || typeof s !== 'object') return null;

  const nama = String(s.nama || s.Nama || s.nama_lengkap || s.nama_siswa || s.NamaSiswa || s.Name || '').trim();
  if (!nama || nama === '-' || nama.toLowerCase() === 'undefined' || nama.toLowerCase() === 'null') return null; // A valid student record must have a name

  const isInvalidIdStr = (val?: any) => {
    if (!val) return true;
    const str = String(val).trim().toLowerCase();
    return (
      !str || 
      str === '-' || 
      str === '0' || 
      str === '0000000000' || 
      str === 'undefined' || 
      str === 'null' || 
      str === '[object object]' || 
      str === 'none' ||
      str === 'siswa'
    );
  };

  // Extract raw candidate IDs
  const candidateId = s.id || s.ID || s._id || s.id_siswa;
  const rawNisn = String(s.nisn || s.NISN || s.nisn_siswa || s.nomor_induk_siswa_nasional || s.nomor_induk || s.no_nisn || s.nomor_nisn || s.ID || s.id || '').trim();
  
  let candidatePrimary = !isInvalidIdStr(candidateId) 
    ? String(candidateId).trim() 
    : (!isInvalidIdStr(rawNisn) ? rawNisn : '');

  let isIdReassigned = false;
  let finalId = candidatePrimary;

  // If candidatePrimary is missing OR already used by another student in this batch, reassign to unique UUID
  if (!finalId || (usedIdsSet && usedIdsSet.has(finalId))) {
    if (finalId && usedIdsSet && usedIdsSet.has(finalId)) {
      isIdReassigned = true;
    }
    finalId = uuidv4();
  }

  if (usedIdsSet) {
    usedIdsSet.add(finalId);
  }

  const nisn = !isInvalidIdStr(rawNisn) ? rawNisn : finalId;
  let rawKelas = String(s.kelas || s.Kelas || s.nama_kelas || s.rombel || s.ruang || s.rombongan_belajar || s.kelas_siswa || s.kelas_tingkat || s.tingkat || '').trim();
  const nipd = String(s.nipd || s.NIPD || s.nipd_siswa || '').trim();
  const tempat_lahir = String(s.tempat_lahir || s['Tempat Lahir'] || s.tempat || s.tempatLahir || '').trim();
  let rawTglLahir = String(s.tanggal_lahir || s['Tanggal Lahir'] || s.tgl_lahir || s.tanggalLahir || '').trim();

  // Detect if date of birth was mistakenly mapped into kelas column during Excel import
  if (rawKelas) {
    const isDatePattern = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(rawKelas) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(rawKelas);
    if (isDatePattern) {
      if (!rawTglLahir) {
        rawTglLahir = rawKelas;
      }
      rawKelas = defaultKelas || '';
    }
  }

  if (!rawKelas && defaultKelas && defaultKelas.toLowerCase() !== 'alumni') {
    rawKelas = defaultKelas;
  }

  const kelas = rawKelas;
  const tanggal_lahir = rawTglLahir;

  let nama_ayah = String(s.nama_ayah || s['Nama Ayah'] || s.data_ayah || s.ayah || '').trim();
  let nama_ibu = String(s.nama_ibu || s['Nama Ibu'] || s.data_ibu || s.ibu || '').trim();
  let nama_orang_tua = String(s.nama_orang_tua || s['Nama Orang Tua'] || s.nama_ortu || s.orang_tua || s.nama_wali || s.wali || s.ayah_ibu || '').trim();

  if (!nama_orang_tua && (nama_ayah || nama_ibu)) {
    nama_orang_tua = [nama_ayah, nama_ibu].filter(Boolean).join(' / ');
  }
  if (nama_orang_tua && !nama_ayah && !nama_ibu) {
    nama_ayah = nama_orang_tua;
  }

  const no_telp_ortu = String(s.no_telp_ortu || s['No Telp Ortu'] || s.nomor_telepon || s.no_telp || s.nomor_hp || s.no_hp || s.telp || s.telepon || s.hp || '').trim();

  let jenis_kelamin = String(s.jenis_kelamin || s['Jenis Kelamin'] || s.jk || s.JK || s.gender || s.sex || s.l_p || s.lp || s.kelamin || '').trim();
  if (jenis_kelamin) {
    const jkLower = jenis_kelamin.toLowerCase();
    if (jkLower === 'l' || jkLower.startsWith('laki')) {
      jenis_kelamin = 'Laki-laki';
    } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita')) {
      jenis_kelamin = 'Perempuan';
    }
  }

  const semester = String(s.semester || s.Semester || '').trim();

  const studentObj: any = {
    ...s,
    id: finalId,
    no: parseInt(String(s.no || s.No || s.no_urut || '0'), 10) || fallbackIndex,
    nama,
    nisn,
    nipd,
    tempat_lahir,
    tanggal_lahir,
    kelas,
    nama_ayah,
    nama_ibu,
    nama_orang_tua,
    no_telp_ortu,
    nomor_telepon: no_telp_ortu,
    jenis_kelamin,
    semester,
    _isIdReassigned: isIdReassigned,
    _originalCandidateId: candidatePrimary
  };

  return studentObj;
}

/**
 * Robustly parses and normalizes any backup JSON payload or student list payload.
 */
export function parseAndNormalizeBackup(rawJson: any): NormalizedBackupData | null {
  if (!rawJson) return null;

  // Case 1: Raw JSON is an Array of Student Objects directly
  if (Array.isArray(rawJson)) {
    const usedIdsSet = new Set<string>();
    const validStudents = rawJson
      .map((item, idx) => normalizeStudentRecord(item, idx + 1, usedIdsSet))
      .filter(Boolean);
    if (validStudents.length > 0) {
      return { students: validStudents };
    }
    return null;
  }

  if (typeof rawJson !== 'object') return null;

  // Case 2: Unwrapping nested wrappers if present (e.g., rawJson.data, rawJson.backup, rawJson.content, rawJson.payload)
  let target: any = rawJson;
  if (rawJson.data && typeof rawJson.data === 'object' && !Array.isArray(rawJson.data)) {
    target = rawJson.data;
  } else if (rawJson.backup && typeof rawJson.backup === 'object' && !Array.isArray(rawJson.backup)) {
    target = rawJson.backup;
  } else if (rawJson.content && typeof rawJson.content === 'object' && !Array.isArray(rawJson.content)) {
    target = rawJson.content;
  }

  const result: NormalizedBackupData = {};

  // Extract collection helper (case-insensitive key matching)
  const extractCollection = (possibleKeys: string[]): any[] | undefined => {
    for (const key of possibleKeys) {
      if (Array.isArray(target[key])) return target[key];
    }
    return undefined;
  };

  // 1. Students
  const rawStudents = extractCollection(['students', 'Siswa', 'siswa', 'DaftarSiswa', 'Student', 'studentsData']);
  if (rawStudents) {
    const usedIdsSet = new Set<string>();
    result.students = rawStudents
      .map((item, idx) => normalizeStudentRecord(item, idx + 1, usedIdsSet))
      .filter(Boolean);
  }

  // 2. Grades
  const rawGrades = extractCollection(['grades', 'Grades', 'Nilai', 'nilai', 'penilaian']);
  if (rawGrades) {
    result.grades = rawGrades.map((g: any) => {
      const id = String(g.id || g.ID || g._id || uuidv4());
      return { ...g, id };
    }).filter(g => g && g.id);
  }

  // 3. Attendance
  const rawAttendance = extractCollection(['attendance', 'Attendance', 'Absensi', 'absensi', 'presensi']);
  if (rawAttendance) {
    result.attendance = rawAttendance.map((a: any) => {
      const id = String(a.id || a.ID || a._id || uuidv4());
      return { ...a, id };
    }).filter(a => a && a.id);
  }

  // 4. Kas
  const rawKas = extractCollection(['kas', 'Kas', 'kas_kelas', 'uang_kas']);
  if (rawKas) {
    result.kas = rawKas.map((k: any) => {
      const id = String(k.id || k.ID || k._id || uuidv4());
      return { ...k, id };
    }).filter(k => k && k.id);
  }

  // 5. Kas Logs
  const rawKasLogs = extractCollection(['kasLogs', 'KasLogs', 'kas_logs', 'log_kas', 'history_kas']);
  if (rawKasLogs) {
    result.kasLogs = rawKasLogs.map((kl: any) => {
      const id = String(kl.id || kl.ID || kl._id || uuidv4());
      return { ...kl, id };
    }).filter(kl => kl && kl.id);
  }

  // 6. Roster
  const rawRoster = extractCollection(['roster', 'Roster', 'jadwal', 'Jadwal', 'roster_pelajaran']);
  if (rawRoster) {
    result.roster = rawRoster.map((r: any) => {
      const id = String(r.id || r.ID || r._id || uuidv4());
      return { ...r, id };
    }).filter(r => r && r.id);
  }

  // 7. Piket
  const rawPiket = extractCollection(['piket', 'Piket', 'piket_harian', 'jadwal_piket']);
  if (rawPiket) {
    result.piket = rawPiket.map((p: any) => {
      const id = String(p.id || p.ID || p._id || uuidv4());
      return { ...p, id };
    }).filter(p => p && p.id);
  }

  // 8. Tasks
  const rawTasks = extractCollection(['tasks', 'Tasks', 'tugas', 'Tugas', 'daftar_tugas']);
  if (rawTasks) {
    result.tasks = rawTasks.map((t: any) => {
      const id = String(t.id || t.ID || t._id || uuidv4());
      return { ...t, id };
    }).filter(t => t && t.id);
  }

  // 9. Jurnal
  const rawJurnal = extractCollection(['jurnal', 'Jurnal', 'jurnal_guru', 'catatan_jurnal']);
  if (rawJurnal) {
    result.jurnal = rawJurnal.map((j: any) => {
      const id = String(j.id || j.ID || j._id || uuidv4());
      return { ...j, id };
    }).filter(j => j && j.id);
  }

  // 10. Rapor Capaian
  const rawRapor = extractCollection(['raporCapaian', 'RaporCapaian', 'rapor', 'Rapor', 'capaian_kompetensi']);
  if (rawRapor) {
    result.raporCapaian = rawRapor.map((rc: any) => {
      const id = String(rc.id || rc.ID || rc._id || uuidv4());
      return { ...rc, id };
    }).filter(rc => rc && rc.id);
  }

  // 11. Users
  const rawUsers = extractCollection(['users', 'Users', 'pengguna', 'User']);
  if (rawUsers) {
    result.users = rawUsers.map((u: any) => {
      const id = String(u.id || u.ID || u._id || uuidv4());
      return { ...u, id };
    }).filter(u => u && u.id);
  }

  // 12. Settings
  const rawSettings = target.settings || target.Settings || target.pengaturan;
  if (rawSettings && typeof rawSettings === 'object') {
    result.settings = rawSettings;
  }

  const hasAnyKey = Object.keys(result).length > 0;
  return hasAnyKey ? result : null;
}
