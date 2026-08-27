import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CloudUpload, 
  CloudDownload, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Database,
  Info,
  Clock,
  Layers,
  Sparkles,
  Zap
} from 'lucide-react';
import { store } from '../lib/store';
import { 
  getFirebaseStatus, 
  getLatencySummary, 
  pushAllLocalDataToFirebase, 
  pullAllRemoteDataFromFirebase 
} from '../lib/firebaseSync';
import { getSyncProgressState, SyncProgressState } from '../lib/sync';
import toast from 'react-hot-toast';

interface QueueItem {
  key: string;
  storeName: string;
  docId: string;
  action: 'updated' | 'deleted' | string;
}

interface ManualSyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

const COLLECTION_LABELS: Record<string, string> = {
  students: 'Data Siswa',
  grades: 'Nilai & Capaian',
  attendance: 'Absensi & Kehadiran',
  roster: 'Roster Pelajaran',
  piket: 'Jadwal Piket',
  raporCapaian: 'Capaian Rapor',
  kas: 'Kas Kelas',
  kasLogs: 'Log Kas',
  tasks: 'Tugas Kelas',
  jurnal: 'Jurnal KBM Guru',
  users: 'Pengguna & Akses',
  settings: 'Pengaturan Sekolah'
};

export const ManualSyncQueueModal: React.FC<ManualSyncQueueModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressState>(getSyncProgressState());
  const [fbStatus, setFbStatus] = useState(getFirebaseStatus());
  const [latencyInfo, setLatencyInfo] = useState(getLatencySummary());
  const [lastPushError, setLastPushError] = useState<string | null>(null);

  // Load pending queue items from store.syncQueue
  const loadQueue = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const keys = await store.syncQueue.keys();
      const items: QueueItem[] = await Promise.all(
        keys.map(async (key) => {
          const parts = key.split('::');
          const val = await store.syncQueue.getItem<string>(key);
          return {
            key,
            storeName: parts[0] || 'Lainnya',
            docId: parts[1] || 'Unknown',
            action: typeof val === 'string' ? val : 'updated'
          };
        })
      );
      setQueueItems(items);
    } catch (e) {
      console.error('[ManualSyncQueueModal] Failed to load queue:', e);
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    loadQueue();
    setFbStatus(getFirebaseStatus());
    setLatencyInfo(getLatencySummary());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleFbStatusChanged = () => setFbStatus(getFirebaseStatus());
    const handleSyncStatusChanged = () => loadQueue();
    const handleProgressUpdated = (e: CustomEvent<SyncProgressState>) => {
      setSyncProgress(e.detail);
      if (e.detail.isSyncing) {
        setIsSyncing(true);
      } else {
        setIsSyncing(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('firebase-status-changed', handleFbStatusChanged);
    window.addEventListener('sync-status-changed', handleSyncStatusChanged);
    window.addEventListener('sync-progress-updated', handleProgressUpdated as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('firebase-status-changed', handleFbStatusChanged);
      window.removeEventListener('sync-status-changed', handleSyncStatusChanged);
      window.removeEventListener('sync-progress-updated', handleProgressUpdated as EventListener);
    };
  }, [isOpen, loadQueue]);

  if (!isOpen) return null;

  // Execute manual push to cloud
  const handlePushManual = async () => {
    if (!navigator.onLine) {
      toast.error('Perangkat Offline! Hubungkan ke internet terlebih dahulu.');
      return;
    }

    setIsSyncing(true);
    setLastPushError(null);
    const toastId = toast.loading('Mengunggah antrean data lokal ke Cloud Firestore...');

    try {
      const result = await pushAllLocalDataToFirebase(true, false);
      if (result.success) {
        toast.success(result.message || 'Sinkronisasi manual berhasil!', { id: toastId });
        await loadQueue();
        if (onSyncComplete) onSyncComplete();
      } else {
        setLastPushError(result.message);
        toast.error(result.message || 'Sinkronisasi gagal.', { id: toastId });
      }
    } catch (err: any) {
      const msg = err?.message || 'Terjadi kesalahan tidak terduga saat pengunggahan data.';
      setLastPushError(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  // Execute manual pull from cloud
  const handlePullManual = async () => {
    if (!navigator.onLine) {
      toast.error('Perangkat Offline! Hubungkan ke internet terlebih dahulu.');
      return;
    }

    setIsSyncing(true);
    const toastId = toast.loading('Mengambil data terbaru dari Cloud Firestore...');

    try {
      await pullAllRemoteDataFromFirebase(true, false);
      toast.success('Berhasil memperbarui data lokal dari cloud!', { id: toastId });
      await loadQueue();
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengambil data dari cloud.', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  // Remove single queue item
  const handleRemoveQueueItem = async (itemKey: string) => {
    try {
      await store.syncQueue.removeItem(itemKey);
      toast.success('Item berhasil dihapus dari antrean pending');
      await loadQueue();
    } catch (e) {
      toast.error('Gagal menghapus item dari antrean');
    }
  };

  // Clear entire queue
  const handleClearAllQueue = async () => {
    if (window.confirm('Apakah Anda yakin ingin mengosongkan seluruh antrean pending? Tindakan ini akan membatalkan pengunggahan data lokal yang belum tersimpan di Cloud.')) {
      try {
        await store.syncQueue.clear();
        toast.success('Seluruh antrean pending telah dikosongkan.');
        await loadQueue();
      } catch (e) {
        toast.error('Gagal mengosongkan antrean.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                Pusat Antrean & Ketangguhan Offline
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                  v2.5
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Monitoring status koneksi, antrean lokal (IndexedDB), dan instruksi push/pull manual.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Status Network & Sync Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Network Connection Status */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              isOnline 
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Jaringan Internet</span>
                {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-rose-400" />}
              </div>
              <div className="mt-2">
                <div className="text-base font-bold flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                  {isOnline ? 'Online / Terhubung' : 'Offline / Terputus'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Latensi: {latencyInfo.recentMetric ? `${latencyInfo.recentMetric.durationMs}ms` : (isOnline ? '~15ms' : 'Tidak terjangkau')}
                </div>
              </div>
            </div>

            {/* Pending Queue Summary */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              queueItems.length > 0 
                ? 'bg-amber-950/20 border-amber-500/30 text-amber-300' 
                : 'bg-slate-800/50 border-slate-700/60 text-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Antrean Local Sync</span>
                <Layers className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <div className="text-base font-bold text-slate-100">
                  {queueItems.length} Item Pending
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {queueItems.length > 0 ? 'Memerlukan push ke Cloud' : 'Semua data lokal tersimpan di Cloud'}
                </div>
              </div>
            </div>

            {/* Last Sync Timestamp */}
            <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 flex flex-col justify-between text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Sinkron Terakhir</span>
                <Clock className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-2">
                <div className="text-base font-bold text-slate-100">
                  {fbStatus.lastSyncTime || 'Belum Sinkron'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Status Firebase: {fbStatus.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Sync Progress Indicator if active */}
          {syncProgress.isSyncing && (
            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-indigo-200">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  {syncProgress.stageLabel || 'Sedang memproses sinkronisasi data...'}
                </span>
                <span className="font-mono text-indigo-300">{syncProgress.percent}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, syncProgress.percent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Last Push Error Alert Notice */}
          {lastPushError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 flex items-start gap-3 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Kegagalan Sinkronisasi Terakhir:</p>
                <p className="mt-0.5 text-rose-200/90">{lastPushError}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Data Anda tetap aman tersimpan di penyimpanan IndexedDB HP/Komputer lokal. Anda dapat mengklik "Mulai Push Manual" di bawah setelah koneksi membaik.
                </p>
              </div>
            </div>
          )}

          {/* Action Execution Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              onClick={handlePushManual}
              disabled={isSyncing || !isOnline}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <CloudUpload className="w-4 h-4" />
              {isSyncing ? 'Proses Sinkronisasi...' : 'Mulai Push Manual ke Cloud'}
            </button>

            <button
              onClick={handlePullManual}
              disabled={isSyncing || !isOnline}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium text-xs sm:text-sm border border-slate-700 flex items-center justify-center gap-2 transition-all"
            >
              <CloudDownload className="w-4 h-4 text-sky-400" />
              Tarik Data Cloud (Pull)
            </button>

            {queueItems.length > 0 && (
              <button
                onClick={handleClearAllQueue}
                disabled={isSyncing}
                className="py-2.5 px-3 rounded-xl bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                title="Kosongkan Seluruh Antrean"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Antrean
              </button>
            )}
          </div>

          {/* Detailed Queue Items List */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Rincian Item Antrean LocalSync ({queueItems.length})
              </h4>
              <button
                onClick={loadQueue}
                disabled={isLoadingQueue}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingQueue ? 'animate-spin' : ''}`} />
                Muat Ulang List
              </button>
            </div>

            {queueItems.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-slate-300 font-semibold text-xs">Antrean Kosong / Tersinkron Sempurna!</p>
                <p className="text-slate-500 text-[11px] mt-1 max-w-sm mx-auto">
                  Seluruh perubahan data lokal di aplikasi ini sudah berada dalam status sinkron dengan Cloud Firestore.
                </p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl divide-y divide-slate-800/80 max-h-52 overflow-y-auto bg-slate-900/60">
                {queueItems.map((item) => {
                  const label = COLLECTION_LABELS[item.storeName] || item.storeName;
                  const isDelete = item.action === 'deleted';

                  return (
                    <div 
                      key={item.key} 
                      className="p-2.5 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                          isDelete 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {item.action}
                        </span>
                        <div className="truncate">
                          <span className="font-semibold text-slate-200">{label}</span>
                          <span className="text-[11px] text-slate-500 font-mono ml-2 truncate">
                            ID: {item.docId}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveQueueItem(item.key)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors shrink-0 ml-2"
                        title="Hapus item ini dari antrean"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Offline Resilience Guidance Box */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Bagaimana Mode Offline Bekerja?</span>
              <p className="mt-0.5 leading-relaxed">
                Aplikasi EduSync menggunakan teknologi Local-First IndexedDB. Semua input data (nilai, absensi, jurnal) langsung tersimpan dalam milidetik di perangkat Anda tanpa memerlukan koneksi internet. Ketika internet tersedia, sistem akan otomatis mengirim antrean data ke cloud.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
