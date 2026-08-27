import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, Cloud, CheckCircle2, AlertTriangle, Copy, Check, Download, 
  ExternalLink, RefreshCw, Key, ShieldCheck, Zap, Server, Globe, HelpCircle, X,
  Radio, FileCode, Sliders, ArrowRight, RotateCcw
} from 'lucide-react';
import { activeFirebaseConfig, getFirebaseConfig, saveCustomFirebaseConfig, FirebaseConfigType } from '../lib/firebase';
import { getLatencySummary, pullAllRemoteDataFromFirebase, pushAllLocalDataToFirebase } from '../lib/firebaseSync';
import FirebaseDiagnosticAndLogs from './FirebaseDiagnosticAndLogs';
import toast from 'react-hot-toast';

interface DatabaseConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DatabaseConnectModal({ isOpen, onClose }: DatabaseConnectModalProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'env' | 'custom' | 'guide'>('status');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [latencyMetrics, setLatencyMetrics] = useState(() => getLatencySummary());

  // Custom Config Form State
  const [customConfig, setCustomConfig] = useState<FirebaseConfigType>(() => getFirebaseConfig());
  const [pastedSnippet, setPastedSnippet] = useState('');
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!localStorage.getItem('custom_firebase_config');
  });

  const handleAutoParseSnippet = (rawText: string) => {
    setPastedSnippet(rawText);
    if (!rawText.trim()) return;

    const extract = (key: string): string => {
      const match = rawText.match(new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`, 'i'));
      return match ? match[1].trim() : '';
    };

    let apiKey = extract('apiKey');
    let projectId = extract('projectId');
    let authDomain = extract('authDomain');
    let appId = extract('appId');
    let storageBucket = extract('storageBucket');
    let messagingSenderId = extract('messagingSenderId');
    let measurementId = extract('measurementId');

    try {
      const parsedObj = JSON.parse(rawText.trim());
      if (parsedObj && typeof parsedObj === 'object') {
        apiKey = parsedObj.apiKey || apiKey;
        projectId = parsedObj.projectId || projectId;
        authDomain = parsedObj.authDomain || authDomain;
        appId = parsedObj.appId || appId;
        storageBucket = parsedObj.storageBucket || storageBucket;
        messagingSenderId = parsedObj.messagingSenderId || messagingSenderId;
        measurementId = parsedObj.measurementId || measurementId;
      }
    } catch (_e) {
      // Handled via regex
    }

    if (apiKey || projectId) {
      setCustomConfig(prev => ({
        ...prev,
        apiKey: apiKey || prev.apiKey,
        projectId: projectId || prev.projectId,
        authDomain: authDomain || prev.authDomain,
        appId: appId || prev.appId,
        storageBucket: storageBucket || prev.storageBucket,
        messagingSenderId: messagingSenderId || prev.messagingSenderId,
        measurementId: measurementId || prev.measurementId,
      }));
      toast.success('Kode Firebase Console berhasil diekstrak dan diisikan otomatis!');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLatencyMetrics(getLatencySummary());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`Berhasil menyalin ${label} ke clipboard!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    toast.loading('Menguji koneksi Firestore Cloud real-time...', { id: 'db-test' });
    try {
      const res = await pullAllRemoteDataFromFirebase();
      setLatencyMetrics(getLatencySummary());
      toast.success('Koneksi Database Cloud Berhasil! ' + res.message, { id: 'db-test' });
    } catch (e: any) {
      toast.error('Gagal terhubung ke Database: ' + e.message, { id: 'db-test' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCustomConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customConfig.projectId || !customConfig.apiKey) {
      toast.error('Mohon isi Project ID dan API Key Firebase!');
      return;
    }

    // Auto fix database ID if user pasted custom project ID but left AI Studio's remix database ID
    let finalDbId = customConfig.firestoreDatabaseId ? customConfig.firestoreDatabaseId.trim() : '(default)';
    if (customConfig.projectId !== 'demo-project' && (finalDbId.includes('ai-studio-remix') || finalDbId.includes('acc88558') || !finalDbId)) {
      finalDbId = '(default)';
    }

    const configToSave = {
      ...customConfig,
      firestoreDatabaseId: finalDbId
    };

    saveCustomFirebaseConfig(configToSave);
    toast.success('Konfigurasi database kustom berhasil disimpan. Memuat ulang...');
  };

  const handleResetDefaultConfig = () => {
    if (confirm('Apakah Anda yakin ingin mengembalikan seluruh konfigurasi database ke Bawaan Sistem?')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('custom_firebase_config');
        localStorage.removeItem('active_firestore_database_id');
      }
      toast.success('Database berhasil dikembalikan ke konfigurasi bawaan sistem. Memuat ulang...');
      setTimeout(() => {
        saveCustomFirebaseConfig(null);
      }, 300);
    }
  };

  const handleDownloadConfigFile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeFirebaseConfig, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "firebase-applet-config.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('File firebase-applet-config.json berhasil diunduh!');
  };

  // Generate .env string for Vercel / Netlify / Vite
  const envContent = `# Konfigurasi Database Firebase Firestore untuk Hosting (Vercel / Netlify / Cloud Run / VPS)
VITE_FIREBASE_PROJECT_ID="${activeFirebaseConfig.projectId}"
VITE_FIREBASE_API_KEY="${activeFirebaseConfig.apiKey}"
VITE_FIREBASE_APP_ID="${activeFirebaseConfig.appId}"
VITE_FIREBASE_DATABASE_ID="${activeFirebaseConfig.firestoreDatabaseId}"
VITE_FIREBASE_AUTH_DOMAIN="${activeFirebaseConfig.authDomain}"
VITE_FIREBASE_STORAGE_BUCKET="${activeFirebaseConfig.storageBucket}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${activeFirebaseConfig.messagingSenderId}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Modal */}
        <div className="p-5 bg-slate-800/90 border-b border-slate-700/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Database className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Hubungkan & Integrasi Database Hosting
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  Anti-Ribet
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Kelola koneksi Firestore Cloud & pasang ke hosting Vercel, Netlify, cPanel, atau VPS secara lancar.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700/70 bg-slate-950/40 px-5 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            Status & Uji Realtime
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'env'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Copy .env Hosting (1-Click)
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'custom'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Custom Database Firebase
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'guide'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Panduan Deploy Hosting
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300">
          {/* TAB 1: STATUS & UJI REALTIME */}
          {activeTab === 'status' && (
            <div className="space-y-6 animate-fade-in">
              <FirebaseDiagnosticAndLogs />

              <div className="pt-2 border-t border-slate-700/60 flex flex-wrap gap-3 items-center justify-between">
                <button
                  onClick={handleDownloadConfigFile}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4 text-indigo-400" />
                  Unduh File firebase-applet-config.json
                </button>

                <button
                  onClick={async () => {
                    toast.loading('Mendorong seluruh data lokal (Siswa, Nilai, Presensi, dll) ke Firestore Cloud...', { id: 'push-all' });
                    try {
                      const res = await pushAllLocalDataToFirebase(true);
                      if (res.success) {
                        toast.success(`Berhasil menyinkronkan ${res.count} data lokal ke Cloud Firestore!`, { id: 'push-all' });
                      } else {
                        toast.error(`Gagal sinkronisasi: ${res.message}`, { id: 'push-all' });
                      }
                    } catch (err: any) {
                      toast.error(`Gagal menyinkronkan data: ${err?.message || err}`, { id: 'push-all' });
                    }
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/30 cursor-pointer"
                >
                  <Cloud className="w-4 h-4" />
                  Paksa Sinkronkan Seluruh Data Lokal ke Cloud
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: COPY .ENV FOR HOSTING */}
          {activeTab === 'env' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-300">
                <p className="font-semibold text-indigo-200 mb-1 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  Gunakan variabel lingkungan ini saat deploy ke Vercel / Netlify / VPS
                </p>
                Salin seluruh text berikut dan masukkan ke bagian <strong>Environment Variables</strong> pada dashboard hosting Anda.
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed">
                  {envContent}
                </pre>
                <button
                  onClick={() => handleCopy(envContent, 'Environment Variables (.env)')}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md transition-all"
                >
                  {copiedKey === 'Environment Variables (.env)' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin 1-Click
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-white">Catatan Penting Deploy Hosting:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Variabel berawalan <code className="text-indigo-300 font-mono">VITE_</code> akan otomatis terbaca oleh sistem build React/Vite.</li>
                  <li>Jika Anda menggunakan cPanel static HTML/JS, aplikasi akan langsung membaca file <code className="text-amber-300 font-mono">firebase-applet-config.json</code> di root folder secara otomatis tanpa ribet set `.env`.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM FIREBASE CONFIG */}
          {activeTab === 'custom' && (
            <form onSubmit={handleSaveCustomConfig} className="space-y-4 animate-fade-in">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-200">Ingin Menggunakan Project Firebase Sendiri (Tanpa Edit File Code)?</p>
                  Tempelkan (paste) kode <code className="text-amber-200 font-mono">const firebaseConfig = &#123; ... &#125;;</code> langsung dari Firebase Console di bawah ini, atau isi satu per satu. Sistem akan mengekstrak kredensial secara otomatis!
                </div>
              </div>

              {/* Paste Snippet Auto-Extract Box */}
              <div className="p-3.5 bg-slate-950 border border-indigo-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    Tempel Kode Firebase Console (Auto-Ekstrak 1-Click)
                  </label>
                  <span className="text-[10px] text-slate-400">Salin dari Firebase Console &gt; Project Settings &gt; General &gt; SDK snippet</span>
                </div>
                <textarea
                  rows={3}
                  value={pastedSnippet}
                  onChange={(e) => handleAutoParseSnippet(e.target.value)}
                  placeholder={`Tempelkan kode dari Firebase Console di sini, contoh:\nconst firebaseConfig = {\n  apiKey: "AIzaSy...",\n  projectId: "sekolahku-4154c",\n  appId: "1:410877919398:web:7bb134f3a7b360f77e3467"\n};`}
                  className="w-full p-2.5 bg-slate-900 border border-slate-700/80 rounded-lg font-mono text-[11px] text-emerald-300 placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Firebase Project ID *</label>
                  <input
                    type="text"
                    required
                    value={customConfig.projectId}
                    onChange={(e) => setCustomConfig({ ...customConfig, projectId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:border-indigo-500 focus:outline-none"
                    placeholder="misal: my-school-app-123"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">API Key *</label>
                  <input
                    type="text"
                    required
                    value={customConfig.apiKey}
                    onChange={(e) => setCustomConfig({ ...customConfig, apiKey: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:border-indigo-500 focus:outline-none"
                    placeholder="AIzaSy..."
                  />
                </div>

                <div className="col-span-1 md:col-span-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-300 font-medium text-xs">
                      Firestore Database ID
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomConfig({ ...customConfig, firestoreDatabaseId: '(default)' })}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 transition-all cursor-pointer"
                    >
                      Gunakan (default)
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customConfig.firestoreDatabaseId}
                    onChange={(e) => setCustomConfig({ ...customConfig, firestoreDatabaseId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:border-indigo-500 focus:outline-none text-xs"
                    placeholder="(default)"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    💡 <strong>Penjelasan Firestore Database ID:</strong><br />
                    Secara standar pada Google Firebase Console, database Firestore bawaan Anda bernama <code className="text-emerald-400 font-mono bg-slate-900 px-1 py-0.5 rounded">(default)</code>.<br />
                    • <strong>Cara melihatnya di Firebase Console:</strong> Buka <code className="text-indigo-300 font-mono">console.firebase.google.com</code> &gt; Pilih Project (<code className="text-indigo-300 font-mono">{customConfig.projectId || 'sekolahku-4154c'}</code>) &gt; Pilih menu <strong>Firestore Database</strong>. Di bagian judul atas halaman, nama database akan tertulis <code className="text-emerald-400 font-mono font-bold">(default)</code>.<br />
                    • <strong>Penting:</strong> Jangan gunakan ID unik preview AI Studio (<code className="text-amber-400 font-mono">ai-studio-remix...</code>) jika Anda menghubungkan Project Firebase milik Anda sendiri!
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">App ID</label>
                  <input
                    type="text"
                    value={customConfig.appId}
                    onChange={(e) => setCustomConfig({ ...customConfig, appId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:border-indigo-500 focus:outline-none"
                    placeholder="1:123456:web:abcd"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetDefaultConfig}
                  className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Kembalikan ke Database Bawaan Sistem
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto ml-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Simpan & Terhubung ke Database Baru
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: DEPLOYMENT GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs animate-fade-in">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-400" />
                Langkah-Langkah Deploy Aplikasi ke Hosting (100% Anti-Ribet & Berhasil)
              </h3>

              <div className="space-y-3">
                <div className="p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-xl flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0">1</span>
                  <div>
                    <h4 className="font-bold text-white">Jalankan Command Build</h4>
                    <p className="text-slate-400 mt-0.5">
                      Buka terminal di komputer Anda dan ketik <code className="text-emerald-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded">npm run build</code>. Sistem akan membuat folder hasil kompilasi siap pakai di folder <code className="text-indigo-300 font-mono">dist/</code>.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-xl flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0">2</span>
                  <div>
                    <h4 className="font-bold text-white">Upload Folder dist/ ke Hosting Pilihan Anda</h4>
                    <p className="text-slate-400 mt-0.5">
                      <strong>Vercel / Netlify:</strong> Connect repositori GitHub Anda atau drag-and-drop folder <code className="text-indigo-300 font-mono">dist/</code> secara langsung.
                      <br />
                      <strong>cPanel / Shared Hosting:</strong> Upload isi folder <code className="text-indigo-300 font-mono">dist/</code> ke direktori <code className="text-amber-300 font-mono">public_html</code>.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-xl flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0">3</span>
                  <div>
                    <h4 className="font-bold text-white">Set Environment Variables (Khusus Vercel / Netlify)</h4>
                    <p className="text-slate-400 mt-0.5">
                      Masuk ke tab <strong>"Copy .env Hosting"</strong> di modal ini, lalu paste kodenya ke Settings &gt; Environment Variables di Vercel/Netlify.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">4</span>
                  <div>
                    <h4 className="font-bold text-emerald-300">Aplikasi Langsung Terhubung ke Database Firestore!</h4>
                    <p className="text-slate-300 mt-0.5">
                      Aplikasi siap digunakan oleh Wali Kelas, Guru, dan Kepala Sekolah. Data akan tersinkronisasi otomatis secara real-time dari manapun domain hosting Anda diakses!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Koneksi Firestore TLS 1.3 Terenskripsi & Aman</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold transition-all"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </div>
  );
}
