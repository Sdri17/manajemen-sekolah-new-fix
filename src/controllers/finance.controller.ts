import { KasEntry, KasSummary, calculateKasSummary, KasActivityLog } from '../models/finance.model';
import { store } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';

export class FinanceController {
  /**
   * Get all Kas Entries for a class and semester
   */
  static async getKasEntries(kelas: string, semester: string): Promise<KasEntry[]> {
    const list: KasEntry[] = [];
    await store.kas.iterate<KasEntry, void>((item) => {
      if (item && (item.kelas === kelas || !item.kelas) && (item.semester === semester || !item.semester)) {
        list.push(item);
      }
    });
    return list;
  }

  /**
   * Calculate current summary balance
   */
  static getSummary(entries: KasEntry[]): KasSummary {
    return calculateKasSummary(entries);
  }

  /**
   * Add a new Kas Transaction
   */
  static async addKasEntry(
    entry: Omit<KasEntry, 'id'>,
    username: string,
    userRole?: string
  ): Promise<KasEntry> {
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    const initialLog: KasActivityLog = {
      id: uuidv4(),
      kas_id: id,
      timestamp,
      action: 'create',
      action_label: 'Menginput',
      user: username,
      user_role: userRole,
      keterangan_transaksi: entry.keterangan,
      nominal: entry.nominal,
      jenis: entry.jenis
    };

    const record: KasEntry = {
      ...entry,
      id,
      created_at: timestamp,
      updated_at: timestamp,
      last_modified_by: username,
      history: [initialLog]
    };

    await store.kas.setItem(id, record);
    return record;
  }

  /**
   * Delete Kas Entry
   */
  static async deleteKasEntry(id: string): Promise<void> {
    await store.kas.removeItem(id);
  }
}
