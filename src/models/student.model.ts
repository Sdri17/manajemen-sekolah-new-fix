import { v4 as uuidv4 } from 'uuid';

export interface Student {
  id: string;
  no: number;
  nama: string;
  nisn: string;
  nipd: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  kelas: string;
  nama_ayah: string;
  nama_ibu: string;
  no_telp_ortu: string;
  nama_orang_tua?: string; // Name of parent / guardian
  jenis_kelamin?: string;   // Gender
  nomor_telepon?: string;   // Phone number / contact
  semester?: string; // Filterable by selected semester ID
  tanggal_lulus?: string; // Graduation date
  tahun_ajaran_lulus?: string; // School year graduated
  [key: string]: any; // Support custom columns dynamically
}

export function normalizeStudentHelper(s: any): Student {
  if (!s) return s;
  const student = { ...s };

  // Helper to extract value from any case/variation of a key
  const getValue = (keys: string[]): any => {
    for (const key of keys) {
      if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
        return s[key];
      }
      const normKey = key.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      for (const [k, v] of Object.entries(s)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (normK === normKey && v !== undefined && v !== null && v !== '') {
          return v;
        }
      }
    }
    return undefined;
  };

  const id = getValue(['id', 'id_siswa', 'uuid']) || s.id;
  const no = getValue(['no', 'no_urut', 'nomor']) || s.no;
  const nama = getValue(['nama', 'nama_lengkap', 'nama_siswa']) || s.nama;
  const nisn = getValue(['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'nomor_induk', 'ni', 'no_nisn', 'nomor_nisn', 'no_induk_nasional', 'nomor_induk_nasional']) || s.nisn;
  const nipd = getValue(['nipd', 'nipd_siswa']) || s.nipd;
  const tempat_lahir = getValue(['tempat_lahir', 'tempat', 'tpt_lahir']) || s.tempat_lahir;
  const tanggal_lahir = getValue(['tanggal_lahir', 'tgl_lahir']) || s.tanggal_lahir;
  const kelas = getValue(['kelas', 'nama_kelas', 'rombel', 'ruang', 'rombongan_belajar', 'kelas_siswa', 'kelas_tingkat', 'tingkat']) || s.kelas;
  const nama_ayah = getValue(['nama_ayah', 'ayah']) || s.nama_ayah;
  const nama_ibu = getValue(['nama_ibu', 'ibu']) || s.nama_ibu;
  const no_telp_ortu = getValue(['no_telp_ortu', 'nomor_telepon', 'no_telp', 'nomor_hp', 'no_hp', 'telp', 'telepon', 'hp']) || s.no_telp_ortu;
  const semester = getValue(['semester', 'smstr']) || s.semester;
  
  let jenis_kelamin = getValue(['jenis_kelamin', 'jk', 'gender', 'sex', 'l_p', 'lp', 'kelamin']) || s.jenis_kelamin;
  if (jenis_kelamin) {
    const jkLower = String(jenis_kelamin).trim().toLowerCase();
    if (jkLower === 'l' || jkLower.startsWith('laki') || jkLower === 'laki-laki' || jkLower === 'lakilaki') {
      jenis_kelamin = 'Laki-laki';
    } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita') || jkLower === 'perempuan') {
      jenis_kelamin = 'Perempuan';
    }
  }

  let nama_orang_tua = getValue(['nama_orang_tua', 'nama_ortu', 'orang_tua', 'nama_wali', 'wali', 'ayah_ibu']) || s.nama_orang_tua;
  if (!nama_orang_tua && (nama_ayah || nama_ibu)) {
    nama_orang_tua = [nama_ayah, nama_ibu].filter(Boolean).join(' / ');
  }
  if (nama_orang_tua && !nama_ayah && !nama_ibu) {
    const parts = String(nama_orang_tua).split('/');
    if (parts.length >= 1) {
      student.nama_ayah = parts[0].trim();
      if (parts.length >= 2) student.nama_ibu = parts[1].trim();
    }
  }

  const cleanNisn = nisn ? String(nisn).trim() : '';
  const cleanId = id ? String(id).trim() : '';
  const primaryId = (cleanNisn && cleanNisn !== '-') ? cleanNisn : (cleanId || uuidv4());

  student.id = primaryId;
  student.no = parseInt(no) || 0;
  student.nama = nama ? String(nama).trim() : '';
  student.nisn = cleanNisn;
  student.nipd = nipd ? String(nipd).trim() : '';
  student.tempat_lahir = tempat_lahir ? String(tempat_lahir).trim() : '';
  student.tanggal_lahir = tanggal_lahir ? String(tanggal_lahir).trim() : '';
  student.kelas = kelas ? String(kelas).trim() : '';
  student.nama_ayah = nama_ayah ? String(student.nama_ayah || nama_ayah).trim() : '';
  student.nama_ibu = nama_ibu ? String(student.nama_ibu || nama_ibu).trim() : '';
  student.no_telp_ortu = no_telp_ortu ? String(no_telp_ortu).trim() : '';
  student.nomor_telepon = student.no_telp_ortu;
  student.semester = semester ? String(semester).trim() : '';
  student.jenis_kelamin = jenis_kelamin ? String(jenis_kelamin).trim() : '';
  student.nama_orang_tua = nama_orang_tua ? String(nama_orang_tua).trim() : '';

  student.ID = student.id;
  student.No = student.no;
  student.Nama = student.nama;
  student.NISN = student.nisn;
  student.NIPD = student.nipd;
  student.Kelas = student.kelas;
  student.Semester = student.semester;
  student['Tempat Lahir'] = student.tempat_lahir;
  student['Tanggal Lahir'] = student.tanggal_lahir;
  student['Nama Ayah'] = student.nama_ayah;
  student['Nama Ibu'] = student.nama_ibu;
  student['No Telp Ortu'] = student.no_telp_ortu;
  student['Jenis Kelamin'] = student.jenis_kelamin;
  student['jenis_kelamin'] = student.jenis_kelamin;
  student['nama_orang_tua'] = student.nama_orang_tua;

  return student;
}
