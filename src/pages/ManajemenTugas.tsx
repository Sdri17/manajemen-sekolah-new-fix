import React, { useState, useEffect, useMemo } from 'react';
import { store, Student, StudentTask, Settings } from '../lib/store';
import { getMergedClassesFromStudents } from '../lib/classHelper';
import { getCurrentUser, getAssignedClasses, filterStudentsForUser, filterRecordsForUser } from '../lib/rbac';
import { formatWhatsAppNumber } from '../lib/WhatsAppSender';
import { v4 as uuidv4 } from 'uuid';
import { ClipboardList, Plus, Trash2, Edit3, Save, CheckSquare, Square, Check, X, Search, Filter, BookOpen, AlertCircle, Calendar, Info, Eye, ChevronDown, ChevronUp, Download, Phone, MessageSquare, Copy, Send, Share2, User, Printer, Clock, Bell } from 'lucide-react';
import Pagination from '../components/Pagination';
import toast from 'react-hot-toast';
import { usePendingSync } from '../hooks/usePendingSync';
import { PendingBadge } from '../components/PendingBadge';
import BackgroundDataBanner from '../components/BackgroundDataBanner';
import TaskNotificationWidget from '../components/TaskNotificationWidget';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ManajemenTugasProps {
  role: 'guru' | 'kepsek';
  semester: string;
  settings: Settings | null;
}

