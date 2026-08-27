import React, { useState } from 'react';
import { Database, Download, Copy, Check, FileCode, Server, Shield, ArrowRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { exportDatabaseToJSON, exportDatabaseToSQL, generatePostgresSchema, generateMySQLSchema } from '../lib/dbMigration';
import toast from 'react-hot-toast';

interface DatabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseMigrationModal: React.FC<DatabaseMigrationModalProps> = ({ isOpen, onClose }) => {
  const [activeSubTab, setActiveSubTab] = useState<'supabase' | 'mysql' | 'json'>('supabase');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(label);
    toast.success(`Berhasil menyalin ${label} ke clipboard!`);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadSQL = async (dialect: 'postgres' | 'mysql') => {
    setIsExporting(true);
    try {
      const sqlText = await exportDatabaseToSQL(dialect);
      const blob = new Blob([sqlText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `edusync_export_${dialect}_${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Berkas SQL (${dialect.toUpperCase()}) berhasil diunduh!`);
    } catch (e: any) {
      toast.error('Gagal mengunduh berkas SQL: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadJSON = async () => {
    setIsExporting(true);
    try {
      const jsonData = await exportDatabaseToJSON();
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `edusync_full_dump_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Berkas JSON Dump database berhasil diunduh!');
    } catch (e: any) {
      toast.error('Gagal mengunduh berkas JSON: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const postgresDDL = generatePostgresSchema();
  const mysqlDDL = generateMySQLSchema();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Database size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Migrasi Database Firestore
              </h2>
              <p className="text-xs text-slate-400">
                Ekspor data & skema DDL untuk migrasi ke Supabase (PostgreSQL), MySQL, atau Cloud SQL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            onClick={() => setActiveSubTab('supabase')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'supabase'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server size={16} />
            <span>Supabase (PostgreSQL)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('mysql')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'mysql'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={16} />
            <span>MySQL / MariaDB</span>
          </button>
          <button
            onClick={() => setActiveSubTab('json')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'json'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode size={16} />
            <span>JSON Raw Export</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {activeSubTab === 'supabase' && (
            <div className="space-y-6">
              {/* Card Summary */}
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Shield size={16} /> Langkah 1: Buat Skema Tabel di Supabase (SQL Editor)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Salin skema DDL PostgreSQL di bawah ini, buka panel <strong>SQL Editor</strong> di dashboard Supabase Anda, tempelkan query, dan jalankan (RUN) untuk membuat 12 tabel otomatis.
                </p>
              </div>

              {/* DDL Code Box */}
              <div className="relative">
                <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border border-slate-800 rounded-t-xl text-xs text-slate-400">
                  <span>Supabase / PostgreSQL DDL Schema</span>
                  <button
                    onClick={() => handleCopy(postgresDDL, 'PostgreSQL DDL')}
                    className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    {copiedType === 'PostgreSQL DDL' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedType === 'PostgreSQL DDL' ? 'Tersalin' : 'Salin DDL'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-slate-950/80 border border-t-0 border-slate-800 rounded-b-xl text-xs font-mono text-emerald-400 overflow-x-auto max-h-56 custom-scrollbar">
                  {postgresDDL}
                </pre>
              </div>

              {/* Action Downloads */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Langkah 2: Ekspor Seluruh Data ke File SQL Import</h4>
                  <p className="text-xs text-slate-400">Unduh data aktif aplikasi saat ini yang sudah dikonversi menjadi perintah INSERT SQL untuk Supabase.</p>
                </div>
                <button
                  onClick={() => handleDownloadSQL('postgres')}
                  disabled={isExporting}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 whitespace-nowrap transition-colors"
                >
                  {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Unduh Data Supabase (.SQL)</span>
                </button>
              </div>

              {/* Integration Code Sample */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Contoh Kode Koneksi Supabase JS SDK</h4>
                <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
{`import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://YOUR_PROJECT_REF.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
export const supabase = createClient(supabaseUrl, supabaseKey);`}
                </pre>
              </div>
            </div>
          )}

          {activeSubTab === 'mysql' && (
            <div className="space-y-6">
              {/* Card Summary */}
              <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-sky-300 flex items-center gap-2">
                  <Database size={16} /> Langkah 1: Buat Skema Tabel di MySQL (phpMyAdmin / Workbench)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Gunakan skema DDL MySQL di bawah ini untuk membuat seluruh tabel dan indeks relasional di server MySQL / MariaDB Anda.
                </p>
              </div>

              {/* DDL Code Box */}
              <div className="relative">
                <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border border-slate-800 rounded-t-xl text-xs text-slate-400">
                  <span>MySQL / MariaDB DDL Schema</span>
                  <button
                    onClick={() => handleCopy(mysqlDDL, 'MySQL DDL')}
                    className="flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium"
                  >
                    {copiedType === 'MySQL DDL' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedType === 'MySQL DDL' ? 'Tersalin' : 'Salin DDL'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-slate-950/80 border border-t-0 border-slate-800 rounded-b-xl text-xs font-mono text-cyan-400 overflow-x-auto max-h-56 custom-scrollbar">
                  {mysqlDDL}
                </pre>
              </div>

              {/* Action Downloads */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Langkah 2: Ekspor Data ke File SQL MySQL</h4>
                  <p className="text-xs text-slate-400">Unduh data aktif saat ini dalam bentuk file `.sql` yang dapat langsung di-impor via phpMyAdmin atau CLI MySQL.</p>
                </div>
                <button
                  onClick={() => handleDownloadSQL('mysql')}
                  disabled={isExporting}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 whitespace-nowrap transition-colors"
                >
                  {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Unduh Data MySQL (.SQL)</span>
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'json' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <FileCode size={16} /> Ekspor Mentah JSON Database (Raw Dump)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Berkas JSON ini memuat seluruh isi koleksi database (Siswa, Nilai, Presensi, Kas, Jurnal, Rapor, Pengaturan) secara utuh. Cocok untuk migrasi kustom menggunakan script Node.js / Python.
                </p>
              </div>

              <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400">
                  <Download size={32} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-200">Unduh Berkas JSON Database</h4>
                  <p className="text-xs text-slate-400 max-w-md mt-1">
                    Format JSON terstruktur berisi seluruh koleksi data aktif sekolah.
                  </p>
                </div>
                <button
                  onClick={handleDownloadJSON}
                  disabled={isExporting}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-xl shadow-indigo-600/25 transition-colors"
                >
                  {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                  <span>Unduh JSON Dump (.json)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Seluruh berkas yang diunduh langsung dihasilkan dari memori lokal browser & Firestore.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Tutup Modal
          </button>
        </div>
      </div>
    </div>
  );
};
