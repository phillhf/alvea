import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { RowActions, EditModal } from "./shared";

interface Room {
  id: string; name: string; location: string | null;
  teilbar: number; raum_buchbar: number; notiz: string | null; desk_count: number;
}
interface Desk { id: string; room_id: string; name: string; sort_order: number; ausstattung: string | null; }

function SharedRoomsTab() {
  const toast = useToast();
  const [rooms, setRooms]   = useState<Room[]>([]);
  const [form, setForm]     = useState({ name: "", location: "", teilbar: true, raum_buchbar: false, notiz: "" });
  const [editing, setEditing] = useState<Room | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [desks, setDesks]   = useState<Desk[]>([]);
  const [newDesk, setNewDesk] = useState({ name: "", ausstattung: "" });
  const [editingDesk, setEditingDesk] = useState<Desk | null>(null);

  async function refresh() {
    try { setRooms((await api.get<Room[]>("/shared-rooms")).data); }
    catch { toast.error("Fehler beim Laden."); }
  }
  useEffect(() => { refresh(); }, []);

  async function loadDesks(roomId: string) {
    try {
      const r = await api.get<Room & { desks: Desk[] }>(`/shared-rooms/${roomId}`);
      setDesks(r.data.desks);
    } catch { toast.error("Fehler beim Laden der Tische."); }
  }

  async function create() {
    if (!form.name.trim()) { toast.error("Name ist Pflichtfeld."); return; }
    try {
      await api.post("/shared-rooms", {
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        teilbar: form.teilbar,
        raum_buchbar: form.raum_buchbar,
        notiz: form.notiz.trim() || undefined,
      });
      setForm({ name: "", location: "", teilbar: true, raum_buchbar: false, notiz: "" });
      refresh();
    } catch { toast.error("Fehler beim Anlegen."); }
  }

  async function save() {
    if (!editing) return;
    try {
      await api.patch(`/shared-rooms/${editing.id}`, {
        name: editing.name,
        location: editing.location || undefined,
        teilbar: !!editing.teilbar,
        raum_buchbar: !!editing.raum_buchbar,
        notiz: editing.notiz || undefined,
      });
      setEditing(null);
      refresh();
    } catch { toast.error("Fehler beim Speichern."); }
  }

  async function remove(id: string) {
    try { await api.delete(`/shared-rooms/${id}`); refresh(); if (expanded === id) setExpanded(null); }
    catch { toast.error("Fehler beim Löschen."); }
  }

  async function addDesk(roomId: string) {
    if (!newDesk.name.trim()) return;
    try {
      await api.post(`/shared-rooms/${roomId}/desks`, {
        name: newDesk.name.trim(),
        ausstattung: newDesk.ausstattung.trim() || undefined,
      });
      setNewDesk({ name: "", ausstattung: "" });
      loadDesks(roomId);
      refresh();
    } catch { toast.error("Fehler beim Anlegen des Tisches."); }
  }

  async function saveDesk(roomId: string) {
    if (!editingDesk) return;
    try {
      await api.patch(`/shared-rooms/${roomId}/desks/${editingDesk.id}`, {
        name: editingDesk.name,
        ausstattung: editingDesk.ausstattung || undefined,
      });
      setEditingDesk(null);
      loadDesks(roomId);
    } catch { toast.error("Fehler beim Speichern."); }
  }

  async function removeDesk(roomId: string, deskId: string) {
    try { await api.delete(`/shared-rooms/${roomId}/desks/${deskId}`); loadDesks(roomId); refresh(); }
    catch { toast.error("Fehler beim Löschen."); }
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Raumname *</label>
          <input className="input" placeholder="z. B. Kreativraum 1"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="label">Standort</label>
          <input className="input" placeholder="z. B. 2. OG"
            value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="label">Ausstattung / Info</label>
          <input className="input" placeholder="z. B. Verfügt über TV"
            value={form.notiz} onChange={e => setForm({ ...form, notiz: e.target.value })} />
        </div>
        <label className="flex items-center gap-1.5 text-sm mb-2">
          <input type="checkbox" checked={form.teilbar} onChange={e => setForm({ ...form, teilbar: e.target.checked })} />
          Teilbar
        </label>
        <label className="flex items-center gap-1.5 text-sm mb-2">
          <input type="checkbox" checked={form.raum_buchbar} onChange={e => setForm({ ...form, raum_buchbar: e.target.checked })} />
          Ganzer Raum buchbar
        </label>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      <ul className="card !p-0 divide-y divide-slate-100">
        {rooms.length === 0 && <li className="p-3 text-sm text-slate-400">Noch keine Räume angelegt.</li>}
        {rooms.map(r => (
          <li key={r.id}>
            <div className="p-3 flex justify-between items-center gap-3">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => {
                if (expanded === r.id) { setExpanded(null); }
                else { setExpanded(r.id); loadDesks(r.id); }
              }}>
                <div className="font-medium">{r.name} {!r.teilbar && <span className="text-xs text-slate-400">(nicht teilbar)</span>}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex gap-3 flex-wrap">
                  {r.location && <span>📍 {r.location}</span>}
                  <span>{r.desk_count} Tisch{r.desk_count !== 1 ? "e" : ""}</span>
                  {!!r.raum_buchbar && <span>· ganzer Raum buchbar</span>}
                  {r.notiz && <span>· ℹ️ {r.notiz}</span>}
                </div>
              </div>
              <RowActions onEdit={() => setEditing(r)} onDelete={() => remove(r.id)} confirmMsg={`Raum „${r.name}" löschen?`} />
            </div>

            {expanded === r.id && (
              <div className="px-3 pb-3 bg-slate-50">
                <p className="text-xs font-medium text-slate-500 mb-2 pt-2">Tische</p>
                <div className="space-y-1.5 mb-2">
                  {desks.map(d => (
                    <div key={d.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
                      {editingDesk?.id === d.id ? (
                        <>
                          <input className="input flex-1 !py-1" value={editingDesk.name}
                            onChange={e => setEditingDesk({ ...editingDesk, name: e.target.value })} />
                          <input className="input flex-1 !py-1" placeholder="Ausstattung"
                            value={editingDesk.ausstattung ?? ""}
                            onChange={e => setEditingDesk({ ...editingDesk, ausstattung: e.target.value })} />
                          <button onClick={() => saveDesk(r.id)} className="text-xs text-green-600 font-medium px-1">✓</button>
                          <button onClick={() => setEditingDesk(null)} className="text-xs text-slate-400 px-1">×</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1">
                            🪑 {d.name}
                            {d.ausstattung && <span className="text-slate-400"> · {d.ausstattung}</span>}
                          </span>
                          <button onClick={() => setEditingDesk(d)} className="text-slate-400 hover:text-slate-600 text-xs">✎</button>
                          <button onClick={() => removeDesk(r.id, d.id)} className="text-slate-400 hover:text-red-500 text-xs">×</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="Neuer Tisch, z. B. Tisch 1"
                    value={newDesk.name} onChange={e => setNewDesk({ ...newDesk, name: e.target.value })} />
                  <input className="input flex-1" placeholder="Ausstattung, z. B. Dockingstation, 2 Bildschirme"
                    value={newDesk.ausstattung} onChange={e => setNewDesk({ ...newDesk, ausstattung: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && addDesk(r.id)} />
                  <button className="btn-outline text-sm" onClick={() => addDesk(r.id)}>+ Tisch</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <EditModal title="Raum bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Name *</label>
            <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Standort</label>
            <input className="input" value={editing.location ?? ""} onChange={e => setEditing({ ...editing, location: e.target.value })} />
          </div>
          <div>
            <label className="label">Ausstattung / Info</label>
            <input className="input" placeholder="z. B. Verfügt über TV"
              value={editing.notiz ?? ""} onChange={e => setEditing({ ...editing, notiz: e.target.value })} />
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={!!editing.teilbar} onChange={e => setEditing({ ...editing, teilbar: e.target.checked ? 1 : 0 })} />
            Teilbar (sichtbar für Nutzer)
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={!!editing.raum_buchbar} onChange={e => setEditing({ ...editing, raum_buchbar: e.target.checked ? 1 : 0 })} />
            Ganzer Raum zusätzlich buchbar
          </label>
        </EditModal>
      )}
    </div>
  );
}

export default SharedRoomsTab;