export default function ManajemenTugas({ role, semester, settings }: ManajemenTugasProps) {
  const { isPending } = usePendingSync();
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'checklist' | 'rekap'>('checklist');

  // Filtering & Search states (Checklist tab)
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchStudentQuery, setSearchStudentQuery] = useState<string>('');

  // Date & Status filter states for Checklist tab
  const [filterDatePreset, setFilterDatePreset] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [filterDateType, setFilterDateType] = useState<'kumpul' | 'diberikan'>('kumpul');
  const [filterSpecificDate, setFilterSpecificDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'incomplete' | 'completed' | 'overdue' | 'due_today'>('all');
  const [filterStudentStatus, setFilterStudentStatus] = useState<'all' | 'incomplete' | 'completed'>('all');

  // Filtering & Search states (Rekap tab)
  const [rekapStartDate, setRekapStartDate] = useState<string>('');
  const [rekapEndDate, setRekapEndDate] = useState<string>('');
  const [rekapKelas, setRekapKelas] = useState<string>('');
  const [rekapSubject, setRekapSubject] = useState<string>('');
  const [rekapSearch, setRekapSearch] = useState<string>('');
  const [rekapStatus, setRekapStatus] = useState<'all' | 'incomplete' | 'completed' | 'overdue'>('all');
  const [rekapSpecificDate, setRekapSpecificDate] = useState<string>('');

  // Selected task in rekap details view
  const [rekapDetailTaskId, setRekapDetailTaskId] = useState<string | null>(null);

  // Form states for creating/editing task
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [judul, setJudul] = useState('');
  const [mapel, setMapel] = useState('');
  const [kelas, setKelas] = useState('');
  const [tglDiberikan, setTglDiberikan] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tglKumpul, setTglKumpul] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Pagination states for students in checklist
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Pagination for the rekap task table
  const [rekapPage, setRekapPage] = useState(1);
  const [rekapPageSize, setRekapPageSize] = useState(10);

  // Custom task deletion state
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);
  const [showKepsekSig, setShowKepsekSig] = useState<boolean>(settings?.show_ttd_kepsek ?? true);

  // Kop Surat Toggle
  const [useKopSurat, setUseKopSurat] = useState<boolean>(settings?.tampilkan_kop_surat ?? true);

  useEffect(() => {
    if (settings && typeof settings.tampilkan_kop_surat === 'boolean') {
      setUseKopSurat(settings.tampilkan_kop_surat);
    }
  }, [settings]);

  // --- WHATSAPP NOTIFICATION STATES ---
  const [grades, setGrades] = useState<any[]>([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'group' | 'personal'>('group');
  const [selectedStudentForNotification, setSelectedStudentForNotification] = useState<Student | null>(null);
  const [whatsappChoiceStudent, setWhatsappChoiceStudent] = useState<Student | null>(null);
  
  // Group messaging states
  const [groupTemplateType, setGroupTemplateType] = useState<'incomplete' | 'all_status' | 'pr_tugas' | 'custom'>('incomplete');
  const [groupMessageText, setGroupMessageText] = useState('');
  
  // Personal messaging states
  const [personalTemplateType, setPersonalTemplateType] = useState<'default' | 'pr_tugas' | 'custom'>('default');
  const [personalMessageText, setPersonalMessageText] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  
  // Group WA link
  const [classGroupLink, setClassGroupLink] = useState('');
  const [isSavingGroupLink, setIsSavingGroupLink] = useState(false);

  const formatDateIndo = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Uses formatWhatsAppNumber from ../lib/WhatsAppSender

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
      if (!rekapKelas || !assignedClasses.some(c => c.toLowerCase() === rekapKelas.toLowerCase())) {
        if (assignedClasses[0] && rekapKelas !== assignedClasses[0]) {
          setRekapKelas(assignedClasses[0]);
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

  const loadData = async (deletedId?: string) => {
    // 1. Load active students (excluding alumni)
    const sList: Student[] = [];
    await store.students.iterate<Student, void>((v) => {
      if (v.kelas && v.kelas.toLowerCase() === 'alumni') return;
      sList.push(v);
    });
    const userFilteredStudents = filterStudentsForUser(currentUser, sList);
    setStudents(userFilteredStudents.sort((a, b) => a.no - b.no));

    // 2. Load tasks for the current semester
    const tList: StudentTask[] = [];
    await store.tasks.iterate<StudentTask, void>((v) => {
      if (v.semester === semester) {
        tList.push(v);
      }
    });
    const userFilteredTasks = filterRecordsForUser(currentUser, tList);
    // Sort tasks by date given descending
    userFilteredTasks.sort((a, b) => b.tanggal_diberikan.localeCompare(a.tanggal_diberikan));
    setTasks(userFilteredTasks);

    const effectiveSelectedId = deletedId && selectedTaskId === deletedId ? null : selectedTaskId;

    if (userFilteredTasks.length > 0 && !effectiveSelectedId) {
      setSelectedTaskId(userFilteredTasks[0].id);
    } else if (userFilteredTasks.length === 0) {
      setSelectedTaskId(null);
    }

    // 3. Load grades for the current semester
    const gList: any[] = [];
    await store.grades.iterate<any, void>((v) => {
      if (v.semester === semester) {
        gList.push(v);
      }
    });
    setGrades(gList);
  };

  const activeClasses = useMemo(() => {
    const allMergedClasses = getMergedClassesFromStudents(students, settings?.daftar_kelas);
    return isRestrictedClass
      ? allMergedClasses.filter(c => assignedClasses.some(a => a.toLowerCase() === c.trim().toLowerCase()))
      : allMergedClasses;
  }, [students, settings?.daftar_kelas, isRestrictedClass, assignedClassesKey]);

  const activeSubjects = useMemo(() => {
    return settings?.mata_pelajaran || [];
  }, [settings]);

  // Handle opening form for adding task
  const handleOpenAddForm = () => {
    setEditingTaskId(null);
    setJudul('');
    setMapel(activeSubjects[0] || '');
    setKelas(activeClasses[0] || (isRestrictedClass && assignedClasses[0] ? assignedClasses[0] : ''));
    setTglDiberikan(format(new Date(), 'yyyy-MM-dd'));
    setTglKumpul(format(new Date(), 'yyyy-MM-dd'));
    setIsFormOpen(true);
  };

  // Handle opening form for editing task
  const handleOpenEditForm = (task: StudentTask) => {
    setEditingTaskId(task.id);
    setJudul(task.judul);
    setMapel(task.mata_pelajaran);
    setKelas(task.kelas);
    setTglDiberikan(task.tanggal_diberikan);
    setTglKumpul(task.tanggal_kumpul || '');
    setIsFormOpen(true);
  };

  // Submit task creation or modification
  const handleSaveTaskWithNotification = async (action: 'none' | 'group' | 'personal', e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (role === 'kepsek') {
      toast.error('Anda tidak memiliki akses (Mode Baca Saja)');
      return;
    }
    if (!judul.trim() || !mapel || !kelas) {
      toast.error('Silakan lengkapi semua isian formulir tugas.');
      return;
    }

    try {
      let taskId = editingTaskId || uuidv4();
      let savedTask: StudentTask;

      if (editingTaskId) {
        // Edit existing task
        const existingTask = tasks.find(t => t.id === editingTaskId);
        if (!existingTask) return;

        const ownerIdVal = currentUser?.id || 'system';
        savedTask = {
          ...existingTask,
          OwnerID: existingTask.OwnerID || ownerIdVal,
          ownerId: existingTask.ownerId || ownerIdVal,
          judul: judul.trim(),
          mata_pelajaran: mapel,
          kelas,
          tanggal_diberikan: tglDiberikan,
          tanggal_kumpul: tglKumpul || undefined,
        };
      } else {
        // Create new task
        const initialPenyelesaian: Record<string, boolean> = {};
        
        // Initialize completion status as false for all active students in the selected class
        students
          .filter(s => s.kelas === kelas)
          .forEach(s => {
            initialPenyelesaian[s.id] = false;
          });

        const ownerIdVal = currentUser?.id || 'system';
        savedTask = {
          id: taskId,
          OwnerID: ownerIdVal,
          ownerId: ownerIdVal,
          judul: judul.trim(),
          mata_pelajaran: mapel,
          kelas,
          tanggal_diberikan: tglDiberikan,
          tanggal_kumpul: tglKumpul || undefined,
          semester,
          penyelesaian: initialPenyelesaian
        };
      }

      await store.tasks.setItem(taskId, savedTask);
      toast.success(editingTaskId ? 'Berhasil memperbarui informasi tugas.' : 'Berhasil membuat tugas baru.');

      setIsFormOpen(false);
      
      // Reload data synchronously to update component state
      await loadData();
      
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));

      if (action !== 'none') {
        setSelectedTaskId(taskId);
        setNotificationTab(action);
        
        if (action === 'group') {
          setGroupTemplateType('pr_tugas');
          const links = (settings?.wa_group_links || {}) as Record<string, string>;
          setClassGroupLink(links[kelas] || '');
        } else {
          setPersonalTemplateType('pr_tugas');
          const classStudents = students.filter(s => s.kelas === kelas);
          if (classStudents.length > 0) {
            setSelectedStudentForNotification(classStudents[0]);
            setPersonalPhone(classStudents[0].no_telp_ortu || classStudents[0].nomor_telepon || '');
          }
        }
        
        setIsNotificationModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan tugas.');
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    await handleSaveTaskWithNotification('none', e);
  };

  // Delete task completely
  const handleDeleteTask = async (taskId: string) => {
    if (role === 'kepsek') {
      toast.error('Anda tidak memiliki akses (Mode Baca Saja)');
      return;
    }

    const targetId = taskId;
    // Instantly close modal and update state
    if (selectedTaskId === targetId) {
      setSelectedTaskId(null);
    }
    setTaskToDeleteId(null);
    setTasks(prev => prev.filter(t => t.id !== targetId));
    toast.success('Tugas berhasil dihapus.');

    try {
      await store.tasks.removeItem(targetId);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus tugas.');
      loadData();
    }
  };

  // Toggle single student completion status
  const handleToggleCompletion = async (studentId: string) => {
    if (role === 'kepsek') return; // Read-only for kepsek
    if (!selectedTaskId) return;

    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    const currentStatus = !!task.penyelesaian[studentId];
    const updatedPenyelesaian = {
      ...task.penyelesaian,
      [studentId]: !currentStatus
    };

    const updatedTask = {
      ...task,
      penyelesaian: updatedPenyelesaian
    };

    // Update locally in state immediately for real-time responsiveness
    setTasks(prev => prev.map(t => t.id === selectedTaskId ? updatedTask : t));

    // Persist to store
    try {
      await store.tasks.setItem(selectedTaskId, updatedTask);
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan status penyelesaian.');
      loadData(); // revert
    }
  };

  // Bulk set completion status for all students currently listed
  const handleBulkSetStatus = async (status: boolean) => {
    if (role === 'kepsek') return;
    if (!selectedTaskId || !selectedTask) return;

    const updatedPenyelesaian = { ...selectedTask.penyelesaian };
    
    // Toggle all filtered students of the selected task's class
    filteredChecklistStudents.forEach(s => {
      updatedPenyelesaian[s.id] = status;
    });

    const updatedTask = {
      ...selectedTask,
      penyelesaian: updatedPenyelesaian
    };

    setTasks(prev => prev.map(t => t.id === selectedTaskId ? updatedTask : t));

    try {
      await store.tasks.setItem(selectedTaskId, updatedTask);
      toast.success(status ? 'Seluruh siswa ditandai SELESAI.' : 'Seluruh siswa ditandai BELUM SELESAI.');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui status masal.');
      loadData();
    }
  };

  // --- WHATSAPP NOTIFICATION HELPER FUNCTIONS ---
  
  // Open notification modal for general/group use
  const handleOpenNotificationModal = () => {
    if (!selectedTask) return;
    setNotificationTab('group');
    setSelectedStudentForNotification(null);
    setGroupTemplateType('incomplete');
    setPersonalTemplateType('default');
    
    // Set group link from settings if it exists
    const links = (settings?.wa_group_links || {}) as Record<string, string>;
    setClassGroupLink(links[selectedTask.kelas] || '');
    
    setIsNotificationModalOpen(true);
  };

  // Open notification modal for a single student (pre-selected)
  const handleOpenSingleNotification = (student: Student) => {
    if (!selectedTask) return;
    setNotificationTab('personal');
    setSelectedStudentForNotification(student);
    setPersonalTemplateType('default');
    setPersonalPhone(student.no_telp_ortu || '');
    
    // Set group link from settings if it exists
    const links = (settings?.wa_group_links || {}) as Record<string, string>;
    setClassGroupLink(links[selectedTask.kelas] || '');
    
    setIsNotificationModalOpen(true);
  };

  const handleSaveClassGroupLink = async () => {
    if (!selectedTask) return;
    setIsSavingGroupLink(true);
    try {
      const updatedLinks = { ...(settings?.wa_group_links || {}), [selectedTask.kelas]: classGroupLink.trim() };
      const updatedSettings = { ...settings, wa_group_links: updatedLinks } as Settings;
      
      await store.settings.setItem('app_settings', updatedSettings);
      toast.success(`Tautan grup WhatsApp untuk Kelas ${selectedTask.kelas} berhasil disimpan!`);
      // Update global settings state
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('data-changed'));
      }
    } catch (err: any) {
      toast.error('Gagal menyimpan tautan: ' + err.message);
    } finally {
      setIsSavingGroupLink(false);
    }
  };

  const getGroupMessage = () => {
    if (!selectedTask) return '';
    const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
    const schoolName = settings?.nama_sekolah || 'Sekolah';
    const taskClass = selectedTask.kelas;
    const taskTitle = selectedTask.judul;
    const taskSubject = selectedTask.mata_pelajaran;
    const taskDeadline = selectedTask.tanggal_kumpul ? formatDateIndo(selectedTask.tanggal_kumpul) : 'Tidak ada';

    // Get all students of this class
    const classStudents = students.filter(s => s.kelas === taskClass);

    if (groupTemplateType === 'incomplete') {
      const incompleteStudents = classStudents.filter(s => !selectedTask.penyelesaian[s.id]);
      
      let listStr = '';
      if (incompleteStudents.length > 0) {
        listStr = incompleteStudents.map((s, idx) => {
          // Find student's average or details in this subject
          const studentGradesInSubject = grades.filter(g => g.id_siswa === s.id && g.mata_pelajaran === taskSubject);
          const avgScore = studentGradesInSubject.length > 0
            ? Math.round(studentGradesInSubject.reduce((sum, g) => sum + g.nilai, 0) / studentGradesInSubject.length)
            : null;
          const scoreDetail = avgScore !== null ? ` (Rata-rata Nilai: ${avgScore})` : '';
          return `${idx + 1}. *${s.nama}*${scoreDetail}`;
        }).join('\n');
      } else {
        listStr = 'Sempurna! Semua siswa telah mengumpulkan tugas ini. 🎉';
      }

      return `*INFO PENGUMPULAN TUGAS KELAS ${taskClass.toUpperCase()}*\n` +
             `📖 Tugas: *${taskTitle}*\n` +
             `📚 Mapel: *${taskSubject}*\n` +
             `📅 Tenggat: *${taskDeadline}*\n` +
             `🏫 Sekolah: *${schoolName}*\n` +
             `----------------------------------------\n\n` +
             `Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *${taskClass}*,\n\n` +
             `Berikut adalah daftar siswa yang *belum mengumpulkan* tugas di atas:\n\n` +
             `${listStr}\n\n` +
             `Mohon bantuan Bapak/Ibu di rumah untuk mengingatkan dan mendampingi putra/putrinya agar segera menyelesaikan dan mengumpulkan tugas sekolah tersebut.\n\n` +
             `Terima kasih banyak atas perhatian dan kerja samanya. 🙏\n\n` +
             `Salam hangat,\n*${teacherName}* (Wali Kelas)`;
    } else if (groupTemplateType === 'all_status') {
      let listStr = classStudents.map((s, idx) => {
        const isCompleted = !!selectedTask.penyelesaian[s.id];
        const statusIcon = isCompleted ? '✅ Selesai' : '❌ Belum';
        
        // Find student's average
        const studentGradesInSubject = grades.filter(g => g.id_siswa === s.id && g.mata_pelajaran === taskSubject);
        const avgScore = studentGradesInSubject.length > 0
          ? Math.round(studentGradesInSubject.reduce((sum, g) => sum + g.nilai, 0) / studentGradesInSubject.length)
          : null;
        const scoreDetail = avgScore !== null ? ` (Rata-rata: ${avgScore})` : '';
        
        return `${idx + 1}. *${s.nama}*: ${statusIcon}${scoreDetail}`;
      }).join('\n');

      return `*REKAP STATUS TUGAS KELAS ${taskClass.toUpperCase()}*\n` +
             `📖 Tugas: *${taskTitle}*\n` +
             `📚 Mapel: *${taskSubject}*\n` +
             `📅 Tenggat: *${taskDeadline}*\n` +
             `🏫 Sekolah: *${schoolName}*\n` +
             `----------------------------------------\n\n` +
             `Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *${taskClass}*,\n\n` +
             `Berikut rekap status pengumpulan tugas putra/putri kita per hari ini:\n\n` +
             `${listStr}\n\n` +
             `Mari kita bersama-sama terus mendukung serta memotivasi semangat belajar anak-anak kita agar senantiasa berprestasi.\n\n` +
             `Terima kasih. 🙏\n\n` +
             `Salam hangat,\n*${teacherName}* (Wali Kelas)`;
    } else if (groupTemplateType === 'pr_tugas') {
      return `*📢 PEMBERITAHUAN PR / TUGAS KELAS ${taskClass.toUpperCase()}*\n` +
             `🏫 Sekolah: *${schoolName}*\n` +
             `----------------------------------------\n\n` +
             `Yth. Bapak/Ibu Orang Tua / Wali Murid Kelas *${taskClass}*,\n\n` +
             `Kami ingin mengumumkan adanya tugas/PR baru yang harus dikerjakan oleh seluruh siswa Kelas *${taskClass}*:\n\n` +
             `📚 *Mata Pelajaran:* ${taskSubject}\n` +
             `📝 *Tugas:* ${taskTitle}\n` +
             `📅 *Tanggal Diberikan:* ${selectedTask.tanggal_diberikan ? formatDateIndo(selectedTask.tanggal_diberikan) : '-'}\n` +
             `📅 *Tanggal Dikumpulkan:* ${taskDeadline}\n\n` +
             `Mohon kerja sama Bapak/Ibu sekalian untuk memantau dan membimbing putra/putrinya agar menyelesaikan tugas ini sebelum batas waktu pengumpulan.\n\n` +
             `Terima kasih atas perhatian dan dukungannya. 🙏\n\n` +
             `Salam hangat,\n*${teacherName}* (Wali Kelas)`;
    } else {
      return groupMessageText || '';
    }
  };

  const getPersonalMessage = (student: Student | null) => {
    if (!selectedTask || !student) return '';
    const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
    const schoolName = settings?.nama_sekolah || 'Sekolah';
    const taskTitle = selectedTask.judul;
    const taskSubject = selectedTask.mata_pelajaran;
    const taskDeadline = selectedTask.tanggal_kumpul ? formatDateIndo(selectedTask.tanggal_kumpul) : 'Tidak ada';
    const isCompleted = !!selectedTask.penyelesaian[student.id];
    const statusText = isCompleted ? '*Sudah Selesai (Mengumpulkan)*' : '*Belum Selesai (Belum Mengumpulkan)*';

    // Find student grades in this subject
    const studentGradesInSubject = grades.filter(g => g.id_siswa === student.id && g.mata_pelajaran === taskSubject);
    const avgScore = studentGradesInSubject.length > 0
      ? Math.round(studentGradesInSubject.reduce((sum, g) => sum + g.nilai, 0) / studentGradesInSubject.length)
      : null;
    
    let gradeDetailStr = '';
    if (studentGradesInSubject.length > 0) {
      gradeDetailStr = `Rata-rata Nilai *${taskSubject}* saat ini: *${avgScore}*\nDetail Catatan Nilai:\n` + 
                       studentGradesInSubject.map(g => `- ${g.nama_kolom} (${g.jenis_nilai}): *${g.nilai}*`).join('\n');
    } else {
      gradeDetailStr = `Saat ini belum ada catatan nilai ujian/tugas lain untuk mata pelajaran *${taskSubject}*.`;
    }

    if (personalTemplateType === 'default') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari *${student.nama}*,\n\n` +
             `Perkenalkan saya Bapak/Ibu *${teacherName}*, selaku Wali Kelas di *${schoolName}*. Melalui pesan ini, kami ingin menginformasikan status pengerjaan tugas sekolah putra/putri Bapak/Ibu:\n\n` +
             `📖 Tugas: *${taskTitle}*\n` +
             `📚 Mapel: *${taskSubject}*\n` +
             `📅 Tenggat: *${taskDeadline}*\n` +
             `📌 Status: ${statusText}\n\n` +
             `${gradeDetailStr}\n\n` +
             `Mohon bantuannya di rumah untuk mendampingi, mengawasi, serta memotivasi putra/putri Bapak/Ibu agar senantiasa menyelesaikan tanggung jawab belajarnya dengan baik.\n\n` +
             `Terima kasih banyak atas perhatian dan kerja sama yang baik dari Bapak/Ibu. 🙏`;
    } else if (personalTemplateType === 'pr_tugas') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari *${student.nama}*,\n\n` +
             `Melalui pesan ini, kami selaku Wali Kelas di *${schoolName}* ingin menginformasikan adanya tugas/PR baru yang perlu dikerjakan oleh putra/putri Bapak/Ibu, *${student.nama}*:\n\n` +
             `📚 *Mata Pelajaran:* ${taskSubject}\n` +
             `📝 *Tugas:* ${taskTitle}\n` +
             `📅 *Tanggal Diberikan:* ${selectedTask.tanggal_diberikan ? formatDateIndo(selectedTask.tanggal_diberikan) : '-'}\n` +
             `📅 *Tanggal Dikumpulkan:* ${taskDeadline}\n\n` +
             `Mohon pendampingan Bapak/Ibu di rumah agar putra/putrinya dapat mengerjakan tugas ini dengan baik dan mengumpulkannya tepat waktu.\n\n` +
             `Terima kasih banyak atas kerja sama dan dukungannya. 🙏\n\n` +
             `Salam hangat,\n*${teacherName}* (Wali Kelas)`;
    } else {
      return personalMessageText || '';
    }
  };

  const drawTutWuriLogo = (doc: jsPDF, x: number, y: number) => {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.ellipse(x, y, 9, 9, 'S');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('TUT WURI', x, y - 2, { align: 'center' });
    doc.text('HANDAYANI', x, y + 1, { align: 'center' });
    doc.setFontSize(5);
    doc.text('★ ★ ★', x, y + 4, { align: 'center' });
  };

  const renderKopSurat = (doc: jsPDF, pageWidth: number) => {
    const pda = settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN';
    const dinas = settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
    const sekolah = settings?.nama_sekolah || 'NAMA SEKOLAH BELUM DIATUR';
    const alamat = settings?.alamat || 'Alamat Sekolah Belum Diatur';
    const npsn = settings?.npsn || '-';
    const email = settings?.email || '-';
    const logoType = settings?.kop_logo_type || 'tutwuri';
    const logoBase64 = settings?.kop_logo_base64;

    const hasLogo = logoType !== 'none';
    const textShiftX = hasLogo ? 10 : 0;

    if (hasLogo) {
      if (logoType === 'custom' && logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', 14, 8, 22, 22);
        } catch (e) {
          drawTutWuriLogo(doc, 25, 19);
        }
      } else {
        drawTutWuriLogo(doc, 25, 19);
      }
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(pda.toUpperCase(), pageWidth / 2 + textShiftX, 12, { align: 'center' });
    doc.text(dinas.toUpperCase(), pageWidth / 2 + textShiftX, 17, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(sekolah.toUpperCase(), pageWidth / 2 + textShiftX, 23, { align: 'center' });
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Alamat: ${alamat}  |  NPSN: ${npsn}  |  Email: ${email}`, pageWidth / 2 + textShiftX, 28, { align: 'center' });
    
    doc.setLineWidth(0.8);
    doc.setDrawColor(148, 163, 184);
    doc.line(14, 31, pageWidth - 14, 31);
    doc.setLineWidth(0.2);
    doc.line(14, 32.2, pageWidth - 14, 32.2);
  };

  const exportTaskPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    let titleY = 18;
    let tableStartY = 28;

    if (useKopSurat) {
      renderKopSurat(doc, pageWidth);
      titleY = 40;
      tableStartY = 49;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('LAPORAN REKAPITULASI PENUGASAN SISWA', pageWidth / 2, titleY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester: ${semester} | Kelas: ${rekapKelas || 'Semua Kelas'} | Mapel: ${rekapSubject || 'Semua Mapel'}`, pageWidth / 2, titleY + 5, { align: 'center' });

    const headers = [['No', 'Judul Tugas', 'Mata Pelajaran', 'Kelas', 'Diberikan', 'Deadline', 'Selesai / Total', 'Progress (%)']];
    
    const body = filteredRekapTasks.map((t, idx) => {
      const classStudents = students.filter(s => !rekapKelas || s.kelas === t.kelas || (!s.kelas && t.kelas === 'Umum'));
      const totalStudents = classStudents.length || 1;
      const completedCount = Object.values(t.penyelesaian || {}).filter(Boolean).length;
      const pct = Math.round((completedCount / totalStudents) * 100);

      return [
        idx + 1,
        t.judul,
        t.mata_pelajaran,
        t.kelas,
        t.tanggal_diberikan ? formatDateIndo(t.tanggal_diberikan) : '-',
        t.tanggal_kumpul ? formatDateIndo(t.tanggal_kumpul) : '-',
        `${completedCount} / ${totalStudents}`,
        `${pct}%`
      ];
    });

    autoTable(doc, {
      head: headers,
      body: body,
      startY: tableStartY,
      theme: 'grid',
      tableLineWidth: 0.15,
      tableLineColor: [148, 163, 184],
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 22 },
        7: { halign: 'center', cellWidth: 20 }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || tableStartY;
    
    // Signatures
    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);

    if (showKepsekSig) {
      const leftX = 20;
      doc.text('Mengetahui,', leftX, sigY);
      doc.text('Kepala Sekolah,', leftX, sigY + 5);
      doc.setFont('Helvetica', 'bold');
      doc.text(settings?.nama_kepala_sekolah || '................................................', leftX, sigY + 25);
      doc.setFont('Helvetica', 'normal');
      doc.text(`NIP. ${settings?.nip_kepala_sekolah || '................................................'}`, leftX, sigY + 29);
    }

    const rightX = pageWidth - 70;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Tanggal: ${today}`, rightX, sigY);
    doc.text('Guru Pengampu / Wali Kelas,', rightX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '................................................', rightX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_wali_kelas || '................................................'}`, rightX, sigY + 29);

    doc.save(`Rekap_Tugas_Siswa_${semester}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  // Action to copy group message
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Pesan disalin ke clipboard!');
  };

  // Action to send message to WhatsApp Group
  const handleSendToGroup = () => {
    const text = getGroupMessage();
    if (!text.trim()) {
      toast.error('Pesan tidak boleh kosong!');
      return;
    }
    const encodedText = encodeURIComponent(text);
    
    if (classGroupLink && classGroupLink.startsWith('http')) {
      // Open class group invite link directly
      window.open(classGroupLink, '_blank', 'noopener,noreferrer');
      toast.success('Membuka Grup WhatsApp Kelas...');
    } else {
      // Fallback: copy message and inform user
      navigator.clipboard.writeText(text);
      window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank', 'noopener,noreferrer');
      toast.success('Pesan disalin! Silakan tempel di grup WhatsApp kelas Anda.');
    }
  };

  // Action to send personal message to individual parent
  const handleSendPersonal = () => {
    if (!selectedStudentForNotification) return;
    const text = getPersonalMessage(selectedStudentForNotification);
    if (!text.trim()) {
      toast.error('Pesan tidak boleh kosong!');
      return;
    }
    if (!personalPhone.trim()) {
      toast.error('Nomor telepon wali murid tidak boleh kosong! Silakan lengkapi terlebih dahulu.');
      return;
    }
    
    const formattedPhone = formatWhatsAppNumber(personalPhone);
    const encodedText = encodeURIComponent(text);
    const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
    
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast.success(`Membuka chat WhatsApp dengan wali dari ${selectedStudentForNotification.nama}...`);
  };

  // Retrieve currently active/selected task
  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  
  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.tanggal_kumpul === todayStr);
  }, [tasks, todayStr]);

  const overdueTasks = useMemo(() => {
    return tasks.filter(t => t.tanggal_kumpul && t.tanggal_kumpul < todayStr);
  }, [tasks, todayStr]);

  // Filter tasks list (Checklist Tab)
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 1. Class filter
      const matchClass = filterClass ? t.kelas === filterClass : true;
      // 2. Subject filter
      const matchSubject = filterSubject ? t.mata_pelajaran === filterSubject : true;
      // 3. Search text
      const matchSearch = searchQuery.trim()
        ? t.judul.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.mata_pelajaran.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      // 4. Date filter
      let matchDate = true;
      const targetDate = filterDateType === 'diberikan' ? t.tanggal_diberikan : (t.tanggal_kumpul || t.tanggal_diberikan);

      if (filterDatePreset === 'today') {
        matchDate = targetDate === todayStr;
      } else if (filterDatePreset === 'this_week') {
        if (targetDate) {
          const now = new Date();
          const d = new Date(targetDate);
          const day = now.getDay() || 7;
          const monday = new Date(now);
          monday.setDate(now.getDate() - day + 1);
          monday.setHours(0, 0, 0, 0);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          matchDate = d >= monday && d <= sunday;
        }
      } else if (filterDatePreset === 'this_month') {
        if (targetDate) {
          matchDate = targetDate.substring(0, 7) === todayStr.substring(0, 7);
        }
      } else if (filterDatePreset === 'custom' && filterSpecificDate) {
        matchDate = targetDate === filterSpecificDate;
      }

      // 5. Status filter
      let matchStatus = true;
      const classStudents = students.filter(s => !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase());
      const totalStudents = classStudents.length;
      const completedCount = classStudents.filter(s => !!t.penyelesaian?.[s.id]).length;
      const isCompleted = totalStudents > 0 && completedCount === totalStudents;
      const isOverdue = t.tanggal_kumpul && t.tanggal_kumpul < todayStr && !isCompleted;
      const isDueToday = t.tanggal_kumpul === todayStr && !isCompleted;

      if (filterStatus === 'incomplete') {
        matchStatus = !isCompleted;
      } else if (filterStatus === 'completed') {
        matchStatus = isCompleted;
      } else if (filterStatus === 'overdue') {
        matchStatus = isOverdue;
      } else if (filterStatus === 'due_today') {
        matchStatus = isDueToday;
      }

      return matchClass && matchSubject && matchSearch && matchDate && matchStatus;
    });
  }, [
    tasks,
    students,
    filterClass,
    filterSubject,
    searchQuery,
    filterDatePreset,
    filterDateType,
    filterSpecificDate,
    filterStatus,
    todayStr
  ]);

  // Filter tasks for Rekap & Laporan
  const filteredRekapTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchClass = rekapKelas ? t.kelas === rekapKelas : true;
      const matchSubject = rekapSubject ? t.mata_pelajaran === rekapSubject : true;
      const matchSearch = rekapSearch.trim()
        ? t.judul.toLowerCase().includes(rekapSearch.toLowerCase()) ||
          t.mata_pelajaran.toLowerCase().includes(rekapSearch.toLowerCase())
        : true;
      
      const matchStartDate = rekapStartDate ? t.tanggal_diberikan >= rekapStartDate : true;
      const matchEndDate = rekapEndDate ? t.tanggal_diberikan <= rekapEndDate : true;

      const matchSpecificDate = rekapSpecificDate
        ? (t.tanggal_kumpul === rekapSpecificDate || t.tanggal_diberikan === rekapSpecificDate)
        : true;

      // Status filter
      let matchStatus = true;
      const classStudents = students.filter(s => !t.kelas || t.kelas === 'Umum' || s.kelas?.toLowerCase() === t.kelas.toLowerCase());
      const totalStudents = classStudents.length;
      const completedCount = classStudents.filter(s => !!t.penyelesaian?.[s.id]).length;
      const isCompleted = totalStudents > 0 && completedCount === totalStudents;
      const isOverdue = t.tanggal_kumpul && t.tanggal_kumpul < todayStr && !isCompleted;

      if (rekapStatus === 'incomplete') {
        matchStatus = !isCompleted;
      } else if (rekapStatus === 'completed') {
        matchStatus = isCompleted;
      } else if (rekapStatus === 'overdue') {
        matchStatus = isOverdue;
      }

      return matchClass && matchSubject && matchSearch && matchStartDate && matchEndDate && matchSpecificDate && matchStatus;
    });
  }, [tasks, students, rekapKelas, rekapSubject, rekapSearch, rekapStartDate, rekapEndDate, rekapSpecificDate, rekapStatus, todayStr]);

  // Filter and find students for the active checklist class
  const filteredChecklistStudents = useMemo(() => {
    if (!selectedTask) return [];
    
    // 1. Filter students that belong to the task's class
    let list = students.filter(s => s.kelas === selectedTask.kelas);

    // 2. Filter by student completion status
    if (filterStudentStatus === 'incomplete') {
      list = list.filter(s => !selectedTask.penyelesaian?.[s.id]);
    } else if (filterStudentStatus === 'completed') {
      list = list.filter(s => !!selectedTask.penyelesaian?.[s.id]);
    }

    // 3. Filter by search input
    if (searchStudentQuery.trim()) {
      const q = searchStudentQuery.toLowerCase();
      list = list.filter(s => 
        s.nama.toLowerCase().includes(q) || 
        (s.nisn && s.nisn.includes(q))
      );
    }

    return list;
  }, [students, selectedTask, filterStudentStatus, searchStudentQuery]);

  // Paginated students inside checklist
  const paginatedStudents = useMemo(() => {
    return filteredChecklistStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredChecklistStudents, currentPage, pageSize]);

  // Calculate statistics for selected task
  const stats = useMemo(() => {
    if (!selectedTask) return { total: 0, completed: 0, percentage: 0 };
    const classStudents = students.filter(s => s.kelas === selectedTask.kelas);
    const total = classStudents.length;
    const completed = classStudents.filter(s => !!selectedTask.penyelesaian[s.id]).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [selectedTask, students]);

  return (
    <div className="flex flex-col h-full text-slate-200">
      <BackgroundDataBanner collectionName="tasks" className="mx-4 mt-3" />
      {/* Page Header */}
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex items-center gap-2.5">
          <ClipboardList className="text-indigo-400 w-6 h-6" />
          <div>
            <h2 className="text-lg font-bold text-slate-100 leading-tight">Manajemen Tugas Siswa</h2>
            <p className="text-xs text-slate-400">Catat penugasan kelas dan pantau realisasi penyelesaian siswa</p>
          </div>
        </div>

        {role === 'kepsek' && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm text-sm text-rose-300">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-rose-200">Mode Baca Saja (Kepala Sekolah)</h3>
              <p className="text-rose-400/90 text-xs mt-0.5 leading-relaxed">
                Anda masuk dengan hak akses Kepala Sekolah. Fitur buat tugas baru, ubah status pengerjaan siswa, dan pengiriman notifikasi dinonaktifkan.
              </p>
            </div>
          </div>
        )}

        {role !== 'kepsek' && (
          <button
            onClick={handleOpenAddForm}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-500/10 flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            <span>Buat Tugas Baru</span>
          </button>
        )}
      </div>

      {/* Real-time Task Completion Notification Banner Widget */}
      <TaskNotificationWidget
        semester={semester}
        className="mx-4 mt-3"
        onSelectTask={(id) => {
          setSelectedTaskId(id);
          setActiveTab('checklist');
        }}
      />

      {/* Task Deadline Alert Banner */}
      {(todayTasks.length > 0 || overdueTasks.length > 0) && (
        <div className="mx-4 mt-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-amber-200 shadow-sm">
          <div className="flex items-start gap-2.5">
            <Bell className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-300">🚨 Notifikasi Tenggat Tugas:</span>
                {todayTasks.length > 0 && (
                  <span className="bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full text-[10px]">
                    {todayTasks.length} Tugas Dikumpul HARI INI
                  </span>
                )}
                {overdueTasks.length > 0 && (
                  <span className="bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full text-[10px]">
                    {overdueTasks.length} Lewat Tenggat
                  </span>
                )}
              </div>
              <p className="text-amber-300/80 mt-1 text-[11px]">
                {todayTasks.length > 0 
                  ? `Tugas berikut harus dikumpulkan hari ini (${formatDateIndo(todayStr)}): ${todayTasks.map(t => `"${t.judul}" (${t.kelas})`).join(', ')}` 
                  : `Terdapat ${overdueTasks.length} tugas yang telah melewati tanggal tenggat.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {todayTasks.length > 0 && (
              <button
                onClick={() => {
                  setSelectedTaskId(todayTasks[0].id);
                  setActiveTab('checklist');
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Lihat Tugas Hari Ini
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/15 flex gap-2 shrink-0">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'checklist'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Checklist Penyelesaian Tugas
        </button>
        <button
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Laporan & Rekapitulasi Tugas
        </button>
      </div>

      {activeTab === 'checklist' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Panel: Assignment Lists & Filters (4 Columns) */}
          <div className="lg:col-span-4 border-r border-slate-700/50 flex flex-col h-full bg-slate-900/10">
            {/* List Controls */}
            <div className="p-4 border-b border-slate-700/40 space-y-3 shrink-0">
              {/* Search Input */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari tugas..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* Select Filter Class & Subject */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
                >
                  <option value="">Semua Kelas</option>
                  {activeClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
                >
                  <option value="">Semua Mapel</option>
                  {activeSubjects.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Filter Tanggal Tugas & Status Tugas */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Filter Tanggal & Status</span>
                  {(filterDatePreset !== 'all' || filterStatus !== 'all' || filterClass || filterSubject || searchQuery) && (
                    <button
                      onClick={() => {
                        setFilterDatePreset('all');
                        setFilterStatus('all');
                        setFilterSpecificDate('');
                        setFilterClass('');
                        setFilterSubject('');
                        setSearchQuery('');
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filterDatePreset}
                    onChange={e => setFilterDatePreset(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 transition-all cursor-pointer"
                  >
                    <option value="all">📅 Semua Tanggal</option>
                    <option value="today">📅 Hari Ini</option>
                    <option value="this_week">📅 Minggu Ini</option>
                    <option value="this_month">📅 Bulan Ini</option>
                    <option value="custom">📅 Pilih Tanggal...</option>
                  </select>

                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 transition-all cursor-pointer"
                  >
                    <option value="all">⚡ Semua Status</option>
                    <option value="incomplete">⏳ Belum Lengkap</option>
                    <option value="completed">✅ 100% Selesai</option>
                    <option value="overdue">🚨 Lewat Tenggat</option>
                    <option value="due_today">🔔 Tenggat Hari Ini</option>
                  </select>
                </div>

                {/* Filter Date Type and Custom Date Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={filterDateType}
                    onChange={e => setFilterDateType(e.target.value as any)}
                    className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400 cursor-pointer"
                  >
                    <option value="kumpul">Tenggat Kumpul</option>
                    <option value="diberikan">Tgl Diberikan</option>
                  </select>

                  {filterDatePreset === 'custom' && (
                    <input
                      type="date"
                      value={filterSpecificDate}
                      onChange={e => setFilterSpecificDate(e.target.value)}
                      className="flex-1 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Tasks Scroll Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-45" />
                  <p className="text-xs font-semibold">Tidak Ada Tugas Ditemukan</p>
                  <p className="text-[10px] text-slate-600 max-w-xs mx-auto mt-1">Gunakan tombol diatas untuk membuat tugas baru bagi siswa Anda.</p>
                </div>
              ) : (
                filteredTasks.map(t => {
                  const isSelected = t.id === selectedTaskId;
                  const totalInClass = students.filter(s => s.kelas === t.kelas).length;
                  const completedInClass = students.filter(s => s.kelas === t.kelas && !!t.penyelesaian[s.id]).length;
                  const perc = totalInClass > 0 ? Math.round((completedInClass / totalInClass) * 100) : 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTaskId(t.id);
                        setCurrentPage(1);
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/50 shadow-md'
                          : 'bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/35 hover:border-slate-700/60'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm text-slate-200 truncate leading-snug">{t.judul}</h4>
                            <PendingBadge isPending={isPending('tasks', t.id)} compact={true} />
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                            <span className="font-medium text-slate-300">{t.mata_pelajaran}</span>
                            <span>•</span>
                            <span className="bg-slate-900/60 text-indigo-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[9px] border border-slate-800">{t.kelas}</span>
                          </div>
                        </div>

                        {role !== 'kepsek' && (
                          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenEditForm(t); }}
                              className="p-1.5 bg-slate-800/80 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/50 text-slate-400 transition-colors cursor-pointer"
                              title="Edit Tugas"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setTaskToDeleteId(t.id); }}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg border border-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                              title="Hapus Tugas"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar inside List item */}
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span>Penyelesaian: {completedInClass} / {totalInClass} Siswa</span>
                          <span className="font-semibold font-mono text-indigo-400">{perc}%</span>
                        </div>
                        <div className="w-full bg-slate-950/60 border border-slate-800/45 rounded-full h-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${perc === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${perc}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="text-[9px] text-slate-500 mt-1 flex flex-wrap justify-between items-center gap-1">
                        <span>Diberikan: {t.tanggal_diberikan}</span>
                        {t.tanggal_kumpul === todayStr && (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-md font-bold text-[9px] flex items-center gap-1">
                            <Clock size={10} /> Dikumpul Hari Ini!
                          </span>
                        )}
                        {t.tanggal_kumpul && t.tanggal_kumpul < todayStr && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-semibold text-[9px] flex items-center gap-1">
                            <AlertCircle size={10} /> Lewat Tenggat
                          </span>
                        )}
                        {t.tanggal_kumpul && t.tanggal_kumpul > todayStr && (
                          <span className="text-slate-400">Tenggat: {t.tanggal_kumpul}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Student Checklist details (8 Columns) */}
          <div className="lg:col-span-8 flex flex-col h-full bg-slate-950/20">
            {selectedTask ? (
              <>
                {/* Task Title header with details */}
                <div className="p-5 border-b border-slate-700/50 bg-slate-900/20 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 font-bold px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider">{selectedTask.kelas}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-sm font-semibold text-slate-300">{selectedTask.mata_pelajaran}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">{selectedTask.judul}</h3>
                    <p className="text-xs text-slate-400">
                      Tugas diberikan pada tanggal <span className="font-semibold text-slate-300">{selectedTask.tanggal_diberikan}</span> 
                      {selectedTask.tanggal_kumpul ? <> dan tenggat pengumpulan <span className="font-semibold text-slate-300">{selectedTask.tanggal_kumpul}</span></> : ''}.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    {/* Progress Circle / Indicator */}
                    <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl md:min-w-[180px]">
                      <div className="w-10 h-10 rounded-full border-4 border-slate-800 flex items-center justify-center font-bold font-mono text-xs text-indigo-400 shrink-0" style={{ backgroundImage: `conic-gradient(#6366f1 ${stats.percentage}%, transparent 0)` }}>
                        <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] text-slate-200">
                          {stats.percentage}%
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Realisasi Tugas</p>
                        <p className="text-sm font-bold text-slate-200 mt-0.5">{stats.completed} <span className="text-slate-400 font-normal">/ {stats.total} Selesai</span></p>
                      </div>
                    </div>

                    {/* WhatsApp Notification Button */}
                    {role !== 'kepsek' ? (
                      <button
                        onClick={handleOpenNotificationModal}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-3 rounded-2xl text-xs cursor-pointer shadow-lg shadow-emerald-600/10 transition-all border border-emerald-500/30 md:self-stretch justify-center"
                        title="Kirim Notifikasi WhatsApp"
                      >
                        <MessageSquare size={16} />
                        <span>Kirim Notifikasi WA</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-950/60 border border-slate-800 text-xs font-semibold text-slate-400 rounded-2xl md:self-stretch select-none">
                        <AlertCircle size={14} className="text-slate-500 shrink-0" />
                        <span>Notifikasi WA (Read-only)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Student Checklist Filter Bar */}
                <div className="p-4 border-b border-slate-700/30 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-52">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Cari siswa..."
                        value={searchStudentQuery}
                        onChange={e => { setSearchStudentQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>

                    {/* Filter Status Siswa */}
                    <select
                      value={filterStudentStatus}
                      onChange={e => { setFilterStudentStatus(e.target.value as any); setCurrentPage(1); }}
                      className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="all">Semua Siswa</option>
                      <option value="incomplete">⏳ Belum Kumpul</option>
                      <option value="completed">✅ Sudah Selesai</option>
                    </select>
                  </div>

                  {role !== 'kepsek' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleBulkSetStatus(true)}
                        className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold border border-emerald-500/20 transition-all cursor-pointer"
                      >
                        Selesai Semua
                      </button>
                      <button
                        onClick={() => handleBulkSetStatus(false)}
                        className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/20 transition-all cursor-pointer"
                      >
                        Belum Semua
                      </button>
                    </div>
                  )}
                </div>

                {/* Checklist Grid Table */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="text-xs uppercase bg-slate-900/80 sticky top-0 backdrop-blur-sm z-10 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4 font-medium w-16 text-center">No</th>
                        <th className="px-6 py-4 font-medium w-28">NISN</th>
                        <th className="px-6 py-4 font-bold">Nama Lengkap</th>
                        <th className="px-6 py-4 font-medium w-36 text-center">Realisasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                            {searchStudentQuery ? 'Tidak ada siswa yang cocok dengan pencarian Anda.' : 'Belum ada siswa dalam kelas ini.'}
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((s) => {
                          const isCompleted = !!selectedTask.penyelesaian[s.id];
                          
                          return (
                            <tr 
                              key={s.id} 
                              onClick={() => handleToggleCompletion(s.id)}
                              className={`transition-colors group ${role !== 'kepsek' ? 'hover:bg-slate-800/15 cursor-pointer' : 'cursor-default'}`}
                            >
                              <td className="px-6 py-3.5 text-center text-slate-400">{s.no}</td>
                              <td className="px-6 py-3.5 text-slate-400 font-mono text-xs">{s.nisn || '-'}</td>
                              <td className="px-6 py-3.5 font-medium text-slate-200">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{s.nama}</span>
                                  {role !== 'kepsek' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWhatsappChoiceStudent(s);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg bg-slate-900/60 hover:bg-emerald-500/15 border border-slate-800 hover:border-emerald-500/20 transition-all opacity-0 group-hover:opacity-100 cursor-pointer flex items-center justify-center"
                                      title="Kirim Notifikasi WhatsApp"
                                    >
                                      <MessageSquare size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-3.5 flex justify-center">
                                {isCompleted ? (
                                  <span className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-xl text-xs font-semibold">
                                    <Check size={14} />
                                    <span>Selesai</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 bg-slate-800/40 text-slate-400 border border-slate-700/40 px-3 py-1 rounded-xl text-xs font-semibold group-hover:border-indigo-500/30 group-hover:text-slate-300">
                                    <X size={14} className="opacity-60" />
                                    <span>Belum</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Checklist Pagination */}
                <div className="shrink-0 border-t border-slate-800/50 bg-slate-900/10">
                  <Pagination
                    totalItems={filteredChecklistStudents.length}
                    currentPage={currentPage}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    itemName="siswa"
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 text-center p-6">
                <ClipboardList className="w-16 h-16 text-slate-700 opacity-60 mb-3 animate-pulse" />
                <h3 className="text-md font-bold text-slate-300">Belum Ada Tugas Terpilih</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">Silakan buat tugas baru atau pilih tugas yang sudah terdaftar pada daftar menu sebelah kiri untuk mengelola status penyelesaian siswa.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Rekap & Laporan Tab Content */
        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          {/* Filters & Information Banner */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-200">Filter Pencarian Rekap Laporan Tugas</h3>
              </div>
              {(rekapStartDate || rekapEndDate || rekapKelas || rekapSubject || rekapSearch || rekapStatus !== 'all' || rekapSpecificDate) && (
                <button
                  onClick={() => {
                    setRekapStartDate('');
                    setRekapEndDate('');
                    setRekapKelas('');
                    setRekapSubject('');
                    setRekapSearch('');
                    setRekapStatus('all');
                    setRekapSpecificDate('');
                    setRekapPage(1);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                >
                  Reset Filter Rekap
                </button>
              )}
            </div>

            {/* Grid Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {/* Filter Tanggal Mulai */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Mulai Tanggal</label>
                <input
                  type="date"
                  value={rekapStartDate}
                  onChange={e => { setRekapStartDate(e.target.value); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
                />
              </div>

              {/* Filter Tanggal Selesai */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Sampai Tanggal</label>
                <input
                  type="date"
                  value={rekapEndDate}
                  onChange={e => { setRekapEndDate(e.target.value); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
                />
              </div>

              {/* Filter Tanggal Spesifik */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Tanggal Spesifik</label>
                <input
                  type="date"
                  value={rekapSpecificDate}
                  onChange={e => { setRekapSpecificDate(e.target.value); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
                />
              </div>

              {/* Filter Status Tugas */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Status Tugas</label>
                <select
                  value={rekapStatus}
                  onChange={e => { setRekapStatus(e.target.value as any); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                >
                  <option value="all">Semua Status</option>
                  <option value="incomplete">⏳ Belum Lengkap</option>
                  <option value="completed">✅ 100% Selesai</option>
                  <option value="overdue">🚨 Lewat Tenggat</option>
                </select>
              </div>

              {/* Filter Mata Pelajaran */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Mata Pelajaran</label>
                <select
                  value={rekapSubject}
                  onChange={e => { setRekapSubject(e.target.value); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                >
                  <option value="">Semua Mata Pelajaran</option>
                  {activeSubjects.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Filter Kelas */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Kelas</label>
                <select
                  value={rekapKelas}
                  onChange={e => { setRekapKelas(e.target.value); setRekapPage(1); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                >
                  <option value="">Semua Kelas</option>
                  {activeClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Search Box */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Cari Judul Tugas</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Judul..."
                    value={rekapSearch}
                    onChange={e => { setRekapSearch(e.target.value); setRekapPage(1); }}
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Table and details split */}
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
            {/* Left side: Report Table */}
            <div className={`${rekapDetailTaskId ? 'xl:col-span-7' : 'xl:col-span-12'} flex flex-col h-full bg-slate-900/20 border border-slate-800 rounded-2xl overflow-hidden`}>
              <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-wrap justify-between items-center gap-3 shrink-0">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Hasil Rekapitulasi Tugas ({filteredRekapTasks.length})</h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={showKepsekSig}
                      onChange={e => setShowKepsekSig(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>TTD Kepsek</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200">
                    <input 
                      type="checkbox"
                      checked={useKopSurat}
                      onChange={e => setUseKopSurat(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span>Sertakan Kop Surat</span>
                  </label>
                  <button
                    onClick={exportTaskPDF}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Cetak PDF</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs uppercase bg-slate-900/60 sticky top-0 backdrop-blur-sm z-10 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-medium text-center w-12">No</th>
                      <th className="px-4 py-3 font-bold">Judul Tugas</th>
                      <th className="px-4 py-3 font-medium">Mapel</th>
                      <th className="px-4 py-3 font-medium text-center w-20">Kelas</th>
                      <th className="px-4 py-3 font-medium text-center">Diberikan</th>
                      <th className="px-4 py-3 font-medium text-center">Progress</th>
                      <th className="px-4 py-3 font-medium text-center w-28">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/45">
                    {filteredRekapTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                          Tidak ada data tugas yang sesuai dengan kriteria filter Anda.
                        </td>
                      </tr>
                    ) : (
                      filteredRekapTasks
                        .slice((rekapPage - 1) * rekapPageSize, rekapPage * rekapPageSize)
                        .map((t, idx) => {
                          const totalInClass = students.filter(s => s.kelas === t.kelas).length;
                          const completedInClass = students.filter(s => s.kelas === t.kelas && !!t.penyelesaian[s.id]).length;
                          const perc = totalInClass > 0 ? Math.round((completedInClass / totalInClass) * 100) : 0;
                          const isDetailed = t.id === rekapDetailTaskId;

                          return (
                            <tr
                              key={t.id}
                              className={`hover:bg-slate-800/10 transition-colors ${isDetailed ? 'bg-indigo-500/5 border-l-2 border-l-indigo-500' : ''}`}
                            >
                              <td className="px-4 py-3.5 text-center text-slate-400">{(rekapPage - 1) * rekapPageSize + idx + 1}</td>
                              <td className="px-4 py-3.5 font-medium text-slate-200 truncate max-w-[180px]" title={t.judul}>{t.judul}</td>
                              <td className="px-4 py-3.5 text-slate-300 text-xs">{t.mata_pelajaran}</td>
                              <td className="px-4 py-3.5 text-center"><span className="px-1.5 py-0.5 rounded bg-slate-950 text-indigo-300 font-bold text-[10px] border border-slate-800">{t.kelas}</span></td>
                              <td className="px-4 py-3.5 text-center text-slate-400 font-mono text-xs">{t.tanggal_diberikan}</td>
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-400">{completedInClass}/{totalInClass}</span>
                                    <span className={`font-bold font-mono ${perc === 100 ? 'text-emerald-400' : 'text-indigo-400'}`}>{perc}%</span>
                                  </div>
                                  <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${perc === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${perc}%` }}></div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setRekapDetailTaskId(isDetailed ? null : t.id)}
                                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-300 hover:text-white rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
                                    title="Lihat Detail Siswa"
                                  >
                                    <Eye size={12} />
                                  </button>
                                  {role !== 'kepsek' && (
                                    <>
                                      <button
                                        onClick={() => handleOpenEditForm(t)}
                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/50 transition-all cursor-pointer"
                                        title="Ubah Informasi"
                                      >
                                        <Edit3 size={12} />
                                      </button>
                                      <button
                                        onClick={() => setTaskToDeleteId(t.id)}
                                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg border border-rose-500/20 text-rose-400 transition-all cursor-pointer"
                                        title="Hapus Tugas (Aktif)"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div className="shrink-0 border-t border-slate-800 bg-slate-900/10">
                <Pagination
                  totalItems={filteredRekapTasks.length}
                  currentPage={rekapPage}
                  pageSize={rekapPageSize}
                  onPageChange={setRekapPage}
                  onPageSizeChange={setRekapPageSize}
                  itemName="tugas"
                />
              </div>
            </div>

            {/* Right side: Student Detail Checklist inside Rekap tab */}
            {rekapDetailTaskId && (
              <div className="xl:col-span-5 flex flex-col h-full bg-slate-900/20 border border-slate-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
                {(() => {
                  const detailTask = tasks.find(t => t.id === rekapDetailTaskId);
                  if (!detailTask) return null;

                  const detailStudents = students.filter(s => s.kelas === detailTask.kelas);
                  const total = detailStudents.length;
                  const completed = detailStudents.filter(s => !!detailTask.penyelesaian[s.id]).length;
                  const perc = total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <>
                      <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center shrink-0">
                        <div>
                          <h4 className="text-xs font-bold text-slate-100 truncate max-w-[180px]">{detailTask.judul}</h4>
                          <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">{detailTask.mata_pelajaran} • {detailTask.kelas}</p>
                        </div>
                        <button
                          onClick={() => setRekapDetailTaskId(null)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Mini Stats Grid */}
                      <div className="p-4 border-b border-slate-800 bg-slate-950/20 grid grid-cols-2 gap-3 shrink-0">
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Tingkat Realisasi</p>
                          <p className="text-lg font-bold text-indigo-300 font-mono mt-0.5">{perc}%</p>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Siswa Selesai</p>
                          <p className="text-lg font-bold text-emerald-400 mt-0.5">{completed} <span className="text-slate-500 text-xs font-normal">/ {total}</span></p>
                        </div>
                      </div>

                      {/* Detailed Student List */}
                      <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-2">
                        {detailStudents.map((s, idx) => {
                          const isDone = !!detailTask.penyelesaian[s.id];
                          
                          return (
                            <div
                              key={s.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                isDone
                                  ? 'bg-emerald-500/5 border-emerald-500/25'
                                  : 'bg-rose-500/5 border-rose-500/25'
                              }`}
                            >
                              <div className="truncate">
                                <p className="font-semibold text-xs text-slate-200 truncate leading-snug">{s.no}. {s.nama}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">NISN: {s.nisn || '-'}</p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isDone ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase border border-emerald-500/20">Selesai</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase border border-rose-500/20">Belum</span>
                                )}

                                {/* Call parents directly if student did not complete */}
                                {!isDone && s.no_telp_ortu && (
                                  <a
                                    href={`https://wa.me/${formatWhatsAppNumber(s.no_telp_ortu)}?text=${encodeURIComponent(
                                      `Yth. Bapak/Ibu Orang Tua/Wali dari ${s.nama},\n\nKami ingin menginformasikan bahwa saat ini masih terdapat tugas sekolah bertajuk "${selectedTask?.judul}" (${selectedTask?.mata_pelajaran}) yang belum diselesaikan oleh ${s.nama}.\n\nMohon bantuannya untuk mendampingi putra/putri Bapak/Ibu agar dapat menyelesaikan tugas tersebut sesegera mungkin.\n\nTerima kasih banyak atas perhatian dan kerja samanya. 🙏`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 bg-slate-850 hover:bg-emerald-600/25 text-slate-300 hover:text-emerald-400 rounded-lg border border-slate-700/60 transition-colors"
                                    title="Hubungi Orang Tua via WhatsApp"
                                  >
                                    <Phone size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Pop-up Modal Form to Add/Edit Task */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/40 shrink-0">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-2">
                <ClipboardList className="text-indigo-400 w-5 h-5" />
                <span>{editingTaskId ? 'Ubah Informasi Tugas' : 'Buat Tugas Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTask} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Judul Tugas</label>
                  <input
                    type="text"
                    placeholder="contoh: PR 1 - Mengalikan Pecahan"
                    value={judul}
                    onChange={e => setJudul(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mata Pelajaran</label>
                    <select
                      value={mapel}
                      onChange={e => setMapel(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                      required
                    >
                      {activeSubjects.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pilih Kelas</label>
                    <select
                      value={kelas}
                      onChange={e => setKelas(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                      required
                    >
                      {activeClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tgl Diberikan</label>
                    <input
                      type="date"
                      value={tglDiberikan}
                      onChange={e => setTglDiberikan(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark] transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tgl Kumpul (Tenggat)</label>
                    <input
                      type="date"
                      value={tglKumpul}
                      onChange={e => setTglKumpul(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark] transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-4 sm:p-5 border-t border-slate-800 bg-slate-950/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTaskWithNotification('none')}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={14} />
                  <span>Hanya Simpan</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTaskWithNotification('group')}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare size={14} />
                  <span>Simpan & Notif Grup</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTaskWithNotification('personal')}
                  className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User size={14} />
                  <span>Simpan & Notif Pribadi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {taskToDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-100">Hapus Tugas Secara Permanen?</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Apakah Anda yakin ingin menghapus tugas <strong className="text-indigo-300">"{tasks.find(t => t.id === taskToDeleteId)?.judul || ''}"</strong>?
              Tindakan ini tidak dapat dibatalkan, dan semua data penyelesaian atau checklist tugas dari seluruh siswa di kelas ini akan terhapus secara permanen.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTaskToDeleteId(null)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(taskToDeleteId)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-rose-600/10 cursor-pointer"
              >
                Ya, Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Notification Center Modal */}
      {isNotificationModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
              <div className="flex items-center gap-2 text-emerald-400">
                <MessageSquare className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-100">Kirim Notifikasi WhatsApp</h3>
              </div>
              <button
                onClick={() => setIsNotificationModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              
              {/* Tab Selector */}
              <div className="flex border-b border-slate-800 p-0.5 bg-slate-950/40 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationTab('group');
                    setSelectedStudentForNotification(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    notificationTab === 'group'
                      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Send size={14} />
                  <span>Grup WA Kelas ({selectedTask.kelas})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationTab('personal');
                    // Pre-select first student of this class if none is selected
                    const classStudents = students.filter(s => s.kelas === selectedTask.kelas);
                    if (classStudents.length > 0 && !selectedStudentForNotification) {
                      setSelectedStudentForNotification(classStudents[0]);
                      setPersonalPhone(classStudents[0].no_telp_ortu || '');
                    }
                  }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    notificationTab === 'personal'
                      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Phone size={14} />
                  <span>Personal (Wali Murid)</span>
                </button>
              </div>

              {/* TAB 1: GROUP MESSAGE VIEW */}
              {notificationTab === 'group' && (
                <div className="space-y-4">
                  
                  {/* Save Class Group Link */}
                  <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Share2 size={13} className="text-indigo-400" />
                        <span>Tautan Undang Grup WhatsApp Kelas</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">Opsional, untuk tombol "Kirim" langsung</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="contoh: https://chat.whatsapp.com/..."
                        value={classGroupLink}
                        onChange={e => setClassGroupLink(e.target.value)}
                        className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleSaveClassGroupLink}
                        disabled={isSavingGroupLink}
                        className="px-4 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {isSavingGroupLink ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>

                  {/* Template Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pilih Template Pesan Grup</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setGroupTemplateType('incomplete')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          groupTemplateType === 'incomplete'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">⚠️ Belum Kumpul</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">Khusus belum pengerjaan</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupTemplateType('all_status')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          groupTemplateType === 'all_status'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📊 Rekap Semua</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">Status seluruh kelas</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupTemplateType('pr_tugas')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          groupTemplateType === 'pr_tugas'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📢 Notif PR Baru</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">PR baru ke grup</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupTemplateType('custom')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          groupTemplateType === 'custom'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📝 Teks Kustom</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">Bebas manual</p>
                      </button>
                    </div>
                  </div>

                  {/* Message Field */}
                  {groupTemplateType === 'custom' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tulis Pesan Kustom</label>
                      <textarea
                        value={groupMessageText}
                        onChange={e => setGroupMessageText(e.target.value)}
                        placeholder="Ketik pesan pengumuman kustom grup di sini..."
                        rows={6}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all custom-scrollbar"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview Pesan Terkompilasi (Otomatis)</label>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono font-semibold">Nama & Nilai Disisipkan</span>
                      </div>
                      <div className="w-full p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto custom-scrollbar font-sans">
                        {getGroupMessage()}
                      </div>
                    </div>
                  )}

                  {/* Send & Action Footer */}
                  <div className="flex gap-3 pt-3 border-t border-slate-800/50">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(getGroupMessage())}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Copy size={14} />
                      <span>Salin Pesan</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendToGroup}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 cursor-pointer"
                    >
                      <MessageSquare size={14} />
                      <span>{classGroupLink ? 'Buka & Kirim ke Grup' : 'Kirim via WhatsApp'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: PERSONAL MESSAGE VIEW */}
              {notificationTab === 'personal' && (
                <div className="space-y-4">
                  
                  {/* Student selection & Parent Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/20 border border-slate-800/80 p-4 rounded-2xl">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Siswa</label>
                      <select
                        value={selectedStudentForNotification?.id || ''}
                        onChange={e => {
                          const matched = students.find(s => s.id === e.target.value);
                          if (matched) {
                            setSelectedStudentForNotification(matched);
                            setPersonalPhone(matched.no_telp_ortu || '');
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                      >
                        {students.filter(s => s.kelas === selectedTask.kelas).map(s => (
                          <option key={s.id} value={s.id}>{s.nama}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nomor WhatsApp Wali Murid</label>
                      <div className="relative">
                        <Phone size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="tel"
                          placeholder="contoh: 08123456789 atau 6281..."
                          value={personalPhone}
                          onChange={e => setPersonalPhone(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                        />
                      </div>
                      {!personalPhone && (
                        <p className="text-[10px] text-rose-400 mt-1">⚠️ Belum ada nomor HP wali yang tersimpan.</p>
                      )}
                    </div>
                  </div>

                  {/* Template Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pilih Template Pesan Personal</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPersonalTemplateType('default')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          personalTemplateType === 'default'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📌 Status & Nilai</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">Status + rekap nilai otomatis</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonalTemplateType('pr_tugas')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          personalTemplateType === 'pr_tugas'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📢 Notif PR Baru</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">PR baru pribadi</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPersonalTemplateType('custom')}
                        className={`p-2.5 text-left border rounded-xl text-xs transition-all cursor-pointer ${
                          personalTemplateType === 'custom'
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700/80'
                        }`}
                      >
                        <p className="font-semibold leading-snug">📝 Teks Kustom</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-normal line-clamp-1">Bebas manual</p>
                      </button>
                    </div>
                  </div>

                  {/* Message Field */}
                  {personalTemplateType === 'custom' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tulis Pesan Kustom</label>
                      <textarea
                        value={personalMessageText}
                        onChange={e => setPersonalMessageText(e.target.value)}
                        placeholder="Ketik pesan personal kustom di sini..."
                        rows={6}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all custom-scrollbar"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview Pesan Personal (Otomatis)</label>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono font-semibold">Nama, Status & Nilai Disisipkan</span>
                      </div>
                      <div className="w-full p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto custom-scrollbar font-sans">
                        {getPersonalMessage(selectedStudentForNotification)}
                      </div>
                    </div>
                  )}

                  {/* Send & Action Footer */}
                  <div className="flex gap-3 pt-3 border-t border-slate-800/50">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(getPersonalMessage(selectedStudentForNotification))}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Copy size={14} />
                      <span>Salin Pesan</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendPersonal}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 cursor-pointer"
                    >
                      <MessageSquare size={14} />
                      <span>Kirim ke Wali Murid</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      {/* Choice Modal for WhatsApp Group or Personal */}
      {whatsappChoiceStudent && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={() => setWhatsappChoiceStudent(null)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <MessageSquare className="w-5 h-5" />
                <h4 className="font-bold text-sm text-slate-100">Pilih Jalur Notifikasi WhatsApp</h4>
              </div>
              <button onClick={() => setWhatsappChoiceStudent(null)} className="text-slate-400 hover:text-slate-200 text-xs font-semibold hover:bg-slate-800 p-1 rounded-lg transition-colors">✕</button>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Silakan pilih saluran pengiriman notifikasi tugas untuk siswa <strong className="text-indigo-400">{whatsappChoiceStudent.nama}</strong>:
            </p>
            
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  setNotificationTab('group');
                  setGroupTemplateType('pr_tugas');
                  const links = (settings?.wa_group_links || {}) as Record<string, string>;
                  setClassGroupLink(links[whatsappChoiceStudent.kelas] || '');
                  setIsNotificationModalOpen(true);
                  setWhatsappChoiceStudent(null);
                }}
                className="w-full p-4 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-emerald-500 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <p className="font-bold text-xs flex items-center gap-1.5">
                    <span>📢 Kirim ke Grup Kelas</span>
                  </p>
                  <p className="text-[10px] opacity-75 font-normal leading-relaxed">Kirim pengumuman detail tugas baru ke WhatsApp Group Kelas {whatsappChoiceStudent.kelas}</p>
                </div>
                <span className="text-xs font-mono group-hover:translate-x-1 transition-transform ml-2 shrink-0">→</span>
              </button>
              
              <button
                onClick={() => {
                  setNotificationTab('personal');
                  setSelectedStudentForNotification(whatsappChoiceStudent);
                  setPersonalTemplateType('pr_tugas');
                  setPersonalPhone(whatsappChoiceStudent.no_telp_ortu || whatsappChoiceStudent.nomor_telepon || '');
                  setIsNotificationModalOpen(true);
                  setWhatsappChoiceStudent(null);
                }}
                className="w-full p-4 bg-sky-500/10 hover:bg-sky-600 text-sky-400 hover:text-white border border-sky-500/20 hover:border-sky-500 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <p className="font-bold text-xs flex items-center gap-1.5">
                    <span>👤 Kirim Personal (Orang Tua)</span>
                  </p>
                  <p className="text-[10px] opacity-75 font-normal leading-relaxed">Kirim rincian tugas & tagihan pengerjaan langsung ke WhatsApp Wali Murid {whatsappChoiceStudent.nama}</p>
                </div>
                <span className="text-xs font-mono group-hover:translate-x-1 transition-transform ml-2 shrink-0">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
