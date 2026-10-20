import React from "react";

/* Gemeinsame Komponenten für alle Admin-Tabs */

export function RowActions({
  onEdit,
  onDelete,
  confirmMsg,
}: {
  onEdit: () => void;
  onDelete: () => void;
  confirmMsg: string;
}) {
  return (
    <span className="flex gap-1 justify-end">
      <button className="btn-ghost !py-1 !px-2 text-xs" onClick={onEdit}>✎</button>
      <button
        className="btn-ghost !py-1 !px-2 text-xs text-status-danger"
        onClick={() => confirm(confirmMsg) && onDelete()}
      >🗑</button>
    </span>
  );
}

export function EditModal({
  title,
  children,
  onSave,
  onClose,
  saving,
}: {
  title: string;
  children: React.ReactNode;
  onSave: () => void;
  onClose: () => void;
  saving?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div className="card max-w-lg w-full flex flex-col" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold shrink-0">{title}</h2>
        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {children}
        </div>
        <div className="flex gap-2 pt-3 shrink-0">
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
