import React, { useState, useEffect, useCallback } from 'react';
import { 
  Terminal, 
  Layers, 
  Upload, 
  FileCode, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Play, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Edit2, 
  Download, 
  Share2, 
  ShieldCheck, 
  Cpu, 
  Activity, 
  Zap, 
  FileText, 
  ArrowRight, 
  X, 
  Maximize2, 
  Clock, 
  HelpCircle,
  Sparkles,
  Database,
  Sliders,
  Code
} from 'lucide-react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db, app, activeFirebaseConfig, saveCustomFirebaseConfig } from '../lib/firebase';
import { 
  FirebaseDebugProfile, 
  getDebugProfiles, 
  getActiveDebugProfile, 
  saveDebugProfile, 
  deleteDebugProfile, 
  activateDebugProfile, 
  resetToSystemDefaultProfile,
  validateAndParseFirebaseConfigJson,
  fetchRemoteConfigProfileFromUrl,
  exportProfilesBundleJson,
  importProfilesBundleJson
} from '../lib/debugProfilesManager';
import { FirebaseConfigType } from '../lib/remoteConfigLoader';
import toast from 'react-hot-toast';

interface DeveloperDebugPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  embeddedMode?: boolean; // If true, renders as an inline panel instead of modal
}

export default function DeveloperDebugPanel({ isOpen = true, onClose, embeddedMode = false }: DeveloperDebugPanelProps) {
  const [activeTab, setActiveTab] = useState<'profiles' | 'inject' | 'probe' | 'bundle'>('profiles');
  const [injectMethod, setInjectMethod] = useState<'file' | 'json' | 'url' | 'builder'>('file');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Profiles State
  const [profiles, setProfiles] = useState<FirebaseDebugProfile[]>([]);
  const [currentActiveProfile, setCurrentActiveProfile] = useState<FirebaseDebugProfile>(getActiveDebugProfile());
  const [selectedProfile, setSelectedProfile] = useState<FirebaseDebugProfile | null>(null);

  // Connection Probe State
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<{ status: 'idle' | 'success' | 'error'; latencyMs?: number; errorMsg?: string; timestamp?: Date }>({ status: 'idle' });

  // Injection Inputs
  const [jsonInput, setJsonInput] = useState<string>('');
  const [jsonValidationError, setJsonValidationError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Builder Form State
  const [builderForm, setBuilderForm] = useState<{
    name: string;
    description: string;
    environmentTag: 'development' | 'staging' | 'production' | 'test' | 'custom';
    projectId: string;
    firestoreDatabaseId: string;
    apiKey: string;
    authDomain: string;
    appId: string;
    storageBucket: string;
  }>({
    name: '',
    description: '',
    environmentTag: 'development',
    projectId: '',
    firestoreDatabaseId: '(default)',
    apiKey: '',
    authDomain: '',
    appId: '',
    storageBucket: ''
  });

  // Edit Profile State
  const [editingProfile, setEditingProfile] = useState<FirebaseDebugProfile | null>(null);

  // Copy Feedback State
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reload profiles from registry
  const refreshProfiles = useCallback(() => {
    const list = getDebugProfiles();
    setProfiles(list);
    const active = getActiveDebugProfile();
    setCurrentActiveProfile(active);
    if (!selectedProfile) {
      setSelectedProfile(active);
    }
  }, [selectedProfile]);

  useEffect(() => {
    refreshProfiles();

    const handleProfileSwitched = (e: any) => {
      refreshProfiles();
      if (e.detail?.profile) {
        setCurrentActiveProfile(e.detail.profile);
      }
    };

    window.addEventListener('firebase-debug-profile-switched', handleProfileSwitched);
    window.addEventListener('firebase-config-changed', refreshProfiles);

    return () => {
      window.removeEventListener('firebase-debug-profile-switched', handleProfileSwitched);
      window.removeEventListener('firebase-config-changed', refreshProfiles);
    };
  }, [refreshProfiles]);

  // Connection probe runner
  const runConnectionProbe = async () => {
    setIsProbing(true);
    setProbeResult({ status: 'idle' });
    const startTime = performance.now();

    try {
      const probeDocRef = doc(db, 'school_settings', 'global_database_config');
      await getDocFromServer(probeDocRef);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      setProbeResult({
        status: 'success',
        latencyMs: latency,
        timestamp: new Date()
      });
      toast.success(`Connection probe OK! Latency: ${latency} ms`, { id: 'debug-probe' });
    } catch (err: any) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      setProbeResult({
        status: 'error',
        latencyMs: latency,
        errorMsg: err?.message || String(err),
        timestamp: new Date()
      });
      toast.error(`Probe Connection Warning: ${err?.message || 'Error'}`, { id: 'debug-probe' });
    } finally {
      setIsProbing(false);
    }
  };

  // Switch Active Profile
  const handleActivateProfile = (profileId: string) => {
    try {
      const activated = activateDebugProfile(profileId);
      setCurrentActiveProfile(activated);
      setSelectedProfile(activated);
      refreshProfiles();
      toast.success(`Berhasil beralih ke profil: "${activated.name}" (Project: ${activated.config.projectId})`, { duration: 4000 });
      
      // Auto run probe test after switching
      setTimeout(() => {
        runConnectionProbe();
      }, 500);
    } catch (err: any) {
      toast.error('Gagal mengaktifkan profil: ' + err.message);
    }
  };

  // File Upload Handler
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const parsed = validateAndParseFirebaseConfigJson(content);
      if (!parsed.valid || !parsed.config) {
        toast.error('File JSON tidak valid: ' + (parsed.error || 'Metadata hilang'));
        return;
      }

      const newProf = saveDebugProfile({
        id: `profile-file-${Date.now()}`,
        name: file.name.replace('.json', '') || `Config (${parsed.config.projectId})`,
        description: `Diimpor dari berkas ${file.name}`,
        environmentTag: 'custom',
        config: parsed.config,
        sourceType: 'uploaded_file',
        sourceDetail: `Berkas: ${file.name}`
      });

      refreshProfiles();
      toast.success(`Profil "${newProf.name}" berhasil ditambahkan!`);
      handleActivateProfile(newProf.id);
    };
    reader.readAsText(file);
  };

  // Paste JSON Handler
  const handleInjectJsonSubmit = () => {
    const result = validateAndParseFirebaseConfigJson(jsonInput);
    if (!result.valid || !result.config) {
      setJsonValidationError(result.error || 'Payload JSON tidak valid.');
      toast.error(result.error || 'Payload JSON tidak valid.');
      return;
    }

    setJsonValidationError(null);
    const newProf = saveDebugProfile({
      id: `profile-json-${Date.now()}`,
      name: `Injected JSON (${result.config.projectId})`,
      description: 'Disuntikkan secara manual dari snippet JSON',
      environmentTag: 'custom',
      config: result.config,
      sourceType: 'pasted_json',
      sourceDetail: 'Raw Injected JSON Snippet'
    });

    refreshProfiles();
    setJsonInput('');
    toast.success(`Profil "${newProf.name}" berhasil disuntikkan!`);
    handleActivateProfile(newProf.id);
  };

  // Remote URL Fetch Handler
  const handleFetchUrlSubmit = async () => {
    if (!urlInput.trim()) {
      toast.error('Masukkan URL sumber firebase-applet-config.json');
      return;
    }

    setIsFetchingUrl(true);
    toast.loading('Mengambil firebase-applet-config.json dari remote URL...', { id: 'fetch-url-cfg' });

    try {
      const res = await fetchRemoteConfigProfileFromUrl(urlInput.trim());
      if (!res.success || !res.config) {
        toast.error(res.error || 'Gagal mengambil konfigurasi dari URL', { id: 'fetch-url-cfg' });
        return;
      }

      const newProf = saveDebugProfile({
        id: `profile-url-${Date.now()}`,
        name: `Remote URL (${res.config.projectId})`,
        description: `Diambil dari ${urlInput.substring(0, 45)}...`,
        environmentTag: 'staging',
        config: res.config,
        sourceType: 'remote_url',
        sourceDetail: urlInput.trim()
      });

      refreshProfiles();
      setUrlInput('');
      toast.success(`Konfigurasi dari URL berhasil diimpor sebagai profil "${newProf.name}"!`, { id: 'fetch-url-cfg' });
      handleActivateProfile(newProf.id);
    } catch (err: any) {
      toast.error('Gagal mengambil URL: ' + err.message, { id: 'fetch-url-cfg' });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Manual Builder Submit
  const handleBuilderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!builderForm.name.trim() || !builderForm.projectId.trim() || !builderForm.apiKey.trim()) {
      toast.error('Isi minimal Nama Profil, Project ID, dan API Key');
      return;
    }

    const cfg: FirebaseConfigType = {
      projectId: builderForm.projectId.trim(),
      apiKey: builderForm.apiKey.trim(),
      authDomain: builderForm.authDomain.trim() || `${builderForm.projectId.trim()}.firebaseapp.com`,
      firestoreDatabaseId: builderForm.firestoreDatabaseId.trim() || '(default)',
      appId: builderForm.appId.trim() || '',
      storageBucket: builderForm.storageBucket.trim() || `${builderForm.projectId.trim()}.appspot.com`,
      messagingSenderId: ''
    };

    const newProf = saveDebugProfile({
      id: `profile-build-${Date.now()}`,
      name: builderForm.name.trim(),
      description: builderForm.description.trim() || 'Profil dikonfigurasi secara manual',
      environmentTag: builderForm.environmentTag,
      config: cfg,
      sourceType: 'preset',
      sourceDetail: 'Form Builder Manual'
    });

    refreshProfiles();
    toast.success(`Profil kustom "${newProf.name}" berhasil dibuat!`);
    handleActivateProfile(newProf.id);
  };

  // Delete Profile
  const handleDeleteProfile = (profileId: string, profileName: string) => {
    if (window.confirm(`Hapus profil kustom "${profileName}"?`)) {
      const deleted = deleteDebugProfile(profileId);
      if (deleted) {
        refreshProfiles();
        toast.success(`Profil "${profileName}" berhasil dihapus.`);
      } else {
        toast.error('Profil sistem bawaan tidak dapat dihapus.');
      }
    }
  };

  // Reset to System Default
  const handleResetToDefault = () => {
    if (window.confirm('Kembalikan koneksi Firebase ke Profil Bawaan Server (firebase-applet-config.json)?')) {
      const res = resetToSystemDefaultProfile();
      refreshProfiles();
      toast.success(`Koneksi berhasil dikembalikan ke Profil Bawaan: "${res.name}"`);
    }
  };

  // Export Bundle
  const handleExportBundle = () => {
    const jsonStr = exportProfilesBundleJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firebase-debug-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Bundel profil debug berhasil diunduh!');
  };

  // Import Bundle File
  const handleImportBundleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const res = importProfilesBundleJson(content);
      if (res.error) {
        toast.error('Gagal mengimpor bundel: ' + res.error);
      } else {
        refreshProfiles();
        toast.success(`Berhasil mengimpor ${res.importedCount} profil debug!`);
      }
    };
    reader.readAsText(file);
  };

  // Copy helper
  const handleCopyText = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    toast.success(`Teks ${keyName} berhasil disalin!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Filter profiles
  const filteredProfiles = profiles.filter(p => {
    const matchEnv = envFilter === 'all' || p.environmentTag === envFilter;
    const matchSearch = !searchTerm.trim() || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.config.projectId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.config.firestoreDatabaseId || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchEnv && matchSearch;
  });

  const getEnvBadgeColor = (tag: string) => {
    switch (tag) {
      case 'development': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'staging': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'production': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'test': return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  if (!isOpen && !embeddedMode) return null;

  const content = (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <Terminal size={22} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                Firebase Environment Debug Panel
              </h2>
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono rounded-md">
                DEV ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola & injeksi profil <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> tanpa hardcoding berkas.
            </p>
          </div>
        </div>

        {/* Status Pills & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs font-mono">
            <Database size={13} className="text-indigo-400" />
            <span className="text-slate-400">Active Proj:</span>
            <span className="text-indigo-300 font-semibold">{currentActiveProfile.config.projectId}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs font-mono">
            <Layers size={13} className="text-amber-400" />
            <span className="text-slate-400">DB ID:</span>
            <span className="text-amber-300 font-semibold">{currentActiveProfile.config.firestoreDatabaseId || '(default)'}</span>
          </div>

          <button
            onClick={runConnectionProbe}
            disabled={isProbing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Uji coba latensi & status koneksi Firestore"
          >
            <Zap size={13} className={isProbing ? 'animate-spin text-amber-300' : 'text-yellow-300'} />
            <span>{isProbing ? 'Probing...' : 'Probe Ping'}</span>
          </button>

          {!embeddedMode && onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer ml-1"
              title="Tutup Modal Debug"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Connection Probe Banner Result */}
      {probeResult.status !== 'idle' && (
        <div className={`px-5 py-2.5 border-b text-xs flex items-center justify-between gap-2 ${
          probeResult.status === 'success' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {probeResult.status === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="text-rose-400" />
            )}
            <span className="font-semibold">
              {probeResult.status === 'success' ? 'Koneksi Firestore Aktif & Responsif!' : 'Kendala Koneksi Terdeteksi:'}
            </span>
            <span>
              {probeResult.status === 'success' 
                ? `Response Latency: ${probeResult.latencyMs} ms`
                : probeResult.errorMsg}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {probeResult.timestamp?.toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'profiles'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Sliders size={14} />
          <span>Profil Config ({profiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('inject')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'inject'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Code size={14} />
          <span>Injeksi Config Baru</span>
        </button>

        <button
          onClick={() => setActiveTab('probe')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'probe'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Activity size={14} />
          <span>Inspeksi & Probe Latensi</span>
        </button>

        <button
          onClick={() => setActiveTab('bundle')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'bundle'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Share2 size={14} />
          <span>Ekspor / Impor Bundel</span>
        </button>
      </div>

      {/* Tab Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-950">
        {/* TAB 1: PROFILES SWITCHER */}
        {activeTab === 'profiles' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs text-slate-400 font-medium">Tag Lingkungan:</span>
                {['all', 'development', 'staging', 'production', 'test', 'custom'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => setEnvFilter(tag)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize cursor-pointer whitespace-nowrap ${
                      envFilter === tag
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari nama profil / project ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
                />
                <button
                  onClick={handleResetToDefault}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer"
                  title="Kembalikan ke profil bawaan server"
                >
                  Reset Default
                </button>
              </div>
            </div>

            {/* Profiles Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProfiles.map(p => {
                const isActive = p.id === currentActiveProfile.id;
                const isSelected = selectedProfile?.id === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'bg-indigo-950/30 border-indigo-500/80 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/50'
                        : isSelected
                        ? 'bg-slate-900/90 border-slate-700'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div>
                      {/* Top bar with active tag */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold border ${getEnvBadgeColor(p.environmentTag)}`}>
                            {p.environmentTag}
                          </span>
                          {p.isDefaultSystem && (
                            <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-md text-[10px] font-mono font-medium">
                              SYSTEM DEFAULT
                            </span>
                          )}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md text-[10px] font-semibold">
                              <CheckCircle2 size={10} className="text-emerald-400" />
                              <span>ACTIVE</span>
                            </span>
                          )}
                        </div>

                        {!p.isDefaultSystem && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id, p.name); }}
                            className="text-slate-500 hover:text-rose-400 p-1 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Hapus profil kustom ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Name & Description */}
                      <h3 className="text-sm font-bold text-white mt-2 flex items-center gap-2">
                        <span>{p.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {p.description}
                      </p>

                      {/* Config Key Badges */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Project ID</span>
                          <span className="text-indigo-300 font-semibold truncate block">{p.config.projectId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Database ID</span>
                          <span className="text-amber-300 font-semibold truncate block">{p.config.firestoreDatabaseId || '(default)'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-1">
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Clock size={11} />
                        <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                      </span>

                      {isActive ? (
                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                          <Check size={14} />
                          <span>Terhubung</span>
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleActivateProfile(p.id); }}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play size={12} />
                          <span>Aktifkan Profil</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Profile Detailed Inspector */}
            {selectedProfile && (
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3 mt-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                    <Sliders size={14} />
                    <span>Detail Parameter Profil: "{selectedProfile.name}"</span>
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">ID: {selectedProfile.id}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Auth Domain</span>
                    <span className="text-slate-200 font-medium truncate block">{selectedProfile.config.authDomain}</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">API Key (Masked)</span>
                    <span className="text-slate-200 font-medium truncate block">
                      {selectedProfile.config.apiKey ? `${selectedProfile.config.apiKey.substring(0, 8)}...` : '-'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">App ID</span>
                    <span className="text-slate-200 font-medium truncate block">{selectedProfile.config.appId || '-'}</span>
                  </div>
                </div>

                {/* Quick copy snippet buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <button
                    onClick={() => handleCopyText(JSON.stringify(selectedProfile.config, null, 2), 'JSON Config')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all cursor-pointer"
                  >
                    <Copy size={13} className="text-indigo-400" />
                    <span>Salin JSON Config</span>
                  </button>

                  <button
                    onClick={() => {
                      const encoded = btoa(encodeURIComponent(JSON.stringify(selectedProfile.config)));
                      const link = `${window.location.origin}${window.location.pathname}?db_config=${encoded}`;
                      handleCopyText(link, 'Link Sync URL');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all cursor-pointer"
                  >
                    <Share2 size={13} className="text-emerald-400" />
                    <span>Salin URL Sync Link (?db_config)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INJECT CONFIG SOURCE */}
        {activeTab === 'inject' && (
          <div className="space-y-5">
            {/* Method selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => setInjectMethod('file')}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                  injectMethod === 'file'
                    ? 'bg-indigo-600/20 border-indigo-500/80 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Upload size={18} className={injectMethod === 'file' ? 'text-indigo-400' : 'text-slate-500'} />
                <div>
                  <div className="text-xs font-bold">Unggah Berkas .JSON</div>
                  <div className="text-[10px] text-slate-400">Upload file config</div>
                </div>
              </button>

              <button
                onClick={() => setInjectMethod('json')}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                  injectMethod === 'json'
                    ? 'bg-indigo-600/20 border-indigo-500/80 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <FileCode size={18} className={injectMethod === 'json' ? 'text-indigo-400' : 'text-slate-500'} />
                <div>
                  <div className="text-xs font-bold">Tempel Raw JSON</div>
                  <div className="text-[10px] text-slate-400">Paste payload text</div>
                </div>
              </button>

              <button
                onClick={() => setInjectMethod('url')}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                  injectMethod === 'url'
                    ? 'bg-indigo-600/20 border-indigo-500/80 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Globe size={18} className={injectMethod === 'url' ? 'text-indigo-400' : 'text-slate-500'} />
                <div>
                  <div className="text-xs font-bold">Fetch Remote URL</div>
                  <div className="text-[10px] text-slate-400">Ambil dari HTTP URL</div>
                </div>
              </button>

              <button
                onClick={() => setInjectMethod('builder')}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                  injectMethod === 'builder'
                    ? 'bg-indigo-600/20 border-indigo-500/80 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Plus size={18} className={injectMethod === 'builder' ? 'text-indigo-400' : 'text-slate-500'} />
                <div>
                  <div className="text-xs font-bold">Form Builder</div>
                  <div className="text-[10px] text-slate-400">Input parameter manual</div>
                </div>
              </button>
            </div>

            {/* METHOD A: FILE UPLOAD */}
            {injectMethod === 'file' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`p-8 border-2 border-dashed rounded-2xl text-center transition-all flex flex-col items-center justify-center gap-3 ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="p-4 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
                  <Upload size={32} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Tarik & Lepas Berkas <code className="text-indigo-300 font-mono">firebase-applet-config.json</code> di Sini
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Atau klik tombol di bawah ini untuk memilih file JSON dari perangkat Anda.
                  </p>
                </div>
                <label className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-900/40 transition-all cursor-pointer flex items-center gap-2">
                  <Upload size={14} />
                  <span>Pilih Berkas JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            )}

            {/* METHOD B: PASTE RAW JSON */}
            {injectMethod === 'json' && (
              <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <FileCode size={14} className="text-indigo-400" />
                    <span>Tempel Payload Snippet JSON Config</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(jsonInput);
                        setJsonInput(JSON.stringify(parsed, null, 2));
                        setJsonValidationError(null);
                        toast.success('JSON berhasil diformat!');
                      } catch (e: any) {
                        setJsonValidationError('Format JSON error: ' + e.message);
                      }
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Format JSON
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value);
                    setJsonValidationError(null);
                  }}
                  placeholder={`{\n  "projectId": "my-firebase-project",\n  "apiKey": "AIzaSy...",\n  "authDomain": "my-firebase-project.firebaseapp.com",\n  "firestoreDatabaseId": "db-staging-test"\n}`}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-indigo-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />

                {jsonValidationError && (
                  <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                    <span>{jsonValidationError}</span>
                  </div>
                )}

                <button
                  onClick={handleInjectJsonSubmit}
                  disabled={!jsonInput.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={14} />
                  <span>Suntikkan & Aktifkan Config JSON</span>
                </button>
              </div>
            )}

            {/* METHOD C: FETCH REMOTE URL */}
            {injectMethod === 'url' && (
              <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Globe size={14} className="text-indigo-400" />
                  <span>URL Sumber Remote <code className="text-indigo-300 font-mono">firebase-applet-config.json</code></span>
                </label>
                <p className="text-xs text-slate-400">
                  Masukkan URL HTTPS tempat file JSON konfigurasi disimpan (misal dari server staging atau CDN):
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://my-domain.com/configs/firebase-applet-config.json"
                    className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleFetchUrlSubmit}
                    disabled={isFetchingUrl || !urlInput.trim()}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} className={isFetchingUrl ? 'animate-spin' : ''} />
                    <span>Fetch & Import URL</span>
                  </button>
                </div>
              </div>
            )}

            {/* METHOD D: FORM BUILDER */}
            {injectMethod === 'builder' && (
              <form onSubmit={handleBuilderSubmit} className="space-y-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Profil Debug *</label>
                    <input
                      type="text"
                      required
                      placeholder="Misal: DB Staging Ujian"
                      value={builderForm.name}
                      onChange={(e) => setBuilderForm({ ...builderForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tag Lingkungan</label>
                    <select
                      value={builderForm.environmentTag}
                      onChange={(e) => setBuilderForm({ ...builderForm, environmentTag: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                      <option value="test">Test / Sandbox</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Project ID *</label>
                    <input
                      type="text"
                      required
                      placeholder="my-firebase-project"
                      value={builderForm.projectId}
                      onChange={(e) => setBuilderForm({ ...builderForm, projectId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Firestore Database ID</label>
                    <input
                      type="text"
                      placeholder="(default) atau db-kelas-7a"
                      value={builderForm.firestoreDatabaseId}
                      onChange={(e) => setBuilderForm({ ...builderForm, firestoreDatabaseId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">API Key *</label>
                    <input
                      type="text"
                      required
                      placeholder="AIzaSy..."
                      value={builderForm.apiKey}
                      onChange={(e) => setBuilderForm({ ...builderForm, apiKey: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Auth Domain</label>
                    <input
                      type="text"
                      placeholder="project.firebaseapp.com"
                      value={builderForm.authDomain}
                      onChange={(e) => setBuilderForm({ ...builderForm, authDomain: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Plus size={14} />
                  <span>Simpan & Aktifkan Profil Kustom</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: PROBE & DIAGNOSTICS */}
        {activeTab === 'probe' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <Activity size={15} />
                <span>Uji Probe Latensi & Koneksi Real-time</span>
              </h3>
              <p className="text-xs text-slate-400">
                Uji langsung koneksi Firestore SDK aktif dengan melakukan panggil kueri server non-destruktif ke <code className="text-indigo-300 font-mono">school_settings/global_database_config</code>.
              </p>

              <button
                onClick={runConnectionProbe}
                disabled={isProbing}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap size={14} className={isProbing ? 'animate-spin' : ''} />
                <span>{isProbing ? 'Menjalankan Probe Ping...' : 'Jalankan Probe Ping Sekarang'}</span>
              </button>
            </div>

            {/* Active SDK Runtime Metadata */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Cpu size={15} className="text-indigo-400" />
                <span>Parameter Runtime Firebase SDK Aktif</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">App Name</span>
                  <span className="text-indigo-300 font-bold">{app?.name || 'default'}</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Active Project ID</span>
                  <span className="text-emerald-300 font-bold">{currentActiveProfile.config.projectId}</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Active Database ID</span>
                  <span className="text-amber-300 font-bold">{currentActiveProfile.config.firestoreDatabaseId || '(default)'}</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Auth Domain</span>
                  <span className="text-slate-200">{currentActiveProfile.config.authDomain}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BUNDLE EXPORT / IMPORT */}
        {activeTab === 'bundle' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Card */}
              <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
                <div className="p-3 bg-indigo-600/20 border border-indigo-500/30 rounded-xl w-fit text-indigo-400">
                  <Download size={22} />
                </div>
                <h3 className="text-sm font-bold text-white">Ekspor Bundel Profil Debug</h3>
                <p className="text-xs text-slate-400">
                  Unduh seluruh daftar profil debug kustom yang tersimpan dalam format berkas JSON untuk dibagikan ke developer lain.
                </p>
                <button
                  onClick={handleExportBundle}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Unduh Bundel JSON</span>
                </button>
              </div>

              {/* Import Card */}
              <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
                <div className="p-3 bg-emerald-600/20 border border-emerald-500/30 rounded-xl w-fit text-emerald-400">
                  <Upload size={22} />
                </div>
                <h3 className="text-sm font-bold text-white">Impor Bundel Profil</h3>
                <p className="text-xs text-slate-400">
                  Unggah file JSON bundel profil debug untuk menambahkan seluruh profil sekaligus ke pendaftaran lokal Anda.
                </p>
                <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer w-fit">
                  <Upload size={14} />
                  <span>Impor Berkas Bundel</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImportBundleFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embeddedMode) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md p-4 md:p-8 flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-5xl h-[85vh] max-h-[800px]">
        {content}
      </div>
    </div>
  );
}
