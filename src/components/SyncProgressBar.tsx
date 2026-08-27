import React, { useEffect, useState } from 'react';
import { SyncProgressState, getSyncProgressState } from '../lib/sync';
import { Cloud, CheckCircle2, Loader2, Database, ShieldCheck, ArrowUpRight, ArrowDownLeft, RefreshCw, ArrowRight, HardDrive } from 'lucide-react';

interface SyncProgressBarProps {
  compact?: boolean;
  className?: string;
}

const STAGES = [
  { key: 'Connecting', label: '1. Koneksi API', icon: Cloud },
  { key: 'Fetching Data', label: '2. Unduh Cloud', icon: ArrowDownLeft },
  { key: 'Preparing Data', label: '1. Baca DB Lokal', icon: HardDrive },
  { key: 'Validating Schema', label: '2. Validasi Skema', icon: ShieldCheck },
  { key: 'Pushing to Cloud', label: '3. Push ke Cloud', icon: ArrowUpRight },
  { key: 'Writing to Database', label: '3. Update IndexedDB', icon: Database },
  { key: 'Verifying Integrity', label: '4. Verifikasi DB', icon: ShieldCheck },
  { key: 'Finalizing', label: '5. Selesai & Clean', icon: CheckCircle2 }
];

export default function SyncProgressBar({ compact = false, className = '' }: SyncProgressBarProps) {
  const [progress, setProgress] = useState<SyncProgressState>(getSyncProgressState());

  useEffect(() => {
    const handleProgress = (e: CustomEvent<SyncProgressState>) => {
      if (e.detail) {
        setProgress(e.detail);
      }
    };

    window.addEventListener('sync-progress-updated', handleProgress as EventListener);
    return () => {
      window.removeEventListener('sync-progress-updated', handleProgress as EventListener);
    };
  }, []);

  const isPush = progress.direction === 'push';
  const isPull = progress.direction === 'pull';

  if (compact) {
    return (
      <div className={`space-y-2 text-xs ${className}`}>
        <div className="flex justify-between items-center font-semibold">
          <div className="flex items-center gap-1.5 text-indigo-300 truncate max-w-[220px]">
            {progress.isSyncing ? (
              <Loader2 size={13} className="animate-spin text-indigo-400 shrink-0" />
            ) : progress.stage === 'Completed' ? (
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            ) : (
              <Cloud size={13} className="text-slate-400 shrink-0" />
            )}
            <span className="truncate">{progress.stageLabel || (progress.isSyncing ? 'Sinkronisasi...' : 'Tersinkron')}</span>
          </div>
          <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${progress.percent === 100 ? 'text-emerald-400 bg-emerald-500/10' : 'text-indigo-400 bg-indigo-500/10'}`}>
            {progress.percent}%
          </span>
        </div>

        {/* Direction Tag */}
        {progress.isSyncing && (
          <div className="flex items-center gap-1.5 text-[10px] font-medium">
            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
              isPush ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            }`}>
              {isPush ? 'Push ke Cloud' : 'Update IndexedDB'}
            </span>
            <span className="text-slate-400 truncate">{progress.stage}</span>
          </div>
        )}

        {/* Progress Bar Track */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50 relative">
          <div 
            className={`h-full rounded-full transition-all duration-300 relative ${
              progress.stage === 'Completed' ? 'bg-emerald-500' : isPush ? 'bg-gradient-to-r from-amber-500 via-sky-400 to-emerald-400' : 'bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400'
            }`}
            style={{ width: `${Math.max(3, progress.percent)}%` }}
          >
            {progress.isSyncing && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
          </div>
        </div>

        {progress.isSyncing && progress.totalItems && progress.processedItems !== undefined && (
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Progress Item:</span>
            <span className="text-indigo-300 font-semibold">{progress.processedItems} / {progress.totalItems}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-5 bg-slate-900/95 border ${isPush ? 'border-amber-500/40 shadow-amber-900/10' : 'border-indigo-500/40 shadow-indigo-900/10'} rounded-2xl shadow-2xl backdrop-blur-md space-y-4 ${className}`}>
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            isPush 
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
              : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
          }`}>
            {progress.isSyncing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Cloud size={20} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-base text-slate-100">
                {progress.isSyncing ? 'Proses Sinkronisasi Aktif' : 'Status Sinkronisasi'}
              </h4>
              {progress.isSyncing && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                  isPush 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                }`}>
                  {isPush ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                  <span>{isPush ? 'Tahap 1: Push ke Firebase Cloud' : 'Tahap 2: Update IndexedDB Lokal'}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              {progress.stageLabel || 'Menunggu instruksi sinkronisasi data'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-0 border-slate-800">
          {(progress.stageLabel?.includes('Gagal') || progress.stageLabel?.includes('Error')) && (
            <button
              onClick={() => window.dispatchEvent(new Event('trigger-immediate-sync'))}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Coba Lagi</span>
            </button>
          )}
          <div className="text-right">
            <span className={`text-2xl font-bold font-mono ${isPush ? 'text-amber-400' : 'text-indigo-400'}`}>
              {progress.percent}%
            </span>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Kemajuan Status</p>
          </div>
        </div>
      </div>

      {/* Process Flow Visualizer */}
      {progress.isSyncing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
          {/* Source Node */}
          <div className={`p-2.5 rounded-lg border flex items-center justify-between ${
            isPush 
              ? 'bg-amber-950/30 border-amber-500/30 text-amber-200' 
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <div className="flex items-center gap-2">
              <HardDrive size={16} className={isPush ? 'text-amber-400 animate-pulse' : 'text-slate-500'} />
              <div>
                <p className="font-bold text-xs">1. IndexedDB Lokal (Browser)</p>
                <p className="text-[10px] opacity-75">{isPush ? 'Sumber Perubahan Terbaru' : 'Target Pembaruan Data'}</p>
              </div>
            </div>
            {isPush && <ArrowRight size={14} className="text-amber-400 animate-bounce" />}
          </div>

          {/* Destination Node */}
          <div className={`p-2.5 rounded-lg border flex items-center justify-between ${
            isPull 
              ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-200' 
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <div className="flex items-center gap-2">
              <Cloud size={16} className={isPull ? 'text-indigo-400 animate-pulse' : 'text-slate-500'} />
              <div>
                <p className="font-bold text-xs">2. Firebase Firestore (Cloud)</p>
                <p className="text-[10px] opacity-75">{isPull ? 'Sumber Master Cloud' : 'Target Salinan Cloud'}</p>
              </div>
            </div>
            {isPull && <ArrowRight size={14} className="text-indigo-400 animate-bounce" />}
          </div>
        </div>
      )}

      {/* Progress Bar Track */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-800/80 rounded-full h-3.5 overflow-hidden border border-slate-700/60 p-0.5">
          <div 
            className={`h-full rounded-full transition-all duration-300 relative ${
              progress.stage === 'Completed' 
                ? 'bg-emerald-500' 
                : isPush 
                ? 'bg-gradient-to-r from-amber-500 via-sky-400 to-emerald-400' 
                : 'bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400'
            }`}
            style={{ width: `${Math.max(2, progress.percent)}%` }}
          >
            {progress.isSyncing && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
          </div>
        </div>

        {progress.totalItems !== undefined && progress.processedItems !== undefined && progress.totalItems > 0 && (
          <div className="flex justify-between text-[11px] font-mono text-slate-300 px-1 font-semibold">
            <span>Operasi Pembaruan Data</span>
            <span className={isPush ? 'text-amber-300' : 'text-indigo-300'}>
              {progress.processedItems} dari {progress.totalItems} item ({Math.round((progress.processedItems / progress.totalItems) * 100)}%)
            </span>
          </div>
        )}
      </div>

      {/* Detailed Step Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {STAGES.filter(s => {
          if (isPush) {
            return ['Preparing Data', 'Validating Schema', 'Pushing to Cloud', 'Finalizing'].includes(s.key);
          }
          if (isPull) {
            return ['Connecting', 'Fetching Data', 'Writing to Database', 'Verifying Integrity'].includes(s.key);
          }
          return ['Connecting', 'Fetching Data', 'Writing to Database', 'Finalizing'].includes(s.key);
        }).map((s) => {
          const Icon = s.icon;
          const isCurrent = s.key === progress.stage;

          return (
            <div 
              key={s.key}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs transition-all ${
                isCurrent 
                  ? isPush 
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-semibold ring-1 ring-amber-500/30'
                    : 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200 font-semibold ring-1 ring-indigo-500/30'
                  : 'bg-slate-800/40 border-slate-800 text-slate-400'
              }`}
            >
              <div className={`p-1.5 rounded-lg shrink-0 ${
                isCurrent 
                  ? isPush ? 'bg-amber-500 text-white animate-pulse' : 'bg-indigo-500 text-white animate-pulse'
                  : 'bg-slate-800 text-slate-500'
              }`}>
                {isCurrent && progress.isSyncing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Icon size={13} />
                )}
              </div>
              <div className="truncate">
                <p className="truncate text-[11px] font-medium">{s.label}</p>
                <p className="text-[9px] opacity-70 uppercase tracking-tight">
                  {isCurrent ? 'Sedang Berjalan' : 'Tahap'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
