import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Student, Settings } from '../lib/store';
import { X, Printer, Download, QrCode, Search, Filter, Sparkles, Check, School, User, ExternalLink, CheckSquare, Square, Users } from 'lucide-react';
import toast from 'react-hot-toast';

interface StudentQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudent?: Student | null;
  settings: Settings | null;
  classes: string[];
}

export const generateStudentQRPayload = (student: Student) => {
  // Ultra-compact JSON format to ensure Version 1-2 QR matrix (21x21 chunky modules)
  // This produces extremely bold, high-contrast black blocks that cameras scan instantly!
  return JSON.stringify({
    id: student.id,
    ...(student.nisn ? { nisn: student.nisn } : student.nis ? { nis: student.nis } : {})
  });
};

export default function StudentQRCodeModal({
  isOpen,
  onClose,
  students,
  initialStudent,
  settings,
  classes
}: StudentQRCodeModalProps) {
  const [selectedClass, setSelectedClass] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [isFullDisplayMode, setIsFullDisplayMode] = useState<boolean>(false);
  const [printGridCols, setPrintGridCols] = useState<2 | 3>(2);

  // Batch selection state
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('has-qr-modal-open');
    } else {
      document.body.classList.remove('has-qr-modal-open');
    }
    return () => {
      document.body.classList.remove('has-qr-modal-open');
    };
  }, [isOpen]);

  useEffect(() => {
    if (initialStudent) {
      setSelectedStudentId(initialStudent.id);
      if (initialStudent.kelas) {
        setSelectedClass(initialStudent.kelas);
      }
      setMode('single');
    } else if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0].id);
    }
  }, [initialStudent, isOpen, students]);

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchClass = selectedClass === 'Semua' || s.kelas?.toLowerCase() === selectedClass.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q || 
      s.nama?.toLowerCase().includes(q) || 
      s.nisn?.toLowerCase().includes(q) || 
      s.nis?.toLowerCase().includes(q) ||
      s.kelas?.toLowerCase().includes(q);
    return matchClass && matchSearch;
  });

  // Auto select batch IDs when filtered students change or batch mode is active
  useEffect(() => {
    if (mode === 'batch') {
      setSelectedBatchIds(filteredStudents.map(s => s.id));
    }
  }, [mode, selectedClass, searchQuery, students.length]);

  const selectedStudent = students.find(s => s.id === selectedStudentId) || filteredStudents[0] || null;

  // Generate QR Codes
  useEffect(() => {
    if (!isOpen) return;

    const generateQRs = async () => {
      setIsGenerating(true);
      const targetList = mode === 'single' ? (selectedStudent ? [selectedStudent] : []) : filteredStudents;
      const newUrls: Record<string, string> = { ...qrCodeUrls };

      for (const student of targetList) {
        if (!newUrls[student.id]) {
          try {
            const qrPayload = generateStudentQRPayload(student);

            const url = await QRCode.toDataURL(qrPayload, {
              width: 800,
              margin: 3, // Clean wide white margin for easy camera detection
              color: {
                dark: '#000000',
                light: '#ffffff'
              },
              errorCorrectionLevel: 'M' // 15% error correction with chunky block modules
            });
            newUrls[student.id] = url;
          } catch (err) {
            console.error('Failed to generate QR for', student.nama, err);
          }
        }
      }

      setQrCodeUrls(newUrls);
      setIsGenerating(false);
    };

    generateQRs();
  }, [isOpen, selectedStudentId, selectedClass, searchQuery, mode, mode === 'batch' ? filteredStudents.length : selectedStudentId]);

  if (!isOpen) return null;

  // Toggle selection for batch mode
  const toggleSelectBatchStudent = (id: string) => {
    setSelectedBatchIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllBatch = () => {
    if (selectedBatchIds.length === filteredStudents.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(filteredStudents.map(s => s.id));
    }
  };

  // Direct print window generator for 100% clean, standalone card printing in 3x3 grid (9 cards per A4 page)
  const printStudentQRCards = (
    studentsToPrint: Student[],
    qrCodeUrlsMap: Record<string, string>,
    title: string,
    appSettings: Settings | null,
    cols: 2 | 3 = printGridCols
  ) => {
    const logoHtml = appSettings?.kop_logo_base64
      ? `<img src="${appSettings.kop_logo_base64}" style="height: 26px; max-width: 55px; object-fit: contain;" />`
      : `<div style="font-size: 16px;">🏫</div>`;

    const namaSekolah = appSettings?.nama_sekolah || 'SEKOLAH SAYA';
    const alamatSekolah = appSettings?.alamat || 'Kartu Presensi Digital';
    const semesterAktif = appSettings?.semester_aktif || 'Aktif';

    const cardsHtml = studentsToPrint.map((student) => {
      const qrUrl = qrCodeUrlsMap[student.id] || '';
      return `
        <div class="qr-card">
          <div class="qr-card-header">
            ${logoHtml}
            <div class="header-info">
              <div class="school-name">${namaSekolah}</div>
              <div class="school-addr">${alamatSekolah}</div>
            </div>
          </div>

          <div class="qr-card-body">
            <div class="qr-img-box">
              ${qrUrl ? `<img src="${qrUrl}" alt="QR Code" />` : '<div class="no-qr">No QR</div>'}
            </div>
            <div class="student-details">
              <div class="class-pill">
                <span>${student.no ? '#' + student.no : ''}</span>
                <span>Kelas ${student.kelas || '-'}</span>
              </div>
              <div class="student-name">${student.nama || '-'}</div>
              <div class="student-nisn">NISN/NIS: ${student.nisn || student.nis || '-'}</div>
            </div>
          </div>

          <div class="qr-card-footer">
            <span>✨ PRESENSI QR CODE</span>
            <span>Semester ${semesterAktif}</span>
          </div>
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=980,height=780');

    if (!printWindow) {
      toast.error('Gagal membuka jendela cetak. Mengalihkan ke cetak langsung browser...');
      window.print();
      return;
    }

    const isTwoCol = cols === 2;
    const qrImageSize = isTwoCol ? '118px' : '92px';
    const minCardHeight = isTwoCol ? '68mm' : '56mm';
    const maxCardHeight = isTwoCol ? '75mm' : '62mm';
    const gapSize = isTwoCol ? '5mm' : '3.5mm';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 6mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              margin: 0;
              padding: 4px;
              background: #ffffff;
              color: #0f172a;
            }
            .grid-layout {
              display: grid;
              grid-template-columns: repeat(${cols}, 1fr);
              gap: ${gapSize};
              width: 100%;
            }
            .qr-card {
              border: 2px solid #000000;
              border-radius: 10px;
              padding: ${isTwoCol ? '10px 12px' : '6px 8px'};
              background: #ffffff;
              page-break-inside: avoid;
              break-inside: avoid;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-height: ${minCardHeight};
              max-height: ${maxCardHeight};
              box-shadow: none;
            }
            .qr-card-header {
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1.5px solid #0f172a;
              padding-bottom: 4px;
              margin-bottom: 4px;
            }
            .header-info {
              line-height: 1.1;
              min-width: 0;
            }
            .school-name {
              font-size: ${isTwoCol ? '11px' : '9px'};
              font-weight: 800;
              text-transform: uppercase;
              color: #0f172a;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .school-addr {
              font-size: ${isTwoCol ? '8.5px' : '7px'};
              color: #475569;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .qr-card-body {
              display: flex;
              align-items: center;
              gap: 8px;
              flex: 1;
              padding: 3px 0;
            }
            .qr-img-box {
              border: 2px solid #000000;
              border-radius: 8px;
              padding: 3px;
              background: #ffffff;
              flex-shrink: 0;
            }
            .qr-img-box img {
              width: ${qrImageSize};
              height: ${qrImageSize};
              display: block;
            }
            .no-qr {
              width: ${qrImageSize};
              height: ${qrImageSize};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              color: #94a3b8;
            }
            .student-details {
              flex: 1;
              min-width: 0;
            }
            .class-pill {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              background: #e0e7ff;
              border: 1px solid #6366f1;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: ${isTwoCol ? '9.5px' : '8px'};
              font-weight: 800;
              color: #1e1b4b;
              margin-bottom: 3px;
            }
            .student-name {
              font-size: ${isTwoCol ? '12px' : '10px'};
              font-weight: 800;
              color: #0f172a;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 2px;
            }
            .student-nisn {
              font-size: ${isTwoCol ? '10px' : '8px'};
              color: #1e1b4b;
              font-family: monospace;
              font-weight: 700;
            }
            .qr-card-footer {
              border-top: 1px dashed #94a3b8;
              padding-top: 3px;
              margin-top: 3px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: ${isTwoCol ? '8.5px' : '7px'};
              font-weight: 700;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="grid-layout">
            ${cardsHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  window.close();
                }, 500);
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Print handler for single or collective cards
  const handlePrint = async () => {
    let targetStudents: Student[] = [];

    if (mode === 'single') {
      if (selectedStudent) {
        targetStudents = [selectedStudent];
      }
    } else {
      if (selectedBatchIds.length > 0) {
        targetStudents = filteredStudents.filter(s => selectedBatchIds.includes(s.id));
      } else {
        targetStudents = filteredStudents;
      }
    }

    if (targetStudents.length === 0) {
      toast.error('Tidak ada siswa yang dipilih atau sesuai filter untuk dicetak!');
      return;
    }

    const toastId = toast.loading(`Menyiapkan ${targetStudents.length} kartu QR...`);

    try {
      const updatedUrls = { ...qrCodeUrls };
      let missingCount = 0;

      for (const student of targetStudents) {
        if (!updatedUrls[student.id]) {
          missingCount++;
          const qrPayload = JSON.stringify({
            type: 'PRESENSI_SISWA',
            id: student.id,
            nisn: student.nisn || '',
            nis: student.nis || '',
            nama: student.nama,
            kelas: student.kelas || ''
          });

          const url = await QRCode.toDataURL(qrPayload, {
            width: 600,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff'
            },
            errorCorrectionLevel: 'H'
          });
          updatedUrls[student.id] = url;
        }
      }

      if (missingCount > 0) {
        setQrCodeUrls(updatedUrls);
      }

      toast.dismiss(toastId);

      const title = mode === 'single'
        ? `Kartu QR Presensi - ${targetStudents[0]?.nama || 'Siswa'}`
        : `Cetak Kolektif Kartu QR Presensi - Kelas ${selectedClass}`;

      printStudentQRCards(targetStudents, updatedUrls, title, settings);
    } catch (err) {
      console.error('Error preparing print:', err);
      toast.dismiss(toastId);
      toast.error('Gagal menyiapkan kartu untuk dicetak.');
    }
  };

  const downloadBase64Image = (dataUrl: string, fileName: string) => {
    try {
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].split(':')[1] || 'image/png';
      const raw = window.atob(parts[1]);
      const uInt8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('Download error:', err);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      link.target = '_blank';
      link.click();
    }
  };

  const openImageInNewTab = (dataUrl: string) => {
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Pratinjau Kartu QR Presensi</title>
            <style>
              body {
                margin: 0;
                background-color: #0f172a;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                font-family: sans-serif;
                color: white;
              }
              img {
                max-width: 90%;
                max-height: 80vh;
                border-radius: 16px;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
              }
              p {
                margin-top: 16px;
                font-size: 14px;
                color: #94a3b8;
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" alt="Kartu QR Code" />
            <p>Klik kanan pada gambar lalu pilih "Simpan Gambar Sebagai..." (Save image as) untuk mengunduh.</p>
          </body>
        </html>
      `);
    } else {
      toast.error('Gagal membuka jendela baru, mohon izinkan popup di browser Anda.');
    }
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = src;
      if (img.complete) {
        resolve(img);
      }
    });
  };

  const handleDownloadSingle = (student: Student) => {
    const url = qrCodeUrls[student.id];
    if (!url) {
      toast.error('QR Code belum siap untuk diunduh, silakan coba lagi.');
      return;
    }
    const safeName = (student.nama || 'Siswa').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `QR_Presensi_${safeName}_Kelas_${student.kelas || 'Umum'}.png`;
    downloadBase64Image(url, fileName);
    toast.success(`QR Code ${student.nama} berhasil diunduh!`);
  };

  const handleDownloadFullCard = async (student: Student) => {
    const qrUrl = qrCodeUrls[student.id];
    if (!qrUrl) {
      toast.error('QR Code belum siap.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background Card
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.fillRect(0, 0, 800, 480);

      // Card Header Background
      ctx.fillStyle = '#1e1b4b'; // indigo-950
      ctx.fillRect(0, 0, 800, 90);

      // Card Border
      ctx.strokeStyle = '#6366f1'; // indigo-500
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, 794, 474);

      // Draw School Logo if exists
      if (settings?.kop_logo_base64) {
        try {
          const logoImg = await loadImage(settings.kop_logo_base64);
          ctx.drawImage(logoImg, 24, 18, 54, 54);
        } catch (logoErr) {
          console.warn('Logo draw skipped:', logoErr);
        }
      }

      // Header Text
      const textLeftOffset = settings?.kop_logo_base64 ? 90 : 24;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(settings?.nama_sekolah || 'KARTU PRESENSI SISWA', textLeftOffset, 45);

      ctx.fillStyle = '#a5b4fc';
      ctx.font = '13px sans-serif';
      ctx.fillText(settings?.alamat || 'KARTU IDENTITAS DIGITAL PRESENSI QR CODE', textLeftOffset, 68);

      // Draw QR Code Image (Super High Res & Extra Large)
      const qrImg = await loadImage(qrUrl);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 105, 330, 330);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 105, 330, 330);
      ctx.drawImage(qrImg, 30, 115, 310, 310);

      // Student Info
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('NAMA SISWA', 380, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(student.nama || '-', 380, 175);

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('KELAS', 380, 225);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(student.kelas || '-', 380, 252);

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('NO. ABSEN', 580, 225);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(String(student.no ?? '-'), 580, 252);

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('NISN / NIS', 380, 305);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(student.nisn || student.nis || '-', 380, 332);

      // Footer
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 420, 800, 60);

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('⚡ PRESENSI QR CODE OTOMATIS', 24, 455);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Tahun Ajaran: ${student.semester || 'Aktif'}`, 600, 455);

      const cardDataUrl = canvas.toDataURL('image/png');
      const safeName = (student.nama || 'Siswa').replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadBase64Image(cardDataUrl, `Kartu_Presensi_${safeName}.png`);
      toast.success(`Kartu Presensi ${student.nama} berhasil diunduh!`);
    } catch (e) {
      console.error('Failed to generate full card image:', e);
      handleDownloadSingle(student);
    }
  };

  return createPortal(
    <div id="qr-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto print:bg-white print:p-0 print:static print:inset-auto">
      {/* Modal Container */}
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-none print:bg-white print:text-black">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Kartu QR Code Presensi Siswa
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  {mode === 'single' ? 'Mode Individu' : `Cetak Kolektif (${selectedBatchIds.length}/${filteredStudents.length} Siswa)`}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pilih cetak individu atau kolektif untuk mencetak kartu identitas QR presensi siswa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{mode === 'single' ? 'Cetak Kartu Ini' : `Cetak Kolektif (${selectedBatchIds.length})`}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Controls & Filter Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4 print:hidden">
          {/* Mode Tabs */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setMode('single')}
              aria-label="Mode Kartu Individu"
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'single'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Kartu Individu</span>
            </button>
            <button
              onClick={() => setMode('batch')}
              aria-label="Cetak Kolektif Satu Kelas"
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'batch'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Cetak Kolektif (Satu Kelas)</span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Kelas */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-transparent text-xs text-white outline-none cursor-pointer"
              >
                <option value="Semua" className="bg-slate-900 text-white">Semua Kelas</option>
                {classes.map((cls) => (
                  <option key={cls} value={cls} className="bg-slate-900 text-white">
                    Kelas {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Single Dropdown */}
            {mode === 'single' && (
              <div className="relative">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer max-w-[200px] truncate"
                >
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.no ? `${s.no}. ` : ''}{s.nama} ({s.kelas || '-'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari siswa/NISN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-800 border border-slate-700/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 w-44"
              />
            </div>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950/40 print:p-0 print:bg-white print:overflow-visible">
          {isGenerating && (
            <div className="flex items-center justify-center p-8 text-slate-400 text-xs gap-2 print:hidden">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              Membuat QR Code...
            </div>
          )}

          {/* SINGLE MODE DISPLAY */}
          {mode === 'single' && selectedStudent && (
            <div className="flex flex-col items-center justify-center my-2 print:my-0">
              {/* Display Mode Toggle (Layar Full vs Kartu Standard) */}
              <div className="mb-4 flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl print:hidden">
                <button
                  onClick={() => setIsFullDisplayMode(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    !isFullDisplayMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>🎴 Kartu Identitas ID Card</span>
                </button>
                <button
                  onClick={() => setIsFullDisplayMode(true)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    isFullDisplayMode ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
                  <span>⚡ Scan Mode Layar (Super Besar)</span>
                </button>
              </div>

              {/* SUPER LARGE SCREEN SCAN MODE */}
              {isFullDisplayMode ? (
                <div className="w-full max-w-md bg-slate-900 border-2 border-emerald-500/60 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500"></div>
                  
                  <div className="mb-3">
                    <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold rounded-full tracking-wide uppercase inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> SIAP SCAN KAMERA HP / LAPTOP
                    </span>
                  </div>

                  {/* Super Large QR Image Box */}
                  <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-slate-950 my-2 relative group">
                    {qrCodeUrls[selectedStudent.id] ? (
                      <img
                        src={qrCodeUrls[selectedStudent.id]}
                        alt={`QR Code ${selectedStudent.nama}`}
                        className="w-64 h-64 sm:w-80 sm:h-80 object-contain transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-64 h-64 sm:w-80 sm:h-80 bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-xs text-slate-400">
                        Memuat QR Code...
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    <h3 className="text-xl font-black text-white tracking-wide">
                      {selectedStudent.nama}
                    </h3>
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-300 font-semibold">
                      <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md">
                        Kelas {selectedStudent.kelas || '-'}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-emerald-400">
                        NISN: {selectedStudent.nisn || selectedStudent.nis || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ID CARD DESIGN CONTAINER */
                <div className="w-full max-w-md bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border-2 border-indigo-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden print:border-2 print:border-black print:bg-white print:text-black print:shadow-none print:w-[85mm] print:h-[55mm] print:p-3 print:rounded-none">
                  
                  {/* Header Sekolah */}
                  <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3 mb-4 print:border-black print:pb-1.5 print:mb-2">
                    <div className="flex items-center gap-2.5">
                      {settings?.kop_logo_base64 ? (
                        <img
                          src={settings.kop_logo_base64}
                          alt="Logo Sekolah"
                          className="w-9 h-9 object-contain rounded"
                        />
                      ) : (
                        <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg print:border print:border-black">
                          <School className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white print:text-black">
                          {settings?.nama_sekolah || 'KARTU PRESENSI SISWA'}
                        </h3>
                        <p className="text-[10px] text-indigo-300 print:text-slate-700">
                          {settings?.alamat || 'KARTU IDENTITAS DIGITAL'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Content: QR Code & Student Info */}
                  <div className="flex items-center gap-4">
                    {/* QR Image */}
                    <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-slate-900 flex-shrink-0 print:border-black print:p-1">
                      {qrCodeUrls[selectedStudent.id] ? (
                        <img
                          src={qrCodeUrls[selectedStudent.id]}
                          alt={`QR Code ${selectedStudent.nama}`}
                          className="w-44 h-44 sm:w-52 sm:h-52 object-contain print:w-24 print:h-24"
                        />
                      ) : (
                        <div className="w-44 h-44 sm:w-52 sm:h-52 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-[10px] text-slate-400">
                          Memuat QR...
                        </div>
                      )}
                    </div>

                    {/* Student Details */}
                    <div className="flex-1 space-y-2 text-left min-w-0">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-indigo-400 tracking-wider block print:text-slate-600">
                          Nama Siswa
                        </span>
                        <h4 className="text-base font-extrabold text-white leading-snug line-clamp-2 print:text-black print:text-xs">
                          {selectedStudent.nama}
                        </h4>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <span className="text-[9px] text-slate-400 block print:text-slate-600">Kelas</span>
                          <span className="font-bold text-slate-100 print:text-black">
                            {selectedStudent.kelas || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block print:text-slate-600">Absen</span>
                          <span className="font-bold text-slate-100 print:text-black">
                            {selectedStudent.no ?? '-'}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs">
                        <span className="text-[9px] text-slate-400 block print:text-slate-600">NISN / NIS</span>
                        <span className="font-mono font-bold text-indigo-300 print:text-black">
                          {selectedStudent.nisn || selectedStudent.nis || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Badge */}
                  <div className="mt-4 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-400 print:border-black print:mt-2 print:pt-1">
                    <span className="flex items-center gap-1 font-bold text-indigo-400 print:text-black">
                      <Sparkles className="w-3 h-3" /> PRESENSI QR CODE
                    </span>
                    <span>Tahun Ajaran {selectedStudent.semester || 'Aktif'}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons for Single Card */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 print:hidden">
                <button
                  onClick={handlePrint}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                  title="Cetak kartu siswa ini ke PDF atau Printer"
                >
                  <Printer className="w-4 h-4" />
                  Cetak Kartu Ini (Individu)
                </button>

                <button
                  onClick={() => handleDownloadFullCard(selectedStudent)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                  title="Unduh file gambar kartu identitas presensi lengkap beserta QR Code"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Unduh Kartu (PNG)
                </button>

                <button
                  onClick={() => handleDownloadSingle(selectedStudent)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                  title="Unduh file gambar QR Code saja"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  Unduh QR Saja
                </button>

                {qrCodeUrls[selectedStudent.id] && (
                  <button
                    onClick={() => openImageInNewTab(qrCodeUrls[selectedStudent.id])}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    title="Buka gambar QR Code di tab baru"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BATCH / KOLEKTIF MODE DISPLAY */}
          {mode === 'batch' && (
            <div className="space-y-4">
              {/* Batch Action Bar */}
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={toggleSelectAllBatch}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-slate-200 font-medium transition-all cursor-pointer"
                  >
                    {selectedBatchIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Pilih Semua ({filteredStudents.length} Siswa)</span>
                  </button>

                  <span className="text-slate-400 flex items-center gap-2">
                    <strong className="text-indigo-400">{selectedBatchIds.length}</strong> siswa dipilih
                  </span>

                  {/* Grid Layout Selector */}
                  <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
                    <span className="text-[10px] text-slate-400 px-2 font-medium">Tata Letak Cetak:</span>
                    <button
                      onClick={() => setPrintGridCols(2)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        printGridCols === 2 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      2 Kolom (Besar - QR 118px)
                    </button>
                    <button
                      onClick={() => setPrintGridCols(3)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        printGridCols === 3 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      3 Kolom (Standard - QR 92px)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Kolektif {printGridCols} Kolom ({selectedBatchIds.length > 0 ? selectedBatchIds.length : filteredStudents.length} Siswa)</span>
                  </button>
                </div>
              </div>

              {/* Grid of Student Cards for Batch Printing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 print:grid-cols-3 print:gap-2 print:p-0">
                {filteredStudents.map((student) => {
                  const isSelected = selectedBatchIds.includes(student.id);
                  return (
                    <div
                      key={student.id}
                      onClick={() => toggleSelectBatchStudent(student.id)}
                      className={`bg-slate-900 border rounded-2xl p-4 shadow-md flex items-center gap-3 relative cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-indigo-500/70 bg-indigo-950/20 ring-1 ring-indigo-500/40' 
                          : 'border-slate-800 opacity-70 hover:opacity-100 print:hidden'
                      } print:border print:border-black print:bg-white print:p-2.5 print:rounded-none print:opacity-100 print:break-inside-avoid`}
                    >
                      {/* Checkbox badge */}
                      <div className="absolute top-2.5 right-2.5 print:hidden">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </div>

                      {/* QR Code */}
                      <div className="p-2 bg-white rounded-2xl border-2 border-slate-900 flex-shrink-0 print:border-black">
                        {qrCodeUrls[student.id] ? (
                          <img
                            src={qrCodeUrls[student.id]}
                            alt={`QR Code ${student.nama}`}
                            className="w-32 h-32 sm:w-36 sm:h-36 object-contain print:w-20 print:h-20"
                          />
                        ) : (
                          <div className="w-32 h-32 sm:w-36 sm:h-36 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-[9px] text-slate-400">
                            Loading...
                          </div>
                        )}
                      </div>

                      {/* Student Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 pr-5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold print:bg-slate-200 print:text-black">
                            {student.no ? `#${student.no}` : student.kelas}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate print:text-slate-600">
                            {student.kelas}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-white truncate print:text-black">
                          {student.nama}
                        </h4>

                        <p className="text-[10px] font-mono text-indigo-300 truncate print:text-black">
                          NISN: {student.nisn || student.nis || '-'}
                        </p>

                        <div className="pt-1 flex items-center gap-2 print:hidden" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              let url = qrCodeUrls[student.id];
                              if (!url) {
                                try {
                                  const qrPayload = generateStudentQRPayload(student);
                                  url = await QRCode.toDataURL(qrPayload, {
                                    width: 800,
                                    margin: 3,
                                    color: { dark: '#000000', light: '#ffffff' },
                                    errorCorrectionLevel: 'M'
                                  });
                                  setQrCodeUrls(prev => ({ ...prev, [student.id]: url }));
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                              printStudentQRCards([student], { ...qrCodeUrls, [student.id]: url || '' }, `Kartu QR Presensi - ${student.nama}`, settings, printGridCols);
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                            title="Cetak kartu siswa ini saja"
                          >
                            <Printer className="w-3 h-3" /> Cetak
                          </button>

                          <button
                            onClick={() => handleDownloadFullCard(student)}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
                            title="Unduh Kartu Presensi Lengkap"
                          >
                            <Sparkles className="w-3 h-3" /> Kartu
                          </button>

                          <button
                            onClick={() => handleDownloadSingle(student)}
                            className="text-[10px] text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1 cursor-pointer"
                            title="Unduh file QR saja"
                          >
                            <Download className="w-3 h-3" /> QR
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 print:hidden">
          <span>
            Total Siswa Terdaftar: <strong className="text-white">{students.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

