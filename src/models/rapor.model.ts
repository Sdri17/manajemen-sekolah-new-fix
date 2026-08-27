export interface RaporCapaian {
  id: string;
  id_siswa: string;
  semester: string;
  capaian_kompetensi: string;
  catatan_wali_kelas: string;
  saran_orang_tua?: string;
  tinggi_badan?: string;
  berat_badan?: string;
  pendengaran?: string;
  penglihatan?: string;
  gigi?: string;
  kokurikuler?: string;
  ekstra_nama_1?: string;
  ekstra_ket_1?: string;
  ekstra_nama_2?: string;
  ekstra_ket_2?: string;
  kenaikan_kelas?: string;
}

export function getGradePredicate(score: number, kkm: number = 75): { predikat: 'A' | 'B' | 'C' | 'D'; deskripsi: string } {
  if (score >= 90) {
    return { predikat: 'A', deskripsi: 'Sangat Baik' };
  } else if (score >= 80) {
    return { predikat: 'B', deskripsi: 'Baik' };
  } else if (score >= kkm) {
    return { predikat: 'C', deskripsi: 'Cukup' };
  } else {
    return { predikat: 'D', deskripsi: 'Perlu Bimbingan' };
  }
}
