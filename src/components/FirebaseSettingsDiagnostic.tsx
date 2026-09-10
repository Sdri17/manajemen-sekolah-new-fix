import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, ShieldCheck, Server, Key, Globe, Info, Activity } from 'lucide-react';
import { getFirebaseConfig, getActiveDatabaseId, saveCustomFirebaseConfig, syncDatabaseConfigFromCloud } from '../lib/firebase';
import { fetchRemoteFirebaseConfig, getRemoteFirebaseConfig, FirebaseConfigType } from '../lib/remoteConfigLoader';
import { loadFirebaseConfigAsync } from '../lib/firebaseSync';
import toast from 'react-hot-toast';

export const FirebaseSettingsDiagnostic: React.FC = () => {
  const [config, setConfig] = useState<FirebaseConfigType | null>(null);
  const [activeDbId, setActiveDbId] = useState<string>('(default)');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [configSource, setConfigSource] = useState<string>('Memuat...');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const [isCustomConfig, setIsCustomConfig] = useState<boolean>(false);

  const loadCurrentMetadata = () => {
    const current = getFirebaseConfig();
    const dbId = getActiveDatabaseId();
    setConfig(current);
    setActiveDbId(dbId || '(default)');
    setLastRefreshedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    const isCustom = typeof window !== 'undefined' && !!localStorage.getItem('custom_firebase_config');
    const isLocked = typeof window !== 'undefined' && localStorage.getItem('edusync_debug_lock_active') === 'true';
    setIsCustomConfig(isCustom || isLocked);

    if (isLocked) {
      setConfigSource('Database Kustom Terkunci (Debug Profile)');
    } else if (isCustom) {
      setConfigSource('Database Kustom Pilihan Pengguna (Active)');
    } else {
      setConfigSource('Live Server Deployment (/firebase-applet-config.json)');
    }
  };

  useEffect(() => {
    loadCurrentMetadata();
  }, []);

  const handleResetToServerDefault = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi database kustom dan kembali ke database bawaan server Vercel?')) return;
    setIsRefreshing(true);
    const toastId = toast.loading('Mengembalikan ke konfigurasi bawaan server...');
    try {
      saveCustomFirebaseConfig(null);
      await fetchRemoteFirebaseConfig({ forceRefresh: true });
      toast.success('Berhasil dikembalikan ke database server bawaan! Memuat ulang...', { id: toastId });
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      toast.error(`Gagal mereset: ${err?.message || 'Error'}`, { id: toastId });
      setIsRefreshing(false);
    }
  };

  const handleRefreshMetadata = async () => {
    setIsRefreshing(true);
    const toastId = toast.loading('Memperbarui metadata Firebase & membersihkan cache stale...');

    try {
      if (typeof window !== 'undefined') {
        // 1. Programmatically clear internal configuration state & stale storage references
        localStorage.removeItem('custom_firebase_config');
        localStorage.removeItem('active_firestore_database_id');
        localStorage.removeItem('edusync_debug_lock_active');
        localStorage.removeItem('edusync_dev_active_profile_id');
        localStorage.removeItem('edusync_cached_firebase_project_id');
        localStorage.removeItem('edusync_cached_firebase_config');

        document.cookie = "edusync_custom_firebase_config=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "edusync_active_firestore_database_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        // 2. Clear browser CacheStorage if available
        if ('caches' in window) {
          try {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
            console.log('[FirebaseSettingsDiagnostic] Cleared CacheStorage keys:', cacheKeys);
          } catch (_e) {}
        }
      }

      // 3. Force fresh fetch request to the deployment environment's configuration endpoint
      const freshConfig = await fetchRemoteFirebaseConfig({ forceRefresh: true });
      await loadFirebaseConfigAsync().catch(() => {});
      await syncDatabaseConfigFromCloud().catch(() => {});

      // 4. Update local state
      setConfig(freshConfig);
      setActiveDbId(freshConfig?.firestoreDatabaseId || getActiveDatabaseId() || '(default)');
      setLastRefreshedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setConfigSource('Live Vercel Server Deployment (firebase-applet-config.json)');

      toast.success(
        `Metadata diperbarui dari Vercel Endpoint!\nProject ID: ${freshConfig.projectId}\nDatabase ID: ${freshConfig.firestoreDatabaseId || '(default)'}`,
        { id: toastId, duration: 4000 }
      );
    } catch (err: any) {
      console.error('[FirebaseSettingsDiagnostic] Refresh metadata error:', err);
      toast.error(`Gagal memperbarui metadata: ${err?.message || 'Error koneksi'}`, { id: toastId });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="bg-slate-800/60 rounded-2xl border border-indigo-500/30 p-6 backdrop-blur-sm space-y-5 shadow-xl shadow-indigo-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Server size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              Diagnostik Metadata Firebase Hosting
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 size={12} /> Aktif & Sinkron
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Menampilkan konfigurasi aktif dari lingkungan deployment server Vercel secara *real-time*.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {isCustomConfig && (
            <button
              type="button"
              onClick={handleResetToServerDefault}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/40 transition-all cursor-pointer"
            >
              <span>Reset ke Config Server Bawaan</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefreshMetadata}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold rounded-xl border border-indigo-400/40 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Memperbarui...' : 'Refresh Metadata'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Project ID */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-700/60 space-y-1">
          <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <Database size={13} /> Firebase Project ID
          </span>
          <p className="text-sm font-mono font-bold text-slate-100 truncate">
            {config?.projectId || 'Tidak Terdeteksi'}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            Target Utama Firestore
          </span>
        </div>

        {/* Database ID */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-700/60 space-y-1">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <Server size={13} /> Firestore Database ID
          </span>
          <p className="text-sm font-mono font-bold text-emerald-300 truncate">
            {activeDbId}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            {activeDbId === '(default)' ? 'Database Utama (default)' : `Multi-Tenant ID: ${activeDbId}`}
          </span>
        </div>

        {/* Auth Domain */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-700/60 space-y-1">
          <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe size={13} /> Auth Domain
          </span>
          <p className="text-sm font-mono font-bold text-slate-200 truncate">
            {config?.authDomain || `${config?.projectId || 'app'}.firebaseapp.com`}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            Domain Autentikasi OAuth
          </span>
        </div>

        {/* Metadata Source */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-700/60 space-y-1">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={13} /> Sumber Metadata
          </span>
          <p className="text-xs font-semibold text-amber-300 truncate" title={configSource}>
            {configSource}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            Pembaruan Terakhir: {lastRefreshedAt || 'Baru Saja'}
          </span>
        </div>
      </div>

      <div className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/20 text-xs text-indigo-200 flex items-start gap-2.5">
        <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <strong>Informasi Diagnostik Deployment:</strong> Tombol <strong>"Refresh Metadata"</strong> akan secara otomatis memusnahkan cache lokal (*stale config references*), menghapus *service worker storage*, dan memaksa *request* baru langsung ke endpoint server deployment Vercel (<code className="font-mono text-indigo-300">/firebase-applet-config.json</code>).
        </div>
      </div>
    </div>
  );
};

export default FirebaseSettingsDiagnostic;
