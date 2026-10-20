import { useEffect, useRef, useState } from "react";

// App-eigene Dialoge statt window.confirm()/alert(): sehen auf iPad/iPhone
// einheitlich aus und lassen sich nicht versehentlich wegtippen.
//
//   if (!(await confirmDialog("Wirklich löschen?", { danger: true }))) return;
//   alertDialog("Bett ist gesperrt");
//
// <DialogHost /> wird einmal in main.tsx eingebunden.

export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rote Bestätigen-Schaltfläche für Löschen/Zurückgeben u. ä. */
  danger?: boolean;
}

interface PendingDialog extends DialogOptions {
  id: number;
  message: string;
  kind: "confirm" | "alert";
  resolve: (ok: boolean) => void;
}

let nextId = 1;
let queue: PendingDialog[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function open(kind: PendingDialog["kind"], message: string, opts: DialogOptions): Promise<boolean> {
  return new Promise(resolve => {
    queue = [...queue, { id: nextId++, kind, message, resolve, ...opts }];
    emit();
  });
}

export function confirmDialog(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return open("confirm", message, opts);
}

export function alertDialog(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return open("alert", message, opts);
}

export function DialogHost() {
  const [, force] = useState(0);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const current = queue[0];

  useEffect(() => { confirmRef.current?.focus(); }, [current?.id]);

  if (!current) return null;

  const close = (ok: boolean) => {
    queue = queue.slice(1);
    current.resolve(ok);
    emit();
  };

  const isConfirm = current.kind === "confirm";
  const confirmClass = current.danger ? "btn-danger" : "btn-primary";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40"
      onKeyDown={e => { if (e.key === "Escape") close(false); }}>
      <div role="dialog" aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-[#E8E8E8] w-full max-w-sm p-5 space-y-4">
        {current.title && <h2 className="font-display text-lg font-bold">{current.title}</h2>}
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">{current.message}</p>
        <div className="flex gap-2 justify-end">
          {isConfirm && (
            <button className="btn-ghost" onClick={() => close(false)}>
              {current.cancelLabel ?? "Abbrechen"}
            </button>
          )}
          <button ref={confirmRef} className={isConfirm ? confirmClass : "btn-primary"} onClick={() => close(true)}>
            {current.confirmLabel ?? (isConfirm ? "Bestätigen" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
