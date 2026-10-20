import { useToast } from "../../contexts/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { useRaumbuch } from "../../contexts/RaumbuchContext";
import { AttributeEditor } from "../../components/AttributeEditor";

interface RoomType { id: string; name: string; icon: string; }

function RoomTab() {
  const toast = useToast();
  const { filteredAreas, selectedArea, selectedHouse, reload: reloadCtx } = useRaumbuch();
  const [items,     setItems]     = useState<any[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [form,      setForm]      = useState({ area_id: "", room_number: "", raumbezeichnung: "", beschreibung: "", flaeche: "", etage: "", room_type_id: "" });
  const [editing,   setEditing]   = useState<any | null>(null);

  const effectiveAreaId = selectedArea?.id ?? form.area_id;

  useEffect(() => {
    if (selectedArea && form.area_id !== selectedArea.id)
      setForm(f => ({ ...f, area_id: selectedArea.id }));
  }, [selectedArea?.id]);

  useEffect(() => {
    if (!form.area_id && filteredAreas.length > 0)
      setForm(f => ({ ...f, area_id: filteredAreas[0].id }));
  }, [filteredAreas.length]);

  async function refresh() {
    const [r, rt] = await Promise.all([api.get("/rooms"), api.get<RoomType[]>("/room-types")]);
    setItems(r.data); setRoomTypes(rt.data); reloadCtx();
  }
  useEffect(() => { refresh(); }, []);

  const visible = effectiveAreaId
    ? items.filter(r => r.area_id === effectiveAreaId || r.station_id === effectiveAreaId)
    : selectedHouse
      ? items.filter(r => filteredAreas.some(a => a.id === (r.area_id ?? r.station_id)))
      : items;

  async function create() {
    if (!form.area_id || !form.room_number.trim()) { toast.error("Bereich und Raumnummer sind Pflicht."); return; }
    try {
      await api.post("/rooms", {
        area_id:         form.area_id,
        room_number:     form.room_number.trim(),
        raumbezeichnung: form.raumbezeichnung.trim() || undefined,
        beschreibung:    form.beschreibung.trim() || undefined,
        flaeche:         form.flaeche ? parseFloat(form.flaeche) : undefined,
        etage:           form.etage.trim() || undefined,
        room_type_id:    form.room_type_id || null,
      });
      setForm(f => ({ ...f, room_number: "", raumbezeichnung: "", beschreibung: "", flaeche: "", etage: "", room_type_id: "" }));
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Fehler beim Anlegen des Raums");
    }
  }

  async function save() {
    try {
      await api.patch(`/rooms/${editing.id}`, {
        area_id:         editing.area_id,
        room_number:     editing.room_number,
        raumbezeichnung: editing.raumbezeichnung || undefined,
        beschreibung:    editing.beschreibung || undefined,
        flaeche:         editing.flaeche ? parseFloat(editing.flaeche) : undefined,
        etage:           editing.etage || undefined,
        room_type_id:    editing.room_type_id || null,
      });
      setEditing(null); refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Fehler beim Speichern");
    }
  }

  async function remove(id: string, n: string) {
    if (!confirm(`Raum „${n}" löschen?`)) return;
    try {
      await api.delete(`/rooms/${id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!confirm(`Raum enthält noch ${d.beds} Stellplätze / ${d.active_tasks} aktive Aufträge.\nFortfahren?`)) return;
        await api.delete(`/rooms/${id}?force=true`);
      } else { toast.error("Fehler beim Löschen"); return; }
    }
    refresh();
  }

  return (
    <div className="space-y-3">
      {/* Anlegen */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="label">Bereich/Station *</label>
            <select className="input" value={form.area_id}
              onChange={e => setForm({ ...form, area_id: e.target.value })}>
              <option value="">— Bereich wählen —</option>
              {filteredAreas.map(a => (
                <option key={a.id} value={a.id}>
                  {(a as any).bereichsnummer ? `[${(a as any).bereichsnummer}] ` : ""}{(a as any).bezeichnung ?? a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Raumnummer *</label>
            <input className="input" style={{ width: 100 }} placeholder="z. B. 101"
              value={form.room_number} onChange={e => setForm({ ...form, room_number: e.target.value })} />
          </div>
          <div className="flex-1">
            <label className="label">Raumbezeichnung</label>
            <input className="input" placeholder="z. B. Patientenzimmer, OP 1"
              value={form.raumbezeichnung} onChange={e => setForm({ ...form, raumbezeichnung: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={create}>Anlegen</button>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1">
            <label className="label">Beschreibung</label>
            <input className="input" value={form.beschreibung}
              onChange={e => setForm({ ...form, beschreibung: e.target.value })} />
          </div>
          <div style={{ width: 120 }}>
            <label className="label">Fläche (m²)</label>
            <input className="input" type="number" min="0" step="0.1" placeholder="z. B. 25.5"
              value={form.flaeche} onChange={e => setForm({ ...form, flaeche: e.target.value })} />
          </div>
          <div style={{ width: 110 }}>
            <label className="label">Etage</label>
            <input className="input" placeholder="z. B. EG, 1.OG"
              value={form.etage} onChange={e => setForm({ ...form, etage: e.target.value })} />
          </div>
          <div>
            <label className="label">Raumart</label>
            <select className="input" value={form.room_type_id}
              onChange={e => setForm({ ...form, room_type_id: e.target.value })}>
              <option value="">— keine Raumart —</option>
              {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {(selectedHouse || selectedArea) && (
        <p className="text-xs text-slate-400">
          {visible.length} Raum{visible.length !== 1 ? "räume" : ""}
          {selectedArea ? ` in „${(selectedArea as any).bezeichnung ?? selectedArea.name}"` :
           selectedHouse ? ` in Haus „${selectedHouse.name}"` : ""}
        </p>
      )}

      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {visible.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Räume angelegt.</li>
        )}
        {visible.map(r => (
          <li key={r.id} className="p-3 flex justify-between items-start gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-xl shrink-0 mt-0.5">{r.room_type_icon ?? "🚪"}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{r.room_number}</span>
                  {r.raumbezeichnung && <span className="font-semibold text-sm">{r.raumbezeichnung}</span>}
                  {r.flaeche && <span className="text-xs text-slate-400">{r.flaeche} m²</span>}
                  {r.etage && <span className="text-xs text-slate-400">📐 {r.etage}</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                  {r.room_type_name && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{r.room_type_name}</span>}
                  <span>📂 {r.area_name ?? r.station_name}</span>
                </div>
                {r.beschreibung && <p className="text-xs text-slate-400 mt-0.5">{r.beschreibung}</p>}
              </div>
            </div>
            <RowActions onEdit={() => setEditing({ ...r, flaeche: r.flaeche?.toString() ?? "", etage: r.etage ?? "" })}
              onDelete={() => remove(r.id, r.raumbezeichnung ?? r.room_number)}
              confirmMsg={`Raum ${r.room_number} löschen?`} />
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Raum bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Bereich/Station *</label>
            <select className="input" value={editing.area_id ?? ""}
              onChange={e => setEditing({ ...editing, area_id: e.target.value })}>
              {filteredAreas.map(a => (
                <option key={a.id} value={a.id}>
                  {(a as any).bereichsnummer ? `[${(a as any).bereichsnummer}] ` : ""}{(a as any).bezeichnung ?? a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Raumnummer *</label>
              <input className="input" value={editing.room_number}
                onChange={e => setEditing({ ...editing, room_number: e.target.value })} />
            </div>
            <div>
              <label className="label">Raumbezeichnung</label>
              <input className="input" value={editing.raumbezeichnung ?? ""}
                onChange={e => setEditing({ ...editing, raumbezeichnung: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <textarea className="input min-h-[80px]" value={editing.beschreibung ?? ""}
              onChange={e => setEditing({ ...editing, beschreibung: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Fläche (m²)</label>
              <input className="input" type="number" min="0" step="0.1" value={editing.flaeche ?? ""}
                onChange={e => setEditing({ ...editing, flaeche: e.target.value })} />
            </div>
            <div>
              <label className="label">Etage</label>
              <input className="input" placeholder="z. B. EG, 1.OG" value={editing.etage ?? ""}
                onChange={e => setEditing({ ...editing, etage: e.target.value })} />
            </div>
            <div>
              <label className="label">Raumart</label>
              <select className="input" value={editing.room_type_id ?? ""}
                onChange={e => setEditing({ ...editing, room_type_id: e.target.value || null })}>
                <option value="">— keine Raumart —</option>
                {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
              </select>
            </div>
          </div>
          <AttributeEditor entityType="room" entityId={editing.id} roomTypeId={editing.room_type_id} />
        </EditModal>
      )}
    </div>
  );
}

export default RoomTab;
