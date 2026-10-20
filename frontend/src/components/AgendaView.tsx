import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../contexts/ToastContext";

interface AgendaBooking {
  id: string; room_id: string; desk_id: string | null; whole_room: number;
  user_id: string; user_name: string | null; start_at: string; end_at: string;
  booked_by_id?: string | null; booked_by_name?: string | null;
  room_name: string; desk_name: string | null;
}

function fmtTime(iso: string) {
  return new Date(iso.replace(" ", "T")).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function dateKey(iso: string) {
  return new Date(iso.replace(" ", "T")).toISOString().slice(0, 10);
}
function dateHeading(key: string) {
  const d = new Date(key + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime())     return "Heute";
  if (d.getTime() === tomorrow.getTime())  return "Morgen";
  if (d.getTime() === yesterday.getTime()) return "Gestern";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default function AgendaView({ adminMode = false }: { adminMode?: boolean }) {
  const toast = useToast();
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => { load(); }, [showPast]);

  async function load() {
    setLoading(true);
    try {
      const endpoint = adminMode ? "/shared-bookings/all" : "/shared-bookings/my";
      const r = await api.get<AgendaBooking[]>(`${endpoint}?include_past=${showPast}`);
      setBookings(r.data);
    } catch { toast.error("Fehler beim Laden."); }
    finally { setLoading(false); }
  }

  async function cancel(id: string) {
    if (!confirm("Buchung wirklich stornieren?")) return;
    try { await api.delete(`/shared-bookings/${id}`); toast.success("Storniert."); load(); }
    catch { toast.error("Fehler beim Stornieren."); }
  }

  // Nach Datum gruppieren, chronologisch
  const groups: Record<string, AgendaBooking[]> = {};
  for (const b of bookings) {
    const key = dateKey(b.start_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => showPast ? b.localeCompare(a) : a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {showPast ? "Vergangene und kommende Buchungen" : "Kommende Buchungen"}
        </p>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          Vergangene anzeigen
        </label>
      </div>

      {loading && <p className="text-sm text-slate-400">Lädt…</p>}
      {!loading && bookings.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">
          {showPast ? "Keine Buchungen vorhanden." : "Keine anstehenden Buchungen."}
        </p>
      )}

      <div className="space-y-5">
        {sortedKeys.map(key => {
          const isPastDay = new Date(key + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));
          return (
            <div key={key}>
              <p className={`text-sm font-semibold mb-2 ${isPastDay ? "text-slate-400" : "text-slate-700"}`}>
                {dateHeading(key)}
              </p>
              <div className="space-y-2">
                {groups[key]
                  .sort((a, b) => a.start_at.localeCompare(b.start_at))
                  .map(b => (
                  <div key={b.id}
                    className={`card !p-3 flex items-center gap-3 ${isPastDay ? "opacity-60" : ""}`}>
                    <div className="shrink-0 text-center w-14">
                      <div className="text-sm font-semibold text-slate-700">{fmtTime(b.start_at)}</div>
                      <div className="text-xs text-slate-400">{fmtTime(b.end_at)}</div>
                    </div>
                    <div className="w-px self-stretch bg-slate-200" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        🪑 {b.room_name}{b.desk_name ? ` · ${b.desk_name}` : " · ganzer Raum"}
                      </p>
                      {adminMode && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {b.user_name}
                          {b.booked_by_id && <span> (gebucht von {b.booked_by_name})</span>}
                        </p>
                      )}
                      {!adminMode && b.booked_by_id && (
                        <p className="text-xs text-slate-400 mt-0.5">für {b.user_name}</p>
                      )}
                    </div>
                    {!isPastDay && (
                      <button onClick={() => cancel(b.id)}
                        className="shrink-0 text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1">
                        Stornieren
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
