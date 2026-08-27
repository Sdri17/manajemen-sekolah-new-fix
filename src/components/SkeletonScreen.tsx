import React from 'react';

export default function SkeletonScreen() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Skeleton Header */}
      <header className="h-16 bg-slate-800/80 border-b border-slate-700/60 px-6 flex items-center justify-between shrink-0 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-slate-700"></div>
          <div className="space-y-1.5">
            <div className="w-32 h-4 bg-slate-700 rounded-md"></div>
            <div className="w-48 h-3 bg-slate-700/60 rounded-md"></div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 w-72 h-9 bg-slate-700/50 rounded-xl border border-slate-700"></div>

        <div className="flex items-center gap-3">
          <div className="w-24 h-8 bg-slate-700/60 rounded-full"></div>
          <div className="w-32 h-8 bg-slate-700/60 rounded-full"></div>
          <div className="w-9 h-9 rounded-full bg-slate-700"></div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Skeleton Sidebar */}
        <aside className="w-64 bg-slate-800/40 border-r border-slate-700/50 p-4 hidden lg:flex flex-col gap-6 animate-pulse">
          {/* Logo Brand Skeleton */}
          <div className="flex items-center gap-3 px-2 py-3 border-b border-slate-700/50">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/50"></div>
            <div className="space-y-1.5">
              <div className="w-28 h-4 bg-slate-700 rounded-md"></div>
              <div className="w-20 h-3 bg-slate-700/60 rounded-md"></div>
            </div>
          </div>

          {/* Navigation Items Skeleton */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/60">
                <div className="w-5 h-5 bg-slate-700 rounded-md"></div>
                <div className="w-32 h-3.5 bg-slate-700/80 rounded-md"></div>
              </div>
            ))}
          </div>

          <div className="mt-auto space-y-3">
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-700 shrink-0"></div>
              <div className="space-y-1.5 flex-1">
                <div className="w-24 h-3.5 bg-slate-700 rounded-md"></div>
                <div className="w-16 h-2.5 bg-slate-700/60 rounded-md"></div>
              </div>
            </div>
          </div>
        </aside>

        {/* Skeleton Main Dashboard / Content Area */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6 animate-pulse">
          {/* Top Banner Skeleton */}
          <div className="p-6 bg-slate-800/60 rounded-2xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="w-64 h-6 bg-slate-700 rounded-lg"></div>
              <div className="w-96 h-4 bg-slate-700/60 rounded-md"></div>
            </div>
            <div className="flex gap-3">
              <div className="w-32 h-10 bg-slate-700 rounded-xl"></div>
              <div className="w-36 h-10 bg-indigo-600/40 rounded-xl"></div>
            </div>
          </div>

          {/* Stat Cards Grid Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="w-24 h-3.5 bg-slate-700 rounded-md"></div>
                  <div className="w-8 h-8 rounded-xl bg-slate-700/80"></div>
                </div>
                <div className="w-20 h-7 bg-slate-700 rounded-lg"></div>
                <div className="w-32 h-3 bg-slate-700/50 rounded-md"></div>
              </div>
            ))}
          </div>

          {/* Table / List Container Skeleton */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-700/50">
              <div className="w-48 h-5 bg-slate-700 rounded-md"></div>
              <div className="w-32 h-8 bg-slate-700/60 rounded-xl"></div>
            </div>

            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex items-center justify-between p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/40 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 shrink-0"></div>
                    <div className="space-y-1.5">
                      <div className="w-40 h-4 bg-slate-700 rounded-md"></div>
                      <div className="w-24 h-3 bg-slate-700/50 rounded-md"></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-16 h-7 bg-slate-700/80 rounded-lg"></div>
                    <div className="w-16 h-7 bg-slate-700/80 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
