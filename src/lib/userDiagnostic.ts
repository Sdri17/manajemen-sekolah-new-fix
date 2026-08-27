import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { store, AppUser } from './store';

export interface UserDiagnosticReport {
  success: boolean;
  timestamp: string;
  totalUsersChecked: number;
  adminStatus: 'valid' | 'created' | 'repaired';
  cloudUsersSynced: number;
  repairedCount: number;
  details: string[];
}

/**
 * Diagnostic & Harmonization script for 'users' collection initialization and RBAC permissions.
 * Ensures 'admin' account and newly added users are initialized, repaired if broken,
 * and bidirectionally synced between Cloud Firestore and local IndexedDB.
 */
export async function runUsersDiagnosticAndSync(): Promise<UserDiagnosticReport> {
  const details: string[] = [];
  let adminStatus: 'valid' | 'created' | 'repaired' = 'valid';
  let totalUsersChecked = 0;
  let cloudUsersSynced = 0;
  let repairedCount = 0;

  try {
    details.push('=== MEMULAI DIAGNOSTIK & HARMONISASI KOLEKSI USERS ===');

    // 1. Ensure Admin account exists locally with full privileges
    let localAdmin = await store.users.getItem<AppUser>('admin').catch(() => null);
    if (!localAdmin) {
      localAdmin = {
        id: 'admin',
        username: 'admin',
        password: 'adminpassword',
        role: 'admin',
        name: 'Administrator Utama',
        canManageUsers: true,
        canEditSettings: true,
        canExportData: true,
        isReadonly: false,
        updatedAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };
      await store.users.setItem('admin', localAdmin);
      await store.users.setItem('adminpassword', localAdmin);
      adminStatus = 'created';
      details.push('✅ Akun admin lokal dibuat secara otomatis.');
    } else {
      let needsRepair = false;
      if (localAdmin.role !== 'admin' || !localAdmin.canManageUsers || !localAdmin.canEditSettings) {
        localAdmin.role = 'admin';
        localAdmin.canManageUsers = true;
        localAdmin.canEditSettings = true;
        localAdmin.isReadonly = false;
        needsRepair = true;
      }
      if (needsRepair) {
        await store.users.setItem('admin', localAdmin);
        adminStatus = 'repaired';
        details.push('🛠️ Hak akses RBAC akun admin lokal berhasil diperbaiki.');
      } else {
        details.push('✅ Akun admin lokal terverifikasi valid (RBAC Lengkap).');
      }
    }

    // 2. Query Cloud Firestore 'users' collection
    let cloudDocs: { id: string; data: AppUser }[] = [];
    try {
      const colRef = collection(db, 'users');
      const snap = await Promise.race([
        getDocs(colRef),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi Firestore timeout (6 detik)')), 6000))
      ]) as any;

      if (snap && !snap.empty) {
        cloudDocs = snap.docs.map((d: any) => ({ id: d.id, data: d.data() as AppUser }));
        cloudUsersSynced = cloudDocs.length;
        details.push(`☁️ Terhubung ke Firestore Cloud: ditemukan ${cloudUsersSynced} dokumen akun pengguna.`);
      } else {
        details.push('ℹ️ Firestore Cloud collection "users" kosong atau belum terisi.');
      }
    } catch (err: any) {
      details.push(`⚠️ Catatan Koneksi Cloud: ${err?.message || String(err)}`);
    }

    // 3. Push local admin to Cloud Firestore if missing or incomplete in Cloud
    const cloudAdminDoc = cloudDocs.find(d => d.id === 'admin' || d.data?.username?.toLowerCase() === 'admin');
    if (!cloudAdminDoc) {
      try {
        await setDoc(doc(db, 'users', 'admin'), localAdmin, { merge: true });
        details.push('☁️ Mendorong akun admin ke Cloud Firestore (users/admin).');
      } catch (err: any) {
        details.push(`⚠️ Gagal mendorong admin ke Firestore: ${err?.message || String(err)}`);
      }
    }

    // 4. Sweep and harmonize all users between Cloud & Local
    const processedUsernames = new Set<string>();

    for (const item of cloudDocs) {
      totalUsersChecked++;
      const uData = item.data;
      if (!uData || !uData.username) continue;

      const cleanUsername = uData.username.toLowerCase();
      processedUsernames.add(cleanUsername);

      // Verify schema & permissions
      let repaired = false;
      if (uData.role === 'admin' || cleanUsername === 'admin') {
        if (!uData.canManageUsers || !uData.canEditSettings || uData.role !== 'admin') {
          uData.role = 'admin';
          uData.canManageUsers = true;
          uData.canEditSettings = true;
          uData.isReadonly = false;
          repaired = true;
        }
      }

      if (repaired) {
        repairedCount++;
        await setDoc(doc(db, 'users', item.id), uData, { merge: true }).catch(() => {});
        details.push(`🛠️ Memperbaiki izin RBAC untuk pengguna @${cleanUsername} di Cloud.`);
      }

      // Save to local IndexedDB
      const docKey = uData.id || item.id;
      await store.users.setItem(docKey, uData);
      await store.users.setItem(cleanUsername, uData);
    }

    // 5. Sweep remaining local users that were not in Cloud and push them
    await store.users.iterate<AppUser, void>(async (u, key) => {
      if (u && u.username && !key.startsWith('_')) {
        const cleanUname = u.username.toLowerCase();
        if (!processedUsernames.has(cleanUname)) {
          totalUsersChecked++;
          processedUsernames.add(cleanUname);
          const docId = u.id || cleanUname;
          await setDoc(doc(db, 'users', docId), u, { merge: true }).catch(() => {});
          details.push(`☁️ Mendorong pengguna lokal @${cleanUname} ke Cloud Firestore.`);
        }
      }
    });

    // Notify application UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    }

    details.push('🎉 Harmonisasi & diagnosa koleksi users berhasil diselesaikan!');

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalUsersChecked,
      adminStatus,
      cloudUsersSynced,
      repairedCount,
      details
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    details.push(`❌ Terjadi kesalahan saat diagnosa: ${errorMsg}`);
    return {
      success: false,
      timestamp: new Date().toISOString(),
      totalUsersChecked,
      adminStatus,
      cloudUsersSynced,
      repairedCount,
      details
    };
  }
}
