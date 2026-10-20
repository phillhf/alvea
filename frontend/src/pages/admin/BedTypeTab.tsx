import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

function BedTypeTab() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState<any | null>(null);

  async function refresh() {
    setItems((await api.get("/bed-types")).data);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!form.name.trim()) return;
    await api.post("/bed-types", {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
    });
    setForm({ name: "", description: "" });
    refresh();
  }
  async function save() {
    await api.patch(`/bed-types/${editing.id}`, {
      name: editing.name,
      description: editing.description || undefined,
    });
    setEditing(null);
    refresh();
  }
  async function remove(id: string, n: string) {
    if (!(await confirmDialog(`Bett-Typ „${n}" löschen?`, { danger: true }))) return;
    await api.delete(`/bed-types/${id}`);
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div className="flex-1">
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="z.B. Intensivbett, Kinderbett…"
          />
        </div>
        <div className="flex-1">
          <label className="label">Beschreibung</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <button className="btn-primary" onClick={create}>
          Anlegen
        </button>
      </div>
      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Bett-Typen angelegt.</li>
        )}
        {items.map((bt) => (
          <li key={bt.id} className="p-3 flex justify-between items-center">
            <div>
              <span className="font-medium">{bt.name}</span>
              {bt.description && (
                <span className="ml-2 text-sm text-slate-500">{bt.description}</span>
              )}
            </div>
            <RowActions
              onEdit={() => setEditing(bt)}
              onDelete={() => remove(bt.id, bt.name)}
              confirmMsg={`Bett-Typ „${bt.name}" löschen?`}
            />
          </li>
        ))}
      </ul>
      {editing && (
        <EditModal
          title="Bett-Typ bearbeiten"
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
            <label className="label">Beschreibung</label>
            <input
              className="input"
              value={editing.description ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </div>
        </EditModal>
      )}
    </div>
  );
}

/* ============================================================ */
/* KRANKHEITSERREGER                                            */
/* ============================================================ */

export default BedTypeTab;
