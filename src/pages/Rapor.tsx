import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { store, Student, Grade, Settings, RaporCapaian, Attendance, getSubjectKKM } from '../lib/store';
import { FileText, Save, Download, User, CheckSquare, Calendar as CalendarIcon, Settings as SettingsIcon, Printer, ChevronDown, ChevronUp, X, Edit3, Trash2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';

export default function Rapor({ settings, setSettings, semester, role = 'guru' }: { settings: Settings | null, setSettings?: (s: Settings | null) => void, semester: string, role?: 'guru' | 'kepsek' }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [capaian, setCapaian] = useState<RaporCapaian[]>([]);
  
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [piagamTemplate, setPiagamTemplate] = useState<'classic' | 'modern' | 'emerald' | 'creative'>('classic');
  
  // Settings
  const [includeHarian, setIncludeHarian] = useState(true);
  const [includeTugas, setIncludeTugas] = useState(true);
  const [includeUjian, setIncludeUjian] = useState(true);
  const [includeHarianBulanan, setIncludeHarianBulanan] = useState(true);
  const [includeTugasBulanan, setIncludeTugasBulanan] = useState(true);
  const [includeUjianBulanan, setIncludeUjianBulanan] = useState(false);
  const [raporType, setRaporType] = useState<'bulanan' | 'semester'>('semester');
  const [formatRaporBulanan, setFormatRaporBulanan] = useState<'lama' | 'baru'>('baru');
  const [labelBulanBulananBaru, setLabelBulanBulananBaru] = useState<string>('JULI / AGUSTUS');
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showTeacherComments, setShowTeacherComments] = useState<boolean>(true);
  const [showMonthlyPrintModal, setShowMonthlyPrintModal] = useState<boolean>(false);
  const [pendingPrintStudentIds, setPendingPrintStudentIds] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [signatureDate, setSignatureDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [signaturePlace, setSignaturePlace] = useState<string>('Jakarta');
  
  // Bobot & KKM States
  const [bobotHarian, setBobotHarian] = useState<number>(30);
  const [bobotTugas, setBobotTugas] = useState<number>(30);
  const [bobotUjian, setBobotUjian] = useState<number>(40);
  const [kkmBulanan, setKkmBulanan] = useState<number>(75);

  // Posisi: 'left', 'center', 'right', 'hidden'
  const [posWaliKelas, setPosWaliKelas] = useState<'left'|'center'|'right'|'hidden'>('right');
  const [posOrangTua, setPosOrangTua] = useState<'left'|'center'|'right'|'hidden'>('left');
  const [posKepsek, setPosKepsek] = useState<'left'|'center'|'right'|'hidden'>('hidden');
  const [useKopSurat, setUseKopSurat] = useState<boolean>(settings?.tampilkan_kop_surat ?? true);

  // Input States for Capaian
  const [formData, setFormData] = useState<Partial<RaporCapaian>>({});
  const [activeTab, setActiveTab] = useState<'cetak' | 'urutan' | 'rekap' | 'piagan'>('cetak');
  const [urutanMapel, setUrutanMapel] = useState<string[]>([]);
  
  // Piagam States
  const [piagamSiswaId, setPiagamSiswaId] = useState<string>('');
  const [piagamJuara, setPiagamJuara] = useState<string>('Juara 1');
  const [piagamKategori, setPiagamKategori] = useState<string>('Peringkat Kelas Terbaik');
  const [piagamNo, setPiagamNo] = useState<string>('001/PP/2026');

  // Preset management states
  const [presetManagerType, setPresetManagerType] = useState<'capaian' | 'catatan' | null>(null);
  const [editingPresetIdx, setEditingPresetIdx] = useState<number | null>(null);
  const [editingPresetText, setEditingPresetText] = useState<string>('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const defaultCapaianPresets = [
    "Menunjukkan penguasaan kompetensi yang sangat baik dalam memahami konsep-konsep materi serta mampu menerapkannya dalam tugas-tugas harian dengan mandiri.",
    "Perlu bimbingan dan pendampingan yang lebih tekun terutama dalam menganalisis soal cerita dan menerapkan teori ke dalam praktik pembelajaran.",
    "Memiliki kemauan belajar yang tinggi, sangat baik dalam berdiskusi kelompok, serta aktif berpartisipasi menyampaikan ide-ide kreatif di kelas.",
    "Menunjukkan pemahaman yang stabil di semua mata pelajaran, dengan kemampuan berpikir kritis yang terus berkembang dari waktu ke waktu.",
    "Secara umum telah mencapai kriteria ketuntasan minimal, namun masih memerlukan latihan tambahan untuk memperkuat pemahaman konsep dasar yang esensial."
  ];

  const defaultCatatanPresets = [
    "Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi inspirasi bagi teman-temanmu.",
    "Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan, fokus belajar di kelas, dan kurangi hal-hal yang dapat mengalihkan konsentrasimu.",
    "Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan tingkatkan kehadiranmu di kelas.",
    "Ananda menunjukkan sikap yang sangat baik dan aktif dalam setiap pembelajaran. Pertahankan semangat ini di semester berikutnya!",
    "Terus asah bakat dan minatmu, baik akademik maupun non-akademik. Semangat belajar harus tetap menyala demi masa depan yang gemilang!"
  ];

  useEffect(() => {
    if (settings) {
      if (raporType === 'bulanan') {
        setBobotHarian(settings.bobot_harian_bulanan !== undefined ? settings.bobot_harian_bulanan : 50);
        setBobotTugas(settings.bobot_tugas_bulanan !== undefined ? settings.bobot_tugas_bulanan : 50);
        setBobotUjian(settings.bobot_ujian_bulanan !== undefined ? settings.bobot_ujian_bulanan : 0);
        setIncludeHarianBulanan(settings.include_harian_bulanan !== undefined ? settings.include_harian_bulanan : true);
        setIncludeTugasBulanan(settings.include_tugas_bulanan !== undefined ? settings.include_tugas_bulanan : true);
        setIncludeUjianBulanan(settings.include_ujian_bulanan !== undefined ? settings.include_ujian_bulanan : false);
        setKkmBulanan(settings.kkm_bulanan !== undefined ? settings.kkm_bulanan : 75);
      } else {
        setBobotHarian(settings.bobot_harian !== undefined ? settings.bobot_harian : 30);
        setBobotTugas(settings.bobot_tugas !== undefined ? settings.bobot_tugas : 30);
        setBobotUjian(settings.bobot_ujian !== undefined ? settings.bobot_ujian : 40);
        setIncludeHarian(settings.include_harian !== undefined ? settings.include_harian : true);
        setIncludeTugas(settings.include_tugas !== undefined ? settings.include_tugas : true);
        setIncludeUjian(settings.include_ujian !== undefined ? settings.include_ujian : true);
      }
      setUrutanMapel(settings.urutan_mata_pelajaran_rapor && settings.urutan_mata_pelajaran_rapor.length > 0 ? settings.urutan_mata_pelajaran_rapor : settings.mata_pelajaran || []);
      if (typeof settings.tampilkan_kop_surat === 'boolean') setUseKopSurat(settings.tampilkan_kop_surat);
    }
  }, [settings, raporType]);

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    if (isRestrictedClass && assignedClasses.length > 0) {
      if (filterKelas === 'all' || !assignedClasses.some(c => c.toLowerCase() === filterKelas.toLowerCase())) {
        setFilterKelas(assignedClasses[0]);
      }
    }
  }, [isRestrictedClass, assignedClasses]);

  useEffect(() => {
    loadData();
    window.addEventListener('data-changed', loadData);
    return () => window.removeEventListener('data-changed', loadData);
  }, [semester]);

  const loadData = async () => {
    const sList: Student[] = [];
    const gList: Grade[] = [];
    const aList: Attendance[] = [];
    const cList: RaporCapaian[] = [];

    await store.students.iterate((s: Student) => {
      if (s.kelas && s.kelas.toLowerCase() === 'alumni') return;
      sList.push(s);
    });
    const userFilteredStudents = filterStudentsForUser(currentUser, sList);
    userFilteredStudents.sort((a, b) => a.nama.localeCompare(b.nama));
    setStudents(userFilteredStudents);

    const studentClassMap: Record<string, string> = {};
    sList.forEach(s => {
      if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
    });

    await store.grades.iterate((g: Grade) => {
      if (g.semester === semester) gList.push(g);
    });
    setGrades(filterRecordsForUser(currentUser, gList, studentClassMap));

    await store.attendance.iterate((a: Attendance) => {
      if (a.semester === semester) aList.push(a);
    });
    setAttendances(filterRecordsForUser(currentUser, aList, studentClassMap));

    await store.raporCapaian.iterate((c: RaporCapaian) => {
      if (c.semester === semester) cList.push(c);
    });
    setCapaian(filterRecordsForUser(currentUser, cList, studentClassMap));

    if (userFilteredStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(userFilteredStudents[0].id);
    }
  };

  const getAutoCapaianAndCatatan = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || !settings) {
      return { capaian: '', catatan: '' };
    }

    const gradesData = getStudentGrades(studentId);
    const att = getAttendanceSummary(studentId);

    // Let's analyze grades
    const mapelAverages = urutanMapel.map(mapel => {
      const g = gradesData[mapel];
      return { mapel, final: g?.final || 0 };
    }).filter(m => m.final > 0);

    let highestMapel = '';
    let lowestMapel = '';
    let highestVal = -1;
    let lowestVal = 101;

    mapelAverages.forEach(m => {
      if (m.final > highestVal) {
        highestVal = m.final;
        highestMapel = m.mapel;
      }
      if (m.final < lowestVal) {
        lowestVal = m.final;
        lowestMapel = m.mapel;
      }
    });

    // Auto-generate capaian kompetensi
    let generatedCapaian = '';
    if (mapelAverages.length > 0) {
      generatedCapaian += `Menunjukkan penguasaan kompetensi yang sangat baik pada mata pelajaran ${highestMapel} dengan nilai ${highestVal.toFixed(1)}. `;
      if (lowestMapel && lowestMapel !== highestMapel) {
        generatedCapaian += `Perlu peningkatan pemahaman dan bimbingan yang lebih tekun pada mata pelajaran ${lowestMapel} agar mencapai hasil belajar yang lebih optimal.`;
      }
    } else {
      generatedCapaian = 'Belum ada data nilai yang terekam pada periode ini.';
    }

    // Auto-generate catatan wali kelas
    let generatedCatatan = '';
    const avgScore = mapelAverages.length > 0 
      ? mapelAverages.reduce((acc, m) => acc + m.final, 0) / mapelAverages.length 
      : 0;

    if (avgScore >= 85) {
      generatedCatatan = `Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi teladan yang baik bagi teman-temanmu.`;
    } else if (avgScore >= 75) {
      generatedCatatan = `Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan dan fokus belajar di kelas agar nilaimu bisa meningkat di masa depan.`;
    } else {
      generatedCatatan = `Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan kurangi bermain agar nilaimu dapat membaik.`;
    }

    if (att.sakit > 0 || att.izin > 0 || att.alpa > 0) {
      const detailAbsensi = [
        att.sakit > 0 ? `${att.sakit} kali sakit` : null,
        att.izin > 0 ? `${att.izin} kali izin` : null,
        att.alpa > 0 ? `${att.alpa} kali alpa` : null
      ].filter(Boolean).join(', ');
      generatedCatatan += ` Catatan kehadiran: terdata ketidakhadiran sebanyak ${detailAbsensi}. Harap tingkatkan persentase kehadiran di sekolah.`;
    } else {
      generatedCatatan += ` Tingkat kehadiran sangat baik (100% Hadir). Pertahankan kedisiplinanmu!`;
    }

    return { capaian: generatedCapaian, catatan: generatedCatatan };
  };

  useEffect(() => {
    if (selectedStudentId && students.length > 0 && settings) {
      const existing = capaian.find(c => c.id_siswa === selectedStudentId);
      if (existing) {
        setFormData({
          id_siswa: selectedStudentId,
          semester: semester,
          capaian_kompetensi: existing.capaian_kompetensi || '',
          catatan_wali_kelas: existing.catatan_wali_kelas || '',
          saran_orang_tua: existing.saran_orang_tua || '',
          tinggi_badan: existing.tinggi_badan || '',
          berat_badan: existing.berat_badan || '',
          pendengaran: existing.pendengaran || '',
          penglihatan: existing.penglihatan || '',
          gigi: existing.gigi || '',
          kokurikuler: existing.kokurikuler || '',
          ekstra_nama_1: existing.ekstra_nama_1 || '',
          ekstra_ket_1: existing.ekstra_ket_1 || '',
          ekstra_nama_2: existing.ekstra_nama_2 || '',
          ekstra_ket_2: existing.ekstra_ket_2 || '',
          kenaikan_kelas: existing.kenaikan_kelas || '',
          id: existing.id
        });
      } else {
        const auto = getAutoCapaianAndCatatan(selectedStudentId);
        setFormData({
          id_siswa: selectedStudentId,
          semester: semester,
          capaian_kompetensi: auto.capaian,
          catatan_wali_kelas: auto.catatan,
          saran_orang_tua: '',
          tinggi_badan: '',
          berat_badan: '',
          pendengaran: '',
          penglihatan: '',
          gigi: '',
          kokurikuler: '',
          ekstra_nama_1: '',
          ekstra_ket_1: '',
          ekstra_nama_2: '',
          ekstra_ket_2: '',
          kenaikan_kelas: ''
        });
      }
    }
  }, [selectedStudentId, capaian, semester, students, settings]);

  const handleSaveCapaian = async () => {
    if (!selectedStudentId) return;
    try {
      const dataToSave = {
        ...formData,
        id: formData.id || uuidv4(),
        id_siswa: selectedStudentId,
        semester
      } as RaporCapaian;
      
      await store.raporCapaian.setItem(dataToSave.id, dataToSave);
      toast.success('Profil capaian berhasil disimpan');
      loadData(); // refresh state
    } catch (error) {
      toast.error('Gagal menyimpan profil capaian');
    }
  };

  const getStudentGrades = (studentId: string) => {
    const studentGrades = grades.filter(g => {
      if (g.id_siswa !== studentId) return false;
      if (raporType === 'bulanan' && selectedMonth !== 'all') {
        if (!g.tanggal) return false;
        const parts = g.tanggal.split('-');
        if (parts.length >= 2 && parts[1] !== selectedMonth) {
          return false;
        }
      }
      return true;
    });
    const curIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
    const curIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
    const curIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

    const result: Record<string, { harian: number[], tugas: number[], ujian: number[], avgHarian: number, avgTugas: number, avgUjian: number, final: number, predikat: string }> = {};

    urutanMapel.forEach(mapel => {
      const mapelGrades = studentGrades.filter(g => g.mata_pelajaran === mapel);
      const harian = mapelGrades.filter(g => g.jenis_nilai === 'Harian').map(g => g.nilai);
      const tugas = mapelGrades.filter(g => g.jenis_nilai === 'Tugas').map(g => g.nilai);
      const ujian = mapelGrades.filter(g => g.jenis_nilai === 'Ujian').map(g => g.nilai);

      const avgHarian = harian.length > 0 ? harian.reduce((a, b) => a + b, 0) / harian.length : 0;
      const avgTugas = tugas.length > 0 ? tugas.reduce((a, b) => a + b, 0) / tugas.length : 0;
      const avgUjian = ujian.length > 0 ? ujian.reduce((a, b) => a + b, 0) / ujian.length : 0;

      let final = 0;
      let totalBobot = 0;
      
      if (curIncludeHarian) {
        final += avgHarian * (bobotHarian / 100);
        totalBobot += bobotHarian;
      }
      if (curIncludeTugas) {
        final += avgTugas * (bobotTugas / 100);
        totalBobot += bobotTugas;
      }
      if (curIncludeUjian) {
        final += avgUjian * (bobotUjian / 100);
        totalBobot += bobotUjian;
      }

      // Normalize if totalBobot is not 100
      if (totalBobot > 0 && totalBobot !== 100) {
        final = final * (100 / totalBobot);
      }

      let predikat = 'D';
      if (final >= 90) predikat = 'A';
      else if (final >= 80) predikat = 'B';
      else if (final >= 75) predikat = 'C';

      result[mapel] = { harian, tugas, ujian, avgHarian, avgTugas, avgUjian, final, predikat };
    });

    return result;
  };

  const getAttendanceSummary = (studentId: string) => {
    const studentAtt = attendances.filter(a => {
      if (a.id_siswa !== studentId) return false;
      if (raporType === 'bulanan' && selectedMonth !== 'all') {
        if (!a.tanggal) return false;
        const parts = a.tanggal.split('-');
        if (parts.length >= 2 && parts[1] !== selectedMonth) {
          return false;
        }
      }
      return true;
    });
    let sakit = 0, izin = 0, alpa = 0;
    studentAtt.forEach(a => {
      if (a.status === 'Sakit') sakit++;
      if (a.status === 'Izin') izin++;
      if (a.status === 'Alpa') alpa++;
    });
    return { sakit, izin, alpa };
  };

  const getRankedStudents = () => {
    const studentData = students.map(student => {
      const gradesData = getStudentGrades(student.id);
      
      let total = 0;
      let count = 0;
      urutanMapel.forEach(mapel => {
        const val = gradesData[mapel]?.final || 0;
        total += val;
        count++;
      });
      const avg = count > 0 ? total / count : 0;
      
      return {
        student,
        total,
        avg,
        gradesData
      };
    });

    // Sort descending by avg/total
    studentData.sort((a, b) => b.avg - a.avg);

    // Assign rank, handling ties
    let currentRank = 1;
    const ranked = studentData.map((item, idx) => {
      if (idx > 0 && Math.abs(studentData[idx - 1].avg - item.avg) > 0.001) {
        currentRank = idx + 1;
      }
      return {
        ...item,
        rank: currentRank
      };
    });

    return ranked;
  };

  const handleExportRekapRankingPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape is better for many columns!
    const pageWidth = doc.internal.pageSize.width;
    let startY = 18;

    if (useKopSurat) {
      // Draw Kop Surat
      const pda = settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN';
      const dinas = settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
      const sekolah = settings?.nama_sekolah || 'NAMA SEKOLAH BELUM DIATUR';
      const alamat = settings?.alamat || 'Alamat Sekolah Belum Diatur';
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(pda.toUpperCase(), pageWidth / 2, 12, { align: 'center' });
      doc.text(dinas.toUpperCase(), pageWidth / 2, 17, { align: 'center' });
      doc.setFontSize(14);
      doc.text(sekolah.toUpperCase(), pageWidth / 2, 23, { align: 'center' });
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Alamat: ${alamat}`, pageWidth / 2, 28, { align: 'center' });
      
      doc.setLineWidth(0.8);
      doc.line(14, 31, pageWidth - 14, 31);
      doc.setLineWidth(0.2);
      doc.line(14, 32.2, pageWidth - 14, 32.2);

      startY = 40;
    }
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`REKAPITULASI HASIL BELAJAR & PERINGKAT SISWA`, 14, startY);
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Kelas: ${settings?.nama_kelas || ''} | Semester: ${semester} | Periode Rapor: ${raporType === 'bulanan' ? 'Bulanan' : 'Semester'}`, 14, startY + 5);
    
    const ranked = getRankedStudents();
    const headers = ['No', 'Peringkat', 'Nama Siswa', ...urutanMapel, 'Total', 'Rata-rata'];
    const rows = ranked.map((item, idx) => {
      const row: any[] = [
        idx + 1,
        item.rank,
        item.student.nama
      ];
      urutanMapel.forEach(mapel => {
        row.push(item.gradesData[mapel]?.final?.toFixed(1) || '0.0');
      });
      row.push(item.total.toFixed(1));
      row.push(item.avg.toFixed(1));
      return row;
    });
    
    autoTable(doc, {
      startY: startY + 10,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [49, 46, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18, fontStyle: 'bold' },
        2: { cellWidth: 40, fontStyle: 'bold' }
      }
    });
    
    doc.save(`Rekap_Ranking_${semester}_Kelas_${settings?.nama_kelas || ''}.pdf`);
  };

  const handleExportRekapRankingExcel = () => {
    const ranked = getRankedStudents();
    const data = ranked.map((item, idx) => {
      const row: any = {
        'No': idx + 1,
        'Peringkat': item.rank,
        'Nama Siswa': item.student.nama,
        'NISN': item.student.nisn || '-',
      };
      urutanMapel.forEach(mapel => {
        row[mapel] = item.gradesData[mapel]?.final || 0;
      });
      row['Total Nilai'] = item.total;
      row['Rata-rata'] = item.avg;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Ranking");
    XLSX.writeFile(wb, `Rekap_Ranking_${semester}_Kelas_${settings?.nama_kelas || ''}.xlsx`);
  };

  const handlePrintPiagam = (studentId: string, juara: string, kategori: string, no: string, template: 'classic' | 'modern' | 'emerald' | 'creative' = 'classic') => {
    const student = students.find(s => s.id === studentId);
    if (!student) {
      toast.error('Pilih siswa terlebih dahulu');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const w = 297;
    const h = 210;

    // Define color presets
    let primaryColor = [30, 41, 59]; // Slate 800
    let accentColor = [194, 120, 3]; // Gold
    let textColor = [51, 65, 85]; // Slate 700
    let darkTextColor = [30, 41, 59]; // Slate 800
    let lightTextColor = [71, 85, 105]; // Slate 600

    if (template === 'modern') {
      primaryColor = [79, 70, 229]; // Indigo
      accentColor = [99, 102, 241]; // Light Indigo
      textColor = [51, 65, 85];
      darkTextColor = [30, 41, 59];
      lightTextColor = [100, 116, 139];
    } else if (template === 'emerald') {
      primaryColor = [6, 78, 59]; // Emerald 900
      accentColor = [5, 150, 105]; // Emerald 600
      textColor = [31, 41, 55];
      darkTextColor = [17, 24, 39];
      lightTextColor = [75, 85, 99];
    } else if (template === 'creative') {
      primaryColor = [15, 118, 110]; // Teal 700
      accentColor = [13, 148, 136]; // Teal 600
      textColor = [15, 23, 42];
      darkTextColor = [2, 6, 23];
      lightTextColor = [71, 85, 105];
    }

    // --- DRAW BORDERS & ORNAMENTS ---
    if (template === 'classic') {
      // Outer thin border
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.rect(10, 10, w - 20, h - 20);

      // Inner thick border
      doc.setDrawColor(194, 120, 3); // Gold
      doc.setLineWidth(1.5);
      doc.rect(13, 13, w - 26, h - 26);

      // Corner decorations
      doc.setFillColor(194, 120, 3);
      const corners = [
        { x: 13, y: 13 },
        { x: w - 13, y: 13 },
        { x: 13, y: h - 13 },
        { x: w - 13, y: h - 13 }
      ];
      corners.forEach(c => {
        doc.rect(c.x - 3, c.y - 3, 6, 6, 'FD');
      });
    } else if (template === 'modern') {
      // Sleek Indigo Border
      doc.setDrawColor(79, 70, 229); // Indigo
      doc.setLineWidth(0.8);
      doc.rect(12, 12, w - 24, h - 24);

      doc.setDrawColor(224, 231, 255); // Indigo 100
      doc.setLineWidth(0.3);
      doc.rect(14, 14, w - 28, h - 28);

      // Minimalist corners
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(1.2);
      // Top Left
      doc.line(8, 16, 20, 16);
      doc.line(16, 8, 16, 20);
      // Top Right
      doc.line(w - 8, 16, w - 20, 16);
      doc.line(w - 16, 8, w - 16, 20);
      // Bottom Left
      doc.line(8, h - 16, 20, h - 16);
      doc.line(16, h - 8, 16, h - 20);
      // Bottom Right
      doc.line(w - 8, h - 16, w - 20, h - 16);
      doc.line(w - 16, h - 8, w - 16, h - 20);
    } else if (template === 'emerald') {
      // Emerald Border with inner gold accent
      doc.setDrawColor(6, 78, 59); // Emerald 900
      doc.setLineWidth(2.0);
      doc.rect(11, 11, w - 22, h - 22);

      doc.setDrawColor(217, 119, 6); // Gold/Amber 600
      doc.setLineWidth(0.5);
      doc.rect(14, 14, w - 28, h - 28);

      // Diamond corner ornaments
      doc.setFillColor(6, 78, 59);
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.5);
      const diamondCorners = [
        { x: 14, y: 14 },
        { x: w - 14, y: 14 },
        { x: 14, y: h - 14 },
        { x: w - 14, y: h - 14 }
      ];
      diamondCorners.forEach(c => {
        doc.triangle(c.x, c.y - 3, c.x - 3, c.y, c.x, c.y + 3, 'FD');
        doc.triangle(c.x, c.y - 3, c.x + 3, c.y, c.x, c.y + 3, 'FD');
      });
    } else if (template === 'creative') {
      // Creative Teal template
      doc.setDrawColor(15, 118, 110); // Teal 700
      doc.setLineWidth(1.5);
      doc.rect(10, 10, w - 20, h - 20);

      doc.setDrawColor(45, 212, 191); // Teal 400
      doc.setLineWidth(0.5);
      doc.rect(12.5, 12.5, w - 25, h - 25);

      // Creative brackets in corners
      doc.setDrawColor(13, 148, 136); // Teal 600
      doc.setLineWidth(1.8);
      // Top Left
      doc.line(12.5, 12.5, 12.5 + 12, 12.5);
      doc.line(12.5, 12.5, 12.5, 12.5 + 12);
      // Top Right
      doc.line(w - 12.5, 12.5, w - 12.5 - 12, 12.5);
      doc.line(w - 12.5, 12.5, w - 12.5, 12.5 + 12);
      // Bottom Left
      doc.line(12.5, h - 12.5, 12.5 + 12, h - 12.5);
      doc.line(12.5, h - 12.5, 12.5, h - 12.5 - 12);
      // Bottom Right
      doc.line(w - 12.5, h - 12.5, w - 12.5 - 12, h - 12.5);
      doc.line(w - 12.5, h - 12.5, w - 12.5, h - 12.5 - 12);
    }

    // --- Header ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text('KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI', w / 2, 19, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(28); // Increased from 22 for emphasis as requested!
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text((settings?.nama_sekolah || 'NAMA SEKOLAH').toUpperCase(), w / 2, 29, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text(`Alamat: ${settings?.alamat || 'Alamat Sekolah Belum Diatur'}`, w / 2, 35, { align: 'center' });

    // Premium dual horizontal line as header ribbon
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(1.2);
    doc.line(30, 39, w - 30, 39);

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(45, 41, w - 45, 41);

    // --- Title ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text('PIAGAM PENGHARGAAN', w / 2, 54, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    if (no && no.trim() !== '') {
      doc.text(`Nomor: ${no}`, w / 2, 60, { align: 'center' });
    }

    // --- Body ---
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text('Diberikan Kepada:', w / 2, 71, { align: 'center' });

    // Student Name (Large and elegant)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(student.nama.toUpperCase(), w / 2, 82, { align: 'center' });

    // Accent line below name
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(60, 86, w - 60, 86);

    // As Juara...
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text('sebagai', w / 2, 93, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(`${juara.toUpperCase()} - ${kategori.toUpperCase()}`, w / 2, 103, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text(`Dalam Kelas ${student.kelas || settings?.nama_kelas || ''} Semester ${semester}`, w / 2, 111, { align: 'center' });
    doc.text('Atas prestasi luar biasa, dedikasi belajar, dan akhlak mulia yang ditunjukkan.', w / 2, 117, { align: 'center' });

    // --- Elegant Rosette Seal / Badge with Ribbons ---
    const sealX = w / 2;
    const sealY = 132;
    
    // 1. Draw hanging ribbon tails
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    
    // Left Ribbon Polygon
    doc.triangle(sealX - 4, sealY + 3, sealX - 0.5, sealY + 3, sealX - 2.5, sealY + 17, 'F');
    doc.triangle(sealX - 4, sealY + 3, sealX - 2.5, sealY + 17, sealX - 6, sealY + 17, 'F');
    // Left Ribbon V-notch subtract (drawn in white page color)
    doc.setFillColor(255, 255, 255);
    doc.triangle(sealX - 6, sealY + 17, sealX - 2.5, sealY + 17, sealX - 4.25, sealY + 14.5, 'F');

    // Right Ribbon Polygon
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.triangle(sealX + 0.5, sealY + 3, sealX + 4, sealY + 3, sealX + 2.5, sealY + 17, 'F');
    doc.triangle(sealX + 4, sealY + 3, sealX + 2.5, sealY + 17, sealX + 6, sealY + 17, 'F');
    // Right Ribbon V-notch subtract
    doc.setFillColor(255, 255, 255);
    doc.triangle(sealX + 2.5, sealY + 17, sealX + 6, sealY + 17, sealX + 4.25, sealY + 14.5, 'F');

    // 2. Draw outer scallops of the rosette badge
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    const radiusScallops = 2.2;
    const distanceScallops = 7.5;
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    angles.forEach(angle => {
      const rad = (angle * Math.PI) / 180;
      const scallopX = sealX + distanceScallops * Math.cos(rad);
      const scallopY = sealY + distanceScallops * Math.sin(rad);
      doc.circle(scallopX, scallopY, radiusScallops, 'F');
    });

    // 3. Draw the shiny gold main ring over the petals
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.circle(sealX, sealY, 8.5, 'F');

    // 4. Draw a gold border outline ring for texture
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(sealX, sealY, 7.8, 'D');

    // 5. Draw the rich primary color core circle
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.circle(sealX, sealY, 6.8, 'F');

    // 6. Internal medal star symbol - Drawn geometrically for perfect PDF rendering with no encoding/font bugs (no "&" sign)
    const drawStar = (docObj: any, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, fillColor: number[]) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;
      docObj.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
      const points: {x: number, y: number}[] = [];
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        points.push({ x, y });
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        points.push({ x, y });
        rot += step;
      }
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        docObj.triangle(cx, cy, p1.x, p1.y, p2.x, p2.y, 'F');
      }
    };
    drawStar(doc, sealX, sealY, 5, 2.8, 1.1, [255, 255, 255]);

    // --- Signatures ---
    const dateFormatted = format(new Date(signatureDate), 'd MMMM yyyy', { locale: id });
    const placeAndDate = `${signaturePlace}, ${dateFormatted}`;

    doc.setFontSize(10);
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(placeAndDate, w - 70, 142, { align: 'center' });

    // Wali Kelas
    doc.setFont('Helvetica', 'normal');
    doc.text('Wali Kelas,', 70, 148, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '____________________', 70, 172, { align: 'center' });
    
    // Solid line under signature name
    doc.setDrawColor(textColor[0], textColor[1], textColor[2]);
    doc.setLineWidth(0.2);
    doc.line(45, 174, 95, 174);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`NIP. ${settings?.nip_wali_kelas || '-'}`, 70, 179, { align: 'center' });

    // Kepala Sekolah
    doc.setFontSize(10);
    doc.text('Kepala Sekolah,', w - 70, 148, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_kepala_sekolah || '____________________', w - 70, 172, { align: 'center' });
    
    // Solid line under signature name
    doc.line(w - 95, 174, w - 45, 174);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`NIP. ${settings?.nip_kepala_sekolah || '-'}`, w - 70, 179, { align: 'center' });

    // Save PDF
    doc.save(`Piagam_${student.nama.replace(/\s+/g, '_')}_${juara.replace(/\s+/g, '_')}.pdf`);
    toast.success(`Berhasil mencetak piagam untuk ${student.nama}!`);
  };

  const handleTarikData = () => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student || !settings) {
      toast.error('Silakan pilih siswa terlebih dahulu');
      return;
    }

    const auto = getAutoCapaianAndCatatan(student.id);

    setFormData(prev => ({
      ...prev,
      capaian_kompetensi: auto.capaian,
      catatan_wali_kelas: auto.catatan
    }));

    toast.success('Berhasil menarik & menganalisis data nilai dan absensi siswa dari database!');
  };

  const handleSavePreset = async (type: 'capaian' | 'catatan', text: string) => {
    if (!text || text.trim() === '') {
      toast.error('Teks tidak boleh kosong.');
      return;
    }
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const existing = settings[key] || [];
    
    if (existing.includes(text)) {
      toast.error('Preset ini sudah ada.');
      return;
    }

    const newSettings = { ...settings, [key]: [...existing, text] };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menyimpan preset baru!');
    } catch (error) {
      toast.error('Gagal menyimpan preset.');
    }
  };

  const handleSaveUrutan = async () => {
    if (!settings || !setSettings) return;
    const newSettings = { ...settings, urutan_mata_pelajaran_rapor: urutanMapel };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Urutan mata pelajaran rapor berhasil disimpan!');
    } catch (e) {
      toast.error('Gagal menyimpan urutan');
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newArr = [...urutanMapel];
    const temp = newArr[index - 1];
    newArr[index - 1] = newArr[index];
    newArr[index] = temp;
    setUrutanMapel(newArr);
  };

  const moveDown = (index: number) => {
    if (index === urutanMapel.length - 1) return;
    const newArr = [...urutanMapel];
    const temp = newArr[index + 1];
    newArr[index + 1] = newArr[index];
    newArr[index] = temp;
    setUrutanMapel(newArr);
  };
  const handleSaveBobot = async () => {
    if (!settings || !setSettings) return;
    
    const curIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
    const curIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
    const curIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

    const total = (curIncludeHarian ? bobotHarian : 0) + (curIncludeTugas ? bobotTugas : 0) + (curIncludeUjian ? bobotUjian : 0);
    if (total !== 100) {
      toast.error(`Total bobot aktif harus 100%! Saat ini: ${total}%`);
      return;
    }

    const newSettings = {
      ...settings,
      ...(raporType === 'bulanan' ? {
        bobot_harian_bulanan: bobotHarian,
        bobot_tugas_bulanan: bobotTugas,
        bobot_ujian_bulanan: bobotUjian,
        include_harian_bulanan: includeHarianBulanan,
        include_tugas_bulanan: includeTugasBulanan,
        include_ujian_bulanan: includeUjianBulanan,
        kkm_bulanan: kkmBulanan,
      } : {
        bobot_harian: bobotHarian,
        bobot_tugas: bobotTugas,
        bobot_ujian: bobotUjian,
        include_harian: includeHarian,
        include_tugas: includeTugas,
        include_ujian: includeUjian,
      })
    };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Bobot nilai berhasil disimpan ke pengaturan!');
    } catch (e) {
      toast.error('Gagal menyimpan bobot nilai');
    }
  };

  const handleEditPreset = async (type: 'capaian' | 'catatan', index: number, newText: string) => {
    if (!newText || newText.trim() === '') {
      toast.error('Preset tidak boleh kosong.');
      return;
    }
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const templates = [...(settings[key] && settings[key].length > 0 ? settings[key] : (type === 'capaian' ? defaultCapaianPresets : defaultCatatanPresets))];
    templates[index] = newText;

    const newSettings = { ...settings, [key]: templates };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil memperbarui preset!');
      setEditingPresetIdx(null);
    } catch (error) {
      toast.error('Gagal memperbarui preset.');
    }
  };

  const handleDeletePresetAtIndex = async (type: 'capaian' | 'catatan', index: number) => {
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const templates = [...(settings[key] && settings[key].length > 0 ? settings[key] : (type === 'capaian' ? defaultCapaianPresets : defaultCatatanPresets))];
    templates.splice(index, 1);

    const newSettings = { ...settings, [key]: templates };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menghapus preset.');
    } catch (error) {
      toast.error('Gagal menghapus preset.');
    }
  };

  const handleDeletePreset = async (type: 'capaian' | 'catatan', text: string) => {
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const existing = settings[key] || [];
    const newSettings = { ...settings, [key]: existing.filter((t: string) => t !== text) };
    
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menghapus preset.');
    } catch (error) {
      toast.error('Gagal menghapus preset.');
    }
  };

  const handlePrint = () => {
    if (selectedStudentIds.length > 0) {
      handlePrintMultiple(selectedStudentIds);
    } else if (selectedStudentId) {
      handlePrintMultiple([selectedStudentId]);
    }
  };

  const handlePrintMultiple = (studentIds: string[], bypassModal: boolean = false) => {
    if (studentIds.length === 0) {
      toast.error('Tidak ada siswa yang terpilih untuk dicetak.');
      return;
    }
    if (!settings) {
      toast.error('Pengaturan belum dimuat.');
      return;
    }

    if (raporType === 'bulanan' && !bypassModal) {
      setPendingPrintStudentIds(studentIds);
      setShowMonthlyPrintModal(true);
      return;
    }

    const orientation = (raporType === 'bulanan' && printOrientation === 'landscape') ? 'l' : 'p';
    const doc = new jsPDF(orientation, 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const getMonthName = (monthCode: string) => {
      const months: Record<string, string> = {
        '01': 'Januari',
        '02': 'Februari',
        '03': 'Maret',
        '04': 'April',
        '05': 'Mei',
        '06': 'Juni',
        '07': 'Juli',
        '08': 'Agustus',
        '09': 'September',
        '10': 'Oktober',
        '11': 'November',
        '12': 'Desember'
      };
      return months[monthCode] || '';
    };

    // Helper to format subject-specific competence achievement description
    const getSubjectCapaianText = (mapel: string, finalVal: number) => {
      if (finalVal >= 90) {
        return `Mencapai Kompetensi dengan sangat baik dalam hal penguasaan materi pembelajaran ${mapel} serta mampu menerapkan konsep dengan sangat tepat dan mandiri.`;
      } else if (finalVal >= 80) {
        return `Mencapai Kompetensi dengan baik dalam hal memahami materi pokok ${mapel} serta menyelesaikan tugas-tugas harian dengan hasil yang baik.`;
      } else if (finalVal >= 75) {
        return `Menunjukkan penguasaan kompetensi yang cukup pada materi ${mapel}, namun perlu sedikit dorongan dan latihan untuk lebih optimal.`;
      } else {
        return `Perlu pendampingan dan bimbingan yang lebih tekun pada mata pelajaran ${mapel} terutama dalam memahami dasar-dasar konsep penting.`;
      }
    };

    // Helper to calculate Fase based on Kelas
    const getFase = (kelasStr: string) => {
      const k = String(kelasStr).toLowerCase();
      if (k.includes('1') || k.includes('2') || k.includes('i') || k.includes('ii') || k.includes('a')) return 'A';
      if (k.includes('3') || k.includes('4') || k.includes('iii') || k.includes('iv') || k.includes('b')) return 'B';
      if (k.includes('5') || k.includes('6') || k.includes('v') || k.includes('vi') || k.includes('c')) return 'C';
      return 'A'; // default
    };

    // Helper to calculate Semester representation
    const getSemesterRep = (semStr: string) => {
      const s = String(semStr).toLowerCase();
      if (s.includes('1') || s.includes('ganjil')) return '1';
      if (s.includes('2') || s.includes('genap')) return '2';
      return semStr;
    };

    // Helper to calculate Kenaikan Kelas text
    const getKenaikanKelas = (studentKelas: string, formVal?: string) => {
      if (formVal) return formVal;
      const k = String(studentKelas).toLowerCase();
      if (k.includes('1') || k.includes('i')) return 'Naik ke kelas II';
      if (k.includes('2') || k.includes('ii')) return 'Naik ke kelas III';
      if (k.includes('3') || k.includes('iii')) return 'Naik ke kelas IV';
      if (k.includes('4') || k.includes('iv')) return 'Naik ke kelas V';
      if (k.includes('5') || k.includes('v')) return 'Naik ke kelas VI';
      return 'Lulus / Naik ke kelas berikutnya';
    };

    studentIds.forEach((studentId, idx) => {
      const student = students.find(s => s.id === studentId);
      if (!student) return;

      if (idx > 0) {
        doc.addPage();
      }

      // Find the student's custom saved RaporCapaian data
      const studentCapaian = capaian.find(c => c.id_siswa === student.id) || {};

      // ==========================================
      // FORMAT BARU (Samosir / SD Negeri - Foto Lampiran)
      // ==========================================
      if (raporType === 'bulanan' && formatRaporBulanan === 'baru') {
        const auto = getAutoCapaianAndCatatan(student.id);

        // 1. Centered Header
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('LAPORAN HASIL BELAJAR SISWA', pageWidth / 2, 38, { align: 'center' });

        doc.setFontSize(11);
        const bulanText = labelBulanBulananBaru || 'JULI / AGUSTUS';
        doc.text(`BULAN : ${bulanText.toUpperCase()}`, pageWidth / 2, 53, { align: 'center' });

        // 2. Student Info Header Grid
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);

        let tahunAjaran = '2025/2026';
        const matchYear = semester.match(/\d{4}/);
        if (matchYear) {
          const yr = parseInt(matchYear[0]);
          tahunAjaran = `${yr - 1}/${yr}`;
        }

        const isLandscape = printOrientation === 'landscape';
        const leftX = 40;
        const leftValX = isLandscape ? 140 : 125;
        const rightX = isLandscape ? pageWidth / 2 + 30 : pageWidth / 2 + 10;
        const rightValX = isLandscape ? pageWidth / 2 + 130 : pageWidth / 2 + 100;

        let yPos = 72;
        doc.text('Nama Siswa', leftX, yPos);
        doc.text(`: ${student.nama?.toUpperCase()}`, leftValX, yPos);
        doc.text('Kelas', rightX, yPos);
        doc.text(`: ${student.kelas || settings.nama_kelas || 'III (TIGA)'}`, rightValX, yPos);

        yPos += 14;
        doc.text('Nomor Induk', leftX, yPos);
        doc.text(`: ${student.nipd || student.nisn || '-'}`, leftValX, yPos);
        doc.text('Semester', rightX, yPos);
        doc.text(`: ${getSemesterRep(semester)}`, rightValX, yPos);

        yPos += 14;
        doc.text('Nama Sekolah', leftX, yPos);
        doc.text(`: ${settings.nama_sekolah || '-'}`, leftValX, yPos);
        doc.text('Tahun Pelajaran', rightX, yPos);
        doc.text(`: ${tahunAjaran}`, rightValX, yPos);

        yPos += 14;
        doc.text('Alamat Sekolah', leftX, yPos);
        doc.text(`: ${settings.alamat || '-'}`, leftValX, yPos);

        yPos += 18;

        // 3. Grades Table - Structure Matching Photo
        const gradesData = getStudentGrades(student.id);
        const tableBodyBaru: any[] = [];
        let totalScore = 0;
        let scoreCount = 0;

        const findSubjectGrade = (keywords: string[]) => {
          for (const mapel of urutanMapel) {
            const lower = mapel.toLowerCase();
            if (keywords.some(k => lower.includes(k))) {
              const g = gradesData[mapel];
              const finalVal = g ? Math.round(g.final) : 0;
              const kkm = getSubjectKKM(mapel, settings);
              return { mapel, finalVal, kkm, found: true };
            }
          }
          return { mapel: '', finalVal: 0, kkm: settings.kkm_bulanan || 75, found: false };
        };

        // Standard Subjects (1-5)
        const s1 = findSubjectGrade(['agama', 'pai', 'budi pekerti']);
        const kkm1 = s1.found ? s1.kkm : (getSubjectKKM('Pendidikan Agama dan Budi Pekerti', settings) || 70);
        const val1 = s1.finalVal;
        if (val1 > 0) { totalScore += val1; scoreCount++; }
        tableBodyBaru.push(['1', 'Pendidikan Agama dan Budi Pekerti', kkm1, val1 > 0 ? val1 : '']);

        const s2 = findSubjectGrade(['pancasila', 'ppkn', 'pkn']);
        const kkm2 = s2.found ? s2.kkm : (getSubjectKKM('Pendidikan Pancasila dan Kewarganegaraan', settings) || 65);
        const val2 = s2.finalVal;
        if (val2 > 0) { totalScore += val2; scoreCount++; }
        tableBodyBaru.push(['2', 'Pendidikan Pancasila dan Kewarganegaraan', kkm2, val2 > 0 ? val2 : '']);

        const s3 = findSubjectGrade(['indonesia', 'b.indo', 'bindo']);
        const kkm3 = s3.found ? s3.kkm : (getSubjectKKM('Bahasa Indonesia', settings) || 65);
        const val3 = s3.finalVal;
        if (val3 > 0) { totalScore += val3; scoreCount++; }
        tableBodyBaru.push(['3', 'Bahasa Indonesia', kkm3, val3 > 0 ? val3 : '']);

        const s4 = findSubjectGrade(['matematika', 'mtk']);
        const kkm4 = s4.found ? s4.kkm : (getSubjectKKM('Matematika', settings) || 65);
        const val4 = s4.finalVal;
        if (val4 > 0) { totalScore += val4; scoreCount++; }
        tableBodyBaru.push(['4', 'Matematika', kkm4, val4 > 0 ? val4 : '']);

        const s5 = findSubjectGrade(['ipas', 'ipa', 'ips', 'sains']);
        const kkm5 = s5.found ? s5.kkm : (getSubjectKKM('Ilmu Pengetahuan Alam dan Sosial', settings) || 65);
        const val5 = s5.finalVal;
        if (val5 > 0) { totalScore += val5; scoreCount++; }
        tableBodyBaru.push(['5', 'Ilmu Pengetahuan Alam dan Sosial', kkm5, val5 > 0 ? val5 : '']);

        // 6. Seni Pilihan Header & Sub-rows
        tableBodyBaru.push([
          '6',
          { content: 'Seni Pilihan', colSpan: 3, styles: { fontStyle: 'bold', halign: 'center' } }
        ]);

        const seniSubs = [
          { key: ['musik'], name: 'a. Seni Musik' },
          { key: ['tari'], name: 'b. Seni Tari' },
          { key: ['rupa'], name: 'c. Seni Rupa' },
          { key: ['teater'], name: 'd. Seni Teater' }
        ];

        let seniGeneralHandled = false;
        const seniGeneral = findSubjectGrade(['seni budaya', 'sbk', 'seni pilihan']);

        seniSubs.forEach(sub => {
          const subMatch = findSubjectGrade(sub.key);
          if (subMatch.found && subMatch.finalVal > 0) {
            totalScore += subMatch.finalVal;
            scoreCount++;
            tableBodyBaru.push(['', sub.name, subMatch.kkm, subMatch.finalVal]);
          } else if (!seniGeneralHandled && sub.name.includes('Teater') && seniGeneral.found && seniGeneral.finalVal > 0) {
            totalScore += seniGeneral.finalVal;
            scoreCount++;
            seniGeneralHandled = true;
            tableBodyBaru.push(['', sub.name, seniGeneral.kkm, seniGeneral.finalVal]);
          } else {
            tableBodyBaru.push(['', sub.name, '', '']);
          }
        });

        // 7. Pendidikan Jasmani, Olahraga dan Kesehatan
        const s7 = findSubjectGrade(['pjok', 'jasmani', 'olahraga']);
        const kkm7 = s7.found ? s7.kkm : (getSubjectKKM('Pendidikan Jasmani, Olahraga dan Kesehatan', settings) || 67);
        const val7 = s7.finalVal;
        if (val7 > 0) { totalScore += val7; scoreCount++; }
        tableBodyBaru.push(['7', 'Pendidikan Jasmani, Olahraga dan Kesehatan', kkm7, val7 > 0 ? val7 : '']);

        // 8. Bahasa Inggris
        const s8 = findSubjectGrade(['inggris', 'b.inggris', 'bing']);
        const kkm8 = s8.found ? s8.kkm : (getSubjectKKM('Bahasa Inggris', settings) || 65);
        const val8 = s8.finalVal;
        if (val8 > 0) { totalScore += val8; scoreCount++; }
        tableBodyBaru.push(['8', 'Bahasa Inggris', kkm8, val8 > 0 ? val8 : '']);

        // 9. Muatan Lokal Header & Sub-rows
        tableBodyBaru.push([
          '9',
          { content: 'Muatan Lokal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'center' } }
        ]);

        const mulokMatch = findSubjectGrade(['batak', 'daerah', 'mulok', 'muatan lokal', 'sunda', 'jawa']);
        const mulokName = mulokMatch.found ? mulokMatch.mapel : 'Bahasa Daerah Batak Toba';
        const mulokKkm = mulokMatch.found ? mulokMatch.kkm : (getSubjectKKM(mulokName, settings) || 65);
        const mulokVal = mulokMatch.finalVal;
        if (mulokVal > 0) { totalScore += mulokVal; scoreCount++; }
        tableBodyBaru.push(['', mulokName, mulokKkm, mulokVal > 0 ? mulokVal : '']);

        // Extra Subjects from urutanMapel not matched above
        const matchedMapelNames = [s1, s2, s3, s4, s5, s7, s8, mulokMatch].map(m => m.mapel).filter(Boolean);
        let extraNo = 10;
        urutanMapel.forEach(m => {
          if (!matchedMapelNames.includes(m) && !m.toLowerCase().includes('seni')) {
            const g = gradesData[m];
            const finalVal = g ? Math.round(g.final) : 0;
            const kkm = getSubjectKKM(m, settings);
            if (finalVal > 0) { totalScore += finalVal; scoreCount++; }
            tableBodyBaru.push([(extraNo++).toString(), m, kkm, finalVal > 0 ? finalVal : '']);
          }
        });

        const avgScore = scoreCount > 0 ? (totalScore / scoreCount) : 0;
        const formattedAvg = avgScore > 0 ? avgScore.toFixed(3).replace('.', ',') : '-';

        // JUMLAH & RATA-RATA Rows
        tableBodyBaru.push([
          { content: 'JUMLAH', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: totalScore > 0 ? totalScore.toString() : '-', styles: { halign: 'center', fontStyle: 'bold' } }
        ]);
        tableBodyBaru.push([
          { content: 'RATA-RATA', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: avgScore > 0 ? formattedAvg : '-', styles: { halign: 'center', fontStyle: 'bold' } }
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['No', 'Mata Pelajaran', 'KKM', 'Nilai Siswa']],
          body: tableBodyBaru,
          theme: 'grid',
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.5 },
          columnStyles: isLandscape ? {
            0: { halign: 'center', cellWidth: 40 },
            1: { cellWidth: 480 },
            2: { halign: 'center', cellWidth: 100 },
            3: { halign: 'center', cellWidth: 120 }
          } : {
            0: { halign: 'center', cellWidth: 30 },
            1: { cellWidth: 280 },
            2: { halign: 'center', cellWidth: 60 },
            3: { halign: 'center', cellWidth: 80 }
          },
          styles: { fontSize: 8.5, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;

        // 4. Rangking Kelas (Right aligned)
        const ranked = getRankedStudents();
        const studentRankObj = ranked.find(r => r.student.id === student.id);
        const studentRank = studentRankObj ? studentRankObj.rank : '-';
        const totalStudentsInClass = students.length;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Rangking kelas : ${studentRank} / ${totalStudentsInClass}`, pageWidth - 40, yPos, { align: 'right' });

        yPos += 12;

        // 5. Ketidakhadiran Table (Bottom Left)
        const att = getAttendanceSummary(student.id);

        autoTable(doc, {
          startY: yPos,
          margin: { left: 40, right: isLandscape ? pageWidth - 320 : pageWidth - 240 },
          head: [[{ content: 'Ketidakhadiran', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }]],
          body: [
            ['Sakit', ':', att.sakit > 0 ? `${att.sakit} Hari` : '- Hari'],
            ['Izin', ':', att.izin > 0 ? `${att.izin} Hari` : '- Hari'],
            ['Tanpa Keterangan', ':', att.alpa > 0 ? `${att.alpa} Hari` : '- Hari']
          ],
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
          columnStyles: {
            0: { cellWidth: 95 },
            1: { cellWidth: 15, halign: 'center' },
            2: { cellWidth: 60, halign: 'left' }
          }
        });

        let leftFinalY = (doc as any).lastAutoTable.finalY;

        // Optional Catatan Wali Kelas Box if showTeacherComments is enabled
        if (showTeacherComments) {
          const catatanVal = (studentCapaian as any).catatan_wali_kelas || auto.catatan || '';
          if (catatanVal) {
            if (isLandscape) {
              autoTable(doc, {
                startY: yPos,
                margin: { left: 320, right: 40 },
                head: [[{ content: 'Catatan Wali Kelas', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }]],
                body: [[catatanVal]],
                theme: 'grid',
                styles: { fontSize: 8.5, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] }
              });
              leftFinalY = Math.max(leftFinalY, (doc as any).lastAutoTable.finalY);
            } else {
              autoTable(doc, {
                startY: leftFinalY + 6,
                margin: { left: 40, right: 40 },
                head: [[{ content: 'Catatan Wali Kelas', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }]],
                body: [[catatanVal]],
                theme: 'grid',
                styles: { fontSize: 8.5, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] }
              });
              leftFinalY = (doc as any).lastAutoTable.finalY;
            }
          }
        }

        // 6. Signatures Section (3 columns)
        const dateFormatted = format(new Date(signatureDate), 'd MMMM yyyy', { locale: id });
        const placeText = signaturePlace || 'Martoba';
        let sigY = Math.max(leftFinalY + 20, yPos + 45);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);

        const leftColX = isLandscape ? 140 : 110;
        const rightColX = isLandscape ? pageWidth - 140 : pageWidth - 120;
        const centerColX = pageWidth / 2;

        // Left column: Orang Tua / Wali
        doc.text('Mengetahui,', leftColX, sigY, { align: 'center' });
        doc.text('Orang Tua / Wali', leftColX, sigY + 13, { align: 'center' });

        const parentName = (studentCapaian as any).saran_orang_tua || '';
        if (parentName) {
          doc.setFont('Helvetica', 'bold');
          doc.text(parentName, leftColX, sigY + 55, { align: 'center' });
        } else {
          doc.setFont('Helvetica', 'normal');
          doc.text('.........................................', leftColX, sigY + 55, { align: 'center' });
        }

        // Right column: Tempat, Tanggal & Guru Kelas
        doc.setFont('Helvetica', 'normal');
        doc.text(`${placeText},`, rightColX, sigY, { align: 'center' });
        doc.text('Guru Kelas,', rightColX, sigY + 13, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.text(settings.nama_wali_kelas || '.........................................', rightColX, sigY + 55, { align: 'center' });
        doc.setFont('Helvetica', 'normal');
        doc.text(`NIP. ${settings.nip_wali_kelas || '-'}`, rightColX, sigY + 67, { align: 'center' });

        // Center Bottom column: Kepala Sekolah
        const kepsekSigY = sigY + 65;

        doc.text('Mengetahui,', centerColX, kepsekSigY, { align: 'center' });
        doc.text(`Kepala ${settings.nama_sekolah || 'SD Negeri 2 Martoba'}`, centerColX, kepsekSigY + 13, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.text(settings.nama_kepala_sekolah || '.........................................', centerColX, kepsekSigY + 55, { align: 'center' });
        doc.setFont('Helvetica', 'normal');
        doc.text(`NIP. ${settings.nip_kepala_sekolah || '-'}`, centerColX, kepsekSigY + 67, { align: 'center' });

        return; // Complete format baru for this student
      }

      let currentPage = 1;

      // 1. Draw Page 1 Footer Helper
      const drawFooter = (pageNumber: number) => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40); // Divider line above footer
        
        const footerText = `${student.kelas || settings.nama_kelas || 'kelas 2'}  |  ${student.nama?.toUpperCase()}  |  ${student.nipd || student.nisn || ''}`;
        doc.text(footerText, 40, pageHeight - 25);
        doc.text(`Halaman : ${pageNumber}`, pageWidth - 100, pageHeight - 25);
      };

      // 2. Draw Top Metadata Block (Identical on Page 1 and Page 2)
      const drawHeaderMetadata = (y: number) => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);

        let tahunAjaran = '2025/2026';
        const matchYear = semester.match(/\d{4}/);
        if (matchYear) {
          const yr = parseInt(matchYear[0]);
          tahunAjaran = `${yr - 1}/${yr}`;
        }

        const leftX = 40;
        const leftValX = 120;
        const rightX = pageWidth / 2 + 30;
        const rightValX = pageWidth / 2 + 110;

        // Line 1
        doc.text('Nama Murid', leftX, y);
        doc.text(`: ${student.nama?.toUpperCase()}`, leftValX, y);
        doc.text('Kelas', rightX, y);
        doc.text(`: ${student.kelas || settings.nama_kelas || 'kelas 2'}`, rightValX, y);

        // Line 2
        doc.text('NIS/NISN', leftX, y + 15);
        doc.text(`: ${student.nipd || '-'} / ${student.nisn || '-'}`, leftValX, y + 15);
        doc.text('Fase', rightX, y + 15);
        doc.text(`: ${getFase(student.kelas || settings.nama_kelas || '')}`, rightValX, y + 15);

        // Line 3
        doc.text('Sekolah', leftX, y + 30);
        doc.text(`: ${settings.nama_sekolah || '-'}`, leftValX, y + 30);
        doc.text('Semester', rightX, y + 30);
        doc.text(`: ${getSemesterRep(semester)}`, rightValX, y + 30);

        // Line 4
        doc.text('Alamat', leftX, y + 45);
        doc.text(`: ${settings.alamat || '-'}`, leftValX, y + 45);
        doc.text('Tahun Ajaran', rightX, y + 45);
        doc.text(`: ${tahunAjaran}`, rightValX, y + 45);

        // Double Border Divider
        const lineY = y + 55;
        doc.setLineWidth(1);
        doc.setDrawColor(0, 0, 0);
        doc.line(40, lineY, pageWidth - 40, lineY);
        doc.line(40, lineY + 2, pageWidth - 40, lineY + 2);
        
        return lineY + 20; // returns next y position
      };

      // --- PAGE 1 START ---
      let yPos = drawHeaderMetadata(40);

      // Centered Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      if (raporType === 'bulanan') {
        const monthLabel = selectedMonth !== 'all' ? ` - BULAN ${getMonthName(selectedMonth).toUpperCase()}` : '';
        doc.text(`LAPORAN HASIL BELAJAR BULANAN${monthLabel}`, pageWidth / 2, yPos, { align: 'center' });
      } else {
        doc.text('LAPORAN HASIL BELAJAR', pageWidth / 2, yPos, { align: 'center' });
      }
      yPos += 15;

      // Group Grades (Wajib vs Pilihan)
      const gradesData = getStudentGrades(student.id);
      const wajibData: any[] = [];
      const pilihanData: any[] = [];
      let wajibIdx = 1;
      let pilihanIdx = 1;

      const isPilihan = (mapelName: string) => {
        if (settings.pilihan_mata_pelajaran && Array.isArray(settings.pilihan_mata_pelajaran)) {
          if (settings.pilihan_mata_pelajaran.includes(mapelName)) return true;
        }
        const m = mapelName.toLowerCase();
        return m.includes('daerah') || m.includes('mulok') || m.includes('pilihan') || m.includes('jawa') || m.includes('sunda') || m.includes('bali') || m.includes('batak') || m.includes('inggris') || m.includes('asing') || m.includes('arab');
      };

      urutanMapel.forEach((mapel) => {
        const g = gradesData[mapel];
        if (g) {
          const finalVal = g.final;
          const roundedFinal = Math.round(finalVal);
          const capText = getSubjectCapaianText(mapel, finalVal);
          const currentMapelKkm = getSubjectKKM(mapel, settings);

          if (raporType === 'bulanan') {
            const statusKet = roundedFinal >= currentMapelKkm ? 'Tuntas' : 'Belum Tuntas';
            const ketText = `${statusKet} - ${capText}`;
            if (isPilihan(mapel)) {
              pilihanData.push([pilihanIdx++, mapel, currentMapelKkm, roundedFinal, ketText]);
            } else {
              wajibData.push([wajibIdx++, mapel, currentMapelKkm, roundedFinal, ketText]);
            }
          } else {
            if (isPilihan(mapel)) {
              pilihanData.push([pilihanIdx++, mapel, roundedFinal, capText]);
            } else {
              wajibData.push([wajibIdx++, mapel, roundedFinal, capText]);
            }
          }
        }
      });

      const numCols = raporType === 'bulanan' ? 5 : 4;
      const tableBody: any[] = [];
      tableBody.push([
        { content: 'Mata Pelajaran Wajib', colSpan: numCols, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }
      ]);
      wajibData.forEach(row => tableBody.push(row));

      if (pilihanData.length > 0) {
        tableBody.push([
          { content: 'Mata Pelajaran Pilihan', colSpan: numCols, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }
        ]);
        pilihanData.forEach(row => tableBody.push(row));
      }

      // Grades Table
      autoTable(doc, {
        startY: yPos,
        head: raporType === 'bulanan'
          ? [['No', 'Mata Pelajaran', 'KKM', 'Nilai Akhir', 'Keterangan']]
          : [['No', 'Mata Pelajaran', 'Nilai Akhir', 'Capaian Kompetensi']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: raporType === 'bulanan' ? {
          0: { halign: 'center', cellWidth: 25 },
          1: { cellWidth: 135 },
          2: { halign: 'center', cellWidth: 35 },
          3: { halign: 'center', cellWidth: 50 },
          4: { cellWidth: 270 }
        } : {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 140 },
          2: { halign: 'center', cellWidth: 60 },
          3: { cellWidth: 285 }
        },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Kokurikuler Section
      if (raporType !== 'bulanan') {
        if (yPos > pageHeight - 120) {
          drawFooter(currentPage);
          doc.addPage();
          currentPage++;
          yPos = drawHeaderMetadata(40);
        }

        const defaultKokurikuler = `Pada semester ini, ananda menunjukkan capaian yang cukup baik dalam penguatan profil lulusan, yang ditunjukkan melalui kegiatan kokurikuler Senam sehat, Membaca buku.\nPada dimensi kemandirian, ananda berkembang dalam subdimensi bertanggung jawab.\nPada dimensi komunikasi, ananda berkembang dalam subdimensi membaca.\nPada dimensi kesehatan, ananda berkembang dalam subdimensi kebugaran, kesehatan fisik, dan kesehatan mental.`;
        const currentKokurikuler = (studentCapaian as any).kokurikuler || (studentCapaian as any).capaian_kompetensi || defaultKokurikuler;

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'Kokurikuler', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
          body: [[currentKokurikuler]],
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Ekstrakurikuler Section
      if (yPos > pageHeight - 120) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      const eNama1 = (studentCapaian as any).ekstra_nama_1 || '-';
      const eKet1 = (studentCapaian as any).ekstra_ket_1 || '-';
      const eNama2 = (studentCapaian as any).ekstra_nama_2 || '-';
      const eKet2 = (studentCapaian as any).ekstra_ket_2 || '-';

      autoTable(doc, {
        startY: yPos,
        head: [['No', 'Ekstrakurikuler', 'Keterangan']],
        body: [
          [1, eNama1, eKet1],
          [2, eNama2, eKet2]
        ],
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 150 },
          2: { cellWidth: 335 }
        },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Attendance and Teacher Notes (Side by Side)
      if (yPos > pageHeight - 120) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      const att = getAttendanceSummary(student.id);

      // Attendance Table (Left side)
      autoTable(doc, {
        startY: yPos,
        margin: { left: 40, right: pageWidth - 220 }, // Left block (width 180)
        head: [[{ content: 'Ketidakhadiran', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
        body: [
          ['Sakit', `: ${att.sakit} hari`],
          ['Izin', `: ${att.izin} hari`],
          ['Tanpa Keterangan', `: ${att.alpa} hari`]
        ],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 },
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 70 }
        }
      });
      const leftFinalY = (doc as any).lastAutoTable.finalY;

      let rightFinalY = leftFinalY;
      if (showTeacherComments) {
        // Note (Right side)
        autoTable(doc, {
          startY: yPos,
          margin: { left: 240, right: 40 }, // Right block (width 315)
          head: [[{ content: 'Catatan Wali Kelas', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
          body: [[(studentCapaian as any).catatan_wali_kelas || 'Belajarlah lebih giat lagi!']],
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
        });
        rightFinalY = (doc as any).lastAutoTable.finalY;
      }

      yPos = Math.max(leftFinalY, rightFinalY) + 15;

      // --- DYNAMIC PAGE 2 CONTENT CHECK ---
      const isGenap = (() => {
        const s = semester.toLowerCase();
        if (s.includes('ganjil') || s.includes(' 1') || s.includes('semester 1') || s.includes('semester i')) return false;
        return s.includes('genap') || s.includes('2') || s.includes('ii');
      })();
      const showKenaikanKelas = raporType === 'semester' && isGenap;
      const kenaikanText = getKenaikanKelas(student.kelas || settings.nama_kelas || '', (studentCapaian as any).kenaikan_kelas);

      const neededHeight = (showKenaikanKelas ? 45 : 0) + 105 + 160 + 40;

      if (yPos + neededHeight > pageHeight - 50) {
        // Does NOT fit on current page, push to a new page
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      // 1. Keterangan Kenaikan Kelas (specifically semester 2 / Genap and for Semester report type only)
      if (showKenaikanKelas) {
        autoTable(doc, {
          startY: yPos,
          body: [[{ content: `Keterangan Kenaikan Kelas : ${kenaikanText}`, styles: { fontStyle: 'bold' } }]],
          theme: 'grid',
          styles: { fontSize: 9.5, halign: 'center', cellPadding: 8, lineColor: [0, 0, 0], lineWidth: 0.5 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
      }

      // 2. Tanggapan Orang Tua/Wali Murid Box
      autoTable(doc, {
        startY: yPos,
        head: [[{ content: 'Tanggapan Orang Tua/Wali Murid', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
        body: [['\n\n\n\n\n']], // Space for writing
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 40;

      // 3. Signatures block
      const dateFormatted = format(new Date(signatureDate), 'd MMMM yyyy', { locale: id });
      const placeAndDate = `${signaturePlace}, ${dateFormatted}`;

      const leftColX = 120;
      const rightColX = pageWidth - 120;
      const centerColX = pageWidth / 2;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);

      // Orang Tua Murid (Left column)
      doc.text('Mengetahui', leftColX, yPos, { align: 'center' });
      doc.text('Orang Tua / Wali Murid', leftColX, yPos + 15, { align: 'center' });
      doc.text('.........................................', leftColX, yPos + 80, { align: 'center' });

      // Wali Kelas (Right column)
      doc.text(placeAndDate, rightColX, yPos, { align: 'center' });
      doc.text('Wali Kelas', rightColX, yPos + 15, { align: 'center' });
      doc.text(settings.nama_wali_kelas || '.........................................', rightColX, yPos + 80, { align: 'center' });
      if (settings.nip_wali_kelas) {
        doc.text(`NIP. ${settings.nip_wali_kelas}`, rightColX, yPos + 92, { align: 'center' });
      }

      // Kepala Sekolah (Centered, slightly below)
      const kepsekY = yPos + 115;
      doc.text('Mengetahui,', centerColX, kepsekY, { align: 'center' });
      doc.text('Kepala Sekolah', centerColX, kepsekY + 15, { align: 'center' });
      doc.text(settings.nama_kepala_sekolah || '.........................................', centerColX, kepsekY + 80, { align: 'center' });
      if (settings.nip_kepala_sekolah) {
        doc.text(`NIP. ${settings.nip_kepala_sekolah}`, centerColX, kepsekY + 92, { align: 'center' });
      }

      // Draw final footer
      drawFooter(currentPage);
    });

    if (studentIds.length === 1) {
      const student = students.find(s => s.id === studentIds[0]);
      doc.save(`Rapor_${raporType}_${student?.nama.replace(/\s+/g, '_')}_${semester.replace(/\s+/g, '')}.pdf`);
    } else {
      doc.save(`Rapor_Gabungan_${raporType}_${studentIds.length}_Siswa_${semester.replace(/\s+/g, '')}.pdf`);
    }
    toast.success('Rapor berhasil diunduh!');
  };

  // Class selection logic
  const classes = Array.from(new Set(students.map(s => s.kelas).filter(Boolean)));
  
  const filteredStudents = students.filter(s => {
    if (filterKelas === 'all') return true;
    return s.kelas === filterKelas;
  });

  const isAllSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id));

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      const filteredIds = new Set(filteredStudents.map(s => s.id));
      setSelectedStudentIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredStudents.map(s => s.id);
      setSelectedStudentIds(prev => {
        const newSelection = [...prev];
        filteredIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  // Sync selected index on filter change
  useEffect(() => {
    if (filteredStudents.length > 0 && !filteredStudents.some(s => s.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filterKelas, students]);

  const currentIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
  const currentIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
  const currentIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 p-2 custom-scrollbar">
      {/* Sidebar for Student List */}
      <div className="w-full md:w-80 flex flex-col gap-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 p-4">
        <div>
          <h3 className="font-semibold text-slate-200 mb-2">Daftar Siswa</h3>
          
          {/* Class Filter */}
          <div className="space-y-1 mb-3">
            <label className="block text-xs font-medium text-slate-400">Filter Kelas</label>
            <select 
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="all">Semua Kelas</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* Bulk Selection Toggle */}
          <div className="flex items-center justify-between border-t border-b border-slate-700/50 py-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={isAllSelected}
                onChange={handleSelectAllToggle}
                className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Pilih Semua ({filteredStudents.length})</span>
            </label>
            {selectedStudentIds.length > 0 && (
              <button 
                onClick={() => setSelectedStudentIds([])}
                className="text-[10px] text-rose-400 hover:underline"
              >
                Bersihkan
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 min-h-[250px] max-h-[450px] md:max-h-none">
          {filteredStudents.map(student => (
            <div 
              key={student.id}
              className={`flex items-center gap-2 w-full p-2 rounded-xl border transition-all ${
                selectedStudentId === student.id
                  ? 'bg-indigo-600/15 border-indigo-500/40'
                  : 'border-transparent hover:bg-slate-700/30'
              }`}
            >
              <input 
                type="checkbox"
                checked={selectedStudentIds.includes(student.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedStudentIds(prev => [...prev, student.id]);
                  } else {
                    setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                  }
                }}
                className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
              />
              <button
                onClick={() => setSelectedStudentId(student.id)}
                className="flex-1 text-left outline-none cursor-pointer"
              >
                <div className={`text-sm font-medium ${selectedStudentId === student.id ? 'text-indigo-200' : 'text-slate-200'}`}>
                  {student.nama}
                </div>
                <div className="text-[10px] text-slate-400 font-normal">
                  Kelas: {student.kelas || settings?.nama_kelas || '-'}
                </div>
              </button>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">Belum ada siswa di kelas ini.</p>
          )}
        </div>

        {/* Print Selected Button */}
        {selectedStudentIds.length > 0 && (
          <button
            onClick={() => handlePrintMultiple(selectedStudentIds)}
            className="w-full mt-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
          >
            <Printer size={14} />
            Cetak Terpilih ({selectedStudentIds.length} Siswa)
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {role === 'kepsek' && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <span>⚠️</span>
            <span>Anda sedang masuk sebagai <strong>Kepala Sekolah</strong> (Mode Baca Saja). Anda dapat melihat dan mengunduh seluruh rapor & piagam, tetapi tidak dapat mengubah konfigurasi atau menginput data tambahan.</span>
          </div>
        )}
        <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-slate-700/50 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FileText className="text-indigo-400" />
                Manajemen Rapor Siswa
              </h2>
              <p className="text-sm text-slate-400 mt-1">Atur profil capaian dan cetak rapor bulanan atau semester.</p>
            </div>
            <button 
              onClick={handlePrint}
              disabled={!selectedStudentId}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Printer size={18} />
              Cetak PDF
            </button>
          </div>

          {/* Konfigurasi Rapor */}
          {/* Konfigurasi Rapor Tabs */}
          <div className="flex flex-wrap gap-6 border-b border-slate-700/50 mb-4">
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'cetak' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('cetak')}
            >
              Pengaturan Cetak
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'urutan' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('urutan')}
            >
              Urutan Mata Pelajaran
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'rekap' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('rekap')}
            >
              📊 Rekap Nilai & Ranking
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'piagan' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('piagan')}
            >
              🎖️ Cetak Piagam Penghargaan
            </button>
          </div>
          {activeTab === 'urutan' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl gap-4">
                 <p className="text-sm text-indigo-200">Atur urutan mata pelajaran spesifik untuk tampilan dan cetak Rapor.</p>
                 {role === 'guru' && (
                   <button onClick={handleSaveUrutan} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 shrink-0">Simpan Urutan</button>
                 )}
              </div>
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-800">
                <AnimatePresence mode="popLayout">
                  {urutanMapel.map((mapel, index) => (
                    <motion.div 
                      key={mapel} 
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
                    >
                       <span className="text-sm text-slate-200 font-medium"><span className="text-slate-500 mr-3">{index + 1}.</span>{mapel}</span>
                       <div className="flex items-center gap-2">
                         <button onClick={() => moveUp(index)} disabled={index === 0 || role !== "guru"} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded disabled:opacity-30 transition-colors" title="Naikkan urutan">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                         </button>
                         <button onClick={() => moveDown(index)} disabled={index === urutanMapel.length - 1 || role !== "guru"} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded disabled:opacity-30 transition-colors" title="Turunkan urutan">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                         </button>
                       </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {urutanMapel.length === 0 && (
                   <div className="p-8 text-center text-slate-500 italic">Belum ada mata pelajaran. Silakan tambahkan di menu Pengaturan.</div>
                )}
              </div>
            </div>
          ) : activeTab === 'rekap' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-indigo-300">Rekapitulasi Nilai & Peringkat Siswa</h4>
                  <p className="text-xs text-slate-400 mt-1">Daftar peringkat siswa dihitung berdasarkan nilai rata-rata dari seluruh mata pelajaran.</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button 
                    onClick={handleExportRekapRankingExcel} 
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    <Download size={14} />
                    Unduh Excel (.xlsx)
                  </button>
                  <button 
                    onClick={handleExportRekapRankingPDF} 
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    <Printer size={14} />
                    Cetak PDF Rekap
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        <th className="px-4 py-3 text-center">Peringkat</th>
                        <th className="px-4 py-3">Nama Siswa</th>
                        {urutanMapel.map(mapel => (
                          <th key={mapel} className="px-4 py-3 text-center text-[11px] min-w-[80px]" title={mapel}>
                            {mapel.substring(0, 8)}{mapel.length > 8 ? '..' : ''}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-bold text-indigo-400">Total</th>
                        <th className="px-4 py-3 text-center font-bold text-emerald-400">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                      {getRankedStudents().map((item, idx) => (
                        <tr key={item.student.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-center font-bold">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                              item.rank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              item.rank === 2 ? 'bg-slate-400/20 text-slate-200 border border-slate-400/30' :
                              item.rank === 3 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30' :
                              'text-slate-400'
                            }`}>
                              {item.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-200">{item.student.nama}</td>
                          {urutanMapel.map(mapel => {
                            const val = item.gradesData[mapel]?.final;
                            return (
                              <td key={mapel} className="px-4 py-3 text-center font-mono">
                                {val !== undefined && val > 0 ? val.toFixed(1) : <span className="text-slate-600">-</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center font-bold text-indigo-300 font-mono">{item.total.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-400 font-mono">{item.avg.toFixed(1)}</td>
                        </tr>
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={urutanMapel.length + 4} className="p-8 text-center text-slate-500 italic">Tidak ada data siswa.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'piagan' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-indigo-300">Cetak Piagam Penghargaan Siswa</h4>
                <p className="text-xs text-slate-400 mt-1">Sediakan piagam penghargaan apresiasi belajar resmi dengan format tanda tangan wali kelas & kepala sekolah.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Form Pengaturan Piagam */}
                <div className="lg:col-span-5 bg-slate-800/40 border border-slate-700 p-5 rounded-xl space-y-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pengaturan Piagam</h5>
                  
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Pilih Siswa Penerima</label>
                    <select 
                      value={piagamSiswaId}
                      onChange={(e) => {
                        const sid = e.target.value;
                        setPiagamSiswaId(sid);
                        // Auto estimate ranking
                        const idx = getRankedStudents().findIndex(r => r.student.id === sid);
                        if (idx !== -1) {
                          const rank = getRankedStudents()[idx].rank;
                          setPiagamJuara(`Juara ${rank}`);
                          setPiagamNo(`00${idx + 1}/PP/2026`);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Pilih Siswa --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.nama}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Pilih Template Piagam</label>
                    <select 
                      value={piagamTemplate}
                      onChange={(e) => setPiagamTemplate(e.target.value as any)}
                      disabled={role !== 'guru'}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-indigo-300 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      <option value="classic">🏆 Emas Klasik (Classic Gold)</option>
                      <option value="modern">🌿 Minimalis Elegan (Modern Indigo)</option>
                      <option value="emerald">💚 Hijau Zamrud Agung (Royal Emerald)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Predikat / Gelar</label>
                      <input 
                        type="text" 
                        value={piagamJuara}
                        onChange={(e) => setPiagamJuara(e.target.value)}
                        placeholder="Contoh: Juara 1"
                        disabled={role !== 'guru'}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Kategori Prestasi</label>
                      <input 
                        type="text" 
                        value={piagamKategori}
                        onChange={(e) => setPiagamKategori(e.target.value)}
                        placeholder="Contoh: Peringkat Kelas Terbaik"
                        disabled={role !== 'guru'}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nomor Piagam</label>
                    <input 
                      type="text" 
                      value={piagamNo}
                      onChange={(e) => setPiagamNo(e.target.value)}
                      placeholder="Contoh: 001/PP/2026"
                      disabled={role !== 'guru'}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button 
                    onClick={() => handlePrintPiagam(piagamSiswaId, piagamJuara, piagamKategori, piagamNo, piagamTemplate)}
                    disabled={!piagamSiswaId}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    🎖️ Unduh Piagam PDF
                  </button>
                </div>

                {/* Live Certificate Mockup */}
                <div className="lg:col-span-7 bg-slate-950/40 border border-slate-800 p-8 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[420px]">
                  {piagamSiswaId ? (
                    <div className={`relative p-8 max-w-lg w-full rounded-2xl shadow-2xl transition-all border-4 duration-300 overflow-hidden ${
                      piagamTemplate === 'classic' ? 'border-double border-amber-500/50 bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/20' :
                      piagamTemplate === 'modern' ? 'border-indigo-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/15' :
                      piagamTemplate === 'emerald' ? 'border-double border-emerald-500/50 bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/20' :
                      'border-teal-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-teal-950/15'
                    }`}>
                      {/* Decorative Corner Lines */}
                      <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-slate-700/30"></div>
                      <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-slate-700/30"></div>
                      <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-slate-700/30"></div>
                      <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-slate-700/30"></div>

                      {/* Header Area */}
                      <div className="space-y-1.5 py-1">
                        <div className="text-[6.5px] tracking-widest font-mono font-bold text-slate-400">
                          KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI
                        </div>
                        <div className={`text-xl sm:text-2xl font-extrabold tracking-wide uppercase leading-tight ${
                          piagamTemplate === 'classic' ? 'text-amber-300 drop-shadow-md' :
                          piagamTemplate === 'modern' ? 'text-indigo-300 drop-shadow-md' :
                          'text-emerald-300 drop-shadow-md font-serif'
                        }`}>
                          {settings?.nama_sekolah?.toUpperCase() || 'NAMA SEKOLAH'}
                        </div>
                        <div className="text-[8px] text-slate-400 italic">
                          Alamat: {settings?.alamat || 'Alamat Sekolah Belum Diatur'}
                        </div>
                      </div>

                      {/* Double Divider Line */}
                      <div className="my-3 space-y-0.5">
                        <div className={`h-[1.5px] w-4/5 mx-auto ${
                          piagamTemplate === 'classic' ? 'bg-amber-500/40' :
                          piagamTemplate === 'modern' ? 'bg-indigo-500/40' :
                          piagamTemplate === 'emerald' ? 'bg-emerald-500/40' :
                          'bg-teal-500/40'
                        }`}></div>
                        <div className="h-[0.5px] bg-slate-800 w-2/3 mx-auto"></div>
                      </div>

                      {/* Certificate Title */}
                      <div className="space-y-1">
                        <div className={`text-2xl font-black tracking-widest leading-none ${
                          piagamTemplate === 'classic' ? 'text-gradient bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent' :
                          piagamTemplate === 'modern' ? 'text-indigo-400' :
                          piagamTemplate === 'emerald' ? 'text-emerald-400 font-serif' :
                          'text-teal-400 font-sans'
                        }`}>
                          PIAGAM PENGHARGAAN
                        </div>
                        {piagamNo && piagamNo.trim() !== '' && (
                          <div className="text-[9px] text-slate-500 font-mono tracking-widest">
                            NOMOR: {piagamNo}
                          </div>
                        )}
                      </div>
                      
                      {/* Body Content */}
                      <div className="space-y-3 mt-4">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">Diberikan Kepada Siswa Berprestasi:</div>
                        <div className={`text-xl font-black border-b pb-1.5 max-w-sm mx-auto tracking-wide ${
                          piagamTemplate === 'classic' ? 'text-slate-100 border-amber-500/30' :
                          piagamTemplate === 'modern' ? 'text-slate-100 border-indigo-500/30' :
                          piagamTemplate === 'emerald' ? 'text-slate-100 border-emerald-500/30' :
                          'text-slate-100 border-teal-500/30'
                        }`}>
                          {students.find(s => s.id === piagamSiswaId)?.nama || ''}
                        </div>
                        
                        <div className="text-xs text-slate-400 italic">sebagai</div>
                        
                        <div className={`text-sm font-bold py-2 px-6 rounded-xl border shadow-lg inline-block uppercase tracking-widest ${
                          piagamTemplate === 'classic' ? 'text-amber-400 bg-amber-500/5 border-amber-500/30 shadow-amber-950/10' :
                          piagamTemplate === 'modern' ? 'text-indigo-400 bg-indigo-500/5 border-indigo-500/30 shadow-indigo-950/10' :
                          piagamTemplate === 'emerald' ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/30 shadow-emerald-950/10' :
                          'text-teal-400 bg-teal-500/5 border-teal-500/30 shadow-teal-950/10'
                        }`}>
                          🏅 {piagamJuara} - {piagamKategori}
                        </div>
                        
                        <div className="text-[10px] text-slate-400 leading-relaxed max-w-sm mx-auto">
                          Atas prestasi luar biasa, dedikasi belajar, dan akhlak mulia dalam kelas <span className="text-slate-200 font-semibold">{students.find(s => s.id === piagamSiswaId)?.kelas || settings?.nama_kelas || ''}</span> pada Semester <span className="text-slate-200 font-semibold">{semester}</span>.
                        </div>
                      </div>

                      {/* Elegant Absolute Seal/Badge (Lencana Emas) */}
                      <div className="absolute bottom-14 right-8 w-18 h-18 flex flex-col items-center justify-center select-none" title="Lencana Emas Penghargaan">
                        <svg className="w-18 h-18 drop-shadow-xl" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <linearGradient id="goldGradPreview" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#D97706" /> {/* amber-600 */}
                              <stop offset="30%" stopColor="#FCD34D" /> {/* amber-300 */}
                              <stop offset="70%" stopColor="#B45309" /> {/* amber-700 */}
                              <stop offset="100%" stopColor="#F59E0B" /> {/* amber-500 */}
                            </linearGradient>
                            <linearGradient id="goldShinyPreview" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#FFFBEB" /> {/* amber-50 */}
                              <stop offset="50%" stopColor="#FBBF24" /> {/* amber-400 */}
                              <stop offset="100%" stopColor="#78350F" /> {/* amber-900 */}
                            </linearGradient>
                            <linearGradient id="ribbonGradPreview" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#D97706" />
                              <stop offset="100%" stopColor="#78350F" />
                            </linearGradient>
                          </defs>
                          {/* Left Ribbon Tail */}
                          <path d="M24 38 L16 58 L24 53 L32 58 L28 38 Z" fill="url(#ribbonGradPreview)" filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.4))" />
                          {/* Right Ribbon Tail */}
                          <path d="M40 38 L32 58 L40 53 L48 58 L40 38 Z" fill="url(#ribbonGradPreview)" filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.4))" />
                          
                          {/* Scalloped edge rosette */}
                          <g fill="url(#goldGradPreview)" filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.3))">
                            <circle cx="32" cy="28" r="20" />
                            <path d="M32 6 L35 10 L40 8 L42 12 L47 11 L48 16 L52 16 L51 21 L54 23 L52 28 L54 33 L51 35 L52 40 L48 40 L47 45 L42 44 L40 48 L35 46 L32 50 L29 46 L24 48 L22 44 L17 45 L16 40 L12 40 L13 35 L10 33 L12 28 L10 23 L13 21 L12 16 L16 16 L17 11 L22 12 L24 8 L29 10 Z" />
                          </g>
                          
                          {/* Outer Shiny Circle */}
                          <circle cx="32" cy="28" r="17" fill="url(#goldShinyPreview)" />
                          
                          {/* Deep dark inner circle */}
                          <circle cx="32" cy="28" r="14.5" fill="#020617" stroke="url(#goldGradPreview)" strokeWidth="1.5" />
                          
                          {/* Centered beautiful gold star */}
                          <polygon points="32,16 35.5,23 43.5,24 37.5,29.5 39,37 32,33.5 25,37 26.5,29.5 20.5,24 28.5,23" fill="url(#goldShinyPreview)" />
                          
                          {/* Inner circle detailing */}
                          <circle cx="32" cy="28" r="11" fill="none" stroke="url(#goldGradPreview)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                        </svg>
                      </div>

                      {/* Signatures Row */}
                      <div className="grid grid-cols-2 text-[9px] text-slate-400 pt-5 mt-6 border-t border-slate-800/80">
                        <div className="space-y-4">
                          <div>Wali Kelas,</div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-200 border-b border-slate-800 max-w-[120px] mx-auto pb-0.5">{settings?.nama_wali_kelas || '__________________'}</div>
                            <div className="text-[8px] text-slate-500 leading-none">NIP. {settings?.nip_wali_kelas || '-'}</div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>Kepala Sekolah,</div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-200 border-b border-slate-800 max-w-[120px] mx-auto pb-0.5">{settings?.nama_kepala_sekolah || '__________________'}</div>
                            <div className="text-[8px] text-slate-500 leading-none">NIP. {settings?.nip_kepala_sekolah || '-'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs italic flex flex-col items-center gap-2">
                      <span className="text-4xl animate-bounce">🎖️</span>
                      <span className="text-slate-400 font-medium">Silakan pilih siswa penerima di panel kiri untuk melihat pratinjau piagam penghargaan.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <SettingsIcon size={16} className="text-slate-400" />
                Pengaturan Rapor
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Jenis Rapor</label>
                  <select 
                    value={raporType}
                    onChange={(e) => setRaporType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none font-semibold text-indigo-300"
                  >
                    <option value="bulanan">Tengah Semester (Bulanan)</option>
                    <option value="semester">Akhir Semester</option>
                  </select>
                </div>
                {raporType === 'bulanan' && (
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs text-slate-400 mb-1">Pilih Bulan Data</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none font-medium text-indigo-300"
                    >
                      <option value="all">Semua Bulan</option>
                      <option value="01">Januari</option>
                      <option value="02">Februari</option>
                      <option value="03">Maret</option>
                      <option value="04">April</option>
                      <option value="05">Mei</option>
                      <option value="06">Juni</option>
                      <option value="07">Juli</option>
                      <option value="08">Agustus</option>
                      <option value="09">September</option>
                      <option value="10">Oktober</option>
                      <option value="11">November</option>
                      <option value="12">Desember</option>
                    </select>
                  </div>
                )}
                
                {raporType === 'bulanan' && (
                  <div className="col-span-2 bg-indigo-950/40 border border-indigo-500/30 p-3.5 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-indigo-300 uppercase tracking-wider">
                      Format Cetak Rapor Bulanan
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFormatRaporBulanan('baru')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          formatRaporBulanan === 'baru'
                            ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                            : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span>📜 Format Baru (Ringkas)</span>
                          {formatRaporBulanan === 'baru' && <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">✓ Aktif</span>}
                        </div>
                        <p className="text-[10px] text-slate-300/80 mt-1.5 leading-relaxed">
                          Format 1 Halaman Ringkas (Sesuai Foto Lampiran: Tabel Nilai, KKM, Rangking, Absensi, & 3 Tanda Tangan).
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormatRaporBulanan('lama')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          formatRaporBulanan === 'lama'
                            ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                            : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span>📄 Format Standar (Detail)</span>
                          {formatRaporBulanan === 'lama' && <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">✓ Aktif</span>}
                        </div>
                        <p className="text-[10px] text-slate-300/80 mt-1.5 leading-relaxed">
                          Format Standar dengan Deskripsi Capaian Keterangan Tuntas/Belum Tuntas per Mata Pelajaran & Ekstrakurikuler.
                        </p>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-indigo-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Orientasi Kertas
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPrintOrientation('portrait')}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                              printOrientation === 'portrait'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            📱 Portrait
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintOrientation('landscape')}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                              printOrientation === 'landscape'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            💻 Landscape
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Catatan Wali Kelas
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowTeacherComments(!showTeacherComments)}
                          className={`w-full py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                            showTeacherComments
                              ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          <span>{showTeacherComments ? 'Tampilkan Catatan' : 'Sembunyikan Catatan'}</span>
                          <span className={`w-3 h-3 rounded-full ${showTeacherComments ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        </button>
                      </div>

                      {formatRaporBulanan === 'baru' && (
                        <div className="sm:col-span-2 pt-1">
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Judul Bulan di Header Rapor
                          </label>
                          <input
                            type="text"
                            value={labelBulanBulananBaru}
                            onChange={(e) => setLabelBulanBulananBaru(e.target.value)}
                            placeholder="Contoh: JULI / AGUSTUS"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-indigo-200 font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Tanggal Tanda Tangan</label>
                  <input 
                    type="date" 
                    value={signatureDate}
                    disabled={role !== 'guru'}
                    onChange={(e) => setSignatureDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none disabled:opacity-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Tempat Tanda Tangan</label>
                  <input 
                    type="text" 
                    value={signaturePlace}
                    disabled={role !== 'guru'}
                    onChange={(e) => setSignaturePlace(e.target.value)}
                    placeholder="Contoh: Jakarta"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Komponen & Bobot Nilai */}
              <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/30 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Komponen & Bobot Nilai</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeHarian} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeHarianBulanan(e.target.checked);
                          } else {
                            setIncludeHarian(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Harian
                    </label>
                    {currentIncludeHarian && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotHarian} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotHarian(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeTugas} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeTugasBulanan(e.target.checked);
                          } else {
                            setIncludeTugas(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Tugas
                    </label>
                    {currentIncludeTugas && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotTugas} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotTugas(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeUjian} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeUjianBulanan(e.target.checked);
                          } else {
                            setIncludeUjian(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Ujian
                    </label>
                    {currentIncludeUjian && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotUjian} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotUjian(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-[11px] text-slate-500 flex justify-between border-t border-slate-700/50 pt-2 pb-1">
                  <span>Total Bobot Aktif:</span>
                  <span className={`font-semibold ${(currentIncludeHarian ? bobotHarian : 0) + (currentIncludeTugas ? bobotTugas : 0) + (currentIncludeUjian ? bobotUjian : 0) === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {((currentIncludeHarian ? bobotHarian : 0) + (currentIncludeTugas ? bobotTugas : 0) + (currentIncludeUjian ? bobotUjian : 0))}%
                  </span>
                </div>

                {raporType === 'bulanan' && (
                  <div className="pt-2 border-t border-slate-700/50 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-300">KKM (Kriteria Ketuntasan Minimal)</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={kkmBulanan} 
                          disabled={role !== 'guru'}
                          onChange={e => {
                            let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10);
                            if (isNaN(v)) v = 0;
                            if (v > 100) v = 100;
                            setKkmBulanan(v);
                          }} 
                          className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-indigo-300 font-bold outline-none text-center disabled:opacity-50 focus:ring-1 focus:ring-indigo-500" 
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">Nilai batas ketuntasan minimal untuk status Tuntas/Belum Tuntas pada Rapor Bulanan.</p>
                  </div>
                )}
                {role === 'guru' ? (
                  <button
                    type="button"
                    onClick={handleSaveBobot}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Save size={12} />
                    Simpan Bobot Nilai
                  </button>
                ) : (
                  <div className="text-center text-[10px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl mt-2 leading-normal">
                    ⚠️ Mode Lihat Saja: Kepala Sekolah tidak dapat mengubah pengaturan bobot nilai.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                Letak Tanda Tangan
              </h3>
              
              <div className="space-y-3 bg-slate-900/40 p-4 rounded-xl border border-slate-700/30">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Wali Kelas</span>
                  <select value={posWaliKelas} disabled={role !== 'guru'} onChange={e => setPosWaliKelas(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Kepala Sekolah</span>
                  <select value={posKepsek} disabled={role !== 'guru'} onChange={e => setPosKepsek(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Orang Tua / Wali</span>
                  <select value={posOrangTua} disabled={role !== 'guru'} onChange={e => setPosOrangTua(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Profil Capaian Form */}
        {selectedStudentId && (
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-700/50 pb-3 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-3">
                <span>Profil Capaian Siswa</span>
                <span className="text-sm font-normal text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full">
                  {students.find(s => s.id === selectedStudentId)?.nama}
                </span>
              </div>
              {role === 'guru' && (
                <button
                  type="button"
                  onClick={handleTarikData}
                  className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                  title="Tarik nilai dan ketidakhadiran dari database lalu generate deskripsi otomatis"
                >
                  <Download size={14} />
                  Tarik & Ambil Data dari Database
                </button>
              )}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-slate-300">Capaian Kompetensi / Deskripsi</label>
                    {role === 'guru' && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <select
                          className="text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none w-full sm:w-44 xl:w-56 truncate cursor-pointer focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => {
                            if (e.target.value === '__delete__') {
                              if (formData.capaian_kompetensi) {
                                handleDeletePreset('capaian', formData.capaian_kompetensi);
                              }
                              e.target.value = '';
                            } else if (e.target.value) {
                              setFormData(prev => ({ ...prev, capaian_kompetensi: e.target.value }));
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Pilih Preset...</option>
                          {(settings?.capaian_kompetensi_templates && settings.capaian_kompetensi_templates.length > 0
                            ? settings.capaian_kompetensi_templates
                            : defaultCapaianPresets
                          ).map((t: string, i: number) => (
                            <option key={i} value={t}>{i + 1}. {t.substring(0, 50)}...</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSavePreset('capaian', formData.capaian_kompetensi || '')}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Simpan teks saat ini sebagai preset baru"
                        >
                          + Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPresetManagerType('capaian');
                            setEditingPresetIdx(null);
                            setEditingPresetText('');
                          }}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Kelola & edit/hapus preset"
                        >
                          ⚙️ Kelola
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const auto = getAutoCapaianAndCatatan(selectedStudentId);
                            setFormData(prev => ({ ...prev, capaian_kompetensi: auto.capaian }));
                            toast.success('Berhasil men-generate capaian kompetensi otomatis!');
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                        >
                          ⚡ Auto
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={formData.capaian_kompetensi || ''} 
                    onChange={e => setFormData({...formData, capaian_kompetensi: e.target.value})}
                    disabled={role !== 'guru'}
                    placeholder={role === 'guru' ? "Masukkan deskripsi capaian kompetensi siswa..." : "Belum ada deskripsi capaian kompetensi."}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
                
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-slate-300">Catatan Wali Kelas</label>
                    {role === 'guru' && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <select
                          className="text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none w-full sm:w-44 xl:w-56 truncate cursor-pointer focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => {
                            if (e.target.value === '__delete__') {
                              if (formData.catatan_wali_kelas) {
                                handleDeletePreset('catatan', formData.catatan_wali_kelas);
                              }
                              e.target.value = '';
                            } else if (e.target.value) {
                              setFormData(prev => ({ ...prev, catatan_wali_kelas: e.target.value }));
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Pilih Preset...</option>
                          {(settings?.catatan_wali_kelas_templates && settings.catatan_wali_kelas_templates.length > 0
                            ? settings.catatan_wali_kelas_templates
                            : defaultCatatanPresets
                          ).map((t: string, i: number) => (
                            <option key={i} value={t}>{i + 1}. {t.substring(0, 50)}...</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSavePreset('catatan', formData.catatan_wali_kelas || '')}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Simpan teks saat ini sebagai preset baru"
                        >
                          + Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPresetManagerType('catatan');
                            setEditingPresetIdx(null);
                            setEditingPresetText('');
                          }}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Kelola & edit/hapus preset"
                        >
                          ⚙️ Kelola
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const auto = getAutoCapaianAndCatatan(selectedStudentId);
                            setFormData(prev => ({ ...prev, catatan_wali_kelas: auto.catatan }));
                            toast.success('Berhasil men-generate catatan wali kelas otomatis!');
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                        >
                          ⚡ Auto
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={formData.catatan_wali_kelas || ''} 
                    onChange={e => setFormData({...formData, catatan_wali_kelas: e.target.value})}
                    disabled={role !== 'guru'}
                    placeholder={role === 'guru' ? "Masukkan catatan / motivasi..." : "Belum ada catatan wali kelas."}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Tambahan Data Rapor Sesuai Format Lampiran */}
            <div className="border-t border-slate-700/50 pt-6 space-y-6">
              <h4 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Data Tambahan Rapor (Kokurikuler & Ekstrakurikuler)</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Kokurikuler */}
                {raporType !== 'bulanan' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Deskripsi Kokurikuler</label>
                    <textarea 
                      value={formData.kokurikuler || ''} 
                      onChange={e => setFormData({...formData, kokurikuler: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Pada semester ini, ananda menunjukkan capaian yang cukup baik dalam penguatan profil lulusan, yang ditunjukkan melalui kegiatan kokurikuler..."
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <p className="text-[10px] text-slate-500">Biarkan kosong untuk menggunakan teks bawaan otomatis sesuai format dinas.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 flex items-center justify-center text-center">
                    <p className="text-xs text-slate-500 italic">Kegiatan Kokurikuler tidak diperlukan untuk tipe Rapor Bulanan.</p>
                  </div>
                )}

                {/* Kenaikan Kelas */}
                {raporType === 'semester' && (semester.toLowerCase().includes('genap') || semester.toLowerCase().includes('2')) ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Keterangan Kenaikan Kelas (Khusus Semester 2)</label>
                    <input 
                      type="text"
                      value={formData.kenaikan_kelas || ''} 
                      onChange={e => setFormData({...formData, kenaikan_kelas: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Naik ke kelas III"
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <p className="text-[10px] text-slate-500">Biarkan kosong untuk menghitung otomatis berdasarkan kelas siswa saat ini.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 flex items-center justify-center text-center">
                    <p className="text-xs text-slate-500 italic">Keterangan Kenaikan Kelas hanya ditampilkan pada Rapor Akhir Semester Genap (Semester 2).</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ekstrakurikuler 1 */}
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-700/30 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Ekstrakurikuler 1</p>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nama Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_nama_1 || ''} 
                      onChange={e => setFormData({...formData, ekstra_nama_1: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Pramuka"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Keterangan / Deskripsi Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_ket_1 || ''} 
                      onChange={e => setFormData({...formData, ekstra_ket_1: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Aktif dan sangat disiplin mengikuti latihan rutin mingguan..."
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Ekstrakurikuler 2 */}
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-700/30 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Ekstrakurikuler 2</p>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nama Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_nama_2 || ''} 
                      onChange={e => setFormData({...formData, ekstra_nama_2: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Seni Tari"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Keterangan / Deskripsi Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_ket_2 || ''} 
                      onChange={e => setFormData({...formData, ekstra_ket_2: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Memiliki penguasaan gerakan tari dasar dengan kelenturan yang baik..."
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50 flex justify-end">
              {role === 'guru' ? (
                <button 
                  onClick={handleSaveCapaian}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Save size={18} />
                  Simpan Profil Capaian
                </button>
              ) : (
                <div className="text-xs text-amber-400 italic bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl">
                  ⚠️ Mode Lihat Saja: Kepala Sekolah tidak dapat menyimpan perubahan data rapor.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preset Manager Modal */}
        {presetManagerType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    Kelola Preset {presetManagerType === 'capaian' ? 'Capaian Kompetensi' : 'Catatan Wali Kelas'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tambah, edit, atau hapus preset yang tersedia di menu pilihan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPresetManagerType(null)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Add New Preset Textarea */}
                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 space-y-3">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {editingPresetIdx !== null ? 'Edit Preset Dipilih' : 'Tambah Preset Baru'}
                  </label>
                  <textarea
                    value={editingPresetText}
                    onChange={(e) => setEditingPresetText(e.target.value)}
                    placeholder={
                      presetManagerType === 'capaian'
                        ? "Contoh: Menunjukkan penguasaan kompetensi yang sangat baik dalam..."
                        : "Contoh: Sangat bangga dengan prestasimu! Pertahankan nilai..."
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-200 text-xs min-h-[60px]"
                  />
                  <div className="flex justify-end gap-2">
                    {editingPresetIdx !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPresetIdx(null);
                          setEditingPresetText('');
                        }}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (editingPresetIdx !== null) {
                          handleEditPreset(presetManagerType, editingPresetIdx, editingPresetText);
                        } else {
                          handleSavePreset(presetManagerType, editingPresetText);
                        }
                        setEditingPresetText('');
                      }}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
                    >
                      <Save size={12} />
                      {editingPresetIdx !== null ? 'Simpan Perubahan' : 'Simpan Preset'}
                    </button>
                  </div>
                </div>

                {/* Preset List */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daftar Preset Tersimpan</p>
                  <div className="space-y-2.5">
                    {(presetManagerType === 'capaian'
                      ? (settings?.capaian_kompetensi_templates && settings.capaian_kompetensi_templates.length > 0
                          ? settings.capaian_kompetensi_templates
                          : defaultCapaianPresets)
                      : (settings?.catatan_wali_kelas_templates && settings.catatan_wali_kelas_templates.length > 0
                          ? settings.catatan_wali_kelas_templates
                          : defaultCatatanPresets)
                    ).map((preset: string, index: number) => (
                      <div key={index} className="flex gap-3 items-start p-3 bg-slate-900/20 hover:bg-slate-900/30 rounded-xl border border-slate-700/30 transition-all">
                        <div className="flex items-center justify-center bg-slate-800 text-indigo-400 border border-slate-700 rounded-lg w-5 h-5 text-xs font-bold mt-0.5 shrink-0">
                          {index + 1}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed flex-1 pt-0.5">
                          {preset}
                        </p>
                        <div className="flex gap-1 shrink-0">
                          {deleteConfirmIdx === index ? (
                            <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg animate-in fade-in duration-150">
                              <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Yakin?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeletePresetAtIndex(presetManagerType, index);
                                  setDeleteConfirmIdx(null);
                                }}
                                className="text-[10px] text-white bg-rose-600 hover:bg-rose-500 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer"
                              >
                                Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmIdx(null)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 font-medium px-1 py-0.5 transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPresetIdx(index);
                                  setEditingPresetText(preset);
                                  setDeleteConfirmIdx(null);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                                title="Edit preset ini"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmIdx(index);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                                title="Hapus preset ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-900/30 border-t border-slate-700/60 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPresetManagerType(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Options Format Cetak Rapor Bulanan with Live Real-Time Preview & Smooth Transitions */}
        <AnimatePresence>
          {showMonthlyPrintModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="laporan-bulanan-container fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 15 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-5xl lg:max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl shadow-indigo-950/60"
              >
                {/* Header Modal */}
              <div className="p-4 sm:p-5 border-b border-slate-700/60 flex items-center justify-between bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
                    📜
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>Opsi Cetak & Format Rapor Bulanan</span>
                      <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full font-semibold">
                        Real-Time Live Preview
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pratinjau langsung tampilan layout, orientasi kertas, dan komentar wali kelas ({pendingPrintStudentIds.length} siswa terpilih)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMonthlyPrintModal(false)}
                  className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body: Split 2 Columns (Controls + Live Preview) */}
              <div className="flex flex-col lg:flex-row overflow-y-auto custom-scrollbar flex-1">
                {/* Left Column: Interactive Settings / Controls */}
                <div className="w-full lg:w-5/12 p-5 border-b lg:border-b-0 lg:border-r border-slate-800 space-y-4 bg-slate-900/80 shrink-0">
                  {/* 1. Choice of Format */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      1. Pilih Format Layout Rapor
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Format Baru */}
                      <div
                        onClick={() => setFormatRaporBulanan('baru')}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                          formatRaporBulanan === 'baru'
                            ? 'bg-indigo-600/20 border-indigo-400 text-white shadow-lg shadow-indigo-600/15 ring-2 ring-indigo-500/40'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-indigo-200 flex items-center gap-1.5">
                              📜 Format Baru
                            </span>
                            {formatRaporBulanan === 'baru' && (
                              <span className="text-emerald-400 text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40 font-bold">
                                ✓ Terpilih
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-semibold text-slate-300 mt-1">
                            Ringkas (Sesuai Lampiran)
                          </p>
                          <ul className="text-[10px] text-slate-400 mt-1 space-y-0.5 list-disc list-inside leading-relaxed">
                            <li>1 Halaman Rapi</li>
                            <li>Nilai Mapel + KKM</li>
                            <li>Rangking & Absensi</li>
                            <li>3 Kolom Tanda Tangan</li>
                          </ul>
                        </div>
                      </div>

                      {/* Option 2: Format Lama */}
                      <div
                        onClick={() => setFormatRaporBulanan('lama')}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                          formatRaporBulanan === 'lama'
                            ? 'bg-indigo-600/20 border-indigo-400 text-white shadow-lg shadow-indigo-600/15 ring-2 ring-indigo-500/40'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-indigo-200 flex items-center gap-1.5">
                              📄 Format Lama
                            </span>
                            {formatRaporBulanan === 'lama' && (
                              <span className="text-emerald-400 text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40 font-bold">
                                ✓ Terpilih
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-semibold text-slate-300 mt-1">
                            Standar Capaian
                          </p>
                          <ul className="text-[10px] text-slate-400 mt-1 space-y-0.5 list-disc list-inside leading-relaxed">
                            <li>Format Standar</li>
                            <li>Narasi Deskripsi Capaian</li>
                            <li>Tuntas / Belum Tuntas</li>
                            <li>Ekstrakurikuler</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Paper Orientation (Portrait / Landscape) */}
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      2. Orientasi Kertas Layout
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintOrientation('portrait')}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          printOrientation === 'portrait'
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>📱</span> Portrait (Tegak)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintOrientation('landscape')}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          printOrientation === 'landscape'
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>💻</span> Landscape (Mendatar)
                      </button>
                    </div>
                  </div>

                  {/* 3. Kop Surat Toggle */}
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        3. Kop Surat Resmi
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Tampilkan header instansi & logo sekolah
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseKopSurat(!useKopSurat)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        useKopSurat
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span>{useKopSurat ? 'Pakai Kop' : 'Tanpa Kop'}</span>
                      <span className={`w-2 h-2 rounded-full ${useKopSurat ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
                    </button>
                  </div>

                  {/* 4. Komentar Wali Kelas Toggle */}
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        4. Catatan / Komentar Wali Kelas
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Tampilkan atau sembunyikan kotak komentar
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTeacherComments(!showTeacherComments)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        showTeacherComments
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span>{showTeacherComments ? 'Tampil' : 'Sembunyi'}</span>
                      <span className={`w-2 h-2 rounded-full ${showTeacherComments ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    </button>
                  </div>

                  {/* Header Month Label if Format Baru */}
                  {formatRaporBulanan === 'baru' && (
                    <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/80 space-y-1 animate-in fade-in duration-150">
                      <label className="block text-xs font-semibold text-indigo-300">
                        Judul Bulan di Header Rapor:
                      </label>
                      <input
                        type="text"
                        value={labelBulanBulananBaru}
                        onChange={(e) => setLabelBulanBulananBaru(e.target.value)}
                        placeholder="Contoh: JULI / AGUSTUS"
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-indigo-100 font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Right Column: Live Real-Time Interactive Paper Sheet Preview Panel */}
                <div className="w-full lg:w-7/12 p-4 sm:p-6 bg-slate-950 flex flex-col items-center justify-start min-h-[380px] overflow-y-auto custom-scrollbar">
                  {/* Title & Specs Bar */}
                  <div className="w-full max-w-lg mb-3 flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Eye size={14} className="text-indigo-400" />
                      Pratinjau Lembar Rapor Real-Time
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 font-mono text-[10px] uppercase font-bold">
                        {formatRaporBulanan === 'baru' ? 'Format Baru' : 'Format Lama'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-mono text-[10px] uppercase font-bold">
                        {printOrientation === 'portrait' ? 'A4 Portrait' : 'A4 Landscape'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Simulated Paper Sheet with Smooth Spring Layout Transitions */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${formatRaporBulanan}-${printOrientation}-${showTeacherComments}-${labelBulanBulananBaru}`}
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                      className={`bg-white text-slate-900 shadow-2xl rounded-md p-4 sm:p-5 transition-all duration-300 border border-slate-300 relative select-none ${
                        printOrientation === 'landscape'
                          ? 'w-full max-w-[540px] aspect-[1.414/1] text-[9px]'
                          : 'w-full max-w-[360px] aspect-[1/1.414] text-[9.5px]'
                      }`}
                    >
                      {/* Watermark/Stamp Badge */}
                      <div className="absolute top-3 right-3 opacity-15 pointer-events-none text-right font-serif">
                        <div className="text-[14px] font-bold tracking-widest text-indigo-900 border-2 border-indigo-900 px-2 py-0.5 rounded uppercase">
                          PRATINJAU
                        </div>
                      </div>

                      {/* Paper Document Header */}
                      <div className="text-center border-b-2 border-slate-800 pb-2 mb-2">
                        {useKopSurat && (
                          <>
                            <div className="text-[7.5px] uppercase tracking-wider text-slate-600 font-semibold">
                              {settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN'}
                            </div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-700 font-bold">
                              {settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
                            </div>
                            <div className="font-extrabold uppercase text-[11px] tracking-wide text-slate-900">
                              {settings?.nama_sekolah || 'SD NEGERI UTAMA'}
                            </div>
                            <div className="text-[7.5px] text-slate-600 font-medium">
                              {settings?.alamat || 'Jl. Pendidikan No. 12'} | Semester: {semester}
                            </div>
                          </>
                        )}
                        <div className={`font-bold uppercase text-[10.5px] text-indigo-950 ${useKopSurat ? 'mt-1.5 border-t border-slate-300 pt-1' : ''}`}>
                          {formatRaporBulanan === 'baru'
                            ? `LAPORAN HASIL BELAJAR BULAN ${labelBulanBulananBaru || '...'}`
                            : 'LAPORAN HASIL BELAJAR BULANAN (STANDAR)'}
                        </div>
                      </div>

                      {/* Student Info Box & Real Data Calculations */}
                      {(() => {
                        const targetStudent = students.find(s => pendingPrintStudentIds.includes(s.id)) || students.find(s => s.id === selectedStudentId) || students[0] || { id: '', nama: 'Siswa Contoh', nisn: '12345678', kelas: 'A' };
                        const mapelList = (settings?.mata_pelajaran && settings.mata_pelajaran.length > 0)
                          ? settings.mata_pelajaran
                          : ['Pendidikan Agama', 'PPKn', 'Bahasa Indonesia', 'Matematika', 'IPAS'];
                        
                        // Get real grades for this student
                        const stGrades = grades.filter(g => g.id_siswa === targetStudent.id && g.semester === semester);
                        const subjectScores = mapelList.map(m => {
                          const sg = stGrades.filter(g => g.mata_pelajaran === m);
                          const harianArr = sg.filter(g => (g as any).jenis === 'harian').map(g => g.nilai);
                          const tugasArr = sg.filter(g => (g as any).jenis === 'tugas').map(g => g.nilai);
                          const ujianArr = sg.filter(g => (g as any).jenis === 'uts' || (g as any).jenis === 'uas' || (g as any).jenis === 'pas').map(g => g.nilai);

                          const avgHarian = harianArr.length > 0 ? harianArr.reduce((a, b) => a + b, 0) / harianArr.length : 0;
                          const avgTugas = tugasArr.length > 0 ? tugasArr.reduce((a, b) => a + b, 0) / tugasArr.length : 0;
                          const avgUjian = ujianArr.length > 0 ? ujianArr.reduce((a, b) => a + b, 0) / ujianArr.length : 0;

                          let activeWeightSum = 0;
                          let weightedScoreSum = 0;

                          if (includeHarianBulanan && harianArr.length > 0) {
                            activeWeightSum += bobotHarian;
                            weightedScoreSum += avgHarian * bobotHarian;
                          }
                          if (includeTugasBulanan && tugasArr.length > 0) {
                            activeWeightSum += bobotTugas;
                            weightedScoreSum += avgTugas * bobotTugas;
                          }
                          if (includeUjianBulanan && ujianArr.length > 0) {
                            activeWeightSum += bobotUjian;
                            weightedScoreSum += avgUjian * bobotUjian;
                          }

                          const finalScore = activeWeightSum > 0 ? Math.round(weightedScoreSum / activeWeightSum) : (sg.length > 0 ? Math.round(sg.reduce((a, b) => a + b.nilai, 0) / sg.length) : 0);
                          const subjectKkm = getSubjectKKM(m, settings, kkmBulanan);
                          const isTuntas = finalScore >= subjectKkm;

                          return {
                            mapel: m,
                            kkm: subjectKkm,
                            nilai: finalScore,
                            isTuntas
                          };
                        });

                        const validScores = subjectScores.filter(s => s.nilai > 0);
                        const totalNilai = validScores.reduce((a, b) => a + b.nilai, 0);
                        const rataRata = validScores.length > 0 ? (totalNilai / validScores.length).toFixed(1) : '0';

                        // Attendance count
                        const stAtt = attendances.filter(a => a.id_siswa === targetStudent.id && a.semester === semester);
                        const countS = stAtt.filter(a => a.status === 'Sakit' || (a.status as any) === 'S').length;
                        const countI = stAtt.filter(a => a.status === 'Izin' || (a.status as any) === 'I').length;
                        const countA = stAtt.filter(a => a.status === 'Alpa' || (a.status as any) === 'A').length;

                        // Rapor Capaian & Catatan
                        const targetCapaian = capaian.find(rc => rc.id_siswa === targetStudent.id && rc.semester === semester);
                        const catatanText = targetCapaian?.catatan_wali_kelas || formData.catatan_wali_kelas || "Ananda memiliki semangat belajar yang baik. Pertahankan prestasimu!";
                        const capaianText = targetCapaian?.capaian_kompetensi || formData.capaian_kompetensi || "Sangat baik dalam memahami materi.";

                        return (
                          <>
                            <div className="grid grid-cols-2 gap-1 mb-2 bg-slate-50 p-1.5 rounded border border-slate-200 text-[8.5px]">
                              <div><span className="font-semibold text-slate-500">Nama Siswa:</span> <strong className="text-slate-900">{targetStudent.nama}</strong></div>
                              <div><span className="font-semibold text-slate-500">NISN / NIS:</span> <span className="font-mono text-slate-800">{targetStudent.nisn || '-'}</span></div>
                              <div><span className="font-semibold text-slate-500">Kelas:</span> <span className="text-slate-800 font-semibold">{targetStudent.kelas || '-'}</span></div>
                              <div><span className="font-semibold text-slate-500">Jumlah Mapel:</span> <span className="text-slate-800 font-semibold">{mapelList.length} Mapel</span></div>
                            </div>

                            {/* Table Preview according to selected format */}
                            {formatRaporBulanan === 'baru' ? (
                              <div className="space-y-2">
                                <table className="w-full text-left border-collapse border border-slate-400 text-[8px]">
                                  <thead>
                                    <tr className="bg-slate-200 text-slate-800 font-bold border-b border-slate-400">
                                      <th className="p-1 border-r border-slate-400 text-center w-6">No</th>
                                      <th className="p-1 border-r border-slate-400">Mata Pelajaran</th>
                                      <th className="p-1 border-r border-slate-400 text-center w-8">KKM</th>
                                      <th className="p-1 border-r border-slate-400 text-center w-8">Nilai</th>
                                      <th className="p-1 text-center w-14">Ket.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subjectScores.slice(0, printOrientation === 'landscape' ? 4 : 5).map((s, i) => (
                                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="p-0.5 text-center border-r border-slate-300 font-mono">{i + 1}</td>
                                        <td className="p-0.5 border-r border-slate-300 font-medium truncate max-w-[120px]">{s.mapel}</td>
                                        <td className="p-0.5 text-center border-r border-slate-300 text-slate-600">{s.kkm}</td>
                                        <td className="p-0.5 text-center border-r border-slate-300 font-bold text-slate-900">{s.nilai > 0 ? s.nilai : '-'}</td>
                                        <td className={`p-0.5 text-center font-bold ${s.nilai > 0 ? (s.isTuntas ? 'text-emerald-700' : 'text-rose-600') : 'text-slate-400'}`}>
                                          {s.nilai > 0 ? (s.isTuntas ? 'Tuntas' : 'Belum') : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                {/* Rangking & Absensi summary */}
                                <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                                  <div className="border border-slate-300 p-1 rounded bg-slate-50">
                                    <span className="font-bold text-slate-700 block mb-0.5">Ringkasan Nilai Real:</span>
                                    <div className="flex justify-between text-slate-700">
                                      <span>Rata-Rata: <strong>{rataRata}</strong></span>
                                      <span>Total: <strong>{totalNilai}</strong></span>
                                    </div>
                                  </div>
                                  <div className="border border-slate-300 p-1 rounded bg-slate-50">
                                    <span className="font-bold text-slate-700 block mb-0.5">Ketidakhadiran:</span>
                                    <div className="flex justify-between text-slate-700">
                                      <span>S: {countS}</span>
                                      <span>I: {countI}</span>
                                      <span>A: {countA}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Format Lama Table Preview */
                              <div className="space-y-1.5">
                                <table className="w-full text-left border-collapse border border-slate-400 text-[8px]">
                                  <thead>
                                    <tr className="bg-slate-200 text-slate-800 font-bold border-b border-slate-400">
                                      <th className="p-1 border-r border-slate-400 text-center w-6">No</th>
                                      <th className="p-1 border-r border-slate-400">Mata Pelajaran</th>
                                      <th className="p-1 border-r border-slate-400 text-center w-8">Nilai</th>
                                      <th className="p-1">Capaian Kompetensi</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subjectScores.slice(0, 3).map((s, i) => (
                                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="p-0.5 text-center border-r border-slate-300">{i + 1}</td>
                                        <td className="p-0.5 border-r border-slate-300 font-medium truncate max-w-[80px]">{s.mapel}</td>
                                        <td className="p-0.5 text-center border-r border-slate-300 font-bold">{s.nilai > 0 ? s.nilai : '-'}</td>
                                        <td className="p-0.5 text-[7.5px] text-slate-600 line-clamp-1">{capaianText}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Real-time Teacher Comments Box */}
                            <AnimatePresence>
                              {showTeacherComments ? (
                                <motion.div
                                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                  animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border border-indigo-200 bg-indigo-50/60 p-1.5 rounded text-[8px] text-slate-800">
                                    <span className="font-bold text-indigo-950 block mb-0.5 flex items-center gap-1">
                                      💬 Catatan / Komentar Wali Kelas Real:
                                    </span>
                                    <p className="italic text-slate-700 leading-tight">
                                      "{catatanText}"
                                    </p>
                                  </div>
                                </motion.div>
                              ) : (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="mt-1.5 text-[7.5px] text-slate-400 italic text-center py-0.5 border border-dashed border-slate-300 rounded"
                                >
                                  [Komentar Wali Kelas Disembunyikan]
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        );
                      })()}

                      {/* Real-time Signature Boxes */}
                      <div className="mt-3 pt-2 border-t border-slate-300 grid grid-cols-3 gap-1 text-[7.5px] text-center text-slate-700">
                        <div>
                          <p className="font-semibold">Orang Tua / Wali</p>
                          <div className="h-6"></div>
                          <p className="font-bold text-slate-900 border-t border-slate-400 pt-0.5 inline-block px-2">
                            ( ........................ )
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold">Kepala Sekolah</p>
                          <div className="h-6"></div>
                          <p className="font-bold text-slate-900 border-t border-slate-400 pt-0.5 inline-block px-2">
                            {settings?.nama_kepala_sekolah || '( Kepala Sekolah )'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold">Wali Kelas</p>
                          <div className="h-6"></div>
                          <p className="font-bold text-slate-900 border-t border-slate-400 pt-0.5 inline-block px-2">
                            {settings?.nama_wali_kelas || '( Wali Kelas )'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMonthlyPrintModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMonthlyPrintModal(false);
                    handlePrintMultiple(pendingPrintStudentIds, true);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Printer size={15} />
                  Cetak Rapor Bulanan ({pendingPrintStudentIds.length} Siswa)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
