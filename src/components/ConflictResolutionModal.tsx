import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  GitCompare, 
  Smartphone, 
  Cloud, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  FileText, 
  Layers,
  ArrowRight,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  SyncConflictItem, 
  subscribeToSyncConflicts, 
  resolveSyncConflict, 
  resolveAllSyncConflicts,
  getDifferingFields
} from '../lib/firebaseSync';

interface ConflictResolutionModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function ConflictResolutionModal({ isOpen, onClose }: ConflictResolutionModalProps) {
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    const unsubscribe = subscribeToSyncConflicts((latestConflicts) => {
      setConflicts(latestConflicts);
      if (selectedIndex >= latestConflicts.length) {
        setSelectedIndex(Math.max(0, latestConflicts.length - 1));
      }
    });
    return () => unsubscribe();
  }, [selectedIndex]);

  if (conflicts.length === 0) {
    return null;
  }

  const currentConflict = conflicts[selectedIndex] || conflicts[0];
  if (!currentConflict) return null;

  const { collectionName, docId, documentTitle, localData, serverData, detectedAt } = currentConflict;
  const differingFields = getDifferingFields(localData, serverData);

  const handleResolve = async (choice: 'local' | 'server') => {
    setIsResolving(true);
    try {
      const success = await resolveSyncConflict(currentConflict.id, choice);
      if (success) {
        toast.success(
          choice === 'local' 
            ? 'Versi Lokal Dipertahankan & Disinkronkan ke Cloud!' 
            : 'Versi Server Diterima & Diperbarui di Perangkat ini!'
        );
      } else {
        toast.error('Gagal menyelesaikan konflik data.');
      }
    } catch (err: any) {
      toast.error('Error saat memilih solusi: ' + (err?.message || String(err)));
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolveAll = async (choice: 'local' | 'server') => {
    setIsResolving(true);
    try {
      const total = await resolveAllSyncConflicts(choice);
      toast.success(
        choice === 'local'
          ? `${total} konflik berhasil diselesaikan dengan Versi Lokal!`
          : `${total} konflik berhasil diselesaikan dengan Versi Server!`
      );
      if (onClose) onClose();
    } catch (err: any) {
      toast.error('Gagal menyelesaikan semua konflik: ' + (err?.message || String(err)));
    } finally {
      setIsResolving(false);
    }
  };

  const formatFieldValue = (val: any): string => {
    if (val === null || val === undefined) return '(Kosong)';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Extract all unique display keys between local and server data
  const allKeys = Array.from(new Set([
    ...Object.keys(localData || {}),
    ...Object.keys(serverData || {})
  ])).filter(key => !['_startupCheck', 'checkedAt'].includes(key));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 shrink-0 shadow-inner">
              <GitCompare size={26} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Resolusi Konflik Data Multi-Device
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {conflicts.length} Dokumen Bentrok
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Terdeteksi perbedaan data antara perangkat lokal ini dan server Cloud akibat editan simultaneous di perangkat lain.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {conflicts.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  disabled={selectedIndex === 0}
                  onClick={() => setSelectedIndex(prev => prev - 1)}
                  className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  title="Sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-slate-300 px-2">
                  {selectedIndex + 1} / {conflicts.length}
                </span>
                <button
                  type="button"
                  disabled={selectedIndex === conflicts.length - 1}
                  onClick={() => setSelectedIndex(prev => prev + 1)}
                  className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  title="Selanjutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                title="Tutup Modal"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Document Metadata Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-lg font-mono font-semibold uppercase">
              {collectionName}
            </span>
            <span className="font-bold text-slate-200">
              {documentTitle || docId}
            </span>
            <span className="text-slate-500">ID: {docId}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Terdeteksi: <strong className="text-slate-300">{detectedAt}</strong>
            </span>
            
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                  viewMode === 'cards' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tampilan Kartu
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                  viewMode === 'table' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tabel Perbandingan
              </button>
            </div>
          </div>
        </div>

        {/* Main Comparison Area */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          
          {differingFields.length > 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <span>
                  Ditemukan <strong>{differingFields.length} bidang/kolom yang berbeda</strong> antara versi lokal & server:
                </span>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {differingFields.map(f => (
                  <span key={f} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-mono text-[10px] rounded border border-amber-500/30 font-bold">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'cards' ? (
            /* Side-by-Side Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Local Version Card */}
              <div className="bg-slate-950/80 rounded-2xl border-2 border-indigo-500/40 p-4 space-y-4 relative group hover:border-indigo-500 transition-all shadow-lg shadow-indigo-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        Versi Lokal <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">Perangkat Ini</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">Tersimpan di IndexedDB browser lokal</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/60 px-2 py-1 rounded border border-indigo-500/30 font-semibold">
                    {localData?.updatedAt ? new Date(localData.updatedAt).toLocaleTimeString('id-ID') : 'Draft Lokal'}
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {allKeys.map((key) => {
                    const localVal = localData?.[key];
                    const serverVal = serverData?.[key];
                    const isDifferent = differingFields.includes(key);

                    return (
                      <div 
                        key={key} 
                        className={`p-2.5 rounded-xl border text-xs transition-all ${
                          isDifferent 
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-100 font-medium' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className={`font-mono ${isDifferent ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                            {key}
                          </span>
                          {isDifferent && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold uppercase">
                              Berbeda
                            </span>
                          )}
                        </div>
                        <div className="font-sans text-xs break-all leading-relaxed">
                          {formatFieldValue(localVal)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={isResolving}
                  onClick={() => handleResolve('local')}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Smartphone size={16} />
                  <span>Pertahankan Versi Lokal Ini</span>
                </button>
              </div>

              {/* Server Version Card */}
              <div className="bg-slate-950/80 rounded-2xl border-2 border-emerald-500/40 p-4 space-y-4 relative group hover:border-emerald-500 transition-all shadow-lg shadow-emerald-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                      <Cloud size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        Versi Server <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Cloud Firebase</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">Versi terbaru yang diterima dari database Cloud</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30 font-semibold">
                    {serverData?.updatedAt ? new Date(serverData.updatedAt).toLocaleTimeString('id-ID') : 'Server Snapshot'}
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {allKeys.map((key) => {
                    const serverVal = serverData?.[key];
                    const isDifferent = differingFields.includes(key);

                    return (
                      <div 
                        key={key} 
                        className={`p-2.5 rounded-xl border text-xs transition-all ${
                          isDifferent 
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-100 font-medium' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className={`font-mono ${isDifferent ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                            {key}
                          </span>
                          {isDifferent && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold uppercase">
                              Berbeda
                            </span>
                          )}
                        </div>
                        <div className="font-sans text-xs break-all leading-relaxed">
                          {formatFieldValue(serverVal)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={isResolving}
                  onClick={() => handleResolve('server')}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Cloud size={16} />
                  <span>Terima Versi Server Ini</span>
                </button>
              </div>

            </div>
          ) : (
            /* Tabular Detailed View */
            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Nama Field</th>
                      <th className="py-3 px-4 text-indigo-300">Versi Lokal (Perangkat Ini)</th>
                      <th className="py-3 px-4 text-emerald-300">Versi Server (Cloud)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {allKeys.map((key) => {
                      const localVal = localData?.[key];
                      const serverVal = serverData?.[key];
                      const isDifferent = differingFields.includes(key);

                      return (
                        <tr key={key} className={isDifferent ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-900/40'}>
                          <td className="py-3 px-4 font-mono text-xs font-bold text-slate-300">
                            {key}
                          </td>
                          <td className={`py-3 px-4 font-mono break-all ${isDifferent ? 'text-indigo-300 font-semibold' : 'text-slate-400'}`}>
                            {formatFieldValue(localVal)}
                          </td>
                          <td className={`py-3 px-4 font-mono break-all ${isDifferent ? 'text-emerald-300 font-semibold' : 'text-slate-400'}`}>
                            {formatFieldValue(serverVal)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isDifferent ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Beda
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800">
                                Identik
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Sliders size={16} className="text-amber-400" />
            <span>
              Pilih salah satu versi di atas untuk menyelaraskan data multi-device.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {conflicts.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={isResolving}
                  onClick={() => handleResolveAll('local')}
                  className="px-3 py-2 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  Semua Lokal ({conflicts.length})
                </button>
                <button
                  type="button"
                  disabled={isResolving}
                  onClick={() => handleResolveAll('server')}
                  className="px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  Semua Server ({conflicts.length})
                </button>
              </>
            )}

            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve('local')}
              className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Smartphone size={14} />
              <span>Gunakan Lokal</span>
            </button>

            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve('server')}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Cloud size={14} />
              <span>Gunakan Server</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
