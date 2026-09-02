import React, { useState, useEffect } from 'react';
import { store, Settings, defaultSettings, Student } from '../lib/store';
import { syncAndGetClasses } from '../lib/classHelper';
import { Layers, Plus, Trash2, Edit2, Check, RefreshCw, School, ArrowUp, ArrowDown, GraduationCap } from 'lucide-react';
import NaikKelasModal from './NaikKelasModal';
import toast from 'react-hot-toast';

export default function ClassManagement() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [classList, setClassList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [classToDeleteIndex, setClassToDeleteIndex] = useState<number | null>(null);
  const [isNaikKelasOpen, setIsNaikKelasOpen] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const s = await store.settings.getItem<Settings>('app_settings');
      if (s) {
        setSettings(s);
      }
      const syncedClasses = await syncAndGetClasses();
      setClassList(syncedClasses);
    } catch (err) {
      console.error('Failed to load settings in ClassManagement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();

    const handleDataChanged = () => {
      loadSettings();
    };
    window.addEventListener('data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('data-changed', handleDataChanged);
    };
  }, []);

  const saveClasses = async (updatedList: string[]) => {
    const updatedSettings: Settings = {
      ...settings,
      daftar_kelas: updatedList
    };
    try {
      setSettings(updatedSettings);
      setClassList(updatedList);
      await store.settings.setItem('app_settings', updatedSettings);
      await store.syncQueue.setItem('settings::app_settings', 'updated');

      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
      toast.success('Daftar kelas/rombel berhasil diperbarui');
    } catch (err) {
      toast.error('Gagal menyimpan daftar kelas');
    }
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newClassName.trim().toUpperCase();
    if (!cleanName) {
      toast.error('Nama kelas tidak boleh kosong');
      return;
    }

    if (classList.map(c => c.toLowerCase()).includes(cleanName.toLowerCase())) {
      toast.error(`Kelas "${cleanName}" sudah ada di dalam daftar`);
      return;
    }

    const next = [...classList, cleanName];
    setNewClassName('');
    saveClasses(next);
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(classList[index]);
  };

  const handleSaveEdit = (index: number) => {
    const cleanValue = editingValue.trim().toUpperCase();
    if (!cleanValue) {
      toast.error('Nama kelas tidak boleh kosong');
      return;
    }

    const next = [...classList];
    next[index] = cleanValue;
    setEditingIndex(null);
    setEditingValue('');
    saveClasses(next);
  };

  const handleDeleteClass = async (index: number) => {
    if (classList.length <= 1) {
      toast.error('Minimal harus ada 1 kelas di dalam sistem');
      return;
    }

    const className = classList[index];
    if (!className) return;

    // Check if any student belongs to this class
    let studentCount = 0;
    try {
      await store.students.iterate<Student, void>((val) => {
        if (val && val.kelas && val.kelas.trim().toLowerCase() === className.trim().toLowerCase()) {
          studentCount++;
        }
      });
    } catch (err) {
      console.error('Error checking students in class:', err);
    }

    if (studentCount > 0) {
      toast.error(
        `Kelas "${className}" tidak dapat dihapus karena masih ada ${studentCount} siswa terdaftar dalam kelas tersebut. Pindahkan atau hapus siswa di kelas ini terlebih dahulu.`,
        { duration: 5000 }
      );
      return;
    }

    setClassToDeleteIndex(index);
  };

  const handleConfirmDeleteClass = () => {
    if (classToDeleteIndex === null) return;
    const next = classList.filter((_, i) => i !== classToDeleteIndex);
    setClassToDeleteIndex(null);
    saveClasses(next);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === classList.length - 1) return;

    const next = [...classList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    saveClasses(next);
  };

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <Layers size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Kelola Daftar Kelas / Rombel Sekolah</span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                {classList.length} Kelas Aktif
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tambah, edit, atau hapus kelas. Data ruang/kelas ini akan secara otomatis digunakan pada penugasan Wali Kelas & Guru Mapel.
            </p>
          </div>
        </div>

        <button
          onClick={loadSettings}
          className="p-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors cursor-pointer self-start sm:self-auto"
          title="Segarkan Data Kelas"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Promotion System Banner Card */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-emerald-950/60 border border-emerald-500/30 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Sistem Kenaikan Kelas & Kelulusan Massal</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                Fitur Baru
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              Promosikan siswa dari kelas asal ke kelas tujuan atau kelulusan alumni secara kolektif dengan 1-klik
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsNaikKelasOpen(true)}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
        >
          <GraduationCap className="w-4 h-4" />
          <span>Buka Sistem Naik Kelas</span>
        </button>
      </div>

      {/* Add New Class Form */}
      <form onSubmit={handleAddClass} className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <School size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder="Contoh: 7-C, 10-MIPA-1, 12-IPS-2..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-semibold"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>Tambah Kelas Baru</span>
        </button>
      </form>

      {/* Class List Table / Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {classList.map((cls, idx) => (
          <div
            key={`${cls}-${idx}`}
            className="bg-slate-900/60 border border-slate-700/70 hover:border-indigo-500/40 p-3.5 rounded-xl flex items-center justify-between gap-3 transition-all group"
          >
            {editingIndex === idx ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  className="w-full px-2.5 py-1 bg-slate-950 border border-indigo-500 rounded-lg text-xs font-bold text-white uppercase outline-none"
                  autoFocus
                />
                <button
                  onClick={() => handleSaveEdit(idx)}
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer"
                  title="Simpan"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-xs border border-indigo-500/30">
                  {cls.slice(0, 3)}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100 uppercase">{cls}</h4>
                  <p className="text-[10px] text-slate-400">Rombel Belajar Sekolah</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleMove(idx, 'up')}
                disabled={idx === 0}
                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                title="Geser Ke Atas"
              >
                <ArrowUp size={13} />
              </button>

              <button
                onClick={() => handleMove(idx, 'down')}
                disabled={idx === classList.length - 1}
                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                title="Geser Ke Bawah"
              >
                <ArrowDown size={13} />
              </button>

              <button
                onClick={() => handleStartEdit(idx)}
                className="p-1 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                title="Edit Nama Kelas"
              >
                <Edit2 size={13} />
              </button>

              <button
                onClick={() => handleDeleteClass(idx)}
                className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Hapus Kelas"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Confirm Hapus Kelas */}
      {classToDeleteIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 text-center my-auto max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Konfirmasi Hapus Kelas</h3>
              <p className="text-xs text-slate-300 mt-2">
                Apakah Anda yakin ingin menghapus Rombel/Kelas <strong className="text-indigo-300 font-bold">"{classList[classToDeleteIndex]}"</strong>?
              </p>
              <p className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 mt-3 font-medium">
                ✓ Kelas ini tidak memiliki siswa terdaftar dan aman untuk dihapus.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setClassToDeleteIndex(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteClass}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg cursor-pointer"
              >
                Ya, Hapus Kelas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Naik Kelas Modal */}
      <NaikKelasModal
        isOpen={isNaikKelasOpen}
        onClose={() => setIsNaikKelasOpen(false)}
        onSuccess={() => loadSettings()}
      />
    </div>
  );
}
