import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { store, Student, Settings, StudentTask, Attendance, resumeSyncQueue } from '../lib/store';
import { generateClassDataAndAttendancePDF } from '../lib/classReportPdf';
import { syncAndGetClasses, getMergedClassesFromStudents } from '../lib/classHelper';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { pushDataToSheets, sendDeleteToGoogleSheets, cascadeDeleteStudent, cascadeDeleteSelectedStudents, cascadeDeleteAllStudents, validateStudentDataWithReport, StudentValidationReport } from '../lib/sync';
import { pushAllLocalDataToFirebase, deleteDocFromFirebase } from '../lib/firebaseSync';
import { normalizeStudentRecord, parseAndNormalizeBackup } from '../lib/backupHelper';
import { formatWhatsAppNumber } from '../lib/WhatsAppSender';
import { v4 as uuidv4 } from 'uuid';
import { Download, Upload, Plus, Edit2, Trash2, Settings as SettingsIcon, X, User, LineChart, TrendingUp, Calendar, Award, Activity, ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle, GraduationCap, QrCode, Bell, MessageSquare, CheckCircle2 } from 'lucide-react';
import StudentQRCodeModal from '../components/StudentQRCodeModal';
import NaikKelasModal from '../components/NaikKelasModal';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { usePendingSync } from '../hooks/usePendingSync';
import { PendingBadge } from '../components/PendingBadge';
import BackgroundDataBanner from '../components/BackgroundDataBanner';
import LockingIndicator from '../components/LockingIndicator';
import { useDocumentLocking } from '../lib/documentLock';
import ImportDiagnosticModal, { ImportLogItem, ImportDiagnosticReport, ImportRowDetail } from '../components/ImportDiagnosticModal';
import ImportPreviewModal from '../components/ImportPreviewModal';

