import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  success: (msg: string) => void;
  error:   (msg: string) => void;
  info:    (msg: string) => void;
  warning: (msg: string) => void;
}

const Ctx = createContext<ToastCtx>({
  success: () => {}, error: () => {}, info: () => {}, warning: () => {},
});

export function useToast() { return useContext(Ctx); }

const ICONS: Record<ToastType, string> = {
  success: "✅", error: "❌", info: "ℹ️", warning: "⚠️",
};
const COLORS: Record<ToastType, string> = {
  success: "border-emerald-400 bg-emerald-50 text-emerald-900",
  error:   "border-red-400 bg-red-50 text-red-900",
  info:    "border-blue-400 bg-blue-50 text-blue-900",
  warning: "border-amber-400 bg-amber-50 text-amber-900",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const ctx: ToastCtx = {
    success: (msg) => add("success", msg),
    error:   (msg) => add("error",   msg),
    info:    (msg) => add("info",    msg),
    warning: (msg) => add("warning", msg),
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {/* Toast-Container */}
      <div className="fixed bottom-5 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg text-sm font-medium transition-all animate-in slide-in-from-right ${COLORS[t.type]}`}
          >
            <span className="text-base shrink-0">{ICONS[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}
              className="text-current opacity-40 hover:opacity-70 shrink-0 text-lg leading-none"
            >×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
