import { CustomHoliday, BreakTimeConfig } from './journal.model';

export interface SchoolSettings {
  id: string;
  nama_sekolah: string;
  npsn?: string;
  alamat?: string;
  kota_kabupaten?: string;
  provinsi?: string;
  telepon?: string;
  email?: string;
  website?: string;
  nama_kepala_sekolah?: string;
  nip_kepala_sekolah?: string;
  kop_pemerintah?: string;
  kop_dinas?: string;
  logo_url?: string;
  kop_logo_base64?: string;
  kop_logo_type?: 'tutwuri' | 'custom' | 'none';
  tahun_ajaran_aktif?: string;
  semester_aktif?: string;
  updatedAt?: string;
  lastModified?: string;
}

export interface HolidayConfig {
  id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  catatan?: string;
  jenis?: 'nasional' | 'semester' | 'cuti_bersama' | 'khusus';
  lastModified?: string;
  updatedAt?: string;
}

export interface Settings {
  nama_sekolah: string;
  npsn?: string;
  alamat?: string;
  email?: string;
  nama_kepala_sekolah?: string;
  nip_kepala_sekolah?: string;
  nama_kelas: string;
  nama_wali_kelas?: string;
  nip_wali_kelas?: string;
  semester_aktif: string;
  daftar_semester?: string[];
  mata_pelajaran: string[];
  urutan_mata_pelajaran_rapor?: string[];
  bobot_harian: number;
  bobot_tugas: number;
  bobot_ujian: number;
  bobot_harian_bulanan?: number;
  bobot_tugas_bulanan?: number;
  bobot_ujian_bulanan?: number;
  include_harian_bulanan?: boolean;
  include_tugas_bulanan?: boolean;
  include_ujian_bulanan?: boolean;
  kkm_bulanan?: number;
  kkm_mode?: 'kolektif' | 'per_mapel';
  kkm_per_mapel?: Record<string, number>;
  include_harian?: boolean;
  include_tugas?: boolean;
  include_ujian?: boolean;
  custom_student_columns?: string[];
  holidays?: CustomHoliday[];
  kop_pemerintah?: string;
  kop_dinas?: string;
  kop_logo_type?: 'tutwuri' | 'custom' | 'none';
  kop_logo_base64?: string;
  tampilkan_kop_surat?: boolean;
  show_ttd_kepsek?: boolean;
  catatan_wali_kelas_templates?: string[];
  capaian_kompetensi_templates?: string[];
  pilihan_mata_pelajaran?: string[];
  jumlah_piket_harian?: number;
  hari_sekolah?: 5 | 6;
  durasi_jp_menit?: number;
  jam_mulai_sekolah?: string;
  waktu_istirahat?: BreakTimeConfig[];
  daftar_kelas?: string[];
  wa_group_links?: Record<string, string>;
  student_column_map?: Record<string, string>;
  attendance_column_map?: Record<string, string>;
  grade_column_map?: Record<string, string>;
}

export const defaultSettings: Settings = {
  nama_sekolah: '',
  npsn: '',
  alamat: '',
  email: '',
  nama_kepala_sekolah: '',
  nip_kepala_sekolah: '',
  nama_kelas: '',
  nama_wali_kelas: '',
  nip_wali_kelas: '',
  semester_aktif: 'Ganjil 2026',
  daftar_semester: ['Ganjil 2026', 'Genap 2026'],
  daftar_kelas: [],
  mata_pelajaran: [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila dan Kewarganegaraan',
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam dan Sosial',
    'Seni Musik',
    'Seni Tari',
    'Seni Rupa',
    'Seni Teater',
    'Pendidikan Jasmani, Olahraga dan Kesehatan',
    'Bahasa Inggris',
    'Bahasa Daerah Batak Toba'
  ],
  pilihan_mata_pelajaran: [
    'Seni Musik',
    'Seni Tari',
    'Seni Rupa',
    'Seni Teater'
  ],
  jumlah_piket_harian: 5,
  hari_sekolah: 5,
  durasi_jp_menit: 35,
  jam_mulai_sekolah: '08:00',
  waktu_istirahat: [
    { id: 'ist_1', nama: 'I S T I R A H A T', jam_mulai: '09:45', jam_selesai: '10:00' },
    { id: 'ist_2', nama: 'I S T I R A H A T', jam_mulai: '11:45', jam_selesai: '12:15' }
  ],
  bobot_harian: 30,
  bobot_tugas: 30,
  bobot_ujian: 40,
  bobot_harian_bulanan: 50,
  bobot_tugas_bulanan: 50,
  bobot_ujian_bulanan: 0,
  include_harian: true,
  include_tugas: true,
  include_ujian: true,
  include_harian_bulanan: true,
  include_tugas_bulanan: true,
  include_ujian_bulanan: false,
  kkm_bulanan: 75,
  kkm_mode: 'kolektif',
  kkm_per_mapel: {},
  custom_student_columns: [],
  holidays: [],
  kop_pemerintah: 'PEMERINTAH KOTA / KABUPATEN',
  kop_dinas: 'DINAS PENDIDIKAN DAN KEBUDAYAAN',
  kop_logo_type: 'tutwuri',
  kop_logo_base64: '',
  tampilkan_kop_surat: true,
  catatan_wali_kelas_templates: [
    "Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi inspirasi bagi teman-temanmu.",
    "Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan, fokus belajar di kelas, dan kurangi hal-hal yang dapat mengalihkan konsentrasimu.",
    "Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan tingkatkan kehadiranmu di kelas.",
    "Ananda menunjukkan sikap yang sangat baik dan aktif dalam setiap pembelajaran. Pertahankan semangat ini di semester berikutnya!",
    "Terus asah bakat dan minatmu, baik akademik maupun non-akademik. Semangat belajar harus tetap menyala demi masa depan yang gemilang!"
  ],
  capaian_kompetensi_templates: [
    "Menunjukkan penguasaan kompetensi yang sangat baik dalam memahami konsep-konsep materi serta mampu menerapkannya dalam tugas-tugas harian dengan mandiri.",
    "Perlu bimbingan dan pendampingan yang lebih tekun terutama dalam menganalisis soal cerita dan menerapkan teori ke dalam praktik pembelajaran.",
    "Memiliki kemauan belajar yang tinggi, sangat baik dalam berdiskusi kelompok, serta aktif berpartisipasi menyampaikan ide-ide kreatif di kelas.",
    "Menunjukkan pemahaman yang stabil di semua mata pelajaran, dengan kemampuan berpikir kritis yang terus berkembang dari waktu ke waktu.",
    "Secara umum telah mencapai kriteria ketuntasan minimal, namun masih memerlukan latihan tambahan untuk memperkuat pemahaman konsep dasar yang esensial."
  ],
};