export default function DataSiswa({ semester, role, settings, setSettings }: { semester: string, role: 'guru' | 'kepsek', settings: Settings | null, setSettings?: (s: Settings | null) => void }) {
  const { isPending } = usePendingSync();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Student>>({});
  
  const [searchName, setSearchName] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showKepsekSig, setShowKepsekSig] = useState<boolean>(settings?.show_ttd_kepsek ?? true);

  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [selectedBulkStatus, setSelectedBulkStatus] = useState<string>('Aktif');
  const [isBulkClassModalOpen, setIsBulkClassModalOpen] = useState(false);
  const [selectedBulkClass, setSelectedBulkClass] = useState<string>('');
  const [dbClasses, setDbClasses] = useState<string[]>([]);
  const [isNaikKelasOpen, setIsNaikKelasOpen] = useState(false);

  // QR Code Cards Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedQrStudent, setSelectedQrStudent] = useState<Student | null>(null);

  // Diagnostic Import Logs Modal State
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [lastDiagnosticReport, setLastDiagnosticReport] = useState<ImportDiagnosticReport | null>(null);

  // Import Preview Phase Modal State
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [pendingImportContext, setPendingImportContext] = useState<{
    importedStudents: Student[];
    validationReport: StudentValidationReport;
    report: ImportDiagnosticReport;
    fileName: string;
    fileSize?: string;
    fileInput: HTMLInputElement;
  } | null>(null);

  const handleFinalizeImport = async (sanitizedStudents: any[], autoFixApplied: boolean) => {
    setIsPreviewModalOpen(false);
    if (!pendingImportContext) return;

    const { report, fileInput } = pendingImportContext;
    const studentsToSave = sanitizedStudents && sanitizedStudents.length > 0 
      ? sanitizedStudents 
      : pendingImportContext.importedStudents;

    const addLog = (level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR', step: ImportLogItem['step'], message: string, details?: string) => {
      report.logs.push({
        id: uuidv4(),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        level,
        step,
        message,
        details
      });
    };

    addLog('INFO', 'INDEXEDDB_SAVE', `Finalisasi Impor (${autoFixApplied ? 'Auto-Sanitize Aktif' : 'Raw Data'}): Menyimpan ${studentsToSave.length} siswa ke database lokal (IndexedDB)...`);
    resumeSyncQueue();
    let importCount = 0;

    for (const student of studentsToSave) {
      try {
        await store.students.setItem(student.id, student);
        await store.syncQueue.setItem(`students::${student.id}`, 'updated');
        importCount++;
      } catch (itemErr: any) {
        report.errorCount++;
        addLog('ERROR', 'INDEXEDDB_SAVE', `Gagal menyimpan siswa "${student.nama}" (ID: ${student.id}) ke IndexedDB: ${itemErr?.message || itemErr}`, itemErr?.stack);
      }
    }

    report.indexedDbSaved = importCount;
    report.successCount = importCount;
    addLog('SUCCESS', 'INDEXEDDB_SAVE', `Berhasil menyimpan ${importCount} dari ${studentsToSave.length} siswa ke IndexedDB lokal.`);

    resumeSyncQueue();
    await syncAndGetClasses();
    await loadStudents();

    window.dispatchEvent(new Event('sync-status-changed'));
    window.dispatchEvent(new Event('data-changed'));

    addLog('INFO', 'FIREBASE_SYNC', 'Menyinkronkan data siswa hasil impor ke Cloud Firebase...');

    try {
      await pushAllLocalDataToFirebase();
      report.firebaseSynced = importCount;
      addLog('SUCCESS', 'FIREBASE_SYNC', `Seluruh data ${importCount} siswa berhasil diunggah & disinkronkan ke Cloud Firebase!`);
      toast.success(`Berhasil mengimpor ${importCount} siswa!`);
    } catch (syncErr: any) {
      console.warn('[DataSiswa Import Sync Error]:', syncErr);
      const errMsg = syncErr?.message || String(syncErr);
      const isPermissionErr = errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('denied');

      if (isPermissionErr) {
        report.hasFirestorePermissionError = true;
        addLog('ERROR', 'FIREBASE_SYNC', 'Permission Firestore Denied: Hak akses menulis tidak mencukupi.', errMsg);
      } else {
        addLog('WARN', 'FIREBASE_SYNC', `Gagal menyinkronkan data ke Cloud Firebase: ${errMsg}. Data tetap tersimpan secara lokal.`, errMsg);
      }

      report.warnCount++;
      toast.error(`Data ${importCount} siswa tersimpan secara lokal, namun gagal terhubung ke Cloud Firebase. Lihat detail diagnosa.`);
    } finally {
      setLastDiagnosticReport({ ...report });
      setIsDiagnosticModalOpen(true);
      if (fileInput) fileInput.value = '';
      setPendingImportContext(null);
    }
  };

  const [grades, setGrades] = useState<any[]>([]);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  const loadAttendance = async () => {
    try {
      const list: Attendance[] = [];
      await store.attendance.iterate<Attendance, void>((a) => {
        if (!a.semester || a.semester === semester) {
          list.push(a);
        }
      });
      setAttendance(list);
    } catch (e) {
      console.warn('Error loading attendance in DataSiswa:', e);
    }
  };
  const [selectedTaskReminderStudent, setSelectedTaskReminderStudent] = useState<Student | null>(null);
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [mapelFilter, setMapelFilter] = useState<string>('Semua');
  const [semesterFilter, setSemesterFilter] = useState<string>('Semua');
  const [jenisNilaiFilter, setJenisNilaiFilter] = useState<string>('Semua');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  // Dynamic columns state
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Table sorting states
  const [sortField, setSortField] = useState<string>('no');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchName, filterClass, semester]);

  const loadTasks = async () => {
    try {
      const currentUser = getCurrentUser();
      const list: StudentTask[] = [];
      await store.tasks.iterate<StudentTask, void>((t) => {
        if (!t.semester || t.semester === semester) {
          list.push(t);
        }
      });
      const filtered = filterRecordsForUser(currentUser, list);
      setTasks(filtered);
    } catch (e) {
      console.warn('Error loading tasks in DataSiswa:', e);
    }
  };

  const studentUnsubmittedTasksMap = useMemo(() => {
    const map = new Map<string, StudentTask[]>();
    students.forEach((s) => {
      const unsubmitted = tasks.filter((t) => {
        const matchClass = !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase();
        const matchSemester = !t.semester || t.semester === semester;
        const isCompleted = !!t.penyelesaian?.[s.id];
        return matchClass && matchSemester && !isCompleted;
      });
      map.set(s.id, unsubmitted);
    });
    return map;
  }, [students, tasks, semester]);

  useEffect(() => {
    loadStudents();
    cleanDummyData();
    loadDbClasses();
    loadGrades();
    loadTasks();
    loadAttendance();
  }, [semester]);

  useDocumentLocking('students', isEditing && isEditing !== 'new' ? isEditing : null, isEditing !== null);

  useEffect(() => {
    const handleDeltaData = (e: CustomEvent) => {
      const { storeName, docId, action, data } = e.detail || {};
      if (storeName === 'tasks') {
        loadTasks();
      }
      if (storeName === 'students' && docId) {
        setStudents((prev) => {
          if (action === 'delete') {
            return prev.filter((s) => s.id !== docId);
          } else if (action === 'upsert' && data) {
            const exists = prev.some((s) => s.id === docId);
            if (exists) {
              return prev.map((s) => (s.id === docId ? { ...s, ...data } : s));
            } else {
              return [...prev, data];
            }
          }
          return prev;
        });
      }
    };

    window.addEventListener('delta-data-changed' as any, handleDeltaData as EventListener);
    return () => {
      window.removeEventListener('delta-data-changed' as any, handleDeltaData as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleDataChanged = () => {
      if (isEditing || Object.keys(formData).length > 0 || isManagingColumns || isNaikKelasOpen || isDeletingSelected || isDeletingAll || isBulkStatusModalOpen || isBulkClassModalOpen) return; // Isolate active editing form inputs from background re-renders
      loadStudents();
      loadDbClasses();
      loadGrades();
      loadTasks();
      loadAttendance();
    };
    window.addEventListener('data-changed', handleDataChanged);
    window.addEventListener('apply-buffered-data', handleDataChanged);
    return () => {
      window.removeEventListener('data-changed', handleDataChanged);
      window.removeEventListener('apply-buffered-data', handleDataChanged);
    };
  }, [semester, isEditing, formData, isManagingColumns, isNaikKelasOpen, isDeletingSelected, isDeletingAll, isBulkStatusModalOpen, isBulkClassModalOpen]);

  const isStandardStudentField = (fieldName: string) => {
    if (!fieldName || typeof fieldName !== 'string') return true;
    const norm = fieldName.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const standardKeys = [
      'id', 'no', 'nama', 'nisn', 'nipd', 'jenis_kelamin', 'tempat_lahir', 
      'tanggal_lahir', 'kelas', 'nama_ayah', 'nama_ibu', 'no_telp_ortu', 
      'nomor_telepon', 'nama_orang_tua', 'semester', 'tanggal_lulus', 
      'tahun_ajaran_lulus', 'jk', 'gender', 'no_hp', 'no_telp', 'status', 'alumni'
    ];
    return standardKeys.includes(norm);
  };

  const getCustomStudentColumns = (cols?: string[]) => {
    if (!cols || !Array.isArray(cols)) return [];
    const unique = new Set<string>();
    const result: string[] = [];
    cols.forEach(col => {
      if (!col || typeof col !== 'string') return;
      const trimmed = col.trim();
      const norm = trimmed.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (norm && !isStandardStudentField(trimmed) && !unique.has(norm)) {
        unique.add(norm);
        result.push(trimmed);
      }
    });
    return result;
  };

  const handleAddCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    const colName = newColumnName.trim();
    if (!colName) return;
    
    if (isStandardStudentField(colName)) {
      toast.error('Nama kolom bertabrakan dengan kolom standar bawaan!');
      return;
    }

    const currentCols = getCustomStudentColumns(settings?.custom_student_columns);
    const colNorm = colName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (currentCols.some(c => c.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') === colNorm)) {
      toast.error('Kolom ini sudah ada!');
      return;
    }

    const updatedCols = [...currentCols, colName];
    const updatedSettings = {
      ...(settings || {}),
      custom_student_columns: updatedCols
    } as Settings;

    await store.settings.setItem('app_settings', updatedSettings);
    if (setSettings) {
      setSettings(updatedSettings);
    }
    setNewColumnName('');
    toast.success(`Kolom tambahan "${colName}" berhasil dibuat!`);
  };

  const handleDeleteCustomColumn = async (colName: string) => {
    const currentCols = settings?.custom_student_columns || [];
    const updatedCols = currentCols.filter(c => c !== colName);
    const updatedSettings = {
      ...(settings || {}),
      custom_student_columns: updatedCols
    } as Settings;

    await store.settings.setItem('app_settings', updatedSettings);
    if (setSettings) {
      setSettings(updatedSettings);
    }
    toast.success(`Kolom tambahan "${colName}" telah dihapus!`);
  };

  const loadDbClasses = async () => {
    const list: string[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (val.kelas && !list.includes(val.kelas)) {
        list.push(val.kelas);
      }
    });
    setDbClasses(list.sort());
  };

  const cleanDummyData = async () => {
    let deletedCount = 0;
    const idsToDelete: string[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (!val) return;
      const sName = val.nama ? String(val.nama).trim() : '';
      // Only remove empty/corrupt records without a valid student name
      if (!sName || sName === '-' || sName.toLowerCase() === 'undefined' || sName.toLowerCase() === 'null') {
        idsToDelete.push(val.id);
      }
    });
    for (const id of idsToDelete) {
      await store.students.removeItem(id);
      await store.syncQueue.setItem(`students::${id}`, 'deleted');
      deleteDocFromFirebase('students', id).catch(() => {});
      sendDeleteToGoogleSheets('students', id);
      deletedCount++;
    }
    if (deletedCount > 0) {
      toast.success(`Berhasil membersihkan ${deletedCount} data siswa kosong dari sistem!`);
      loadStudents();
    }
  };

  const loadGrades = async () => {
    try {
      const list: any[] = [];
      await store.grades.iterate((g: any) => {
        list.push(g);
      });
      setGrades(list);
    } catch (err) {
      console.error("Error loading grades:", err);
    }
  };

  const currentUser = getCurrentUser();
  const assignedClasses = getAssignedClasses(currentUser);
  const assignedClassesKey = assignedClasses.join(',');
  const isRestrictedClass = !assignedClasses.includes('*');

  useEffect(() => {
    if (isRestrictedClass && assignedClasses.length > 0) {
      if (filterClass && !assignedClasses.some(c => c.toLowerCase() === filterClass.toLowerCase())) {
        if (assignedClasses[0] && filterClass !== assignedClasses[0]) {
          setFilterClass(assignedClasses[0]);
        }
      }
    }
  }, [isRestrictedClass, assignedClassesKey, filterClass]);

  const loadStudents = async () => {
    const list: Student[] = [];
    const invalidIdsToRemove: string[] = [];
    let totalIterated = 0;

    await store.students.iterate<Student, void>((val, key) => {
      totalIterated++;
      if (!val) {
        if (key) invalidIdsToRemove.push(key);
        return;
      }
      const keyStr = String(key || '');
      const valId = String(val.id || '');
      // Automatically purge diagnostic/startup test docs starting with '_'
      if (keyStr.startsWith('_') || valId.startsWith('_') || keyStr.includes('diagnostic') || keyStr.includes('verify')) {
        if (keyStr) invalidIdsToRemove.push(keyStr);
        return;
      }
      const sName = String(val.nama || '').trim();
      if (!sName || sName === '-' || sName.toLowerCase() === 'undefined' || sName.toLowerCase() === 'null') {
        if (key) invalidIdsToRemove.push(key);
      } else {
        // Auto-sanitize student record if kelas is accidentally set to a date pattern
        let modified = false;
        let sKelas = val.kelas ? String(val.kelas).trim() : '';
        if (sKelas) {
          const isDatePattern = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(sKelas) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(sKelas);
          if (isDatePattern) {
            if (!val.tanggal_lahir || !String(val.tanggal_lahir).trim()) {
              val.tanggal_lahir = sKelas;
            }
            val.kelas = '';
            modified = true;
          }
        }
        if (modified && key) {
          store.students.setItem(key, val).catch(() => {});
        }
        list.push(val);
      }
    });

    if (invalidIdsToRemove.length > 0) {
      console.warn(`[DataSiswa] Automatically purging ${invalidIdsToRemove.length} ghost student record(s)...`);
      for (const id of invalidIdsToRemove) {
        await store.students.removeItem(id).catch(() => {});
        deleteDocFromFirebase('students', id).catch(() => {});
      }
    }

    const userFiltered = filterStudentsForUser(currentUser, list);

    console.log(`[DataSiswa Data Layer Diagnostic]`, {
      indexedDBTotalIterated: totalIterated,
      validRecordsLoaded: list.length,
      purgedGhostCount: invalidIdsToRemove.length,
      currentUserRole: currentUser?.role || 'guest',
      currentUserAssignedClasses: currentUser?.assignedClasses || [],
      rbacFilteredCount: userFiltered.length
    });

    setStudents(userFiltered.sort((a, b) => a.no - b.no));
    await syncAndGetClasses();
  };

  const filteredStudents = students.filter((s, iterIdx) => {
    const matchName = s.nama.toLowerCase().includes(searchName.toLowerCase());
    let matchClass = true;

    if (filterClass === '__unassigned__' || filterClass === 'Tanpa Kelas') {
      matchClass = !s.kelas || s.kelas.trim() === '' || s.kelas.trim() === '-' || s.kelas.trim().toLowerCase() === 'umum';
    } else if (filterClass === 'Alumni') {
      matchClass = !!s.kelas && s.kelas.toLowerCase() === 'alumni';
    } else if (filterClass) {
      matchClass = !!s.kelas && s.kelas.trim().toLowerCase() === filterClass.trim().toLowerCase();
    } else {
      // Empty filterClass means 'Semua Kelas' -> show all students except Alumni
      matchClass = !s.kelas || s.kelas.toLowerCase() !== 'alumni';
    }

    const isMatch = matchName && matchClass;
    return isMatch;
  }).sort((a, b) => {
    let valA: any = (a as any)[sortField] ?? '';
    let valB: any = (b as any)[sortField] ?? '';

    if (sortField === 'no') {
      valA = Number(a.no) || 0;
      valB = Number(b.no) || 0;
    } else if (typeof valA === 'string' || typeof valB === 'string') {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    console.log(`[DataSiswa UI Layer Diagnostic]`, {
      stateStudentsCount: students.length,
      filterClassActive: filterClass || 'Semua Kelas',
      searchNameActive: searchName || 'N/A',
      filteredStudentsTotal: filteredStudents.length,
      currentPage,
      pageSize,
      paginatedItemsMappedToUI: paginatedStudents.length,
      isRestrictedToSingleElement: paginatedStudents.length === 1 && filteredStudents.length > 1
    });
  }, [students.length, filterClass, searchName, filteredStudents.length, currentPage, pageSize, paginatedStudents.length]);

  const allMergedClasses = getMergedClassesFromStudents(students, settings?.daftar_kelas);
  const uniqueClasses = isRestrictedClass 
    ? allMergedClasses.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
    : allMergedClasses;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama || !String(formData.nama).trim()) {
      toast.error('Nama siswa wajib diisi!');
      return;
    }
    resumeSyncQueue();
    const cleanNisn = formData.nisn ? String(formData.nisn).trim() : '';
    
    if (isEditing === 'new') {
      const studentId = (cleanNisn && cleanNisn !== '-') ? cleanNisn : uuidv4();
      const newStudent: Student = {
        ...(formData as Student),
        id: studentId,
        nisn: cleanNisn || studentId,
        semester: semester
      };
      await store.students.setItem(newStudent.id, newStudent);
      await store.syncQueue.setItem(`students::${newStudent.id}`, 'updated');
      console.log(`[DataSiswa] Added new student. Primary ID (NISN): ${newStudent.id}`);
      toast.success('Data siswa berhasil ditambahkan', { duration: 3000 });
    } else if (isEditing) {
      const targetId = (cleanNisn && cleanNisn !== '-') ? cleanNisn : isEditing;
      const updatedStudent: Student = {
        ...(formData as Student),
        id: targetId,
        nisn: cleanNisn || targetId,
        semester: formData.semester || semester
      } as Student;

      if (isEditing !== targetId) {
        await store.students.removeItem(isEditing);
        await store.syncQueue.setItem(`students::${isEditing}`, 'deleted');
        sendDeleteToGoogleSheets('students', isEditing);
      }

      await store.students.setItem(targetId, updatedStudent);
      await store.syncQueue.setItem(`students::${targetId}`, 'updated');
      console.log(`[DataSiswa] Updated student. Primary ID (NISN): ${targetId}`);
      toast.success('Data siswa berhasil diedit', { duration: 3000 });
    }

    // Auto-sync new/modified class to app_settings.daftar_kelas
    await syncAndGetClasses();

    setIsEditing(null);
    setFormData({});
    loadStudents();
    window.dispatchEvent(new Event('data-changed'));
    window.dispatchEvent(new Event('trigger-immediate-sync'));
  };

  const handleDelete = async (id: string) => {
    const targetId = id;
    // 1. Instantly close modal and optimistically update UI state
    setStudentToDelete(null);
    setStudents(prev => prev.filter(s => s.id !== targetId));
    toast.success('Data siswa dan seluruh data terkait (nilai, absensi, dll) berhasil dihapus', { duration: 3000 });

    try {
      await cascadeDeleteStudent(targetId);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error('Gagal menghapus siswa:', err);
      loadStudents();
    }
  };

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedStudents.length === 0) return;
    setIsBulkStatusModalOpen(false);
    const targets = [...selectedStudents];
    const count = targets.length;

    try {
      for (const studentId of targets) {
        const student = students.find(s => s.id === studentId);
        if (student) {
          const isFinished = newStatus === 'Lulus' || newStatus === 'Alumni' || newStatus === 'Mutasi' || newStatus === 'Dikeluarkan';
          const updatedStudent: Student = {
            ...student,
            status: newStatus,
            alumni: isFinished,
            kelas: (newStatus === 'Lulus' || newStatus === 'Alumni') ? 'Alumni' : student.kelas
          };
          await store.students.setItem(studentId, updatedStudent);
          await store.syncQueue.setItem(`students::${studentId}`, 'updated');
        }
      }
      toast.success(`Berhasil memperbarui status ${count} siswa terpilih menjadi "${newStatus}"`);
      setSelectedStudents([]);
      await loadStudents();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err: any) {
      console.error('Gagal memperbarui status masal:', err);
      toast.error('Gagal memperbarui status masal: ' + (err?.message || err));
    }
  };

  const handleBulkClassUpdate = async (targetClass: string) => {
    if (selectedStudents.length === 0 || !targetClass) return;
    setIsBulkClassModalOpen(false);
    const targets = [...selectedStudents];
    const count = targets.length;

    try {
      for (const studentId of targets) {
        const student = students.find(s => s.id === studentId);
        if (student) {
          const isAlumni = targetClass === 'Alumni';
          const updatedStudent: Student = {
            ...student,
            kelas: targetClass,
            alumni: isAlumni,
            status: isAlumni ? 'Lulus' : (student.status || 'Aktif')
          };
          await store.students.setItem(studentId, updatedStudent);
          await store.syncQueue.setItem(`students::${studentId}`, 'updated');
        }
      }
      toast.success(`Berhasil memindahkan ${count} siswa terpilih ke kelas "${targetClass}"`);
      setSelectedStudents([]);
      await syncAndGetClasses();
      await loadStudents();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err: any) {
      console.error('Gagal memindahkan kelas masal:', err);
      toast.error('Gagal memindahkan kelas masal: ' + (err?.message || err));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Silakan pilih siswa yang ingin dihapus terlebih dahulu');
      return;
    }
    
    const targets = [...selectedStudents];
    // 1. Instantly close modal and update UI state
    setIsDeletingSelected(false);
    setSelectedStudents([]);
    setStudents(prev => prev.filter(s => !targets.includes(s.id)));
    toast.success(`Berhasil menghapus ${targets.length} siswa beserta seluruh data terkait`);

    try {
      await cascadeDeleteSelectedStudents(targets);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal menghapus siswa terpilih');
      loadStudents();
    }
  };

  const handleDeleteAll = async () => {
    // 1. Instantly close modal and clear UI state
    setIsDeletingAll(false);
    setSelectedStudents([]);
    setStudents([]);
    toast.success('Seluruh data siswa dan data terkait berhasil dihapus');

    try {
      await cascadeDeleteAllStudents();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal menghapus seluruh data siswa');
      loadStudents();
    }
  };

  const formatGraduationDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, 'dd MMMM yyyy', { locale: id });
    } catch (e) {
      return dateStr;
    }
  };

  const exportExcel = () => {
    const customCols = getCustomStudentColumns(settings?.custom_student_columns);
    const dataForExport = filteredStudents.map((s, idx) => {
      const row: any = {
        'No': idx + 1,
        'Nama': s.nama,
        'NISN': s.nisn,
        'NIPD': s.nipd,
        'Jenis Kelamin': s.jenis_kelamin || '',
        'Kelas': s.kelas,
        'Tempat Lahir': s.tempat_lahir,
        'Tanggal Lahir': s.tanggal_lahir,
        'Nama Orang Tua': s.nama_orang_tua || [s.nama_ayah, s.nama_ibu].filter(Boolean).join(' / ') || '',
        'Nama Ayah': s.nama_ayah,
        'Nama Ibu': s.nama_ibu,
        'No Telp Ortu': s.no_telp_ortu,
      };
      if (filterClass === 'Alumni') {
        row['Tanggal Lulus'] = formatGraduationDate(s.tanggal_lulus);
        row['Tahun Ajaran Lulus'] = s.tahun_ajaran_lulus || '';
      }
      customCols.forEach(col => {
        const normCol = col.toLowerCase().replace(/\s+/g, '_');
        row[col.replace(/_/g, ' ').toUpperCase()] = s[normCol] || s[col] || '';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Siswa");
    XLSX.writeFile(wb, `Data_Siswa_${semester}_${filterClass || 'Semua'}.xlsx`);
  };

  const exportPDF = () => {
    if (filteredStudents.length === 0) {
      toast.error('Tidak ada data siswa untuk dicetak!');
      return;
    }

    generateClassDataAndAttendancePDF({
      students: filteredStudents,
      attendance,
      settings,
      className: filterClass || 'Semua Kelas',
      semester,
      showKepsekSig
    });

    toast.success('Laporan PDF data kelas & rekapitulasi kehadiran berhasil diunduh!');
  };

  const downloadTemplate = () => {
    try {
      const template = [
        { 
          no: 1, 
          nama: 'Ahmad Dahlan', 
          nisn: '0012345678', 
          nipd: '2023001', 
          jenis_kelamin: 'Laki-laki', 
          tempat_lahir: 'Jakarta', 
          tanggal_lahir: '2010-05-15', 
          kelas: '7A', 
          nama_ayah: 'Budi Santoso', 
          nama_ibu: 'Siti Aminah', 
          nama_orang_tua: 'Budi Santoso / Siti Aminah', 
          no_telp_ortu: '081234567890' 
        },
        { 
          no: 2, 
          nama: 'Siti Nurhaliza', 
          nisn: '0087654321', 
          nipd: '2023002', 
          jenis_kelamin: 'Perempuan', 
          tempat_lahir: 'Bandung', 
          tanggal_lahir: '2010-08-20', 
          kelas: '7A', 
          nama_ayah: 'Rahmat Hidayat', 
          nama_ibu: 'Dewi Lestari', 
          nama_orang_tua: 'Rahmat Hidayat / Dewi Lestari', 
          no_telp_ortu: '089876543210' 
        }
      ];
      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data_Siswa");
      XLSX.writeFile(wb, "Template_Import_Siswa_EduSync.xlsx");
      toast.success('Template Excel siswa berhasil diunduh!');
    } catch (err: any) {
      console.error('[Template Export Error]:', err);
      toast.error('Gagal mengunduh template Excel: ' + (err?.message || err));
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileInput = e.target;
    const isJsonFile = file.name.endsWith('.json') || file.type.includes('json');

    const logs: ImportLogItem[] = [];
    const addLog = (
      level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS',
      step: 'FILE_READ' | 'PARSING' | 'HEADER_DETECTION' | 'ROW_VALIDATION' | 'INDEXEDDB_SAVE' | 'FIREBASE_SYNC',
      message: string,
      details?: string,
      rowIndex?: number
    ) => {
      const item: ImportLogItem = {
        id: uuidv4(),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        level,
        step,
        message,
        details,
        rowIndex
      };
      logs.push(item);
      if (level === 'ERROR') {
        console.error(`[Import Diagnostic ${step}] ${message}`, details || '');
      } else if (level === 'WARN') {
        console.warn(`[Import Diagnostic ${step}] ${message}`, details || '');
      } else {
        console.log(`[Import Diagnostic ${step}] ${message}`, details || '');
      }
    };

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const rowDetails: ImportRowDetail[] = [];
    const usedIdsSet = new Set<string>();

    const report: ImportDiagnosticReport = {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      fileType: file.type || (isJsonFile ? 'application/json' : 'spreadsheet'),
      timestamp: new Date().toLocaleString('id-ID'),
      totalRowsRead: 0,
      successCount: 0,
      warnCount: 0,
      errorCount: 0,
      indexedDbSaved: 0,
      firebaseSynced: 0,
      logs: logs,
      rowDetails: rowDetails,
      hasFirestorePermissionError: false,
      hasFormatError: false,
      hasIdReassigned: false,
      rbacFilteredCount: 0
    };

    addLog('INFO', 'FILE_READ', `Memulai impor berkas "${file.name}" (${report.fileSize}, tipe: ${report.fileType}).`);

    const reader = new FileReader();

    reader.onerror = (evt) => {
      const readErr = evt.target?.error?.message || 'Gagal membaca berkas dari media penyimpanan.';
      addLog('ERROR', 'FILE_READ', `Gagal membaca berkas disk: ${readErr}`);
      report.errorCount++;
      setLastDiagnosticReport({ ...report });
      setIsDiagnosticModalOpen(true);
      toast.error(`Gagal membaca file: ${readErr}`);
    };

    reader.onload = async (evt) => {
      try {
        let importedStudents: Student[] = [];

        // Pre-populate usedIdsSet with all existing student IDs and NISNs to prevent overwriting local records
        const usedIdsSet = new Set<string>();
        for (const existing of students) {
          if (existing.id) usedIdsSet.add(String(existing.id).trim());
          if (existing.nisn) usedIdsSet.add(String(existing.nisn).trim());
        }

        const defaultClassForImport = (filterClass && filterClass.toLowerCase() !== 'alumni') ? filterClass : '';

        if (isJsonFile) {
          addLog('INFO', 'PARSING', 'Memproses berkas format JSON backup / list siswa...');
          const textContent = evt.target?.result as string;
          let jsonParsed: any;
          try {
            jsonParsed = JSON.parse(textContent);
            addLog('SUCCESS', 'PARSING', 'Struktur JSON berhasil di-parse tanpa kesalahan sintaksis.');
          } catch (jsonErr: any) {
            report.hasFormatError = true;
            addLog('ERROR', 'PARSING', `Format JSON tidak valid (Syntax Error): ${jsonErr?.message}`, textContent.substring(0, 200));
            throw new Error(`File JSON rusak atau memiliki sintaksis tidak valid: ${jsonErr?.message}`);
          }

          const normalizedBackup = parseAndNormalizeBackup(jsonParsed);

          if (normalizedBackup && normalizedBackup.students && normalizedBackup.students.length > 0) {
            importedStudents = normalizedBackup.students;
            addLog('SUCCESS', 'PARSING', `Berhasil mengekstrak ${importedStudents.length} siswa dari koleksi backup JSON.`);
          } else if (Array.isArray(jsonParsed)) {
            importedStudents = jsonParsed.map((item, idx) => normalizeStudentRecord(item, idx + 1, usedIdsSet)).filter(Boolean);
            addLog('SUCCESS', 'PARSING', `Berhasil mengonversi ${importedStudents.length} elemen array JSON menjadi record siswa.`);
          } else {
            report.hasFormatError = true;
            addLog('ERROR', 'PARSING', 'File JSON tidak mengandung array siswa atau kunci koleksi backup yang valid.');
            throw new Error('File JSON tidak berisi array siswa atau backup yang valid.');
          }

          report.totalRowsRead = importedStudents.length;

          importedStudents.forEach((s, idx) => {
            rowDetails.push({
              rowIndex: idx + 1,
              nama: s.nama,
              nisn: s.nisn || '-',
              kelas: s.kelas || '-',
              status: 'SUCCESS',
              message: 'Berhasil diekstrak dari berkas JSON.'
            });
          });
        } else {
          // Process Excel / CSV / ODS
          addLog('INFO', 'PARSING', 'Membaca data biner spreadsheet (XLSX / CSV / ODS)...');
          let wb: XLSX.WorkBook;
          try {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            wb = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
            addLog('SUCCESS', 'PARSING', `Berkas spreadsheet berhasil dibuka. Ditemukan ${wb.SheetNames.length} lembar kerja (Sheet): [${wb.SheetNames.join(', ')}].`);
          } catch (xlsxErr: any) {
            report.hasFormatError = true;
            addLog('ERROR', 'PARSING', `Gagal mengurai lembar kerja spreadsheet: ${xlsxErr?.message}`);
            throw new Error(`File CSV / Excel rusak atau format biner tidak valid: ${xlsxErr?.message}`);
          }

          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];

          const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false });
          report.totalRowsRead = rawRows.length;

          if (rawRows.length === 0) {
            report.hasFormatError = true;
            addLog('ERROR', 'PARSING', `Sheet "${wsname}" kosong, tidak ada baris data.`);
            throw new Error('File spreadsheet kosong atau tidak berisi baris data!');
          }

          addLog('INFO', 'HEADER_DETECTION', `Menganalisis ${rawRows.length} baris mentah pada Sheet "${wsname}" untuk menemukan baris header...`);

          // Detect header row dynamically
          let headerRowIdx = 0;
          let maxMatches = 0;
          const keyIndicators = ['nama', 'nisn', 'kelas', 'no', 'jenis', 'jk', 'nipd', 'ortu', 'wali', 'ayah', 'ibu', 'tempat', 'tanggal'];
          
          for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
            const row = rawRows[i];
            if (Array.isArray(row)) {
              const matchCount = row.filter(cell => {
                if (cell === null || cell === undefined) return false;
                const cellStr = String(cell).trim().toLowerCase();
                return keyIndicators.some(ind => cellStr.includes(ind));
              }).length;

              if (matchCount > maxMatches) {
                maxMatches = matchCount;
                headerRowIdx = i;
              }
            }
          }

          const rawHeaders = rawRows[headerRowIdx];
          const headers = Array.isArray(rawHeaders) ? rawHeaders.map(h => String(h || '').trim()) : [];

          if (maxMatches === 0) {
            report.hasFormatError = true;
            addLog('WARN', 'HEADER_DETECTION', `Tidak dapat menemukan baris header baku pada 15 baris pertama. Menggunakan baris pertama (indeks 0) sebagai header default.`);
          } else {
            addLog('SUCCESS', 'HEADER_DETECTION', `Baris header terdeteksi pada baris ke-${headerRowIdx + 1} dengan kecocokan ${maxMatches} kolom indikator. Header kolom: [${headers.filter(Boolean).join(', ')}]`);
          }

          const dataRows = rawRows.slice(headerRowIdx + 1);
          addLog('INFO', 'ROW_VALIDATION', `Memulai validasi dan ekstraksi ${dataRows.length} baris data...`);

          for (let idx = 0; idx < dataRows.length; idx++) {
            const actualRowNumber = headerRowIdx + 2 + idx;
            const row = dataRows[idx];
            
            if (!Array.isArray(row) || row.filter(item => item !== null && item !== undefined && String(item).trim() !== '').length === 0) {
              addLog('WARN', 'ROW_VALIDATION', `Baris ke-${actualRowNumber} kosong, dilewati.`, undefined, actualRowNumber);
              report.warnCount++;
              rowDetails.push({
                rowIndex: actualRowNumber,
                nama: '-',
                nisn: '-',
                kelas: '-',
                status: 'SKIPPED',
                message: 'Baris ke-' + actualRowNumber + ' kosong, dilewati.'
              });
              continue;
            }

            const cleanRow: any = {};
            headers.forEach((header, colIdx) => {
              if (header) {
                const rawVal = row[colIdx];
                const cleanVal = rawVal !== undefined && rawVal !== null ? rawVal : '';
                cleanRow[header] = cleanVal;
                const cleanKey = header.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                if (cleanKey) {
                  cleanRow[cleanKey] = cleanVal;
                }
              }
            });

            const rawNama = cleanRow.nama || cleanRow.nama_lengkap || cleanRow.nama_siswa || cleanRow['Nama'] || cleanRow['Nama Siswa'];
            if (!rawNama || String(rawNama).trim() === '') {
              addLog('WARN', 'ROW_VALIDATION', `Baris ke-${actualRowNumber} dilewati karena kolom "Nama" kosong.`, JSON.stringify(cleanRow), actualRowNumber);
              report.warnCount++;
              rowDetails.push({
                rowIndex: actualRowNumber,
                nama: '-',
                nisn: String(cleanRow.nisn || cleanRow['NISN'] || '-'),
                kelas: String(cleanRow.kelas || cleanRow['Kelas'] || '-'),
                status: 'WARN',
                message: 'Dilewati karena kolom "Nama" tidak terisi.'
              });
              continue;
            }

            const studentObj = normalizeStudentRecord(cleanRow, idx + 1, usedIdsSet, defaultClassForImport);
            if (studentObj && studentObj.nama) {
              if (semester) studentObj.semester = semester;
              importedStudents.push(studentObj);

              if (studentObj._isIdReassigned) {
                report.hasIdReassigned = true;
                report.warnCount++;
                addLog('WARN', 'ROW_VALIDATION', `Baris ke-${actualRowNumber}: Siswa "${studentObj.nama}" Memiliki ID/NISN duplikat. Sistem memberikan ID unik baru untuk mencegah data tertimpa.`, undefined, actualRowNumber);
                rowDetails.push({
                  rowIndex: actualRowNumber,
                  nama: studentObj.nama,
                  nisn: studentObj.nisn || '-',
                  kelas: studentObj.kelas || '-',
                  status: 'WARN',
                  message: 'NISN/ID duplikat detected. Diberikan ID unik baru agar data tersimpan utuh.',
                  isIdReassigned: true
                });
              } else {
                addLog('INFO', 'ROW_VALIDATION', `Baris ke-${actualRowNumber}: Siswa "${studentObj.nama}" (NISN: ${studentObj.nisn || '-'}, Kelas: ${studentObj.kelas || '-'}) berhasil dipetakan.`, undefined, actualRowNumber);
                rowDetails.push({
                  rowIndex: actualRowNumber,
                  nama: studentObj.nama,
                  nisn: studentObj.nisn || '-',
                  kelas: studentObj.kelas || '-',
                  status: 'SUCCESS',
                  message: 'Berhasil dipetakan dan siap disimpan.'
                });
              }
            } else {
              addLog('WARN', 'ROW_VALIDATION', `Baris ke-${actualRowNumber} gagal dipetakan menjadi objek siswa valid.`, JSON.stringify(cleanRow), actualRowNumber);
              report.warnCount++;
              rowDetails.push({
                rowIndex: actualRowNumber,
                nama: String(rawNama),
                nisn: '-',
                kelas: '-',
                status: 'ERROR',
                message: 'Gagal dipetakan menjadi objek siswa valid.'
              });
            }
          }
        }

        report.successCount = importedStudents.length;

        if (importedStudents.length === 0) {
          report.hasFormatError = true;
          addLog('ERROR', 'ROW_VALIDATION', 'Tidak ada data siswa yang valid (dengan nama terisi) ditemukan dalam seluruh berkas.');
          throw new Error('Tidak ada data siswa yang valid ditemukan dalam berkas.');
        }

        // Check RBAC class visibility
        const userAssignedClasses = getAssignedClasses(currentUser);
        if (!userAssignedClasses.includes('*')) {
          const rbacHidden = importedStudents.filter(s => 
            !s.kelas || !userAssignedClasses.some(c => c.toLowerCase() === s.kelas.trim().toLowerCase())
          ).length;
          if (rbacHidden > 0) {
            report.rbacFilteredCount = rbacHidden;
            addLog('WARN', 'ROW_VALIDATION', `Perhatian Hak Akses: ${rbacHidden} siswa yang diimpor memiliki kelas yang tidak diampu oleh peran Anda (${userAssignedClasses.join(', ')}). Data siswa tersebut tetap tersimpan di database namun disembunyikan dari tabel Anda.`);
          }
        }

        // Run preview validation
        const validationReport = await validateStudentDataWithReport(importedStudents);
        addLog('INFO', 'ROW_VALIDATION', `Pratinjau Kualitas Data: Skor ${validationReport.dataQualityScore}%. Lengkap: ${validationReport.validCount}, Perlu Melengkapi: ${validationReport.warningCount}, Wajib Kosong: ${validationReport.missingRequiredCount}`);

        // Set pending context and open Preview Modal
        setPendingImportContext({
          importedStudents,
          validationReport,
          report,
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(1) + ' KB',
          fileInput
        });
        setIsPreviewModalOpen(true);

      } catch (err: any) {
        report.errorCount++;
        addLog('ERROR', 'PARSING', `Proses impor terhenti karena error: ${err?.message || err}`, err?.stack);
        toast.error(`Gagal memproses file import: ${err.message}`);
        setLastDiagnosticReport({ ...report });
        setIsDiagnosticModalOpen(true);
        fileInput.value = '';
      }
    };

    if (isJsonFile) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <BackgroundDataBanner collectionName="students" className="mx-4 mt-3" />

      {/* Bulk Selection Action Toolbar */}
      {selectedStudents.length > 0 && role !== 'kepsek' && (
        <div className="mx-4 mt-3 bg-indigo-950/90 border border-indigo-500/50 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-2 text-indigo-200 text-xs font-bold">
            <span className="px-2.5 py-1 bg-indigo-500/30 border border-indigo-400/40 rounded-lg text-indigo-300 font-mono text-xs">
              {selectedStudents.length}
            </span>
            <span>Siswa Terpilih</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSelectedBulkStatus('Aktif');
                setIsBulkStatusModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Edit2 size={14} /> Ubah Status Masal
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedBulkClass(uniqueClasses[0] || '');
                setIsBulkClassModalOpen(true);
              }}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <GraduationCap size={14} /> Pindah Kelas Masal
            </button>

            <button
              type="button"
              onClick={() => setIsDeletingSelected(true)}
              className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Trash2 size={14} /> Hapus Terpilih ({selectedStudents.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedStudents([])}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Batal Pilihan
            </button>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {role !== 'kepsek' && (
            <>
              <button onClick={() => { setIsEditing('new'); setFormData({ no: students.length + 1 }); }} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-500/20 font-medium transition-colors">
                <Plus size={16} /> Tambah Siswa
              </button>
              <button onClick={() => setIsNaikKelasOpen(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-emerald-600/20 font-medium transition-colors">
                <GraduationCap size={16} /> Kenaikan Kelas
              </button>
              <button onClick={() => setIsManagingColumns(true)} className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors">
                <SettingsIcon size={16} /> Kelola Kolom Tambahan
              </button>
              {selectedStudents.length > 0 && (
                <button 
                  onClick={() => setIsDeletingSelected(true)} 
                  className="bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors animate-fade-in"
                  title="Hapus beberapa siswa terpilih"
                >
                  <Trash2 size={16} /> Hapus Terpilih ({selectedStudents.length})
                </button>
              )}
              {students.length > 0 && (
                <button 
                  onClick={() => setIsDeletingAll(true)} 
                  className="bg-rose-600/10 text-rose-500 border border-rose-500/20 hover:bg-rose-600/20 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
                  title="Hapus seluruh data siswa di database"
                >
                  <Trash2 size={16} /> Hapus Semua Siswa
                </button>
              )}
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Cari nama siswa..." 
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all w-48"
          />
          <select 
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
          >
            <option value="">Semua Kelas</option>
            <option value="__unassigned__">⚠️ Tanpa Kelas / Belum Ditentukan</option>
            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-3 flex-wrap">
          {role !== 'kepsek' && (
            <>
              <button onClick={downloadTemplate} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-slate-700 text-slate-300 font-medium transition-colors">
                <Download size={16} /> Template
              </button>
              <label className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-slate-700 cursor-pointer text-slate-300 font-medium transition-colors">
                <Upload size={16} /> Import
                <input type="file" className="hidden" accept=".xlsx, .xls, .csv, .json, .ods" onChange={handleImport} />
              </label>
              {lastDiagnosticReport && (
                <button
                  type="button"
                  onClick={() => setIsDiagnosticModalOpen(true)}
                  className="bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs hover:bg-slate-700 text-amber-300 font-medium transition-colors cursor-pointer"
                  title="Lihat Detail Log Diagnosa Impor"
                >
                  <AlertTriangle size={15} /> Log Diagnosa
                </button>
              )}
            </>
          )}
          <button 
            type="button"
            onClick={() => {
              setSelectedQrStudent(null);
              setIsQrModalOpen(true);
            }} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-indigo-600/20 transition-colors cursor-pointer"
            title="Cetak atau Lihat Kartu QR Presensi Siswa"
          >
            <QrCode size={16} /> Kartu QR Siswa
          </button>

          <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-emerald-500/20 transition-colors">
            <Download size={16} /> Excel
          </button>
          
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showKepsekSig}
                onChange={(e) => setShowKepsekSig(e.target.checked)}
                className="rounded border-slate-600 text-indigo-500 focus:ring-0"
              />
              <span>TTD Kepsek</span>
            </label>
            <button onClick={exportPDF} className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-rose-500/20 transition-colors cursor-pointer">
              <Download size={14} /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 sticky top-0 backdrop-blur-sm z-10">
            <tr>
              {role !== 'kepsek' && (
                <th className="px-6 py-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                    checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudents(filteredStudents.map(s => s.id));
                      } else {
                        setSelectedStudents([]);
                      }
                    }}
                  />
                </th>
              )}
              <th onClick={() => handleSort('no')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>No</span>
                  {sortField === 'no' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              <th onClick={() => handleSort('nama')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Nama</span>
                  {sortField === 'nama' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              <th onClick={() => handleSort('nisn')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>NISN</span>
                  {sortField === 'nisn' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              <th onClick={() => handleSort('jenis_kelamin')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Jenis Kelamin</span>
                  {sortField === 'jenis_kelamin' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              <th onClick={() => handleSort('kelas')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Kelas</span>
                  {sortField === 'kelas' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              {filterClass === 'Alumni' && (
                <>
                  <th onClick={() => handleSort('tanggal_lulus')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                    <div className="flex items-center gap-1">
                      <span>Tanggal Lulus</span>
                      {sortField === 'tanggal_lulus' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                    </div>
                  </th>
                  <th onClick={() => handleSort('tahun_lulus')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                    <div className="flex items-center gap-1">
                      <span>Tahun Lulus</span>
                      {sortField === 'tahun_lulus' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                    </div>
                  </th>
                </>
              )}
              <th onClick={() => handleSort('nama_orang_tua')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Nama Orang Tua</span>
                  {sortField === 'nama_orang_tua' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              <th onClick={() => handleSort('no_hp_ortu')} className="px-6 py-4 font-medium cursor-pointer hover:text-indigo-400 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>No Telp Ortu</span>
                  {sortField === 'no_hp_ortu' ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                </div>
              </th>
              {getCustomStudentColumns(settings?.custom_student_columns).map(col => (
                <th key={col} onClick={() => handleSort(col)} className="px-6 py-4 font-medium capitalize cursor-pointer hover:text-indigo-400 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>{col.replace(/_/g, ' ')}</span>
                    {sortField === col ? (sortOrder === 'asc' ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />) : <ArrowUpDown size={12} className="text-slate-600" />}
                  </div>
                </th>
              ))}
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td 
                  colSpan={
                    ((role !== 'kepsek' ? 1 : 0) + (filterClass === 'Alumni' ? 2 : 0) + 8) + 
                    getCustomStudentColumns(settings?.custom_student_columns).length
                  } 
                  className="px-6 py-12 text-center text-slate-500"
                >
                  Belum ada data siswa. Silakan tambah atau import data.
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, index) => (
                <tr key={student.id} className={`transition-colors ${selectedStudents.includes(student.id) ? 'bg-indigo-500/10 hover:bg-indigo-500/20' : 'hover:bg-slate-700/30'}`}>
                  {role !== 'kepsek' && (
                    <td className="px-6 py-4 text-center">
                      <input 
                         type="checkbox" 
                         className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                         checked={selectedStudents.includes(student.id)}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setSelectedStudents([...selectedStudents, student.id]);
                           } else {
                             setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                           }
                         }}
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="px-6 py-4 font-medium text-slate-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{student.nama}</span>
                      <PendingBadge isPending={isPending('students', student.id)} compact={false} label="Pending" />
                      <LockingIndicator entityType="students" entityId={student.id} variant="badge" />
                      {(() => {
                        const unsubmitted = studentUnsubmittedTasksMap.get(student.id) || [];
                        if (unsubmitted.length === 0) return null;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskReminderStudent(student);
                            }}
                            className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer shrink-0"
                            title={`${unsubmitted.length} tugas belum dikumpul. Klik untuk lihat & kirim pengingat.`}
                          >
                            <AlertTriangle size={11} className="text-rose-400 shrink-0" />
                            <span>{unsubmitted.length} Belum Kumpul</span>
                          </button>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{student.nisn || '-'}</td>
                  <td className="px-6 py-4 text-slate-400">
                    {(() => {
                      const jk = student.jenis_kelamin || student.jk || student.l_p || student.gender || student.sex || student.kelamin;
                      if (!jk) return '-';
                      const jkLower = String(jk).trim().toLowerCase();
                      const formatted = (jkLower === 'l' || jkLower.startsWith('laki') || jkLower === 'pria' || jkLower === 'm') ? 'Laki-laki'
                        : (jkLower === 'p' || jkLower.startsWith('perem') || jkLower === 'wanita' || jkLower === 'f') ? 'Perempuan'
                        : String(jk);
                      return (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${formatted === 'Laki-laki' ? 'bg-blue-500/15 text-blue-400' : 'bg-pink-500/15 text-pink-400'}`}>
                          {formatted}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    <span className="px-2.5 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs">
                      {student.kelas || student.nama_kelas || student.rombel || student.kls || student.class || '-'}
                    </span>
                  </td>
                  {filterClass === 'Alumni' && (
                    <>
                      <td className="px-6 py-4 text-emerald-400 font-medium">
                        {formatGraduationDate(student.tanggal_lulus)}
                      </td>
                      <td className="px-6 py-4 text-indigo-400 font-mono">
                        {student.tahun_ajaran_lulus || '-'}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 text-slate-400">
                    {student.nama_orang_tua || [student.nama_ayah, student.nama_ibu].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{student.no_telp_ortu || '-'}</td>
                  {getCustomStudentColumns(settings?.custom_student_columns).map(col => {
                    const normalizedCol = col.toLowerCase().replace(/\s+/g, '_');
                    return (
                      <td key={col} className="px-6 py-4 text-slate-300">{student[normalizedCol] || student[col] || '-'}</td>
                    );
                  })}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedTaskReminderStudent(student)}
                        className="text-amber-400 hover:text-amber-300 p-1.5 hover:bg-amber-500/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer relative"
                        title="Status Tugas & Kirim Pengingat Personal WA"
                      >
                        <Bell size={15} />
                        {(studentUnsubmittedTasksMap.get(student.id)?.length || 0) > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        )}
                      </button>

                      <button 
                        onClick={() => setSelectedProfileStudent(student)} 
                        className="text-emerald-400 hover:text-emerald-300 p-1.5 hover:bg-emerald-500/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer" 
                        title="Buka Profil & Grafik Perkembangan Nilai"
                      >
                        <User size={15} />
                        <span>Profil</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedQrStudent(student);
                          setIsQrModalOpen(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 p-1.5 hover:bg-indigo-500/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                        title="Kartu QR Presensi Siswa"
                      >
                        <QrCode size={15} />
                      </button>
                      
                      {role !== 'kepsek' && (
                        student.kelas !== 'Alumni' ? (
                          <>
                            <button onClick={() => { setIsEditing(student.id); setFormData(student); }} className="text-indigo-400 hover:text-indigo-300 p-1.5 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer" title="Edit Siswa">
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => setStudentToDelete(student.id)} className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer" title="Hapus Siswa">
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-500 italic bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">Alumni</span>
                            <button onClick={() => setStudentToDelete(student.id)} className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer" title="Hapus Siswa">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={filteredStudents.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemName="siswa"
      />

      {/* Modal Hapus Siswa */}
      {studentToDelete && (() => {
        const targetStudent = students.find(s => s.id === studentToDelete);
        return createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] animate-fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 text-center my-auto max-h-[90vh] overflow-y-auto">
              <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
                <Trash2 size={24} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">Konfirmasi Hapus Data Siswa</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Apakah Anda yakin ingin menghapus data siswa berikut secara permanen?
                </p>
              </div>

              {targetStudent && (
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-left text-xs space-y-1.5">
                  <div className="flex justify-between items-center text-slate-200 font-bold text-sm">
                    <span>{targetStudent.nama}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 font-semibold">
                      Kelas {targetStudent.kelas || '-'}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px] flex items-center gap-3 pt-1 border-t border-slate-800/80">
                    <span>NISN: <strong className="text-slate-300">{targetStudent.nisn || '-'}</strong></span>
                    <span>NIPD: <strong className="text-slate-300">{targetStudent.nipd || '-'}</strong></span>
                    <span>No: <strong className="text-slate-300">{targetStudent.no || '-'}</strong></span>
                  </div>
                </div>
              )}

              <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-left text-xs text-rose-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-rose-400">
                  <AlertTriangle size={14} /> Peringatan Penghapusan
                </p>
                <p className="text-[11px] text-rose-300/90 leading-relaxed">
                  Menghapus siswa ini akan menghapus seluruh data nilai, absensi, jurnal, serta riwayat catatan yang terkait. Aksi ini tidak dapat dibatalkan.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setStudentToDelete(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(studentToDelete)}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 size={15} />
                  Ya, Hapus Data Siswa
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Modal Edit / Tambah Siswa */}
      {isEditing && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden my-auto">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">{isEditing === 'new' ? 'Tambah Siswa' : 'Edit Siswa'}</h3>
              <button onClick={() => setIsEditing(null)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isEditing && isEditing !== 'new' && (
                <LockingIndicator entityType="students" entityId={isEditing} variant="banner" className="mb-4" />
              )}
              <form id="student-form" onSubmit={handleSave} className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">No Urut</label>
                  <input type="number" required value={formData.no === undefined || formData.no === null || isNaN(formData.no as any) ? '' : formData.no} onChange={e => { const val = parseInt(e.target.value, 10); setFormData({...formData, no: isNaN(val) ? undefined : val}); }} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NISN</label>
                  <input type="text" value={formData.nisn ?? ''} onChange={e => setFormData({...formData, nisn: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Lengkap</label>
                  <input type="text" required value={formData.nama ?? ''} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NIPD</label>
                  <input type="text" value={formData.nipd ?? ''} onChange={e => setFormData({...formData, nipd: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kelas</label>
                  <input 
                    type="text" 
                    required 
                    list="class-suggestions"
                    value={formData.kelas ?? ''} 
                    onChange={e => setFormData({...formData, kelas: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                    placeholder="Contoh: 7-A, 8-B, 9-C"
                  />
                  <datalist id="class-suggestions">
                    {uniqueClasses.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Jenis Kelamin</label>
                  <select 
                    value={formData.jenis_kelamin ?? ''} 
                    onChange={e => setFormData({...formData, jenis_kelamin: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark]"
                  >
                    <option value="">Pilih Jenis Kelamin</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tempat Lahir</label>
                  <input type="text" value={formData.tempat_lahir ?? ''} onChange={e => setFormData({...formData, tempat_lahir: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tanggal Lahir</label>
                  <input type="date" value={formData.tanggal_lahir ?? ''} onChange={e => setFormData({...formData, tanggal_lahir: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Ayah</label>
                  <input type="text" value={formData.nama_ayah ?? ''} onChange={e => setFormData({...formData, nama_ayah: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Ibu</label>
                  <input type="text" value={formData.nama_ibu ?? ''} onChange={e => setFormData({...formData, nama_ibu: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Orang Tua / Wali</label>
                  <input type="text" value={formData.nama_orang_tua ?? ''} onChange={e => setFormData({...formData, nama_orang_tua: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">No Telepon Ortu</label>
                  <input type="text" value={formData.no_telp_ortu ?? ''} onChange={e => setFormData({...formData, no_telp_ortu: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                {getCustomStudentColumns(settings?.custom_student_columns).map(col => {
                  const normCol = col.toLowerCase().replace(/\s+/g, '_');
                  return (
                    <div key={col} className="col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider capitalize">{col.replace(/_/g, ' ')}</label>
                      <input 
                        type="text" 
                        value={formData[normCol] ?? formData[col] ?? ''} 
                        onChange={e => setFormData({...formData, [normCol]: e.target.value})} 
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                      />
                    </div>
                  );
                })}
              </form>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsEditing(null)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button form="student-form" type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-colors">Simpan</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hapus Beberapa Siswa Terpilih */}
      {isDeletingSelected && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">Hapus Siswa Terpilih</h3>
              <button onClick={() => setIsDeletingSelected(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda yakin ingin menghapus <span className="font-bold text-rose-400">{selectedStudents.length} siswa</span> yang terpilih?</p>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Aksi ini bersifat permanen dan tidak dapat dibatalkan.</p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsDeletingSelected(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={handleDeleteSelected} className="px-5 py-2 text-sm font-medium bg-rose-500 text-white rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-colors">Hapus Terpilih</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Ubah Status Masal */}
      {isBulkStatusModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
                <Edit2 size={18} className="text-indigo-400" />
                Ubah Status Siswa Masal
              </h3>
              <button onClick={() => setIsBulkStatusModalOpen(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300 text-sm">
                Pilih status baru yang akan diterapkan untuk <span className="font-bold text-indigo-400">{selectedStudents.length} siswa</span> yang Anda pilih:
              </p>
              <div className="space-y-2">
                {['Aktif', 'Lulus', 'Mutasi', 'Dikeluarkan', 'Non-Aktif'].map(st => (
                  <label key={st} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedBulkStatus === st ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold' : 'bg-slate-900/50 border-slate-700/60 text-slate-300 hover:bg-slate-700/40'}`}>
                    <div className="flex items-center gap-2">
                      <input 
                        type="radio" 
                        name="bulkStatus" 
                        value={st} 
                        checked={selectedBulkStatus === st} 
                        onChange={() => setSelectedBulkStatus(st)}
                        className="text-indigo-500 focus:ring-indigo-500"
                      />
                      <span>{st}</span>
                    </div>
                    {st === 'Aktif' && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">Siswa Aktif</span>}
                    {st === 'Lulus' && <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-medium">Masuk Alumni</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsBulkStatusModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={() => handleBulkStatusUpdate(selectedBulkStatus)} className="px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-colors">Terapkan Perubahan</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Pindah Kelas Masal */}
      {isBulkClassModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
                <GraduationCap size={18} className="text-teal-400" />
                Pindah Kelas Masal
              </h3>
              <button onClick={() => setIsBulkClassModalOpen(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300 text-sm">
                Pilih kelas tujuan untuk memindahkan <span className="font-bold text-teal-400">{selectedStudents.length} siswa</span> terpilih:
              </p>
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Kelas Tujuan</label>
                <select
                  value={selectedBulkClass}
                  onChange={e => setSelectedBulkClass(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                >
                  <option value="" disabled>-- Pilih Kelas Tujuan --</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                  <option value="Alumni">Alumni (Lulus)</option>
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsBulkClassModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button 
                disabled={!selectedBulkClass}
                onClick={() => handleBulkClassUpdate(selectedBulkClass)} 
                className="px-5 py-2.5 text-sm font-medium bg-teal-500 text-white rounded-xl hover:bg-teal-600 shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Pindahkan Siswa
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hapus Seluruh Data Siswa */}
      {isDeletingAll && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-rose-400">Peringatan Kritis!</h3>
              <button onClick={() => setIsDeletingAll(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda benar-benar yakin ingin menghapus <span className="font-bold text-rose-400">SELURUH DATA SISWA ({students.length} siswa)</span> dari database?</p>
              <p className="text-rose-400/80 text-xs mt-3 leading-relaxed bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 font-medium">
                Peringatan: Seluruh data siswa akan terhapus secara permanen dari sistem. Pastikan Anda telah melakukan ekspor data (Excel/PDF) terlebih dahulu jika diperlukan.
              </p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsDeletingAll(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={handleDeleteAll} className="px-5 py-2 text-sm font-medium bg-rose-600 text-white rounded-xl hover:bg-rose-500 shadow-lg shadow-rose-500/20 transition-colors">Hapus Semua Data</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Kelola Kolom Tambahan */}
      {isManagingColumns && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
                <SettingsIcon size={18} className="text-indigo-400" />
                Kelola Kolom Tambahan
              </h3>
              <button onClick={() => setIsManagingColumns(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <form onSubmit={handleAddCustomColumn} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Tambah Kolom Baru</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Contoh: hobi, catatan, dll." 
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all"
                    required
                  />
                  <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    Tambah
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daftar Kolom Aktif</h4>
                <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl divide-y divide-slate-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  {getCustomStudentColumns(settings?.custom_student_columns).map(col => (
                    <div key={col} className="flex justify-between items-center p-3 text-sm">
                      <span className="text-slate-300 font-medium capitalize">{col.replace(/_/g, ' ')}</span>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteCustomColumn(col)}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Kolom"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {getCustomStudentColumns(settings?.custom_student_columns).length === 0 && (
                    <p className="text-xs text-slate-500 italic p-4 text-center">Belum ada kolom tambahan.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end">
              <button onClick={() => setIsManagingColumns(false)} className="px-5 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors cursor-pointer">Tutup</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Detail Profil Siswa & Grafik Perkembangan Nilai */}
      {selectedProfileStudent && createPortal(
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-[9999] animate-fade-in overflow-y-auto">
          <div className="bg-slate-800 rounded-3xl border border-slate-700/60 shadow-2xl max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden my-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-100">{selectedProfileStudent.nama}</h3>
                  <p className="text-xs text-slate-400">ID Siswa: {selectedProfileStudent.id.substring(0, 8)}... | Kelas {selectedProfileStudent.kelas}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedProfileStudent(null); setMapelFilter('Semua'); setSemesterFilter('Semua'); setJenisNilaiFilter('Semua'); }} 
                className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 p-2 rounded-xl transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            {/* Content Area */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1 bg-slate-800/40">
              
              {/* Profile Details Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <Award size={12} className="text-indigo-400" />
                    NISN / NIPD
                  </span>
                  <p className="text-sm font-semibold text-slate-200 font-mono">
                    {selectedProfileStudent.nisn || '-'} / {selectedProfileStudent.nipd || '-'}
                  </p>
                </div>
                
                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-400" />
                    Tempat, Tanggal Lahir
                  </span>
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedProfileStudent.tempat_lahir || '-'}, {selectedProfileStudent.tanggal_lahir || '-'}
                  </p>
                </div>

                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <User size={12} className="text-indigo-400" />
                    Orang Tua & Telepon
                  </span>
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedProfileStudent.nama_ayah || selectedProfileStudent.nama_ibu || 'Orang Tua'} ({selectedProfileStudent.no_telp_ortu || '-'})
                  </p>
                </div>
              </div>

              {/* Data Extraction and Calculation */}
              {(() => {
                // Get all grades for this student
                const studentGrades = grades.filter(g => g.id_siswa === selectedProfileStudent.id);
                
                // Filter student grades based on all selected filters
                const filteredGrades = studentGrades.filter(g => {
                  const matchMapel = mapelFilter === 'Semua' || g.mata_pelajaran === mapelFilter;
                  const matchSemester = semesterFilter === 'Semua' || g.semester === semesterFilter;
                  const matchJenis = jenisNilaiFilter === 'Semua' || g.jenis_nilai === jenisNilaiFilter;
                  return matchMapel && matchSemester && matchJenis;
                });

                // Metrics
                const totalGradesCount = filteredGrades.length;
                const totalGradesSum = filteredGrades.reduce((sum, g) => sum + Number(g.nilai), 0);
                const averageGrade = totalGradesCount > 0 ? Math.round((totalGradesSum / totalGradesCount) * 10) / 10 : 0;
                
                const gradesValues = filteredGrades.map(g => Number(g.nilai));
                const highestGrade = gradesValues.length > 0 ? Math.max(...gradesValues) : 0;
                const lowestGrade = gradesValues.length > 0 ? Math.min(...gradesValues) : 0;

                // Group grades by month code ('01' to '12') for the chart
                const monthSum: Record<string, { sum: number, count: number }> = {};
                filteredGrades.forEach(g => {
                  if (!g.tanggal) return;
                  const parts = g.tanggal.split('-');
                  if (parts.length < 2) return;
                  const monthCode = parts[1];
                  if (!monthSum[monthCode]) {
                    monthSum[monthCode] = { sum: 0, count: 0 };
                  }
                  monthSum[monthCode].sum += Number(g.nilai);
                  monthSum[monthCode].count += 1;
                });
                
                const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                const chartData = monthNames.map((name, index) => {
                  const code = String(index + 1).padStart(2, '0');
                  const monthData = monthSum[code];
                  return {
                    name,
                    'Nilai': monthData ? Math.round((monthData.sum / monthData.count) * 10) / 10 : null
                  };
                }).filter(item => item.Nilai !== null);

                return (
                  <>
                    {/* Metrics Dashboard (Bento Grid) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Rata-rata */}
                      <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rata-rata Nilai</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-indigo-400">{averageGrade || '-'}</span>
                          <span className="text-xs text-slate-500">/ 100</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-bold">
                          Avg
                        </div>
                      </div>

                      {/* Tertinggi */}
                      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nilai Tertinggi</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-emerald-400">{highestGrade || '-'}</span>
                          <span className="text-xs text-slate-500">Max</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold">
                          Max
                        </div>
                      </div>

                      {/* Terendah */}
                      <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nilai Terendah</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-rose-400">{lowestGrade || '-'}</span>
                          <span className="text-xs text-slate-500">Min</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-bold">
                          Min
                        </div>
                      </div>

                      {/* Total */}
                      <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Jumlah Penilaian</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-cyan-400">{totalGradesCount}</span>
                          <span className="text-xs text-slate-500">Entri</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-bold">
                          Qty
                        </div>
                      </div>
                    </div>

                    {/* Grafik Perkembangan Nilai Siswa */}
                    <div className="bg-slate-900/30 border border-slate-700/40 p-5 rounded-3xl space-y-4">
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/10">
                            <TrendingUp size={16} />
                          </div>
                          <h4 className="text-sm font-semibold text-slate-200">Grafik Tren Hasil Belajar Bulanan</h4>
                        </div>
                        
                        {/* Interactive Filters Container */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full lg:w-auto animate-fade-in">
                          {/* Filter Pelajaran */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Mata Pelajaran:</span>
                            <select
                              value={mapelFilter}
                              onChange={(e) => setMapelFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Pelajaran (Rata-rata)</option>
                              {(settings?.mata_pelajaran || []).map((mapel) => (
                                <option key={mapel} value={mapel}>{mapel}</option>
                              ))}
                            </select>
                          </div>

                          {/* Filter Semester */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Semester:</span>
                            <select
                              value={semesterFilter}
                              onChange={(e) => setSemesterFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Semester</option>
                              {(settings?.daftar_semester || ['Ganjil 2026', 'Genap 2026']).map((sem) => (
                                <option key={sem} value={sem}>{sem}</option>
                              ))}
                            </select>
                          </div>

                          {/* Filter Tipe Nilai */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Jenis Nilai:</span>
                            <select
                              value={jenisNilaiFilter}
                              onChange={(e) => setJenisNilaiFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Jenis Nilai</option>
                              <option value="Harian">Harian</option>
                              <option value="Tugas">Tugas</option>
                              <option value="Ujian">Ujian</option>
                            </select>
                          </div>

                          {/* Filter Jenis Grafik */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Bentuk Grafik:</span>
                            <select
                              value={chartType}
                              onChange={(e) => setChartType(e.target.value as any)}
                              className="text-xs bg-slate-800 border border-slate-700 text-indigo-400 font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="line">📈 Garis / Area</option>
                              <option value="bar">📊 Batang (Bar)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Recharts Area Chart */}
                      <div className="h-64 w-full pt-2">
                        {chartData.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-slate-700/60 rounded-2xl bg-slate-900/10">
                            <LineChart size={28} className="text-slate-600 animate-pulse" />
                            <p className="text-xs">Tidak ada data nilai yang sesuai dengan kombinasi filter saat ini.</p>
                            <p className="text-[10px] text-slate-600">Tip: Atur ulang filter atau pastikan tanggal telah diisi saat menginput nilai.</p>
                          </div>
                        ) : chartType === 'bar' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                              <XAxis 
                                dataKey="name" 
                                stroke="#94a3b8" 
                                fontSize={10}
                                tickLine={false}
                              />
                              <YAxis 
                                stroke="#94a3b8" 
                                fontSize={10}
                                domain={[0, 100]}
                                tickLine={false}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '12px' }}
                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}
                                itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                              />
                              <Bar 
                                dataKey="Nilai" 
                                fill="#6366f1"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={45}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorNilai" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                              <XAxis 
                                dataKey="name" 
                                stroke="#94a3b8" 
                                fontSize={10}
                                tickLine={false}
                              />
                              <YAxis 
                                stroke="#94a3b8" 
                                fontSize={10}
                                domain={[0, 100]}
                                tickLine={false}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '12px' }}
                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}
                                itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="Nilai" 
                                stroke="#6366f1" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorNilai)" 
                                activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Detailed Data List */}
                    <div className="bg-slate-900/30 border border-slate-700/40 p-5 rounded-3xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                            <Activity size={16} />
                          </div>
                          <h4 className="text-sm font-semibold text-slate-200">Riwayat Detail Penilaian Terfilter ({filteredGrades.length})</h4>
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-52 overflow-y-auto border border-slate-700/40 rounded-xl custom-scrollbar">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900/60 text-slate-400 sticky top-0 border-b border-slate-700/50 z-10 font-sans">
                            <tr>
                              <th className="px-4 py-3 font-semibold text-center w-12">No</th>
                              <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                              <th className="px-4 py-3 font-semibold">Semester</th>
                              <th className="px-4 py-3 font-semibold text-center w-24">Tipe</th>
                              <th className="px-4 py-3 font-semibold">Nama Kolom / Ujian</th>
                              <th className="px-4 py-3 font-semibold">Tanggal</th>
                              <th className="px-4 py-3 font-semibold text-center w-20">Nilai</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/40 text-slate-300">
                            {filteredGrades.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 italic">Belum ada data nilai yang sesuai dengan filter di atas.</td>
                              </tr>
                            ) : (
                              filteredGrades.map((g, idx) => {
                                let gradeBadgeColor = 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
                                if (g.nilai >= 80) {
                                  gradeBadgeColor = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
                                } else if (g.nilai >= 70) {
                                  gradeBadgeColor = 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
                                }
                                
                                return (
                                  <tr key={g.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                                    <td className="px-4 py-2.5 font-medium text-slate-200">{g.mata_pelajaran || '-'}</td>
                                    <td className="px-4 py-2.5 text-[11px] text-slate-400">{g.semester}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        g.jenis_nilai === 'Ujian' ? 'bg-indigo-500/10 text-indigo-400' :
                                        g.jenis_nilai === 'Tugas' ? 'bg-cyan-500/10 text-cyan-400' :
                                        'bg-amber-500/10 text-amber-400'
                                      }`}>
                                        {g.jenis_nilai}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-medium">{g.nama_kolom}</td>
                                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{g.tanggal || '-'}</td>
                                    <td className="px-4 py-2.5 text-center font-bold">
                                      <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs ${gradeBadgeColor}`}>
                                        {g.nilai}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end">
              <button 
                onClick={() => { setSelectedProfileStudent(null); setMapelFilter('Semua'); setSemesterFilter('Semua'); setJenisNilaiFilter('Semua'); }} 
                className="px-5 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Tutup Profil
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Naik Kelas Modal */}
      <NaikKelasModal
        isOpen={isNaikKelasOpen}
        onClose={() => setIsNaikKelasOpen(false)}
        onSuccess={() => loadStudents()}
        defaultSourceClass={filterClass}
      />

      {/* Student QR Cards Modal */}
      <StudentQRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => {
          setIsQrModalOpen(false);
          setSelectedQrStudent(null);
        }}
        students={students}
        initialStudent={selectedQrStudent}
        settings={settings}
        classes={uniqueClasses}
      />

      {/* Student Task Reminder Modal */}
      {selectedTaskReminderStudent && (() => {
        const unsubmitted = studentUnsubmittedTasksMap.get(selectedTaskReminderStudent.id) || [];
        const parentPhone = selectedTaskReminderStudent.hp_ortu || selectedTaskReminderStudent.no_telp_ortu || selectedTaskReminderStudent.hp_wali || '';
        const formattedPhone = formatWhatsAppNumber(parentPhone);

        const handleSendWA = () => {
          if (!parentPhone || !formattedPhone) {
            toast.error(`Nomor WhatsApp orang tua/wali ${selectedTaskReminderStudent.nama} belum tercatat`);
            return;
          }
          const taskListText = unsubmitted
            .map((t, idx) => `${idx + 1}. *${t.judul}* (${t.mata_pelajaran}) - Tenggat: ${t.tanggal_kumpul || '-'}`)
            .join('\n');

          const msg = `Yth. Bapak/Ibu Orang Tua/Wali dari *${selectedTaskReminderStudent.nama}*,\n\n` +
            `Sistem EduSync menginformasikan terdapat *${unsubmitted.length} tugas* yang *BELUM DIKUMPULKAN* oleh putra/putri Bapak/Ibu:\n\n` +
            `${taskListText}\n\n` +
            `Mohon bantuan pendampingan dan bimbingannya di rumah agar tugas-tugas tersebut dapat segera diselesaikan dan dikumpulkan. Terima kasih. 🙏`;

          window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const handleMarkTaskComplete = async (taskId: string) => {
          try {
            const targetTask = tasks.find(t => t.id === taskId);
            if (!targetTask) return;
            const updatedPenyelesaian = { ...(targetTask.penyelesaian || {}), [selectedTaskReminderStudent.id]: true };
            const updatedTask = { ...targetTask, penyelesaian: updatedPenyelesaian, updated_at: new Date().toISOString() };
            await store.tasks.setItem(taskId, updatedTask);
            toast.success(`Tugas '${targetTask.judul}' ditandai SELESAI untuk ${selectedTaskReminderStudent.nama}`);
            loadTasks();
          } catch (e) {
            toast.error('Gagal memperbarui status tugas');
          }
        };

        return createPortal(
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                    <Bell size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      Pusat Pengingat Tugas Siswa
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedTaskReminderStudent.nama} • Kelas {selectedTaskReminderStudent.kelas || '-'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTaskReminderStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contact Info Card */}
              <div className="p-3.5 bg-slate-800/80 border border-slate-700/70 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="text-slate-400 font-medium">Kontak Orang Tua / Wali:</p>
                  <p className="font-mono font-bold text-slate-200 mt-0.5">
                    {parentPhone ? `WhatsApp: ${parentPhone}` : 'Belum tercatat'}
                  </p>
                </div>
                <button
                  onClick={handleSendWA}
                  disabled={!parentPhone || unsubmitted.length === 0}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer border border-emerald-400/30"
                >
                  <MessageSquare size={15} />
                  <span>Kirim Pengingat WA</span>
                </button>
              </div>

              {/* Task List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 uppercase tracking-wider">
                    Daftar Tugas Belum Dikumpul ({unsubmitted.length})
                  </span>
                  {unsubmitted.length === 0 && (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={14} /> Semua Tugas Selesai
                    </span>
                  )}
                </div>

                {unsubmitted.length === 0 ? (
                  <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-xs text-emerald-400 font-medium">
                    Siswa ini telah menyelesaikan seluruh tugas yang ditugaskan!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {unsubmitted.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 bg-slate-950/60 border border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{t.judul}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="text-indigo-400 font-semibold">{t.mata_pelajaran}</span>
                            <span>•</span>
                            <span>Deadline: <strong className="font-mono text-slate-300">{t.tanggal_kumpul || '-'}</strong></span>
                          </p>
                        </div>

                        <button
                          onClick={() => handleMarkTaskComplete(t.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600/30 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/40 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0"
                          title="Tandai Sudah Dikumpul"
                        >
                          Set Selesai
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-2 flex justify-end border-t border-slate-800">
                <button
                  onClick={() => setSelectedTaskReminderStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Import Preview Validation Modal */}
      <ImportPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          if (pendingImportContext?.fileInput) {
            pendingImportContext.fileInput.value = '';
          }
          setPendingImportContext(null);
          toast('Proses impor dibatalkan.', { icon: 'ℹ️' });
        }}
        onConfirmImport={handleFinalizeImport}
        report={pendingImportContext?.validationReport || null}
        fileName={pendingImportContext?.fileName || 'Berkas Impor'}
        fileSize={pendingImportContext?.fileSize}
      />

      {/* Import Diagnostic Log Modal */}
      <ImportDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        report={lastDiagnosticReport}
        onRetrySync={async () => {
          try {
            toast.loading('Mencoba menyinkronkan ulang data ke Cloud Firebase...', { duration: 3000 });
            await pushAllLocalDataToFirebase();
            toast.success('Sinkronisasi ulang ke Cloud Firebase berhasil!');
            setIsDiagnosticModalOpen(false);
          } catch (e: any) {
            toast.error('Gagal sinkronisasi ulang: ' + (e?.message || e));
          }
        }}
      />
    </div>
  );
}
