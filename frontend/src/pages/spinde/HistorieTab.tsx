import { useState } from "react";
import { api } from "../../api/client";

interface HistoryEntry {
  id: string;
  person_vorname: string; person_name: string; person_berufsgruppe: string | null;
  starts_at: string; ends_at: string | null;
  assigned_by: string; created_at: string;
  ended_at: string | null; ended_by: string | null;
}
interface Locker { id: string; number: string; room_number: string | null; station_name: string | null; }

export default function HistorieTab() {
  const [lockers,  setLockers]  = useState<Locker[]>([]);
  const [history,  setHistory]  = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<Locker | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");

  async function loadLockers() {
    if (lockers.length > 0) return;
    const r = await api.get<Locker[]>("/lockers");
    setLockers(r.data);
  }

  async function loadHistory(locker: Locker) {
    setSelected(locker); setLoading(true);
    const r = await api.get<HistoryEntry[]>(`/lockers/${locker.id}/history`);
    setHistory(r.data); setLoading(false);
  }

  const filtered = lockers.filter(l =>
    !search ||
    l.number.toLowerCase().includes(search.toLowerCase()) ||
    (l.station_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.room_number ?? "").includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <input className="input w-full" placeholder="Suche Spind / Station / Raum"
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={loadLockers} />
          <div className="card !p-0 divide-y divide-slate-100 max-h-[500px] overflow-auto">
            {filtered.length === 0 && (
              <div className="p-3 text-sm text-slate-400">
                {lockers.length === 0 ? "Einmal ins Suchfeld klicken…" : "Keine Treffer"}
              </div>
            )}
            {filtered.map(l => (
              <button key={l.id} onClick={() => loadHistory(l)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${selected?.id === l.id ? "bg-brand-50 font-medium" : ""}`}>
                <span className="font-medium">Spind {l.number}</span>
                <span className="block text-xs text-slate-400">
                  {l.station_name && `${l.station_name} · `}Raum {l.room_number}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          {!selected && (
            <div className="card text-center text-slate-400 py-12">← Spind auswählen</div>
          )}
          {selected && (
            <div className="space-y-2">
              <h3 className="font-semibold">
                Spind {selected.number}
                {selected.station_name && ` · ${selected.station_name}`}
                {selected.room_number && ` · Raum ${selected.room_number}`}
              </h3>
              {loading && <div className="text-slate-400 text-sm">Lädt…</div>}
              {!loading && history.length === 0 && (
                <div className="card text-slate-400 text-center py-8">Noch keine Zuweisungen.</div>
              )}
              {!loading && history.map(h => (
                <div key={h.id} className={`card !p-4 border-l-4 ${!h.ended_at ? "border-l-blue-400" : "border-l-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{h.person_vorname} {h.person_name}</div>
                      {h.person_berufsgruppe && (
                        <div className="text-xs text-slate-500">{h.person_berufsgruppe}</div>
                      )}
                    </div>
                    {!h.ended_at && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">Aktiv</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-2 flex gap-4 flex-wrap">
                    <span>Von: {h.starts_at}</span>
                    {h.ends_at && <span>Geplant bis: {h.ends_at}</span>}
                    {h.ended_at && <span>Beendet: {h.ended_at}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
