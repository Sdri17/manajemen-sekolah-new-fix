import React, { useState, useEffect } from 'react';
import { store, Student, Settings, defaultSettings } from '../lib/store';
import { syncAndGetClasses } from '../lib/classHelper';
import { 
  GraduationCap, 
  ArrowRight, 
  Check, 
  X, 
  Users, 
  Sparkles, 
  AlertCircle, 
  Search, 
  CheckSquare, 
  Square, 
  RefreshCw,
  Award,
  Layers,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

interface NaikKelasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultSourceClass?: string;
}

export type PromotionAction = 'naik' | 'tinggal' | 'lulus';

export interface StudentPromotionItem {
  student: Student;
  action: PromotionAction;
  selected: boolean;
  targetClassOverride?: string;
}

export default function NaikKelasModal({
  isOpen,
  onClose,
  onSuccess,
  defaultSourceClass
}: NaikKelasModalProps) {
  const [classes, setClasses] = useState<string[]>([]);
  const [sourceClass, setSourceClass] = useState<string>('');
  const [targetClass, setTargetClass] = useState<string>('');
  const [isCustomTarget, setIsCustomTarget] = useState<boolean>(false);
  const [customTargetName, setCustomTargetName] = useState<string>('');
  
  const [academicYear, setAcademicYear] = useState<string>('2025/2026');
  const [graduationYear, setGraduationYear] = useState<string>(new Date().getFullYear().toString());

  const [studentsInSource, setStudentsInSource] = useState<StudentPromotionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [step, setStep] = useState<'configure' | 'review'>('configure');

  // Load available classes when modal opens
  useEffect(() => {
    if (isOpen) {
      loadClasses();
    }
  }, [isOpen]);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const cls = await syncAndGetClasses();
      setClasses(cls);
      
      const initialSource = defaultSourceClass && cls.includes(defaultSourceClass)
        ? defaultSourceClass
        : (cls[0] || '');
      setSourceClass(initialSource);
      
      if (initialSource) {
        suggestNextClass(initialSource, cls);
      }
    } catch (err) {
      console.error('Gagal memuat daftar kelas:', err);
      toast.error('Gagal memuat daftar kelas');
    } finally {
      setLoading(false);
    }
  };

  // Helper to suggest next class automatically (e.g. 7-A -> 8-A, Kelas 1 -> Kelas 2)
  const suggestNextClass = (source: string, classList: string[]) => {
    if (!source) return;

    // Check numbers in class string
    const match = source.match(/(\d+)/);
    if (match) {
      const currentNum = parseInt(match[1], 10);
      const nextNum = currentNum + 1;
      const suggestedName = source.replace(match[1], nextNum.toString());

      // Check if suggested exists in class list
      const existing = classList.find(c => c.toLowerCase() === suggestedName.toLowerCase());
      if (existing) {
        setTargetClass(existing);
        setIsCustomTarget(false);
        return;
      } else if (currentNum >= 6) {
        // High grade default to Alumni or next grade custom
        if (currentNum === 6 || currentNum === 9 || currentNum === 12) {
          setTargetClass('Alumni');
          setIsCustomTarget(false);
          return;
        }
      }
      setTargetClass(suggestedName);
      setIsCustomTarget(false);
      return;
    }

    // Fallback: pick next class in list if available
    const idx = classList.indexOf(source);
    if (idx !== -1 && idx + 1 < classList.length) {
      setTargetClass(classList[idx + 1]);
    } else {
      setTargetClass('Alumni');
    }
    setIsCustomTarget(false);
  };

  // Fetch students when sourceClass changes
  useEffect(() => {
    if (!sourceClass || !isOpen) return;

    const fetchStudents = async () => {
      setLoading(true);
      try {
        const studentList: Student[] = [];
        await store.students.iterate<Student, void>((val) => {
          if (val && val.kelas && val.kelas.trim().toLowerCase() === sourceClass.trim().toLowerCase()) {
            studentList.push(val);
          }
        });

        // Sort by name
        studentList.sort((a, b) => a.nama.localeCompare(b.nama));

        const promotionItems: StudentPromotionItem[] = studentList.map(s => ({
          student: s,
          action: 'naik',
          selected: true
        }));

        setStudentsInSource(promotionItems);
      } catch (err) {
        console.error('Error fetching students for source class:', err);
        toast.error('Gagal mengambil data siswa kelas ' + sourceClass);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [sourceClass, isOpen]);

  const handleSourceClassChange = (newSource: string) => {
    setSourceClass(newSource);
    suggestNextClass(newSource, classes);
  };

  const activeTargetClass = isCustomTarget ? customTargetName.trim().toUpperCase() : targetClass;

  // Toggle select all
  const filteredStudents = studentsInSource.filter(item => 
    item.student.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.student.nisn && item.student.nisn.includes(searchQuery))
  );

  const allFilteredSelected = filteredStudents.length > 0 && filteredStudents.every(i => i.selected);

  const toggleSelectAll = () => {
    const nextState = !allFilteredSelected;
    const filteredIds = new Set(filteredStudents.map(f => f.student.id));
    setStudentsInSource(prev => prev.map(item => {
      if (filteredIds.has(item.student.id)) {
        return { ...item, selected: nextState };
      }
      return item;
    }));
  };

  const toggleSelectStudent = (id: string) => {
    setStudentsInSource(prev => prev.map(item => {
      if (item.student.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const setBulkAction = (action: PromotionAction) => {
    setStudentsInSource(prev => prev.map(item => {
      if (item.selected) {
        return { ...item, action };
      }
      return item;
    }));
    toast.success(`Action diubah menjadi "${action === 'naik' ? 'Naik Kelas' : action === 'tinggal' ? 'Tinggal Kelas' : 'Lulus'}" untuk siswa terpilih`);
  };

  const updateIndividualAction = (id: string, action: PromotionAction) => {
    setStudentsInSource(prev => prev.map(item => {
      if (item.student.id === id) {
        return { ...item, action };
      }
      return item;
    }));
  };

  // Stats
  const selectedCount = studentsInSource.filter(i => i.selected).length;
  const countNaik = studentsInSource.filter(i => i.selected && i.action === 'naik').length;
  const countTinggal = studentsInSource.filter(i => i.selected && i.action === 'tinggal').length;
  const countLulus = studentsInSource.filter(i => i.selected && i.action === 'lulus').length;

  const handleProceedToReview = () => {
    if (!sourceClass) {
      toast.error('Silakan pilih Kelas Asal');
      return;
    }

    if (!activeTargetClass) {
      toast.error('Silakan pilih atau isi Kelas Tujuan');
      return;
    }

    if (sourceClass.trim().toLowerCase() === activeTargetClass.trim().toLowerCase()) {
      toast.error('Kelas Tujuan tidak boleh sama dengan Kelas Asal');
      return;
    }

    if (selectedCount === 0) {
      toast.error('Pilih minimal 1 siswa untuk diproses');
      return;
    }

    setStep('review');
  };

  const executePromotion = async () => {
    setIsSubmitting(true);
    try {
      const selectedItems = studentsInSource.filter(i => i.selected);
      let updatedCount = 0;
      const nowIso = new Date().toISOString().split('T')[0];

      // Update in IndexedDB store.students
      for (const item of selectedItems) {
        const student = item.student;
        let newClass = sourceClass;
        let newStatus = student.status || 'Aktif';
        let isAlumni = false;

        if (item.action === 'naik') {
          newClass = activeTargetClass;
        } else if (item.action === 'tinggal') {
          newClass = sourceClass; // Stays in current class
        } else if (item.action === 'lulus') {
          newClass = 'Alumni';
          newStatus = 'Lulus';
          isAlumni = true;
        }

        const updatedStudent: Student = {
          ...student,
          kelas: newClass,
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(isAlumni ? {
            tanggal_lulus: nowIso,
            tahun_ajaran_lulus: academicYear
          } : {})
        };

        // Save to IndexedDB
        await store.students.setItem(student.id, updatedStudent);
        // Queue for sync
        await store.syncQueue.setItem(`students::${student.id}`, 'updated');
        updatedCount++;
      }

      // Automatically add new target class to settings.daftar_kelas if it doesn't exist and is not Alumni
      if (activeTargetClass && activeTargetClass.toLowerCase() !== 'alumni') {
        const currentSettings = (await store.settings.getItem<Settings>('app_settings')) || defaultSettings;
        const currentList = Array.isArray(currentSettings.daftar_kelas) ? currentSettings.daftar_kelas : [];
        if (!currentList.some(c => c.toLowerCase() === activeTargetClass.toLowerCase())) {
          const updatedList = [...currentList, activeTargetClass];
          const updatedSettings = { ...currentSettings, daftar_kelas: updatedList };
          await store.settings.setItem('app_settings', updatedSettings);
          await store.syncQueue.setItem('settings::app_settings', 'updated');
        }
      }

      // Fire data change events
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));

      toast.success(`Berhasil memproses kenaikan kelas untuk ${updatedCount} siswa!`);

      if (onSuccess) onSuccess();
      onClose();
      // Reset step
      setStep('configure');
    } catch (err: any) {
      console.error('Gagal mengeksekusi kenaikan kelas:', err);
      toast.error('Terjadi kesalahan saat memproses kenaikan kelas: ' + (err.message || 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Sistem Kenaikan Kelas & Kelulusan Massal</span>
                <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  Automated
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Memproses promosi tingkat kelas, siswa tinggal kelas, atau kelulusan alumni secara cepat dan aman
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* Stepper Header */}
          <div className="flex items-center justify-center gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <div className={`flex items-center gap-2 text-xs font-semibold ${step === 'configure' ? 'text-indigo-400' : 'text-emerald-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'configure' ? 'bg-indigo-500 text-white' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'}`}>
                1
              </span>
              <span>Konfigurasi Kelas & Siswa</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600" />
            <div className={`flex items-center gap-2 text-xs font-semibold ${step === 'review' ? 'text-indigo-400' : 'text-slate-500'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'review' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                2
              </span>
              <span>Review & Eksekusi</span>
            </div>
          </div>

          {step === 'configure' && (
            <>
              {/* Class Selection Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                {/* Source Class */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>1. Pilih Kelas Asal (Current Class)</span>
                  </label>
                  <select
                    value={sourceClass}
                    onChange={(e) => handleSourceClassChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    {classes.map(c => (
                      <option key={c} value={c}>Kelas {c}</option>
                    ))}
                  </select>
                </div>

                {/* Target Class */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2. Pilih Kelas Tujuan / Status Promosi</span>
                  </label>
                  
                  <div className="flex gap-2">
                    {!isCustomTarget ? (
                      <select
                        value={targetClass}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomTarget(true);
                          } else {
                            setTargetClass(e.target.value);
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                      >
                        {classes
                          .filter(c => c.toLowerCase() !== sourceClass.toLowerCase())
                          .map(c => (
                            <option key={c} value={c}>Naik ke Kelas {c}</option>
                          ))}
                        <option value="Alumni">🎓 Lulus (Menjadi Alumni)</option>
                        <option value="__CUSTOM__">+ Buat Kelas Baru...</option>
                      </select>
                    ) : (
                      <div className="flex gap-2 w-full">
                        <input
                          type="text"
                          placeholder="Contoh: 8-A, 9-B, atau Kelas 4"
                          value={customTargetName}
                          onChange={(e) => setCustomTargetName(e.target.value)}
                          className="w-full bg-slate-900 border border-emerald-500 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setIsCustomTarget(false)}
                          className="px-3 py-1 bg-slate-800 text-slate-400 hover:text-slate-200 text-xs rounded-xl border border-slate-700"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions & Academic Info */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Tahun Ajaran Kelulusan: </span>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-indigo-300 font-mono w-24 text-center focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono">
                      Total Siswa di Kelas {sourceClass}: <strong className="text-emerald-400">{studentsInSource.length}</strong>
                    </span>
                  </div>
                </div>

                {/* Bulk Status Setter Buttons */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 text-[11px] mr-1">Set Terpilih:</span>
                  <button
                    type="button"
                    onClick={() => setBulkAction('naik')}
                    className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-medium transition-colors"
                  >
                    Set Naik
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('tinggal')}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-medium transition-colors"
                  >
                    Set Tinggal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('lulus')}
                    className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg font-medium transition-colors"
                  >
                    Set Lulus
                  </button>
                </div>
              </div>

              {/* Search and Table */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Cari nama siswa atau NISN..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700"
                    >
                      {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400" /> : <Square className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{allFilteredSelected ? 'Batal Pilih Semua' : 'Pilih Semua'}</span>
                    </button>
                  </div>
                </div>

                {/* Student Table */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                      <span className="text-xs">Memuat data siswa kelas {sourceClass}...</span>
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      Tidak ada siswa ditemukan di kelas {sourceClass}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/90 border-b border-slate-800 sticky top-0 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleSelectAll}
                              className="rounded border-slate-700 text-indigo-500 focus:ring-0 bg-slate-900 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Nama Siswa</th>
                          <th className="py-2.5 px-3">NISN</th>
                          <th className="py-2.5 px-3">Gender</th>
                          <th className="py-2.5 px-3">Status Kenaikan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredStudents.map((item, idx) => (
                          <tr
                            key={item.student.id}
                            className={`hover:bg-slate-800/40 transition-colors ${!item.selected ? 'opacity-50' : ''}`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleSelectStudent(item.student.id)}
                                className="rounded border-slate-700 text-indigo-500 focus:ring-0 bg-slate-900 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-100">
                              {item.student.nama}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {item.student.nisn || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {item.student.jenis_kelamin === 'L' ? 'Laki-Laki' : item.student.jenis_kelamin === 'P' ? 'Perempuan' : '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                disabled={!item.selected}
                                value={item.action}
                                onChange={(e) => updateIndividualAction(item.student.id, e.target.value as PromotionAction)}
                                className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none ${
                                  item.action === 'naik'
                                    ? 'border-emerald-500/50 text-emerald-400'
                                    : item.action === 'tinggal'
                                    ? 'border-amber-500/50 text-amber-400'
                                    : 'border-sky-500/50 text-sky-400'
                                }`}
                              >
                                <option value="naik">Naik ke {activeTargetClass}</option>
                                <option value="tinggal">Tinggal di {sourceClass}</option>
                                <option value="lulus">Lulus (Alumni)</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl text-emerald-300">
                  <div className="text-xs text-emerald-400 font-medium">Naik Kelas</div>
                  <div className="text-2xl font-bold font-mono my-1">{countNaik} <span className="text-xs font-normal text-slate-400">siswa</span></div>
                  <div className="text-[11px] text-emerald-400/80">
                    Pindah dari {sourceClass} &rarr; <strong className="text-emerald-200">{activeTargetClass}</strong>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-300">
                  <div className="text-xs text-amber-400 font-medium">Tinggal Kelas</div>
                  <div className="text-2xl font-bold font-mono my-1">{countTinggal} <span className="text-xs font-normal text-slate-400">siswa</span></div>
                  <div className="text-[11px] text-amber-400/80">
                    Tetap di kelas {sourceClass}
                  </div>
                </div>

                <div className="bg-sky-500/10 border border-sky-500/30 p-4 rounded-xl text-sky-300">
                  <div className="text-xs text-sky-400 font-medium">Lulus ke Alumni</div>
                  <div className="text-2xl font-bold font-mono my-1">{countLulus} <span className="text-xs font-normal text-slate-400">siswa</span></div>
                  <div className="text-[11px] text-sky-400/80">
                    Lulus pada TA {academicYear}
                  </div>
                </div>
              </div>

              {/* Detailed Confirmation Box */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Konfirmasi Perubahan Database Siswa</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Proses ini akan secara otomatis memperbarui field <code className="text-indigo-300 font-mono">kelas</code> untuk {selectedCount} siswa di IndexedDB dan menyinkronkan data secara real-time ke Firestore server cloud sekolah.
                </p>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
                  <div>&bull; Kelas Asal: <strong className="text-slate-200">{sourceClass}</strong></div>
                  <div>&bull; Kelas Tujuan Promosi: <strong className="text-emerald-300">{activeTargetClass}</strong></div>
                  <div>&bull; Total Siswa Terproses: <strong className="text-slate-200">{selectedCount} orang</strong></div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between sticky bottom-0 z-10">
          {step === 'configure' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProceedToReview}
                disabled={selectedCount === 0 || loading}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                <span>Lanjut ke Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('configure')}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={executePromotion}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memproses Kenaikan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Eksekusi Kenaikan Kelas</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
