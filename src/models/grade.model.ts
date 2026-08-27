export interface Grade {
  id: string;
  id_siswa: string;
  jenis_nilai: 'Harian' | 'Tugas' | 'Ujian';
  nama_kolom: string; // e.g., "Tugas 1", "UH 1"
  nilai: number;
  semester: string;
  mata_pelajaran?: string;
  tanggal?: string; // YYYY-MM-DD
  nisn?: string;
  nama?: string;
}

export interface StudentTask {
  id: string;
  OwnerID?: string;
  ownerId?: string;
  judul: string;
  mata_pelajaran: string;
  tanggal_diberikan: string; // YYYY-MM-DD
  tanggal_kumpul?: string; // YYYY-MM-DD
  semester: string;
  kelas: string;
  penyelesaian: Record<string, boolean>; // key: studentId, value: completed status
}

export function calculateWeightedGrade(
  harianAverage: number,
  tugasAverage: number,
  ujianAverage: number,
  bobotHarian: number = 30,
  bobotTugas: number = 30,
  bobotUjian: number = 40
): number {
  const totalWeight = (bobotHarian || 0) + (bobotTugas || 0) + (bobotUjian || 0);
  if (totalWeight <= 0) return 0;

  const weightedSum =
    (harianAverage * (bobotHarian || 0)) +
    (tugasAverage * (bobotTugas || 0)) +
    (ujianAverage * (bobotUjian || 0));

  const result = weightedSum / totalWeight;
  return isNaN(result) ? 0 : Math.round(result * 100) / 100;
}
