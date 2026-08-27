import { store, Settings, defaultSettings } from './store';

/**
 * Normalizes class strings (e.g. trim)
 */
function normalizeClassName(c: string): string {
  return String(c || '').trim();
}

const DEFAULT_DUMMY_CLASSES = ['7-A', '7-B', '8-A', '8-B', '9-A', '9-B'];

/**
 * Merges settings.daftar_kelas and all student.kelas from IndexedDB store.students.
 * Removes duplicates (case-insensitive), excludes empty or 'Alumni'.
 * Automatically purges unused default dummy classes (e.g. 7-A..9-B) if students exist in other classes.
 *
 * @returns The unified list of classes.
 */
export async function syncAndGetClasses(): Promise<string[]> {
  try {
    const settings = (await store.settings.getItem<Settings>('app_settings')) || defaultSettings;
    const configuredClasses: string[] = Array.isArray(settings.daftar_kelas) ? [...settings.daftar_kelas] : [];

    // Collect all student classes from store.students & count student occurrences per class
    const studentClassCounts = new Map<string, number>();
    const studentClasses: string[] = [];
    await store.students.iterate((student: any) => {
      if (student && student.kelas) {
        const rawClass = normalizeClassName(student.kelas);
        if (rawClass && rawClass.toLowerCase() !== 'alumni') {
          const upper = rawClass.toUpperCase();
          studentClassCounts.set(upper, (studentClassCounts.get(upper) || 0) + 1);
          studentClasses.push(rawClass);
        }
      }
    });

    const hasStudents = studentClasses.length > 0;

    // Filter configured classes: remove dummy default classes if they have 0 registered students
    const cleanedConfigured = configuredClasses.filter(c => {
      const clean = normalizeClassName(c);
      if (!clean || clean.toLowerCase() === 'alumni') return false;
      const upper = clean.toUpperCase();
      const isDummy = DEFAULT_DUMMY_CLASSES.some(d => d.toUpperCase() === upper);
      if (hasStudents && isDummy && (studentClassCounts.get(upper) || 0) === 0) {
        return false; // Purge unused dummy class
      }
      return true;
    });

    // Merge preserves order of existing settings.daftar_kelas, and appends new student classes
    const resultMap = new Map<string, string>();
    cleanedConfigured.forEach(c => {
      const clean = normalizeClassName(c);
      if (clean && !resultMap.has(clean.toUpperCase())) {
        resultMap.set(clean.toUpperCase(), clean);
      }
    });

    studentClasses.forEach(c => {
      if (!resultMap.has(c.toUpperCase())) {
        resultMap.set(c.toUpperCase(), c);
      }
    });

    const finalClasses = Array.from(resultMap.values());

    // Check if the saved list of classes changed
    const origUpper = configuredClasses.map(c => normalizeClassName(c).toUpperCase()).join('|');
    const finalUpper = finalClasses.map(c => c.toUpperCase()).join('|');

    if (origUpper !== finalUpper) {
      const updatedSettings: Settings = {
        ...settings,
        daftar_kelas: finalClasses
      };
      await store.settings.setItem('app_settings', updatedSettings);
      await store.syncQueue.setItem('settings::app_settings', 'updated');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
    }

    return finalClasses;
  } catch (err) {
    console.error('[classHelper] Error syncing student classes:', err);
    return [];
  }
}

/**
 * Synchronous helper function to merge an array of student objects with settings daftar_kelas
 */
export function getMergedClassesFromStudents(students: any[], settingsDaftarKelas?: string[]): string[] {
  const baseClasses = Array.isArray(settingsDaftarKelas) ? settingsDaftarKelas : [];

  const studentClassCounts = new Map<string, number>();
  const studentClasses: string[] = [];

  if (Array.isArray(students)) {
    students.forEach(s => {
      if (s && s.kelas) {
        const clean = normalizeClassName(s.kelas);
        if (clean && clean.toLowerCase() !== 'alumni') {
          const upper = clean.toUpperCase();
          studentClassCounts.set(upper, (studentClassCounts.get(upper) || 0) + 1);
          studentClasses.push(clean);
        }
      }
    });
  }

  const hasStudents = studentClasses.length > 0;

  // Filter out dummy default classes if they have 0 students
  const cleanedBase = baseClasses.filter(c => {
    const clean = normalizeClassName(c);
    if (!clean || clean.toLowerCase() === 'alumni') return false;
    const upper = clean.toUpperCase();
    const isDummy = DEFAULT_DUMMY_CLASSES.some(d => d.toUpperCase() === upper);
    if (hasStudents && isDummy && (studentClassCounts.get(upper) || 0) === 0) {
      return false;
    }
    return true;
  });

  const resultMap = new Map<string, string>();
  cleanedBase.forEach(c => {
    const clean = normalizeClassName(c);
    if (clean && !resultMap.has(clean.toUpperCase())) {
      resultMap.set(clean.toUpperCase(), clean);
    }
  });

  studentClasses.forEach(c => {
    if (!resultMap.has(c.toUpperCase())) {
      resultMap.set(c.toUpperCase(), c);
    }
  });

  return Array.from(resultMap.values());
}
