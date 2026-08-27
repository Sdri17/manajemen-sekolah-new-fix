import { Student, Grade, Attendance, StudentTask, Settings } from './store';

export interface WhatsAppPlaceholder {
  tag: string;
  description: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  type: 'individual' | 'group';
  content: string;
  description: string;
}

export const INDIVIDUAL_PLACEHOLDERS: WhatsAppPlaceholder[] = [
  { tag: '{{nama_siswa}}', description: 'Nama Lengkap Siswa' },
  { tag: '{{no_absen}}', description: 'Nomor Urut / Absen' },
  { tag: '{{kelas}}', description: 'Kelas Siswa' },
  { tag: '{{nama_ortu}}', description: 'Nama Orang Tua / Wali' },
  { tag: '{{nomor_wa}}', description: 'Nomor WhatsApp Orang Tua' },
  { tag: '{{nilai}}', description: 'Rincian Nilai Siswa (Mapel Aktif)' },
  { tag: '{{absen_status}}', description: 'Rekap Absensi (Sakit, Izin, Alpa)' },
  { tag: '{{tugas_belum}}', description: 'Daftar Tugas Belum Dikumpulkan' },
  { tag: '{{nama_tugas}}', description: 'Nama Tugas / PR' },
  { tag: '{{mata_pelajaran}}', description: 'Mata Pelajaran Tugas' },
  { tag: '{{tanggal_diberikan}}', description: 'Tanggal Tugas Diberikan' },
  { tag: '{{tanggal_kumpul}}', description: 'Tanggal Pengumpulan (Deadline)' },
  { tag: '{{nama_wali_kelas}}', description: 'Nama Wali Kelas' },
  { tag: '{{nama_sekolah}}', description: 'Nama Sekolah' },
  { tag: '{{hari_tanggal}}', description: 'Hari dan Tanggal Saat Ini' },
];

export const GROUP_PLACEHOLDERS: WhatsAppPlaceholder[] = [
  { tag: '{{kelas}}', description: 'Kelas Target' },
  { tag: '{{rekap_absen}}', description: 'Daftar Siswa Sakit, Izin, Alpa (Hari Ini)' },
  { tag: '{{tugas_belum_grup}}', description: 'Daftar Siswa Belum Mengumpulkan Tugas' },
  { tag: '{{nama_tugas}}', description: 'Nama Tugas / PR yang dipilih' },
  { tag: '{{mata_pelajaran}}', description: 'Mata Pelajaran Tugas yang dipilih' },
  { tag: '{{tanggal_diberikan}}', description: 'Tanggal Tugas Diberikan' },
  { tag: '{{tanggal_kumpul}}', description: 'Tanggal Pengumpulan Tugas yang dipilih' },
  { tag: '{{nama_wali_kelas}}', description: 'Nama Wali Kelas' },
  { tag: '{{nama_sekolah}}', description: 'Nama Sekolah' },
  { tag: '{{hari_tanggal}}', description: 'Hari dan Tanggal Saat Ini' },
];

