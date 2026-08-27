import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SyncProgressState, getSyncProgressState } from '../lib/sync';
import { Cloud, CheckCircle2, Loader2, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react';

interface SyncProgressToastProps {
  isSyncing?: boolean;
}

export default function SyncProgressToast({ isSyncing }: SyncProgressToastProps) {
  const [progress, setProgress] = useState<SyncProgressState>(getSyncProgressState());
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Dismiss any stale toast custom popups if they exist from previous sessions
    toast.dismiss('global-sync-progress-toast');

    let hideTimeout: NodeJS.Timeout;

    const handleProgress = (e: CustomEvent<SyncProgressState & { isSilent?: boolean; isBackground?: boolean }>) => {
      const detail = e.detail;
      if (!detail) return;

      setProgress(detail);

      // Do not display blocking top screen toast overlay during silent background auto-syncs
      if (detail.isSilent || detail.isBackground) {
        setIsVisible(false);
        return;
      }

      if (detail.isSyncing) {
        setIsVisible(true);
        setIsDismissed(false);
      } else if (detail.stage === 'Completed') {
        setIsVisible(true);
        hideTimeout = setTimeout(() => {
          setIsVisible(false);
        }, 3000);
      } else if (!detail.isSyncing && detail.stage === 'Idle') {
        setIsVisible(false);
      }
    };

    window.addEventListener('sync-progress-updated', handleProgress as EventListener);

    return () => {
      window.removeEventListener('sync-progress-updated', handleProgress as EventListener);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  if (!isVisible || isDismissed) {
    return null;
  }

  const isPush = progress.direction === 'push';
  const isCompleted = progress.stage === 'Completed';

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-slate-950/95 border-b border-indigo-500/50 shadow-xl backdrop-blur-md px-4 py-2 text-slate-100 transition-all animate-slide-down">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
        {/* Left Side: Status & Stage Badge */}
        <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
          <div className={`p-1.5 rounded-lg shrink-0 ${
            isCompleted
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : isPush
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
          }`}>
            {progress.isSyncing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isCompleted ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <Cloud size={16} />
            )}
          </div>

          <div className="flex items-center gap-2 truncate">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
              isCompleted
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : isPush
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            }`}>
              {isCompleted ? (
                <span>Sinkron Selesai</span>
              ) : isPush ? (
                <>
                  <ArrowUpRight size={12} />
                  <span>Push Cloud</span>
                </>
              ) : (
                <>
                  <ArrowDownLeft size={12} />
                  <span>Update IndexedDB</span>
                </>
              )}
            </span>

            <span className="font-medium text-slate-200 truncate text-[11px]">
              {progress.stageLabel || 'Memproses data...'}
            </span>
          </div>
        </div>

        {/* Center & Right Side: Progress Bar + Stats + Granular Details + Dismiss */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0 flex-wrap sm:flex-nowrap">
          {/* Granular details counter badge if present */}
          {progress.totalItems !== undefined && progress.processedItems !== undefined && progress.totalItems > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] font-bold shadow-sm shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>
                {isPush ? 'Mengunggah' : progress.direction === 'pull' ? 'Mengunduh' : 'Menyinkronkan'} {progress.processedItems}/{progress.totalItems} item
              </span>
            </div>
          )}

          {/* Progress Bar */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[140px]">
            <div className="w-full sm:w-48 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/60 relative shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-300 relative ${
                  isCompleted
                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                    : isPush
                    ? 'bg-gradient-to-r from-amber-500 via-sky-400 to-emerald-400'
                    : 'bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
              >
                {progress.isSyncing && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                )}
              </div>
            </div>

            <span className={`font-mono text-xs font-bold w-10 text-right shrink-0 ${
              isCompleted ? 'text-emerald-400' : 'text-indigo-300'
            }`}>
              {Math.min(100, Math.max(0, progress.percent))}%
            </span>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
            title="Sembunyikan Bar Sinkronisasi"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

