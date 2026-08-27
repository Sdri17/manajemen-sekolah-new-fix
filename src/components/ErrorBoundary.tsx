import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetApp = (): void => {
    try {
      localStorage.removeItem('app_user');
      localStorage.removeItem('auth_lockout_data');
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative font-sans">
          <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.08)_0%,transparent_100%)]"></div>
          
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-lg w-full shadow-2xl space-y-6 relative z-10 text-center">
            <div className="w-16 h-16 bg-rose-500/20 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400 shadow-lg shadow-rose-500/10">
              <ShieldAlert size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100">Terjadi Kesalahan Tampilan</h2>
              <p className="text-slate-400 text-sm">
                Aplikasi mengalami kendala teknis saat memuat komponen. Jangan khawatir, data Anda tetap aman.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left space-y-1 overflow-x-auto text-xs font-mono text-rose-300 max-h-32 custom-scrollbar">
                <p className="font-semibold text-rose-400">{this.state.error.toString()}</p>
                {this.state.errorInfo?.componentStack && (
                  <p className="text-slate-500 text-[10px] whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                onClick={this.handleResetApp}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium rounded-xl text-sm transition-all border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
                title="Bersihkan sesi login dan muat ulang"
              >
                <Trash2 size={16} />
                <span>Reset Sesi</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
