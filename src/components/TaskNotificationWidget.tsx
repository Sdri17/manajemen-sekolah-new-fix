import React, { useState, useEffect, useMemo } from 'react';
import { store, StudentTask, Student } from '../lib/store';
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, UserX, MessageSquare, ChevronDown, ChevronUp, Bell, ExternalLink } from 'lucide-react';
import { formatWhatsAppNumber } from '../lib/WhatsAppSender';
import { getCurrentUser, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import toast from 'react-hot-toast';

interface TaskNotificationWidgetProps {
  semester: string;
  className?: string;
  onSelectTask?: (taskId: string) => void;
  compact?: boolean;
}

export default function TaskNotificationWidget({ semester, className = '', onSelectTask, compact = false }: TaskNotificationWidgetProps) {
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'incomplete' | 'completed'>('all');
  const [todayOnly, setTodayOnly] = useState<boolean>(true);

  const todayStr = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const todayFormattedIndo = useMemo(() => {
    try {
      const [y, m, d] = todayStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return todayStr;
    }
  }, [todayStr]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = getCurrentUser();
      const sList: Student[] = [];
      await store.students.iterate<Student, void>((s) => {
        if (s.kelas && s.kelas.toLowerCase() !== 'alumni') {
          sList.push(s);
        }
      });
      const userFilteredStudents = filterStudentsForUser(currentUser, sList);
      setStudents(userFilteredStudents);

      const studentClassMap: Record<string, string> = {};
      userFilteredStudents.forEach(s => {
        if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
      });

      const tList: StudentTask[] = [];
      await store.tasks.iterate<StudentTask, void>((t) => {
        if (t.semester === semester || !semester) {
          tList.push(t);
        }
      });
      const userFilteredTasks = filterRecordsForUser(currentUser, tList, studentClassMap);
      userFilteredTasks.sort((a, b) => (b.tanggal_kumpul || '').localeCompare(a.tanggal_kumpul || ''));
      setTasks(userFilteredTasks);
    } catch (e) {
      console.warn('Error loading task notifications:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleRefresh = () => loadData();
    window.addEventListener('data-changed', handleRefresh);
    window.addEventListener('delta-data-changed', handleRefresh);
    return () => {
      window.removeEventListener('data-changed', handleRefresh);
      window.removeEventListener('delta-data-changed', handleRefresh);
    };
  }, [semester]);

  // Compute status metrics per task
  const analyzedTasks = useMemo(() => {
    let targetTasks = tasks;
    if (todayOnly) {
      targetTasks = tasks.filter(t => t.tanggal_kumpul === todayStr || t.tanggal_diberikan === todayStr);
    }

    return targetTasks.map((t) => {
      // Find students belonging to this task's class
      const classStudents = students.filter(s => !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase());
      const totalStudents = classStudents.length;

      const completedStudents = classStudents.filter(s => !!t.penyelesaian?.[s.id]);
      const incompleteStudents = classStudents.filter(s => !t.penyelesaian?.[s.id]);

      const completedCount = completedStudents.length;
      const incompleteCount = incompleteStudents.length;

      const isAllCompleted = totalStudents > 0 && incompleteCount === 0;
      const completionPercentage = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

      // Check if deadline is past or today
      const isPastDue = t.tanggal_kumpul && t.tanggal_kumpul < todayStr;
      const isDueToday = t.tanggal_kumpul === todayStr;

      return {
        task: t,
        totalStudents,
        completedCount,
        incompleteCount,
        completedStudents,
        incompleteStudents,
        isAllCompleted,
        completionPercentage,
        isPastDue,
        isDueToday,
      };
    });
  }, [tasks, students, todayOnly, todayStr]);

  // Number of pending/incomplete assignments
  const pendingAssignmentsDueTodayCount = useMemo(() => {
    return tasks.filter(t => {
      if (t.tanggal_kumpul !== todayStr) return false;
      const classStudents = students.filter(s => !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase());
      if (classStudents.length === 0) return false;
      const completedCount = classStudents.filter(s => !!t.penyelesaian?.[s.id]).length;
      return completedCount < classStudents.length;
    }).length;
  }, [tasks, students, todayStr]);

  const totalIncompleteTasks = useMemo(() => {
    return analyzedTasks.filter(item => !item.isAllCompleted && item.totalStudents > 0).length;
  }, [analyzedTasks]);

  const totalCompletedTasks = useMemo(() => {
    return analyzedTasks.filter(item => item.isAllCompleted && item.totalStudents > 0).length;
  }, [analyzedTasks]);

  const filteredAnalyzedTasks = useMemo(() => {
    if (activeFilter === 'incomplete') {
      return analyzedTasks.filter(item => !item.isAllCompleted);
    }
    if (activeFilter === 'completed') {
      return analyzedTasks.filter(item => item.isAllCompleted);
    }
    return analyzedTasks;
  }, [analyzedTasks, activeFilter]);

  const handleSendReminderWA = (student: Student, taskTitle: string, mapel: string, deadline: string) => {
    if (!student.hp_ortu) {
      toast.error(`Nomor WhatsApp orang tua/wali ${student.nama} belum tercatat`);
      return;
    }
    const formattedPhone = formatWhatsAppNumber(student.hp_ortu);
    if (!formattedPhone) {
      toast.error(`Nomor HP orang tua ${student.nama} tidak valid`);
      return;
    }

    const msg = `Yth. Bapak/Ibu Orang Tua/Wali dari *${student.nama}*,\n\n` +
      `Sistem menginformasikan bahwa tugas berikut *BELUM DIKUMPULKAN*:\n\n` +
      `📝 Tugas: *${taskTitle}*\n` +
      `📚 Mapel: *${mapel}*\n` +
      `📅 Tenggat: *${deadline}*\n\n` +
      `Mohon dibantu bimbingan dan pendampingannya di rumah agar putra/putri dapat menyelesaikan tugas tersebut. Terima kasih. 🙏`;

    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) {
    return (
      <div className={`p-4 bg-slate-900/40 border border-slate-700/40 rounded-2xl animate-pulse space-y-3 ${className}`}>
        <div className="h-5 w-40 bg-slate-700 rounded" />
        <div className="h-10 w-full bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`bg-slate-800/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-slate-200 ${className}`}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Bell size={16} />
            </div>
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">Notifikasi Tugas</h4>
              <p className="text-[10px] text-slate-400 font-medium">
                {todayOnly ? `Tenggat Hari Ini (${todayFormattedIndo})` : 'Semua Tenggat Tugas'}
              </p>
            </div>
          </div>
          
          {/* Today Only Toggle Switch */}
          <button
            type="button"
            onClick={() => setTodayOnly(!todayOnly)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              todayOnly
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-700/50 text-slate-400 border-slate-600'
            }`}
            title="Toggle hanya tampilkan tugas hari ini"
          >
            <span className={`w-2 h-2 rounded-full ${todayOnly ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>Today Only</span>
          </button>
        </div>

        {/* Quick Summary Badges */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-rose-300">
                {todayOnly ? 'Pending Hari Ini' : 'Belum Lengkap'}
              </p>
              <p className="text-base font-bold text-rose-400 font-mono mt-0.5">{totalIncompleteTasks} Tugas</p>
            </div>
            <AlertTriangle size={18} className="text-rose-400" />
          </div>
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-emerald-300">
                {todayOnly ? 'Selesai Hari Ini' : '100% Selesai'}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">{totalCompletedTasks} Tugas</p>
            </div>
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
        </div>

        {/* Short List */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {analyzedTasks.length === 0 ? (
            <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-700/40">
              <p className="text-xs text-slate-400">
                {todayOnly ? `Tidak ada tugas pending hari ini (${todayFormattedIndo})` : 'Tidak ada notifikasi tugas'}
              </p>
            </div>
          ) : (
            analyzedTasks.slice(0, 6).map((item) => (
              <div
                key={item.task.id}
                onClick={() => onSelectTask?.(item.task.id)}
                className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                  item.isAllCompleted
                    ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-200 truncate">{item.task.judul}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span className="text-indigo-400 font-semibold">{item.task.mata_pelajaran}</span>
                      <span>•</span>
                      <span className="font-mono">Kelas {item.task.kelas}</span>
                    </p>
                  </div>
                  {item.isAllCompleted ? (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-bold uppercase shrink-0">
                      Selesai
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[9px] font-bold uppercase shrink-0">
                      {item.incompleteCount} Belum
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-xl text-slate-200 ${className}`}>
      {/* Header Notification Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-inner">
            <Bell size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-slate-100">
                Pusat Notifikasi & Reminder Tugas
              </h3>
              {todayOnly && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                  Hari Ini ({todayFormattedIndo})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {todayOnly
                ? `Menampilkan pengingat notifikasi tugas untuk hari ini (${todayFormattedIndo})`
                : 'Menampilkan seluruh daftar notifikasi dan reminder tugas'}
            </p>
          </div>
        </div>

        {/* Scope and Status Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Today Only Toggle Switch */}
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todayOnly}
                onChange={(e) => setTodayOnly(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
              />
              <span>Today Only (Hari Ini)</span>
            </label>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua ({analyzedTasks.length})
            </button>
            <button
              onClick={() => setActiveFilter('incomplete')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'incomplete'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <AlertTriangle size={13} />
              <span>Belum Kumpul ({totalIncompleteTasks})</span>
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>100% Selesai ({totalCompletedTasks})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Metric Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="p-3.5 bg-slate-900/70 border border-slate-700/70 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Tugas Aktif</p>
            <p className="text-xl font-bold font-mono text-slate-100 mt-1">{analyzedTasks.length} Tugas</p>
          </div>
          <div className="p-2 bg-slate-800 text-indigo-400 rounded-lg">
            <ClipboardList size={20} />
          </div>
        </div>

        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-rose-300 font-medium">Ada Siswa Belum Mengumpul</p>
            <p className="text-xl font-bold font-mono text-rose-400 mt-1">{totalIncompleteTasks} Tugas</p>
          </div>
          <div className="p-2 bg-rose-500/20 text-rose-300 rounded-lg">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-300 font-medium">Semua Sudah Mengumpul</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{totalCompletedTasks} Tugas</p>
          </div>
          <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-lg">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Task List Section */}
      {filteredAnalyzedTasks.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-700/40 space-y-2">
          <CheckCircle2 size={32} className="mx-auto text-emerald-400/80 mb-2" />
          <p className="text-sm font-semibold text-slate-300">
            {todayOnly 
              ? `Tidak ada notifikasi tugas untuk hari ini (${todayFormattedIndo})`
              : 'Tidak ada tugas dalam kategori ini'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {todayOnly
              ? 'Tidak ada tugas yang ber-tenggat atau diberikan hari ini. Anda dapat mematikan filter "Today Only" di atas untuk melihat seluruh riwayat tugas.'
              : 'Semua status tugas terpantau dengan baik'}
          </p>
          {todayOnly && (
            <button
              onClick={() => setTodayOnly(false)}
              className="mt-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              Lihat Semua Tugas
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {filteredAnalyzedTasks.map((item) => {
            const isExpanded = expandedTaskId === item.task.id;

            return (
              <div
                key={item.task.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  item.isAllCompleted
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-slate-900/80 border-slate-700/80'
                }`}
              >
                {/* Main Card Header */}
                <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-100">{item.task.judul}</span>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-semibold">
                        {item.task.mata_pelajaran}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded text-[10px] font-mono">
                        Kelas {item.task.kelas}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-500" />
                        <span>Deadline: <strong className="text-slate-300 font-mono">{item.task.tanggal_kumpul || '-'}</strong></span>
                      </span>

                      {/* Progress Bar */}
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="flex-1 bg-slate-700/60 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              item.isAllCompleted ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            style={{ width: `${item.completionPercentage}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-200">
                          {item.completedCount}/{item.totalStudents} ({item.completionPercentage}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Status Badge & Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.isAllCompleted ? (
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <CheckCircle2 size={14} />
                        <span>Semua Sudah Kumpul</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <AlertTriangle size={14} />
                        <span>{item.incompleteCount} Belum Kumpul</span>
                      </span>
                    )}

                    <button
                      onClick={() => setExpandedTaskId(isExpanded ? null : item.task.id)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                      title={isExpanded ? 'Tutup Rincian' : 'Lihat Daftar Siswa'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {onSelectTask && (
                      <button
                        onClick={() => onSelectTask(item.task.id)}
                        className="p-1.5 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                        title="Buka di Manajemen Tugas"
                      >
                        <ExternalLink size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Student Breakdown */}
                {isExpanded && (
                  <div className="p-3.5 border-t border-slate-700/60 bg-slate-950/60 space-y-3">
                    {item.isAllCompleted ? (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span>Luar biasa! Seluruh <strong>{item.totalStudents} siswa</strong> di Kelas {item.task.kelas} telah menyelesaikan dan mengumpulkan tugas ini.</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                            <UserX size={14} />
                            <span>Daftar Siswa Belum Mengumpulkan ({item.incompleteCount}):</span>
                          </h5>
                          <span className="text-[10px] text-slate-400 italic">Klik tombol WA untuk mengirim teguran pribadi</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.incompleteStudents.map((s) => (
                            <div
                              key={s.id}
                              className="p-2 bg-slate-900 border border-rose-500/30 rounded-xl flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-200 truncate">{s.no}. {s.nama}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {s.hp_ortu ? `WA Ortu: ${s.hp_ortu}` : 'Nomor HP tidak ada'}
                                </p>
                              </div>

                              <button
                                onClick={() => handleSendReminderWA(s, item.task.judul, item.task.mata_pelajaran, item.task.tanggal_kumpul || '-')}
                                disabled={!s.hp_ortu}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                                title="Kirim Pengingat WA"
                              >
                                <MessageSquare size={12} />
                                <span>Ingatkan WA</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
