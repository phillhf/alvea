import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { confirmDialog, alertDialog } from "../../components/Dialog";

interface LockerRequest {
  id: string;
  vorname: string;
  nachname: string;
  berufsgruppe: string;
  station_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}
interface FreeLocker { id: string; number: string; room_number: string | null; area_name: string | null; house_name: string | null; }
interface Props { onCountChange?: (n: number) => void; }

function fmt(d: string | null) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

export default function AnfragenTab({ onCountChange }: Props) {
  const [requests, setRequests]       = useState<LockerRequest[]>([]);
  const [freeLockers, setFreeLockers] = useState<FreeLocker[]>([]);
  const [loading, setLoading]         = useState(true);

  // Zuweisung-Modal State
  const [assigning, setAssigning]     = useState<LockerRequest | null>(null);
  const [editBeruf, setEditBeruf]     = useState("");
  const [editStart, setEditStart]     = useState("");
  const [editEnd, setEditEnd]         = useState("");
  const [lockerId, setLockerId]       = useState("");
  const [saving, setSaving]           = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [reqRes, lockerRes] = await Promise.all([
        api.get<LockerRequest[]>("/lockers/requests"),
        api.get<any[]>("/lockers"),
      ]);
      setRequests(reqRes.data);
      onCountChange?.(reqRes.data.length);
      setFreeLockers(
        lockerRes.data
          .filter((l: any) => !l.assignment_id)
          .map((l: any) => ({ id: l.id, number: l.number, room_number: l.room_number, area_name: l.area_name, house_name: l.house_name }))
      );
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openAssign(r: LockerRequest) {
    setAssigning(r);
    setEditBeruf(r.berufsgruppe);
    setEditStart(r.starts_at ?? "");
    setEditEnd(r.ends_at ?? "");
    setLockerId("");
  }

  async function assign() {
    if (!assigning || !lockerId) return;
    setSaving(true);
    try {
      await api.patch(`/lockers/requests/${assigning.id}`, {
        berufsgruppe: editBeruf,
        starts_at: editStart || null, ends_at: editEnd || null,
      });
      await api.post(`/lockers/requests/${assigning.id}/assign`, {
        locker_id: lockerId,
        starts_at: editStart || undefined,
        ends_at:   editEnd   || undefined,
      });
      setAssigning(null); load();
    } catch (e: any) { alertDialog(e.response?.data?.error || "Fehler"); }
    finally { setSaving(false); }
  }

  async function dismiss(id: string) {
    if (!(await confirmDialog("Anfrage ablehnen und löschen?", { danger: true }))) return;
    await api.delete(`/lockers/requests/${id}`);
    load();
  }

  if (loading) return <div className="py-8 text-slate-400 text-sm">Wird geladen…</div>;

  return (
    <div className="space-y-4">
      {requests.length === 0 ? (
        <div className="card text-slate-400 text-sm py-8 text-center">Keine offenen Spind-Anfragen</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="card !p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{r.vorname} {r.nachname}</div>
                <div className="text-sm text-slate-500">{r.berufsgruppe}</div>
                {r.station_name && <div className="text-xs text-slate-400 mt-0.5">📍 {r.station_name}</div>}
                {(r.starts_at || r.ends_at) && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    📅 {fmt(r.starts_at)} – {fmt(r.ends_at)}
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-0.5">{new Date(r.created_at).toLocaleString("de-DE")}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn-primary text-sm" onClick={() => openAssign(r)}>🔐 Spind zuweisen</button>
                <button className="btn-ghost text-sm !text-red-500 hover:!bg-red-50" onClick={() => dismiss(r.id)}>Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zuweisung-Modal */}
      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setAssigning(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md space-y-4 p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold">🔐 Spind zuweisen</h2>

            <div className="space-y-1">
              <label className="label">Berufsgruppe</label>
              <input className="input w-full" value={editBeruf} onChange={e => setEditBeruf(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="label">Von</label>
                <input type="date" className="input w-full" value={editStart} onChange={e => setEditStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="label">Bis</label>
                <input type="date" className="input w-full" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="label">Freier Spind *</label>
              {freeLockers.length === 0 ? (
                <div className="text-sm text-red-500 py-2">Keine freien Spinde verfügbar.</div>
              ) : (
                <select className="input w-full" value={lockerId} onChange={e => setLockerId(e.target.value)}>
                  <option value="">— Spind auswählen —</option>
                  {freeLockers.map(l => (
                    <option key={l.id} value={l.id}>
                      Spind {l.number}{l.room_number ? ` · Zimmer ${l.room_number}` : ""}{l.area_name ? ` · ${l.area_name}` : ""}{l.house_name ? ` · ${l.house_name}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!lockerId || saving} onClick={assign}>
                {saving ? "Wird zugewiesen…" : "Zuweisen"}
              </button>
              <button className="btn-ghost flex-1" onClick={() => setAssigning(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
