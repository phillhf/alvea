import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Locker {
  id: string; number: string; notes: string | null;
  room_id: string; room_number: string; station_name: string | null;
  area_name: string | null; house_name: string | null;
  assignment_id: string | null;
  person_vorname: string | null; person_name: string | null;
  person_berufsgruppe: string | null;
  starts_at: string | null; ends_at: string | null;
}
interface Room { id: string; room_number: string; station_name: string | null; area_name: string | null; }

const emptyAssign = { person_vorname: "", person_name: "", person_berufsgruppe: "", starts_at: new Date().toISOString().slice(0,10), ends_at: "" };

export default function SpindeTab() {
  const [lockers,   setLockers]   = useState<Locker[]>([]);
  const [rooms,     setRooms]     = useState<Room[]>([]);
  const [form,      setForm]      = useState({ room_id: "", number: "", notes: "" });
  const [assigning, setAssigning] = useState<Locker | null>(null);
  const [aForm,     setAForm]     = useState({ ...emptyAssign });
  const [search,    setSearch]    = useState("");

  async function load() {
    const [l, r] = await Promise.all([api.get<Locker[]>("/lockers"), api.get<Room[]>("/rooms")]);
    setLockers(l.data); setRooms(r.data);
    if (!form.room_id && r.data.length > 0) setForm(f => ({ ...f, room_id: r.data[0].id }));
  }
  useEffect(() => { load(); }, []);

  async function createLocker() {
    if (!form.room_id || !form.number.trim()) return;
    await api.post("/lockers", { room_id: form.room_id, number: form.number.trim(), notes: form.notes || undefined });
    setForm(f => ({ ...f, number: "", notes: "" }));
    load();
  }

  async function deleteLocker(id: string, num: string) {
    if (!confirm(`Spind ${num} löschen? Alle Zuweisungen werden ebenfalls gelöscht.`)) return;
    await api.delete(`/lockers/${id}`);
    load();
  }

  async function assign() {
    if (!assigning || !aForm.person_vorname.trim() || !aForm.person_name.trim()) return;
    if (assigning.assignment_id) {
      // Bestehende Zuweisung bearbeiten
      await api.patch(`/lockers/${assigning.id}/assignment`, {
        person_vorname:      aForm.person_vorname.trim(),
        person_name:         aForm.person_name.trim(),
        person_berufsgruppe: aForm.person_berufsgruppe.trim() || undefined,
        starts_at:           aForm.starts_at || null,
        ends_at:             aForm.ends_at   || null,
      });
    } else {
      await api.post(`/lockers/${assigning.id}/assign`, {
        person_vorname:      aForm.person_vorname.trim(),
        person_name:         aForm.person_name.trim(),
        person_berufsgruppe: aForm.person_berufsgruppe.trim() || undefined,
        starts_at:           aForm.starts_at,
        ends_at:             aForm.ends_at || null,
      });
    }
    setAssigning(null);
    load();
  }

  async function unassign(l: Locker) {
    if (!confirm(`Zuweisung für Spind ${l.number} beenden?`)) return;
    await api.delete(`/lockers/${l.id}/assign`);
    load();
  }

  const q = search.toLowerCase().trim();
  const filtered = q
    ? lockers.filter(l =>
        l.number?.toLowerCase().includes(q) ||
        l.person_vorname?.toLowerCase().includes(q) ||
        l.person_name?.toLowerCase().includes(q) ||
        l.person_berufsgruppe?.toLowerCase().includes(q) ||
        l.room_number?.toLowerCase().includes(q) ||
        l.area_name?.toLowerCase().includes(q) ||
        l.house_name?.toLowerCase().includes(q)
      )
    : lockers;

  function personLabel(l: Locker) {
    if (!l.person_name) return null;
    return `${l.person_vorname} ${l.person_name}${l.person_berufsgruppe ? ` · ${l.person_berufsgruppe}` : ""}`;
  }

  function roomLabel(r: Room) {
    const loc = [r.area_name, r.station_name].filter(Boolean).join(" · ");
    return `${loc ? loc + " · " : ""}Raum ${r.room_number}`;
  }

  return (
    <div className="space-y-4">
      {/* Anlegen */}
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Raum</label>
          <select className="input" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })}>
            {rooms.map(r => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Spind-Nr. *</label>
          <input className="input" style={{ width: 90 }} placeholder="z. B. A1"
            value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
        </div>
        <div className="flex-1">
          <label className="label">Notizen (optional)</label>
          <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={createLocker}>+ Anlegen</button>
      </div>

      {/* Suche */}
      <div className="relative">
        <input
          className="input w-full pl-9 bg-white border border-slate-300"
          style={{ backgroundColor: "white" }}
          placeholder="Spind-Nr., Person, Standort suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
            onClick={() => setSearch("")}>×</button>
        )}
      </div>
      {q && (
        <div className="text-xs text-slate-400">
          {filtered.length} Ergebnis{filtered.length !== 1 ? "se" : ""} für „{search}"
        </div>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {lockers.length === 0 && (
          <div className="card text-center text-slate-400 py-8">Noch keine Spinde angelegt.</div>
        )}
        {filtered.map(l => (
          <div key={l.id} className="card !p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-600 shrink-0">
              {l.number}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                Spind {l.number}
                <span className="ml-2 text-xs text-slate-400">
                  {[l.house_name, l.area_name, l.station_name].filter(Boolean).join(" · ")}
                  {l.room_number && ` · Raum ${l.room_number}`}
                </span>
              </div>
              {personLabel(l) ? (
                <div className="text-sm text-slate-600 mt-0.5">
                  👤 {personLabel(l)}
                  {l.ends_at
                    ? <span className="ml-2 text-xs text-amber-600">bis {l.ends_at}</span>
                    : <span className="ml-2 text-xs text-blue-500">dauerhaft</span>
                  }
                </div>
              ) : (
                <div className="text-sm text-emerald-600">🟢 Frei</div>
              )}
              {l.notes && <div className="text-xs text-slate-400 mt-0.5">{l.notes}</div>}
            </div>
            <div className="flex gap-1 shrink-0">
              {l.assignment_id && (
                <>
                  <button className="btn-ghost !py-1 !px-2 text-xs"
                    onClick={() => { setAssigning(l); setAForm({
                      person_vorname:      l.person_vorname ?? "",
                      person_name:         l.person_name ?? "",
                      person_berufsgruppe: l.person_berufsgruppe ?? "",
                      starts_at:           l.starts_at ?? new Date().toISOString().slice(0,10),
                      ends_at:             l.ends_at ?? "",
                    }); }}>
                    ✏️ Bearbeiten
                  </button>
                  <button className="btn-ghost !py-1 !px-2 text-xs text-red-500" onClick={() => unassign(l)}>Freigeben</button>
                </>
              )}
              {!l.assignment_id && (
                <button className="btn-ghost !py-1 !px-2 text-xs"
                  onClick={() => { setAssigning(l); setAForm({ ...emptyAssign }); }}>
                  Zuweisen
                </button>
              )}
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-400" onClick={() => deleteLocker(l.id, l.number)}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {/* Zuweisungs-Modal */}
      {assigning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-display text-lg font-bold">🔐 Spind {assigning.number} zuweisen</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Vorname *</label>
                <input className="input" placeholder="z. B. Maria"
                  value={aForm.person_vorname} onChange={e => setAForm({ ...aForm, person_vorname: e.target.value })} />
              </div>
              <div>
                <label className="label">Nachname *</label>
                <input className="input" placeholder="z. B. Müller"
                  value={aForm.person_name} onChange={e => setAForm({ ...aForm, person_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Berufsgruppe</label>
              <input className="input" placeholder="z. B. Pflegefachkraft, Arzt, Reinigung…"
                value={aForm.person_berufsgruppe} onChange={e => setAForm({ ...aForm, person_berufsgruppe: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Von</label>
                <input className="input" type="date" value={aForm.starts_at}
                  onChange={e => setAForm({ ...aForm, starts_at: e.target.value })} />
              </div>
              <div>
                <label className="label">Bis (leer = dauerhaft)</label>
                <input className="input" type="date" value={aForm.ends_at}
                  onChange={e => setAForm({ ...aForm, ends_at: e.target.value })} />
              </div>
            </div>
            {!aForm.ends_at && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                🔵 Dauerhaft – kein Ablaufdatum gesetzt
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button className="btn-primary" onClick={assign}
                disabled={!aForm.person_vorname.trim() || !aForm.person_name.trim()}>
                Zuweisen
              </button>
              <button className="btn-ghost" onClick={() => setAssigning(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
