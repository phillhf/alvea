import { useEffect, useState } from "react";
import { api } from "../../api/client";

export function TravelHistoryModal({ bed, onClose }: { bed: any; onClose: () => void }) {
  const [data, setData]       = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [activeTab, setActiveTab] = useState<"timeline" | "stations">("timeline");

  useEffect(() => {
    if (!bed) return;
    setLoading(true);
    api.get(`/travel-history/barcode/${encodeURIComponent(bed.barcode)}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [bed]);

  if (!bed) return null;

  const entries: any[] = data?.entries ?? [];
  const filtered = entries.filter((e: any) =>
    !search || e.station_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Station frequency
  const stationFreq: Record<string, number> = {};
  entries.forEach((e: any) => {
    stationFreq[e.station_name] = (stationFreq[e.station_name] ?? 0) + 1;
  });
  const sortedStations = Object.entries(stationFreq).sort(([, a], [, b]) => b - a);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="font-display text-xl font-bold">🗺️ Reisehistorie</h2>
            <p className="text-sm text-slate-500">
              Bett: <span className="font-mono font-semibold">{bed.barcode}</span>
              {bed.bed_number && ` · Platz ${bed.bed_number}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12 text-slate-400">
            Wird geladen…
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center py-12 text-slate-400">
            Keine Reisedaten gefunden.
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 mt-3">
              {(["timeline", "stations"] as const).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === t
                      ? "border-[color:var(--brand-600)] text-[color:var(--brand-700)]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}>
                  {t === "timeline" ? `📅 Timeline (${entries.length})` : `📊 Stationen (${sortedStations.length})`}
                </button>
              ))}
            </div>

            {activeTab === "timeline" && (
              <>
                <input className="input mt-3" placeholder="Station suchen…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="overflow-y-auto flex-1 mt-3 space-y-2 pr-1">
                  {filtered.length === 0 && (
                    <p className="text-center text-slate-400 py-8">Keine Einträge gefunden.</p>
                  )}
                  {filtered.map((e: any, i: number) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                      e.cleaning_type === "aufbereitung_zentral"
                        ? "bg-violet-50 border-violet-100"
                        : e.cleaning_type === "infektioes"
                        ? "bg-red-50 border-red-100"
                        : "bg-slate-50 border-slate-100"
                    }`}>
                      <div className="text-lg shrink-0 mt-0.5">
                        {e.cleaning_type === "aufbereitung_zentral" ? "🏥" :
                         e.cleaning_type === "infektioes" ? "⚠️" : "🛏️"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{e.station_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {e.cleaning_type === "aufbereitung_zentral" ? "Zentrale Aufbereitung" :
                           e.cleaning_type === "infektioes" ? "Infektiöse Aufbereitung" :
                           e.cleaning_type === "schlussdesinfektion" ? "Schlussdesinfektion" : "Standardreinigung"}
                          {e.pathogens?.length > 0 && ` · ${e.pathogens.join(", ")}`}
                        </div>
                        {e.assigned_to_name && (
                          <div className="text-xs text-slate-400">👤 {e.assigned_to_name}</div>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">
                        {e.completed_at
                          ? new Date(e.completed_at.replace(" ", "T") + "Z")
                              .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
                          : "–"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "stations" && (
              <div className="overflow-y-auto flex-1 mt-3 space-y-2 pr-1">
                {sortedStations.map(([station, count], i) => (
                  <div key={station} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-mono text-xs w-5">{i + 1}.</span>
                    <span className="flex-1 font-medium text-sm">{station}</span>
                    <span className="badge bg-[color:var(--brand-100)] text-[color:var(--brand-700)] text-xs">
                      {count}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
