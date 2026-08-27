import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, Attendance, Settings } from './store';

interface GenerateClassReportOptions {
  students: Student[];
  attendance?: Attendance[];
  settings: Settings | null;
  className?: string;
  semester?: string;
  showKepsekSig?: boolean;
}

/**
 * Draws the vector Tut Wuri Handayani logo when no custom base64 logo is provided
 */
const drawTutWuriLogo = (doc: jsPDF, x: number, y: number) => {
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.ellipse(x, y, 9, 9, 'S');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('TUT WURI', x, y - 2, { align: 'center' });
  doc.text('HANDAYANI', x, y + 1, { align: 'center' });
  doc.setFontSize(5);
  doc.text('★ ★ ★', x, y + 4, { align: 'center' });
};

/**
 * Extracts city name from address string for official document signature
 */
const getCityFromAddress = (alamatStr?: string): string => {
  if (!alamatStr || alamatStr.trim() === 'Alamat Sekolah Belum Diatur' || alamatStr.trim() === '') {
    return 'Jakarta';
  }
  const cleanAlamat = alamatStr.replace(/[\r\n]+/g, ' ').trim();
  const parts = cleanAlamat.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const pLower = part.toLowerCase();
    if (pLower.startsWith('kota ')) return part.substring(5).trim();
    if (pLower.startsWith('kabupaten ')) return part.substring(10).trim();
    if (pLower.startsWith('kab. ')) return part.substring(5).trim();
  }
  const filteredParts = parts.filter((p) => !/^\d+$/.test(p));
  if (filteredParts.length > 0) {
    const lastPart = filteredParts[filteredParts.length - 1];
    if (lastPart.length < 25) return lastPart;
  }
  return 'Jakarta';
};

/**
 * Generates and triggers download of a comprehensive PDF report of current class data,
 * including a detailed summary of student status and attendance statistics.
 */
