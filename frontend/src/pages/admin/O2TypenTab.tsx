import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { confirmDialog } from "../../components/Dialog";

interface Typ { id: string; name: string; beschreibung: string | null; }

export default function O2TypenTab() {
  const toast = useToast();
  const [typen, setTypen]   = useState<Typ[]>([]);
  const [name, setName]     = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName]           = useState("");
  const [editBeschreibung, setEditBeschreibung] = useState("");

  useEffect(() => { load(); }, []);

  function load() {
    api.get<Typ[]>("/o2/typen").then(r => setTypen(r.data)).catch(() => {});
  }

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await api.post("/o2/typen", { name: name.trim(), beschreibung: beschreibung.trim() || undefined });
      setName(""); setBeschreibung(""); load(); toast.success("Typ angelegt.");
    } catch { toast.error("Fehler."); }
  }

  async function handleSave(id: string) {
    try {
      await api.patch(`/o2/typen/${id}`, { name: editName, beschreibung: editBeschreibung || null });
      setEditId(null); load(); toast.success("Gespeichert.");
    } catch { toast.error("Fehler."); }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog("Flaschentyp löschen?", { danger: true }))) return;
    try { await api.delete(`/o2/typen/${id}`); load(); toast.success("Gelöscht."); }
    catch { toast.error("Fehler."); }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-slate-800">Flaschentypen</h2>
      <p className="text-sm text-slate-500">z.B. „2L O₂", „10L O₂", „50L O₂"</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (z.B. 10L O₂)"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
        <input value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Beschreibung (optional)"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
        <button onClick={handleAdd} disabled={!name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--brand-600)" }}>
          + Typ anlegen
        </button>
      </div>

      <div className="space-y-1.5">
        {typen.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            {editId === t.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                <input value={editBeschreibung} onChange={e => setEditBeschreibung(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => handleSave(t.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: "var(--brand-600)" }}>Speichern</button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700">Abbrechen</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{t.name}</p>
                  {t.beschreibung && <p className="text-xs text-slate-500">{t.beschreibung}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditBeschreibung(t.beschreibung ?? ""); }}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded">✏️</button>
                  <button onClick={() => handleDelete(t.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">🗑</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {typen.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Noch keine Typen.</p>}
      </div>
    </div>
  );
}
