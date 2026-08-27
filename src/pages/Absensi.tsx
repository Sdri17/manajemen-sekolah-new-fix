import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { store, Student, Attendance, Settings, CustomHoliday, pauseNotifications, resumeNotifications } from '../lib/store';
import { getMergedClassesFromStudents } from '../lib/classHelper';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { v4 as uuidv4 } from 'uuid';
import { Download, Save, Calendar, Trash2, Plus, Info, AlertTriangle, CheckSquare, Pencil, CheckCircle2, FileText, Check, Eye, EyeOff, ChevronLeft, ChevronRight, X, RefreshCw, ArrowUpDown, ChevronUp, ChevronDown, QrCode, Users, Table, LayoutGrid } from 'lucide-react';
import QRCodeScannerModal from '../components/QRCodeScannerModal';
import StudentQRCodeModal from '../components/StudentQRCodeModal';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, subDays } from 'date-fns';
import { id } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { usePendingSync } from '../hooks/usePendingSync';
import { PendingBadge } from '../components/PendingBadge';
import BackgroundDataBanner from '../components/BackgroundDataBanner';

interface AbsensiProps {
  semester: string;
  role: 'guru' | 'kepsek';
  settings: Settings | null;
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
}

export default function Absensi({ semester, role, settings, setSettings }: AbsensiProps) {
  const { isPending } = usePendingSync();
  const [activeTab, setActiveTab] = useState<'Harian' | 'Rekap' | 'Libur'>('Harian');
  const [rekapFilter, setRekapFilter] = useState<'Hari Ini' | 'Minggu Ini' | '7 Hari Terakhir' | 'Bulan Ini' | '30 Hari Terakhir' | 'Semester' | 'Kustom'>('Bulan Ini');
  const [customStartDate, setCustomStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  
  // Local modifications before saving
  const [localStatuses, setLocalStatuses] = useState<Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>>({});

  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [filterClass, setFilterClass] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [targetAttendance, setTargetAttendance] = useState<number>(80);

  // New feature states: Holiday filter and duplicate modal
  const [hideHolidays, setHideHolidays] = useState<boolean>(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [showKepsekSig, setShowKepsekSig] = useState<boolean>(settings?.show_ttd_kepsek ?? true);

  // Layout view mode state ('table' | 'card')
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Kop Surat Toggle
  const [useKopSurat, setUseKopSurat] = useState<boolean>(settings?.tampilkan_kop_surat ?? true);

  // QR Code Presensi States
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isQrCardsModalOpen, setIsQrCardsModalOpen] = useState<boolean>(false);

  // Presensi Massal (Batch Attendance Checkboxes)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Modal Konfirmasi Presensi Massal State
  interface BatchConfirmData {
    status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
    students: Student[];
    sourceTitle: string;
  }
  const [batchConfirmData, setBatchConfirmData] = useState<BatchConfirmData | null>(null);
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState<boolean>(false);

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (studentsToToggle: Student[]) => {
    const ids = studentsToToggle.filter(s => s.kelas !== 'Alumni').map(s => s.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedStudentIds(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleApplyBatchStatus = (status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    if (selectedStudentIds.length === 0) {
      toast.error('Pilih setidaknya satu siswa menggunakan checkbox.');
      return;
    }
    if (currentHolidayStatus.isLibur) {
      toast.error('Hari libur: tidak dapat mengubah presensi.');
      return;
    }

    const targetStudents = students.filter(s => selectedStudentIds.includes(s.id) && s.kelas !== 'Alumni');
    if (targetStudents.length === 0) {
      toast.error('Siswa terpilih tidak valid.');
      return;
    }

    const classLabel = filterClass ? `Kelas ${filterClass}` : 'Siswa Terpilih (Checkbox)';
    setBatchConfirmData({
      status,
      students: targetStudents,
      sourceTitle: `Presensi Massal (${classLabel})`
    });
    setShowBatchConfirmModal(true);
  };

  useEffect(() => {
    if (settings && typeof settings.tampilkan_kop_surat === 'boolean') {
      setUseKopSurat(settings.tampilkan_kop_surat);
    }
  }, [settings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterClass, activeTab, semester, selectedDate]);

  // Form states for creating custom holidays
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidayType, setHolidayType] = useState<'perhari' | 'kolektif'>('perhari');
  const [holidayCatatan, setHolidayCatatan] = useState('');
  const [holidayDate, setHolidayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayStartDate, setHolidayStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayEndDate, setHolidayEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [semester, selectedDate]);

  useEffect(() => {
    const handleDataChanged = () => {
      loadData();
    };
    window.addEventListener('data-changed', handleDataChanged);
    window.addEventListener('apply-buffered-data', handleDataChanged);
    return () => {
      window.removeEventListener('data-changed', handleDataChanged);
      window.removeEventListener('apply-buffered-data', handleDataChanged);
    };
  }, [semester, selectedDate]);

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const assignedClassesKey = assignedClasses.join(',');
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    if (isRestrictedClass && assignedClasses.length > 0) {
      if (!filterClass || !assignedClasses.some(c => c.toLowerCase() === filterClass.toLowerCase())) {
        if (assignedClasses[0] && filterClass !== assignedClasses[0]) {
          setFilterClass(assignedClasses[0]);
        }
      }
    }
  }, [isRestrictedClass, assignedClassesKey, filterClass]);

  // Helper to determine if a date is Sunday, Saturday (if 5-day school), or a custom holiday
  const checkHoliday = useCallback((date: Date): { isLibur: boolean; desc: string; catatan?: string } => {
    if (!date || isNaN(date.getTime())) return { isLibur: false, desc: '' };
    if (date.getDay() === 0) {
      return { isLibur: true, desc: 'Hari Minggu' };
    }
    const isFiveDaySchool = (settings?.hari_sekolah ?? 5) === 5;
    if (isFiveDaySchool && date.getDay() === 6) {
      return { isLibur: true, desc: 'Hari Sabtu (Libur Akhir Pekan)' };
    }
    const customHols = settings?.holidays || [];
    const dateStr = format(date, 'yyyy-MM-dd');
    const found = customHols.find(h => dateStr >= h.tanggal_mulai && dateStr <= h.tanggal_selesai);
    if (found) {
      return { isLibur: true, desc: found.nama, catatan: found.catatan };
    }
    return { isLibur: false, desc: '' };
  }, [settings]);

  const loadData = async () => {
    const sList: Student[] = [];
    await store.students.iterate<Student, void>((v) => {
      if (v.kelas && v.kelas.toLowerCase() === 'alumni') {
        return;
      }
      sList.push(v);
    });
    const userFilteredStudents = filterStudentsForUser(currentUser, sList);
    setStudents(userFilteredStudents.sort((a, b) => a.no - b.no));

    const aList: Attendance[] = [];
    const localVals: Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'> = {};
    const recordsToPurge: Attendance[] = [];

    await store.attendance.iterate<Attendance, void>((v) => {
      const vSem = String(v.semester || '').toLowerCase().trim();
      const sSem = String(semester || '').toLowerCase().trim();
      const matchSem = !vSem || !sSem || vSem === sSem || vSem.includes(sSem) || sSem.includes(vSem);

      if (matchSem) {
        // Auto-clear check for holiday
        if (v.tanggal) {
          try {
            const d = parseISO(String(v.tanggal).trim().substring(0, 10));
            const hol = checkHoliday(d);
            if (hol.isLibur) {
              recordsToPurge.push(v);
              return; // Skip adding holiday attendance
            }
          } catch (e) {}
        }

        aList.push(v);
        const vTgl = String(v.tanggal || '').trim().substring(0, 10);
        const selTgl = String(selectedDate || '').trim().substring(0, 10);

        if (vTgl === selTgl) {
          if (v.id_siswa) {
            localVals[v.id_siswa] = v.status;
          }
          const matchedStudent = userFilteredStudents.find(s => 
            s.id === v.id_siswa ||
            (s.nisn && v.nisn && String(s.nisn).trim() === String(v.nisn).trim()) ||
            (s.nama && v.nama && String(s.nama).toLowerCase().trim() === String(v.nama).toLowerCase().trim())
          );
          if (matchedStudent) {
            localVals[matchedStudent.id] = v.status;
          }
        }
      }
    });

    // Execute auto-purge of holiday attendance records in IndexedDB & Firebase
    if (recordsToPurge.length > 0) {
      console.log(`[Absensi Auto-Clear] Purging ${recordsToPurge.length} attendance records found on designated holidays...`);
      for (const item of recordsToPurge) {
        if (item.id) {
          await store.attendance.removeItem(item.id).catch(() => {});
        }
      }
      toast(`${recordsToPurge.length} data presensi pada hari libur otomatis dikosongkan.`, {
      icon: 'ℹ️',
      id: 'holiday-auto-clear-info',
      duration: 4000
    });
    }

    const selHoliday = checkHoliday(parseISO(String(selectedDate || '').substring(0, 10)));
    const finalLocalVals = selHoliday.isLibur ? {} : localVals;

    const studentClassMap: Record<string, string> = {};
    userFilteredStudents.forEach(s => {
      if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
    });

    const userFilteredAttendances = filterRecordsForUser(currentUser, aList, studentClassMap);
    setAttendances(userFilteredAttendances);
    setLocalStatuses(finalLocalVals);
  };

  // Table sorting states
  const [sortField, setSortField] = useState<string>('no');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => filterClass 
      ? s.kelas === filterClass 
      : (!s.kelas || s.kelas.toLowerCase() !== 'alumni')
    ).sort((a, b) => {
      let valA: any = (a as any)[sortField] ?? '';
      let valB: any = (b as any)[sortField] ?? '';

      if (sortField === 'no') {
        valA = Number(a.no) || 0;
        valB = Number(b.no) || 0;
      } else if (typeof valA === 'string' || typeof valB === 'string') {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [students, filterClass, sortField, sortOrder]);

  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allMergedClasses = getMergedClassesFromStudents(students, settings?.daftar_kelas);
  const uniqueClasses = isRestrictedClass 
    ? allMergedClasses.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
    : allMergedClasses;

  // Compute attendance status and statistics for selected date
  const attendanceDateStats = useMemo(() => {
    const activeStudents = filteredStudents.filter(s => s.kelas !== 'Alumni');
    const totalActive = activeStudents.length;

    if (totalActive === 0) return { totalActive: 0, recordedCount: 0, percentRecorded: 0, status: 'unrecorded' as const, hadirCount: 0, sakitCount: 0, izinCount: 0, alpaCount: 0 };

    const targetDateStr = String(selectedDate || '').trim().substring(0, 10);

    let recordedCount = 0;
    let hadirCount = 0;
    let sakitCount = 0;
    let izinCount = 0;
    let alpaCount = 0;

    activeStudents.forEach(s => {
      // 1. Check localStatuses (populated by loadData or changed by user)
      let status = localStatuses[s.id];

      // 2. Fallback to searching attendances list with flexible matching (date, id_siswa, nisn, nama)
      if (!status) {
        const att = attendances.find(a => {
          const aDate = String(a.tanggal || '').trim().substring(0, 10);
          if (aDate !== targetDateStr) return false;
          return (
            a.id_siswa === s.id ||
            (s.nisn && a.nisn && String(s.nisn).trim() === String(a.nisn).trim()) ||
            (s.nama && a.nama && String(s.nama).toLowerCase().trim() === String(a.nama).toLowerCase().trim())
          );
        });
        if (att) {
          status = att.status;
        }
      }

      if (status) {
        recordedCount++;
        if (status === 'Hadir') hadirCount++;
        else if (status === 'Sakit') sakitCount++;
        else if (status === 'Izin') izinCount++;
        else if (status === 'Alpa') alpaCount++;
      }
    });

    const percentRecorded = Math.round((recordedCount / totalActive) * 100);

    let status: 'completed' | 'partial' | 'unrecorded' = 'unrecorded';
    if (recordedCount >= totalActive && totalActive > 0) status = 'completed';
    else if (recordedCount > 0) status = 'partial';

    return {
      totalActive,
      recordedCount,
      percentRecorded,
      hadirCount,
      sakitCount,
      izinCount,
      alpaCount,
      status
    };
  }, [filteredStudents, attendances, selectedDate, localStatuses]);

  // Determine holiday status of the currently selected date
  const currentHolidayStatus = useMemo(() => {
    try {
      const d = parseISO(selectedDate);
      return checkHoliday(d);
    } catch (e) {
      return { isLibur: false, desc: '' };
    }
  }, [selectedDate, settings?.holidays]);

  // Determine rekap range
  const rekapRange = useMemo(() => {
    const now = new Date();
    let startDate = now;
    let endDate = now;

    if (rekapFilter === 'Hari Ini') {
      startDate = now;
      endDate = now;
    } else if (rekapFilter === 'Minggu Ini') {
      startDate = startOfWeek(now, { weekStartsOn: 1 });
      endDate = endOfWeek(now, { weekStartsOn: 1 });
    } else if (rekapFilter === '7 Hari Terakhir') {
      startDate = subDays(now, 6);
      endDate = now;
    } else if (rekapFilter === 'Bulan Ini') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (rekapFilter === '30 Hari Terakhir') {
      startDate = subDays(now, 29);
      endDate = now;
    } else if (rekapFilter === 'Kustom') {
      try {
        startDate = parseISO(customStartDate);
        endDate = parseISO(customEndDate);
      } catch (e) {
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
      }
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }, [rekapFilter, customStartDate, customEndDate]);

  // Set of dates that have attendance entries stored in IndexedDB
  const recordedDatesSet = useMemo(() => {
    return new Set(attendances.map(a => String(a.tanggal || '').trim().substring(0, 10)).filter(Boolean));
  }, [attendances]);

  // Compute 7 days calendar week around selectedDate for quick navigation & status indicator
  const calendarWeekDays = useMemo(() => {
    try {
      const sel = parseISO(selectedDate);
      const start = startOfWeek(sel, { weekStartsOn: 1 });
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
      return days;
    } catch (e) {
      return [];
    }
  }, [selectedDate]);

  // List of all dates in selected rekap range
  const datesList = useMemo(() => {
    if (rekapFilter === 'Semester') return [];
    const { startDate, endDate } = rekapRange;
    
    const list: Date[] = [];
    let curr = new Date(startDate);
    curr.setHours(0, 0, 0, 0);
    const last = new Date(endDate);
    last.setHours(0, 0, 0, 0);
    
    let count = 0;
    while (curr <= last && count < 365) {
      list.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
      count++;
    }
    return list;
  }, [rekapRange, rekapFilter]);

  // Filtered dates list based on hideHolidays toggle
  const displayedDatesList = useMemo(() => {
    if (!hideHolidays) return datesList;
    return datesList.filter(d => !checkHoliday(d).isLibur);
  }, [datesList, hideHolidays, settings?.holidays]);

  // If period length <= 31 days, show detailed daily grid
  const isDetailed = useMemo(() => {
    return rekapFilter !== 'Semester' && displayedDatesList.length <= 31;
  }, [rekapFilter, displayedDatesList]);

  // Calculate stats for each student in the range
  const rekapData = useMemo(() => {
    const { startDate, endDate } = rekapRange;
    const isSem = rekapFilter === 'Semester';

    // In semester mode, estimate active range from actual attendance records
    let calcStart = startDate;
    let calcEnd = endDate;

    if (isSem) {
      if (attendances.length > 0) {
        const dates = attendances.map(a => a.tanggal).filter(Boolean).sort();
        if (dates.length > 0) {
          try {
            calcStart = parseISO(dates[0]);
            calcEnd = parseISO(dates[dates.length - 1]);
          } catch (e) {}
        }
      }
    }

    // Generate date sequence for calculating holiday totals
    const rangeDates: Date[] = [];
    let curr = new Date(calcStart);
    curr.setHours(0, 0, 0, 0);
    const last = new Date(calcEnd);
    last.setHours(0, 0, 0, 0);
    
    let count = 0;
    while (curr <= last && count < 366) {
      rangeDates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    // Precalculate holidays & Sundays in range
    let liburCount = 0;
    rangeDates.forEach(d => {
      const hol = checkHoliday(d);
      if (hol.isLibur) liburCount++;
    });
    
    const activeDaysCount = rangeDates.length - liburCount;

    return filteredStudents.map(s => {
      const sAtt = attendances.filter(a => {
        if (a.id_siswa !== s.id) return false;
        if (isSem) return true;
        try {
          const aDate = parseISO(a.tanggal);
          return isWithinInterval(aDate, { start: startDate, end: endDate });
        } catch (e) {
          return false;
        }
      });

      const Hadir = sAtt.filter(a => a.status === 'Hadir').length;
      const Sakit = sAtt.filter(a => a.status === 'Sakit').length;
      const Izin = sAtt.filter(a => a.status === 'Izin').length;
      const Alpa = sAtt.filter(a => a.status === 'Alpa').length;

      // Ensure active days calculation reflects actual recorded statuses if not in detailed mode
      const activeDays = activeDaysCount > 0 ? activeDaysCount : (Hadir + Sakit + Izin + Alpa);
      const persentase = activeDays > 0 ? Math.round((Hadir / activeDays) * 100) : 0;

      return {
        ...s,
        rawAttendances: sAtt,
        Hadir,
        Sakit,
        Izin,
        Alpa,
        Libur: liburCount,
        HariAktif: activeDays,
        PersentaseKehadiran: persentase
      };
    });
  }, [attendances, filteredStudents, rekapFilter, rekapRange, settings?.holidays]);

  const sortedRekapData = useMemo(() => {
    return [...rekapData].sort((a, b) => {
      let valA: any = (a as any)[sortField] ?? '';
      let valB: any = (b as any)[sortField] ?? '';

      if (sortField === 'no') {
        valA = Number(a.no) || 0;
        valB = Number(b.no) || 0;
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        valA = valA;
        valB = valB;
      } else if (typeof valA === 'string' || typeof valB === 'string') {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rekapData, sortField, sortOrder]);

  const paginatedRekapData = useMemo(() => {
    return sortedRekapData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedRekapData, currentPage, pageSize]);

  const setLocalStatus = (studentId: string, status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    setLocalStatuses(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const markAll = (status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    if (currentHolidayStatus.isLibur) {
      toast.error('Hari libur: tidak dapat mengubah presensi.');
      return;
    }
    const targetStudents = filteredStudents.filter(s => s.kelas !== 'Alumni');
    if (targetStudents.length === 0) {
      toast.error('Tidak ada siswa aktif pada filter saat ini.');
      return;
    }

    const classLabel = filterClass ? `Kelas ${filterClass}` : 'Semua Kelas';
    setBatchConfirmData({
      status,
      students: targetStudents,
      sourceTitle: `Semua Siswa (${classLabel})`
    });
    setShowBatchConfirmModal(true);
  };

  const executeApplyBatchStatus = () => {
    if (!batchConfirmData) return;
    const { status, students: targetStudents } = batchConfirmData;

    const newLocal = { ...localStatuses };
    targetStudents.forEach(s => {
      newLocal[s.id] = status;
    });
    setLocalStatuses(newLocal);

    toast.success(
      `Status '${status}' berhasil diterapkan ke ${targetStudents.length} siswa. Klik 'Simpan' untuk menyimpan perubahan ke database.`,
      { duration: 4000 }
    );

    setShowBatchConfirmModal(false);
    setBatchConfirmData(null);
  };

  const saveAbsensi = async (forceOverwrite: boolean = false) => {
    if (currentHolidayStatus.isLibur) {
      toast.error('Tidak dapat menyimpan absensi pada hari libur.');
      return;
    }

    // Check if attendance data already exists for selectedDate in IndexedDB
    const existingForDate = attendances.filter(a => a.tanggal === selectedDate);
    if (existingForDate.length > 0 && !forceOverwrite) {
      const formattedDateStr = format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id });
      toast.error(
        `Data absensi tanggal ${formattedDateStr} sudah tersimpan (${existingForDate.length} siswa). Silakan konfirmasi untuk mengedit/memperbarui.`,
        { duration: 4000, icon: '⚠️' }
      );
      setShowDuplicateModal(true);
      return;
    }

    await executeSaveAbsensi();
  };

  const executeSaveAbsensi = async () => {
    setShowDuplicateModal(false);
    setIsSaving(true);
    pauseNotifications();
    try {
      const promises: Promise<any>[] = [];
      for (const student of filteredStudents) {
        if (student.kelas === 'Alumni') continue;
        const status = localStatuses[student.id];
        if (status) {
          const existing = attendances.find(a => a.id_siswa === student.id && a.tanggal === selectedDate);
          if (existing) {
            if (existing.status !== status) {
              existing.status = status;
              promises.push(store.attendance.setItem(existing.id, existing));
            }
          } else {
            const newAtt: Attendance = {
              id: uuidv4(),
              id_siswa: student.id,
              tanggal: selectedDate,
              status,
              semester
            };
            promises.push(store.attendance.setItem(newAtt.id, newAtt));
          }
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      const formattedDateStr = format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id });
      toast.success(`Absensi tanggal ${formattedDateStr} berhasil disimpan/diperbarui!`, { duration: 3000 });
      loadData();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch(e) {
      console.error(e);
      toast.error('Gagal menyimpan absensi', { duration: 3000 });
    } finally {
      setIsSaving(false);
      resumeNotifications(true);
    }
  };

  const handleStartEditHoliday = (h: CustomHoliday) => {
    setEditingHolidayId(h.id);
    setNewHolidayName(h.nama);
    setHolidayType(h.jenis);
    setHolidayCatatan(h.catatan || '');
    if (h.jenis === 'perhari') {
      setHolidayDate(h.tanggal_mulai);
    } else {
      setHolidayStartDate(h.tanggal_mulai);
      setHolidayEndDate(h.tanggal_selesai);
    }
  };

  const handleCancelEditHoliday = () => {
    setEditingHolidayId(null);
    setNewHolidayName('');
    setHolidayType('perhari');
    setHolidayCatatan('');
    setHolidayDate(format(new Date(), 'yyyy-MM-dd'));
    setHolidayStartDate(format(new Date(), 'yyyy-MM-dd'));
    setHolidayEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleAddHoliday = async () => {
    if (!newHolidayName.trim()) {
      toast.error('Nama hari libur harus diisi');
      return;
    }

    const tMulai = holidayType === 'perhari' ? holidayDate : holidayStartDate;
    const tSelesai = holidayType === 'perhari' ? holidayDate : holidayEndDate;

    if (tMulai > tSelesai) {
      toast.error('Tanggal mulai tidak boleh melebihi tanggal selesai');
      return;
    }

    const currentHolidays = settings?.holidays || [];
    let updatedHolidays: CustomHoliday[] = [];

    if (editingHolidayId) {
      updatedHolidays = currentHolidays.map(h => {
        if (h.id === editingHolidayId) {
          return {
            ...h,
            nama: newHolidayName,
            tanggal_mulai: tMulai,
            tanggal_selesai: tSelesai,
            jenis: holidayType,
            catatan: holidayCatatan.trim() || undefined
          };
        }
        return h;
      });
    } else {
      const newHoliday: CustomHoliday = {
        id: uuidv4(),
        nama: newHolidayName,
        tanggal_mulai: tMulai,
        tanggal_selesai: tSelesai,
        jenis: holidayType,
        catatan: holidayCatatan.trim() || undefined
      };
      updatedHolidays = [...currentHolidays, newHoliday];
    }

    if (settings && setSettings) {
      const updatedSettings: Settings = {
        ...settings,
        holidays: updatedHolidays
      };
      
      try {
        await store.settings.setItem('app_settings', updatedSettings);
        setSettings(updatedSettings);
        toast.success(editingHolidayId ? 'Hari libur berhasil diperbarui!' : 'Hari libur berhasil ditambahkan!');
        setNewHolidayName('');
        setHolidayCatatan('');
        setEditingHolidayId(null);
        window.dispatchEvent(new Event('data-changed'));
        window.dispatchEvent(new Event('trigger-immediate-sync'));
        await loadData();
      } catch (err) {
        console.error(err);
        toast.error('Gagal menyimpan hari libur');
      }
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!settings || !setSettings) return;

    const currentHolidays = settings.holidays || [];
    const updatedHolidays = currentHolidays.filter(h => h.id !== id);

    const updatedSettings: Settings = {
      ...settings,
      holidays: updatedHolidays
    };

    try {
      await store.settings.setItem('app_settings', updatedSettings);
      setSettings(updatedSettings);
      toast.success('Hari libur berhasil dihapus');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus hari libur');
    }
  };

  const exportExcel = async () => {
    const data = rekapData.map(s => {
      const row: any = {
        No: s.no,
        Kelas: s.kelas,
        NISN: s.nisn || '-',
        Nama: s.nama,
      };

      if (isDetailed) {
        displayedDatesList.forEach(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const colLabel = format(d, 'dd/MM');
          const hol = checkHoliday(d);
          if (hol.isLibur) {
            row[colLabel] = 'L';
          } else {
            const att = s.rawAttendances.find(a => a.tanggal === dateStr);
            row[colLabel] = att ? att.status[0] : '-';
          }
        });
        row['Hari Aktif'] = s.HariAktif;
        row['Hadir'] = s.Hadir;
        row['Sakit'] = s.Sakit;
        row['Izin'] = s.Izin;
        row['Alpa'] = s.Alpa;
        row['Libur'] = s.Libur;
        row['% Kehadiran'] = `${s.PersentaseKehadiran}%`;
      } else {
        row['Hari Aktif'] = s.HariAktif;
        row['Hadir'] = s.Hadir;
        row['Sakit'] = s.Sakit;
        row['Izin'] = s.Izin;
        row['Alpa'] = s.Alpa;
        row['Libur'] = s.Libur;
        row['% Kehadiran'] = `${s.PersentaseKehadiran}%`;
      }

      return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
    XLSX.writeFile(wb, `Rekap_Absensi_${semester}_${filterClass || 'Semua'}_${rekapFilter}.xlsx`);
  };

  const exportDailyPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Helper to draw vector Tut Wuri Handayani logo
    const drawTutWuriLogo = (x: number, y: number) => {
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

    let titleY = 18;
    let tableStartY = 27;

    if (useKopSurat) {
      // Draw customizable Kop Surat
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
            drawTutWuriLogo(25, 19);
          }
        } else {
          drawTutWuriLogo(25, 19);
        }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(pda.toUpperCase(), pageWidth / 2 + textShiftX, 12, { align: 'center' });
      doc.text(dinas.toUpperCase(), pageWidth / 2 + textShiftX, 17, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(sekolah.toUpperCase(), pageWidth / 2 + textShiftX, 23, { align: 'center' });
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Alamat: ${alamat}  |  NPSN: ${npsn}  |  Email: ${email}`, pageWidth / 2 + textShiftX, 28, { align: 'center' });
      
      doc.setLineWidth(0.8);
      doc.setDrawColor(148, 163, 184);
      doc.line(14, 31, pageWidth - 14, 31);
      doc.setLineWidth(0.2);
      doc.line(14, 32.2, pageWidth - 14, 32.2);

      titleY = 40;
      tableStartY = 49;
    }

    // Title & Subtitle
    const formattedDate = format(new Date(selectedDate), 'EEEE, d MMMM yyyy', { locale: id });
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('LAPORAN ABSENSI HARIAN SISWA', pageWidth / 2, titleY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Hari/Tanggal: ${formattedDate} | Kelas: ${filterClass || 'Semua Kelas'} | Semester: ${semester}`, pageWidth / 2, titleY + 5, { align: 'center' });

    const headers = [['No', 'NISN', 'Nama Siswa', 'JK', 'Kelas', 'Status Kehadiran', 'Keterangan / Catatan']];
    const body = filteredStudents.map((s, idx) => {
      const existingAtt = attendances.find(a => a.id_siswa === s.id && a.tanggal === selectedDate);
      const status = currentHolidayStatus.isLibur ? 'Libur' : (localStatuses[s.id] || existingAtt?.status || 'Hadir');
      const ket = currentHolidayStatus.isLibur ? currentHolidayStatus.desc : (existingAtt?.keterangan || '-');
      return [
        idx + 1,
        s.nisn || '-',
        s.nama,
        s.jenis_kelamin ? (s.jenis_kelamin === 'Laki-laki' ? 'L' : s.jenis_kelamin === 'Perempuan' ? 'P' : s.jenis_kelamin) : '-',
        s.kelas || '-',
        status,
        ket
      ];
    });

    autoTable(doc, {
      head: headers,
      body: body,
      startY: tableStartY,
      theme: 'grid',
      tableLineWidth: 0.15,
      tableLineColor: [148, 163, 184],
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'center', cellWidth: 25 },
        2: { cellWidth: 50 },
        3: { halign: 'center', cellWidth: 12 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 30 },
        6: { cellWidth: 30 }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 49;

    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

    const getCityFromAlamat = (alamatStr?: string) => {
      if (!alamatStr || alamatStr.trim() === 'Alamat Sekolah Belum Diatur' || alamatStr.trim() === '') return 'Jakarta';
      const cleanAlamat = alamatStr.replace(/[\r\n]+/g, ' ').trim();
      const parts = cleanAlamat.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const pLower = part.toLowerCase();
        if (pLower.startsWith('kota ')) return part.substring(5).trim();
        if (pLower.startsWith('kabupaten ')) return part.substring(10).trim();
        if (pLower.startsWith('kab. ')) return part.substring(5).trim();
      }
      const filteredParts = parts.filter(p => !/^\d+$/.test(p));
      if (filteredParts.length > 0) {
        const lastPart = filteredParts[filteredParts.length - 1];
        if (lastPart.length < 25) return lastPart;
      }
      return 'Jakarta';
    };

    const city = getCityFromAlamat(settings?.alamat);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    
    if (showKepsekSig) {
      const leftX = 20;
      doc.text('Mengetahui,', leftX, sigY);
      doc.text('Kepala Sekolah,', leftX, sigY + 5);
      doc.setFont('Helvetica', 'bold');
      doc.text(settings?.nama_kepala_sekolah || '................................................', leftX, sigY + 25);
      doc.setFont('Helvetica', 'normal');
      doc.text(`NIP. ${settings?.nip_kepala_sekolah || '................................................'}`, leftX, sigY + 29);
    }
    
    const rightX = pageWidth - 70;
    doc.text(`${city}, ${today}`, rightX, sigY);
    doc.text('Guru Kelas / Wali Kelas,', rightX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '................................................', rightX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_wali_kelas || '................................................'}`, rightX, sigY + 29);

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }

    doc.save(`Absensi_Harian_${selectedDate}_${filterClass || 'Semua'}.pdf`);
  };

  const exportPDF = async () => {
    const doc = new jsPDF({
      orientation: isDetailed ? 'landscape' : 'portrait'
    });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Helper to draw vector Tut Wuri Handayani logo
    const drawTutWuriLogo = (x: number, y: number) => {
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

    let titleY = 18;
    let tableStartY = 27;

    if (useKopSurat) {
      // Draw customizable Kop Surat
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
            drawTutWuriLogo(25, 19);
          }
        } else {
          drawTutWuriLogo(25, 19);
        }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(pda.toUpperCase(), pageWidth / 2 + textShiftX, 12, { align: 'center' });
      doc.text(dinas.toUpperCase(), pageWidth / 2 + textShiftX, 17, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(sekolah.toUpperCase(), pageWidth / 2 + textShiftX, 23, { align: 'center' });
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Alamat: ${alamat}  |  NPSN: ${npsn}  |  Email: ${email}`, pageWidth / 2 + textShiftX, 28, { align: 'center' });
      
      // Double lines divider
      doc.setLineWidth(0.8);
      doc.setDrawColor(148, 163, 184);
      doc.line(14, 31, pageWidth - 14, 31);
      doc.setLineWidth(0.2);
      doc.line(14, 32.2, pageWidth - 14, 32.2);

      titleY = 40;
      tableStartY = 49;
    }

    // 2. Document Title and Metadata
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAPITULASI KEHADIRAN SISWA', pageWidth / 2, titleY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester: ${semester} | Periode: ${rekapFilter} | Kelas: ${filterClass || 'Semua Kelas'}`, pageWidth / 2, titleY + 5, { align: 'center' });

    let headers: string[][];
    let body: any[][];

    if (isDetailed) {
      const dateHeaders = displayedDatesList.map(d => format(d, 'd/M'));
      headers = [['No', 'Kelas', 'Nama', ...dateHeaders, 'Aktif', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Libur', '%']];
      body = rekapData.map(s => {
        const dateVals = displayedDatesList.map(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const hol = checkHoliday(d);
          if (hol.isLibur) return 'L';
          const att = s.rawAttendances.find(a => a.tanggal === dateStr);
          return att ? att.status[0] : '-';
        });
        return [
          s.no, s.kelas, s.nama,
          ...dateVals,
          s.HariAktif, s.Hadir, s.Sakit, s.Izin, s.Alpa, s.Libur, `${s.PersentaseKehadiran}%`
        ];
      });
    } else {
      headers = [['No', 'Kelas', 'Nama', 'Hari Aktif', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Libur', '% Kehadiran']];
      body = rekapData.map(s => [
        s.no, s.kelas, s.nama,
        s.HariAktif, s.Hadir, s.Sakit, s.Izin, s.Alpa, s.Libur, `${s.PersentaseKehadiran}%`
      ]);
    }

    autoTable(doc, {
      head: headers,
      body: body,
      startY: tableStartY,
      theme: 'grid',
      tableLineWidth: 0.15,
      tableLineColor: [148, 163, 184],
      styles: {
        fontSize: isDetailed ? 7 : 9,
        cellPadding: isDetailed ? 1 : 2,
        halign: 'center',
        textColor: [30, 41, 59]
      },
      headStyles: {
        fillColor: [79, 70, 229], // Indigo 600
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 49;
    
    // Signatures Section (Tanda Tangan)
    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

    const getCityFromAlamat = (alamatStr?: string) => {
      if (!alamatStr || alamatStr.trim() === 'Alamat Sekolah Belum Diatur' || alamatStr.trim() === '') return 'Jakarta';
      const cleanAlamat = alamatStr.replace(/[\r\n]+/g, ' ').trim();
      const parts = cleanAlamat.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const pLower = part.toLowerCase();
        if (pLower.startsWith('kota ')) return part.substring(5).trim();
        if (pLower.startsWith('kabupaten ')) return part.substring(10).trim();
        if (pLower.startsWith('kab. ')) return part.substring(5).trim();
      }
      const filteredParts = parts.filter(p => !/^\d+$/.test(p));
      if (filteredParts.length > 0) {
        const lastPart = filteredParts[filteredParts.length - 1];
        if (lastPart.length < 25) return lastPart;
      }
      return 'Jakarta';
    };

    const city = getCityFromAlamat(settings?.alamat);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
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
    const rightX = isDetailed ? pageWidth - 80 : pageWidth - 70;
    doc.text(`${city}, ${today}`, rightX, sigY);
    doc.text('Guru Kelas / Wali Kelas,', rightX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '................................................', rightX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_wali_kelas || '................................................'}`, rightX, sigY + 29);

    // Page numbers loop
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (totalPages > 1) {
        doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      } else {
        doc.text(`Halaman ${i}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      }
    }

    doc.save(`Rekap_Absensi_${semester}_${filterClass || 'Semua'}_${rekapFilter}.pdf`);
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <BackgroundDataBanner collectionName="attendance" className="mx-4 mt-3" />
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex bg-slate-800 rounded-xl border border-slate-700 p-1">
          {(['Harian', 'Rekap', 'Libur'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-indigo-500/20 text-indigo-300 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.2)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            >
              {tab === 'Libur' ? 'Hari Libur' : tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'Harian' && (
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all"
              />
              {!currentHolidayStatus.isLibur && (
                <div className="hidden sm:flex items-center">
                  {attendanceDateStats.status === 'completed' && (
                    <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>Sudah Di-input ({attendanceDateStats.recordedCount}/{attendanceDateStats.totalActive})</span>
                    </span>
                  )}
                  {attendanceDateStats.status === 'partial' && (
                    <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
                      <AlertTriangle size={13} className="text-amber-400" />
                      <span>Sebagian ({attendanceDateStats.recordedCount}/{attendanceDateStats.totalActive})</span>
                    </span>
                  )}
                  {attendanceDateStats.status === 'unrecorded' && (
                    <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <Info size={13} />
                      <span>Belum Di-input</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Rekap' && (
            <div className="flex items-center gap-2">
              <select 
                value={rekapFilter}
                onChange={e => setRekapFilter(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer font-medium"
              >
                <option value="Bulan Ini">Bulan Ini</option>
                <option value="Hari Ini">Hari Ini</option>
                <option value="Minggu Ini">Minggu Ini</option>
                <option value="7 Hari Terakhir">7 Hari Terakhir</option>
                <option value="30 Hari Terakhir">30 Hari Terakhir</option>
                <option value="Semester">Semester</option>
                <option value="Kustom">Rentang Tanggal (Kustom)</option>
              </select>

              <button
                type="button"
                onClick={() => setHideHolidays(!hideHolidays)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  hideHolidays
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm shadow-indigo-600/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
                title="Sembunyikan atau tampilkan hari libur pada tabel rekap absensi"
              >
                {hideHolidays ? <EyeOff size={14} className="text-indigo-400" /> : <Eye size={14} />}
                <span>{hideHolidays ? 'Hari Libur Disembunyikan' : 'Sembunyikan Libur'}</span>
              </button>
            </div>
          )}

          {activeTab !== 'Libur' && (
            <select 
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
            >
              {!isRestrictedClass && <option value="">Semua Kelas</option>}
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {activeTab !== 'Libur' && (
            <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
              <input 
                type="checkbox"
                checked={showKepsekSig}
                onChange={e => setShowKepsekSig(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
              />
              <span>TTD Kepsek</span>
            </label>
          )}

          {activeTab !== 'Libur' && (
            <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
              <input 
                type="checkbox"
                checked={useKopSurat}
                onChange={e => setUseKopSurat(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
              />
              <span>Sertakan Kop Surat</span>
            </label>
          )}

          {activeTab === 'Harian' && (
            <>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                disabled={currentHolidayStatus.isLibur}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/30 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-bold shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                title="Buka Kamera Scanner Presensi QR Code"
              >
                <QrCode size={18} className="animate-pulse text-emerald-200" />
                <span>Scan QR Presensi</span>
              </button>

              <button
                type="button"
                onClick={() => setIsQrCardsModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-2 rounded-xl flex items-center gap-2 text-sm text-indigo-300 font-medium transition-all cursor-pointer"
                title="Lihat atau Cetak Kartu Kode QR Presensi Siswa"
              >
                <QrCode size={16} className="text-indigo-400" />
                <span>Kartu QR Siswa</span>
              </button>

              {role !== 'kepsek' && (
                <button 
                  onClick={() => markAll('Hadir')} 
                  disabled={currentHolidayStatus.isLibur}
                  className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                >
                  Hadir Semua
                </button>
              )}
              <button 
                onClick={exportDailyPDF} 
                className="bg-rose-600 hover:bg-rose-500 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-medium shadow-lg shadow-rose-500/20 transition-colors cursor-pointer"
              >
                <Download size={16} /> Cetak PDF Harian
              </button>
              {role !== 'kepsek' && (
                <button 
                  onClick={() => saveAbsensi()} 
                  disabled={isSaving || currentHolidayStatus.isLibur} 
                  className="bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <Save size={16} /> Simpan
                </button>
              )}
            </>
          )}
          {activeTab === 'Rekap' && (
            <>
              <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-medium shadow-lg shadow-emerald-500/20 transition-colors ml-2">
                <Download size={16} /> Rekap Excel
              </button>
              <button onClick={exportPDF} className="bg-rose-600 hover:bg-rose-500 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-medium shadow-lg shadow-rose-500/20 transition-colors">
                <Download size={16} /> Rekap PDF
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'Harian' && (
        <div className="mx-6 my-4 space-y-3">
          {/* Calendar Strip & IndexedDB Recorded Date Indicator Bar */}
          <div className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => {
                  try {
                    const d = parseISO(selectedDate);
                    d.setDate(d.getDate() - 7);
                    setSelectedDate(format(d, 'yyyy-MM-dd'));
                  } catch (e) {}
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 shrink-0 cursor-pointer"
                title="Minggu Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                {calendarWeekDays.map(d => {
                  const dStr = format(d, 'yyyy-MM-dd');
                  const isSelected = dStr === selectedDate;
                  const hol = checkHoliday(d);
                  const isRecorded = recordedDatesSet.has(dStr);

                  return (
                    <button
                      key={dStr}
                      type="button"
                      onClick={() => setSelectedDate(dStr)}
                      className={`flex flex-col items-center px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-500/20 font-bold scale-105 z-10'
                          : hol.isLibur
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                          : isRecorded
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-slate-900/50 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                      title={`${format(d, 'EEEE, d MMMM yyyy', { locale: id })} ${isRecorded ? '(Absensi Tersimpan di IndexedDB)' : hol.isLibur ? `(${hol.desc})` : '(Belum Di-input)'}`}
                    >
                      <span className="text-[9px] uppercase font-bold tracking-wider opacity-75">{format(d, 'eee', { locale: id }).substring(0, 3)}</span>
                      <span className="text-sm font-bold my-0.5">{format(d, 'd')}</span>
                      
                      {/* Status Dot / Checkmark Icon */}
                      <div className="flex items-center justify-center h-3">
                        {isRecorded ? (
                          <span className="flex items-center gap-0.5 text-[10px] font-extrabold text-emerald-400">
                            <CheckCircle2 size={11} className="shrink-0" />
                          </span>
                        ) : hol.isLibur ? (
                          <span className="text-[9px] font-bold text-rose-400">Libur</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    const d = parseISO(selectedDate);
                    d.setDate(d.getDate() + 7);
                    setSelectedDate(format(d, 'yyyy-MM-dd'));
                  } catch (e) {}
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 shrink-0 cursor-pointer"
                title="Minggu Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Terdata di IndexedDB ({recordedDatesSet.size} Tanggal)
              </span>
            </div>
          </div>

          {currentHolidayStatus.isLibur ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-300 shadow-lg">
              <Info size={20} className="shrink-0 text-amber-400" />
              <div className="text-xs space-y-1">
                <div>
                  <span className="font-bold uppercase tracking-wider text-amber-400">Pemberitahuan Hari Libur: </span>
                  Tanggal yang dipilih ({format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id })}) adalah <span className="underline font-semibold">{currentHolidayStatus.desc}</span>. Absensi tidak aktif dan siswa otomatis ditandai libur.
                </div>
                {currentHolidayStatus.catatan && (
                  <div className="text-[11px] text-amber-200/90 flex items-center gap-1.5 pt-0.5">
                    <FileText size={13} className="shrink-0 text-amber-400" />
                    <span><strong>Catatan Libur:</strong> {currentHolidayStatus.catatan}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg transition-all ${
              attendanceDateStats.status === 'completed'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : attendanceDateStats.status === 'partial'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-300'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border shrink-0 ${
                  attendanceDateStats.status === 'completed'
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : attendanceDateStats.status === 'partial'
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                    : 'bg-slate-700/50 border-slate-600/50 text-slate-400'
                }`}>
                  {attendanceDateStats.status === 'completed' && <CheckCircle2 size={22} />}
                  {attendanceDateStats.status === 'partial' && <AlertTriangle size={22} />}
                  {attendanceDateStats.status === 'unrecorded' && <Info size={22} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold tracking-wide">
                      {attendanceDateStats.status === 'completed' && `✓ ABSENSI TANGGAL ${format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id }).toUpperCase()} SUDAH LENGKAP DI-INPUT`}
                      {attendanceDateStats.status === 'partial' && `⚠️ ABSENSI BARU SEBAGIAN DI-INPUT (${attendanceDateStats.recordedCount}/${attendanceDateStats.totalActive} SISWA)`}
                      {attendanceDateStats.status === 'unrecorded' && `ℹ️ ABSENSI BELUM DI-INPUT UNTUK TANGGAL ${format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id }).toUpperCase()}`}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {attendanceDateStats.status === 'completed' && `Seluruh ${attendanceDateStats.totalActive} siswa kelas ini sudah tersimpan dengan data kehadiran yang valid.`}
                    {attendanceDateStats.status === 'partial' && `Masih ada ${attendanceDateStats.totalActive - attendanceDateStats.recordedCount} siswa yang belum memilih atau menyimpan status kehadiran.`}
                    {attendanceDateStats.status === 'unrecorded' && `Silakan pilih status kehadiran siswa di bawah ini lalu klik 'Simpan'.`}
                  </p>
                </div>
              </div>

              {attendanceDateStats.recordedCount > 0 && (
                <div className="flex items-center gap-2 text-[11px] font-semibold shrink-0 bg-slate-900/70 p-2 rounded-xl border border-slate-700/60">
                  <span className="text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-md">Hadir: {attendanceDateStats.hadirCount}</span>
                  <span className="text-amber-400 px-2 py-0.5 bg-amber-500/10 rounded-md">Sakit: {attendanceDateStats.sakitCount}</span>
                  <span className="text-sky-400 px-2 py-0.5 bg-sky-500/10 rounded-md">Izin: {attendanceDateStats.izinCount}</span>
                  <span className="text-rose-400 px-2 py-0.5 bg-rose-500/10 rounded-md">Alpa: {attendanceDateStats.alpaCount}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto flex-1 custom-scrollbar">
        {activeTab === 'Harian' && (
          <>
            {/* Presensi Massal Sticky Toolbar */}
            {role !== 'kepsek' && (
              <div className="mx-6 mb-4 p-3.5 bg-slate-800/90 border border-slate-700/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/60 hover:bg-slate-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudentIds.includes(s.id))}
                      onChange={() => handleToggleSelectAll(paginatedStudents)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-600 cursor-pointer"
                    />
                    <span>Pilih Semua di Halaman Ini ({paginatedStudents.length})</span>
                  </label>

                  {filteredStudents.length > paginatedStudents.length && (
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(filteredStudents)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
                    >
                      {filteredStudents.every(s => selectedStudentIds.includes(s.id))
                        ? 'Batal Pilih Semua Filtered'
                        : `Pilih Semua Siswa (${filteredStudents.length} Siswa)`}
                    </button>
                  )}

                  {selectedStudentIds.length > 0 && (
                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-xl border border-indigo-500/40">
                      ✓ {selectedStudentIds.length} Siswa Terpilih
                    </span>
                  )}
                </div>

                {/* Presensi Massal Actions */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">Presensi Massal:</span>
                  <button
                    type="button"
                    disabled={selectedStudentIds.length === 0 || currentHolidayStatus.isLibur}
                    onClick={() => handleApplyBatchStatus('Hadir')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Set Hadir untuk seluruh siswa terpilih"
                  >
                    <span>Hadir All</span>
                  </button>

                  <button
                    type="button"
                    disabled={selectedStudentIds.length === 0 || currentHolidayStatus.isLibur}
                    onClick={() => handleApplyBatchStatus('Sakit')}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Set Sakit untuk seluruh siswa terpilih"
                  >
                    <span>Sakit All</span>
                  </button>

                  <button
                    type="button"
                    disabled={selectedStudentIds.length === 0 || currentHolidayStatus.isLibur}
                    onClick={() => handleApplyBatchStatus('Izin')}
                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Set Izin untuk seluruh siswa terpilih"
                  >
                    <span>Izin All</span>
                  </button>

                  <button
                    type="button"
                    disabled={selectedStudentIds.length === 0 || currentHolidayStatus.isLibur}
                    onClick={() => handleApplyBatchStatus('Alpa')}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Set Alpa untuk seluruh siswa terpilih"
                  >
                    <span>Alpa All</span>
                  </button>

                  {selectedStudentIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentIds([])}
                      className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                      title="Batal Pilihan"
                    >
                      Batal
                    </button>
                  )}

                  {/* Mode Tampilan Switcher */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 shadow-inner shrink-0 ml-auto sm:ml-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        viewMode === 'table'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                      title="Tampilan Tabel Standard"
                    >
                      <Table size={14} />
                      <span className="hidden sm:inline">Tabel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode('card')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        viewMode === 'card'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                      title="Tampilan Kartu Responsive (Mobile Friendly)"
                    >
                      <LayoutGrid size={14} />
                      <span>Kartu</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {role === 'kepsek' && (
              <div className="mx-6 mb-4 flex items-center justify-end">
                <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Table size={14} />
                    <span>Tabel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('card')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'card'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <LayoutGrid size={14} />
                    <span>Kartu</span>
                  </button>
                </div>
              </div>
            )}

            {viewMode === 'table' ? (
              <div className="overflow-x-auto custom-scrollbar scroll-smooth w-full border-t border-slate-700/50">
                <table className="w-full text-sm text-left border-collapse min-w-[640px]">
                  <thead className="text-xs uppercase bg-slate-900/95 sticky top-0 backdrop-blur-md z-30 text-slate-400 border-b border-slate-700/80 shadow-md">
                    <tr>
                      <th className="px-3 py-4 border-b border-slate-700/50 w-10 text-center bg-slate-900/95 sticky top-0 z-30">
                        <input
                          type="checkbox"
                          checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudentIds.includes(s.id))}
                          onChange={() => handleToggleSelectAll(paginatedStudents)}
                          disabled={role === 'kepsek' || currentHolidayStatus.isLibur}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer disabled:opacity-35"
                          title="Pilih/Batal Pilih Semua Siswa di Halaman Ini"
                        />
                      </th>
                      <th onClick={() => handleSort('no')} className="px-4 py-4 border-b border-slate-700/50 w-14 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none bg-slate-900/95 sticky top-0 z-30">
                        <div className="flex items-center gap-1">
                          <span>No</span>
                          {sortField === 'no' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                        </div>
                      </th>
                      <th onClick={() => handleSort('kelas')} className="px-4 py-4 border-b border-slate-700/50 w-24 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none bg-slate-900/95 sticky top-0 z-30">
                        <div className="flex items-center gap-1">
                          <span>Kelas</span>
                          {sortField === 'kelas' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                        </div>
                      </th>
                      <th onClick={() => handleSort('nama')} className="px-6 py-4 border-b border-r border-slate-700/60 sticky left-0 top-0 bg-slate-900/95 backdrop-blur-md shadow-[2px_0_10px_rgba(0,0,0,0.4)] font-medium z-40 cursor-pointer hover:text-indigo-400 transition-colors select-none">
                        <div className="flex items-center gap-1">
                          <span>Nama Siswa</span>
                          {sortField === 'nama' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                        </div>
                      </th>
                      <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-emerald-400 bg-slate-900/95 sticky top-0 z-30">Hadir</th>
                      <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-amber-400 bg-slate-900/95 sticky top-0 z-30">Sakit</th>
                      <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-sky-400 bg-slate-900/95 sticky top-0 z-30">Izin</th>
                      <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-rose-400 bg-slate-900/95 sticky top-0 z-30">Alpa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {paginatedStudents.length === 0 ? (
                      <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">Belum ada data siswa.</td></tr>
                    ) : (
                      paginatedStudents.map((student, index) => {
                        const status = currentHolidayStatus.isLibur ? undefined : localStatuses[student.id];
                        const existingAtt = attendances.find(a => a.id_siswa === student.id && a.tanggal === selectedDate);
                        const isSavedInDb = Boolean(existingAtt);
                        const isSelected = selectedStudentIds.includes(student.id);

                        return (
                          <motion.tr 
                            key={student.id} 
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.02 }}
                            className={`hover:bg-slate-700/40 transition-colors group ${isSelected ? 'bg-indigo-500/10' : ''}`}
                          >
                            <td className="px-3 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectStudent(student.id)}
                                disabled={role === 'kepsek' || student.kelas === 'Alumni' || currentHolidayStatus.isLibur}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer disabled:opacity-30"
                              />
                            </td>
                            <td className="px-4 py-4 text-slate-400 font-mono text-xs">{(currentPage - 1) * pageSize + index + 1}</td>
                            <td className="px-4 py-4 text-slate-400 font-medium">{student.kelas}</td>
                            <td className="px-6 py-4 border-r border-slate-700/60 font-semibold text-slate-200 sticky left-0 bg-slate-900/90 backdrop-blur-md shadow-[2px_0_10px_rgba(0,0,0,0.3)] z-20 group-hover:bg-slate-800/90 transition-colors">
                              <div className="flex items-center justify-between gap-2 min-w-[160px]">
                                <span className="flex items-center gap-1.5 truncate">
                                  {student.nama}
                                  <PendingBadge isPending={isPending('students', student.id)} compact={true} />
                                </span>
                                {isSavedInDb && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0" title="Absensi siswa ini sudah tersimpan di database">
                                      <Check size={10} /> Terdata
                                    </span>
                                    <PendingBadge isPending={existingAtt ? isPending('attendance', existingAtt.id) : false} compact={true} />
                                  </div>
                                )}
                              </div>
                            </td>
                            
                            {['Hadir', 'Sakit', 'Izin', 'Alpa'].map((opt) => (
                              <td key={opt} className="px-6 py-4 text-center">
                                <label className={`flex items-center justify-center w-full h-full p-2 rounded-lg transition-all ${role !== 'kepsek' && student.kelas !== 'Alumni' && !currentHolidayStatus.isLibur ? 'cursor-pointer hover:bg-slate-700/60 active:scale-95' : 'cursor-not-allowed opacity-50'}`}>
                                  <input 
                                    type="radio" 
                                    name={`status-${student.id}`}
                                    checked={status === opt}
                                    disabled={role === 'kepsek' || student.kelas === 'Alumni' || currentHolidayStatus.isLibur}
                                    onChange={() => {
                                      if (student.kelas !== 'Alumni' && !currentHolidayStatus.isLibur) {
                                        setLocalStatus(student.id, opt as any);
                                      }
                                    }}
                                    className="w-4 h-4 cursor-pointer text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600 disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                            ))}
                          </motion.tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Mobile & Responsive Card View */
              <div className="px-6 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paginatedStudents.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                      Belum ada data siswa.
                    </div>
                  ) : (
                    paginatedStudents.map((student, index) => {
                      const status = currentHolidayStatus.isLibur ? undefined : localStatuses[student.id];
                      const existingAtt = attendances.find(a => a.id_siswa === student.id && a.tanggal === selectedDate);
                      const isSavedInDb = Boolean(existingAtt);
                      const isSelected = selectedStudentIds.includes(student.id);

                      return (
                        <motion.div
                          key={student.id}
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.02 }}
                          className={`bg-slate-800/90 border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all relative overflow-hidden ${
                            isSelected
                              ? 'border-indigo-500/80 bg-indigo-950/20 ring-2 ring-indigo-500/30'
                              : isSavedInDb
                              ? 'border-slate-700/80 hover:border-slate-600'
                              : 'border-slate-700/60 hover:border-slate-600'
                          }`}
                        >
                          {/* Card Top Row */}
                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-700/60">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectStudent(student.id)}
                                disabled={role === 'kepsek' || student.kelas === 'Alumni' || currentHolidayStatus.isLibur}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer disabled:opacity-30"
                              />
                              <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                                No. {(currentPage - 1) * pageSize + index + 1}
                              </span>
                              <span className="text-xs font-bold text-indigo-300 bg-indigo-500/15 px-2.5 py-0.5 rounded-md border border-indigo-500/30">
                                Kelas {student.kelas}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isSavedInDb && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0" title="Absensi siswa ini sudah tersimpan di database">
                                  <Check size={10} /> Terdata
                                </span>
                              )}
                              <PendingBadge isPending={isPending('students', student.id) || (existingAtt ? isPending('attendance', existingAtt.id) : false)} compact={true} />
                            </div>
                          </div>

                          {/* Student Info */}
                          <div>
                            <h3 className="text-base font-bold text-slate-100 tracking-wide line-clamp-1">
                              {student.nama}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span>NISN: {student.nisn || '-'}</span>
                              {student.nipd && <span>• NIPD: {student.nipd}</span>}
                            </div>
                          </div>

                          {/* Status Pills */}
                          <div className="grid grid-cols-4 gap-1.5 pt-1">
                            {(['Hadir', 'Sakit', 'Izin', 'Alpa'] as const).map((opt) => {
                              const isCurrent = status === opt;
                              const btnClasses = {
                                Hadir: isCurrent
                                  ? 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30',
                                Sakit: isCurrent
                                  ? 'bg-amber-600 text-white font-bold border-amber-400 shadow-md shadow-amber-600/30 ring-1 ring-amber-400'
                                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/30',
                                Izin: isCurrent
                                  ? 'bg-sky-600 text-white font-bold border-sky-400 shadow-md shadow-sky-600/30 ring-1 ring-sky-400'
                                  : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/30',
                                Alpa: isCurrent
                                  ? 'bg-rose-600 text-white font-bold border-rose-400 shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                                  : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30'
                              }[opt];

                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={role === 'kepsek' || student.kelas === 'Alumni' || currentHolidayStatus.isLibur}
                                  onClick={() => {
                                    if (student.kelas !== 'Alumni' && !currentHolidayStatus.isLibur) {
                                      setLocalStatus(student.id, opt);
                                    }
                                  }}
                                  className={`py-2 rounded-xl border text-xs text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${btnClasses}`}
                                >
                                  <span className="font-semibold">{opt}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Footer Status Banner */}
                          <div className={`py-1.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                            status === 'Hadir'
                              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                              : status === 'Sakit'
                              ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                              : status === 'Izin'
                              ? 'bg-sky-950/40 border-sky-500/30 text-sky-300'
                              : status === 'Alpa'
                              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                              : 'bg-slate-900/60 border-slate-700/60 text-slate-400'
                          }`}>
                            <span>Status:</span>
                            <span className="font-bold">
                              {status ? (
                                <>
                                  {status === 'Hadir' && '✓ HADIR'}
                                  {status === 'Sakit' && '⚠️ SAKIT'}
                                  {status === 'Izin' && 'ℹ️ IZIN'}
                                  {status === 'Alpa' && '❌ ALPA'}
                                </>
                              ) : (
                                'Belum di-input'
                              )}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          <Pagination
            totalItems={filteredStudents.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="siswa"
          />
          </>
        )}

        {activeTab === 'Rekap' && (
          <>
            {/* Panel Kontrol Filter Rentang Tanggal Spesifik */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 mb-6 space-y-4 shadow-xl backdrop-blur-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-xl">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>Filter Rentang Tanggal & Periode Absensi</span>
                      <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                        Wali Kelas / Guru
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pilih opsi periode cepat atau tentukan rentang tanggal kustom untuk melihat rekapitulasi kehadiran siswa
                    </p>
                  </div>
                </div>

                {/* Range Date Inputs */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700/70">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400 pl-1">Dari:</span>
                    <input
                      type="date"
                      value={rekapFilter === 'Kustom' ? customStartDate : format(rekapRange.startDate, 'yyyy-MM-dd')}
                      onChange={(e) => {
                        setCustomStartDate(e.target.value);
                        setRekapFilter('Kustom');
                      }}
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all cursor-pointer"
                    />
                  </div>

                  <span className="text-slate-500 font-bold text-xs">-</span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400">Sampai:</span>
                    <input
                      type="date"
                      value={rekapFilter === 'Kustom' ? customEndDate : format(rekapRange.endDate, 'yyyy-MM-dd')}
                      onChange={(e) => {
                        setCustomEndDate(e.target.value);
                        setRekapFilter('Kustom');
                      }}
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Preset Chips & Info Metrics */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Preset Periode:</span>
                  {(
                    [
                      { label: 'Bulan Ini', value: 'Bulan Ini' },
                      { label: '7 Hari Terakhir', value: '7 Hari Terakhir' },
                      { label: '30 Hari Terakhir', value: '30 Hari Terakhir' },
                      { label: 'Minggu Ini', value: 'Minggu Ini' },
                      { label: 'Hari Ini', value: 'Hari Ini' },
                      { label: 'Semester Ini', value: 'Semester' },
                      { label: 'Rentang Kustom', value: 'Kustom' },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setRekapFilter(preset.value as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        rekapFilter === preset.value
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30 scale-105'
                          : 'bg-slate-900/60 border-slate-700/80 text-slate-300 hover:bg-slate-700/60 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Active Period Metrics Badge */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/80 text-slate-300">
                  <span className="text-indigo-400 font-bold">
                    📍 {format(rekapRange.startDate, 'dd MMM yyyy', { locale: id })} – {format(rekapRange.endDate, 'dd MMM yyyy', { locale: id })}
                  </span>
                  <span className="text-slate-600 hidden sm:inline">|</span>
                  <span className="text-emerald-400 font-medium">
                    {datesList.length} Total Hari ({datesList.filter(d => !checkHoliday(d).isLibur).length} Hari Sekolah)
                  </span>
                </div>
              </div>
            </div>

            {/* Target Percentage Config & Alert Banner */}
            <div className="bg-slate-800/35 border border-slate-700/50 rounded-2xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl animate-pulse">
                  <Info size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">Batas Target Kehadiran Minimal</h4>
                  <p className="text-xs text-slate-400">Tentukan batas persentase kehadiran minimum untuk memantau siswa secara otomatis</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 p-2 rounded-xl">
                <span className="text-xs text-slate-400 font-medium pl-1">Target Kehadiran:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={targetAttendance} 
                  onChange={e => setTargetAttendance(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-indigo-500 font-bold font-mono text-indigo-300 cursor-pointer"
                />
                <span className="text-sm font-bold text-indigo-400">%</span>
              </div>

              {/* Mode Switcher for Rekap */}
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 shadow-inner">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Tampilan Tabel Rekap"
                >
                  <Table size={14} />
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Tampilan Kartu Rekap (Mobile)"
                >
                  <LayoutGrid size={14} />
                  <span>Kartu</span>
                </button>
              </div>
            </div>

            {/* Attendance Alert Banner */}
            {rekapData.filter(s => s.PersentaseKehadiran < targetAttendance).length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-100">Pemberitahuan Kehadiran di Bawah Target ({targetAttendance}%)</p>
                  <p className="text-slate-300 mt-1">
                    Terdapat <span className="font-bold text-rose-300">{rekapData.filter(s => s.PersentaseKehadiran < targetAttendance).length} siswa</span> dengan persentase kehadiran di bawah target minimal. Hubungi orang tua siswa yang ditandai merah untuk melakukan tindak lanjut.
                  </p>
                </div>
              </div>
            )}

            {viewMode === 'table' ? (
              <div className="overflow-x-auto custom-scrollbar border border-slate-700/60 rounded-xl">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs uppercase bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 text-slate-400">
                    <tr>
                      <th className="px-4 py-4 border border-slate-700/60 w-12 font-medium">No</th>
                      <th className="px-4 py-4 border border-slate-700/60 w-16 font-medium">Kelas</th>
                      <th className="px-4 py-4 border border-r border-slate-700/60 sticky left-0 bg-slate-800/95 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] font-bold z-20 min-w-[160px]">Nama Siswa</th>
                      
                      {/* Rincian perhari jika <= 31 hari */}
                      {isDetailed && displayedDatesList.map(d => {
                        const dStr = format(d, 'yyyy-MM-dd');
                        const hol = checkHoliday(d);
                        const isRecordedInDb = recordedDatesSet.has(dStr);
                        return (
                          <th 
                            key={dStr} 
                            className={`px-1 py-3 border border-slate-700/60 text-center min-w-[38px] text-[10px] ${
                              hol.isLibur ? 'bg-rose-500/10 text-rose-300' : 'text-slate-300'
                            }`}
                            title={hol.isLibur ? hol.desc : `${format(d, 'EEEE, d MMMM yyyy', { locale: id })}${isRecordedInDb ? ' (Data tersimpan di IndexedDB)' : ''}`}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <div className="font-bold flex items-center gap-0.5">
                                <span>{format(d, 'd')}</span>
                                {isRecordedInDb && !hol.isLibur && (
                                  <span className="text-emerald-400 text-[9px]" title="Sudah di-input di IndexedDB">✓</span>
                                )}
                              </div>
                              <div className="text-[8px] opacity-65 uppercase">{format(d, 'eee', { locale: id }).substring(0, 3)}</div>
                            </div>
                          </th>
                        );
                      })}

                      {/* Kolom rincian agregat akhir */}
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-indigo-400 font-semibold text-xs">Aktif</th>
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-emerald-400 font-semibold text-xs">Hadir</th>
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-amber-400 font-semibold text-xs">Sakit</th>
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-sky-400 font-semibold text-xs">Izin</th>
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-rose-400 font-semibold text-xs">Alpa</th>
                      <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-slate-400 font-semibold text-xs">Libur</th>
                      <th className="px-4 py-4 border border-slate-700/60 text-center w-24 text-indigo-300 font-bold text-xs">% Hadir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {paginatedRekapData.length === 0 ? (
                      <tr>
                        <td colSpan={isDetailed ? 10 + displayedDatesList.length : 10} className="px-6 py-12 text-center text-slate-500">
                          Belum ada data rekap.
                        </td>
                      </tr>
                    ) : (
                      paginatedRekapData.map((student, index) => (
                        <tr key={student.id} className="hover:bg-slate-700/20 transition-colors group">
                          <td className="px-4 py-3.5 border border-slate-700/60 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td className="px-4 py-3.5 border border-slate-700/60 text-slate-400">{student.kelas}</td>
                          <td className="px-4 py-3.5 border border-slate-700/60 font-medium text-slate-200 sticky left-0 bg-slate-800/40 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] z-10 group-hover:bg-slate-700/50 transition-colors">
                            {student.nama}
                          </td>

                          {/* Sel rincian per hari */}
                          {isDetailed && displayedDatesList.map(d => {
                            const dStr = format(d, 'yyyy-MM-dd');
                            const hol = checkHoliday(d);
                            if (hol.isLibur) {
                              return (
                                <td 
                                  key={dStr} 
                                  className="px-1 py-3.5 border border-slate-700/60 text-center text-xs font-bold text-rose-400/80 bg-rose-500/5 select-none"
                                  title={hol.desc}
                                >
                                  L
                                </td>
                              );
                            }

                            const att = student.rawAttendances.find(a => a.tanggal === dStr);
                            let statusLetter = '-';
                            let statusStyle = 'text-slate-600';

                            if (att) {
                              statusLetter = att.status[0]; // H, S, I, A
                              if (att.status === 'Hadir') statusStyle = 'text-emerald-400 font-bold';
                              else if (att.status === 'Sakit') statusStyle = 'text-amber-400 font-bold';
                              else if (att.status === 'Izin') statusStyle = 'text-sky-400 font-bold';
                              else if (att.status === 'Alpa') statusStyle = 'text-rose-400 font-bold';
                            }

                            return (
                              <td key={dStr} className={`px-1 py-3.5 border border-slate-700/60 text-center text-xs ${statusStyle}`}>
                                {statusLetter}
                              </td>
                            );
                          })}

                          {/* Kolom rincian akhir */}
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-indigo-300 font-mono font-medium">{student.HariAktif}</td>
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-emerald-400 font-mono font-bold bg-emerald-500/5">{student.Hadir}</td>
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-amber-400 font-mono bg-amber-500/5">{student.Sakit}</td>
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-sky-400 font-mono bg-sky-500/5">{student.Izin}</td>
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-rose-400 font-mono bg-rose-500/5">{student.Alpa}</td>
                          <td className="px-3 py-3.5 border border-slate-700/60 text-center text-slate-400 font-mono font-medium">{student.Libur}</td>
                          <td className={`px-4 py-3.5 border border-slate-700/60 text-center font-mono font-bold ${
                            student.PersentaseKehadiran < targetAttendance 
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                              : 'bg-indigo-500/5 text-indigo-300'
                          }`}>
                            <div className="flex items-center justify-center gap-1">
                              <span>{student.PersentaseKehadiran}%</span>
                              {student.PersentaseKehadiran < targetAttendance && (
                                <span className="text-[10px] bg-rose-500 text-white px-1 rounded-md font-bold animate-pulse shrink-0" title={`Kehadiran di bawah target ${targetAttendance}%`}>⚠️</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Mobile Card View for Rekap */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedRekapData.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-slate-500 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                    Belum ada data rekap.
                  </div>
                ) : (
                  paginatedRekapData.map((student, index) => {
                    const isBelowTarget = student.PersentaseKehadiran < targetAttendance;
                    return (
                      <div
                        key={student.id}
                        className={`bg-slate-800/90 border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all ${
                          isBelowTarget
                            ? 'border-rose-500/50 bg-rose-950/10'
                            : 'border-slate-700/80 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                              No. {(currentPage - 1) * pageSize + index + 1}
                            </span>
                            <span className="text-xs font-bold text-indigo-300 bg-indigo-500/15 px-2.5 py-0.5 rounded-md border border-indigo-500/30">
                              Kelas {student.kelas}
                            </span>
                          </div>
                          <div className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs flex items-center gap-1 ${
                            isBelowTarget
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            <span>{student.PersentaseKehadiran}%</span>
                            {isBelowTarget && <span>⚠️</span>}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-slate-100">{student.nama}</h3>
                          <span className="text-xs text-slate-400">Hari Sekolah: {student.HariAktif} hari</span>
                        </div>

                        <div className="grid grid-cols-5 gap-1 text-center text-xs pt-1">
                          <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-300">
                            <div className="text-[10px] text-emerald-400/80 font-medium">Hadir</div>
                            <div className="font-bold text-sm font-mono mt-0.5">{student.Hadir}</div>
                          </div>
                          <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-xl text-amber-300">
                            <div className="text-[10px] text-amber-400/80 font-medium">Sakit</div>
                            <div className="font-bold text-sm font-mono mt-0.5">{student.Sakit}</div>
                          </div>
                          <div className="bg-sky-500/10 border border-sky-500/30 p-2 rounded-xl text-sky-300">
                            <div className="text-[10px] text-sky-400/80 font-medium">Izin</div>
                            <div className="font-bold text-sm font-mono mt-0.5">{student.Izin}</div>
                          </div>
                          <div className="bg-rose-500/10 border border-rose-500/30 p-2 rounded-xl text-rose-300">
                            <div className="text-[10px] text-rose-400/80 font-medium">Alpa</div>
                            <div className="font-bold text-sm font-mono mt-0.5">{student.Alpa}</div>
                          </div>
                          <div className="bg-slate-700/30 border border-slate-700/50 p-2 rounded-xl text-slate-300">
                            <div className="text-[10px] text-slate-400 font-medium">Libur</div>
                            <div className="font-bold text-sm font-mono mt-0.5">{student.Libur}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          <Pagination
            totalItems={rekapData.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="siswa"
          />
          </>
        )}

        {activeTab === 'Libur' && (
          <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="text-indigo-400" /> Kelola Hari Libur Sekolah
              </h2>
              <p className="text-sm text-slate-400">
                Atur hari libur nasional, libur semester, atau cuti bersama secara kolektif maupun perhari. Hari Minggu diidentifikasi sebagai libur otomatis.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Tambah Hari Libur */}
              <div className="lg:col-span-5 bg-slate-800/30 border border-slate-700/60 p-6 rounded-2xl flex flex-col gap-4">
                <h3 className="text-md font-bold text-slate-200 border-b border-slate-700/50 pb-2">
                  {editingHolidayId ? 'Edit Hari Libur' : 'Tambah Hari Libur Baru'}
                </h3>
                
                {role !== 'kepsek' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nama Hari Libur</label>
                      <input 
                        type="text"
                        placeholder="contoh: Hari Kemerdekaan RI"
                        value={newHolidayName}
                        onChange={e => setNewHolidayName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Jenis Hari Libur</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-slate-700">
                        <button
                          type="button"
                          onClick={() => setHolidayType('perhari')}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            holidayType === 'perhari' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Per Hari
                        </button>
                        <button
                          type="button"
                          onClick={() => setHolidayType('kolektif')}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            holidayType === 'kolektif' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Kolektif / Rentang
                        </button>
                      </div>
                    </div>

                    {holidayType === 'perhari' ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tanggal Libur</label>
                        <input 
                          type="date"
                          value={holidayDate}
                          onChange={e => setHolidayDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mulai</label>
                          <input 
                            type="date"
                            value={holidayStartDate}
                            onChange={e => setHolidayStartDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Selesai</label>
                          <input 
                            type="date"
                            value={holidayEndDate}
                            onChange={e => setHolidayEndDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Catatan / Keterangan Hari Libur (Opsional)
                      </label>
                      <textarea 
                        rows={2}
                        placeholder="contoh: Berdasarkan SK Kepala Sekolah No. 421/2026 atau Catatan Kegiatan..."
                        value={holidayCatatan}
                        onChange={e => setHolidayCatatan(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none placeholder:text-slate-600"
                      />
                    </div>

                    <div className="flex gap-2">
                      {editingHolidayId && (
                        <button
                          type="button"
                          onClick={handleCancelEditHoliday}
                          className="flex-1 mt-2 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-sm rounded-xl transition-all border border-slate-600/80 cursor-pointer"
                        >
                          Batal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddHoliday}
                        className="mt-2 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer"
                        style={{ flexGrow: editingHolidayId ? 2 : 1, width: editingHolidayId ? 'auto' : '100%' }}
                      >
                        {editingHolidayId ? <Save size={18} /> : <Plus size={18} />} {editingHolidayId ? 'Simpan Perubahan' : 'Tambah Hari Libur'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/20 border border-dashed border-slate-700/50 rounded-xl">
                    <AlertTriangle className="text-amber-500/80 mb-2" size={32} />
                    <p className="text-xs text-slate-400 font-medium">Hanya Guru yang dapat mengatur hari libur sekolah.</p>
                  </div>
                )}
              </div>

              {/* Daftar Hari Libur Kustom */}
              <div className="lg:col-span-7 bg-slate-800/30 border border-slate-700/60 p-6 rounded-2xl flex flex-col gap-4">
                <h3 className="text-md font-bold text-slate-200 border-b border-slate-700/50 pb-2">
                  Daftar Hari Libur Kustom
                </h3>

                <div className="space-y-3 overflow-y-auto max-h-[360px] pr-2 custom-scrollbar">
                  {settings?.holidays && settings.holidays.length > 0 ? (
                    settings.holidays.map(h => {
                      let tDisplay = '';
                      try {
                        const start = format(parseISO(h.tanggal_mulai), 'd MMMM yyyy', { locale: id });
                        if (h.jenis === 'perhari' || h.tanggal_mulai === h.tanggal_selesai) {
                          tDisplay = start;
                        } else {
                          const end = format(parseISO(h.tanggal_selesai), 'd MMMM yyyy', { locale: id });
                          tDisplay = `${start} s.d ${end}`;
                        }
                      } catch (e) {
                        tDisplay = `${h.tanggal_mulai} - ${h.tanggal_selesai}`;
                      }

                      return (
                        <div 
                          key={h.id} 
                          className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-4 flex justify-between items-center gap-4 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-lg border border-indigo-500/20 shrink-0">
                              <Calendar size={18} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-slate-200 truncate">{h.nama}</h4>
                              <p className="text-xs text-slate-400 mt-1">{tDisplay}</p>
                              {h.catatan && (
                                <p className="text-xs text-indigo-200/90 bg-indigo-950/50 border border-indigo-500/20 p-2 rounded-lg mt-2 flex items-start gap-1.5 leading-relaxed">
                                  <FileText size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                                  <span>{h.catatan}</span>
                                </p>
                              )}
                              <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 mt-2 rounded bg-slate-800 text-indigo-300 capitalize">
                                {h.jenis === 'perhari' ? 'Per Hari' : 'Kolektif'}
                              </span>
                            </div>
                          </div>

                          {role !== 'kepsek' && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleStartEditHoliday(h)}
                                className="text-indigo-400 hover:text-indigo-300 p-2 rounded-lg hover:bg-indigo-500/10 transition-colors cursor-pointer"
                                title="Edit Hari Libur"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteHoliday(h.id)}
                                className="text-rose-400 hover:text-rose-300 p-2 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Hapus Hari Libur"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 border border-dashed border-slate-700/40 rounded-2xl bg-slate-900/10">
                      <Calendar size={36} className="text-slate-600 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-400">Belum ada hari libur kustom</p>
                      <p className="text-xs text-slate-500 mt-1">Daftar hari libur yang ditambahkan akan muncul di sini.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Konfirmasi Edit/Perbarui Absensi Duplikat */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 text-amber-400">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Konfirmasi Perubahan Absensi</h3>
                  <p className="text-xs text-slate-400">Data absensi sudah pernah di-input sebelumnya</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDuplicateModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl text-xs text-slate-300 space-y-2">
              <p>
                Absensi untuk tanggal <strong className="text-indigo-300">{format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: id })}</strong> sudah tersimpan di database IndexedDB.
              </p>
              <p className="text-slate-400">
                Apakah Anda ingin memperbarui (overwrite/edit) status absensi siswa dengan pilihan terbaru saat ini?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => saveAbsensi(true)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Pencil size={15} />
                <span>Perbarui / Edit Data Absensi</span>
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadData();
                    setShowDuplicateModal(false);
                    toast.success('Data absensi disinkronkan ulang dari database');
                  }}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>Muat Ulang Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all border border-slate-700 cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Presensi Massal */}
      {showBatchConfirmModal && batchConfirmData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  batchConfirmData.status === 'Hadir'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : batchConfirmData.status === 'Sakit'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : batchConfirmData.status === 'Izin'
                    ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Konfirmasi Presensi Massal
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pembaruan status presensi untuk {batchConfirmData.students.length} siswa sekaligus
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowBatchConfirmModal(false);
                  setBatchConfirmData(null);
                }}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Details Summary */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Status Diterapkan</span>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold ${
                    batchConfirmData.status === 'Hadir'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : batchConfirmData.status === 'Sakit'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : batchConfirmData.status === 'Izin'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}>
                    {batchConfirmData.status.toUpperCase()}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Jumlah Siswa</span>
                  <span className="text-sm font-bold text-indigo-300 mt-1 block">
                    {batchConfirmData.students.length} Siswa
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tanggal Presensi</span>
                  <span className="text-slate-200 font-semibold mt-0.5 block">
                    {format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy', { locale: id })}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Sasaran / Target</span>
                  <span className="text-slate-200 font-semibold mt-0.5 block truncate">
                    {batchConfirmData.sourceTitle}
                  </span>
                </div>
              </div>

              {/* Student List Preview */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400 text-[11px] font-semibold block mb-2">
                  Daftar Siswa Terpengaruh ({batchConfirmData.students.length}):
                </span>
                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {batchConfirmData.students.map((s, idx) => (
                    <div key={s.id} className="flex items-center justify-between py-1 px-2.5 bg-slate-900/80 rounded-lg border border-slate-800/80 text-[11px]">
                      <span className="text-slate-200 font-medium truncate max-w-[200px]">
                        {idx + 1}. {s.nama}
                      </span>
                      <span className="text-slate-400 text-[10px] font-mono">
                        {s.kelas} {s.no ? `(#${s.no})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning Note */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-amber-300 text-xs">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Perhatian Wali Kelas:</strong> Menekan tombol konfirmasi akan mengubah status presensi {batchConfirmData.students.length} siswa di atas menjadi <strong>{batchConfirmData.status}</strong> pada lembar kerja harian. Klik <strong>'Simpan'</strong> pada halaman utama untuk menyimpan perubahan ke database.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBatchConfirmModal(false);
                  setBatchConfirmData(null);
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              
              <button
                type="button"
                onClick={executeApplyBatchStatus}
                className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer ${
                  batchConfirmData.status === 'Hadir'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25'
                    : batchConfirmData.status === 'Sakit'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/25'
                    : batchConfirmData.status === 'Izin'
                    ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/25'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/25'
                }`}
              >
                <CheckCircle2 size={16} />
                <span>Terapkan Status '{batchConfirmData.status}' ({batchConfirmData.students.length} Siswa)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Scanner Modal */}
      <QRCodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        students={filteredStudents}
        semester={semester}
        selectedDate={selectedDate}
        filterClass={filterClass}
        classes={uniqueClasses}
        onAttendanceUpdated={loadData}
      />

      {/* Student QR Cards Modal */}
      <StudentQRCodeModal
        isOpen={isQrCardsModalOpen}
        onClose={() => setIsQrCardsModalOpen(false)}
        students={students}
        settings={settings}
        classes={uniqueClasses}
      />
    </div>
  );
}
