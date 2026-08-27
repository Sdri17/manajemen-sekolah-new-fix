import React, { useState, useEffect } from 'react';
import VoiceInputButton from '../components/VoiceInputButton';
import { store, Student, JurnalEntry, Settings } from '../lib/store';
import { getMergedClassesFromStudents } from '../lib/classHelper';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { v4 as uuidv4 } from 'uuid';
import { 
  BookOpen, Plus, Search, Filter, AlertTriangle, Award, UserCheck, 
  Trash2, Edit2, CheckCircle2, Clock, MessageSquare, Download, Printer, 
  Calendar, User, ShieldAlert, Sparkles, Send, FileText, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePendingSync } from '../hooks/usePendingSync';
import { PendingBadge } from '../components/PendingBadge';
import BackgroundDataBanner from '../components/BackgroundDataBanner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface JurnalGuruProps {
  role: 'guru' | 'kepsek';
  semester: string;
  settings: Settings | null;
}

export default function JurnalGuru({ role, semester, settings }: JurnalGuruProps) {
  const { isPending } = usePendingSync();
  const [entries, setEntries] = useState<JurnalEntry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTab, setActiveTab] = useState<'semua' | 'jurnal' | 'pelanggaran' | 'prestasi' | 'karakter'>('semua');
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [classList, setClassList] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    tanggal: string;
    jenis: 'Kejadian Kelas' | 'Pelanggaran' | 'Prestasi' | 'Catatan Karakter';
    kategori: string;
    id_siswa: string;
    kelas: string;
    catatan: string;
    tindakan: string;
    poin: number;
    ditindaklanjuti: boolean;
  }>({
    tanggal: new Date().toISOString().split('T')[0],
    jenis: 'Kejadian Kelas',
    kategori: 'Disiplin',
    id_siswa: '',
    kelas: settings?.nama_kelas || '',
    catatan: '',
    tindakan: '',
    poin: 0,
    ditindaklanjuti: true
  });

  // Selected student timeline view
  const [selectedStudentForTimeline, setSelectedStudentForTimeline] = useState<string>('');

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const assignedClassesKey = assignedClasses.join(',');
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    if (isRestrictedClass && assignedClasses.length > 0) {
      if (!filterClass || !assignedClasses.some(c => c.toLowerCase() === filterClass.toLowerCase())) {
        if (assignedClasses[0] && filterClass !== assignedClasses[0]) {
          setFilterClass(assignedClasses[0]);
        }
      }
    }
  }, [isRestrictedClass, assignedClassesKey]);

  useEffect(() => {
    loadData();

    const handleRefresh = () => loadData();
    window.addEventListener('data-changed', handleRefresh);
    window.addEventListener('apply-buffered-data', handleRefresh);
    return () => {
      window.removeEventListener('data-changed', handleRefresh);
      window.removeEventListener('apply-buffered-data', handleRefresh);
    };
  }, [semester]);

  const loadData = async () => {
    // Load students
    const studentList: Student[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (val.kelas && val.kelas.toLowerCase() !== 'alumni') {
        studentList.push(val);
      }
    });
    const userFilteredStudents = filterStudentsForUser(currentUser, studentList);
    setStudents(userFilteredStudents.sort((a, b) => a.nama.localeCompare(b.nama)));
    
    const studentClassMap: Record<string, string> = {};
    userFilteredStudents.forEach(s => {
      if (s.id && s.kelas) studentClassMap[s.id] = s.kelas;
    });

    const allMergedClasses = getMergedClassesFromStudents(studentList, settings?.daftar_kelas);
    const validClassList = isRestrictedClass 
      ? allMergedClasses.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
      : allMergedClasses;
    setClassList(validClassList);

    // Load Jurnal Entries
    const jurnalList: JurnalEntry[] = [];
    await store.jurnal.iterate<JurnalEntry, void>((val) => {
      if (val.semester === semester || !val.semester) {
        jurnalList.push(val);
      }
    });
    const userFilteredEntries = filterRecordsForUser(currentUser, jurnalList, studentClassMap);
    setEntries(userFilteredEntries.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()));
  };

  const handleOpenModal = (entry?: JurnalEntry) => {
    const defaultKelas = isRestrictedClass && assignedClasses[0] ? assignedClasses[0] : (filterClass || settings?.nama_kelas || '');
    if (entry) {
      setEditingId(entry.id);
      setFormData({
        tanggal: entry.tanggal || new Date().toISOString().split('T')[0],
        jenis: entry.jenis,
        kategori: entry.kategori || 'Disiplin',
        id_siswa: entry.id_siswa || '',
        kelas: entry.kelas || defaultKelas,
        catatan: entry.catatan || '',
        tindakan: entry.tindakan || '',
        poin: entry.poin || 0,
        ditindaklanjuti: entry.ditindaklanjuti ?? true
      });
    } else {
      setEditingId(null);
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        jenis: 'Kejadian Kelas',
        kategori: 'Disiplin',
        id_siswa: '',
        kelas: defaultKelas,
        catatan: '',
        tindakan: '',
        poin: 0,
        ditindaklanjuti: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.catatan.trim()) {
      toast.error('Isi catatan tidak boleh kosong');
      return;
    }

    const selectedStudent = students.find(s => s.id === formData.id_siswa);
    const entryId = editingId || uuidv4();

    const targetClass = selectedStudent 
      ? selectedStudent.kelas 
      : (formData.kelas || (isRestrictedClass && assignedClasses[0] ? assignedClasses[0] : (filterClass || settings?.nama_kelas || '-')));

    const ownerIdVal = currentUser?.id || 'system';

    const newEntry: JurnalEntry = {
      id: entryId,
      OwnerID: ownerIdVal,
      ownerId: ownerIdVal,
      tanggal: formData.tanggal,
      jenis: formData.jenis,
      kategori: formData.kategori,
      id_siswa: formData.id_siswa || undefined,
      nama_siswa: selectedStudent ? selectedStudent.nama : undefined,
      kelas: targetClass,
      semester: semester,
      catatan: formData.catatan.trim(),
      tindakan: formData.tindakan.trim() || undefined,
      poin: formData.poin,
      ditindaklanjuti: formData.ditindaklanjuti
    };

    // Instantly close modal and update state optimistically
    setIsModalOpen(false);
    toast.success(editingId ? 'Catatan berhasil diperbarui' : 'Catatan jurnal berhasil ditambahkan');
    setEntries(prev => {
      const idx = prev.findIndex(item => item.id === entryId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newEntry;
        return copy;
      }
      return [newEntry, ...prev];
    });

    try {
      await store.jurnal.setItem(entryId, newEntry);
      window.dispatchEvent(new CustomEvent('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      loadData();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDeleteId) return;
    const targetId = itemToDeleteId;

    // Instantly close modal & remove item from state
    setItemToDeleteId(null);
    setEntries(prev => prev.filter(item => item.id !== targetId));
    toast.success('Catatan berhasil dihapus');

    try {
      await store.jurnal.removeItem(targetId);
      window.dispatchEvent(new CustomEvent('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      loadData();
    }
  };

  const handleSendWA = (entry: JurnalEntry) => {
    const student = students.find(s => s.id === entry.id_siswa);
    const phone = student?.no_telp_ortu || student?.nomor_telepon || '';
    
    let msg = `Yth. Bapak/Ibu Orang Tua/Wali dari *${entry.nama_siswa || 'Siswa'}*,\n\n`;
    msg += `Menginformasikan rekam catatan perkembangan siswa di sekolah pada tanggal *${entry.tanggal}*:\n\n`;
    msg += `📌 *Kategori:* ${entry.jenis} (${entry.kategori || '-'})\n`;
    msg += `📝 *Catatan:* ${entry.catatan}\n`;
    if (entry.tindakan) {
      msg += `🛠️ *Penanganan/Tindakan Guru:* ${entry.tindakan}\n`;
    }
    msg += `\nTerima kasih atas kerja sama dan pendampingan Bapak/Ibu di rumah. 🙏\n\nSalam,\n*${settings?.nama_wali_kelas || 'Wali Kelas'}* (${settings?.nama_sekolah || 'Sekolah'})`;

    const encoded = encodeURIComponent(msg);
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '').replace(/^0/, '62');
      window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  // Filtered Entries
  const filteredEntries = entries.filter(item => {
    // Tab filter
    if (activeTab === 'jurnal' && item.jenis !== 'Kejadian Kelas') return false;
    if (activeTab === 'pelanggaran' && item.jenis !== 'Pelanggaran') return false;
    if (activeTab === 'prestasi' && item.jenis !== 'Prestasi') return false;
    if (activeTab === 'karakter' && item.jenis !== 'Catatan Karakter') return false;

    // Student filter
    if (filterStudentId && item.id_siswa !== filterStudentId) return false;

    // Class filter
    if (filterClass && item.kelas !== filterClass) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.nama_siswa?.toLowerCase().includes(q);
      const matchCatatan = item.catatan.toLowerCase().includes(q);
      const matchKategori = item.kategori?.toLowerCase().includes(q);
      if (!matchName && !matchCatatan && !matchKategori) return false;
    }

    return true;
  });

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`JURNAL HARIANGURU & BUKU CATATAN KARAKTER`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Sekolah: ${settings?.nama_sekolah || '-'} | Semester: ${semester}`, 14, 22);

    const tableData = filteredEntries.map((item, index) => [
      index + 1,
      item.tanggal,
      item.nama_siswa || 'Umum Kelas',
      item.jenis,
      item.catatan,
      item.tindakan || '-',
      item.poin || 0
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['No', 'Tanggal', 'Siswa', 'Jenis', 'Catatan Kejadian', 'Tindakan', 'Poin']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Jurnal_Guru_${semester}.pdf`);
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = filteredEntries.map((item, index) => ({
      No: index + 1,
      Tanggal: item.tanggal,
      Siswa: item.nama_siswa || 'Umum Kelas',
      Kelas: item.kelas,
      Jenis: item.jenis,
      Kategori: item.kategori || '-',
      Catatan: item.catatan,
      Tindakan: item.tindakan || '-',
      Poin: item.poin || 0,
      Selesai: item.ditindaklanjuti ? 'Ya' : 'Belum'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal Guru');
    XLSX.writeFile(wb, `Jurnal_Guru_${semester}.xlsx`);
  };

  // Stats calculation
  const totalEntries = entries.length;
  const totalPelanggaran = entries.filter(e => e.jenis === 'Pelanggaran').length;
  const totalPrestasi = entries.filter(e => e.jenis === 'Prestasi').length;
  const totalIncomplete = entries.filter(e => !e.ditindaklanjuti).length;

  return (
    <div className="p-6 space-y-6">
      <BackgroundDataBanner collectionName="jurnal" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="text-indigo-400" size={24} />
            Jurnal Harian Guru & Buku Catatan Karakter
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Catatan harian kejadian kelas, rekam jejak pelanggaran kedisiplinan, dan apresiasi prestasi siswa.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={14} />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3 py-2 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Printer size={14} />
            PDF
          </button>
          {role !== 'kepsek' && (
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus size={16} />
              Tambah Catatan
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total Catatan</p>
            <p className="text-xl font-bold text-slate-100">{totalEntries}</p>
          </div>
        </div>

        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 text-rose-400 rounded-lg">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400">Pelanggaran</p>
            <p className="text-xl font-bold text-rose-400">{totalPelanggaran}</p>
          </div>
        </div>

        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-lg">
            <Award size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400">Prestasi Siswa</p>
            <p className="text-xl font-bold text-amber-400">{totalPrestasi}</p>
          </div>
        </div>

        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <UserCheck size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400">Belum Selesai</p>
            <p className="text-xl font-bold text-slate-100">{totalIncomplete}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-700/60 space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('semua')}
          className={`pb-3 px-4 text-xs font-semibold transition-all border-b-2 ${
            activeTab === 'semua'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Semua Catatan ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab('jurnal')}
          className={`pb-3 px-4 text-xs font-semibold transition-all border-b-2 ${
            activeTab === 'jurnal'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Jurnal Kelas ({entries.filter(e => e.jenis === 'Kejadian Kelas').length})
        </button>
        <button
          onClick={() => setActiveTab('pelanggaran')}
          className={`pb-3 px-4 text-xs font-semibold transition-all border-b-2 ${
            activeTab === 'pelanggaran'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Buku Pelanggaran ({totalPelanggaran})
        </button>
        <button
          onClick={() => setActiveTab('prestasi')}
          className={`pb-3 px-4 text-xs font-semibold transition-all border-b-2 ${
            activeTab === 'prestasi'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Buku Prestasi ({totalPrestasi})
        </button>
        <button
          onClick={() => setActiveTab('karakter')}
          className={`pb-3 px-4 text-xs font-semibold transition-all border-b-2 ${
            activeTab === 'karakter'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Catatan Karakter ({entries.filter(e => e.jenis === 'Catatan Karakter').length})
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari siswa, isi catatan, atau kata kunci..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={filterStudentId}
          onChange={(e) => setFilterStudentId(e.target.value)}
          className="px-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="">-- Semua Siswa --</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.nama} ({s.kelas})</option>
          ))}
        </select>

        {classList.length > 0 && (
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-slate-200 outline-none focus:border-indigo-500"
          >
            {!isRestrictedClass && <option value="">-- Semua Kelas --</option>}
            {classList.map(c => (
              <option key={c} value={c}>Kelas {c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/30 rounded-2xl border border-slate-700/40 text-slate-400 text-sm">
            Belum ada catatan jurnal atau rekam jejak untuk kategori/filter ini.
          </div>
        ) : (
          filteredEntries.map((item) => {
            const isPelanggaran = item.jenis === 'Pelanggaran';
            const isPrestasi = item.jenis === 'Prestasi';
            const isKarakter = item.jenis === 'Catatan Karakter';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-all ${
                  isPelanggaran
                    ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                    : isPrestasi
                    ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                    : isKarakter
                    ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isPelanggaran
                          ? 'bg-rose-500/20 text-rose-400'
                          : isPrestasi
                          ? 'bg-amber-500/20 text-amber-400'
                          : isKarakter
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-indigo-500/20 text-indigo-400'
                      }`}
                    >
                      {isPelanggaran ? (
                        <AlertTriangle size={18} />
                      ) : isPrestasi ? (
                        <Award size={18} />
                      ) : isKarakter ? (
                        <Sparkles size={18} />
                      ) : (
                        <BookOpen size={18} />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isPelanggaran
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : isPrestasi
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : isKarakter
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {item.jenis}
                        </span>
                        <PendingBadge isPending={isPending('jurnal', item.id)} compact={true} />

                        {item.kategori && (
                          <span className="bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded text-[10px] font-medium">
                            {item.kategori}
                          </span>
                        )}

                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Calendar size={12} className="text-slate-400" />
                          {item.tanggal}
                        </span>

                        {item.nama_siswa && (
                          <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                            <User size={12} />
                            {item.nama_siswa} ({item.kelas})
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-200 leading-relaxed font-medium mt-1">
                        {item.catatan}
                      </p>

                      {item.tindakan && (
                        <p className="text-xs text-indigo-300/90 bg-indigo-950/40 p-2 rounded-lg border border-indigo-500/20 mt-2">
                          <strong className="font-semibold text-indigo-200">Tindakan / Penanganan:</strong> {item.tindakan}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Poin */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/50">
                    {item.poin !== undefined && item.poin !== 0 && (
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          item.poin > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {item.poin > 0 ? `+${item.poin}` : item.poin} Poin
                      </span>
                    )}

                    <button
                      onClick={() => handleSendWA(item)}
                      title="Kirim Catatan ke WA Ortu"
                      className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1 text-xs"
                    >
                      <Send size={14} />
                      <span className="hidden sm:inline">Kirim WA</span>
                    </button>

                    {role !== 'kepsek' && (
                      <>
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="p-2 bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-lg transition-all cursor-pointer"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setItemToDeleteId(item.id)}
                          title="Hapus Catatan"
                          className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 transition-all cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-700/60 flex justify-between items-center bg-slate-800/90 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-100">
                {editingId ? 'Edit Catatan Jurnal' : 'Tambah Catatan Jurnal / Karakter'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tanggal</label>
                    <input
                      type="date"
                      value={formData.tanggal}
                      onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Jenis Catatan</label>
                    <select
                      value={formData.jenis}
                      onChange={(e) => setFormData({ ...formData, jenis: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="Kejadian Kelas">Kejadian Kelas</option>
                      <option value="Pelanggaran">Pelanggaran Kedisiplinan</option>
                      <option value="Prestasi">Prestasi Siswa</option>
                      <option value="Catatan Karakter">Catatan Karakter</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Pilih Siswa (Opsional)</label>
                    <select
                      value={formData.id_siswa}
                      onChange={(e) => {
                        const st = students.find(s => s.id === e.target.value);
                        setFormData({
                          ...formData,
                          id_siswa: e.target.value,
                          kelas: st ? st.kelas : formData.kelas
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Umum / Seluruh Kelas --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.nama} ({s.kelas})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kategori</label>
                    <select
                      value={formData.kategori}
                      onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="Disiplin">Disiplin / Terlambat</option>
                      <option value="Sikap">Sikap / Perilaku</option>
                      <option value="Akademik">Akademik & Tugas</option>
                      <option value="Prestasi">Prestasi & Lomba</option>
                      <option value="Insiden">Insiden / Pertengkaran</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">Isi Catatan Kejadian</label>
                    <VoiceInputButton
                      value={formData.catatan}
                      onTranscript={(transcribedText) => setFormData(prev => ({ ...prev, catatan: transcribedText }))}
                      buttonText="Dikte Suara Catatan"
                      compact={true}
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    placeholder="Tuliskan uraian kejadian atau catatan karakter siswa (atau gunakan Dikte Suara)..."
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">Tindakan Guru / Penanganan (Opsional)</label>
                    <VoiceInputButton
                      value={formData.tindakan}
                      onTranscript={(transcribedText) => setFormData(prev => ({ ...prev, tindakan: transcribedText }))}
                      buttonText="Dikte Suara Penanganan"
                      compact={true}
                    />
                  </div>
                  <input
                    type="text"
                    value={formData.tindakan}
                    onChange={(e) => setFormData({ ...formData, tindakan: e.target.value })}
                    placeholder="Contoh: Diberi teguran lisan, dipanggil orang tua, diberi sertifikat..."
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Poin Karakter (+/-)</label>
                    <input
                      type="number"
                      value={formData.poin}
                      onChange={(e) => setFormData({ ...formData, poin: Number(e.target.value) })}
                      placeholder="Misal: +10 atau -5"
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center pt-2 sm:pt-5">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.ditindaklanjuti}
                        onChange={(e) => setFormData({ ...formData, ditindaklanjuti: e.target.checked })}
                        className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
                      />
                      <span>Penanganan Selesai</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 sm:p-5 border-t border-slate-700/60 bg-slate-800/90 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {itemToDeleteId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 p-5 sm:p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4 text-center my-auto max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Konfirmasi Hapus Catatan</h3>
              <p className="text-xs text-slate-400 mt-1">
                Apakah Anda yakin ingin menghapus catatan jurnal/pelanggaran ini? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToDeleteId(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
