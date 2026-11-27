import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      let parsedError = this.state.message;
      try {
        const obj = JSON.parse(this.state.message);
        if (obj?.error) {
          parsedError = `${obj.operationType?.toUpperCase() || 'OP'} (${obj.path || 'unknown'}): ${obj.error}`;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold">অ্যাপ্লিকেশন ত্রুটি / Application Error</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 break-words">{parsedError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              পুনরায় লোড করুন / Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
