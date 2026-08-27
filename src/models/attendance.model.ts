export interface Attendance {
  id: string;
  id_siswa: string;
  tanggal: string; // YYYY-MM-DD
  status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
  semester: string;
  mata_pelajaran?: string;
  nisn?: string;
  nama?: string;
  kelas?: string;
  keterangan?: string;
  created_at?: string;
  created_by?: string;
}

export interface AttendanceSummary {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
  persentaseKehadiran: number;
}

export function calculateAttendanceStats(attendances: Attendance[]): AttendanceSummary {
  let hadir = 0, sakit = 0, izin = 0, alpa = 0;
  for (const att of attendances) {
    if (att.status === 'Hadir') hadir++;
    else if (att.status === 'Sakit') sakit++;
    else if (att.status === 'Izin') izin++;
    else if (att.status === 'Alpa') alpa++;
  }
  const total = hadir + sakit + izin + alpa;
  const persentaseKehadiran = total > 0 ? Math.round((hadir / total) * 100) : 0;
  return { hadir, sakit, izin, alpa, total, persentaseKehadiran };
}
