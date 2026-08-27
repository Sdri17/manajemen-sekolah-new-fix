import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info, 
  Copy, 
  Download, 
  X, 
  FileText, 
  ShieldAlert,
  Search,
  RefreshCw,
  ListFilter,
  Terminal,
  UserCheck,
  UserX
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface ImportLogItem {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  step: 'FILE_READ' | 'PARSING' | 'HEADER_DETECTION' | 'ROW_VALIDATION' | 'INDEXEDDB_SAVE' | 'FIREBASE_SYNC';
  message: string;
  details?: string;
  rowIndex?: number;
}

export interface ImportRowDetail {
  rowIndex: number;
  nama: string;
  nisn: string;
  kelas: string;
  status: 'SUCCESS' | 'WARN' | 'ERROR' | 'SKIPPED';
  message: string;
  details?: string;
  assignedId?: string;
  isIdReassigned?: boolean;
}

export interface ImportDiagnosticReport {
  fileName: string;
  fileSize: string;
  fileType: string;
  timestamp: string;
  totalRowsRead: number;
  successCount: number;
  warnCount: number;
  errorCount: number;
  indexedDbSaved: number;
  firebaseSynced: number;
  logs: ImportLogItem[];
  rowDetails?: ImportRowDetail[];
  hasFirestorePermissionError?: boolean;
  hasFormatError?: boolean;
  hasIdReassigned?: boolean;
  rbacFilteredCount?: number;
}

interface ImportDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ImportDiagnosticReport | null;
  onRetrySync?: () => void;
}

