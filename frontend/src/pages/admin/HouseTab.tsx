import { useToast } from "../../contexts/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

function HouseTab() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  async function refresh() { setItems((await api.get("/houses")).data); }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!name.trim()) return;
    try {
      await api.post("/houses", { name: name.trim(), short_code: code.trim() || undefined });
      setName(""); setCode(""); refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || "Fehler beim Anlegen");
    }
  }

  async function save() {
    await api.patch(`/houses/${editing.id}`, {
      name:         editing.name,
      short_code:   editing.short_code || undefined,
      house_number: editing.house_number ? parseInt(editing.house_number) : undefined,
    });
    setEditing(null); refresh();
  }

  async function remove(id: string, n: string) {
    if (!(await confirmDialog(`Haus „${n}" löschen? Alle Bereiche und Stationen darunter werden mit gelöscht.`, { danger: true }))) return;
    try {
      await api.delete(`/houses/${id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!(await confirmDialog(`Haus „${n}" enthält noch:\n• ${d.areas} Bereiche, ${d.stations} Stationen, ${d.beds} Betten\n• ${d.active_tasks} aktive Aufträge\n\nAlle Daten werden unwiderruflich gelöscht. Fortfahren?`, { danger: true }))) return;
        await api.delete(`/houses/${id}?force=true`);
      } else { toast.error(e.response?.data?.error || "Fehler beim Löschen"); return; }
    }
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div className="flex-1">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Kürzel</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 100 }} />
        </div>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Häuser angelegt.</li>
        )}
        {items.map((h) => (
          <li key={h.id} className="p-3 flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: "var(--brand-600)" }}>
                H{h.house_number ?? "?"}
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{h.name}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                  {h.short_code && <span className="font-mono">[{h.short_code}]</span>}
                </div>
              </div>
            </div>
            <RowActions
              onEdit={() => setEditing({ ...h, house_number: String(h.house_number ?? "") })}
              onDelete={() => remove(h.id, h.name)}
              confirmMsg={`Haus „${h.name}" löschen?`}
            />
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Haus bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Name</label>
            <input className="input" value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Kürzel</label>
            <input className="input" value={editing.short_code ?? ""}
              onChange={(e) => setEditing({ ...editing, short_code: e.target.value })} />
          </div>
          <div>
            <label className="label">
              KI-Nummer
              <span className="ml-2 text-xs text-slate-400 font-normal">
                In KI-Anfragen als „Haus {editing.house_number || "?"}" bezeichnet
              </span>
            </label>
            <input className="input" type="number" min="1" value={editing.house_number}
              onChange={(e) => setEditing({ ...editing, house_number: e.target.value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

/* ============================================================ */
/* AREAS                                                        */
/* ============================================================ */

export default HouseTab;
