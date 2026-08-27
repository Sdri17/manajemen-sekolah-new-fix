import React, { useState, useEffect } from 'react';
import { 
  User, BookOpen, Calendar, CheckSquare, FileText, Phone, Mail, MapPin, 
  X, Award, ShieldAlert, CheckCircle2, AlertTriangle, Printer, ExternalLink,
  TrendingUp, Clock, FileCheck, ArrowUpRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, ReferenceLine, PieChart, Pie
} from 'recharts';
import { store, Student, Grade, Attendance, StudentTask, JurnalEntry, Settings } from '../lib/store';
import toast from 'react-hot-toast';

interface StudentDossierModalProps {
  isOpen: boolean;
  studentId: string | null;
  onClose: () => void;
  settings: Settings | null;
}

export default function StudentDossierModal({
  isOpen,
  studentId,
  onClose,
  settings
}: StudentDossierModalProps) {
  const [student, setStudent] = useState<Student | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [journals, setJournals] = useState<JurnalEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'profil' | 'nilai' | 'absensi' | 'tugas' | 'jurnal'>('profil');

  useEffect(() => {
    if (!isOpen || !studentId) {
      setStudent(null);
      return;
    }

    const loadStudentDetails = async () => {
      setIsLoading(true);
      try {
        // Load student profile
        const allStudents = await store.students.keys().then(keys => 
          Promise.all(keys.map(k => store.students.getItem(k)))
        ) as Student[];
        
        const found = allStudents.find(s => s && s.id === studentId);
        setStudent(found || null);

        if (found) {
          // Load grades
          const allGrades = await store.grades.keys().then(keys =>
            Promise.all(keys.map(k => store.grades.getItem(k)))
          ) as Grade[];
          const sGrades = allGrades.filter(g => g && g.id_siswa === studentId);
          setGrades(sGrades);

          // Load attendance
          const allAtt = await store.attendance.keys().then(keys =>
            Promise.all(keys.map(k => store.attendance.getItem(k)))
          ) as Attendance[];
          const sAtt = allAtt.filter(a => a && a.id_siswa === studentId);
          setAttendances(sAtt);

          // Load tasks for student's class
          const allTasks = await store.tasks.keys().then(keys =>
            Promise.all(keys.map(k => store.tasks.getItem(k)))
          ) as StudentTask[];
          const sTasks = allTasks.filter(t => t && (t.kelas === found.kelas || !t.kelas));
          setTasks(sTasks);

          // Load journals mentioning student
          const allJournals = await store.jurnal.keys().then(keys =>
            Promise.all(keys.map(k => store.jurnal.getItem(k)))
          ) as JurnalEntry[];
          const sJournals = allJournals.filter(j => 
            j && (j.id_siswa === studentId || (j.catatan && j.catatan.toLowerCase().includes(found.nama.toLowerCase())))
          );
          setJournals(sJournals);
        }
      } catch (err) {
        console.error("Error loading student dossier:", err);
        toast.error("Gagal memuat profil lengkap siswa");
      } finally {
        setIsLoading(false);
      }
    };

    loadStudentDetails();
  }, [isOpen, studentId]);

  if (!isOpen || !student) return null;

  // Calculate summary metrics
  const validGrades = grades.filter(g => typeof g.nilai === 'number' && !isNaN(g.nilai));
  const avgGrade = validGrades.length > 0 
    ? (validGrades.reduce((sum, g) => sum + g.nilai, 0) / validGrades.length) 
    : 0;

  const totalAtt = attendances.length;
  const countHadir = attendances.filter(a => a.status === 'Hadir').length;
  const countSakit = attendances.filter(a => a.status === 'Sakit').length;
  const countIzin = attendances.filter(a => a.status === 'Izin').length;
  const countAlpa = attendances.filter(a => a.status === 'Alpa').length;
  const attPercent = totalAtt > 0 ? (countHadir / totalAtt) * 100 : 100;

  // Task completion count
  const completedTasksCount = tasks.filter(t => t.penyelesaian && t.penyelesaian[student.id]).length;
  const totalTasksCount = tasks.length;
  const taskPercent = totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0;

  // Group grades by subject
  const gradesBySubject: Record<string, number[]> = {};
  validGrades.forEach(g => {
    const mapel = g.mata_pelajaran || 'Umum';
    if (!gradesBySubject[mapel]) gradesBySubject[mapel] = [];
    gradesBySubject[mapel].push(g.nilai);
  });

  const subjectChartData = Object.entries(gradesBySubject).map(([mapel, list]) => {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    return {
      mapel,
      RataRata: Number(avg.toFixed(1)),
      KKM: settings?.kkm_bulanan || 75
    };
  });

  const attendancePieData = [
    { name: 'Hadir', value: countHadir, color: '#10b981' },
    { name: 'Sakit', value: countSakit, color: '#3b82f6' },
    { name: 'Izin', value: countIzin, color: '#f59e0b' },
    { name: 'Alpa', value: countAlpa, color: '#ef4444' }
  ].filter(d => d.value > 0);

  const kkmDefault = settings?.kkm_bulanan || 75;

  const handlePrintDossier = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Gagal membuka jendela cetak. Pastikan izin pop-up diizinkan pada browser.');
      return;
    }

    const schoolName = settings?.nama_sekolah || 'SEKOLAH DASAR / MENENGAH';
    const schoolAddress = settings?.alamat || 'Jl. Pendidikan No. 1, Kota Administrasi';
    const semesterName = settings?.semester_aktif || 'Semester Aktif';

    const gradesRows = validGrades.map((g, i) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${i + 1}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">${g.mata_pelajaran || 'Umum'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${g.jenis_nilai || '-'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${g.nama_kolom || '-'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-size: 13px;">${g.nilai}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center; color: ${g.nilai >= kkmDefault ? '#059669' : '#dc2626'}; font-weight: 600;">${g.nilai >= kkmDefault ? 'Tuntas' : 'Remidi'}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dossier Siswa - ${student.nama}</title>
          <style>
            body { font-family: 'Arial', sans-serif; color: #0f172a; padding: 24px; line-height: 1.5; font-size: 12px; background: #ffffff; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; }
            .header p { margin: 3px 0 0; font-size: 11px; color: #475569; }
            .title { text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.5px; }
            .bio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
            .bio-box { border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 8px; background: #f8fafc; }
            .bio-box table { width: 100%; border-collapse: collapse; }
            .bio-box td { padding: 4px 0; font-size: 11px; }
            .kpi-row { display: flex; gap: 12px; margin-bottom: 20px; }
            .kpi-card { flex: 1; border: 1px solid #cbd5e1; padding: 10px; text-align: center; border-radius: 8px; background: #f1f5f9; }
            .kpi-card .val { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 2px; }
            .kpi-card .lbl { font-size: 10px; color: #475569; font-weight: 600; text-transform: uppercase; }
            table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            table.data-table th { background: #e2e8f0; padding: 8px 10px; border: 1px solid #cbd5e1; font-size: 11px; text-align: left; color: #0f172a; }
            .footer-sign { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
            .sign-box { text-align: center; width: 220px; font-size: 11px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${schoolName}</h1>
            <p>${schoolAddress}</p>
            <p>Periode Evaluasi: ${semesterName}</p>
          </div>

          <div class="title">LEMBAR DOSSIER AKADEMIK & REKAPITULASI EVALUASI SISWA</div>

          <div class="bio-grid">
            <div class="bio-box">
              <strong style="display:block; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #0f172a; font-size: 11px;">IDENTITAS SISWA</strong>
              <table>
                <tr><td width="110" style="color: #475569;">Nama Lengkap</td><td>: <strong>${student.nama}</strong></td></tr>
                <tr><td style="color: #475569;">NISN</td><td>: ${student.nisn || '-'}</td></tr>
                <tr><td style="color: #475569;">NIS / NIPD</td><td>: ${student.nipd || '-'}</td></tr>
                <tr><td style="color: #475569;">Kelas</td><td>: <strong>Kelas ${student.kelas}</strong></td></tr>
                <tr><td style="color: #475569;">Jenis Kelamin</td><td>: ${student.jenis_kelamin || '-'}</td></tr>
              </table>
            </div>
            <div class="bio-box">
              <strong style="display:block; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #0f172a; font-size: 11px;">ORANG TUA & KONTAK</strong>
              <table>
                <tr><td width="110" style="color: #475569;">Nama Ayah</td><td>: ${student.nama_ayah || '-'}</td></tr>
                <tr><td style="color: #475569;">Nama Ibu</td><td>: ${student.nama_ibu || '-'}</td></tr>
                <tr><td style="color: #475569;">No. Telepon Ortu</td><td>: ${student.no_telp_ortu || student.nomor_telepon || '-'}</td></tr>
                <tr><td style="color: #475569;">Alamat Lengkap</td><td>: ${student.alamat || '-'}</td></tr>
              </table>
            </div>
          </div>

          <div class="kpi-row">
            <div class="kpi-card">
              <div class="lbl">Rata-Rata Nilai</div>
              <div class="val">${avgGrade > 0 ? avgGrade.toFixed(1) : '-'}</div>
            </div>
            <div class="kpi-card">
              <div class="lbl">Kehadiran Siswa</div>
              <div class="val">${totalAtt > 0 ? `${attPercent.toFixed(1)}%` : '-'}</div>
            </div>
            <div class="kpi-card">
              <div class="lbl">Pengerjaan Tugas</div>
              <div class="val">${completedTasksCount}/${totalTasksCount}</div>
            </div>
            <div class="kpi-card">
              <div class="lbl">Catatan Jurnal</div>
              <div class="val">${journals.length} Record</div>
            </div>
          </div>

          <h3 style="font-size: 12px; margin-bottom: 8px; color: #0f172a; text-transform: uppercase;">RINCIAN EVALUASI & PENILAIAN SISWA</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th width="30" style="text-align:center;">No</th>
                <th>Mata Pelajaran</th>
                <th>Kategori Nilai</th>
                <th>Nama Komponen / Tugas</th>
                <th width="60" style="text-align:center;">Nilai</th>
                <th width="80" style="text-align:center;">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${gradesRows || '<tr><td colspan="6" style="text-align:center; padding: 12px; color: #94a3b8;">Belum ada data nilai tercatat untuk siswa ini</td></tr>'}
            </tbody>
          </table>

          <div class="footer-sign">
            <div class="sign-box">
              <p>Mengetahui,<br>Orang Tua / Wali Siswa</p>
              <br><br><br><br>
              <p style="border-bottom: 1px solid #000; font-weight: bold; margin: 0 auto; width: 180px;"></p>
            </div>
            <div class="sign-box">
              <p>Guru Kelas / Wali Kelas</p>
              <br><br><br><br>
              <p style="border-bottom: 1px solid #000; font-weight: bold;">( ......................................... )</p>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handleWhatsAppContact = () => {
    const parentPhone = student.no_telp_ortu || student.nomor_telepon || '';
    if (!parentPhone) {
      toast.error('Nomor telepon orang tua belum dicatat');
      return;
    }
    let cleaned = parentPhone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('08')) cleaned = '62' + cleaned.slice(1);
    const msg = `Yth. Bapak/Ibu Wali dari ${student.nama},\n\nSalam dari sekolah. Berikut ringkasan statistik putra/putri Anda:\n- Rata-rata Nilai: ${avgGrade.toFixed(1)}\n- Kehadiran: ${attPercent.toFixed(1)}%\n- Tugas Selesai: ${completedTasksCount}/${totalTasksCount}\n\nTerima kasih.`;
    window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div 
      onClick={onClose}
      className="modal-container fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100000] flex items-center justify-center p-3 sm:p-6 animate-fadeIn overflow-y-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden my-auto z-[100001]"
      >
        
        {/* Header Section */}
        <div className="bg-slate-950/90 border-b border-slate-800 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-indigo-500/20 uppercase">
              {student.nama.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-100">{student.nama}</h2>
                <span className="px-2.5 py-0.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-full">
                  Kelas {student.kelas}
                </span>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  student.tanggal_lulus 
                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-300' 
                    : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                }`}>
                  {student.tanggal_lulus ? 'Alumni / Non-Aktif' : 'Siswa Aktif'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                <span>NISN: <strong className="text-slate-200 font-mono">{student.nisn || '-'}</strong></span>
                <span>•</span>
                <span>NIS/NIPD: <strong className="text-slate-200 font-mono">{student.nipd || '-'}</strong></span>
                <span>•</span>
                <span>L/P: <strong className="text-slate-200">{student.jenis_kelamin || '-'}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleWhatsAppContact}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 border border-emerald-400/30 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Hubungi Orang Tua via WhatsApp"
            >
              <Phone size={14} />
              <span className="hidden sm:inline">WhatsApp Ortu</span>
            </button>
            <button
              onClick={handlePrintDossier}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Cetak Profil Siswa"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Cetak</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick KPI Overview Cards */}
        <div className="bg-slate-900/60 p-4 sm:p-5 border-b border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
          <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Rata-Rata Nilai</span>
              <Award size={16} className={avgGrade >= kkmDefault ? 'text-amber-400' : 'text-rose-400'} />
            </div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {avgGrade > 0 ? avgGrade.toFixed(1) : '-'}
            </div>
            <p className={`text-[11px] mt-1 font-medium ${avgGrade >= kkmDefault ? 'text-emerald-400' : 'text-rose-400'}`}>
              {avgGrade > 0 ? (avgGrade >= kkmDefault ? `Tuntas (≥ KKM ${kkmDefault})` : `Di bawah KKM (${kkmDefault})`) : 'Belum ada nilai'}
            </p>
          </div>

          <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Kehadiran Siswa</span>
              <CheckSquare size={16} className={attPercent >= 80 ? 'text-emerald-400' : 'text-rose-400'} />
            </div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {totalAtt > 0 ? `${attPercent.toFixed(1)}%` : '-'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Hadir: <strong className="text-emerald-400">{countHadir}</strong> • Sakit: <strong className="text-blue-400">{countSakit}</strong> • Izin: <strong className="text-amber-400">{countIzin}</strong> • Alpa: <strong className="text-rose-400">{countAlpa}</strong>
            </p>
          </div>

          <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Pengerjaan Tugas</span>
              <FileCheck size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {totalTasksCount > 0 ? `${completedTasksCount}/${totalTasksCount}` : '0 Tugas'}
            </div>
            <p className="text-[11px] text-indigo-400 mt-1">
              {totalTasksCount > 0 ? `${taskPercent.toFixed(0)}% Selesai Dikerjakan` : 'Belum ada tugas kelas'}
            </p>
          </div>

          <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Catatan Guru</span>
              <FileText size={16} className="text-purple-400" />
            </div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {journals.length} Catatan
            </div>
            <p className="text-[11px] text-purple-400 mt-1">
              Rekam Jurnal Evaluasi Guru
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-950/80 border-b border-slate-800 px-4 pt-2 overflow-x-auto custom-scrollbar shrink-0 gap-1">
          <button
            onClick={() => setActiveTab('profil')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'profil' 
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500 shadow-md' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <User size={15} />
            <span>Profil & Identitas</span>
          </button>
          <button
            onClick={() => setActiveTab('nilai')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'nilai' 
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500 shadow-md' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Award size={15} />
            <span>Rekap Nilai ({validGrades.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('absensi')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'absensi' 
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500 shadow-md' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <CheckSquare size={15} />
            <span>Absensi ({totalAtt})</span>
          </button>
          <button
            onClick={() => setActiveTab('tugas')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tugas' 
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500 shadow-md' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileCheck size={15} />
            <span>Status Tugas ({totalTasksCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('jurnal')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'jurnal' 
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500 shadow-md' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileText size={15} />
            <span>Jurnal Guru ({journals.length})</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs">Memuat data dossier lengkap siswa...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: PROFIL & IDENTITAS */}
              {activeTab === 'profil' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                      <User size={16} className="text-indigo-400" />
                      <span>Data Identitas Siswa</span>
                    </h3>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Nama Lengkap</span>
                        <span className="font-semibold text-slate-100">{student.nama}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">NISN</span>
                        <span className="font-mono text-slate-200">{student.nisn || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">NIPD / NIS</span>
                        <span className="font-mono text-slate-200">{student.nipd || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Kelas</span>
                        <span className="font-semibold text-indigo-400">{student.kelas}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Jenis Kelamin</span>
                        <span className="text-slate-200">{student.jenis_kelamin || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Tempat, Tanggal Lahir</span>
                        <span className="text-slate-200">
                          {student.tempat_lahir || '-'}, {student.tanggal_lahir || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                      <Phone size={16} className="text-emerald-400" />
                      <span>Kontak Orang Tua & Alamat</span>
                    </h3>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Nama Ayah</span>
                        <span className="font-semibold text-slate-200">{student.nama_ayah || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Nama Ibu</span>
                        <span className="font-semibold text-slate-200">{student.nama_ibu || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">No. HP Orang Tua</span>
                        <span className="font-mono text-emerald-400 font-semibold">{student.no_telp_ortu || student.nomor_telepon || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Alamat Tempat Tinggal</span>
                        <span className="text-slate-300 max-w-[200px] text-right truncate">{student.alamat || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AKADEMIK & NILAI */}
              {activeTab === 'nilai' && (
                <div className="space-y-6">
                  {subjectChartData.length > 0 && (
                    <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
                      <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                        <TrendingUp size={16} className="text-indigo-400" />
                        <span>Grafik Rata-rata Nilai Per Mata Pelajaran vs KKM ({kkmDefault})</span>
                      </h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={subjectChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="mapel" stroke="#94a3b8" fontSize={11} angle={-15} textAnchor="end" />
                            <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                            <ReferenceLine y={kkmDefault} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: `KKM (${kkmDefault})`, fill: '#f43f5e', fontSize: 10 }} />
                            <Bar dataKey="RataRata" radius={[6, 6, 0, 0]}>
                              {subjectChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.RataRata >= kkmDefault ? '#6366f1' : '#f43f5e'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between border-b border-slate-800 pb-3">
                      <span>Rincian Seluruh Nilai Akademik</span>
                      <span className="text-xs text-slate-400">Total: {grades.length} rekaman</span>
                    </h3>
                    
                    {grades.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Belum ada nilai yang tercatat untuk siswa ini.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-semibold">
                            <tr>
                              <th className="px-3 py-2">Mata Pelajaran</th>
                              <th className="px-3 py-2">Jenis</th>
                              <th className="px-3 py-2">Nama Kolom / Tugas</th>
                              <th className="px-3 py-2">Tanggal</th>
                              <th className="px-3 py-2 text-right">Nilai</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {grades.map((g) => (
                              <tr key={g.id} className="hover:bg-slate-900/50">
                                <td className="px-3 py-2 font-medium text-slate-200">{g.mata_pelajaran || 'Umum'}</td>
                                <td className="px-3 py-2">{g.jenis_nilai}</td>
                                <td className="px-3 py-2">{g.nama_kolom}</td>
                                <td className="px-3 py-2 text-slate-400">{g.tanggal || '-'}</td>
                                <td className="px-3 py-2 text-right font-bold font-mono text-slate-100">{g.nilai}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    g.nilai >= kkmDefault ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {g.nilai >= kkmDefault ? 'Tuntas' : 'Remidi'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: ABSENSI & KEHADIRAN */}
              {activeTab === 'absensi' && (
                <div className="space-y-6">
                  {attendancePieData.length > 0 && (
                    <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="w-full md:w-1/2 h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={attendancePieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              paddingAngle={3}
                            >
                              {attendancePieData.map((entry, index) => (
                                <Cell key={`cell-pie-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="w-full md:w-1/2 space-y-2 text-xs">
                        <h4 className="font-bold text-slate-200 mb-2">Persentase Kehadiran: <span className="text-emerald-400">{attPercent.toFixed(1)}%</span></h4>
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex justify-between items-center">
                          <span className="text-slate-300 font-medium">Hadir</span>
                          <span className="font-bold text-emerald-400">{countHadir} hari</span>
                        </div>
                        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex justify-between items-center">
                          <span className="text-slate-300 font-medium">Sakit</span>
                          <span className="font-bold text-blue-400">{countSakit} hari</span>
                        </div>
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex justify-between items-center">
                          <span className="text-slate-300 font-medium">Izin</span>
                          <span className="font-bold text-amber-400">{countIzin} hari</span>
                        </div>
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex justify-between items-center">
                          <span className="text-slate-300 font-medium">Alpa / Tanpa Keterangan</span>
                          <span className="font-bold text-rose-400">{countAlpa} hari</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3">Riwayat Absensi Terakhir</h3>
                    {attendances.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Belum ada riwayat absensi untuk siswa ini.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-semibold">
                            <tr>
                              <th className="px-3 py-2">Tanggal</th>
                              <th className="px-3 py-2">Mata Pelajaran</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {attendances.slice(-15).reverse().map((a) => (
                              <tr key={a.id} className="hover:bg-slate-900/50">
                                <td className="px-3 py-2 font-mono text-slate-300">{a.tanggal}</td>
                                <td className="px-3 py-2">{a.mata_pelajaran || 'Umum / Harian'}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    a.status === 'Hadir' ? 'bg-emerald-500/20 text-emerald-400' :
                                    a.status === 'Sakit' ? 'bg-blue-500/20 text-blue-400' :
                                    a.status === 'Izin' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {a.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: STATUS TUGAS */}
              {activeTab === 'tugas' && (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 flex justify-between items-center">
                      <span>Daftar Tugas Kelas ({student.kelas})</span>
                      <span className="text-xs text-indigo-400 font-normal">
                        Selesai: {completedTasksCount} / {totalTasksCount} ({taskPercent.toFixed(0)}%)
                      </span>
                    </h3>

                    {tasks.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Belum ada tugas yang diberikan untuk kelas ini.</p>
                    ) : (
                      <div className="space-y-2">
                        {tasks.map((t) => {
                          const isDone = t.penyelesaian && t.penyelesaian[student.id];
                          return (
                            <div key={t.id} className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-xs font-bold text-slate-200">{t.judul}</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {t.mata_pelajaran} • Diberikan: {t.tanggal_diberikan} {t.tanggal_kumpul ? `• Tenggat: ${t.tanggal_kumpul}` : ''}
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                isDone 
                                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' 
                                  : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                              }`}>
                                {isDone ? 'Sudah Selesai' : 'Belum Selesai'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: JURNAL GURU */}
              {activeTab === 'jurnal' && (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3">
                      Catatan Perilaku & Evaluasi Guru
                    </h3>

                    {journals.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Belum ada catatan khusus jurnal untuk siswa ini.</p>
                    ) : (
                      <div className="space-y-3">
                        {journals.map((j) => (
                          <div key={j.id} className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-indigo-400">{(j as any).mata_pelajaran || 'Jurnal Wali Kelas'}</span>
                              <span className="text-slate-500 font-mono">{j.tanggal || '-'}</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{j.catatan || (j as any).materi || '-'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
