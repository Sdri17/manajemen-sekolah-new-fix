import React, { useState } from 'react';
import UserManagement from './UserManagement';
import ClassManagement from './ClassManagement';
import SystemAuditLogViewer from './SystemAuditLogViewer';
import EventAuditLogViewer from './EventAuditLogViewer';
import AdminRosterAuditView from './AdminRosterAuditView';
import SyncCountDiagnosticTool from './SyncCountDiagnosticTool';
import RolePermissionInspector from './RolePermissionInspector';
import SecurityAuditView from './SecurityAuditView';
import { Users, Activity, ShieldCheck, Lock, Layers, GitCompare, History, UserCheck, ShieldAlert, Calendar } from 'lucide-react';
import { isUserAdmin, canManageUsers, getCurrentUser } from '../lib/rbac';
import { AppUser } from '../lib/store';

interface AdminManagementPanelProps {
  currentUser?: AppUser | null;
  onUserUpdated?: () => void;
  defaultTab?: 'users' | 'classes' | 'security-audit' | 'roster-audit' | 'logs' | 'event-audit' | 'diagnostics';
}

export default function AdminManagementPanel({ 
  currentUser, 
  onUserUpdated, 
  defaultTab = 'users' 
}: AdminManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'classes' | 'security-audit' | 'roster-audit' | 'logs' | 'event-audit' | 'diagnostics'>(defaultTab);

  const user: AppUser | null = currentUser || getCurrentUser();
  const isAuthorized = isUserAdmin(user) || canManageUsers(user);

  if (!isAuthorized) {
    return (
      <div className="bg-slate-800/80 p-8 rounded-2xl border border-rose-500/30 text-center max-w-lg mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
          <Lock size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-2">Akses Terbatas (Admin Only)</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Halaman Panel Manajemen Admin & Log System hanya dapat diakses oleh akun dengan peran <span className="text-rose-300 font-semibold">Administrator</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Panel Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950/80 p-6 rounded-2xl border border-indigo-500/30 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 z-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shadow-lg shrink-0">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100">Panel Manajemen Admin & Keamanan</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Akses Khusus Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Kelola pengguna, tentukan izin peran (RBAC), serta pantau audit log perubahan data sistem secara terpusat.
            </p>
          </div>
        </div>

        {/* Tab Navigation Switches */}
        <div className="flex flex-wrap bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/80 shrink-0 z-10 gap-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={15} />
            <span>Pengguna (RBAC)</span>
          </button>

          <button
            onClick={() => setActiveTab('classes')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'classes'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers size={15} />
            <span>Daftar Kelas</span>
          </button>

          <button
            onClick={() => setActiveTab('security-audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'security-audit'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert size={15} />
            <span>Audit Keamanan Rombel</span>
          </button>

          <button
            onClick={() => setActiveTab('roster-audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'roster-audit'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar size={15} />
            <span>Admin Audit (Roster Update)</span>
          </button>

          <button
            onClick={() => setActiveTab('event-audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'event-audit'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={15} />
            <span>Event Audit</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity size={15} />
            <span>Audit Log Sistem</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCompare size={15} />
            <span>Diagnostik & Inspector</span>
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'users' && (
        <UserManagement onUserUpdated={onUserUpdated} />
      )}

      {activeTab === 'classes' && (
        <ClassManagement />
      )}

      {activeTab === 'security-audit' && (
        <SecurityAuditView />
      )}

      {activeTab === 'roster-audit' && (
        <AdminRosterAuditView />
      )}

      {activeTab === 'event-audit' && (
        <EventAuditLogViewer />
      )}

      {activeTab === 'logs' && (
        <SystemAuditLogViewer />
      )}

      {activeTab === 'diagnostics' && (
        <div className="space-y-8">
          <RolePermissionInspector />
          <SyncCountDiagnosticTool />
        </div>
      )}
    </div>
  );
}
