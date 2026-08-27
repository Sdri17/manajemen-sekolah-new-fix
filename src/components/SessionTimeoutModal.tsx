import React from 'react';
import { ShieldAlert, Clock, RefreshCw, LogOut } from 'lucide-react';

interface SessionTimeoutModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  onExtendSession: () => void;
  onLogoutNow: () => void;
}

export default function SessionTimeoutModal({
  isOpen,
  remainingSeconds,
  onExtendSession,
  onLogoutNow
}: SessionTimeoutModalProps) {
  if (!isOpen) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Decorative Top Ambient Light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 rounded-b-full"></div>

        <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
            <ShieldAlert size={20} className="text-amber-400" />
            <span>Peringatan Sesi Berakhir</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Sistem mendeteksi tidak ada aktivitas pengguna untuk beberapa waktu. Untuk menjaga keamanan data sekolah, sesi Anda akan secara otomatis dikeluarkan dalam:
          </p>
        </div>

        {/* Live Countdown Display */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-center space-y-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Sisa Waktu Sesi Aktif</span>
          <div className="text-4xl font-extrabold font-mono text-amber-400 tracking-wider">
            {formattedTime}
          </div>
          <p className="text-[11px] text-slate-500">
            Pergerakan kursor atau penekanan tombol akan memulihkan sesi Anda.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onLogoutNow}
            className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut size={16} />
            <span>Keluar Sekarang</span>
          </button>
          <button
            type="button"
            onClick={onExtendSession}
            className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw size={16} />
            <span>Perpanjang Sesi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
