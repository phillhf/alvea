import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg w-full bg-white rounded-lg border border-red-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl">⚠️</div>
              <div>
                <h1 className="font-bold text-slate-900">Anwendungsfehler</h1>
                <p className="text-sm text-slate-500">Die Seite konnte nicht geladen werden.</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs text-red-700 break-all whitespace-pre-wrap border border-slate-200">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </div>
            <button
              className="w-full py-2 px-4 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
              onClick={() => window.location.reload()}
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
