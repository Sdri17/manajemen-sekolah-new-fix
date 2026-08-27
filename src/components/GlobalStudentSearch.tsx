import React, { useState, useEffect, useRef } from 'react';
import { Search, User, BookOpen, ChevronRight, X, Sparkles, Filter } from 'lucide-react';
import { store, Student } from '../lib/store';

interface GlobalStudentSearchProps {
  onSelectStudent: (studentId: string) => void;
}

export default function GlobalStudentSearch({ onSelectStudent }: GlobalStudentSearchProps) {
  const [query, setQuery] = useState('');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchStudents = async () => {
    try {
      const keys = await store.students.keys();
      const list = await Promise.all(keys.map(k => store.students.getItem(k))) as Student[];
      setAllStudents(list.filter(Boolean));
    } catch (err) {
      console.error("Failed to load students directory:", err);
    }
  };

  useEffect(() => {
    // Load student directory on mount
    fetchStudents();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFilteredStudents([]);
      return;
    }
    const q = query.toLowerCase().trim();
    const results = allStudents.filter(s => 
      (s.nama && s.nama.toLowerCase().includes(q)) ||
      (s.nisn && s.nisn.includes(q)) ||
      (s.nipd && s.nipd.includes(q)) ||
      (s.kelas && s.kelas.toLowerCase().includes(q))
    ).slice(0, 8); // Top 8 matches
    setFilteredStudents(results);
  }, [query, allStudents]);

  // Handle Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        fetchStudents();
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onSelectStudent(id);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Bar Input */}
      <div className="relative flex items-center w-full">
        <Search className="absolute left-3.5 w-4 h-4 text-indigo-400 pointer-events-none" />
        <input
          id="global-search-input"
          ref={inputRef}
          type="text"
          value={query}
          autoComplete="off"
          onFocus={() => {
            setIsOpen(true);
            if (allStudents.length === 0) fetchStudents();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Cari siswa, NISN, kelas... (Ctrl+K)"
          className="w-full pl-10 pr-16 py-2 bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-xl text-xs text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all shadow-inner"
        />
        <div className="absolute right-2.5 flex items-center gap-1">
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setIsOpen(false); }}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-md cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded shadow-sm font-mono">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      {/* Auto-complete Dropdown Results */}
      {isOpen && query.trim() !== '' && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl backdrop-blur-xl z-[9999] overflow-hidden max-h-96 overflow-y-auto custom-scrollbar animate-fadeIn">
          <div className="p-2.5 border-b border-slate-800 text-[10px] font-semibold uppercase text-slate-400 tracking-wider flex justify-between items-center px-3 bg-slate-950/60">
            <span>Hasil Pencarian Siswa ({filteredStudents.length})</span>
            <span className="text-indigo-400 font-bold">Pilih untuk profil dossier</span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              Tidak ada siswa yang cocok dengan &quot;<span className="text-slate-200 font-medium">{query}</span>&quot;
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {filteredStudents.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className="p-3 bg-slate-800/40 hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-transparent rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 group-hover:bg-indigo-600/30 border border-slate-700/80 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase shrink-0">
                      {s.nama.slice(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                        {s.nama}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Kelas: <span className="text-slate-300 font-semibold">{s.kelas}</span> • NISN: <span className="font-mono text-slate-300">{s.nisn || '-'}</span>
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
