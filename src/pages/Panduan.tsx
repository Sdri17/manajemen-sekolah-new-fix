import React from 'react';
import { BookOpen, Users, FileSpreadsheet, Settings, ClipboardList, AlertCircle, Wallet, Database, RotateCcw, Zap, Server } from 'lucide-react';

export default function Panduan() {
  return (
    <div className="p-8 text-slate-200 h-full overflow-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Panduan Penggunaan Aplikasi</h2>
          <p className="text-slate-400">Selamat datang di EduSync Pro. Berikut adalah panduan singkat untuk membantu Anda menggunakan aplikasi ini.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-indigo-400 flex items-center gap-2">
              <Users size={20} /> Data Siswa
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Modul ini digunakan untuk mengelola data induk siswa.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Untuk menambahkan siswa baru, isi formulir di sebelah kiri dan klik <strong>Tambah Siswa</strong>.</li>
              <li>Untuk mengedit siswa, klik tombol edit (ikon pensil) pada baris data siswa, ubah data pada formulir, lalu klik <strong>Update Siswa</strong>.</li>
              <li>Data yang ditambahkan akan otomatis tersimpan di penyimpanan lokal dan disinkronkan ke Firebase Cloud.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-emerald-400 flex items-center gap-2">
              <FileSpreadsheet size={20} /> Nilai
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Modul ini digunakan untuk mencatat dan merekap nilai siswa (Harian, Tugas, Ujian).
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Pastikan Anda telah memilih <strong>Mata Pelajaran</strong>.</li>
              <li>Klik <strong>Kolom Baru</strong> untuk menambah kolom penilaian (Misal: "UH 1").</li>
              <li>Masukkan nilai langsung pada tabel. Nilai akan otomatis tersimpan saat Anda berpindah sel.</li>
              <li>Tab <strong>Nilai Akhir</strong> akan mengkalkulasi rata-rata dan nilai akhir berdasarkan bobot di menu Pengaturan.</li>
              <li>Gunakan tombol <strong>Excel</strong> atau <strong>PDF</strong> untuk mengunduh rekapitulasi.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-rose-400 flex items-center gap-2">
              <BookOpen size={20} /> Absensi
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gunakan modul ini untuk mencatat kehadiran harian.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Pada tab <strong>Harian</strong>, pilih tanggal dan mata pelajaran, lalu tandai kehadiran (Hadir, Sakit, Izin, Alpa).</li>
              <li>Klik <strong>Simpan</strong> untuk merekam data kehadiran.</li>
              <li>Pada tab <strong>Rekap</strong>, Anda dapat melihat akumulasi kehadiran berdasarkan filter (Hari Ini, Bulan Ini, Semester, Kustom).</li>
              <li><strong>Notifikasi Kehadiran Rendah:</strong> Anda dapat menyesuaikan persentase target kehadiran minimum (default 80%). Siswa yang kehadirannya di bawah target akan otomatis ditandai merah beserta peringatan bahwasanya perlu perhatian khusus wali kelas.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-indigo-400 flex items-center gap-2">
              <ClipboardList size={20} /> Manajemen Tugas Siswa
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gunakan modul ini untuk mengelola pencatatan tugas mandiri/kelompok dan memantau status realisasi penyelesaian dari setiap siswa.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Buat Tugas Baru:</strong> Klik tombol <strong>Buat Tugas Baru</strong>, lalu tentukan Judul Tugas, Mata Pelajaran, Kelas, Tanggal Diberikan, dan Tanggal Tenggat Pengumpulan.</li>
              <li><strong>Realisasi Penyelesaian:</strong> Pilih tugas di bilah kiri, lalu Anda akan melihat seluruh daftar siswa di kelas tersebut. Cukup klik baris nama siswa untuk mengubah status dari "Belum Selesai" menjadi "Selesai" (atau sebaliknya) secara instan.</li>
              <li><strong>Status Masal:</strong> Gunakan tombol <strong>Selesai Semua</strong> atau <strong>Belum Semua</strong> untuk mengubah status penugasan seluruh siswa secara cepat.</li>
              <li><strong>Statistik Real-time:</strong> Sistem secara otomatis mengukur persentase dan jumlah siswa yang telah menyelesaikan tugas pada bar kemajuan di setiap item tugas.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-purple-400 flex items-center gap-2">
              <AlertCircle size={20} /> Pusat Perhatian Wali Kelas (Dashboard)
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Membantu wali kelas memantau kondisi belajar siswa secara proaktif melalui deteksi dini otomatis (early warning system).
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Kriteria Peringatan Nilai:</strong> Menandai siswa dengan rata-rata nilai mata pelajaran di bawah KKM (75).</li>
              <li><strong>Kriteria Peringatan Kehadiran:</strong> Menandai siswa dengan persentase kehadiran mingguan/keseluruhan di bawah target minimal (80%).</li>
              <li><strong>Hubungi Orang Tua Instan:</strong> Klik tombol <strong>Hubungi Orang Tua</strong> pada kartu peringatan siswa untuk melihat nomor telepon wali serta nama Ayah/Ibu. Anda bisa mengklik tombol untuk langsung menelepon atau mengirim pesan WhatsApp secara otomatis.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-amber-400 flex items-center gap-2">
              <Settings size={20} /> Identitas Sekolah & Pengaturan
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Identitas Sekolah:</strong> Lengkapi data sekolah (NPSN, alamat, kepala sekolah) agar tercetak dengan benar pada laporan (PDF/Excel).</li>
              <li><strong>Pengaturan:</strong> Tambahkan mata pelajaran yang diampu, atur bobot persentase nilai akhir, dan (jika Anda admin) buat akun untuk Kepala Sekolah.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-teal-400 flex items-center gap-2">
              <Wallet size={20} /> Manajemen Uang Kas Kelas
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Modul ini digunakan untuk mencatat dan mengelola keuangan/uang kas kelas secara transparan dan teratur.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Uang Masuk (Siswa / Massal):</strong> Catat pembayaran iuran kas harian/mingguan per siswa atau secara massal untuk seluruh kelas.</li>
              <li><strong>Pengeluaran Kas:</strong> Catat keperluan pengeluaran kelas seperti pembelian alat kebersihan, perlengkapan, atau sosial.</li>
              <li><strong>Filter Rentang Waktu & Cetak Laporan:</strong> Filter mutasi kas berdasarkan rentang tanggal/bulan, serta gunakan tombol <strong>Cetak Laporan</strong> untuk mencetak lembar pertanggungjawaban lengkap dengan tanda tangan.</li>
              <li><strong>Sinkronisasi Otomatis:</strong> Data uang kas tersimpan di IndexedDB lokal dan disinkronkan otomatis ke Firebase Cloud Database.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-cyan-400 flex items-center gap-2">
              <BookOpen size={20} /> Panduan Firebase Cloud Database (Sinkronisasi Otomatis)
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Aplikasi telah beralih sepenuhnya ke <strong>Firebase Cloud Firestore</strong> untuk penyelarasan dan penyimpanan data cloud secara real-time. Data Anda akan otomatis tersinkronkan tanpa memerlukan pengaturan spreadsheet manual!
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-2 ml-2">
              <li><strong>Sinkronisasi Real-Time:</strong> Seluruh perubahan data lokal (Siswa, Nilai, Absensi, Kas, Rapor) akan tersinkron otomatis ke Cloud Firestore saat online.</li>
              <li><strong>Dukungan Offline Mode:</strong> Apabila koneksi internet terputus, data tersimpan di browser (IndexedDB) dan akan diunggah otomatis saat koneksi pulih.</li>
              <li><strong>Verifikasi & Pemulihan:</strong> Pada menu <strong>Pengaturan &gt; Firebase Cloud Sync</strong>, Anda dapat menekan tombol <strong>Unggah &amp; Sinkronkan Data</strong> kapan saja untuk menyelaraskan ulang seluruh database lokal Anda dengan cloud.</li>
            </ul>
          </div>
        </div>

        {/* --- FAQ DEVELOPER CONFIGURATION --- */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-4">
          <h3 className="text-lg font-semibold text-indigo-400 flex items-center gap-2">
            🛠️ Panduan Database & Arsitektur Firebase Cloud
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Sistem administrasi kelas menggunakan kombinasi <strong>IndexedDB (Offline First)</strong> di perangkat Anda dan <strong>Firebase Cloud Firestore</strong> untuk kolaborasi &amp; cadangan cloud.
          </p>
          
          <div className="space-y-4 mt-3">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">
                1. Dimana konfigurasi Firebase disimpan?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Konfigurasi SDK Firebase disimpan pada file <code className="text-indigo-300 font-mono">/src/lib/firebase.ts</code> dan <code className="text-indigo-300 font-mono">/src/lib/firebaseSync.ts</code>.
              </p>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">
                2. Bagaimana cara memverifikasi data di Firebase?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Buka menu <strong>Pengaturan &gt; Cek Kesehatan Database</strong> untuk memverifikasi integritas data lokal, atau klik <strong>Firebase Cloud Sync</strong> untuk melihat status koneksi Cloud Firestore.
              </p>
            </div>
          </div>
        </div>

        {/* --- PANDUAN PENGHUBUNGAN DATABASE FIREBASE BARU --- */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950/90 p-6 rounded-2xl border border-indigo-500/40 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-indigo-500/30 pb-4">
            <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-500/30 shadow-inner">
              <Database size={26} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Panduan Langkah Demi Langkah: Menghubungkan ke Database Firebase Baru</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Resmi & Teruji
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Petunjuk lengkap untuk menghubungkan aplikasi ke project / database Firebase Firestore baru milik Anda atau sekolah.
              </p>
            </div>
          </div>

          {/* METHOD 1: VIA UI MODAL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span>CARA 1: Menghubungkan Database via Modal UI (Praktis & Tanpa Edit Kode)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">1</span>
                  <span>Buka Modal Database</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Klik tombol <strong>Database / Status Koneksi</strong> pada header bagian atas aplikasi atau buka menu <strong>Pengaturan &gt; Database</strong>.
                </p>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">2</span>
                  <span>Pilih Tab Custom Database</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Pada modal yang muncul, klik tab <strong>Custom Database Firebase</strong>.
                </p>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">3</span>
                  <span>Isi Kredensial Firebase</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Masukkan <strong>Firebase Project ID</strong>, <strong>API Key</strong>, <strong>Firestore Database ID</strong>, dan <strong>App ID</strong> milik project Anda.
                </p>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">4</span>
                  <span>Simpan & Beralih Database</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Klik tombol <strong className="text-indigo-300">Simpan &amp; Terhubung ke Database Baru</strong>. Aplikasi akan memuat ulang dan langsung terhubung secara otomatis!
                </p>
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-xl flex items-start gap-3 text-xs text-rose-200">
              <RotateCcw className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300">Ingin kembali ke Database Bawaan Sistem?</span>
                <p className="text-slate-300 mt-0.5 leading-relaxed">
                  Cukup buka kembali tab <strong>Custom Database Firebase</strong> di modal tersebut, lalu klik tombol merah <strong className="text-rose-400">Kembalikan ke Database Bawaan Sistem</strong>. Sistem akan mereset konfigurasi dan kembali ke database awal secara aman.
                </p>
              </div>
            </div>
          </div>

          {/* METHOD 2: FULL FIREBASE CONSOLE SETUP */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
              <Server className="w-5 h-5 text-indigo-400" />
              <span>CARA 2: Membuat Project Firebase Baru dari Awal di Firebase Console</span>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              {/* Step 1 */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
                  <span>Buat Project Firebase & Database Cloud Firestore</span>
                </div>
                <ol className="list-decimal list-inside text-slate-400 space-y-1 pl-7 leading-relaxed">
                  <li>Buka Konsol Firebase di <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline font-mono">https://console.firebase.google.com</a> dan masuk menggunakan akun Google sekolah/pribadi.</li>
                  <li>Klik tombol <strong>Add Project</strong> / <strong>Tambah Project</strong>, beri nama project (misal: <code className="text-indigo-300 font-mono">sekolah-db-2026</code>), lalu selesaikan pembuatan project.</li>
                  <li>Pada menu bilah kiri, masuk ke <strong>Build</strong> &gt; <strong>Firestore Database</strong>.</li>
                  <li>Klik tombol <strong>Create Database</strong>, pilih lokasi server terdekat (misal: <code className="text-indigo-300 font-mono">asia-southeast1</code> - Singapore), dan pilih aturan akses awal.</li>
                </ol>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">2</span>
                  <span>Dapatkan Kunci Konfigurasi Aplikasi Web (Firebase Config)</span>
                </div>
                <ol className="list-decimal list-inside text-slate-400 space-y-1 pl-7 leading-relaxed">
                  <li>Pada Firebase Console, klik ikon roda gigi ⚙️ (<strong>Project Settings</strong>) di kiri atas.</li>
                  <li>Di tab <strong>General</strong>, gulir ke bawah ke bagian <em>Your apps</em> dan klik ikon Web (<code className="text-indigo-300 font-mono">&lt;/&gt;</code>).</li>
                  <li>Daftarkan aplikasi web (masukkan nama aplikasi, misal: <code className="text-indigo-300 font-mono">EduSync Web App</code>).</li>
                  <li>Salin nilai <code className="text-indigo-300 font-mono">apiKey</code>, <code className="text-indigo-300 font-mono">authDomain</code>, <code className="text-indigo-300 font-mono">projectId</code>, dan <code className="text-indigo-300 font-mono">appId</code>.</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">3</span>
                  <span>Atur Variabel Lingkungan & File Konfigurasi Aplikasi</span>
                </div>
                <div className="text-slate-400 pl-7 space-y-2">
                  <p>Buka file <code className="text-indigo-300 font-mono">/firebase-applet-config.json</code>, lalu ganti nilainya dengan credentials dari Firebase Console:</p>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto">
{`{
  "apiKey": "AIzaSyYourNewApiKeyHere...",
  "authDomain": "sekolah-db-2026.firebaseapp.com",
  "projectId": "sekolah-db-2026",
  "storageBucket": "sekolah-db-2026.appspot.com",
  "messagingSenderId": "123456789012",
  "appId": "1:123456789012:web:abcdef123456"
}`}
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">4</span>
                  <span>Pasang Aturan Keamanan Firestore (Firestore Security Rules)</span>
                </div>
                <ol className="list-decimal list-inside text-slate-400 space-y-1 pl-7 leading-relaxed">
                  <li>Buka Firebase Console &gt; <strong>Firestore Database</strong> &gt; tab <strong>Rules</strong>.</li>
                  <li>Buka file <code className="text-indigo-300 font-mono">firestore.rules</code> di proyek aplikasi ini, salin seluruh kodenya, lalu tempelkan di tab Rules Firebase Console.</li>
                  <li>Klik tombol <strong>Publish</strong> / <strong>Terbitkan</strong> untuk mengamankan database dari akses yang tidak terotorisasi.</li>
                </ol>
              </div>

              {/* Step 5 */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">5</span>
                  <span>Uji Koneksi & Unggah Data Sekolah</span>
                </div>
                <ol className="list-decimal list-inside text-slate-400 space-y-1 pl-7 leading-relaxed">
                  <li>Buka aplikasi, navigasi ke <strong>Pengaturan &gt; Diagnostik Database</strong> atau <strong>Firebase Cloud Sync</strong>.</li>
                  <li>Status koneksi akan otomatis terdeteksi <span className="text-emerald-400 font-bold">Terhubung (Connected)</span>.</li>
                  <li>Klik tombol <strong className="text-indigo-300">Unggah &amp; Sinkronkan Data Lokal ke Database Baru</strong> untuk memindahkan seluruh data sekolah ke database Cloud Firestore baru.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* --- MANUAL ROSTER & PIKET --- */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-4">
          <h3 className="text-lg font-semibold text-indigo-400 flex items-center gap-2">
            📅 Panduan Modul Roster Pelajaran & Piket Harian
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Modul baru ini dirancang untuk memudahkan pengaturan jadwal pelajaran mingguan dan tugas kebersihan harian siswa kelas Anda secara terintegrasi.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-indigo-300">📖 Roster Pelajaran</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Digunakan untuk membuat jadwal pelajaran mingguan (Senin sampai Sabtu).
              </p>
              <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
                <li>Klik tombol <strong>Tambah Roster</strong> di bagian kanan atas.</li>
                <li>Pilih hari, masukkan jam mulai dan jam selesai, pilih mata pelajaran dari daftar, dan tentukan nama guru pengampunya.</li>
                <li>Klik <strong>Simpan</strong> untuk mencatat roster ke database lokal.</li>
                <li>Jadwal diurutkan berdasarkan hari dan urutan jam belajar secara otomatis.</li>
                <li>Ekspor jadwal ke format <strong>Excel</strong> atau cetak PDF rapi untuk ditempel di kelas.</li>
              </ul>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-300">🧹 Piket Harian Kelas</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Digunakan untuk mendistribusikan siswa pada jadwal piket kebersihan kelas harian.
              </p>
              <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
                <li><strong>Tambah Manual:</strong> Pilih siswa dari dropdown untuk ditugaskan di hari tertentu.</li>
                <li><strong>Auto-Distribusi (Cerdas):</strong> Klik tombol <strong>Auto Distribusi Piket</strong> untuk membagikan tugas piket secara merata dan acak ke seluruh siswa aktif dalam hitungan detik.</li>
                <li>Sistem pintar akan memastikan jumlah petugas piket per hari seimbang.</li>
                <li>Daftar piket akan otomatis diperbarui apabila ada perubahan daftar siswa.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
