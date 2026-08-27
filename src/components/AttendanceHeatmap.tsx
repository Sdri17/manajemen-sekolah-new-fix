import React, { useState, useMemo } from 'react';
import { Attendance, Student, Settings } from '../lib/store';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWeekend, subMonths, addMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Info, AlertTriangle, TrendingDown, TrendingUp, Sun, Flame, Sparkles, Filter, Users, ShieldAlert, CheckCircle2, CalendarDays, Clock } from 'lucide-react';

interface AttendanceHeatmapProps {
  attendances: Attendance[];
  students: Student[];
  settings: Settings | null;
  filterClass: string;
}

export default function AttendanceHeatmap({ attendances, students, settings, filterClass }: AttendanceHeatmapProps) {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<'grid' | 'months'>('grid');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [statusFilter, setStatusFilter] = useState<'semua' | 'terisi' | 'libur' | 'aktif_belum_isi'>('semua');
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    dateObj: Date;
    stats: { total: number; hadir: number; sakit: number; izin: number; alpa: number; percentage: number };
    records: Attendance[];
    isLibur: boolean;
    liburDesc?: string;
  } | null>(null);

  // Active students excluding Alumni
  const activeStudents = useMemo(() => {
    return students.filter(s => {
      if (filterClass !== 'Semua' && s.kelas !== filterClass) return false;
      return !s.kelas || s.kelas.toLowerCase() !== 'alumni';
    });
  }, [students, filterClass]);

  // Check holiday logic
  const checkHoliday = (date: Date): { isLibur: boolean; desc: string } => {
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
      return { isLibur: true, desc: found.nama };
    }
    return { isLibur: false, desc: '' };
  };

  // Map attendance records by date YYYY-MM-DD
  const attendanceByDateMap = useMemo(() => {
    const map: Record<string, { total: number; hadir: number; sakit: number; izin: number; alpa: number; percentage: number; records: Attendance[] }> = {};
    
    const activeStudentIds = new Set(activeStudents.map(s => s.id));

    attendances.forEach(att => {
      if (!att.tanggal) return;
      if (activeStudentIds.size > 0 && !activeStudentIds.has(att.id_siswa)) return;

      const dateStr = att.tanggal.substring(0, 10);
      if (!map[dateStr]) {
        map[dateStr] = { total: 0, hadir: 0, sakit: 0, izin: 0, alpa: 0, percentage: 0, records: [] };
      }

      map[dateStr].records.push(att);
      map[dateStr].total++;
      if (att.status === 'Hadir') map[dateStr].hadir++;
      else if (att.status === 'Sakit') map[dateStr].sakit++;
      else if (att.status === 'Izin') map[dateStr].izin++;
      else if (att.status === 'Alpa') map[dateStr].alpa++;
    });

    Object.keys(map).forEach(dateStr => {
      const d = map[dateStr];
      d.percentage = d.total > 0 ? Math.round((d.hadir / d.total) * 100) : 0;
    });

    return map;
  }, [attendances, activeStudents]);

  // Calculate year totals for summary stats
  const calendarSummaryStats = useMemo(() => {
    let totalDays = 0;
    let totalHolidayDays = 0;
    let totalActiveSchoolDays = 0;
    let totalRecordedDays = 0;

    for (let m = 0; m < 12; m++) {
      const start = new Date(currentYear, m, 1);
      const end = endOfMonth(start);
      const days = eachDayOfInterval({ start, end });
      days.forEach(d => {
        totalDays++;
        const hol = checkHoliday(d);
        if (hol.isLibur) {
          totalHolidayDays++;
        } else {
          totalActiveSchoolDays++;
          const dateStr = format(d, 'yyyy-MM-dd');
          if (attendanceByDateMap[dateStr] && attendanceByDateMap[dateStr].total > 0) {
            totalRecordedDays++;
          }
        }
      });
    }

    return {
      totalDays,
      totalHolidayDays,
      totalActiveSchoolDays,
      totalRecordedDays,
      unrecordedActiveDays: Math.max(0, totalActiveSchoolDays - totalRecordedDays)
    };
  }, [currentYear, attendanceByDateMap, settings]);

  // Generate 12 months data for current academic year
  const monthsData = useMemo(() => {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const start = new Date(currentYear, m, 1);
      const end = endOfMonth(start);
      const days = eachDayOfInterval({ start, end });
      months.push({ monthIndex: m, name: format(start, 'MMMM yyyy', { locale: id }), days });
    }
    return months;
  }, [currentYear]);

  // Seasonal Trend Analysis Calculations
  const seasonalInsights = useMemo(() => {
    const monthStats: { monthName: string; monthIdx: number; totalHadir: number; totalCount: number; sakitCount: number; alpaCount: number; perc: number }[] = [];
    
    for (let m = 0; m < 12; m++) {
      let totalHadir = 0;
      let totalCount = 0;
      let sakitCount = 0;
      let alpaCount = 0;

      Object.entries(attendanceByDateMap).forEach(([dateStr, stat]) => {
        const item = stat as { total: number; hadir: number; sakit: number; izin: number; alpa: number; percentage: number; records: Attendance[] };
        const d = parseISO(dateStr);
        if (d.getFullYear() === currentYear && d.getMonth() === m) {
          totalHadir += item.hadir;
          totalCount += item.total;
          sakitCount += item.sakit;
          alpaCount += item.alpa;
        }
      });

      const monthName = format(new Date(currentYear, m, 1), 'MMMM', { locale: id });
      const perc = totalCount > 0 ? Math.round((totalHadir / totalCount) * 100) : 0;
      monthStats.push({ monthName, monthIdx: m, totalHadir, totalCount, sakitCount, alpaCount, perc });
    }

    const recordedMonths = monthStats.filter(m => m.totalCount > 0);
    
    // Day of week stats (Senin = 1, Jumat = 5)
    const dayOfWeekStats: Record<number, { name: string; hadir: number; total: number }> = {
      1: { name: 'Senin', hadir: 0, total: 0 },
      2: { name: 'Selasa', hadir: 0, total: 0 },
      3: { name: 'Rabu', hadir: 0, total: 0 },
      4: { name: 'Kamis', hadir: 0, total: 0 },
      5: { name: 'Jumat', hadir: 0, total: 0 },
      6: { name: 'Sabtu', hadir: 0, total: 0 },
    };

    Object.entries(attendanceByDateMap).forEach(([dateStr, stat]) => {
      const item = stat as { total: number; hadir: number; sakit: number; izin: number; alpa: number; percentage: number; records: Attendance[] };
      const d = parseISO(dateStr);
      const dayIdx = d.getDay();
      if (dayOfWeekStats[dayIdx]) {
        dayOfWeekStats[dayIdx].hadir += item.hadir;
        dayOfWeekStats[dayIdx].total += item.total;
      }
    });

    let lowestAttendanceMonth = recordedMonths.length > 0 ? recordedMonths.reduce((min, m) => m.perc < min.perc ? m : min, recordedMonths[0]) : null;
    let highestSicknessMonth = recordedMonths.length > 0 ? recordedMonths.reduce((max, m) => m.sakitCount > max.sakitCount ? m : max, recordedMonths[0]) : null;
    
    // Find day of week with lowest attendance
    let lowestDayOfWeek: { name: string; perc: number } | null = null;
    let minDayPerc = 101;
    Object.values(dayOfWeekStats).forEach(ds => {
      if (ds.total > 0) {
        const p = Math.round((ds.hadir / ds.total) * 100);
        if (p < minDayPerc) {
          minDayPerc = p;
          lowestDayOfWeek = { name: ds.name, perc: p };
        }
      }
    });

    return {
      recordedMonthsCount: recordedMonths.length,
      lowestAttendanceMonth,
      highestSicknessMonth,
      lowestDayOfWeek
    };
  }, [attendanceByDateMap, currentYear]);

  const getHeatmapColor = (percentage: number, isRecorded: boolean, isLibur: boolean) => {
    if (isLibur) return 'bg-rose-950/40 border-rose-800/60 text-rose-300 hover:border-rose-500';
    if (!isRecorded) return 'bg-slate-900/80 border-slate-700/60 text-slate-400 hover:border-indigo-500 hover:text-slate-200';
    if (percentage >= 95) return 'bg-emerald-500 text-slate-950 font-bold border-emerald-400 shadow-sm shadow-emerald-500/20';
    if (percentage >= 85) return 'bg-emerald-600/90 text-white font-semibold border-emerald-400';
    if (percentage >= 70) return 'bg-amber-500/90 text-slate-950 font-semibold border-amber-400';
    return 'bg-rose-600 text-white font-bold border-rose-400 animate-pulse';
  };

  return (
    <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="text-indigo-400 w-5 h-5" />
            <h3 className="text-md font-bold text-slate-100">Kalender Kehadiran & Status Hari Sekolah</h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Sparkles size={11} />
              {filterClass !== 'Semua' ? `Kelas ${filterClass}` : 'Semua Kelas'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Penandaan resmi tanggal absensi yang sudah di-input, tanggal hari libur sekolah/nasional, serta tanggal aktif sekolah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700">
            <button 
              onClick={() => setCurrentYear(prev => prev - 1)}
              className="p-1 rounded-lg hover:text-white hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              title="Tahun Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-200 px-2 font-mono">
              Tahun {currentYear}
            </span>
            <button 
              onClick={() => setCurrentYear(prev => prev + 1)}
              className="p-1 rounded-lg hover:text-white hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              title="Tahun Berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700/80">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Matriks 12 Bulan
            </button>
            <button
              onClick={() => setViewMode('months')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'months' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Fokus Bulan
            </button>
          </div>
        </div>
      </div>

      {/* Summary Badges Banner for School Calendar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Absen Di-input</span>
            <span className="text-lg font-bold text-slate-100">{calendarSummaryStats.totalRecordedDays} Hari</span>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCircle2 size={18} />
          </div>
        </div>

        <div className="bg-slate-900/60 p-3 rounded-xl border border-sky-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider block">Hari Aktif Sekolah</span>
            <span className="text-lg font-bold text-slate-100">{calendarSummaryStats.totalActiveSchoolDays} Hari</span>
          </div>
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
            <Clock size={18} />
          </div>
        </div>

        <div className="bg-slate-900/60 p-3 rounded-xl border border-rose-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">Hari Libur</span>
            <span className="text-lg font-bold text-slate-100">{calendarSummaryStats.totalHolidayDays} Hari</span>
          </div>
          <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
            <Info size={18} />
          </div>
        </div>

        <div className="bg-slate-900/60 p-3 rounded-xl border border-amber-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Belum Di-input</span>
            <span className="text-lg font-bold text-slate-100">{calendarSummaryStats.unrecordedActiveDays} Hari</span>
          </div>
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <AlertTriangle size={18} />
          </div>
        </div>
      </div>

      {/* Heatmap Legend with Filter Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 px-4 py-3 rounded-xl border border-slate-700/60 text-xs">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-indigo-400" />
          <span className="text-slate-300 font-bold">Keterangan & Filter Kalender:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('semua')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              statusFilter === 'semua'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Semua Hari
          </button>
          
          <button
            onClick={() => setStatusFilter('terisi')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              statusFilter === 'terisi'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            ✓ Absen Sudah Di-input
          </button>

          <button
            onClick={() => setStatusFilter('aktif_belum_isi')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              statusFilter === 'aktif_belum_isi'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Hari Aktif (Belum Input)
          </button>

          <button
            onClick={() => setStatusFilter('libur')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              statusFilter === 'libur'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            🏖️ Hari Libur
          </button>
        </div>
      </div>

      {/* View Mode: 12 Month Grid Matrix */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 custom-scrollbar">
          {monthsData.map((m) => {
            return (
              <div key={m.monthIndex} className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60 flex flex-col space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-700/60">
                  <span className="text-xs font-bold text-slate-200 capitalize">{m.name}</span>
                  <button
                    onClick={() => {
                      setSelectedMonth(m.monthIndex);
                      setViewMode('months');
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    Fokus →
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 text-[9px] text-center font-bold text-slate-500 uppercase">
                  <span className="text-rose-400">Mg</span><span>Sn</span><span>Sl</span><span>Rb</span><span>Km</span><span>Jm</span><span className="text-amber-400">Sb</span>
                </div>

                {/* Calendar Days Matrix */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty offsets */}
                  {Array.from({ length: getDay(m.days[0]) }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-full aspect-square opacity-0"></div>
                  ))}

                  {m.days.map((dateObj) => {
                    const dateStr = format(dateObj, 'yyyy-MM-dd');
                    const stat = attendanceByDateMap[dateStr];
                    const hol = checkHoliday(dateObj);
                    const isRecorded = Boolean(stat && stat.total > 0);

                    // Apply status filter
                    if (statusFilter === 'terisi' && !isRecorded) return <div key={dateStr} className="w-full aspect-square bg-slate-950/20 rounded border border-slate-900 opacity-20"></div>;
                    if (statusFilter === 'libur' && !hol.isLibur) return <div key={dateStr} className="w-full aspect-square bg-slate-950/20 rounded border border-slate-900 opacity-20"></div>;
                    if (statusFilter === 'aktif_belum_isi' && (hol.isLibur || isRecorded)) return <div key={dateStr} className="w-full aspect-square bg-slate-950/20 rounded border border-slate-900 opacity-20"></div>;

                    const colorClass = getHeatmapColor(stat?.percentage || 0, isRecorded, hol.isLibur);

                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          setSelectedDayDetail({
                            dateStr,
                            dateObj,
                            stats: stat || { total: 0, hadir: 0, sakit: 0, izin: 0, alpa: 0, percentage: 0 },
                            records: stat?.records || [],
                            isLibur: hol.isLibur,
                            liburDesc: hol.desc
                          });
                        }}
                        className={`w-full aspect-square rounded-md border text-[10px] flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-110 hover:z-10 relative ${colorClass}`}
                        title={`${format(dateObj, 'dd MMMM yyyy', { locale: id })}${hol.isLibur ? ` (HARI LIBUR: ${hol.desc})` : isRecorded ? `: ABSENSUDAH DI-INPUT (${stat.percentage}% Hadir - ${stat.hadir}/${stat.total} Siswa)` : ': Hari Aktif Sekolah (Belum di-input)'}`}
                      >
                        <span className="font-bold">{format(dateObj, 'd')}</span>
                        {isRecorded && !hol.isLibur && (
                          <span className="absolute top-0.5 right-0.5 text-[8px] font-extrabold text-emerald-950">✓</span>
                        )}
                        {hol.isLibur && (
                          <span className="w-1 h-1 rounded-full bg-rose-400 absolute bottom-0.5"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* View Mode: Month Focus View */
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {monthsData.map((m) => (
              <button
                key={m.monthIndex}
                onClick={() => setSelectedMonth(m.monthIndex)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedMonth === m.monthIndex
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-700/70">
            <h4 className="text-sm font-bold text-slate-200 mb-4 capitalize flex items-center justify-between">
              <span>Detail Kalender Kehadiran: {monthsData[selectedMonth]?.name}</span>
              <span className="text-xs text-slate-400 font-normal">Klik pada tanggal untuk melihat rincian absensi</span>
            </h4>

            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
              <span className="text-rose-400">Minggu</span>
              <span>Senin</span>
              <span>Selasa</span>
              <span>Rabu</span>
              <span>Kamis</span>
              <span>Jumat</span>
              <span className="text-amber-400">Sabtu</span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: getDay(monthsData[selectedMonth].days[0]) }).map((_, i) => (
                <div key={`empty-lg-${i}`} className="w-full h-18 opacity-0"></div>
              ))}

              {monthsData[selectedMonth].days.map((dateObj) => {
                const dateStr = format(dateObj, 'yyyy-MM-dd');
                const stat = attendanceByDateMap[dateStr];
                const hol = checkHoliday(dateObj);
                const isRecorded = Boolean(stat && stat.total > 0);

                if (statusFilter === 'terisi' && !isRecorded) return <div key={dateStr} className="w-full h-18 bg-slate-950/20 rounded-xl border border-slate-900 opacity-20"></div>;
                if (statusFilter === 'libur' && !hol.isLibur) return <div key={dateStr} className="w-full h-18 bg-slate-950/20 rounded-xl border border-slate-900 opacity-20"></div>;
                if (statusFilter === 'aktif_belum_isi' && (hol.isLibur || isRecorded)) return <div key={dateStr} className="w-full h-18 bg-slate-950/20 rounded-xl border border-slate-900 opacity-20"></div>;

                const colorClass = getHeatmapColor(stat?.percentage || 0, isRecorded, hol.isLibur);

                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      setSelectedDayDetail({
                        dateStr,
                        dateObj,
                        stats: stat || { total: 0, hadir: 0, sakit: 0, izin: 0, alpa: 0, percentage: 0 },
                        records: stat?.records || [],
                        isLibur: hol.isLibur,
                        liburDesc: hol.desc
                      });
                    }}
                    className={`w-full h-18 rounded-xl border p-2 flex flex-col justify-between text-left transition-all cursor-pointer hover:scale-105 shadow-md ${colorClass}`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span className="font-mono text-sm">{format(dateObj, 'd')}</span>
                      {hol.isLibur ? (
                        <span className="text-[9px] bg-rose-900/80 text-rose-200 border border-rose-500/40 px-1 py-0.5 rounded font-bold">
                          🏖️ Libur
                        </span>
                      ) : isRecorded ? (
                        <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-400 px-1 py-0.5 rounded font-bold flex items-center gap-0.5">
                          ✓ Di-input
                        </span>
                      ) : (
                        <span className="text-[9px] bg-slate-800/80 text-slate-400 border border-slate-700 px-1 py-0.5 rounded font-medium">
                          Hari Aktif
                        </span>
                      )}
                    </div>

                    {isRecorded && !hol.isLibur ? (
                      <div>
                        <div className="text-xs font-extrabold flex items-center justify-between">
                          <span>{stat.percentage}% Hadir</span>
                        </div>
                        <div className="text-[9px] opacity-90">{stat.hadir} dari {stat.total} siswa</div>
                      </div>
                    ) : (
                      <div className="text-[9px] opacity-70 truncate font-medium">
                        {hol.isLibur ? hol.desc : 'Belum ada input absen'}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected Day Detail Modal */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="text-indigo-400 w-5 h-5" />
                <div>
                  <h3 className="text-md font-bold text-slate-100">
                    {format(selectedDayDetail.dateObj, 'EEEE, dd MMMM yyyy', { locale: id })}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Status: {selectedDayDetail.isLibur ? 'HARI LIBUR' : selectedDayDetail.stats.total > 0 ? 'HARI AKTIF - ABSEN SUDAH DI-INPUT' : 'HARI AKTIF - BELUM DI-INPUT'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedDayDetail.isLibur && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2">
                <Info size={16} />
                <span>Hari Libur Sekolah / Akhir Pekan: {selectedDayDetail.liburDesc}</span>
              </div>
            )}

            {!selectedDayDetail.isLibur && selectedDayDetail.stats.total === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>Hari Aktif Sekolah - Belum ada catatan absensi siswa yang di-input pada tanggal ini.</span>
              </div>
            )}

            {selectedDayDetail.stats.total > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl">
                    <span className="block text-[10px] font-bold text-emerald-400 uppercase">Hadir</span>
                    <span className="text-lg font-bold text-emerald-300">{selectedDayDetail.stats.hadir}</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl">
                    <span className="block text-[10px] font-bold text-amber-400 uppercase">Sakit</span>
                    <span className="text-lg font-bold text-amber-300">{selectedDayDetail.stats.sakit}</span>
                  </div>
                  <div className="bg-sky-500/10 border border-sky-500/30 p-2.5 rounded-xl">
                    <span className="block text-[10px] font-bold text-sky-400 uppercase">Izin</span>
                    <span className="text-lg font-bold text-sky-300">{selectedDayDetail.stats.izin}</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl">
                    <span className="block text-[10px] font-bold text-rose-400 uppercase">Alpa</span>
                    <span className="text-lg font-bold text-rose-300">{selectedDayDetail.stats.alpa}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-400">Persentase Kehadiran</span>
                    <span className="text-indigo-400 font-bold">{selectedDayDetail.stats.percentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        selectedDayDetail.stats.percentage >= 95 ? 'bg-emerald-500' :
                        selectedDayDetail.stats.percentage >= 85 ? 'bg-emerald-600' :
                        selectedDayDetail.stats.percentage >= 70 ? 'bg-amber-500' : 'bg-rose-600'
                      }`}
                      style={{ width: `${selectedDayDetail.stats.percentage}%` }}
                    />
                  </div>
                </div>

                {/* Detailed Student List with Non-Hadir status */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Rincian Siswa Tidak Hadir / Absen</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                    {selectedDayDetail.records.filter(r => r.status !== 'Hadir').length === 0 ? (
                      <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-center font-medium">
                        🎉 Semua {selectedDayDetail.stats.total} siswa hadir lengkap pada tanggal ini!
                      </p>
                    ) : (
                      selectedDayDetail.records.filter(r => r.status !== 'Hadir').map(r => {
                        const st = students.find(s => s.id === r.id_siswa);
                        const statusColor = r.status === 'Sakit' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                                           r.status === 'Izin' ? 'text-sky-400 bg-sky-500/10 border-sky-500/30' :
                                           'text-rose-400 bg-rose-500/10 border-rose-500/30';
                        return (
                          <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
                            <span className="font-semibold text-slate-200">{st ? st.nama : 'Siswa'} ({st?.kelas || '-'})</span>
                            <span className={`px-2 py-0.5 rounded font-bold border ${statusColor}`}>
                              {r.status}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">Belum Ada Data Catatan Absensi</p>
                <p className="text-xs text-slate-500 mt-1">Data absensi belum di-input untuk tanggal ini.</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

