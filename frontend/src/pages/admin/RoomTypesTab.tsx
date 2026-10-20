import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

interface RoomType { id: string; name: string; icon: string; sort_order: number; }

export default function RoomTypesTab() {
  const [items,   setItems]   = useState<RoomType[]>([]);
  const [form,    setForm]    = useState({ name: "", icon: "🚪" });
  const [editing, setEditing] = useState<RoomType | null>(null);

  async function refresh() {
    const r = await api.get<RoomType[]>("/room-types");
    setItems(r.data);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!form.name.trim()) return;
    await api.post("/room-types", { name: form.name.trim(), icon: form.icon, sort_order: items.length });
    setForm({ name: "", icon: "🚪" }); refresh();
  }

  async function save() {
    await api.patch(`/room-types/${editing!.id}`, { name: editing!.name, icon: editing!.icon });
    setEditing(null); refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog(`Raumart „${name}" löschen? Räume mit diesem Typ werden auf keinen Typ zurückgesetzt.`, { danger: true }))) return;
    await api.delete(`/room-types/${id}`);
    refresh();
  }

  const ICONS = ["🚪","🛏️","🔬","🔧","🗂️","📦","🏥","🍽️","🚿","💊","🧪","🖥️","📚","🎯"];

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 items-end flex-wrap">
        <div>
          <label className="label">Icon</label>
          <select className="input !w-20 text-center text-lg" value={form.icon}
            onChange={e => setForm({ ...form, icon: e.target.value })}>
            {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Name</label>
          <input className="input" placeholder="z. B. Untersuchungsraum"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && <li className="p-3 text-sm text-slate-400">Noch keine Raumarten.</li>}
        {items.map(rt => (
          <li key={rt.id} className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{rt.icon}</span>
              <span className="font-medium text-sm">{rt.name}</span>
            </div>
            <RowActions onEdit={() => setEditing({ ...rt })} onDelete={() => remove(rt.id, rt.name)}
              confirmMsg={`Raumart „${rt.name}" löschen?`} />
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Raumart bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Icon</label>
            <select className="input !w-20 text-center text-lg" value={editing.icon}
              onChange={e => setEditing({ ...editing, icon: e.target.value })}>
              {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}