export function generateClassDataAndAttendancePDF({
  students,
  attendance = [],
  settings,
  className,
  semester,
  showKepsekSig = true,
}: GenerateClassReportOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // 1. Render Kop Surat Resmi
  const pda = settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN';
  const dinas = settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
  const sekolah = settings?.nama_sekolah || 'NAMA SEKOLAH BELUM DIATUR';
  const alamat = settings?.alamat || 'Alamat Sekolah Belum Diatur';
  const npsn = settings?.npsn || '-';
  const email = settings?.email || '-';
  const logoType = settings?.kop_logo_type || 'tutwuri';
  const logoBase64 = settings?.kop_logo_base64;

  const hasLogo = logoType !== 'none';
  const textShiftX = hasLogo ? 10 : 0;

  if (hasLogo) {
    if (logoType === 'custom' && logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 8, 22, 22);
      } catch (e) {
        console.error('Error rendering custom logo:', e);
        drawTutWuriLogo(doc, 25, 19);
      }
    } else {
      drawTutWuriLogo(doc, 25, 19);
    }
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text(pda.toUpperCase(), pageWidth / 2 + textShiftX, 12, { align: 'center' });
  doc.text(dinas.toUpperCase(), pageWidth / 2 + textShiftX, 17, { align: 'center' });

  doc.setFontSize(13.5);
  doc.text(sekolah.toUpperCase(), pageWidth / 2 + textShiftX, 23, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Alamat: ${alamat}  |  NPSN: ${npsn}  |  Email: ${email}`, pageWidth / 2 + textShiftX, 28, { align: 'center' });

  // Double line divider
  doc.setLineWidth(0.8);
  doc.setDrawColor(148, 163, 184);
  doc.line(14, 31, pageWidth - 14, 31);
  doc.setLineWidth(0.2);
  doc.line(14, 32.2, pageWidth - 14, 32.2);

  // 2. Document Title & Header
  const activeClassLabel = className || 'Semua Kelas';
  const activeSemesterLabel = semester || settings?.semester_aktif || 'Ganjil 2026';
  const activeTaLabel = (settings as any)?.tahun_ajaran || '2025/2026';

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('LAPORAN REKAPITULASI DATA KELAS & KEHADIRAN SISWA', pageWidth / 2, 40, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Kelas: ${activeClassLabel}  |  Semester: ${activeSemesterLabel}  |  Tahun Ajaran: ${activeTaLabel}`,
    pageWidth / 2,
    45,
    { align: 'center' }
  );

  // 3. Compute Summary Statistics
  const totalStudents = students.length;
  let countL = 0;
  let countP = 0;

  students.forEach((s) => {
    const jk = (s.jenis_kelamin || s.jk || s.l_p || s.gender || '').toString().trim().toLowerCase();
    if (jk === 'l' || jk.startsWith('laki') || jk === 'pria' || jk === 'm') {
      countL++;
    } else if (jk === 'p' || jk.startsWith('perem') || jk === 'wanita' || jk === 'f') {
      countP++;
    }
  });

  // Calculate student attendance per student
  const studentAttMap = new Map<
    string,
    { hadir: number; sakit: number; izin: number; alpa: number; total: number }
  >();

  let classTotalHadir = 0;
  let classTotalSakit = 0;
  let classTotalIzin = 0;
  let classTotalAlpa = 0;

  attendance.forEach((a) => {
    if (!a.id_siswa) return;
    const curr = studentAttMap.get(a.id_siswa) || { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    curr.total++;
    if (a.status === 'Hadir') {
      curr.hadir++;
      classTotalHadir++;
    } else if (a.status === 'Sakit') {
      curr.sakit++;
      classTotalSakit++;
    } else if (a.status === 'Izin') {
      curr.izin++;
      classTotalIzin++;
    } else if (a.status === 'Alpa') {
      curr.alpa++;
      classTotalAlpa++;
    }
    studentAttMap.set(a.id_siswa, curr);
  });

  const classTotalRecords = classTotalHadir + classTotalSakit + classTotalIzin + classTotalAlpa;
  const classAttendancePct =
    classTotalRecords > 0 ? ((classTotalHadir / classTotalRecords) * 100).toFixed(1) : '100.0';

  // Draw Visual Summary Cards Section
  const summaryBoxY = 49;
  const boxWidth = (pageWidth - 28 - 9) / 4; // 4 boxes with 3mm gap
  const boxHeight = 16;

  const boxes = [
    { title: 'TOTAL SISWA', main: `${totalStudents} Siswa`, sub: `L: ${countL}  |  P: ${countP}` },
    { title: 'KEHADIRAN (H)', main: `${classTotalHadir} Presensi`, sub: `Total Sesi: ${classTotalRecords}` },
    { title: 'KETIDAKHADIRAN', main: `S:${classTotalSakit}  I:${classTotalIzin}  A:${classTotalAlpa}`, sub: `Sakit/Izin/Alpa` },
    { title: 'PERSENTASE KEHADIRAN', main: `${classAttendancePct}%`, sub: 'Rata-Rata Kelas' },
  ];

  boxes.forEach((box, i) => {
    const boxX = 14 + i * (boxWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, summaryBoxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.title, boxX + boxWidth / 2, summaryBoxY + 4.5, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(box.main, boxX + boxWidth / 2, summaryBoxY + 9.5, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(box.sub, boxX + boxWidth / 2, summaryBoxY + 13.5, { align: 'center' });
  });

  // 4. Detailed Student Status & Attendance Table
  const tableHeaders = [
    ['No', 'Nama Siswa', 'NISN', 'JK', 'Kelas', 'Hadir', 'Sakit', 'Izin', 'Alpa', '% Kehadiran'],
  ];

  const tableBody = students.map((s, idx) => {
    const att = studentAttMap.get(s.id) || { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    const pct = att.total > 0 ? `${((att.hadir / att.total) * 100).toFixed(0)}%` : '100%';

    const jkRaw = (s.jenis_kelamin || s.jk || s.l_p || '').toString().trim().toLowerCase();
    const jkLabel =
      jkRaw === 'l' || jkRaw.startsWith('laki') || jkRaw === 'pria' ? 'L' : jkRaw === 'p' || jkRaw.startsWith('perem') || jkRaw === 'wanita' ? 'P' : '-';

    return [
      idx + 1,
      s.nama,
      s.nisn || '-',
      jkLabel,
      s.kelas || className || '-',
      att.hadir,
      att.sakit,
      att.izin,
      att.alpa,
      pct,
    ];
  });

  autoTable(doc, {
    head: tableHeaders,
    body: tableBody,
    startY: summaryBoxY + boxHeight + 5,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229], // Indigo 600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 26 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 16 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 16 },
      8: { halign: 'center', cellWidth: 16 },
      9: { halign: 'center', cellWidth: 22 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 100;

  // 5. Official Signatures Block
  let sigY = finalY + 12;
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 20;
  }

  const city = getCityFromAddress(settings?.alamat);
  const todayStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  // Left signature (Kepala Sekolah)
  if (showKepsekSig) {
    const leftX = 20;
    doc.text('Mengetahui,', leftX, sigY);
    doc.text('Kepala Sekolah,', leftX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_kepala_sekolah || '................................................', leftX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_kepala_sekolah || '................................................'}`, leftX, sigY + 29);
  }

  // Right signature (Wali Kelas)
  const rightX = pageWidth - 70;
  doc.text(`${city}, ${todayStr}`, rightX, sigY);
  doc.text('Guru Kelas / Wali Kelas,', rightX, sigY + 5);
  doc.setFont('Helvetica', 'bold');
  doc.text(settings?.nama_wali_kelas || '................................................', rightX, sigY + 25);
  doc.setFont('Helvetica', 'normal');
  doc.text(`NIP. ${settings?.nip_wali_kelas || '................................................'}`, rightX, sigY + 29);

  // 6. Page Numbers Header & Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    doc.text(`EduSync - Laporan Data Kelas & Rekapitulasi Kehadiran`, 14, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  // Save PDF file
  const cleanClassName = (activeClassLabel || 'Semua').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Laporan_Data_Kelas_${cleanClassName}_${activeSemesterLabel.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}
