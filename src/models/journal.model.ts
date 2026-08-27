export interface CustomHoliday {
  id: string;
  nama: string;
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string; // YYYY-MM-DD
  jenis: 'kolektif' | 'perhari';
  catatan?: string;
}

export interface RosterItem {
  id: string;
  hari: string; // e.g. "Senin", "Selasa"
  jam_mulai: string; // e.g. "07:30"
  jam_selesai: string; // e.g. "08:10"
  mata_pelajaran: string;
  guru?: string;
  kelas: string;
  semester: string;
}

export interface PiketItem {
  id: string;
  hari: string; // e.g. "Senin", "Selasa"
  id_siswa: string;
  kelas: string;
  semester: string;
}

export interface JurnalEntry {
  id: string;
  OwnerID?: string;
  ownerId?: string;
  tanggal: string; // YYYY-MM-DD
  jenis: 'Kejadian Kelas' | 'Pelanggaran' | 'Prestasi' | 'Catatan Karakter';
  kategori?: string;
  id_siswa?: string;
  nama_siswa?: string;
  kelas: string;
  semester: string;
  catatan: string;
  tindakan?: string;
  poin?: number;
  ditindaklanjuti?: boolean;
}

export interface BreakTimeConfig {
  id: string;
  nama: string;
  jam_mulai: string;
  jam_selesai: string;
}
