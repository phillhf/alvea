import { useToast } from "../../contexts/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { useRaumbuch } from "../../contexts/RaumbuchContext";
import { confirmDialog } from "../../components/Dialog";

function AreaTab() {
  const toast = useToast();
  const { houses, buildings, selectedHouse, reload: reloadCtx } = useRaumbuch();
  const [items,   setItems]   = useState<any[]>([]);
  // house_id wird NICHT per useEffect gesetzt – der Nutzer wählt explizit
  const [form,    setForm]    = useState({ house_id: "", building_id: "", bereichsnummer: "", bezeichnung: "", beschreibung: "" });
  const [editing, setEditing] = useState<any | null>(null);

  // Wenn Häuser geladen werden und noch kein Haus gewählt ist: erstes Haus vorauswählen
  // Wenn Breadcrumb-Haus gewechselt wird: Formular folgt
  const effectiveHouseId = selectedHouse?.id ?? form.house_id;

  useEffect(() => {
    if (selectedHouse && form.house_id !== selectedHouse.id) {
      setForm(f => ({ ...f, house_id: selectedHouse.id }));
    }
  }, [selectedHouse?.id]);

  useEffect(() => {
    if (!form.house_id && houses.length > 0) {
      setForm(f => ({ ...f, house_id: houses[0].id }));
    }
  }, [houses.length]);

  async function refresh() {
    const r = await api.get("/areas"); setItems(r.data); reloadCtx();
  }
  useEffect(() => { refresh(); }, []);

  const visible = effectiveHouseId
    ? items.filter(a => a.house_id === effectiveHouseId)
    : items;

  async function create() {
    if (!form.house_id || !form.bezeichnung.trim()) { toast.error("Haus und Bezeichnung sind Pflichtfelder."); return; }
    await api.post("/areas", {
      house_id:    form.house_id,
      building_id: form.building_id || undefined,
      name:        form.bezeichnung.trim(),
      bezeichnung: form.bezeichnung.trim(),
      bereichsnummer: form.bereichsnummer.trim() || undefined,
      beschreibung: form.beschreibung.trim() || undefined,
    });
    setForm(f => ({ ...f, bereichsnummer: "", bezeichnung: "", beschreibung: "" }));
    refresh();
  }

  async function save() {
    await api.patch(`/areas/${editing.id}`, {
      house_id:    editing.house_id,
      building_id: editing.building_id || undefined,
      name:        editing.bezeichnung,
      bezeichnung: editing.bezeichnung,
      bereichsnummer: editing.bereichsnummer || undefined,
      beschreibung: editing.beschreibung || undefined,
    });
    setEditing(null); refresh();
  }

  async function remove(id: string, n: string) {
    if (!(await confirmDialog(`Bereich/Station „${n}" löschen?`, { danger: true }))) return;
    try {
      await api.delete(`/areas/${id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!(await confirmDialog(`Enthält noch ${d.rooms} Räume und ${d.active_tasks} aktive Aufträge.\nAlle Daten unwiderruflich löschen?`, { danger: true }))) return;
        await api.delete(`/areas/${id}?force=true`);
      } else { toast.error(e.response?.data?.error || "Fehler beim Löschen"); return; }
    }
    refresh();
  }

  return (
    <div className="space-y-3">
      {/* Anlegen */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="label">Haus *</label>
            <select className="input" value={form.house_id}
              onChange={e => setForm({ ...form, house_id: e.target.value })}>
              <option value="">— wählen —</option>
              {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Gebäude</label>
            <select className="input" value={form.building_id}
              onChange={e => setForm({ ...form, building_id: e.target.value })}>
              <option value="">— optional —</option>
              {buildings.filter(b => !form.house_id || b.house_id === form.house_id)
                .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Bereichsnummer</label>
            <input className="input" style={{ width: 110 }} placeholder="z. B. A, B1, 100"
              value={form.bereichsnummer} onChange={e => setForm({ ...form, bereichsnummer: e.target.value })} />
          </div>
          <div className="flex-1">
            <label className="label">Bezeichnung *</label>
            <input className="input" placeholder="z. B. Chirurgie, Station A10"
              value={form.bezeichnung} onChange={e => setForm({ ...form, bezeichnung: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={create}>Anlegen</button>
        </div>
        <div>
          <label className="label">Beschreibung (optional)</label>
          <input className="input" placeholder="Kurze Beschreibung des Bereichs"
            value={form.beschreibung} onChange={e => setForm({ ...form, beschreibung: e.target.value })} />
        </div>
      </div>

      {selectedHouse && (
        <p className="text-xs text-slate-400">
          {visible.length} Bereich{visible.length !== 1 ? "e" : ""}/Station{visible.length !== 1 ? "en" : ""} in <strong>{selectedHouse.name}</strong>
        </p>
      )}

      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {visible.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Bereiche/Stationen angelegt.</li>
        )}
        {visible.map(a => (
          <li key={a.id} className="p-3 flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {a.bereichsnummer && (
                  <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{a.bereichsnummer}</span>
                )}
                <span className="font-semibold text-sm">{a.bezeichnung ?? a.name}</span>
                {!selectedHouse && <span className="text-xs text-slate-400">{a.house_name}</span>}
              {a.building_name && <span className="text-xs text-slate-400">🏢 {a.building_name}</span>}
              </div>
              {a.beschreibung && <p className="text-xs text-slate-400 mt-0.5">{a.beschreibung}</p>}
            </div>
            <RowActions onEdit={() => setEditing({ ...a })} onDelete={() => remove(a.id, a.bezeichnung ?? a.name)}
              confirmMsg={`Bereich „${a.bezeichnung ?? a.name}" löschen?`} />
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Bereich/Station bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Haus *</label>
            <select className="input" value={editing.house_id}
              onChange={e => setEditing({ ...editing, house_id: e.target.value })}>
              {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Gebäude</label>
            <select className="input" value={editing.building_id ?? ""}
              onChange={e => setEditing({ ...editing, building_id: e.target.value || null })}>
              <option value="">— kein Gebäude —</option>
              {buildings.filter(b => b.house_id === editing.house_id)
                .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bereichsnummer</label>
              <input className="input" placeholder="z. B. A, B1, 100"
                value={editing.bereichsnummer ?? ""}
                onChange={e => setEditing({ ...editing, bereichsnummer: e.target.value })} />
            </div>
            <div>
              <label className="label">Bezeichnung *</label>
              <input className="input"
                value={editing.bezeichnung ?? editing.name}
                onChange={e => setEditing({ ...editing, bezeichnung: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <textarea className="input min-h-[80px]"
              value={editing.beschreibung ?? ""}
              onChange={e => setEditing({ ...editing, beschreibung: e.target.value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

export default AreaTab;
