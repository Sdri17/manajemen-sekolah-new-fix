import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Search, 
  X, 
  FileSpreadsheet, 
  Wand2, 
  ShieldCheck, 
  ChevronRight, 
  UserCheck, 
  UserX,
  HelpCircle,
  Filter,
  Sparkles
} from 'lucide-react';
import { StudentValidationReport, StudentValidationPreviewItem } from '../lib/sync';

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (sanitizedStudents: any[], autoFixApplied: boolean) => void;
  report: StudentValidationReport | null;
  fileName: string;
  fileSize?: string;
}

export default function ImportPreviewModal({
  isOpen,
  onClose,
  onConfirmImport,
  report,
  fileName,
  fileSize
}: ImportPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'MISSING_REQUIRED' | 'WARNING' | 'VALID'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);

  if (!isOpen || !report) return null;

  const items = report.items || [];

  const filteredItems = items.filter(item => {
    const matchesTab = 
      activeTab === 'ALL' ||
      (activeTab === 'MISSING_REQUIRED' && item.status === 'MISSING_REQUIRED') ||
      (activeTab === 'WARNING' && item.status === 'WARNING') ||
      (activeTab === 'VALID' && item.status === 'VALID');

    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      item.nama.toLowerCase().includes(q) ||
      item.nisn.toLowerCase().includes(q) ||
      item.kelas.toLowerCase().includes(q) ||
      item.missingFields.some(f => f.toLowerCase().includes(q));

    return matchesTab && matchesSearch;
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', badge: 'bg-emerald-500 text-slate-950', text: 'Tinggi (Sangat Baik)' };
    if (score >= 70) return { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', badge: 'bg-amber-500 text-slate-950', text: 'Sedang (Perlu Dilengkapi)' };
    return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', badge: 'bg-rose-500 text-white', text: 'Rendah (Banyak Kolom Kosong)' };
  };

  const scoreStyle = getScoreColor(report.dataQualityScore);

  const handleConfirm = () => {
    const finalData = autoFixEnabled 
      ? report.sanitizedStudents 
      : report.items.map(it => it.sanitizedRecord);
    onConfirmImport(finalData, autoFixEnabled);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-100">
                  Pratinjau & Validasi Kualitas Data Impor
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  Preview Phase
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Berkas: <span className="font-medium text-slate-200">{fileName}</span> {fileSize && `(${fileSize})`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

          {/* Quality Score Banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${scoreStyle.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md ${scoreStyle.badge}`}>
                {report.dataQualityScore}%
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                    Skor Kualitas Data
                  </span>
                  <span className={`text-xs font-semibold ${scoreStyle.text}`}>
                    • {scoreStyle.text}
                  </span>
                </div>
                <p className="text-sm text-slate-200 font-medium mt-0.5">
                  {report.validCount} dari {report.totalRecords} baris siswa memiliki data lengkap dan siap diimpor.
                </p>
              </div>
            </div>

            {/* Quick Summary Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <UserCheck size={14} className="text-emerald-400" />
                Valid: <strong className="text-emerald-400">{report.validCount}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-400" />
                Perlu Melengkapi: <strong className="text-amber-400">{report.warningCount}</strong>
              </span>
              {report.missingRequiredCount > 0 && (
                <span className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs font-medium text-rose-300 flex items-center gap-1.5">
                  <UserX size={14} className="text-rose-400" />
                  Wajib Kosong: <strong className="text-rose-400">{report.missingRequiredCount}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Missing Fields Distribution Pills */}
          {Object.keys(report.missingFieldsDistribution).length > 0 && (
            <div className="p-3.5 bg-slate-800/50 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Filter size={13} className="text-indigo-400" />
                <span>Rincian Kolom Kosong Terdeteksi:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(report.missingFieldsDistribution).map(([fieldName, count]) => (
                  <span
                    key={fieldName}
                    className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <strong className="font-semibold text-amber-300">{fieldName}</strong>: {count} siswa
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Fix Option Banner */}
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg mt-0.5">
                <Wand2 size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-indigo-200">
                  Pembersihan Otomatis Data (Auto-Sanitize)
                </h4>
                <p className="text-xs text-indigo-300/80 mt-0.5">
                  Mengisi kolom yang belum terisi secara otomatis dengan nilai default standar (misal: NISN = <code className="bg-indigo-900/60 px-1 rounded text-indigo-200">-</code>, Jenis Kelamin = <code className="bg-indigo-900/60 px-1 rounded text-indigo-200">Laki-laki</code>) agar data rapi dan tidak bermasalah saat disimpan.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoFixEnabled}
                onChange={(e) => setAutoFixEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* Controls: Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 border border-slate-800 rounded-xl overflow-x-auto">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Semua ({report.totalRecords})
              </button>
              {report.missingRequiredCount > 0 && (
                <button
                  onClick={() => setActiveTab('MISSING_REQUIRED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                    activeTab === 'MISSING_REQUIRED'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  <XCircle size={13} />
                  Wajib Kosong ({report.missingRequiredCount})
                </button>
              )}
              <button
                onClick={() => setActiveTab('WARNING')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'WARNING'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <AlertTriangle size={13} />
                Perlu Melengkapi ({report.warningCount})
              </button>
              <button
                onClick={() => setActiveTab('VALID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'VALID'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <CheckCircle2 size={13} />
                Valid ({report.validCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari siswa atau kolom..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
            <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">NISN</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">JK</th>
                    <th className="py-2.5 px-3">Tanggal Lahir</th>
                    <th className="py-2.5 px-3">Status & Sorotan Kolom Kosong</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Tidak ada data siswa yang cocok dengan filter atau kriteria pencarian ini.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const isRequiredMissing = item.status === 'MISSING_REQUIRED';
                      const isWarning = item.status === 'WARNING';

                      return (
                        <tr
                          key={item.id || idx}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isRequiredMissing ? 'bg-rose-950/20' : isWarning ? 'bg-amber-950/10' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                            {item.rowIndex || idx + 1}
                          </td>

                          {/* Nama Siswa */}
                          <td className="py-2.5 px-3 font-medium">
                            {item.nama === 'Siswa Tanpa Nama' ? (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                <XCircle size={12} />
                                [Nama Kosong]
                              </span>
                            ) : (
                              <span className="text-slate-100">{item.nama}</span>
                            )}
                          </td>

                          {/* NISN */}
                          <td className="py-2.5 px-3 font-mono">
                            {item.missingFields.includes('NISN') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
                                Belum Ada ({autoFixEnabled ? '-> -' : 'Kosong'})
                              </span>
                            ) : (
                              <span className="text-slate-300">{item.nisn}</span>
                            )}
                          </td>

                          {/* Kelas */}
                          <td className="py-2.5 px-3">
                            {item.missingFields.includes('Kelas') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
                                Belum Ada ({autoFixEnabled ? '-> 1' : 'Kosong'})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium border border-slate-700">
                                {item.kelas}
                              </span>
                            )}
                          </td>

                          {/* Jenis Kelamin */}
                          <td className="py-2.5 px-3">
                            {item.missingFields.includes('Jenis Kelamin') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
                                Belum Ada ({autoFixEnabled ? '-> Laki-laki' : 'Kosong'})
                              </span>
                            ) : (
                              <span className="text-slate-300">{item.jenis_kelamin}</span>
                            )}
                          </td>

                          {/* Tanggal Lahir */}
                          <td className="py-2.5 px-3">
                            {item.missingFields.includes('Tanggal Lahir') ? (
                              <span className="text-slate-500 italic text-[11px]">
                                - (Belum Diisi)
                              </span>
                            ) : (
                              <span className="text-slate-300">{item.tanggal_lahir}</span>
                            )}
                          </td>

                          {/* Status & Sorotan Badges */}
                          <td className="py-2.5 px-3">
                            {item.missingFields.length === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                <CheckCircle2 size={12} />
                                Data Lengkap
                              </span>
                            ) : (
                              <div className="flex items-center gap-1 flex-wrap">
                                {item.missingRequiredFields.map(reqF => (
                                  <span
                                    key={reqF}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center gap-1"
                                  >
                                    <XCircle size={10} />
                                    {reqF} Wajib Kosong
                                  </span>
                                ))}
                                {item.missingFields.filter(f => !item.missingRequiredFields.includes(f)).map(optF => (
                                  <span
                                    key={optF}
                                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300"
                                  >
                                    ⚠️ {optF} Kosong
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Total siap diimpor: <strong className="text-slate-200">{report.totalRecords} siswa</strong>
            {autoFixEnabled && ' (Nilai default diterapkan untuk kolom kosong)'}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all"
            >
              <ShieldCheck size={16} />
              <span>Konfirmasi & Finalisasi Impor ({report.totalRecords})</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
