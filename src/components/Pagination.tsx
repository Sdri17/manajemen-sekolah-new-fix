import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
}

export default function Pagination({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 25, 50, 100],
  itemName = 'data'
}: PaginationProps) {
  // If pageSize is extremely large (e.g., simulating "All" via 1000000)
  const isAll = pageSize >= 1000000;
  
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  
  // Ref for onPageChange to avoid effect re-execution when callback reference changes
  const onPageChangeRef = React.useRef(onPageChange);
  React.useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Ensure current page is within valid boundaries
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      onPageChangeRef.current(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = isAll ? totalItems : Math.min(totalItems, currentPage * pageSize);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 2) {
        end = 4;
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 3;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-6 bg-slate-800/20 border-t border-slate-700/50 backdrop-blur-sm rounded-b-2xl">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Tampilkan:</span>
          <select
            value={isAll ? 'all' : pageSize}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all') {
                onPageSizeChange(1000000);
              } else {
                onPageSizeChange(Number(val));
              }
              onPageChange(1);
            }}
            className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 font-medium outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} Baris
              </option>
            ))}
            <option value="all">Semua</option>
          </select>
        </div>
        <span>
          Menampilkan <span className="font-semibold text-slate-200">{startIdx}</span> - <span className="font-semibold text-slate-200">{endIdx}</span> dari <span className="font-semibold text-slate-200">{totalItems}</span> {itemName}
        </span>
      </div>

      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-700/40 transition-all"
            title="Halaman Pertama"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-700/40 transition-all"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1 px-1">
            {getPageNumbers().map((num, idx) => {
              if (typeof num === 'string') {
                return (
                  <span key={`dots-${idx}`} className="px-2 text-slate-500 text-xs">
                    {num}
                  </span>
                );
              }
              const active = num === currentPage;
              return (
                <button
                  key={`page-${num}`}
                  onClick={() => onPageChange(num)}
                  className={`min-w-[28px] h-7 text-xs font-semibold rounded-lg border transition-all ${
                    active
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-700/40 transition-all"
            title="Halaman Berikutnya"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-700/40 transition-all"
            title="Halaman Terakhir"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
