import React, { useState } from 'react';
import { 
  BookOpen, 
  Users, 
  FileSpreadsheet, 
  CheckSquare, 
  ClipboardList, 
  Calendar, 
  Download, 
  Settings, 
  Cloud, 
  LayoutDashboard, 
  School, 
  Search, 
  Compass, 
  ArrowRight,
  Info,
  Phone,
  MessageCircle,
  FileText,
  HelpCircle,
  Wallet
} from 'lucide-react';

interface DocSection {
  id: string;
  title: string;
  category: 'core' | 'class_mgmt' | 'system';
  icon: any;
  color: string;
  description: string;
  features: string[];
  howToUse: string[];
  tips: string[];
}

export default function Dokumentasi() {
  const [activeTab, setActiveTab] = useState<'all' | 'core' | 'class_mgmt' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const sections: DocSection[] = [
    {
      id: 'dashboard',
      title: 'Dashboard Utama Wali Kelas & Statistik Visual',
      category: 'core',
      icon: LayoutDashboard,
      color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5',
      description: 'Pusat kendali wali kelas yang mendeteksi dini kondisi akademik, dilengkapi grafik statistik absensi dan sistem pengingat tenggat waktu administratif.',
      features: [
        'Ringkasan jumlah siswa aktif di kelas secara akurat.',
        'Kalkulasi rata-rata kehadiran mingguan kelas.',
        'Dashboard Statistik Absensi visual berbasis grafik batang (Bar Chart) dan grafik lingkaran (Pie Chart) Recharts.',
        'Sistem Pengingat (Notification Alert) penginputan nilai & tenggat tugas administratif kelas.',
        'Sistem Deteksi Dini (Early Warning) otomatis mendeteksi siswa butuh perhatian khusus.',
        'Penyaringan otomatis siswa dengan nilai di bawah KKM (< 75).',
        'Penyaringan otomatis siswa dengan persentase kehadiran di bawah target (< 80%).',
        'Fitur Hubungi Orang Tua instan melalui integrasi Telepon atau WhatsApp otomatis.'
      ],
      howToUse: [
        'Buka menu Dashboard saat pertama kali masuk aplikasi.',
        'Pantau bagian "Siswa Perlu Perhatian" untuk mendeteksi siswa yang nilainya bermasalah atau kehadirannya kritis.',
        'Klik tombol "Hubungi Wali" pada nama siswa untuk menampilkan informasi wali kelas dan tombol kontak instan.'
      ],
      tips: [
        'Hubungi wali murid segera setelah sistem mendeteksi kehadiran di bawah 80% untuk meminimalisir risiko ketertinggalan pelajaran.'
      ]
    },
    {
      id: 'siswa',
      title: 'Data Siswa & Manajemen Kelas',
      category: 'class_mgmt',
      icon: Users,
      color: 'text-sky-400 border-sky-500/20 bg-sky-500/5',
      description: 'Manajemen basis data induk siswa, pengelolaan siswa aktif, dan pencatatan alumni.',
      features: [
        'Formulir pendaftaran siswa baru lengkap dengan NISN, NIPD, Tempat & Tanggal Lahir, serta Kontak Wali.',
        'Pencatatan data Orang Tua/Wali (Nama Ayah, Nama Ibu, No. Telepon).',
        'Dukungan penambahan kolom data kustom (custom columns) dinamis sesuai kebutuhan sekolah.',
        'Manajemen perpindahan siswa ke kategori Alumni setelah kelulusan.'
      ],
      howToUse: [
        'Gunakan formulir di bagian kiri halaman untuk menginput data siswa baru.',
        'Klik tombol edit (ikon pensil) pada baris tabel untuk memperbarui data siswa.',
        'Gunakan opsi "Pindahkan ke Alumni" di pengeditan siswa untuk menandai kelulusan siswa.'
      ],
      tips: [
        'Anda dapat menambah kolom kustom di menu Pengaturan (seperti: "Tingkat Minat", "Hobi", dll) yang akan otomatis muncul pada formulir dan tabel data siswa.'
      ]
    },
    {
      id: 'absensi',
      title: 'Absensi Kehadiran Siswa',
      category: 'class_mgmt',
      icon: CheckSquare,
      color: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
      description: 'Pencatatan kehadiran harian siswa yang terintegrasi dengan deteksi persentase minimal kelas.',
      features: [
        'Pengisian presensi harian secara cepat per tanggal dan mata pelajaran (Hadir, Sakit, Izin, Alpa).',
        'Pengubahan status kehadiran massal secara instan (Sakit semua, Hadir semua).',
        'Rekapitulasi persentase kehadiran individual dalam rentang waktu tertentu.',
        'Tanda peringatan merah otomatis apabila kehadiran siswa di bawah batas minimum (default: 80%).'
      ],
      howToUse: [
        'Masuk ke sub-menu Absensi di bawah kategori Pengelolaan Kelas.',
        'Pilih tanggal dan mata pelajaran, lalu tentukan status kehadiran masing-masing siswa.',
        'Klik "Simpan Kehadiran" untuk merekam data.',
        'Buka tab "Rekap Kehadiran" untuk memantau akumulasi kehadiran kelas dan mengidentifikasi absensi bermasalah.'
      ],
      tips: [
        'Batas target minimal kehadiran dapat disesuaikan di menu Pengaturan agar penandaan merah di lembar absensi sesuai kebijakan sekolah Anda.'
      ]
    },
    {
      id: 'nilai',
      title: 'Daftar Nilai Akademik',
      category: 'class_mgmt',
      icon: FileSpreadsheet,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
      description: 'Pencatatan nilai harian, tugas, dan ujian siswa yang dilengkapi dengan kalkulasi nilai akhir otomatis.',
      features: [
        'Pengelompokan jenis nilai yang terstruktur: Nilai Harian, Nilai Tugas, dan Nilai Ujian.',
        'Fleksibilitas penambahan kolom penilaian tak terbatas (Contoh: "Ulangan Harian 1", "Tugas Mandiri 3", dll).',
        'Kalkulasi otomatis Nilai Akhir (NA) berdasarkan bobot kontribusi nilai yang diatur pengguna.',
        'Ekspor langsung ke berkas Excel spreadsheet dan dokumen cetak PDF.'
      ],
      howToUse: [
        'Buka sub-menu Nilai, lalu tentukan Mata Pelajaran yang akan dinilai.',
        'Klik tombol "Kolom Baru" untuk menambahkan kolom penilaian baru.',
        'Ketikkan nilai siswa langsung ke dalam sel tabel. Nilai akan otomatis tersimpan ketika kursor berpindah sel.',
        'Pindah ke tab "Nilai Akhir" untuk melihat hasil kalkulasi nilai rata-rata dan status kelulusan KKM.'
      ],
      tips: [
        'Tekan tombol Tab atau Enter di keyboard Anda untuk berpindah sel nilai dengan cepat saat melakukan input massal.'
      ]
    },
    {
      id: 'tugas',
      title: 'Manajemen Tugas Siswa',
      category: 'class_mgmt',
      icon: ClipboardList,
      color: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
      description: 'Modul khusus penugasan mandiri siswa guna melacak kemajuan pengumpulan tugas secara real-time.',
      features: [
        'Pembuatan instruksi tugas lengkap dengan Mata Pelajaran, Kelas, Tanggal Diberikan, dan Tanggal Tenggat.',
        'Checklist pelacakan pengumpulan tugas individual yang intuitif.',
        'Sistem penandaan status penyelesaian massal ("Selesai Semua" atau "Belum Selesai Semua").',
        'Bilah kemajuan (progress bar) persentase penyelesaian tugas kelas secara real-time.',
        'Tab Rekapitulasi & Laporan Tugas terpadu dilengkapi filter Rentang Waktu, Mata Pelajaran, dan Kelas.',
        'Dukungan fitur Cetak Laporan Rekap Tugas dan tombol Hapus Tugas.'
      ],
      howToUse: [
        'Buka sub-menu Manajemen Tugas.',
        'Klik "Buat Tugas Baru" dan lengkapi detail penugasan.',
        'Pilih tugas pada bilah kiri, lalu klik nama siswa pada daftar di kanan untuk menandai status pengumpulan (Selesai/Belum).',
        'Buka tab "Laporan & Rekapitulasi" untuk menyaring rekap tugas berdasarkan tanggal dan mencetaknya langsung.'
      ],
      tips: [
        'Gunakan tombol "Selesai Semua" terlebih dahulu jika mayoritas siswa telah mengumpulkan tugas, lalu hapus tanda checklist secara manual pada siswa yang belum mengumpulkan untuk menghemat waktu.'
      ]
    },
    {
      id: 'roster_piket',
      title: 'Roster Pelajaran & Piket Harian',
      category: 'class_mgmt',
      icon: Calendar,
      color: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
      description: 'Pengaturan jadwal kegiatan mingguan kelas yang mencakup jadwal pelajaran dan pembagian regu piket harian.',
      features: [
        'Pencatatan Roster Pelajaran mingguan (Senin sampai Sabtu) lengkap dengan Jam dan Nama Guru pengampu.',
        'Visualisasi jadwal harian kelas yang bersih dan rapi.',
        'Pembagian siswa ke dalam Regu Piket Harian kelas secara merata.',
        'Penyelarasan otomatis data roster dan piket dengan sistem cloud.'
      ],
      howToUse: [
        'Buka sub-menu Roster & Piket.',
        'Untuk Roster Pelajaran: klik "Tambah Roster", isi hari, jam, mata pelajaran, serta guru pengampu, lalu klik Simpan.',
        'Untuk Piket Kelas: pilih hari, lalu pilih nama siswa dari dropdown untuk ditambahkan ke dalam regu piket hari tersebut.'
      ],
      tips: [
        'Jadwal roster dan piket ini juga akan tercetak secara dinamis pada laporan profil kelas.'
      ]
    },
    {
      id: 'kas_kelas',
      title: 'Pengelolaan Uang KAS Kelas',
      category: 'class_mgmt',
      icon: Wallet,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
      description: 'Fitur keuangan terpadu untuk mengelola uang masuk siswa, pengeluaran kelas, rekapitulasi, dan laporan kas transparan.',
      features: [
        'Pencatatan Uang Masuk per Siswa dengan nominal kustom, tanggal transaksi, dan metode pembayaran.',
        'Fitur Setor KAS Massal (Batch Input) untuk mencatat pembayaran kas seluruh siswa kelas sekaligus.',
        'Pencatatan Pengeluaran Kelas lengkap dengan kategori (Perlengkapan, Acara, Sosial, Kebersihan, Dll) dan tanggal pengeluaran.',
        'Rekapitulasi Keuangan Kelas (Saldo Akhir, Total Pemasukan, Total Pengeluaran, dan Tingkat Partisipasi Siswa).',
        'Visualisasi Arus Kas Bulanan dan Grafik Distribusi Pengeluaran.',
        'Laporan Kas Terpadu dengan filter jenis transaksi, rentang tanggal, dan pencarian teks.',
        'Ekspor Laporan Kas ke format CSV dan Cetak Berkas Laporan Kas PDF.'
      ],
      howToUse: [
        'Buka menu Pengelolaan Kelas -> Kas Kelas dari navigasi utama.',
        'Pilih tab "Setor per Siswa" atau "Setor Massal" untuk mencatat pemasukan kas.',
        'Pilih tab "Pengeluaran" untuk mencatat belanja atau pengeluaran kas kelas.',
        'Gunakan filter di bagian "Laporan & Riwayat Transaksi" untuk menyaring data berdasarkan tanggal atau jenis transaksi.',
        'Klik tombol "Cetak PDF" atau "Ekspor CSV" untuk mengunduh laporan keuangan.'
      ],
      tips: [
        'Gunakan fitur Setor Massal setiap minggunya untuk mempercepat penginputan uang kas seluruh siswa kelas.'
      ]
    },
    {
      id: 'rapor',
      title: 'Pencetakan Rapor Siswa',
      category: 'system',
      icon: FileText,
      color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
      description: 'Pusat pengisian catatan non-akademik dan pengunduhan lembar hasil belajar siswa (Rapor) berstandar PDF.',
      features: [
        'Pengisian Catatan Wali Kelas, Capaian Kompetensi, dan Saran Orang Tua.',
        'Pencatatan perkembangan fisik siswa (Tinggi Badan & Berat Badan).',
        'Pencatatan kondisi kesehatan panca indera siswa (Penglihatan, Pendengaran, Gigi).',
        'Pembuatan dokumen cetak Rapor PDF resmi yang rapi dan profesional.'
      ],
      howToUse: [
        'Pilih menu Rapor (PDF) dari sidebar.',
        'Pilih nama siswa yang ingin diproses.',
        'Lengkapi formulir capaian, catatan perkembangan, dan kesehatan fisik.',
        'Klik "Simpan Catatan Rapor" untuk menyimpan.',
        'Klik "Unduh Rapor PDF" untuk mencetak berkas rapor siswa tersebut.'
      ],
      tips: [
        'Pastikan data nilai akademik siswa pada menu Nilai telah lengkap sebelum mencetak Rapor PDF agar grafik nilai akhir terisi secara otomatis.'
      ]
    },
    {
      id: 'sinkronisasi',
      title: 'Sinkronisasi Cloud (Firebase)',
      category: 'system',
      icon: Cloud,
      color: 'text-pink-400 border-pink-500/20 bg-pink-500/5',
      description: 'Teknologi sinkronisasi database real-time cloud berbasis Firebase Cloud Firestore.',
      features: [
        'Penyimpanan cadangan (backup) otomatis & real-time seluruh data aplikasi ke Cloud Firestore.',
        'Sinkronisasi dua arah real-time antara IndexedDB lokal dan Cloud Firebase.',
        'Fitur Unggah & Sinkronkan (unggah seluruh data lokal ke cloud) dan Pemulihan Otomatis.',
        'Keamanan data terjamin dengan otentikasi & enkripsi Firebase Cloud.'
      ],
      howToUse: [
        'Sinkronisasi berjalan secara otomatis saat perangkat terhubung ke internet.',
        'Status penyelarasan data dapat dipantau dari indikator sinyal dan ikon Cloud pada header.',
        'Untuk melakukan sinkronisasi ulang manual, buka menu Pengaturan > tab Firebase Cloud Sync lalu klik "Unggah & Sinkronkan Data".'
      ],
      tips: [
        'Data Anda tetap tersimpan aman secara offline di browser dan akan disinkronkan otomatis saat kembali online.'
      ]
    },
    {
      id: 'filter_absen_dashboard',
      title: 'Filter Date-Range & Statistik Grafik Absensi Dashboard',
      category: 'core',
      icon: LayoutDashboard,
      color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5',
      description: 'Fitur pemfilteran grafik statistik absensi dan tren kehadiran siswa berdasarkan rentang waktu fleksibel (Mingguan, Bulanan, Semester, atau Kustom Tanggal).',
      features: [
        'Selektor rentang waktu langsung di kartu statistik "Distribusi Kehadiran Siswa".',
        'Pilihan preset cepat: Semester Ini, Minggu Ini, Bulan Ini, dan Hari Ini.',
        'Date-picker Kustom untuk memilih tanggal awal dan akhir spesifik.',
        'Pembaruan real-time pada Grafik Lingkaran (Pie Chart) dan Analisis Tren Kehadiran.'
      ],
      howToUse: [
        'Buka menu Dashboard Utama.',
        'Pada kartu "Distribusi Kehadiran Siswa", pilih rentang waktu yang diinginkan dari menu drop-down.',
        'Jika memilih "Kustom Date", tentukan tanggal mulai dan tanggal selesai pada kotak tanggal yang muncul.',
        'Grafik akan menyesuaikan persentase kehadiran secara otomatis sesuai rentang yang dipilih.'
      ],
      tips: [
        'Gunakan filter "Minggu Ini" untuk mengevaluasi kehadiran mingguan kelas sebelum rapat koordinasi.'
      ]
    },
    {
      id: 'indikator_simpan_header',
      title: 'Indikator Status Penyimpanan & Sinkronisasi Real-Time',
      category: 'system',
      icon: Download,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
      description: 'Indikator visual pintar pada header aplikasi yang memberi kepastian status data Anda setiap kali terjadi perubahan.',
      features: [
        'Status "Menyimpan ke Cloud..." dengan animasi saat data sedang diunggah.',
        'Status "Tersimpan di Lokal (X Perubahan)" saat data disimpan aman di penyimpanan lokal sebelum tersinkron.',
        'Status "Tersimpan & Sinkron" dengan tanda hijau saat seluruh data telah 100% sinkron dengan Firebase Cloud.',
        'Pembaruan otomatis tanpa perlu refresh halaman.'
      ],
      howToUse: [
        'Perhatikan bagian kanan header atas di samping tombol mode tampilan.',
        'Badge status akan otomatis berubah warna dan teks sesuai aktivitas penyimpanan data.'
      ],
      tips: [
        'Data Anda selalu tersimpan secara otomatis di browser bahkan saat offline.'
      ]
    },
    {
      id: 'mode_baca_kepsek',
      title: 'Hak Akses & Mode Baca Saja Kepala Sekolah (Read-Only)',
      category: 'system',
      icon: BookOpen,
      color: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
      description: 'Sistem otorisasi khusus untuk akun Kepala Sekolah agar dapat memantau seluruh laporan tanpa risiko mengubah data.',
      features: [
        'Label "Mode Baca Saja" di header saat login sebagai Kepala Sekolah.',
        'Akses penuh ke semua menu pemantauan, grafik statistik, rekap nilai, absensi, dan jurnal.',
        'Penyembunyian dan penonaktifan otomatis seluruh tombol Tambah, Edit, Hapus, dan Form Input.',
        'Kemampuan mengunduh laporan PDF dan Excel secara bebas.'
      ],
      howToUse: [
        'Login menggunakan akun Kepala Sekolah (kepsek).',
        'Navigasi ke menu manapun untuk melihat ringkasan data dan mengekspor laporan.'
      ],
      tips: [
        'Kepala Sekolah dapat mengekspor rekap nilai atau laporan absensi kapan saja tanpa khawatir merusak data guru.'
      ]
    },
    {
      id: 'ekspor_pdf_ttd',
      title: 'Ekspor Dokumen PDF & Sakelar TTD Kepala Sekolah',
      category: 'system',
      icon: Download,
      color: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
      description: 'Pengaturan pencetakan laporan PDF dengan sakelar opsional Tanda Tangan Kepala Sekolah dan Kop Surat resmi di semua menu.',
      features: [
        'Sakelar khusus "TTD Kepsek" di setiap menu (Data Siswa, Absensi, Nilai, Roster/Piket, Manajemen Tugas, Rapor, Ekspor Terpadu).',
        'Opsi menampilkan atau menyembunyikan blok tanda tangan "Mengetahui, Kepala Sekolah" secara fleksibel.',
        'Integrasi Kop Surat Resmi Sekolah lengkap dengan logo, alamat, NPSN, dan email.',
        'Kenyamanan Tampilan Tema Terang Redup (Soft Gray) untuk mengurangi kelelahan mata saat bekerja lama.'
      ],
      howToUse: [
        'Buka menu tempat Anda ingin mengekspor dokumen PDF (misalnya Absensi, Nilai, atau Roster).',
        'Centang atau hilangkan centang opsi "TTD Kepsek" pada bilah kontrol ekspor.',
        'Klik tombol Ekspor PDF atau Cetak untuk menghasilkan dokumen sesuai preferensi tanda tangan yang dipilih.'
      ],
      tips: [
        'Gunakan sakelar TTD Kepsek saat mencetak rekap internal harian yang tidak memerlukan pengesahan formal dari Kepala Sekolah.'
      ]
    }
  ];

  const filteredSections = sections.filter(sec => {
    const matchesTab = activeTab === 'all' || sec.category === activeTab;
    const matchesSearch = sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          sec.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          sec.features.some(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full text-slate-200">
      {/* Page Header */}
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/40 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 leading-tight">Dokumentasi Situs & Fitur Web</h2>
              <p className="text-xs text-slate-400">Panduan lengkap mengenai kapabilitas, cara operasional, dan petunjuk teknis sistem</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari dokumentasi fitur..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Quick Category Tabs */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-800/60">
            <button
              onClick={() => { setActiveTab('all'); setSelectedSection(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <Compass size={14} />
              Semua Fitur ({sections.length})
            </button>
            <button
              onClick={() => { setActiveTab('core'); setSelectedSection(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'core'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <LayoutDashboard size={14} />
              Dashboard Utama
            </button>
            <button
              onClick={() => { setActiveTab('class_mgmt'); setSelectedSection(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'class_mgmt'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <Users size={14} />
              Pengelolaan Kelas
            </button>
            <button
              onClick={() => { setActiveTab('system'); setSelectedSection(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'system'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <Settings size={14} />
              Sistem & Laporan
            </button>
          </div>

          {/* Intro Card */}
          <div className="p-5 rounded-2xl bg-slate-850/40 border border-slate-800 flex flex-col md:flex-row gap-5 items-start">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <Info size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-200">Tentang Dokumentasi Resmi Website</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Halaman Dokumentasi ini dirancang secara khusus untuk menerangkan seluruh fungsionalitas yang ada pada website <strong>EduSync Pro (Sistem Administrasi Kelas & Wali Kelas)</strong> demi menjaga kenyamanan membaca serta memisahkan aspek operasional harian guru dengan aspek teknis sinkronisasi database.
              </p>
            </div>
          </div>

          {/* Grid Layout of Features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSections.map(sec => {
              const Icon = sec.icon;
              const isSelected = selectedSection === sec.id;
              
              return (
                <div 
                  key={sec.id}
                  id={`doc-card-${sec.id}`}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isSelected 
                      ? 'bg-slate-800/50 border-indigo-500/60 ring-2 ring-indigo-500/10 col-span-2' 
                      : 'bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/30 hover:border-slate-700/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${sec.color}`}>
                          <Icon size={18} />
                        </div>
                        <h4 className="font-bold text-sm text-slate-200">{sec.title}</h4>
                      </div>
                      <span className="text-[10px] bg-slate-900/60 px-2 py-0.5 rounded-full border border-slate-800 text-slate-400 uppercase font-semibold">
                        {sec.category === 'core' ? 'Inti' : sec.category === 'class_mgmt' ? 'Kelas' : 'Sistem'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed mb-4">{sec.description}</p>

                    {isSelected && (
                      <div className="space-y-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Features List */}
                        <div className="space-y-2">
                          <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                            Fitur Utama:
                          </h5>
                          <ul className="space-y-1.5 pl-2">
                            {sec.features.map((feat, i) => (
                              <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                <span className="text-indigo-400 select-none mt-0.5">•</span>
                                <span className="leading-relaxed">{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* How To Use */}
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              Cara Menggunakan:
                            </h5>
                            <ol className="space-y-1.5 pl-2">
                              {sec.howToUse.map((step, i) => (
                                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold select-none">{i + 1}.</span>
                                  <span className="leading-relaxed">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {sec.tips.length > 0 && (
                            <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 mt-3">
                              <h6 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <HelpCircle size={10} /> Tips Tambahan:
                              </h6>
                              <p className="text-[11px] text-slate-400 leading-relaxed italic">{sec.tips[0]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => setSelectedSection(isSelected ? null : sec.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-slate-900 hover:bg-slate-950 text-slate-300 border border-slate-700/50' 
                          : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      <span>{isSelected ? 'Sembunyikan Detail' : 'Lihat Panduan & Fitur Lengkap'}</span>
                      <ArrowRight size={12} className={`transition-transform duration-300 ${isSelected ? 'rotate-90 text-slate-400' : 'group-hover:translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* General Help Footer */}
          <div className="p-6 bg-slate-900/40 rounded-2xl border border-slate-800/80 text-center space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">Butuh Bantuan Lebih Lanjut?</h4>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
              Jika Anda memiliki pertanyaan operasional lain atau memerlukan integrasi spreadsheet lanjutan, Anda dapat mengonsultasikan petunjuk teknis di menu <strong>Panduan</strong> atau menghubungi administrator sistem di sekolah Anda.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
