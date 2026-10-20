import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

interface Abschluss { id: string; name: string; sort_order: number; }

export default function RuecksendungAbschluesseTab() {
  const toast = useToast();
  const [items, setItems]   = useState<Abschluss[]>([]);
  const [name, setName]     = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => { load(); }, []);

  function load() {
    api.get<Abschluss[]>("/ruecksendung-abschluesse").then(r => setItems(r.data)).catch(() => {});
  }

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await api.post("/ruecksendung-abschluesse", { name: name.trim() });
      setName(""); load(); toast.success("Angelegt.");
    } catch { toast.error("Fehler."); }
  }

  async function handleSave(id: string) {
    try {
      await api.patch(`/ruecksendung-abschluesse/${id}`, { name: editName });
      setEditId(null); load(); toast.success("Gespeichert.");
    } catch { toast.error("Fehler."); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Eintrag löschen?")) return;
    try { await api.delete(`/ruecksendung-abschluesse/${id}`); load(); toast.success("Gelöscht."); }
    catch { toast.error("Fehler."); }
  }

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-lg font-semibold text-slate-800">Abschluss-Gründe</h2>
      <p className="text-sm text-slate-500">
        Diese Einträge erscheinen als Dropdown wenn eine Rücksendung abgeschlossen wird.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="z.B. Wieder eingelagert"
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
        <button onClick={handleAdd} disabled={!name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--brand-600)" }}>
          + Hinzufügen
        </button>
      </div>

      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Keine Einträge.</p>}
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            {editId === item.id ? (
              <div className="flex gap-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2" />
                <button onClick={() => handleSave(item.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "var(--brand-600)" }}>Speichern</button>
                <button onClick={() => setEditId(null)}
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700">Abbrechen</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-800">{item.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => { setEditId(item.id); setEditName(item.name); }}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">✏️</button>
                  <button onClick={() => handleDelete(item.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1">🗑</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
