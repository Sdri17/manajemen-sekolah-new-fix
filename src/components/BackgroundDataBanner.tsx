import React, { useState, useEffect } from 'react';
import { RefreshCw, Bell, AlertCircle } from 'lucide-react';

interface BackgroundDataBannerProps {
  collectionName?: string;
  onRefresh?: () => void;
  className?: string;
}

export default function BackgroundDataBanner({ collectionName, onRefresh, className = '' }: BackgroundDataBannerProps) {
  const [updateInfo, setUpdateInfo] = useState<{ count: number; collections: string[] }>({ count: 0, collections: [] });

  useEffect(() => {
    const handleBuffered = (e: CustomEvent<any>) => {
      if (e.detail) {
        const { count, collections } = e.detail;
        if (!collectionName || (collections && (collections.includes(collectionName) || collections.includes('all')))) {
          setUpdateInfo({ count: count || 0, collections: collections || [] });
        }
      }
    };

    window.addEventListener('remote-data-buffered' as any, handleBuffered as EventListener);
    return () => {
      window.removeEventListener('remote-data-buffered' as any, handleBuffered as EventListener);
    };
  }, [collectionName]);

  if (updateInfo.count <= 0) return null;

  const handleApply = () => {
    setUpdateInfo({ count: 0, collections: [] });
    if (onRefresh) {
      onRefresh();
    } else {
      window.dispatchEvent(new CustomEvent('apply-buffered-data'));
      window.dispatchEvent(new Event('data-changed'));
    }
  };

  return (
    <div className={`mb-4 p-3 bg-indigo-950/80 border border-indigo-500/40 rounded-xl text-indigo-200 text-xs flex items-center justify-between shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-400"></span>
        </span>
        <div className="flex items-center gap-1.5">
          <Bell size={14} className="text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-100">
            Ada data terbaru dari pengguna lain ({updateInfo.count} pembaruan)
          </span>
        </div>
      </div>
      <button
        onClick={handleApply}
        type="button"
        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
      >
        <RefreshCw size={13} />
        <span>Perbarui Tampilan</span>
      </button>
    </div>
  );
}