export default function ImportDiagnosticModal({
  isOpen,
  onClose,
  report,
  onRetrySync
}: ImportDiagnosticModalProps) {
  const [activeTab, setActiveTab] = useState<'ROWS' | 'LOGS'>('ROWS');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'SUCCESS' | 'SKIPPED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen || !report) return null;

  const rowDetailsList = report.rowDetails || [];

  const filteredRows = rowDetailsList.filter(row => {
    const matchesFilter = 
      activeFilter === 'ALL' ||
      (activeFilter === 'ERROR' && row.status === 'ERROR') ||
      (activeFilter === 'WARN' && row.status === 'WARN') ||
      (activeFilter === 'SUCCESS' && row.status === 'SUCCESS') ||
      (activeFilter === 'SKIPPED' && row.status === 'SKIPPED');

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      row.nama.toLowerCase().includes(searchLower) ||
      row.nisn.toLowerCase().includes(searchLower) ||
      row.kelas.toLowerCase().includes(searchLower) ||
      row.message.toLowerCase().includes(searchLower) ||
      row.rowIndex.toString().includes(searchTerm);

    return matchesFilter && matchesSearch;
  });

  const filteredLogs = report.logs.filter(log => {
    const matchesFilter = 
      activeFilter === 'ALL' ||
      (activeFilter === 'ERROR' && log.level === 'ERROR') ||
      (activeFilter === 'WARN' && log.level === 'WARN') ||
      (activeFilter === 'SUCCESS' && log.level === 'SUCCESS') ||
      (activeFilter === 'SKIPPED' && log.level === 'INFO');

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      log.message.toLowerCase().includes(searchLower) ||
      (log.details && log.details.toLowerCase().includes(searchLower)) ||
      log.step.toLowerCase().includes(searchLower) ||
      (log.rowIndex !== undefined && log.rowIndex.toString().includes(searchTerm));

    return matchesFilter && matchesSearch;
  });

  const handleCopyLogs = () => {
    let content = `=== DIAGNOSA IMPOR DATA SISWA ===\nFile: ${report.fileName} (${report.fileSize})\nWaktu: ${report.timestamp}\nTotal Baris: ${report.totalRowsRead} | Sukses: ${report.successCount} | Warning: ${report.warnCount} | Error: ${report.errorCount}\nTersimpan Lokal: ${report.indexedDbSaved} | Sinkron Cloud: ${report.firebaseSynced}\n=================================\n\n`;

    if (activeTab === 'ROWS' && rowDetailsList.length > 0) {
      content += `DAFTAR DETAIL BARIS (${rowDetailsList.length} Baris):\n`;
      rowDetailsList.forEach(r => {
        content += `[Baris ${r.rowIndex}] Status: ${r.status} | Nama: ${r.nama || '-'} | NISN/ID: ${r.nisn || '-'} | Kelas: ${r.kelas || '-'} | Pesan: ${r.message}\n`;
      });
    } else {
      content += `DETAIL LOG KONSOL SYSTEM:\n`;
      report.logs.forEach(l => {
        content += `[${l.timestamp}] [${l.level}] [${l.step}] ${l.rowIndex ? `(Baris ${l.rowIndex}) ` : ''}${l.message}${l.details ? ` -> ${l.details}` : ''}\n`;
      });
    }

    navigator.clipboard.writeText(content);
    toast.success('Hasil diagnosa impor berhasil disalin ke clipboard!');
  };

  const handleDownloadLogFile = () => {
    let summaryHeader = `===================================================\n            LOG DIAGNOSA IMPOR DATA SISWA          \n===================================================\nBerkas        : ${report.fileName}\nUkuran        : ${report.fileSize}\nTipe          : ${report.fileType}\nWaktu         : ${report.timestamp}\nTotal Baris   : ${report.totalRowsRead}\nStatus Sukses : ${report.successCount}\nStatus Warning: ${report.warnCount}\nStatus Error  : ${report.errorCount}\nIndexedDB Local: ${report.indexedDbSaved}\nFirebase Cloud : ${report.firebaseSynced}\n===================================================\n\n`;

    summaryHeader += `--- DAFTAR DETAIL BARIS DATA (${rowDetailsList.length} BARIS) ---\n`;
    rowDetailsList.forEach(r => {
      summaryHeader += `[Baris ${r.rowIndex}] STATUS: ${r.status.padEnd(7)} | NAMA: ${(r.nama || '-').padEnd(25)} | NISN: ${(r.nisn || '-').padEnd(12)} | KELAS: ${(r.kelas || '-').padEnd(8)} | KET: ${r.message}\n`;
    });

    summaryHeader += `\n--- LOG KONSOL SISTEM (${report.logs.length} ENTRI) ---\n`;
    report.logs.forEach(l => {
      summaryHeader += `[${l.timestamp}] [${l.level}] [${l.step}] ${l.rowIndex ? `(Baris ${l.rowIndex}) ` : ''}${l.message}${l.details ? ` -> ${l.details}` : ''}\n`;
    });

    const blob = new Blob([summaryHeader], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Log_Diagnosa_Import_${report.fileName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Berkas log diagnosa berhasil diunduh!');
  };

  const isTotalFailure = report.successCount === 0 && report.errorCount > 0;
  const isPartialSuccess = (report.successCount > 0 && (report.errorCount > 0 || report.warnCount > 0)) || (report.indexedDbSaved < report.totalRowsRead && report.totalRowsRead > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* Modal Header */}
        <div className="p-5 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isTotalFailure 
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' 
                : isPartialSuccess
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            }`}>
              {isTotalFailure ? <XCircle size={24} /> : isPartialSuccess ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Hasil Diagnosa Impor Data Siswa
                </h3>
                <span className={`px-2.5 py-0.5 text-[11px] font-extrabold rounded-full border ${
                  isTotalFailure 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                    : isPartialSuccess
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {isTotalFailure ? 'GAGAL TOTAL' : isPartialSuccess ? 'PERLU PERHATIAN' : 'SUKSES SEMPURNA'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Berkas: <strong className="text-slate-200">{report.fileName}</strong> ({report.fileSize})</span>
                <span>•</span>
                <span>{report.timestamp}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
            title="Tutup Modal Diagnosa"
          >
            <X size={20} />
          </button>
        </div>

        {/* Diagnostic Metrics Summary Cards */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(92vh-140px)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-400">Total Baris Diproses</span>
              <span className="text-lg font-black text-slate-100 mt-1">{report.totalRowsRead} Baris</span>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-emerald-400">Berhasil Disimpan Lokal</span>
              <span className="text-lg font-black text-emerald-300 mt-1">{report.indexedDbSaved} Siswa</span>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-amber-400">Peringatan / Catatan</span>
              <span className="text-lg font-black text-amber-300 mt-1">{report.warnCount} Hal</span>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-rose-400">Gagal / Error</span>
              <span className="text-lg font-black text-rose-300 mt-1">{report.errorCount} Error</span>
            </div>
          </div>

          {/* Root Cause Alerts */}
          {report.hasIdReassigned && (
            <div className="bg-indigo-950/60 border border-indigo-500/50 rounded-xl p-3.5 flex gap-3 text-indigo-200">
              <Info className="shrink-0 text-indigo-400 mt-0.5" size={20} />
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-indigo-100">Peringatan ID/NISN Duplikat Berhasil Diperbaiki Otomatis!</h4>
                <p className="text-indigo-300 leading-relaxed">
                  Beberapa baris dalam file Excel tidak memiliki NISN unik atau memiliki ID duplikat. Sistem secara otomatis memberikan ID unik baru untuk setiap siswa agar <strong className="text-indigo-100">seluruh {report.indexedDbSaved} siswa tersimpan utuh dan tidak saling tertimpa</strong>.
                </p>
              </div>
            </div>
          )}

          {report.rbacFilteredCount !== undefined && report.rbacFilteredCount > 0 && (
            <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl p-3.5 flex gap-3 text-amber-200">
              <UserCheck className="shrink-0 text-amber-400 mt-0.5" size={20} />
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-amber-100">Informasi Pembatasan Hak Akses Peran (Wali Kelas / Guru)</h4>
                <p className="text-amber-300 leading-relaxed">
                  Sebanyak <strong className="text-amber-100">{report.rbacFilteredCount} siswa</strong> yang diimpor memiliki kelas lain yang bukan rombel binaan Anda. Seluruh data siswa tersebut <strong className="text-amber-100">tetap tersimpan aman di database</strong>, namun disembunyikan dari tabel tampilan Anda karena aturan hak akses. Data dapat dilihat oleh Wali Kelas terkait atau Kepala Sekolah / Admin.
                </p>
              </div>
            </div>
          )}

          {report.hasFirestorePermissionError && (
            <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3.5 flex gap-3 text-rose-200">
              <ShieldAlert className="shrink-0 text-rose-400 mt-0.5" size={20} />
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-rose-100">Terdeteksi Masalah Izin Firestore (Permission Denied)!</h4>
                <p className="text-rose-300 leading-relaxed">
                  Data siswa berhasil disimpan secara lokal di browser (IndexedDB), namun gagal diunggah ke Cloud Firestore karena masalah aturan keamanan (Security Rules) atau sesi login.
                </p>
                {onRetrySync && (
                  <div className="pt-1">
                    <button
                      onClick={onRetrySync}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw size={12} /> Coba Sinkronkan Ulang
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View Tab Selector */}
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('ROWS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'ROWS'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                }`}
              >
                <ListFilter size={15} /> Daftar Baris Data ({rowDetailsList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('LOGS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'LOGS'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                }`}
              >
                <Terminal size={15} /> Log Konsol Sistem ({report.logs.length})
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Cari nama, NISN, atau baris..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-48 sm:w-60 pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Status Filter Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                activeFilter === 'ALL' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua ({activeTab === 'ROWS' ? rowDetailsList.length : report.logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('SUCCESS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'SUCCESS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <CheckCircle2 size={12} /> Sukses ({report.successCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('WARN')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'WARN' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <AlertTriangle size={12} /> Catatan / Warning ({report.warnCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ERROR')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'ERROR' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              <XCircle size={12} /> Error ({report.errorCount})
            </button>
          </div>

          {/* TAB 1: ROW BREAKDOWN TABLE */}
          {activeTab === 'ROWS' && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden">
              {filteredRows.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Tidak ada baris data yang cocok dengan kriteria filter.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-800/95 border-b border-slate-700/80 text-slate-400 uppercase text-[10px] font-bold tracking-wider z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-16 text-center">Baris</th>
                        <th className="py-2.5 px-3">Nama Siswa</th>
                        <th className="py-2.5 px-3">NISN / ID</th>
                        <th className="py-2.5 px-3">Kelas</th>
                        <th className="py-2.5 px-3 w-28 text-center">Status</th>
                        <th className="py-2.5 px-3">Detail Diagnosa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredRows.map((row) => {
                        const isErr = row.status === 'ERROR';
                        const isWarn = row.status === 'WARN';
                        const isSucc = row.status === 'SUCCESS';

                        return (
                          <tr 
                            key={`row-${row.rowIndex}-${row.nama}`} 
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isErr 
                                ? 'bg-rose-950/20' 
                                : isWarn 
                                ? 'bg-amber-950/20' 
                                : 'bg-transparent'
                            }`}
                          >
                            <td className="py-2 px-3 text-center font-bold text-slate-400">
                              #{row.rowIndex}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-200">
                              {row.nama || <span className="text-slate-500 italic">(Kosong)</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                              {row.nisn || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-medium">
                              {row.kelas ? (
                                <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                                  {row.kelas}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                                isErr 
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                                  : isWarn 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                  : isSucc
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-700 text-slate-300'
                              }`}>
                                {isErr ? <XCircle size={10} /> : isWarn ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                                {row.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-300 text-[11px] leading-relaxed">
                              {row.message}
                              {row.details && (
                                <span className="block text-[10px] text-slate-400 mt-0.5 font-mono">
                                  {row.details}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM LOGS CONSOLE */}
          {activeTab === 'LOGS' && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 font-mono text-xs max-h-80 overflow-y-auto space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 font-sans">
                  Tidak ada entri log yang sesuai dengan filter pencarian.
                </div>
              ) : (
                filteredLogs.map(log => {
                  const isErr = log.level === 'ERROR';
                  const isWarn = log.level === 'WARN';
                  const isSucc = log.level === 'SUCCESS';

                  return (
                    <div 
                      key={log.id} 
                      className={`p-2.5 rounded-lg border transition-all space-y-1 ${
                        isErr 
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-200' 
                          : isWarn 
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          : isSucc
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            isErr ? 'bg-rose-500 text-white' : isWarn ? 'bg-amber-500 text-slate-950' : isSucc ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                          }`}>
                            {log.level}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">[{log.step}]</span>
                          {log.rowIndex !== undefined && (
                            <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.2 rounded text-[10px] font-bold">
                              Baris {log.rowIndex}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                      </div>

                      <p className="font-sans text-xs leading-relaxed font-medium">
                        {log.message}
                      </p>

                      {log.details && (
                        <pre className="text-[10px] bg-slate-950/80 p-2 rounded text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono border border-slate-800/80">
                          {log.details}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLogs}
              className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Copy size={14} /> Salin Hasil Diagnosa
            </button>
            <button
              onClick={handleDownloadLogFile}
              className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download size={14} /> Unduh Berkas Log (.txt)
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            Tutup Modal Diagnosa
          </button>
        </div>

      </div>
    </div>
  );
}
