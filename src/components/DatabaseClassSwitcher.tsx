import React, { useState, useEffect } from 'react';
import { Database, ArrowRightLeft, Check, Sparkles, AlertCircle, Info, RefreshCw, Shield, Layers } from 'lucide-react';
import { getActiveDatabaseId, switchFirestoreDatabase } from '../lib/firebase';
import toast from 'react-hot-toast';

export default function DatabaseClassSwitcher() {
  const [activeDbId, setActiveDbId] = useState<string>(() => getActiveDatabaseId());
  const [inputDbId, setInputDbId] = useState<string>(activeDbId);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setActiveDbId(getActiveDatabaseId());
  }, []);

  const handleApplySwitch = (targetDbId: string) => {
    const cleanId = targetDbId.trim() || '(default)';
    if (cleanId === activeDbId) {
      toast.success(`Aplikasi sudah terhubung ke Database ID: "${cleanId}"`);
      return;
    }

    setIsChanging(true);
    toast.loading(`Memindahkan koneksi aplikasi ke Database ID "${cleanId}"...`, { id: 'switch-db' });

    try {
      switchFirestoreDatabase(cleanId);
      setActiveDbId(cleanId);
      toast.success(`Berhasil berpindah ke Database ID "${cleanId}"! Memuat ulang data...`, { id: 'switch-db', duration: 4000 });
      
      setTimeout(() => {
        setIsChanging(false);
        window.dispatchEvent(new Event('trigger-immediate-sync'));
        window.dispatchEvent(new Event('data-changed'));
      }, 300);
    } catch (err: any) {
      toast.error(`Gagal berpindah database: ${err?.message || 'Error'}`, { id: 'switch-db' });
      setIsChanging(false);
    }
  };

  const presetDatabases = [
    { id: '(default)', label: 'Database Utama / Default', desc: 'Database utama sekolah' },
    { id: 'db-kelas-7a', label: 'Database Kelas 7-A', desc: 'Isolasi data khusus Rombel 7-A' },
    { id: 'db-kelas-7b', label: 'Database Kelas 7-B', desc: 'Isolasi data khusus Rombel 7-B' },
    { id: 'db-kelas-8a', label: 'Database Kelas 8-A', desc: 'Isolasi data khusus Rombel 8-A' },
    { id: 'db-kelas-8b', label: 'Database Kelas 8-B', desc: 'Isolasi data khusus Rombel 8-B' },
    { id: 'db-kelas-9a', label: 'Database Kelas 9-A', desc: 'Isolasi data khusus Rombel 9-A' },
  ];

  return (
    <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-700/60">
        <div>
          <div className="flex items-center gap-2">
            <Database className="text-indigo-400" size={24} />
            <h3 className="text-lg font-bold text-slate-100">Manajemen & Switcher Database Kelas</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Fitur isolasi data agar setiap Wali Kelas dapat menggunakan database terpisah tanpa mencampur data antar kelas.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-indigo-950/80 border border-indigo-500/40 px-3 py-1.5 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-semibold text-slate-300">Database Aktif:</span>
          <span className="text-xs font-mono font-bold text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-indigo-500/30">
            {activeDbId}
          </span>
        </div>
      </div>

      {/* Database Preset Grid */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
          Pilih / Switch Database Kelas (Quick Presets)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {presetDatabases.map((preset) => {
            const isSelected = activeDbId === preset.id;
            return (
              <button
                type="button"
                key={preset.id}
                onClick={() => {
                  setInputDbId(preset.id);
                  handleApplySwitch(preset.id);
                }}
                disabled={isChanging}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                  isSelected
                    ? 'bg-indigo-950/60 border-indigo-500/80 text-slate-100 ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-950/50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full">
                    <Check size={12} /> Terhubung
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                    <Layers size={14} className={isSelected ? 'text-indigo-400' : 'text-slate-400'} />
                    {preset.label}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">{preset.desc}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px] font-mono text-slate-500">
                  <span>ID: {preset.id}</span>
                  {!isSelected && <span className="text-indigo-400 hover:underline flex items-center gap-0.5"><ArrowRightLeft size={10} /> Pindah</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Database ID Input */}
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-3">
        <label className="block text-xs font-semibold text-slate-300">
          Kustom Database ID Firestore
        </label>
        <p className="text-xs text-slate-400">
          Jika Anda membuat database khusus tambahan di Firebase Console (misal: <code className="text-indigo-300 font-mono">db-kelas-7c</code> atau <code className="text-indigo-300 font-mono">db-sd-juara</code>), masukkan ID-nya di bawah ini:
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={inputDbId}
            onChange={(e) => setInputDbId(e.target.value)}
            placeholder="Contoh: db-kelas-7c"
            className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => handleApplySwitch(inputDbId)}
            disabled={isChanging || !inputDbId.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isChanging ? 'animate-spin' : ''} />
            <span>Terapkan Database ID</span>
          </button>
        </div>
      </div>

      {/* Explanation Guide / Best Practices for Multi-Wali Kelas */}
      <div className="bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-xl text-xs space-y-3">
        <div className="flex items-center gap-2 text-indigo-300 font-bold">
          <Info size={16} />
          <span>3 Panduan Arsitektur Menggunakan Aplikasi Ini untuk Banyak Wali Kelas:</span>
        </div>
        <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed pl-1">
          <li>
            <strong className="text-indigo-200">Metode Multi-Database ID (Rekomendasi Utama):</strong> Setiap wali kelas membuat / memilih Database ID khusus di Firebase Console (seperti <code className="text-indigo-300 font-mono">db-kelas-7a</code>). Data antarkelas 100% terpisah dan tidak ada risiko tertukar.
          </li>
          <li>
            <strong className="text-indigo-200">Metode Isolasi Filter Rombel (1 Database Bersama):</strong> Menggunakan 1 database utama, namun setiap Wali Kelas diberi Akun/Rombel khusus (misal Rombel "7-A") dan menggunakan Filter Kelas di Dashboard untuk mengelola siswanya sendiri.
          </li>
          <li>
            <strong className="text-indigo-200">Metode Multi-Deploy (File Configuration Berbeda):</strong> Deploy aplikasi ini ke URL / domain terpisah untuk setiap wali kelas dengan berkas <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> masing-masing.
          </li>
        </ol>
      </div>
    </div>
  );
}
