import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';

interface PendingBadgeProps {
  isPending: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
}

export const PendingBadge: React.FC<PendingBadgeProps> = ({
  isPending,
  compact = false,
  label = 'Pending',
  className = ''
}) => {
  if (!isPending) return null;

  if (compact) {
    return (
      <span 
        title="Data tersimpan di perangkat lokal & sedang antre untuk sinkronisasi ke Firebase Cloud"
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm shrink-0 ${className}`}
      >
        <Clock size={11} className="animate-pulse" />
      </span>
    );
  }

  return (
    <span 
      title="Data tersimpan di perangkat lokal & sedang antre untuk sinkronisasi latar belakang ke Firebase Cloud"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-sm shrink-0 ${className}`}
    >
      <Clock size={12} className="text-amber-400 animate-pulse shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export default PendingBadge;
