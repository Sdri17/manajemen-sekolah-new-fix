import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { store, Student, RosterItem, PiketItem, Settings, BreakTimeConfig, defaultSettings } from '../lib/store';
import { getMergedClassesFromStudents } from '../lib/classHelper';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { v4 as uuidv4 } from 'uuid';
import { Download, Plus, Minus, Edit2, Trash2, Calendar, Clock, BookOpen, User, UserCheck, ShieldAlert, ArrowRight, Printer, RefreshCw, Cloud, Sliders, Sparkles, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import BackgroundDataBanner from '../components/BackgroundDataBanner';

interface RosterPiketProps {
  semester: string;
  role: string;
  settings: Settings | null;
  syncData?: () => Promise<void>;
  isSyncing?: boolean;
}

const DAFTAR_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Helper time functions
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const addMinutesToTime = (timeStr: string, mins: number): string => {
  if (!timeStr) return '08:00';
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = (h || 0) * 60 + (m || 0) + mins;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export default function RosterPiket({ semester, role, settings, syncData, isSyncing }: RosterPiketProps) {
  const daysList = (settings?.hari_sekolah ?? 5) === 6 ? DAFTAR_HARI : DAFTAR_HARI.slice(0, 5);
  const [activeTab, setActiveTab] = useState<'roster' | 'piket'>('roster');
  const [students, setStudents] = useState<Student[]>([]);
  const [rosterItems, setRosterItems] = useState<RosterItem[]>([]);
  const [piketItems, setPiketItems] = useState<PiketItem[]>([]);
  const [rosterViewMode, setRosterViewMode] = useState<'board' | 'rekap'>('rekap');
  
  // Class selection state
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classList, setClassList] = useState<string[]>([]);
  const [showKepsekSig, setShowKepsekSig] = useState<boolean>(settings?.show_ttd_kepsek ?? true);

  // Smart Roster Settings State
  const [durasiJpMenit, setDurasiJpMenit] = useState<number>(settings?.durasi_jp_menit || 35);
  const [jamMulaiSekolah, setJamMulaiSekolah] = useState<string>(settings?.jam_mulai_sekolah || '08:00');
  const [breakTimes, setBreakTimes] = useState<BreakTimeConfig[]>(
    settings?.waktu_istirahat && settings.waktu_istirahat.length > 0 
      ? settings.waktu_istirahat 
      : [
          { id: 'ist_1', nama: 'I S T I R A H A T', jam_mulai: '09:45', jam_selesai: '10:00' },
          { id: 'ist_2', nama: 'I S T I R A H A T', jam_mulai: '11:45', jam_selesai: '12:15' }
        ]
  );
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Sync state from settings prop
  useEffect(() => {
    if (settings) {
      if (typeof settings.durasi_jp_menit === 'number') setDurasiJpMenit(settings.durasi_jp_menit);
      if (settings.jam_mulai_sekolah) setJamMulaiSekolah(settings.jam_mulai_sekolah);
      if (settings.waktu_istirahat && settings.waktu_istirahat.length > 0) setBreakTimes(settings.waktu_istirahat);
    }
  }, [settings]);

  // Roster form modal state
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [rosterFormData, setRosterFormData] = useState({
    hari: 'Senin',
    jam_mulai: '08:00',
    jumlah_jp: 1, // Number of JP hours
    jam_selesai: '08:35',
    mata_pelajaran: '',
    guru: ''
  });

  // Calculate next available start time automatically for a day
  const getNextAvailableStartTime = (targetHari: string, currentRoster: RosterItem[]): string => {
    const dayItems = currentRoster.filter(r => r.hari === targetHari);
    if (dayItems.length === 0) {
      return jamMulaiSekolah || '08:00';
    }
    let latestEnd = dayItems.reduce((max, item) => {
      return timeToMinutes(item.jam_selesai) > timeToMinutes(max) ? item.jam_selesai : max;
    }, dayItems[0].jam_selesai);

    // If latestEnd lands on a break, auto jump to break end time!
    const matchingBreak = breakTimes.find(b => b.jam_mulai === latestEnd);
    if (matchingBreak) {
      latestEnd = matchingBreak.jam_selesai;
    }
    return latestEnd;
  };

  // Piket form state (simple modal to assign student to day)
  const [isPiketModalOpen, setIsPiketModalOpen] = useState(false);
  const [selectedPiketDay, setSelectedPiketDay] = useState('Senin');
  const [selectedStudentForPiket, setSelectedStudentForPiket] = useState('');
  const [jumlahPiketHarian, setJumlahPiketHarian] = useState<number>(settings?.jumlah_piket_harian || 5);

  // Kop Surat Toggle
  const [useKopSurat, setUseKopSurat] = useState<boolean>(settings?.tampilkan_kop_surat ?? true);

  useEffect(() => {
    if (settings && typeof settings.tampilkan_kop_surat === 'boolean') {
      setUseKopSurat(settings.tampilkan_kop_surat);
    }
  }, [settings]);

  useEffect(() => {
    if (settings?.jumlah_piket_harian) {
      setJumlahPiketHarian(settings.jumlah_piket_harian);
    }
  }, [settings?.jumlah_piket_harian]);

  const handleUpdateJumlahPiketHarian = async (val: number) => {
    const totalSiswa = students.length;
    if (totalSiswa > 0 && val > totalSiswa) {
      toast.error(`Jumlah piket harian (${val}) tidak boleh melebihi total siswa di kelas (${totalSiswa} siswa)`);
      val = totalSiswa;
    }
    const newCount = Math.max(1, Math.min(15, val));
    setJumlahPiketHarian(newCount);
    try {
      const curSettings = (await store.settings.getItem<Settings>('current')) || defaultSettings;
      const updated = { ...curSettings, jumlah_piket_harian: newCount };
      await store.settings.setItem('current', updated);
      toast.success(`Jumlah piket harian diatur ke ${newCount} petugas per hari`);
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error('Gagal menyimpan jumlah piket harian', err);
    }
  };

  // Delete confirmations
  const [rosterToDelete, setRosterToDelete] = useState<string | null>(null);
  const [piketToDelete, setPiketToDelete] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    loadStudents();
  }, [semester]);

  useEffect(() => {
    if (classList.length > 0 && (!selectedClass || !classList.some(c => c.toLowerCase() === selectedClass.toLowerCase()))) {
      setSelectedClass(classList[0]);
    }
  }, [classList]);

  useEffect(() => {
    if (selectedClass) {
      loadRoster();
      loadPiket();
    }
  }, [selectedClass, semester]);

  const loadStudents = async () => {
    const list: Student[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (val.kelas && val.kelas.toLowerCase() === 'alumni') {
        return;
      }
      list.push(val);
    });
    const userFilteredStudents = filterStudentsForUser(currentUser, list);
    setStudents(userFilteredStudents);

    const allMergedClasses = getMergedClassesFromStudents(list, settings?.daftar_kelas);
    const validClasses = isRestrictedClass
      ? allMergedClasses.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
      : allMergedClasses;
    setClassList(validClasses);

    if (validClasses.length > 0 && (!selectedClass || !validClasses.some(c => c.toLowerCase() === selectedClass.toLowerCase()))) {
      setSelectedClass(validClasses[0]);
    }
  };

  const matchNormalizedClass = (a?: string, b?: string): boolean => {
    if (!a || !b) return false;
    const cleanA = a.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const cleanB = b.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return cleanA === cleanB;
  };

  const loadRoster = async () => {
    const list: RosterItem[] = [];
    const fallbackList: RosterItem[] = [];
    await store.roster.iterate<RosterItem, void>((val) => {
      if (!val) return;
      const matchClass = matchNormalizedClass(val.kelas, selectedClass);
      if (matchClass) {
        if (val.semester === semester) {
          list.push(val);
        } else {
          fallbackList.push(val);
        }
      }
    });
    
    const finalRoster = list.length > 0 ? list : fallbackList;

    // Sort by day index, then start time
    const sorted = finalRoster.sort((a, b) => {
      const dayDiff = daysList.indexOf(a.hari) - daysList.indexOf(b.hari);
      if (dayDiff !== 0) return dayDiff;
      return (a.jam_mulai || '').localeCompare(b.jam_mulai || '');
    });
    setRosterItems(sorted);
  };

  const loadPiket = async () => {
    const list: PiketItem[] = [];
    const fallbackList: PiketItem[] = [];
    await store.piket.iterate<PiketItem, void>((val) => {
      if (!val) return;
      const matchClass = matchNormalizedClass(val.kelas, selectedClass);
      if (matchClass) {
        if (val.semester === semester) {
          list.push(val);
        } else {
          fallbackList.push(val);
        }
      }
    });
    setPiketItems(list.length > 0 ? list : fallbackList);
  };

  useEffect(() => {
    const handleRefresh = () => {
      loadStudents();
      loadRoster();
      loadPiket();
    };
    window.addEventListener('data-changed', handleRefresh);
    window.addEventListener('apply-buffered-data', handleRefresh);
    return () => {
      window.removeEventListener('data-changed', handleRefresh);
      window.removeEventListener('apply-buffered-data', handleRefresh);
    };
  }, [selectedClass, semester]);

  // SMART ROSTER CONFIG ACTION
  const handleSaveSmartConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const curSettings = (await store.settings.getItem<Settings>('current')) || defaultSettings;
      const updated: Settings = {
        ...curSettings,
        durasi_jp_menit: durasiJpMenit,
        jam_mulai_sekolah: jamMulaiSekolah,
        waktu_istirahat: breakTimes
      };
      await store.settings.setItem('current', updated);
      toast.success('Pengaturan Roster Cerdas & Waktu Istirahat berhasil disimpan!');
      setIsConfigModalOpen(false);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      toast.error('Gagal menyimpan pengaturan roster');
    }
  };

  const handleAddBreakTime = () => {
    const newBreak: BreakTimeConfig = {
      id: uuidv4(),
      nama: 'I S T I R A H A T',
      jam_mulai: '10:00',
      jam_selesai: '10:15'
    };
    setBreakTimes([...breakTimes, newBreak]);
  };

  const handleRemoveBreakTime = (id: string) => {
    setBreakTimes(breakTimes.filter(b => b.id !== id));
  };

  // ROSTER CONFLICT VALIDATION UTILS
  const timeToMinutes = (t: string): number => {
    if (!t) return 0;
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  const checkConflict = (
    day: string,
    start: string,
    end: string,
    excludeId?: string | null
  ): { hasConflict: boolean; message?: string } => {
    const startM = timeToMinutes(start);
    const endM = timeToMinutes(end);

    if (startM >= endM) {
      return {
        hasConflict: true,
        message: `Jam selesai (${end}) harus lebih besar dari jam mulai (${start}).`
      };
    }

    // 1. Check against break times
    for (const b of breakTimes) {
      const bStart = timeToMinutes(b.jam_mulai);
      const bEnd = timeToMinutes(b.jam_selesai);
      if (startM < bEnd && endM > bStart) {
        return {
          hasConflict: true,
          message: `Waktu (${start} - ${end}) bertabrakan dengan Waktu Istirahat "${b.nama || 'Istirahat'}" (${b.jam_mulai} - ${b.jam_selesai}).`
        };
      }
    }

    // 2. Check against existing roster items for same day
    for (const item of rosterItems) {
      if (excludeId && item.id === excludeId) continue;
      if (item.hari !== day) continue;

      const iStart = timeToMinutes(item.jam_mulai);
      const iEnd = timeToMinutes(item.jam_selesai);

      if (startM < iEnd && endM > iStart) {
        return {
          hasConflict: true,
          message: `Konflik jadwal! Jam (${start} - ${end}) bertabrakan dengan mata pelajaran "${item.mata_pelajaran}" (${item.jam_mulai} - ${item.jam_selesai}${item.guru ? ` - ${item.guru}` : ''}).`
        };
      }
    }

    return { hasConflict: false };
  };

  // ROSTER ACTIONS
  const handleSaveRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) {
      toast.error('Pilih kelas terlebih dahulu');
      return;
    }
    if (!rosterFormData.mata_pelajaran) {
      toast.error('Pilih atau isi mata pelajaran');
      return;
    }

    try {
      if (editingRosterId) {
        const conflict = checkConflict(rosterFormData.hari, rosterFormData.jam_mulai, rosterFormData.jam_selesai, editingRosterId);
        if (conflict.hasConflict) {
          toast.error(conflict.message || 'Jadwal bertabrakan!');
          return;
        }

        const updated: RosterItem = {
          id: editingRosterId,
          hari: rosterFormData.hari,
          jam_mulai: rosterFormData.jam_mulai,
          jam_selesai: rosterFormData.jam_selesai,
          mata_pelajaran: rosterFormData.mata_pelajaran,
          guru: rosterFormData.guru,
          kelas: selectedClass,
          semester: semester
        };
        await store.roster.setItem(editingRosterId, updated);
        await store.syncQueue.setItem(`roster::${editingRosterId}`, 'updated');
        toast.success('Jadwal pelajaran diperbarui!');
      } else {
        // Multi-JP Consecutive Slot Creation Logic with conflict pre-validation
        const numJp = Math.max(1, Math.min(6, Number(rosterFormData.jumlah_jp) || 1));
        let tempStart = rosterFormData.jam_mulai;
        const slotsToCreate: { start: string; end: string }[] = [];

        for (let i = 0; i < numJp; i++) {
          const matchingBreak = breakTimes.find(b => b.jam_mulai === tempStart);
          if (matchingBreak) {
            tempStart = matchingBreak.jam_selesai;
          }

          const tempEnd = addMinutesToTime(tempStart, durasiJpMenit);

          // Check conflict for this slot against existing items AND previously added slots in this batch
          const conflict = checkConflict(rosterFormData.hari, tempStart, tempEnd, null);
          if (conflict.hasConflict) {
            toast.error(conflict.message || `Konflik jadwal pada JP ke-${i + 1}!`);
            return;
          }

          // Also check against already planned slots in this batch
          const batchConflict = slotsToCreate.some(s => {
            const sStart = timeToMinutes(s.start);
            const sEnd = timeToMinutes(s.end);
            const curStart = timeToMinutes(tempStart);
            const curEnd = timeToMinutes(tempEnd);
            return curStart < sEnd && curEnd > sStart;
          });

          if (batchConflict) {
            toast.error(`Konflik internal antar JP (${tempStart} - ${tempEnd})!`);
            return;
          }

          slotsToCreate.push({ start: tempStart, end: tempEnd });
          tempStart = tempEnd;
        }

        for (const slot of slotsToCreate) {
          const newItemId = uuidv4();
          const newItem: RosterItem = {
            id: newItemId,
            hari: rosterFormData.hari,
            jam_mulai: slot.start,
            jam_selesai: slot.end,
            mata_pelajaran: rosterFormData.mata_pelajaran,
            guru: rosterFormData.guru,
            kelas: selectedClass,
            semester: semester
          };
          await store.roster.setItem(newItemId, newItem);
          await store.syncQueue.setItem(`roster::${newItemId}`, 'updated');
        }

        toast.success(`Berhasil menambahkan ${numJp} JP ${rosterFormData.mata_pelajaran}!`);
      }

      setIsRosterModalOpen(false);
      setEditingRosterId(null);
      loadRoster();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      toast.error('Gagal menyimpan jadwal pelajaran');
    }
  };

  const handleEditRoster = (item: RosterItem) => {
    setEditingRosterId(item.id);
    setRosterFormData({
      hari: item.hari || 'Senin',
      jam_mulai: item.jam_mulai || '08:00',
      jumlah_jp: 1,
      jam_selesai: item.jam_selesai || '08:35',
      mata_pelajaran: item.mata_pelajaran || '',
      guru: item.guru || ''
    });
    setIsRosterModalOpen(true);
  };

  const handleDeleteRoster = async (id: string) => {
    // Instantly close modal and update state
    setRosterToDelete(null);
    setRosterItems(prev => prev.filter(r => r.id !== id));
    toast.success('Jadwal pelajaran dihapus & sinkronisasi otomatis berjalan!');

    try {
      await store.roster.removeItem(id);
      await store.syncQueue.setItem(`roster::${id}`, 'deleted');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal menghapus jadwal pelajaran');
      loadRoster();
    }
  };

  // PIKET ACTIONS
  const handleAddPiket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) {
      toast.error('Pilih kelas terlebih dahulu');
      return;
    }
    if (!selectedStudentForPiket) {
      toast.error('Pilih siswa terlebih dahulu');
      return;
    }

    // Check if student is already in piket for this day
    const exists = piketItems.some(p => p.hari === selectedPiketDay && p.id_siswa === selectedStudentForPiket);
    if (exists) {
      toast.error('Siswa ini sudah dijadwalkan piket pada hari ' + selectedPiketDay);
      return;
    }

    try {
      const id = uuidv4();
      const newItem: PiketItem = {
        id,
        hari: selectedPiketDay,
        id_siswa: selectedStudentForPiket,
        kelas: selectedClass,
        semester: semester
      };
      await store.piket.setItem(id, newItem);
      await store.syncQueue.setItem(`piket::${id}`, 'updated');
      toast.success('Petugas piket disimpan & sinkronisasi otomatis berjalan!');
      setIsPiketModalOpen(false);
      setSelectedStudentForPiket('');
      loadPiket();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      toast.error('Gagal menambahkan jadwal piket');
    }
  };

  const handleDeletePiket = async (id: string) => {
    // Instantly close modal and update state
    setPiketToDelete(null);
    setPiketItems(prev => prev.filter(p => p.id !== id));
    toast.success('Petugas piket dihapus & sinkronisasi otomatis berjalan!');

    try {
      await store.piket.removeItem(id);
      await store.syncQueue.setItem(`piket::${id}`, 'deleted');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      toast.error('Gagal menghapus dari jadwal piket');
      loadPiket();
    }
  };

  const handleGeneratePiketKolektif = async () => {
    if (!selectedClass) return;
    const classStudents = students.filter(s => s.kelas && selectedClass && s.kelas.trim().toLowerCase() === selectedClass.trim().toLowerCase());
    if (classStudents.length === 0) {
      toast.error('Tidak ada siswa di kelas ini untuk digenerate');
      return;
    }

    try {
      // Clear current piket first
      for (const item of piketItems) {
        await store.piket.removeItem(item.id);
        await store.syncQueue.setItem(`piket::${item.id}`, 'deleted');
      }

      const days = daysList;
      const targetPerDay = Math.max(jumlahPiketHarian, Math.ceil(classStudents.length / days.length));
      let studentIndex = 0;

      for (const day of days) {
        const countForThisDay = Math.min(targetPerDay, classStudents.length);
        const assignedThisDay = new Set<string>();

        while (assignedThisDay.size < countForThisDay) {
          const std = classStudents[studentIndex % classStudents.length];
          if (!assignedThisDay.has(std.id)) {
            assignedThisDay.add(std.id);
            const id = uuidv4();
            const newItem: PiketItem = {
              id,
              hari: day,
              id_siswa: std.id,
              kelas: selectedClass,
              semester: semester
            };
            await store.piket.setItem(id, newItem);
            await store.syncQueue.setItem(`piket::${id}`, 'updated');
          }
          studentIndex++;
        }
      }

      toast.success(`Auto distribusi piket (${jumlahPiketHarian} petugas/hari) disimpan & sinkronisasi berjalan!`);
      loadPiket();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      toast.error('Gagal melakukan distribusi piket harian');
    }
  };

  const handleResetPiket = async () => {
    try {
      for (const item of piketItems) {
        await store.piket.removeItem(item.id);
        await store.syncQueue.setItem(`piket::${item.id}`, 'deleted');
      }
      toast.success('Jadwal piket dibersihkan & sinkronisasi otomatis berjalan!');
      loadPiket();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal mereset piket');
    }
  };

  const handleResetRoster = async () => {
    try {
      for (const item of rosterItems) {
        await store.roster.removeItem(item.id);
      }
      toast.success('Jadwal pelajaran dibersihkan & sinkronisasi otomatis berjalan!');
      loadRoster();
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal mereset jadwal pelajaran');
    }
  };

  // EXPORTS
  const exportRosterExcel = () => {
    if (!selectedClass) return;
    const data: any[] = [];
    rosterItems.forEach((item) => {
      data.push({
        'Hari': item.hari,
        'Waktu Mulai': item.jam_mulai,
        'Waktu Selesai': item.jam_selesai,
        'Mata Pelajaran': item.mata_pelajaran,
        'Guru Pengampu': item.guru || '-'
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jadwal Pelajaran");
    XLSX.writeFile(wb, `Jadwal_Pelajaran_Kelas_${selectedClass}_${semester}.xlsx`);
  };

  const exportPiketExcel = () => {
    if (!selectedClass) return;
    const daysData: Record<string, string[]> = {};
    daysList.forEach(d => { daysData[d] = []; });

    piketItems.forEach(item => {
      const student = students.find(s => s.id === item.id_siswa);
      if (student) {
        daysData[item.hari].push(student.nama);
      }
    });

    // Find max rows needed
    const maxRows = Math.max(...daysList.map(d => daysData[d].length), 1);
    const sheetData: any[] = [];

    for (let r = 0; r < maxRows; r++) {
      const row: any = {};
      daysList.forEach(d => {
        row[d] = daysData[d][r] || '';
      });
      sheetData.push(row);
    }

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Piket Harian");
    XLSX.writeFile(wb, `Piket_Harian_Kelas_${selectedClass}_${semester}.xlsx`);
  };

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

  const renderKopSurat = (doc: jsPDF, pageWidth: number) => {
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
  };

  const exportRosterPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    let titleY = 18;
    let tableStartY = 28;

    if (useKopSurat) {
      renderKopSurat(doc, pageWidth);
      titleY = 42;
      tableStartY = 52;
    }

    // Title and Metadata
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(`REKAPITULASI JADWAL PELAJARAN KELAS ${selectedClass}`, pageWidth / 2, titleY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester: ${semester} | Tahun Pelajaran: ${semester.includes('20') ? semester.split(' ').pop() : new Date().getFullYear()}`, pageWidth / 2, titleY + 5, { align: 'center' });

    // Build the grid data chronologically
    const uniqueSlotsMap = new Map<string, { jam_mulai: string, jam_selesai: string, isBreak?: boolean, breakName?: string }>();
    
    // Add break times automatically
    breakTimes.forEach(b => {
      const key = `${b.jam_mulai}-${b.jam_selesai}`;
      uniqueSlotsMap.set(key, { jam_mulai: b.jam_mulai, jam_selesai: b.jam_selesai, isBreak: true, breakName: b.nama || 'I S T I R A H A T' });
    });

    rosterItems.forEach(item => {
      const key = `${item.jam_mulai}-${item.jam_selesai}`;
      if (!uniqueSlotsMap.has(key)) {
        uniqueSlotsMap.set(key, { jam_mulai: item.jam_mulai, jam_selesai: item.jam_selesai, isBreak: false });
      }
    });
    
    const uniqueSlots = Array.from(uniqueSlotsMap.values()).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));

    const headers = [['Waktu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']];
    const body: any[] = [];

    uniqueSlots.forEach(slot => {
      const slotTime = `${slot.jam_mulai} - ${slot.jam_selesai}`;
      
      if (slot.isBreak) {
        body.push([
          slotTime,
          { 
            content: (slot.breakName || 'I S T I R A H A T').toUpperCase(), 
            colSpan: daysList.length, 
            styles: { 
              halign: 'center', 
              fontStyle: 'bold', 
              fillColor: [254, 240, 138], // Yellow banner matching Image 2
              textColor: [161, 98, 7]
            } 
          }
        ]);
        return;
      }

      const daySubjects = daysList.map(hari => {
        return rosterItems.find(item => item.hari === hari && item.jam_mulai === slot.jam_mulai && item.jam_selesai === slot.jam_selesai);
      });

      const allSame = daySubjects.every(item => item && item.mata_pelajaran === daySubjects[0]?.mata_pelajaran);
      const firstSubject = daySubjects[0]?.mata_pelajaran;

      if (allSame && firstSubject) {
        body.push([
          slotTime,
          { 
            content: firstSubject.toUpperCase(), 
            colSpan: daysList.length, 
            styles: { 
              halign: 'center', 
              fontStyle: 'bold', 
              fillColor: [241, 245, 249],
              textColor: [30, 41, 59]
            } 
          }
        ]);
      } else {
        const rowData: any[] = [slotTime];
        daySubjects.forEach(item => {
          if (item) {
            rowData.push(`${item.mata_pelajaran.toUpperCase()}\n${item.guru ? `(${item.guru})` : ''}`);
          } else {
            rowData.push('-');
          }
        });
        body.push(rowData);
      }
    });

    autoTable(doc, {
      head: headers,
      body: body,
      startY: tableStartY,
      theme: 'grid',
      tableLineWidth: 0.15,
      tableLineColor: [148, 163, 184],
      headStyles: { 
        fillColor: [220, 38, 38], // RED background for header matching school standard
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        halign: 'center',
        valign: 'middle',
        textColor: [30, 41, 59]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 52;
    
    // Signatures Section (Tanda Tangan)
    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

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
    const rightX = pageWidth - 70;
    const city = getCityFromAlamat(settings?.alamat);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
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

    doc.save(`Jadwal_Pelajaran_Kelas_${selectedClass}_${semester}.pdf`);
  };

  const exportPiketPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    let titleY = 18;
    let tableStartY = 28;

    if (useKopSurat) {
      renderKopSurat(doc, pageWidth);
      titleY = 42;
      tableStartY = 52;
    }

    // Title and Metadata
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(`JADWAL PIKET KEBERSIHAN KELAS ${selectedClass}`, pageWidth / 2, titleY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester: ${semester} | Sekolah: ${settings?.nama_sekolah || '-'}`, pageWidth / 2, titleY + 5, { align: 'center' });

    const daysData: Record<string, string[]> = {};
    daysList.forEach(d => { daysData[d] = []; });

    piketItems.forEach(item => {
      const student = students.find(s => s.id === item.id_siswa);
      if (student) {
        daysData[item.hari].push(student.nama);
      }
    });

    const headers = [daysList];
    const maxRows = Math.max(...daysList.map(d => daysData[d].length), 1);
    const body: string[][] = [];

    for (let r = 0; r < maxRows; r++) {
      const row: string[] = [];
      daysList.forEach(d => {
        row.push(daysData[d][r] || '');
      });
      body.push(row);
    }

    autoTable(doc, {
      head: headers,
      body: body,
      startY: tableStartY,
      theme: 'grid',
      tableLineWidth: 0.15,
      tableLineColor: [148, 163, 184],
      headStyles: { 
        fillColor: [30, 41, 59], // Slate Blue header for Piket
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate 50
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        halign: 'center',
        valign: 'middle',
        textColor: [30, 41, 59]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 52;
    
    // Signatures Section (Tanda Tangan)
    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

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
    const rightX = pageWidth - 70;
    const city = getCityFromAlamat(settings?.alamat);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
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

    doc.save(`Piket_Harian_Kelas_${selectedClass}_${semester}.pdf`);
  };

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

  const classStudents = students.filter(s => s.kelas && selectedClass && s.kelas.trim().toLowerCase() === selectedClass.trim().toLowerCase());
  const subjects = settings?.mata_pelajaran || [];
  const canEdit = role !== 'kepsek';

  return (
    <div className="p-6 text-slate-200 h-full overflow-auto custom-scrollbar flex flex-col gap-6">
      <BackgroundDataBanner collectionName="roster" />
      {/* Top Banner and Class Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Calendar className="text-indigo-400" size={24} />
            Administrasi Roster & Piket Harian
          </h2>
          <p className="text-slate-400 text-xs mt-1">Kelola jadwal pelajaran mingguan dan daftar petugas piket harian kelas.</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pilih Kelas:</label>
          {classList.length > 0 ? (
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {classList.map(c => (
                <option key={c} value={c}>Kelas {c}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs italic text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 font-semibold">
              Belum ada kelas aktif. Tambah siswa dulu.
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 self-start">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'roster'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock size={16} />
          Jadwal Pelajaran
        </button>
        <button
          onClick={() => setActiveTab('piket')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'piket'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck size={16} />
          Piket Harian
        </button>
      </div>

      {/* Main Content Areas */}
      {selectedClass ? (
        <div className="flex-1 min-h-0">
          
          {/* TAB 1: ROSTER (JADWAL PELAJARAN) */}
          {activeTab === 'roster' && (
            <div className="space-y-6">
              
              {/* Actions row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {canEdit && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          const initialHari = 'Senin';
                          const autoStart = getNextAvailableStartTime(initialHari, rosterItems);
                          const autoEnd = addMinutesToTime(autoStart, durasiJpMenit);
                          setEditingRosterId(null);
                          setRosterFormData({
                            hari: initialHari,
                            jam_mulai: autoStart,
                            jumlah_jp: 1,
                            jam_selesai: autoEnd,
                            mata_pelajaran: subjects[0] || '',
                            guru: ''
                          });
                          setIsRosterModalOpen(true);
                        }}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-colors cursor-pointer"
                      >
                        <Plus size={16} /> Tambah Jam Pelajaran
                      </button>
                      <button
                        onClick={() => setIsConfigModalOpen(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                        title="Pengaturan Durasi 1 JP & Waktu Istirahat Cerdas"
                      >
                        <Sliders size={15} className="text-amber-400" />
                        <span>Roster Cerdas ({durasiJpMenit}m)</span>
                      </button>
                      <button
                        onClick={handleResetRoster}
                        className="border border-slate-700 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                      >
                        Reset Roster
                      </button>
                    </div>
                  )}

                  {/* View Mode Switcher */}
                  <div className="flex bg-slate-800/40 p-1 rounded-xl border border-slate-700/60 shrink-0">
                    <button 
                      onClick={() => setRosterViewMode('rekap')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${rosterViewMode === 'rekap' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Rekap Roster
                    </button>
                    <button 
                      onClick={() => setRosterViewMode('board')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${rosterViewMode === 'board' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Board Hari
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={showKepsekSig}
                      onChange={e => setShowKepsekSig(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>TTD Kepsek</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={useKopSurat}
                      onChange={e => setUseKopSurat(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>Sertakan Kop Surat</span>
                  </label>
                  {canEdit && syncData && (
                    <button
                      onClick={async () => {
                        try {
                          await syncData();
                        } catch (e) {
                          // Handled inside syncData
                        }
                      }}
                      disabled={isSyncing}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Cloud size={16} className={isSyncing ? "animate-pulse" : ""} />
                      {isSyncing ? 'Sinkronisasi...' : 'Simpan & Sinkronkan'}
                    </button>
                  )}
                  <button onClick={exportRosterExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-md shadow-emerald-500/10 transition-colors">
                    <Download size={16} /> Excel
                  </button>
                  <button onClick={exportRosterPDF} className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-md shadow-rose-500/10 transition-colors">
                    <Printer size={16} /> PDF
                  </button>
                </div>
              </div>

              {rosterViewMode === 'rekap' ? (
                /* Roster Rekap Grid (Indonesian School Grid Layout) */
                <div className="overflow-x-auto rounded-2xl border border-slate-700/60 bg-slate-900/20 backdrop-blur-sm shadow-sm custom-scrollbar">
                  <table className="w-full border-collapse text-left text-sm text-slate-300">
                    <thead className="bg-rose-600/10 border-b border-slate-700/50">
                      <tr>
                        <th className="p-4 font-bold text-rose-400 border-r border-slate-700/40 text-center w-40 tracking-wider">WAKTU</th>
                        {daysList.map(hari => (
                          <th key={hari} className="p-4 font-bold text-slate-200 text-center uppercase tracking-wider">{hari}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(() => {
                        const uniqueSlotsMap = new Map<string, { jam_mulai: string, jam_selesai: string, isBreak?: boolean, breakName?: string }>();
                        
                        // Automatically inject break times from settings
                        breakTimes.forEach(b => {
                          const key = `${b.jam_mulai}-${b.jam_selesai}`;
                          uniqueSlotsMap.set(key, { jam_mulai: b.jam_mulai, jam_selesai: b.jam_selesai, isBreak: true, breakName: b.nama || 'I S T I R A H A T' });
                        });

                        rosterItems.forEach(item => {
                          const key = `${item.jam_mulai}-${item.jam_selesai}`;
                          if (!uniqueSlotsMap.has(key)) {
                            uniqueSlotsMap.set(key, { jam_mulai: item.jam_mulai, jam_selesai: item.jam_selesai, isBreak: false });
                          }
                        });

                        const uniqueSlots = Array.from(uniqueSlotsMap.values()).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));

                        if (uniqueSlots.length === 0) {
                          return (
                            <tr>
                              <td colSpan={daysList.length + 1} className="p-8 text-center text-slate-500 italic">Belum ada data roster jadwal pelajaran. Silakan tambah data jam pelajaran.</td>
                            </tr>
                          );
                        }

                        return uniqueSlots.map(slot => {
                          const slotTime = `${slot.jam_mulai} - ${slot.jam_selesai}`;

                          if (slot.isBreak) {
                            return (
                              <tr key={slotTime} className="bg-amber-400/20 border-y-2 border-amber-500/40 font-extrabold text-amber-200 text-center">
                                <td className="p-3 border-r border-amber-500/30 font-bold text-amber-300 bg-amber-950/40 text-xs">
                                  <span className="flex items-center justify-center gap-1.5">
                                    <Clock size={13} />
                                    {slotTime}
                                  </span>
                                </td>
                                <td colSpan={daysList.length} className="p-3 uppercase tracking-[0.3em] text-amber-300 font-black text-xs md:text-sm bg-amber-500/10 shadow-inner">
                                  {slot.breakName || 'I S T I R A H A T'}
                                </td>
                              </tr>
                            );
                          }

                          const daySubjects = daysList.map(hari => {
                            return rosterItems.find(item => item.hari === hari && item.jam_mulai === slot.jam_mulai && item.jam_selesai === slot.jam_selesai);
                          });

                          const allSame = daySubjects.every(item => item && item.mata_pelajaran === daySubjects[0]?.mata_pelajaran);
                          const firstItem = daySubjects[0];

                          return (
                            <tr key={slotTime} className="hover:bg-slate-800/10 transition-colors">
                              <td className="p-3 border-r border-slate-700/40 text-center font-semibold text-indigo-400 bg-slate-900/10">
                                <span className="flex items-center justify-center gap-1.5 text-xs">
                                  <Clock size={13} />
                                  {slotTime}
                                </span>
                              </td>
                              {allSame && firstItem ? (
                                <td colSpan={daysList.length} className="p-3 text-center bg-indigo-500/5 text-slate-200 font-bold border-l border-slate-700/40">
                                  <div className="relative group/cell flex items-center justify-center gap-2 py-2">
                                    <span className="uppercase tracking-wider text-xs md:text-sm text-indigo-300">{firstItem.mata_pelajaran}</span>
                                    {canEdit && (
                                      <div className="opacity-0 group-hover/cell:opacity-100 flex gap-1 transition-opacity shrink-0 ml-2 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700">
                                        <button onClick={() => handleEditRoster(firstItem)} className="p-1 text-indigo-400 hover:text-indigo-300 transition-colors" title="Edit">
                                          <Edit2 size={12} />
                                        </button>
                                        <button onClick={() => setRosterToDelete(firstItem.id)} className="p-1 text-rose-400 hover:text-rose-300 transition-colors" title="Hapus">
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              ) : (
                                daySubjects.map((item, idx) => {
                                  return (
                                    <td key={idx} className="p-3 text-center border-l border-slate-800/60 min-w-[120px]">
                                      {item ? (
                                        <div className="relative group/cell min-h-[50px] flex flex-col justify-center items-center py-1">
                                          <span className="font-semibold text-slate-200 block text-xs leading-tight">{item.mata_pelajaran}</span>
                                          {item.guru && (
                                            <span className="text-[10px] text-slate-400 block italic mt-0.5 max-w-[110px] truncate" title={item.guru}>{item.guru}</span>
                                          )}
                                          {canEdit && (
                                            <div className="absolute -top-1 -right-1 opacity-0 group-hover/cell:opacity-100 flex gap-1 transition-opacity bg-slate-950/90 px-1 py-0.5 rounded border border-slate-700 shadow-md">
                                              <button onClick={() => handleEditRoster(item)} className="p-0.5 text-indigo-400 hover:text-indigo-300 transition-colors" title="Edit">
                                                <Edit2 size={11} />
                                              </button>
                                              <button onClick={() => setRosterToDelete(item.id)} className="p-0.5 text-rose-400 hover:text-rose-300 transition-colors" title="Hapus">
                                                <Trash2 size={11} />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="min-h-[40px] flex items-center justify-center text-slate-600 font-medium">
                                          -
                                        </div>
                                      )}
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Roster Board Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {daysList.map(hari => {
                    const dayItems = rosterItems.filter(item => item.hari === hari);
                    return (
                      <div key={hari} className="bg-slate-800/20 border border-slate-700/60 rounded-2xl overflow-hidden flex flex-col h-full min-h-[250px] shadow-sm">
                        <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
                          <span className="font-bold text-sm tracking-wide text-slate-200">{hari}</span>
                          <span className="text-[10px] bg-slate-900 border border-slate-700/50 px-2 py-0.5 rounded-full text-indigo-400 font-bold">{dayItems.length} Jam</span>
                        </div>

                        <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[300px] custom-scrollbar">
                          {dayItems.length > 0 ? (
                            dayItems.map((item, idx) => (
                              <div key={item.id} className="group relative bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-indigo-500/30 p-3 rounded-xl transition-all flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                                  <Clock size={13} />
                                  <span>{item.jam_mulai} - {item.jam_selesai}</span>
                                </div>
                                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 leading-tight">
                                  <BookOpen size={13} className="text-slate-400" />
                                  {item.mata_pelajaran}
                                </h4>
                                {item.guru && (
                                  <p className="text-xs text-slate-400 flex items-center gap-1.5 italic">
                                    <User size={12} className="text-slate-500" />
                                    {item.guru}
                                  </p>
                                )}

                                {canEdit && (
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                    <button onClick={() => handleEditRoster(item)} className="p-1 text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors" title="Edit">
                                      <Edit2 size={13} />
                                    </button>
                                    <button onClick={() => setRosterToDelete(item.id)} className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors" title="Hapus">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-slate-700/20 rounded-xl">
                              <Clock size={20} className="text-slate-600 mb-1" />
                              <p className="text-xs italic">Kosong</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PIKET HARIAN */}
          {activeTab === 'piket' && (
            <div className="space-y-6">
              
              {/* Actions row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Teacher Control for Daily Piket Quota */}
                  <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300">
                    <span className="text-slate-400">Target Piket Harian:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!canEdit || jumlahPiketHarian <= 1}
                        onClick={() => handleUpdateJumlahPiketHarian(jumlahPiketHarian - 1)}
                        className="p-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
                        title="Kurangi Target Piket Harian"
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        disabled={!canEdit}
                        value={jumlahPiketHarian}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) handleUpdateJumlahPiketHarian(val);
                        }}
                        className="w-11 text-center bg-slate-900 border border-slate-700 rounded py-0.5 text-indigo-300 font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-indigo-300 font-bold pr-0.5">Siswa / Hari</span>
                      <button
                        type="button"
                        disabled={!canEdit || jumlahPiketHarian >= 15}
                        onClick={() => handleUpdateJumlahPiketHarian(jumlahPiketHarian + 1)}
                        className="p-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
                        title="Tambah Target Piket Harian"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  {canEdit && (
                    <>
                      <button
                        onClick={handleGeneratePiketKolektif}
                        className="bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold shadow-sm transition-colors cursor-pointer active:scale-95"
                        title="Distribusikan semua siswa kelas secara acak dan merata ke jadwal piket"
                      >
                        <RefreshCw size={14} /> Auto Distribusi
                      </button>
                      <button
                        onClick={handleResetPiket}
                        className="border border-slate-700 hover:bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer active:scale-95"
                      >
                        Reset Piket
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={showKepsekSig}
                      onChange={e => setShowKepsekSig(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>TTD Kepsek</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={useKopSurat}
                      onChange={e => setUseKopSurat(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>Sertakan Kop Surat</span>
                  </label>
                  {canEdit && syncData && (
                    <button
                      onClick={async () => {
                        try {
                          await syncData();
                        } catch (e) {
                          // Handled inside syncData
                        }
                      }}
                      disabled={isSyncing}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      <Cloud size={15} className={isSyncing ? "animate-pulse" : ""} />
                      {isSyncing ? 'Sinkronisasi...' : 'Simpan & Sinkronkan'}
                    </button>
                  )}
                  <button onClick={exportPiketExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium shadow-md shadow-emerald-500/10 transition-colors cursor-pointer">
                    <Download size={15} /> Excel
                  </button>
                  <button onClick={exportPiketPDF} className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium shadow-md shadow-rose-500/10 transition-colors cursor-pointer">
                    <Printer size={15} /> PDF
                  </button>
                </div>
              </div>

              {/* Piket Board Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {daysList.map(hari => {
                  const dayPikets = piketItems.filter(item => item.hari === hari);
                  return (
                    <div key={hari} className="bg-slate-800/20 border border-slate-700/60 rounded-2xl overflow-hidden flex flex-col h-full min-h-[250px] shadow-sm">
                      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
                        <span className="font-bold text-sm tracking-wide text-slate-200">{hari}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] border px-2 py-0.5 rounded-full font-bold ${
                            dayPikets.length >= jumlahPiketHarian
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                          }`}>
                            {dayPikets.length} / {jumlahPiketHarian} Petugas
                          </span>
                          {canEdit && (
                            <button
                              onClick={() => {
                                setSelectedPiketDay(hari);
                                setSelectedStudentForPiket('');
                                setIsPiketModalOpen(true);
                              }}
                              className="text-emerald-400 hover:text-emerald-300 p-1 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Tambah Petugas"
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 flex-1 space-y-2 overflow-y-auto max-h-[300px] custom-scrollbar">
                        {dayPikets.length > 0 ? (
                          dayPikets.map((item) => {
                            const student = students.find(s => s.id === item.id_siswa);
                            return (
                              <div key={item.id} className="group flex justify-between items-center bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-emerald-500/30 p-2.5 rounded-xl transition-all">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="bg-emerald-500/10 text-emerald-400 p-1.5 rounded-lg border border-emerald-500/20">
                                    <User size={13} />
                                  </div>
                                  <span className="text-sm font-medium text-slate-300 truncate">
                                    {student ? student.nama : 'Siswa Tidak Ditemukan'}
                                  </span>
                                </div>

                                {canEdit && (
                                  <button
                                    onClick={() => setPiketToDelete(item.id)}
                                    className="text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                    title="Hapus Petugas"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-slate-700/20 rounded-xl">
                            <UserCheck size={20} className="text-slate-600 mb-1" />
                            <p className="text-xs italic">Belum ada petugas</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-800/20 border border-dashed border-slate-700/40 rounded-2xl">
          <Calendar size={48} className="text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-400">Belum ada kelas aktif</p>
          <p className="text-xs text-slate-500 mt-1">Tambahkan data siswa terlebih dahulu di menu "Data Siswa" untuk memulai.</p>
        </div>
      )}

      {/* PORTALS FOR MODALS TO ENSURE NO CLIPPING AND PERFECT OVERLAYS */}
      {/* 0. SMART ROSTER CONFIG MODAL */}
      {isConfigModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh] my-auto">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-lg text-amber-300 flex items-center gap-2">
                <Sliders className="text-amber-400" size={18} />
                Pengaturan Roster Cerdas & Waktu Istirahat
              </h3>
              <button onClick={() => setIsConfigModalOpen(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveSmartConfig} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Durasi 1 JP (Menit)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="15"
                      max="120"
                      required
                      value={durasiJpMenit}
                      onChange={e => setDurasiJpMenit(Number(e.target.value) || 35)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-100 text-sm font-bold"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold">menit</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Standar SD/SMP/SMA: 35–45 mnt</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Jam Mulai Sekolah</label>
                  <input
                    type="time"
                    required
                    value={jamMulaiSekolah}
                    onChange={e => setJamMulaiSekolah(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-100 text-sm font-bold [color-scheme:dark]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Awal jam pelajaran 1</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> Waktu Istirahat Otomatis
                  </label>
                  <button
                    type="button"
                    onClick={handleAddBreakTime}
                    className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all"
                  >
                    <Plus size={13} /> Tambah Istirahat
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                  {breakTimes.map((b, idx) => (
                    <div key={b.id || idx} className="flex items-center gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                      <input
                        type="text"
                        placeholder="Nama (e.g. ISTIRAHAT)"
                        value={b.nama}
                        onChange={e => {
                          const updated = [...breakTimes];
                          updated[idx].nama = e.target.value;
                          setBreakTimes(updated);
                        }}
                        className="w-1/3 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-semibold"
                      />
                      <input
                        type="time"
                        value={b.jam_mulai}
                        onChange={e => {
                          const updated = [...breakTimes];
                          updated[idx].jam_mulai = e.target.value;
                          setBreakTimes(updated);
                        }}
                        className="w-1/4 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 [color-scheme:dark]"
                      />
                      <span className="text-slate-500 text-xs font-bold">-</span>
                      <input
                        type="time"
                        value={b.jam_selesai}
                        onChange={e => {
                          const updated = [...breakTimes];
                          updated[idx].jam_selesai = e.target.value;
                          setBreakTimes(updated);
                        }}
                        className="w-1/4 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 [color-scheme:dark]"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveBreakTime(b.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Hapus Istirahat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsConfigModalOpen(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
                <button type="submit" className="px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5">
                  <Check size={16} /> Simpan Pengaturan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 1. ROSTER MODAL */}
      {isRosterModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl max-w-md w-full flex flex-col overflow-hidden max-h-[90vh] my-auto">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <Clock className="text-indigo-400" size={18} />
                {editingRosterId ? 'Edit Jam Pelajaran' : 'Tambah Jam Pelajaran Cerdas'}
              </h3>
              <button onClick={() => setIsRosterModalOpen(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveRoster} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hari</label>
                <select
                  value={rosterFormData.hari || 'Senin'}
                  onChange={e => {
                    const newDay = e.target.value;
                    const autoStart = getNextAvailableStartTime(newDay, rosterItems);
                    const numJp = rosterFormData.jumlah_jp || 1;
                    const autoEnd = addMinutesToTime(autoStart, numJp * durasiJpMenit);
                    setRosterFormData({
                      ...rosterFormData,
                      hari: newDay,
                      jam_mulai: autoStart,
                      jam_selesai: autoEnd
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all"
                >
                  {daysList.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {!editingRosterId && (
                <div>
                  <label className="block text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Jumlah Jam Pelajaran (JP)
                  </label>
                  <select
                    value={rosterFormData.jumlah_jp || 1}
                    onChange={e => {
                      const numJp = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                      const autoEnd = addMinutesToTime(rosterFormData.jam_mulai, numJp * durasiJpMenit);
                      setRosterFormData({
                        ...rosterFormData,
                        jumlah_jp: numJp,
                        jam_selesai: autoEnd
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-indigo-500/50 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm transition-all cursor-pointer font-bold"
                  >
                    <option value={1}>1 JP ({durasiJpMenit} Menit)</option>
                    <option value={2}>2 JP ({durasiJpMenit * 2} Menit)</option>
                    <option value={3}>3 JP ({durasiJpMenit * 3} Menit)</option>
                    <option value={4}>4 JP ({durasiJpMenit * 4} Menit)</option>
                    <option value={5}>5 JP ({durasiJpMenit * 5} Menit)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={rosterFormData.jam_mulai || ''}
                    onChange={e => {
                      const newStart = e.target.value;
                      const numJp = rosterFormData.jumlah_jp || 1;
                      const autoEnd = addMinutesToTime(newStart, numJp * durasiJpMenit);
                      setRosterFormData({
                        ...rosterFormData,
                        jam_mulai: newStart,
                        jam_selesai: autoEnd
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark] cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={rosterFormData.jam_selesai || ''}
                    onChange={e => setRosterFormData({...rosterFormData, jam_selesai: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark] cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mata Pelajaran</label>
                {subjects.length > 0 ? (
                  <select
                    value={rosterFormData.mata_pelajaran || ''}
                    onChange={e => setRosterFormData({...rosterFormData, mata_pelajaran: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all cursor-pointer"
                  >
                    <option value="" disabled>-- Pilih Mata Pelajaran --</option>
                    {subjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Ketik Mata Pelajaran"
                    value={rosterFormData.mata_pelajaran || ''}
                    onChange={e => setRosterFormData({...rosterFormData, mata_pelajaran: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Guru Pengampu / Keterangan</label>
                <input
                  type="text"
                  placeholder="Contoh: Ibu Rina Wijaya"
                  value={rosterFormData.guru || ''}
                  onChange={e => setRosterFormData({...rosterFormData, guru: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all"
                />
              </div>

              <div className="pt-3 border-t border-slate-700/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsRosterModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">Batal</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-semibold bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer">Simpan Jadwal</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 2. PIKET ASSIGNMENT MODAL */}
      {isPiketModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl max-w-md w-full flex flex-col overflow-hidden my-auto max-h-[90vh]">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <UserCheck className="text-emerald-400" size={18} />
                Tambah Petugas Piket - {selectedPiketDay}
              </h3>
              <button onClick={() => setIsPiketModalOpen(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>

            <form onSubmit={handleAddPiket} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Siswa</label>
                {classStudents.length > 0 ? (
                  <select
                    value={selectedStudentForPiket}
                    onChange={e => setSelectedStudentForPiket(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Pilih Siswa Kelas {selectedClass} --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.nama}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 font-semibold italic">
                    Belum ada siswa yang terdaftar di kelas {selectedClass}.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-700/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsPiketModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">Batal</button>
                <button type="submit" disabled={classStudents.length === 0} className="px-5 py-2.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer">Tambah Petugas</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 3. ROSTER DELETE MODAL */}
      {rosterToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl max-w-sm w-full flex flex-col overflow-hidden my-auto max-h-[90vh]">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <ShieldAlert className="text-rose-400" size={18} />
                Konfirmasi Hapus
              </h3>
              <button onClick={() => setRosterToDelete(null)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda yakin ingin menghapus jam pelajaran ini dari jadwal?</p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setRosterToDelete(null)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">Batal</button>
              <button onClick={() => handleDeleteRoster(rosterToDelete)} className="px-5 py-2 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20 transition-colors cursor-pointer">Hapus</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 4. PIKET DELETE MODAL */}
      {piketToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl max-w-sm w-full flex flex-col overflow-hidden my-auto max-h-[90vh]">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <ShieldAlert className="text-rose-400" size={18} />
                Konfirmasi Hapus
              </h3>
              <button onClick={() => setPiketToDelete(null)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda yakin ingin menghapus siswa ini dari jadwal piket harian?</p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setPiketToDelete(null)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">Batal</button>
              <button onClick={() => handleDeletePiket(piketToDelete)} className="px-5 py-2 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20 transition-colors cursor-pointer">Hapus</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
