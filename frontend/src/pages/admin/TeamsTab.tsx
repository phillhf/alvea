import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

function TeamsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editAreaIds, setEditAreaIds] = useState<Set<string>>(new Set());

  async function refresh() {
    const [t, a] = await Promise.all([api.get("/teams"), api.get("/areas")]);
    setItems(t.data);
    setAreas(a.data);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!name.trim()) return;
    await api.post("/teams", { name: name.trim() });
    setName("");
    refresh();
  }
  async function startEdit(t: any) {
    setEditing(t);
    setEditAreaIds(new Set((t.areas ?? []).map((a: any) => a.id)));
  }
  async function save() {
    await api.patch(`/teams/${editing.id}`, { name: editing.name });
    await api.put(`/teams/${editing.id}/areas`, { area_ids: Array.from(editAreaIds) });
    setEditing(null);
    refresh();
  }
  async function remove(id: string, n: string) {
    if (!(await confirmDialog(`Team „${n}" löschen?`, { danger: true }))) return;
    await api.delete(`/teams/${id}`);
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 items-end">
        <div className="flex-1">
          <label className="label">Teamname</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="z.B. Frühschicht A"
          />
        </div>
        <button className="btn-primary" onClick={create}>
          Anlegen
        </button>
      </div>
      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Teams angelegt.</li>
        )}
        {items.map((t) => (
          <li key={t.id} className="p-3 flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
              <span className="font-medium">{t.name}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(t.areas ?? []).map((a: any) => (
                  <span key={a.id} className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 text-xs">
                    {a.name}
                  </span>
                ))}
                {(t.areas ?? []).length === 0 && (
                  <span className="text-xs text-slate-400 italic">Kein Bereich zugewiesen</span>
                )}
              </div>
            </div>
            <RowActions
              onEdit={() => startEdit(t)}
              onDelete={() => remove(t.id, t.name)}
              confirmMsg={`Team „${t.name}" löschen?`}
            />
          </li>
        ))}
      </ul>
      {editing && (
        <EditModal
          title="Team bearbeiten"
          onSave={save}
          onClose={() => setEditing(null)}
        >
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Bereiche</label>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2">
              {areas.length === 0 && (
                <span className="text-xs text-slate-400 col-span-2">Noch keine Bereiche angelegt.</span>
              )}
              {areas.map((a: any) => (
                <label key={a.id} className={`flex items-center gap-2 text-sm p-1 rounded-lg cursor-pointer ${editAreaIds.has(a.id) ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                  <input
                    type="checkbox"
                    checked={editAreaIds.has(a.id)}
                    onChange={(e) => {
                      const s = new Set(editAreaIds);
                      e.target.checked ? s.add(a.id) : s.delete(a.id);
                      setEditAreaIds(s);
                    }}
                  />
                  <span>
                    <span className="font-medium">{a.name}</span>
                    {a.house_name && <span className="block text-xs text-slate-400">{a.house_name}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </EditModal>
      )}
    </div>
  );
}

/* ============================================================ */
/* HOUSES                                                       */
/* ============================================================ */

export default TeamsTab;
