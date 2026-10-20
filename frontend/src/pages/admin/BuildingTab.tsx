import { useToast } from "../../contexts/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { useRaumbuch } from "../../contexts/RaumbuchContext";
import { confirmDialog } from "../../components/Dialog";

function BuildingTab() {
  const toast = useToast();
  const { houses, selectedHouse, reload: reloadCtx } = useRaumbuch();
  const [items,   setItems]   = useState<any[]>([]);
  const [form,    setForm]    = useState({ house_id: "", name: "", short_code: "" });
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => {
    if (!form.house_id && houses.length > 0) {
      setForm(f => ({ ...f, house_id: houses[0].id }));
    }
  }, [houses.length]);

  useEffect(() => {
    if (selectedHouse && form.house_id !== selectedHouse.id) {
      setForm(f => ({ ...f, house_id: selectedHouse.id }));
    }
  }, [selectedHouse?.id]);

  async function refresh() {
    const r = await api.get("/buildings");
    setItems(r.data);
    reloadCtx();
  }
  useEffect(() => { refresh(); }, []);

  const visible = form.house_id
    ? items.filter(b => b.house_id === form.house_id)
    : items;

  async function create() {
    if (!form.house_id || !form.name.trim()) {
      toast.error("Haus und Name sind Pflichtfelder.");
      return;
    }
    try {
      await api.post("/buildings", {
        house_id:   form.house_id,
        name:       form.name.trim(),
        short_code: form.short_code.trim() || undefined,
      });
      setForm(f => ({ ...f, name: "", short_code: "" }));
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Anlegen");
    }
  }

  async function save() {
    try {
      await api.patch(`/buildings/${editing.id}`, {
        house_id:   editing.house_id,
        name:       editing.name,
        short_code: editing.short_code || undefined,
      });
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    }
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog(`Gebäude „${name}" löschen?`, { danger: true }))) return;
    try {
      await api.delete(`/buildings/${id}`);
      refresh();
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!(await confirmDialog(`Gebäude enthält noch ${d.areas} Bereiche/Stationen.\nZuordnung aufheben und Gebäude löschen?`, { danger: true }))) return;
        await api.delete(`/buildings/${id}?force=true`);
        refresh();
      } else {
        toast.error(e.response?.data?.error || "Fehler beim Löschen");
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Haus *</label>
          <select className="input" value={form.house_id}
            onChange={e => setForm({ ...form, house_id: e.target.value })}>
            <option value="">— wählen —</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Gebäudename *</label>
          <input className="input" placeholder="z. B. ELKI, Hauptgebäude"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Kürzel</label>
          <input className="input" style={{ width: 90 }} placeholder="z. B. EG"
            value={form.short_code} onChange={e => setForm({ ...form, short_code: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      <ul className="card !p-0 divide-y divide-slate-100">
        {visible.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Gebäude angelegt.</li>
        )}
        {visible.map(b => (
          <li key={b.id} className="p-3 flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: "var(--brand-600)" }}>
                🏢
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{b.name}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                  {b.short_code && <span className="font-mono">[{b.short_code}]</span>}
                  <span>{b.house_name}</span>
                  {b.area_count > 0 && <span>{b.area_count} Bereich{b.area_count !== 1 ? "e" : ""}</span>}
                </div>
              </div>
            </div>
            <RowActions
              onEdit={() => setEditing({ ...b })}
              onDelete={() => remove(b.id, b.name)}
              confirmMsg={`Gebäude „${b.name}" löschen?`}
            />
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Gebäude bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Haus *</label>
            <select className="input" value={editing.house_id}
              onChange={e => setEditing({ ...editing, house_id: e.target.value })}>
              {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Name *</label>
            <input className="input" value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Kürzel</label>
            <input className="input" value={editing.short_code ?? ""}
              onChange={e => setEditing({ ...editing, short_code: e.target.value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

export default BuildingTab;
