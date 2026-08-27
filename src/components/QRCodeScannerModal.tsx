import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Student, Attendance, store } from '../lib/store';
import { getCurrentUser } from '../lib/rbac';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { 
  X, QrCode, Camera, Keyboard, Volume2, VolumeX, CheckCircle2, 
  AlertCircle, Clock, Trash2, ShieldCheck, Sparkles, UserCheck, 
  RefreshCw, Check, AlertTriangle, User, Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';

interface QRCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  semester: string;
  selectedDate: string;
  filterClass: string;
  classes: string[];
  onAttendanceUpdated: () => void;
}

interface ScannedRecord {
  id: string; // attendance id
  studentId: string;
  nama: string;
  kelas: string;
  nisn: string;
  status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
  timestamp: string;
  isNewScan?: boolean;
}

export default function QRCodeScannerModal({
  isOpen,
  onClose,
  students,
  semester,
  selectedDate,
  filterClass,
  classes,
  onAttendanceUpdated
}: QRCodeScannerModalProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'hardware'>('camera');
  const [attendanceStatus, setAttendanceStatus] = useState<'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>('Hadir');
  const [manualInput, setManualInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [scannedList, setScannedList] = useState<ScannedRecord[]>([]);
  const [lastScannedStudent, setLastScannedStudent] = useState<ScannedRecord | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const hardwareInputRef = useRef<HTMLInputElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize Web Audio API for feedback chimes
  const playSound = (type: 'success' | 'warning' | 'error') => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'warning') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(349.23, now + 0.15); // F4
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(164.81, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      console.warn('Audio feedback error:', e);
    }
  };

  // Get available cameras
  useEffect(() => {
    if (!isOpen) return;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (cameras && cameras.length > 0) {
          setAvailableCameras(cameras);
          // Prefer back camera if available
          const backCam = cameras.find((c) => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment'));
          setSelectedCameraId(backCam ? backCam.id : cameras[0].id);
        } else {
          setScannerError('Kamera tidak ditemukan pada perangkat ini.');
        }
      })
      .catch((err) => {
        console.warn('Failed to list cameras:', err);
        setScannerError('Izin akses kamera belum diberikan. Izinkan akses kamera pada browser.');
      });
  }, [isOpen]);

  // Handle Camera Scanner Lifecycle
  useEffect(() => {
    if (!isOpen || scanMode !== 'camera' || !selectedCameraId) {
      stopCameraScanner();
      return;
    }

    let isMounted = true;

    const startCamera = async () => {
      setScannerError(null);
      setIsScanning(true);

      try {
        if (html5QrcodeRef.current) {
          await stopCameraScanner();
        }

        const qrScanner = new Html5Qrcode('qr-reader-viewport');
        html5QrcodeRef.current = qrScanner;

        await qrScanner.start(
          selectedCameraId,
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const boxSize = Math.max(260, Math.floor(minEdge * 0.82));
              return { width: boxSize, height: boxSize };
            },
            aspectRatio: 1.0
          },
          (decodedText) => {
            if (isMounted) {
              handleDecodedQRCode(decodedText);
            }
          },
          () => {
            // ignore scan frame errors
          }
        );
      } catch (err: any) {
        console.error('Failed to start camera:', err);
        if (isMounted) {
          setScannerError(
            err?.message || 'Gagal membuka kamera. Pastikan izin kamera aktif dan kamera tidak digunakan aplikasi lain.'
          );
          setIsScanning(false);
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      stopCameraScanner();
    };
  }, [isOpen, scanMode, selectedCameraId]);

  const stopCameraScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        await html5QrcodeRef.current.clear();
      } catch (e) {
        // ignore cleanup error
      }
      html5QrcodeRef.current = null;
    }
    setIsScanning(false);
  };

  // Focus hardware input when hardware mode active
  useEffect(() => {
    if (scanMode === 'hardware' && hardwareInputRef.current) {
      hardwareInputRef.current.focus();
    }
  }, [scanMode, isOpen]);

  // Load existing attendances for today
  useEffect(() => {
    if (!isOpen) return;

    const loadTodayScans = async () => {
      const records: ScannedRecord[] = [];
      const selTgl = String(selectedDate || '').trim().substring(0, 10);

      await store.attendance.iterate<Attendance, void>((v) => {
        const vTgl = String(v.tanggal || '').trim().substring(0, 10);
        if (vTgl === selTgl) {
          const student = students.find((s) => s.id === v.id_siswa || (s.nisn && v.nisn && s.nisn === v.nisn));
          if (student) {
            records.push({
              id: v.id,
              studentId: student.id,
              nama: student.nama,
              kelas: student.kelas || '-',
              nisn: student.nisn || student.nis || '-',
              status: v.status,
              timestamp: v.created_at || format(new Date(), 'HH:mm:ss')
            });
          }
        }
      });

      setScannedList(records.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    };

    loadTodayScans();
  }, [isOpen, selectedDate, students]);

  // Core QR Processing Logic
  const handleDecodedQRCode = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    let matchedStudent: Student | null = null;

    // Try parsing JSON format
    try {
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const payload = JSON.parse(trimmed);
        if (payload.id) {
          matchedStudent = students.find((s) => s.id === payload.id) || null;
        }
        if (!matchedStudent && payload.nisn) {
          matchedStudent = students.find((s) => s.nisn && String(s.nisn).trim() === String(payload.nisn).trim()) || null;
        }
        if (!matchedStudent && payload.nis) {
          matchedStudent = students.find((s) => s.nis && String(s.nis).trim() === String(payload.nis).trim()) || null;
        }
      }
    } catch (e) {
      // Not JSON, continue to raw string lookup
    }

    // Fallback: Plain text lookup by ID, NISN, NIS, or Exact Name
    if (!matchedStudent) {
      matchedStudent =
        students.find(
          (s) =>
            s.id === trimmed ||
            (s.nisn && String(s.nisn).trim() === trimmed) ||
            (s.nis && String(s.nis).trim() === trimmed) ||
            s.nama.toLowerCase().trim() === trimmed.toLowerCase()
        ) || null;
    }

    if (!matchedStudent) {
      playSound('error');
      toast.error(`Siswa dengan kode "${trimmed}" tidak ditemukan pada database!`, { id: 'qr-not-found' });
      return;
    }

    // Process Attendance Record
    await processStudentAttendance(matchedStudent);
  };

  const processStudentAttendance = async (student: Student) => {
    const currentUser = getCurrentUser();
    const selTgl = String(selectedDate || '').trim().substring(0, 10);
    const existingKey = `${student.id}_${selTgl}`;

    // Check existing attendance in store
    let existingAttendance: Attendance | null = null;
    await store.attendance.iterate<Attendance, void>((v) => {
      const vTgl = String(v.tanggal || '').trim().substring(0, 10);
      if (vTgl === selTgl && (v.id_siswa === student.id || (v.nisn && student.nisn && v.nisn === student.nisn))) {
        existingAttendance = v;
      }
    });

    const isDuplicateStatus = existingAttendance && (existingAttendance as Attendance).status === attendanceStatus;

    if (isDuplicateStatus) {
      playSound('warning');
      toast.custom(
        (t) => (
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} bg-amber-950 border border-amber-600 text-amber-200 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs`}>
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="font-bold">{student.nama}</p>
              <p className="text-[11px] text-amber-300">
                Sudah tercatat <strong>{attendanceStatus}</strong> untuk hari ini ({selTgl}).
              </p>
            </div>
          </div>
        ),
        { id: `already-${student.id}` }
      );
      return;
    }

    const nowTimeStr = format(new Date(), 'HH:mm:ss');
    const attRecord: Attendance = {
      id: existingAttendance ? (existingAttendance as Attendance).id : uuidv4(),
      id_siswa: student.id,
      nama: student.nama,
      kelas: student.kelas || '-',
      tanggal: selTgl,
      status: attendanceStatus,
      semester: semester || student.semester || 'Ganjil',
      keterangan: `Presensi via QR Scanner (${nowTimeStr})`,
      created_at: existingAttendance ? (existingAttendance as Attendance).created_at || nowTimeStr : nowTimeStr,
      created_by: currentUser?.name || 'Wali Kelas'
    };

    // Save to store
    await store.attendance.setItem(attRecord.id, attRecord);

    // Notify data changed
    window.dispatchEvent(new CustomEvent('data-changed', { detail: { source: 'qr_scanner' } }));

    // Play Success Sound
    playSound('success');

    // Create Scanned Item for UI
    const newScannedRecord: ScannedRecord = {
      id: attRecord.id,
      studentId: student.id,
      nama: student.nama,
      kelas: student.kelas || '-',
      nisn: student.nisn || student.nis || '-',
      status: attendanceStatus,
      timestamp: nowTimeStr,
      isNewScan: true
    };

    setLastScannedStudent(newScannedRecord);
    setScannedList((prev) => [newScannedRecord, ...prev.filter((p) => p.studentId !== student.id)]);

    toast.custom(
      (t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} bg-emerald-950 border border-emerald-500 text-emerald-100 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs`}>
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-sm text-white">{student.nama}</p>
            <p className="text-[11px] text-emerald-300">
              Kelas {student.kelas} • Status: <strong className="uppercase">{attendanceStatus}</strong> ({nowTimeStr})
            </p>
          </div>
        </div>
      ),
      { duration: 3000, id: `success-${student.id}` }
    );

    // Trigger parent callback
    onAttendanceUpdated();
  };

  // Handle Hardware / Manual Barcode submit
  const handleHardwareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleDecodedQRCode(manualInput.trim());
    setManualInput('');
    if (hardwareInputRef.current) {
      hardwareInputRef.current.focus();
    }
  };

  // Handle deleting a scan item
  const handleDeleteScan = async (record: ScannedRecord) => {
    await store.attendance.removeItem(record.id);
    setScannedList((prev) => prev.filter((r) => r.id !== record.id));
    if (lastScannedStudent?.id === record.id) {
      setLastScannedStudent(null);
    }
    window.dispatchEvent(new CustomEvent('data-changed', { detail: { source: 'qr_scanner_delete' } }));
    toast.success(`Presensi ${record.nama} dibatalkan.`);
    onAttendanceUpdated();
  };

  if (!isOpen) return null;

  // Stats summary for today
  const totalScanned = scannedList.length;
  const countHadir = scannedList.filter((s) => s.status === 'Hadir').length;
  const countSakit = scannedList.filter((s) => s.status === 'Sakit').length;
  const countIzin = scannedList.filter((s) => s.status === 'Izin').length;
  const countAlpa = scannedList.filter((s) => s.status === 'Alpa').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
              <QrCode className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Scanner Presensi QR Code
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Realtime Mode
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Tanggal: <strong className="text-slate-200">{selectedDate}</strong> • Filter:{' '}
                <strong className="text-slate-200">{filterClass || 'Semua Kelas'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? "Nonaktifkan Suara" : "Aktifkan Suara"}
              className={`p-2.5 rounded-xl border transition-all text-xs flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-800/50 text-slate-500 border-slate-800'
              }`}
              title={soundEnabled ? 'Suara Pemindaian Aktif' : 'Suara Pemindaian Bisu'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Status Quick Selector Bar */}
        <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Set Status Presensi Hasil Scan:</span>
            <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
              {(['Hadir', 'Sakit', 'Izin', 'Alpa'] as const).map((status) => {
                const active = attendanceStatus === status;
                const colors = {
                  Hadir: 'bg-emerald-600 text-white shadow-emerald-900/30',
                  Sakit: 'bg-amber-600 text-white shadow-amber-900/30',
                  Izin: 'bg-blue-600 text-white shadow-blue-900/30',
                  Alpa: 'bg-rose-600 text-white shadow-rose-900/30'
                };
                return (
                  <button
                    key={status}
                    onClick={() => setAttendanceStatus(status)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      active ? `${colors[status]} shadow-lg` : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scanner Mode Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setScanMode('camera')}
              aria-label="Mode Kamera"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                scanMode === 'camera'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Kamera HP/Webcam
            </button>
            <button
              onClick={() => setScanMode('hardware')}
              aria-label="Mode Barcode Scanner USB"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                scanMode === 'hardware'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" /> Scanner USB / Manual
            </button>
          </div>
        </div>

        {/* Main Content: Split View (Scanner Left, Scanned List Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-950">
          
          {/* LEFT: SCANNER VIEWPORT (7 COLS) */}
          <div className="lg:col-span-7 p-6 border-r border-slate-800/80 flex flex-col justify-between overflow-y-auto">
            
            {/* CAMERA MODE */}
            {scanMode === 'camera' && (
              <div className="space-y-4">
                {/* Camera Selection Dropdown */}
                {availableCameras.length > 1 && (
                  <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-indigo-400" /> Pilih Kamera:
                    </span>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="bg-slate-800 text-white rounded-lg px-2.5 py-1 outline-none text-xs border border-slate-700"
                    >
                      {availableCameras.map((cam) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label || `Kamera ${cam.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Viewport Box */}
                <div className="relative w-full aspect-square max-w-[440px] mx-auto bg-slate-900 border-2 border-indigo-500/40 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center">
                  <div id="qr-reader-viewport" className="w-full h-full object-cover"></div>

                  {/* Overlay scanning reticle */}
                  {isScanning && !scannerError && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-72 h-72 sm:w-80 sm:h-80 border-2 border-dashed border-emerald-400/80 rounded-2xl relative animate-pulse">
                        <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                      </div>
                    </div>
                  )}

                  {scannerError && (
                    <div className="absolute inset-0 bg-slate-900/95 p-6 flex flex-col items-center justify-center text-center space-y-3 z-10">
                      <AlertCircle className="w-10 h-10 text-rose-500" />
                      <p className="text-xs text-rose-300 font-medium">{scannerError}</p>
                      <button
                        onClick={() => setSelectedCameraId(selectedCameraId)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-center text-xs text-slate-400">
                  Arahkan QR Code Kartu Siswa ke dalam kotak kamera di atas.
                </p>
              </div>
            )}

            {/* HARDWARE / MANUAL INPUT MODE */}
            {scanMode === 'hardware' && (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5 my-auto">
                <div className="text-center space-y-1">
                  <div className="inline-p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl p-3 mb-2">
                    <Keyboard className="w-8 h-8 mx-auto" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Mode Barcode Scanner USB / Bluetooth</h3>
                  <p className="text-xs text-slate-400">
                    Sambungkan alat pemindai fisik atau ketik NISN / NIS siswa secara manual lalu tekan Enter.
                  </p>
                </div>

                <form onSubmit={handleHardwareSubmit} className="space-y-3">
                  <div className="relative">
                    <input
                      ref={hardwareInputRef}
                      type="text"
                      placeholder="Pindai atau ketik Kode/NISN di sini..."
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 bg-slate-950 border-2 border-indigo-500/50 rounded-2xl text-white text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 font-mono transition-all"
                      autoFocus
                    />
                    <button
                      type="submit"
                      aria-label="Proses Input Barcode Manual"
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Proses
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* LAST SCANNED BANNER CARD */}
            {lastScannedStudent && (
              <div className="mt-4 p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center justify-between text-emerald-200">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      Terakhir Dipindai ({lastScannedStudent.timestamp})
                    </span>
                    <h4 className="text-sm font-bold text-white">{lastScannedStudent.nama}</h4>
                    <p className="text-xs text-emerald-300">
                      Kelas {lastScannedStudent.kelas} • NISN: {lastScannedStudent.nisn}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs uppercase">
                  {lastScannedStudent.status}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: SCANNED FEED & TODAY STATS (5 COLS) */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between overflow-hidden bg-slate-900/40">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              
              {/* Today Summary Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Daftar Presensi Dipindai Hari Ini
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                  Total: {totalScanned} Siswa
                </span>
              </div>

              {/* Quick Stat Chips */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <span className="block text-[10px] text-slate-400">Hadir</span>
                  <span className="font-bold text-sm">{countHadir}</span>
                </div>
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <span className="block text-[10px] text-slate-400">Sakit</span>
                  <span className="font-bold text-sm">{countSakit}</span>
                </div>
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                  <span className="block text-[10px] text-slate-400">Izin</span>
                  <span className="font-bold text-sm">{countIzin}</span>
                </div>
                <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                  <span className="block text-[10px] text-slate-400">Alpa</span>
                  <span className="font-bold text-sm">{countAlpa}</span>
                </div>
              </div>

              {/* Scanned List Scrollable */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {scannedList.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs p-4 border border-dashed border-slate-800 rounded-2xl">
                    <QrCode className="w-8 h-8 text-slate-600 mb-2" />
                    Belum ada siswa yang dipindai hari ini.
                    <br />
                    Mulai pindai QR Code kartu siswa.
                  </div>
                ) : (
                  scannedList.map((item) => {
                    const statusBadgeColors = {
                      Hadir: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      Sakit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      Izin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                      Alpa: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    };
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex items-center justify-between text-xs hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-[10px]">
                            {item.nama.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-white leading-tight">{item.nama}</h4>
                            <p className="text-[10px] text-slate-400">
                              {item.kelas} • <span className="font-mono">{item.timestamp}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${
                              statusBadgeColors[item.status]
                            }`}
                          >
                            {item.status}
                          </span>
                          <button
                            onClick={() => handleDeleteScan(item)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-all"
                            title="Batalkan presensi ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer Finish Button */}
            <div className="pt-4 border-t border-slate-800/80 mt-4">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-2xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Selesai & Simpan Presensi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
