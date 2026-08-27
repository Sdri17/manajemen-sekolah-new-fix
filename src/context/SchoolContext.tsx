import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { store, SchoolSettings, Settings } from '../lib/store';

export const defaultSchoolSettings: SchoolSettings = {
  id: 'global',
  nama_sekolah: 'SD NEGERI 091473 P. SIANTAR',
  npsn: '10200123',
  alamat: 'Jl. Merdeka No. 45, Kota Pematang Siantar',
  kota_kabupaten: 'Pematang Siantar',
  provinsi: 'Sumatera Utara',
  telepon: '(0622) 234567',
  email: 'sdn091473@sch.id',
  website: 'https://sdn091473.sch.id',
  nama_kepala_sekolah: 'Bpk. Headmaster, S.Pd., M.M.',
  nip_kepala_sekolah: '19750101 200003 1 001',
  kop_pemerintah: 'PEMERINTAH KOTA PEMATANG SIANTAR',
  kop_dinas: 'DINAS PENDIDIKAN DAN KEBUDAYAAN',
  kop_logo_type: 'tutwuri',
  logo_url: '',
  kop_logo_base64: '',
  tahun_ajaran_aktif: '2025/2026',
  semester_aktif: 'Ganjil'
};

interface SchoolContextType {
  schoolInfo: SchoolSettings;
  updateSchoolInfo: (updates: Partial<SchoolSettings>) => Promise<void>;
  isLoading: boolean;
  refreshSchoolInfo: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings>(defaultSchoolSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSchoolInfo = useCallback(async () => {
    try {
      let saved = await store.school_settings.getItem<SchoolSettings>('global');
      if (!saved) {
        // Fallback to legacy settings if school_settings is not populated yet
        const appSet = await store.settings.getItem<Settings>('app_settings');
        if (appSet && appSet.nama_sekolah) {
          saved = {
            id: 'global',
            nama_sekolah: appSet.nama_sekolah || defaultSchoolSettings.nama_sekolah,
            npsn: appSet.npsn || defaultSchoolSettings.npsn,
            alamat: appSet.alamat || defaultSchoolSettings.alamat,
            email: appSet.email || defaultSchoolSettings.email,
            nama_kepala_sekolah: appSet.nama_kepala_sekolah || defaultSchoolSettings.nama_kepala_sekolah,
            nip_kepala_sekolah: appSet.nip_kepala_sekolah || defaultSchoolSettings.nip_kepala_sekolah,
            kop_pemerintah: appSet.kop_pemerintah || defaultSchoolSettings.kop_pemerintah,
            kop_dinas: appSet.kop_dinas || defaultSchoolSettings.kop_dinas,
            kop_logo_type: appSet.kop_logo_type || 'tutwuri',
            kop_logo_base64: appSet.kop_logo_base64 || '',
            tahun_ajaran_aktif: '2025/2026',
            semester_aktif: 'Ganjil'
          };
          await store.school_settings.setItem('global', saved).catch(() => {});
        } else {
          saved = defaultSchoolSettings;
          await store.school_settings.setItem('global', defaultSchoolSettings).catch(() => {});
        }
      }
      setSchoolInfo(saved);
    } catch (err) {
      console.warn('[SchoolContext] Failed to load school settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSchoolInfo = useCallback(async (updates: Partial<SchoolSettings>) => {
    const updated: SchoolSettings = {
      ...schoolInfo,
      ...updates,
      id: 'global',
      lastModified: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setSchoolInfo(updated);
    await store.school_settings.setItem('global', updated);

    // Also sync key identity fields back to app_settings for backward compatibility
    const currentSet = await store.settings.getItem<Settings>('app_settings') || {} as any;
    await store.settings.setItem('app_settings', {
      ...currentSet,
      nama_sekolah: updated.nama_sekolah,
      npsn: updated.npsn,
      alamat: updated.alamat,
      email: updated.email,
      nama_kepala_sekolah: updated.nama_kepala_sekolah,
      nip_kepala_sekolah: updated.nip_kepala_sekolah,
      kop_pemerintah: updated.kop_pemerintah,
      kop_dinas: updated.kop_dinas,
      kop_logo_type: updated.kop_logo_type,
      kop_logo_base64: updated.kop_logo_base64
    });
  }, [schoolInfo]);

  useEffect(() => {
    refreshSchoolInfo();

    const handleDataChange = (evt?: any) => {
      if (!evt?.detail?.storeName || evt.detail.storeName === 'school_settings' || evt.detail.storeName === 'settings') {
        refreshSchoolInfo();
      }
    };

    window.addEventListener('data-changed', handleDataChange);
    window.addEventListener('delta-data-changed', handleDataChange);
    window.addEventListener('sync-status-changed', handleDataChange);

    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      window.removeEventListener('delta-data-changed', handleDataChange);
      window.removeEventListener('sync-status-changed', handleDataChange);
    };
  }, [refreshSchoolInfo]);

  return (
    <SchoolContext.Provider value={{ schoolInfo, updateSchoolInfo, isLoading, refreshSchoolInfo }}>
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};