export const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'ind_nilai',
    name: 'Laporan Perkembangan Nilai',
    type: 'individual',
    description: 'Laporan rincian nilai tugas, harian, dan ujian siswa.',
    content: `Yth. Bapak/Ibu Orang Tua/Wali dari *{{nama_siswa}}*,

Perkenalkan saya Bapak/Ibu *{{nama_wali_kelas}}*, selaku Wali Kelas di *{{nama_sekolah}}*. Melalui pesan ini, kami ingin menyampaikan laporan pencapaian nilai belajar putra/putri Bapak/Ibu:

{{nilai}}

Mohon bantuan Bapak/Ibu di rumah untuk mendampingi, mengawasi, serta memotivasi putra/putri kita agar senantiasa giat belajar demi memperoleh hasil belajar yang optimal.

Terima kasih banyak atas perhatian dan kerja sama yang baik dari Bapak/Ibu. 🙏`
  },
  {
    id: 'ind_absen',
    name: 'Laporan Kehadiran / Absensi',
    type: 'individual',
    description: 'Pemberitahuan rekapitulasi kehadiran siswa semester ini.',
    content: `Yth. Bapak/Ibu Orang Tua/Wali dari *{{nama_siswa}}*,

Kami dari *{{nama_sekolah}}* ingin menginformasikan rekapitulasi kehadiran *{{nama_siswa}}* di Kelas *{{kelas}}* untuk semester ini:

{{absen_status}}

Kehadiran secara rutin sangat krusial bagi kelancaran belajar putra/putri Bapak/Ibu agar tidak tertinggal materi penting di kelas.

Terima kasih banyak atas perhatian dan kerja samanya. 🙏`
  },
  {
    id: 'ind_tugas',
    name: 'Pemberitahuan Tugas Belum Dikumpulkan',
    type: 'individual',
    description: 'Menyampaikan rincian tugas yang belum selesai dikerjakan.',
    content: `Yth. Bapak/Ibu Orang Tua/Wali dari *{{nama_siswa}}*,

Melalui pesan ini, kami ingin menginformasikan bahwa *{{nama_siswa}}* di Kelas *{{kelas}}* *belum mengumpulkan* tugas sekolah berikut:

📚 *Mata Pelajaran:* {{mata_pelajaran}}
📝 *Tugas:* {{nama_tugas}}
📅 *Batas Pengumpulan:* {{tanggal_kumpul}}

Mohon bantuan Bapak/Ibu untuk mendampingi dan mengingatkan putra/putrinya di rumah agar segera merampungkan tugas tersebut.

Terima kasih banyak atas dukungan dan kerja samanya. 🙏`
  },
  {
    id: 'ind_pr_tugas',
    name: 'Kirim Informasi PR / Tugas Baru (Personal)',
    type: 'individual',
    description: 'Mengirim rincian tugas/PR baru yang harus dikerjakan oleh siswa kepada Wali Murid.',
    content: `Yth. Bapak/Ibu Orang Tua/Wali dari *{{nama_siswa}}*,

Melalui pesan ini, kami selaku Wali Kelas di *{{nama_sekolah}}* ingin menginformasikan adanya tugas/PR baru yang perlu dikerjakan oleh putra/putri Bapak/Ibu, *{{nama_siswa}}*:

📚 *Mata Pelajaran:* {{mata_pelajaran}}
📝 *Tugas:* {{nama_tugas}}
📅 *Tanggal Diberikan:* {{tanggal_diberikan}}
📅 *Tanggal Dikumpulkan:* {{tanggal_kumpul}}

Mohon pendampingan Bapak/Ibu di rumah agar putra/putrinya dapat mengerjakan tugas ini dengan baik dan mengumpulkannya tepat waktu.

Terima kasih banyak atas kerja sama dan dukungannya. 🙏`
  },
  {
    id: 'ind_kustom',
    name: 'Pesan Kustom Personal',
    type: 'individual',
    description: 'Teks bebas dengan sapaan pembuka personal otomatis.',
    content: `Yth. Bapak/Ibu Orang Tua/Wali dari *{{nama_siswa}}*,

Perkenalkan saya Bapak/Ibu *{{nama_wali_kelas}}*, selaku Wali Kelas di *{{nama_sekolah}}*.

[Tulis pesan Anda di sini]

Terima kasih atas perhatian Bapak/Ibu sekalian. 🙏`
  },
  {
    id: 'grp_absen',
    name: 'Rekap Absensi Harian Kelas',
    type: 'group',
    description: 'Pemberitahuan grup mengenai siswa yang absen hari ini.',
    content: `*REKAPITULASI ABSENSI HARIAN KELAS {{kelas}}*
📅 Hari/Tanggal: *{{hari_tanggal}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,
Berikut rekap absensi siswa yang berhalangan hadir pada hari ini:

{{rekap_absen}}

Mari bersama-sama kita doakan anak-anak kita yang sedang sakit agar lekas sembuh. Bagi siswa lainnya, mohon agar terus diingatkan untuk hadir tepat waktu ke sekolah.

Terima kasih. Salam hangat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_tugas',
    name: 'Rekap Pengumpulan Tugas Kelas',
    type: 'group',
    description: 'Daftar siswa yang belum mengumpulkan tugas tertentu.',
    content: `*INFO PENGUMPULAN TUGAS KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Berikut adalah daftar siswa yang *belum mengumpulkan* tugas *{{nama_tugas}}* (Mata Pelajaran: *{{mata_pelajaran}}*, batas waktu: *{{tanggal_kumpul}}*):

{{tugas_belum_grup}}

Mohon pendampingan Bapak/Ibu di rumah agar mengingatkan putra/putrinya untuk segera menuntaskan dan mengumpulkan tugas tersebut.

Terima kasih banyak atas perhatian dan kolaborasi Bapak/Ibu sekalian. 🙏

Salam hangat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_pr_tugas',
    name: 'Kirim Informasi PR / Tugas Kelas (Grup)',
    type: 'group',
    description: 'Mengumumkan rincian tugas/PR baru kelas kepada seluruh Wali Murid di grup kelas.',
    content: `*📢 PEMBERITAHUAN PR / TUGAS KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Kami ingin mengumumkan adanya tugas/PR baru yang harus dikerjakan oleh seluruh siswa Kelas *{{kelas}}*:

📚 *Mata Pelajaran:* {{mata_pelajaran}}
📝 *Tugas:* {{nama_tugas}}
📅 *Tanggal Diberikan:* {{tanggal_diberikan}}
📅 *Tanggal Dikumpulkan:* {{tanggal_kumpul}}

Mohon kerja sama Bapak/Ibu sekalian untuk memantau dan membimbing putra/putrinya agar menyelesaikan tugas ini sebelum batas waktu pengumpulan.

Terima kasih atas perhatian dan dukungannya. 🙏

Salam hangat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_pengumuman',
    name: 'Pengumuman Umum Kelas',
    type: 'group',
    description: 'Pengumuman bebas ke seluruh wali murid di grup kelas.',
    content: `*📢 PENGUMUMAN KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

[Tulis pesan pengumuman atau kegiatan belajar di sini]

Demikian informasi ini kami sampaikan. Mohon bantuan dan kerja samanya. Terima kasih.

Salam hormat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_rapat',
    name: 'Pengumuman Rapat Orang Tua / Wali',
    type: 'group',
    description: 'Undangan rapat pertemuan orang tua murid kelas.',
    content: `*📢 UNDANGAN RAPAT ORANG TUA / WALI KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Mengharap kehadiran Bapak/Ibu dalam acara *Rapat Koordinasi & Silaturahmi Wali Murid* yang akan dilaksanakan pada:

📅 *Hari/Tanggal:* [Contoh: Sabtu, 15 Oktober 2026]
⏰ *Pukul:* [Contoh: 08.00 WIB s.d Selesai]
📍 *Tempat:* Ruang Kelas {{kelas}} / Aula Sekolah
📝 *Agenda:* Pembahasan Perkembangan Belajar & Program Kelas

Kehadiran Bapak/Ibu sangat diharapkan demi kelancaran kegiatan belajar putra/putri kita.

Terima kasih atas perhatian dan kerjasamanya.

Salam hormat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_libur',
    name: 'Pengumuman Jadwal Libur Sekolah',
    type: 'group',
    description: 'Pemberitahuan hari libur atau belajar di rumah.',
    content: `*📢 PENGUMUMAN JADWAL LIBUR SEKOLAH*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Menginformasikan bahwa sehubungan dengan [Sebutkan Alasan / Kalender Akademik], kegiatan belajar mengajar Kelas *{{kelas}}* akan *DILIBURKAN* pada:

📅 *Tanggal Libur:* [Contoh: 20 Oktober - 22 Oktober 2026]
🏫 *Masuk Kembali:* [Contoh: Kamis, 23 Oktober 2026]

Selama masa libur, mohon Bapak/Ibu tetap memantau kegiatan belajar mandiri dan istirahat putra/putri di rumah.

Terima kasih atas perhatian dan pengertian Bapak/Ibu sekalian. 🙏

Salam hormat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_ujian',
    name: 'Pengumuman Pelaksanaan Ujian (STS / SAS / PAT)',
    type: 'group',
    description: 'Pemberitahuan persiapan dan jadwal ujian siswa.',
    content: `*📝 PENGUMUMAN PELAKSANAAN UJIAN KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Menginformasikan bahwa pelaksanaan *Ujian / Penilaian Sumatif* Kelas *{{kelas}}* akan dilaksanakan pada:

📅 *Tanggal:* [Contoh: 5 Desember - 10 Desember 2026]
📚 *Persiapan:* Kisi-kisi dan jadwal rincian telah diberikan kepada siswa.

Mohon bantuan Bapak/Ibu untuk membatasi waktu bermain, menjaga kesehatan, serta memotivasi putra/putri di rumah agar siap menghadapi ujian.

Terima kasih atas dukungan dan pendampingannya. 🙏

Salam hormat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  },
  {
    id: 'grp_rapor',
    name: 'Pengumuman Pembagian Hasil Belajar (Rapor)',
    type: 'group',
    description: 'Undangan pengambilan laporan hasil belajar (Rapor).',
    content: `*📄 PENGUMUMAN PEMBAGIAN RAPOR KELAS {{kelas}}*
🏫 Sekolah: *{{nama_sekolah}}*
----------------------------------------

Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *{{kelas}}*,

Mengundang Bapak/Ibu Orang Tua/Wali Murid untuk mengambil Laporan Hasil Belajar (Rapor) Semester ini pada:

📅 *Hari/Tanggal:* [Contoh: Jumat, 18 Desember 2026]
⏰ *Pukul:* [Contoh: 08.00 - 11.00 WIB]
📍 *Tempat:* Ruang Kelas {{kelas}}

*Catatan:* Pengambilan rapor wajib diambil langsung oleh Orang Tua / Wali Murid.

Terima kasih atas kerja sama dan perhatian Bapak/Ibu sekalian. 🙏

Salam hormat,
*{{nama_wali_kelas}}* (Wali Kelas)`
  }
];

export class WhatsAppSenderService {
  /**
   * Compiles template string with actual data values
   */
  static compile(
    template: string,
    context: {
      student?: Student | null;
      grades?: Grade[];
      attendance?: Attendance[];
      tasks?: StudentTask[];
      settings?: Settings | null;
      selectedSubject?: string;
      selectedTaskId?: string;
      selectedDate?: string;
      customFields?: Record<string, string>;
    }
  ): string {
    let result = template;
    const { student, grades = [], attendance = [], tasks = [], settings, selectedSubject, selectedTaskId, selectedDate } = context;

    const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
    const schoolName = settings?.nama_sekolah || 'Sekolah';
    const activeSemester = settings?.semester_aktif || 'Ganjil 2026';

    // 1. General context placeholders
    const dateToUse = selectedDate || new Date().toISOString().split('T')[0];
    const dayName = this.getDayName(dateToUse);
    const dateFormatted = this.formatDateIndo(dateToUse);
    const dayDateStr = `${dayName}, ${dateFormatted}`;

    result = result.replace(/\{\{nama_wali_kelas\}\}/g, teacherName);
    result = result.replace(/\{\{nama_sekolah\}\}/g, schoolName);
    result = result.replace(/\{\{hari_tanggal\}\}/g, dayDateStr);

    // Task-specific placeholders
    if (selectedTaskId && tasks.length > 0) {
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task) {
        result = result.replace(/\{\{nama_tugas\}\}/g, task.judul || '');
        result = result.replace(/\{\{mata_pelajaran\}\}/g, task.mata_pelajaran || '');
        result = result.replace(/\{\{tanggal_diberikan\}\}/g, this.formatDateIndo(task.tanggal_diberikan) || '');
        result = result.replace(/\{\{tanggal_kumpul\}\}/g, this.formatDateIndo(task.tanggal_kumpul) || '');
      } else {
        result = result.replace(/\{\{nama_tugas\}\}/g, '[Nama Tugas]');
        result = result.replace(/\{\{mata_pelajaran\}\}/g, '[Mata Pelajaran]');
        result = result.replace(/\{\{tanggal_diberikan\}\}/g, '[Tanggal Diberikan]');
        result = result.replace(/\{\{tanggal_kumpul\}\}/g, '[Tanggal Kumpul]');
      }
    } else {
      result = result.replace(/\{\{nama_tugas\}\}/g, '[Pilih Tugas]');
      result = result.replace(/\{\{mata_pelajaran\}\}/g, '[Mata Pelajaran]');
      result = result.replace(/\{\{tanggal_diberikan\}\}/g, '[Tanggal Diberikan]');
      result = result.replace(/\{\{tanggal_kumpul\}\}/g, '[Tanggal Kumpul]');
    }

    // 2. Student context placeholders (if student is provided)
    if (student) {
      const studentName = student.nama || '';
      const studentNo = String(student.no || '');
      const studentClass = student.kelas || '';
      const parentName = student.nama_orang_tua || [student.nama_ayah, student.nama_ibu].filter(Boolean).join(' / ') || 'Orang Tua / Wali';
      const parentPhone = student.no_telp_ortu || '';

      result = result.replace(/\{\{nama_siswa\}\}/g, studentName);
      result = result.replace(/\{\{no_absen\}\}/g, studentNo);
      result = result.replace(/\{\{kelas\}\}/g, studentClass);
      result = result.replace(/\{\{nama_ortu\}\}/g, parentName);
      result = result.replace(/\{\{nomor_wa\}\}/g, parentPhone);

      // --- {{nilai}} Compile Logic ---
      if (result.includes('{{nilai}}')) {
        const studentGrades = grades.filter(g => g.id_siswa === student.id && g.semester === activeSemester);
        let gradeSummary = '';

        if (selectedSubject) {
          const subjectGrades = studentGrades.filter(g => g.mata_pelajaran === selectedSubject);
          if (subjectGrades.length > 0) {
            gradeSummary = `Mata Pelajaran: *${selectedSubject}*\n` + 
              subjectGrades.map(g => `- ${g.nama_kolom} (${g.jenis_nilai}): *${g.nilai}*`).join('\n');
          } else {
            gradeSummary = `Belum ada nilai yang tercatat untuk mata pelajaran *${selectedSubject}*.`;
          }
        } else {
          const mapelGrades: Record<string, number[]> = {};
          studentGrades.forEach(g => {
            if (g.mata_pelajaran) {
              if (!mapelGrades[g.mata_pelajaran]) mapelGrades[g.mata_pelajaran] = [];
              mapelGrades[g.mata_pelajaran].push(g.nilai);
            }
          });

          const averages = Object.entries(mapelGrades).map(([mapel, vals]) => {
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            return `- ${mapel}: *${avg.toFixed(1)}*`;
          });

          gradeSummary = averages.length > 0 
            ? averages.join('\n') 
            : 'Belum ada nilai ujian atau tugas yang tercatat semester ini.';
        }
        result = result.replace(/\{\{nilai\}\}/g, gradeSummary);
      }

      // --- {{absen_status}} Compile Logic ---
      if (result.includes('{{absen_status}}')) {
        const studentAtt = attendance.filter(a => a.id_siswa === student.id && a.semester === activeSemester);
        const total = studentAtt.length;
        const sakit = studentAtt.filter(a => a.status === 'Sakit').length;
        const izin = studentAtt.filter(a => a.status === 'Izin').length;
        const alpa = studentAtt.filter(a => a.status === 'Alpa').length;
        const hadir = studentAtt.filter(a => a.status === 'Hadir').length;
        const presencePct = total > 0 ? Math.round((hadir / total) * 100) : 100;

        const summary = `- Hadir: *${hadir}* hari\n` +
                        `- Sakit: *${sakit}* hari\n` +
                        `- Izin: *${izin}* hari\n` +
                        `- Alpa (Tanpa Keterangan): *${alpa}* hari\n\n` +
                        `Tingkat kehadiran semester ini: *${presencePct}%*`;
        result = result.replace(/\{\{absen_status\}\}/g, summary);
      }

      // --- {{tugas_belum}} Compile Logic ---
      if (result.includes('{{tugas_belum}}')) {
        const classTasks = tasks.filter(t => t.kelas === studentClass && t.semester === activeSemester);
        const pendingTasks = classTasks.filter(t => {
          const completed = t.penyelesaian && t.penyelesaian[student.id] === true;
          return !completed;
        });

        let taskList = '';
        if (pendingTasks.length > 0) {
          taskList = pendingTasks.map((t, idx) => `${idx + 1}. *${t.judul}* (Mapel: ${t.mata_pelajaran})`).join('\n');
        } else {
          taskList = 'Luar biasa! Semua tugas sekolah saat ini telah diselesaikan dengan lengkap. 👍';
        }
        result = result.replace(/\{\{tugas_belum\}\}/g, taskList);
      }
    }

    // 3. Group / Class context placeholders
    const targetClass = student?.kelas || context.student?.kelas || selectedSubject || '';
    result = result.replace(/\{\{kelas\}\}/g, targetClass);

    // --- {{rekap_absen}} Compile Logic ---
    if (result.includes('{{rekap_absen}}') && targetClass) {
      const classStudents = student ? [student] : []; // Fallback, but in real case we look up outside
      // To keep compiler self-contained, if classStudents is empty, we replace later in the component
    }

    // --- {{tugas_belum_grup}} Compile Logic ---
    // Will be populated dynamically by the UI or compiled separately

    return result;
  }

  static getDayName(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      return days[date.getDay()];
    } catch {
      return '';
    }
  }

  static formatDateIndo(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch {
      return dateStr;
    }
  }

  static formatWhatsAppNumber(phone: string | number | undefined | null): string {
    return formatWhatsAppNumber(phone);
  }
}

export function formatWhatsAppNumber(phone: string | number | undefined | null): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('0062')) {
    cleaned = '62' + cleaned.slice(4);
  } else if (cleaned.startsWith('620')) {
    cleaned = '62' + cleaned.slice(3);
  } else if (cleaned.startsWith('08')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8') && cleaned.length >= 8 && cleaned.length <= 13) {
    cleaned = '62' + cleaned;
  }

  return cleaned;
}
