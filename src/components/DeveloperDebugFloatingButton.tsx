import React, { useState, useEffect } from 'react';
import { Terminal, ShieldCheck, Zap, Database } from 'lucide-react';
import DeveloperDebugPanel from './DeveloperDebugPanel';
import { getActiveDebugProfile } from '../lib/debugProfilesManager';

export default function DeveloperDebugFloatingButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProfileName, setActiveProfileName] = useState(() => getActiveDebugProfile().name);
  const [activeProjectId, setActiveProjectId] = useState(() => getActiveDebugProfile().config.projectId);

  useEffect(() => {
    // Keyboard shortcut handler: Shift + Alt + D to toggle debug panel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    const handleProfileSwitched = () => {
      const active = getActiveDebugProfile();
      setActiveProfileName(active.name);
      setActiveProjectId(active.config.projectId);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('firebase-debug-profile-switched', handleProfileSwitched);
    window.addEventListener('firebase-config-changed', handleProfileSwitched);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('firebase-debug-profile-switched', handleProfileSwitched);
      window.removeEventListener('firebase-config-changed', handleProfileSwitched);
    };
  }, []);

  return (
    <>
      {/* Floating Trigger Pill */}
      <div className="fixed bottom-4 right-4 z-40 hidden sm:flex items-center gap-2">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 hover:bg-slate-900 text-slate-200 border border-indigo-500/50 rounded-2xl shadow-xl backdrop-blur-md transition-all transform hover:scale-105 cursor-pointer group"
          title="Buka Firebase Developer Debug Panel (Shift + Alt + D)"
        >
          <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <Terminal size={14} />
          </div>
          <div className="text-left font-mono">
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>DEV DEBUG</span>
            </div>
            <div className="text-xs font-bold text-indigo-300 truncate max-w-[130px]">
              {activeProjectId}
            </div>
          </div>
          <span className="hidden lg:inline-block px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[9px] font-mono">
            Shift+Alt+D
          </span>
        </button>
      </div>

      {/* Developer Debug Panel Modal */}
      {isOpen && (
        <DeveloperDebugPanel
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
