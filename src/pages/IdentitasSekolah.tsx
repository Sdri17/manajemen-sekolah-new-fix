import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, store, defaultSettings } from '../lib/store';
import { Save, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function IdentitasSekolah({ settings, setSettings }: { settings: SettingsType | null, setSettings: (s: SettingsType | null) => void }) {
  const [formData, setFormData] = useState<SettingsType>(settings || defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [newSemester, setNewSemester] = useState('');

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addSemester = () => {
    if (newSemester.trim() && !formData.daftar_semester?.includes(newSemester.trim())) {
      setFormData(prev => ({
        ...prev,
        daftar_semester: [...(prev.daftar_semester || []), newSemester.trim()]
      }));
      setNewSemester('');
    }
  };

  const removeSemester = (sem: string) => {
    setFormData(prev => {
      const newDaftar = (prev.daftar_semester || []).filter(s => s !== sem);
      return { 
        ...prev, 
        daftar_semester: newDaftar,
        semester_aktif: prev.semester_aktif === sem ? (newDaftar[0] || '') : prev.semester_aktif
      };
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (e.g. 1.5MB to be safe for localstorage limits)
    if (file.size > 1500000) {
      toast.error('Ukuran logo terlalu besar. Maksimal 1.5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      setFormData(prev => ({
        ...prev,
        kop_logo_base64: base64
      }));
      toast.success('Logo kustom berhasil diunggah!');
    };
    reader.onerror = () => {
      toast.error('Gagal mengunggah logo.');
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setFormData(prev => ({
      ...prev,
      kop_logo_base64: ''
    }));
    toast.success('Logo kustom dihapus.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await store.settings.setItem('app_settings', formData);
      await store.settings.setItem('current', formData);
      setSettings(formData);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('delta-data-changed', {
          detail: { storeName: 'settings', docId: 'app_settings', action: 'upsert', data: formData }
        }));
        window.dispatchEvent(new Event('data-changed'));
      }
      toast.success('Identitas Sekolah berhasil disimpan & disinkronkan ke Cloud Database.', { duration: 3000 });
    } catch (e) {
      console.error(e);
      toast.error('Gagal menyimpan Identitas Sekolah.', { duration: 3000 });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 text-slate-200 h-full overflow-auto custom-scrollbar">
      <form onSubmit={handleSave} className="space-y-8 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3">Identitas Sekolah & Kelas</h3>
            
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Sekolah</label>
              <input type="text" name="nama_sekolah" value={formData.nama_sekolah ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NPSN</label>
              <input type="text" name="npsn" value={formData.npsn ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Alamat Sekolah</label>
              <input type="text" name="alamat" value={formData.alamat ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email Sekolah</label>
              <input type="email" name="email" value={formData.email ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Kepala Sekolah</label>
              <input type="text" name="nama_kepala_sekolah" value={formData.nama_kepala_sekolah ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NIP Kepala Sekolah</label>
              <input type="text" name="nip_kepala_sekolah" value={formData.nip_kepala_sekolah ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <label className="block text-xs font-medium text-indigo-400 mb-1.5 uppercase tracking-wider">Sistem Hari Kerja / Sekolah</label>
              <select 
                name="hari_sekolah" 
                value={formData.hari_sekolah ?? 5} 
                onChange={(e) => setFormData(prev => ({ ...prev, hari_sekolah: parseInt(e.target.value, 10) as 5 | 6 }))} 
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-indigo-500/30 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-indigo-300 text-sm transition-all cursor-pointer font-medium"
              >
                <option value={5}>📅 5 Hari Sekolah (Senin - Jumat)</option>
                <option value={6}>📅 6 Hari Sekolah (Senin - Sabtu)</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Mengatur apakah hari Sabtu dianggap sebagai hari efektif sekolah atau hari libur akhir pekan pada Absensi, Roster, dan Piket.</p>
            </div>
            
            <div className="pt-4 border-t border-slate-700/50">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Kelas</label>
              <input type="text" name="nama_kelas" value={formData.nama_kelas ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Wali Kelas</label>
              <input type="text" name="nama_wali_kelas" value={formData.nama_wali_kelas ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NIP Wali Kelas</label>
              <input type="text" name="nip_wali_kelas" value={formData.nip_wali_kelas ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
            </div>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3">Pengaturan Semester</h3>
            
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Semester Aktif</label>
              <select name="semester_aktif" value={formData.semester_aktif ?? ''} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all cursor-pointer" required>
                {(formData.daftar_semester || []).map(sem => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Daftar Semester</label>
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" 
                  value={newSemester} 
                  onChange={(e) => setNewSemester(e.target.value)} 
                  placeholder="Semester Baru"
                  className="flex-1 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                />
                <button type="button" onClick={addSemester} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl flex items-center gap-1 text-sm font-medium transition-colors">
                  <Plus size={16} /> Tambah
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {(formData.daftar_semester || []).map(sem => (
                  <div key={sem} className="flex justify-between items-center bg-slate-900/30 px-3 py-2 rounded-lg border border-slate-700/30">
                    <span className="text-sm">{sem}</span>
                    <button type="button" onClick={() => removeSemester(sem)} className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pengaturan KOP Surat */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
            <div>
              <h3 className="text-lg font-medium text-slate-200">Konfigurasi Kop Surat Resmi</h3>
              <p className="text-xs text-slate-400 mt-0.5">Atur kop surat resmi sekolah yang akan ditampilkan pada dokumen cetak PDF (Roster, Piket, Absensi, Nilai, Ekspor Terpadu).</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-700/80 hover:bg-slate-900 transition-all">
              <input 
                type="checkbox"
                name="tampilkan_kop_surat"
                checked={formData.tampilkan_kop_surat ?? true}
                onChange={(e) => setFormData(prev => ({ ...prev, tampilkan_kop_surat: e.target.checked }))}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-200">Gunakan Kop Surat</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kop Baris 1 (Pemerintah Kota / Kabupaten)</label>
                <input 
                  type="text" 
                  name="kop_pemerintah" 
                  value={formData.kop_pemerintah ?? 'PEMERINTAH KOTA / KABUPATEN'} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kop Baris 2 (Dinas Pendidikan)</label>
                <input 
                  type="text" 
                  name="kop_dinas" 
                  value={formData.kop_dinas ?? 'DINAS PENDIDIKAN DAN KEBUDAYAAN'} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tipe Logo Kop</label>
                <select 
                  name="kop_logo_type" 
                  value={formData.kop_logo_type ?? 'tutwuri'} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all cursor-pointer"
                >
                  <option value="tutwuri">Logo Tut Wuri Handayani (Vector Bawaan)</option>
                  <option value="custom">Logo Kustom (Unggah Gambar)</option>
                  <option value="none">Tanpa Logo</option>
                </select>
              </div>

              {formData.kop_logo_type === 'custom' && (
                <div className="p-4 bg-slate-900/30 border border-slate-700/50 rounded-xl flex items-center gap-4">
                  {formData.kop_logo_base64 ? (
                    <div className="relative group shrink-0">
                      <img src={formData.kop_logo_base64} alt="Logo Sekolah" className="w-16 h-16 object-contain rounded-lg border border-slate-700 bg-slate-950 p-1" />
                      <button 
                        type="button" 
                        onClick={removeLogo} 
                        className="absolute -top-2 -right-2 bg-rose-500 hover:bg-rose-600 text-white p-1 rounded-full shadow-lg transition-colors"
                        title="Hapus Logo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed border-slate-700 bg-slate-950/30 flex items-center justify-center text-slate-600 shrink-0 font-medium text-[10px]">
                      No Image
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-400 mb-1">Unggah File Logo</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoUpload} 
                      className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer" 
                    />
                    <p className="text-[10px] text-slate-500 mt-1">PNG atau JPG (Maks 1.5MB)</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-700/50 flex justify-end">
          <button 
            type="submit" 
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-xl hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 font-medium transition-all"
          >
            <Save size={18} />
            Simpan Identitas
          </button>
        </div>
      </form>
    </div>
  );
}
