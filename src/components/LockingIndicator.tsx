import React, { useEffect, useState } from 'react';
import { Lock, ShieldAlert, UserCheck } from 'lucide-react';
import { DocumentLock, getActiveDocumentLock } from '../lib/documentLock';

interface LockingIndicatorProps {
  entityType: string;
  entityId: string;
  variant?: 'badge' | 'banner' | 'inline' | 'icon';
  className?: string;
}

export const LockingIndicator: React.FC<LockingIndicatorProps> = ({
  entityType,
  entityId,
  variant = 'badge',
  className = ''
}) => {
  const [lock, setLock] = useState<DocumentLock | null>(null);

  useEffect(() => {
    const checkLock = () => {
      if (entityType && entityId) {
        setLock(getActiveDocumentLock(entityType, entityId));
      } else {
        setLock(null);
      }
    };

    checkLock();

    const handleLocksChanged = () => checkLock();
    window.addEventListener('document-locks-changed', handleLocksChanged);

    // Re-check periodically every 5 seconds to handle expired locks automatically
    const interval = setInterval(checkLock, 5000);

    return () => {
      window.removeEventListener('document-locks-changed', handleLocksChanged);
      clearInterval(interval);
    };
  }, [entityType, entityId]);

  if (!lock) return null;

  if (variant === 'icon') {
    return (
      <span 
        title={`Sedang diedit oleh @${lock.lockedBy.username} (${lock.lockedBy.name})`}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 animate-pulse ${className}`}
      >
        <Lock size={12} />
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`p-3.5 bg-amber-950/90 border border-amber-500/50 rounded-xl text-amber-200 text-xs shadow-lg backdrop-blur-md flex items-start gap-3 animate-fade-in ${className}`}>
        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg flex-shrink-0">
          <Lock size={18} className="animate-pulse" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <span>DOKUMEN TERKUNCI SEMENTARA</span>
            <span className="px-2 py-0.5 bg-amber-500/30 border border-amber-400/40 rounded-full text-[10px] uppercase font-mono tracking-wider">
              Real-time Edit
            </span>
          </div>
          <p className="text-amber-200/90 leading-relaxed">
            Pengguna <strong className="text-amber-100 font-semibold">@{lock.lockedBy.username}</strong> ({lock.lockedBy.name}) sedang aktif mengedit data ini. Mode simpan dibatasi sementara untuk mencegah tumpang tindih data.
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium ${className}`}>
        <Lock size={13} className="animate-pulse flex-shrink-0" />
        <span>Diedit oleh <strong>@{lock.lockedBy.username}</strong></span>
      </span>
    );
  }

  // Default 'badge'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-semibold shadow-sm animate-pulse ${className}`}>
      <Lock size={12} className="text-amber-400 flex-shrink-0" />
      <span>Sedang diedit: <strong className="text-amber-200 font-bold">@{lock.lockedBy.username}</strong> ({lock.lockedBy.name})</span>
    </span>
  );
};

export default LockingIndicator;
