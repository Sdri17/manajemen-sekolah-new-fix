export interface KasActivityLog {
  id: string;
  kas_id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete';
  action_label: 'Menginput' | 'Mengedit' | 'Menghapus';
  user: string;
  user_role?: string;
  keterangan_transaksi: string;
  nominal: number;
  jenis: 'masuk' | 'keluar';
  details?: string;
}

export interface KasEntry {
  id: string;
  jenis: 'masuk' | 'keluar'; // Pemasukan vs Pengeluaran
  tanggal: string; // YYYY-MM-DD
  nominal: number;
  keterangan: string;
  kategori: string;
  id_siswa?: string;
  nama_siswa?: string;
  kelas: string;
  semester: string;
  penerima_pencatat?: string;
  metode_pembayaran?: 'Tunai' | 'Transfer' | 'QRIS' | 'Lainnya';
  created_at?: string;
  updated_at?: string;
  last_modified_by?: string;
  history?: KasActivityLog[];
}

export interface KasSummary {
  totalMasuk: number;
  totalKeluar: number;
  saldoAkhir: number;
}

export function calculateKasSummary(entries: KasEntry[]): KasSummary {
  let totalMasuk = 0;
  let totalKeluar = 0;

  for (const entry of entries) {
    const nominal = Number(entry.nominal) || 0;
    if (entry.jenis === 'masuk') {
      totalMasuk += nominal;
    } else if (entry.jenis === 'keluar') {
      totalKeluar += nominal;
    }
  }

  const saldoAkhir = totalMasuk - totalKeluar;
  return { totalMasuk, totalKeluar, saldoAkhir };
}
