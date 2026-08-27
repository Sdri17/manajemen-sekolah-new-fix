import { RaporCapaian, getGradePredicate } from '../models/rapor.model';
import { store } from '../lib/store';

export class RaporController {
  /**
   * Get Rapor Capaian for a student
   */
  static async getRaporCapaian(studentId: string, semester: string): Promise<RaporCapaian | null> {
    let found: RaporCapaian | null = null;
    await store.raporCapaian.iterate<RaporCapaian, void>((item) => {
      if (item && item.id_siswa === studentId && (item.semester === semester || !item.semester)) {
        found = item;
      }
    });
    return found;
  }

  /**
   * Save or Update Rapor Capaian
   */
  static async saveRaporCapaian(raporData: RaporCapaian): Promise<RaporCapaian> {
    await store.raporCapaian.setItem(raporData.id, raporData);
    return raporData;
  }

  /**
   * Get Predicate details for a score
   */
  static evaluateScore(score: number, kkm: number = 75) {
    return getGradePredicate(score, kkm);
  }
}
