import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";

function BarcodeTab() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const r = await api.get(`/barcodes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setItems(r.data);
  }
  useEffect(() => { refresh(); }, [q]);

  async function create() {
    if (!newCode.trim()) return;
    try {
      await api.post("/barcodes", {
        code: newCode.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewCode("");
      setNewDesc("");
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Anlegen");
    }
  }
  async function remove(code: string, _label: string) {
    if (!confirm(`Strichcode „${code}" löschen?`)) return;
    await api.delete(`/barcodes/${encodeURIComponent(code)}`);
    refresh();
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/barcodes/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(
        `✅ ${r.data.imported} importiert, ${r.data.skipped} übersprungen`
      );
      refresh();
    } catch (e: any) {
      setImportResult("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {/* Neue Anlegen */}
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Strichcode</label>
          <input
            className="input font-mono"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="z.B. BET-001"
            style={{ width: 140 }}
          />
        </div>
        <div className="flex-1">
          <label className="label">Beschreibung (optional)</label>
          <input
            className="input"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={create}>
          Anlegen
        </button>
      </div>

      {/* Import */}
      <div className="card flex gap-3 items-center flex-wrap">
        <div className="text-sm font-medium">XLS/CSV-Import</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={importFile}
          className="text-sm"
          disabled={importing}
        />
        {importing && <span className="text-sm text-slate-500">Importiere…</span>}
        {importResult && (
          <span className="text-sm">{importResult}</span>
        )}
      </div>

      {/* Suche */}
      <div>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche…"
        />
      </div>

      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Keine Strichcodes gefunden.</li>
        )}
        {items.map((bc) => (
          <li key={bc.id} className="p-3 flex justify-between items-center">
            <div>
              <span className="font-mono font-medium">{bc.code}</span>
              {bc.description && (
                <span className="ml-3 text-sm text-slate-500">{bc.description}</span>
              )}
            </div>
            <button
              className="btn-ghost !py-1 !px-2 text-xs text-status-danger"
              onClick={() => remove(bc.code, bc.code)}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================ */
/* AUFBEREITUNGSARTEN (Zentral)                                  */
/* ============================================================ */

export default BarcodeTab;
