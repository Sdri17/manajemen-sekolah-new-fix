import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, Cloud, X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { store } from '../lib/store';

interface WeeklyBackupModalProps {
  role: string;
  syncData?: () => Promise<void>;
  isSyncing?: boolean;
}

export default function WeeklyBackupModal({ role, syncData, isSyncing }: WeeklyBackupModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (role === 'staf' || role === 'kepsek') return;

    const lastReminder = localStorage.getItem('last_backup_reminder_timestamp');
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    if (!lastReminder || now - parseInt(lastReminder, 10) > SEVEN_DAYS) {
      // Delay pop up slightly for smooth load
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [role]);

  const handleDismiss = () => {
    localStorage.setItem('last_backup_reminder_timestamp', Date.now().toString());
    setIsOpen(false);
  };

  const handleDownloadBackup = async () => {
    try {
      const backupData: any = {
        app: 'EduSync Administrasi Kelas',
        version: '1.0.0',
        backup_date: new Date().toISOString(),
        students: [],
        grades: [],
        attendance: [],
        tasks: [],
        roster: [],
        piket: [],
        jurnal: [],
        kas: [],
        kasLogs: [],
        raporCapaian: [],
        users: []
      };

      await store.students.iterate((v) => { backupData.students.push(v); });
      await store.grades.iterate((v) => { backupData.grades.push(v); });
      await store.attendance.iterate((v) => { backupData.attendance.push(v); });
      await store.tasks.iterate((v) => { backupData.tasks.push(v); });
      await store.roster.iterate((v) => { backupData.roster.push(v); });
      await store.piket.iterate((v) => { backupData.piket.push(v); });
      await store.jurnal.iterate((v) => { backupData.jurnal.push(v); });
      await store.kas.iterate((v) => { backupData.kas.push(v); });
      await store.kasLogs.iterate((v) => { backupData.kasLogs.push(v); });
      await store.raporCapaian.iterate((v) => { backupData.raporCapaian.push(v); });
      await store.users.iterate((v) => { backupData.users.push(v); });
      backupData.settings = await store.settings.getItem('app_settings');

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("download", `Backup_Mingguan_EduSync_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success('File cadangan mingguan (.json) berhasil diunduh!');
      handleDismiss();
    } catch (err: any) {
      toast.error('Gagal mengunduh file cadangan: ' + err.message);
    }
  };

  const handleSyncCloud = async () => {
    if (syncData) {
      await syncData();
      toast.success('Sinkronisasi data ke cloud selesai');
    }
    handleDismiss();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-800 border border-slate-700/80 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-500/30">
            <ShieldCheck size={26} />
          </div>
          <div>
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-indigo-500/30">
              Pengingat Mingguan
            </span>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">Cadangkan Data Kelas Anda</h3>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Sudah 7 hari sejak pengingat terakhir. Untuk mencegah kehilangan data nilai, absensi, dan jurnal siswa, sangat disarankan untuk melakukan pengunduhan berkas cadangan (.json) atau sinkronisasi ke Firebase Cloud.
        </p>

        <div className="space-y-2 pt-2">
          <button
            onClick={handleDownloadBackup}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Download size={16} />
            Unduh Berkas Cadangan (.json)
          </button>

          {syncData && (
            <button
              onClick={handleSyncCloud}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <Cloud size={16} />
              {isSyncing ? 'Sedang Menyinkronkan...' : 'Sinkronkan ke Firebase Cloud'}
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="w-full px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors text-center cursor-pointer"
          >
            Ingatkan Saya Minggu Depan
          </button>
        </div>
      </div>
    </div>
  );
}
