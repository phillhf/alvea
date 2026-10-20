import { useRaumbuch } from "../../contexts/RaumbuchContext";
import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { TravelHistoryModal } from "./TravelHistoryModal";
import { AttributeEditor } from "../../components/AttributeEditor";
import { confirmDialog } from "../../components/Dialog";

function BedTab() {
  const toast = useToast();
  const { filteredAreas, selectedArea, selectedHouse, reload: reloadCtx } = useRaumbuch();
  const [rooms, setRooms] = useState<any[]>([]);
  const [bedTypes, setBedTypes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ room_id: "", bed_number: "", bed_type_id: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const [historyBed, setHistoryBed] = useState<any | null>(null);

  async function refresh() {
    const [r, bt, b] = await Promise.all([
      api.get("/rooms"), api.get("/bed-types"), api.get("/beds"),
    ]);
    setRooms(r.data); setBedTypes(bt.data); setItems(b.data);
    if (!form.room_id && r.data.length > 0)
      setForm((f) => ({ ...f, room_id: r.data[0].id }));
    reloadCtx();
  }
  useEffect(() => { refresh(); }, []);

  // Räume nach Context filtern
  const filteredRooms = selectedArea
    ? rooms.filter(r => r.area_id === selectedArea.id || r.station_id === selectedArea.id)
    : selectedHouse
      ? rooms.filter(r => filteredAreas.some((a: any) => a.id === (r.area_id ?? r.station_id)))
      : rooms;

  // Stellplätze nach sichtbaren Räumen filtern, dann nach gewähltem Raum
  const visible = items
    .filter(b => filteredRooms.some(r => r.id === b.room_id))
    .filter(b => !form.room_id || b.room_id === form.room_id);

  async function create() {
    if (!form.room_id) { toast.error("Bitte einen Raum auswählen."); return; }
    if (!form.bed_number.trim()) { toast.error("Stellplatz-Nummer ist Pflicht."); return; }
    try {
      await api.post("/beds", {
        room_id:     form.room_id,
        bed_number:  form.bed_number.trim(),
        bed_type_id: form.bed_type_id || undefined,
      });
      setForm((f) => ({ ...f, bed_number: "" }));
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? e.response?.data?.error ?? "Fehler beim Anlegen des Stellplatzes");
    }
  }
  async function save() {
    await api.patch(`/beds/${editing.id}`, {
      room_id: editing.room_id,
      bed_number: editing.bed_number,
      bed_type_id: editing.bed_type_id || undefined,
    });
    setEditing(null);
    refresh();
  }
  async function remove(id: string, n: string) {
    if (!(await confirmDialog(`Stellplatz ${n} löschen?`, { danger: true }))) return;
    try {
      await api.delete(`/beds/${id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!(await confirmDialog(`Stellplatz ${n} hat noch ${d.active_tasks} aktive Aufträge.\n\nAufträge werden unwiderruflich gelöscht. Fortfahren?`, { danger: true }))) return;
        await api.delete(`/beds/${id}?force=true`);
      } else { toast.error(e.response?.data?.error || "Fehler beim Löschen"); return; }
    }
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Raum</label>
          <select
            className="input"
            value={form.room_id}
            onChange={(e) => setForm({ ...form, room_id: e.target.value })}
          >
            <option value="">— Raum wählen —</option>
            {filteredRooms.map((r) => (
              <option key={r.id} value={r.id}>
                Raum {r.room_number}{r.raumbezeichnung ? ` – ${r.raumbezeichnung}` : ""}{r.area_name ? ` (${r.area_name})` : r.station_name ? ` (${r.station_name})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Stellplatz-Nummer</label>
          <input
            className="input"
            value={form.bed_number}
            onChange={(e) => setForm({ ...form, bed_number: e.target.value })}
            style={{ width: 100 }}
          />
        </div>
        <div>
          <label className="label">Bett-Typ</label>
          <select
            className="input"
            value={form.bed_type_id}
            onChange={(e) => setForm({ ...form, bed_type_id: e.target.value })}
          >
            <option value="">– kein Typ –</option>
            {bedTypes.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={create}>
          Anlegen
        </button>
      </div>
      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {form.room_id && (
          <li className="px-3 py-2 text-xs text-slate-500 bg-slate-50 font-medium">
            {visible.length === 0
              ? "Noch keine Stellplätze in diesem Raum"
              : `${visible.length} Stellplatz${visible.length !== 1 ? "e" : ""} in diesem Raum`}
          </li>
        )}
        {!form.room_id && (
          <li className="px-3 py-2 text-xs text-slate-400 italic">Raum auswählen, um Stellplätze zu sehen.</li>
        )}
        {visible.map((b) => (
          <li key={b.id} className="p-3 flex justify-between items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="font-medium">
                Raum {b.room_number} · {b.bed_number}
              </span>
              <span className="ml-2 text-xs text-slate-400">{b.station_name}</span>
              {b.bed_type_name && (
                <span className="ml-2 text-xs text-slate-500">({b.bed_type_name})</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <RowActions
                onEdit={() => setEditing(b)}
                onDelete={() => remove(b.id, `${b.room_number}·${b.bed_number}`)}
                confirmMsg={`Stellplatz ${b.bed_number} (Raum ${b.room_number}) löschen?`}
              />
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <EditModal
          title="Stellplatz bearbeiten"
          onSave={save}
          onClose={() => setEditing(null)}
        >
          <div>
            <label className="label">Zimmer</label>
            <select
              className="input"
              value={editing.room_id}
              onChange={(e) =>
                setEditing({ ...editing, room_id: e.target.value })
              }
            >
              {filteredRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Raum {r.room_number} – {r.station_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Stellplatz-Nummer</label>
            <input
              className="input"
              value={editing.bed_number}
              onChange={(e) =>
                setEditing({ ...editing, bed_number: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Bett-Typ</label>
            <select
              className="input"
              value={editing.bed_type_id ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, bed_type_id: e.target.value })
              }
            >
              <option value="">– kein Typ –</option>
              {bedTypes.map((bt) => (
                <option key={bt.id} value={bt.id}>
                  {bt.name}
                </option>
              ))}
            </select>
          </div>
          <AttributeEditor entityType="bed" entityId={editing.id} />
        </EditModal>
      )}
      {historyBed && (
        <TravelHistoryModal bed={historyBed} onClose={() => setHistoryBed(null)} />
      )}
    </div>
  );
}

/* ============================================================ */
/* BETT-REISEHISTORIE MODAL                                     */
/* ============================================================ */

export default BedTab;
