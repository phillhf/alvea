import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Overview { free: number; permanent: number; expiring_soon: number; overdue: number; }
interface Locker {
  id: string; number: string; notes: string | null;
  room_number: string | null; station_name: string | null;
  area_name: string | null; house_name: string | null;
  assignment_id: string | null;
  person_vorname: string | null; person_name: string | null;
  person_berufsgruppe: string | null;
  starts_at: string | null; ends_at: string | null;
}

type Filter = "all" | "overdue" | "expiring_soon" | "free" | "permanent";

export default function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [lockers,  setLockers]  = useState<Locker[]>([]);
  const [filter,   setFilter]   = useState<Filter>("all");

  async function load() {
    const [o, l] = await Promise.all([
      api.get<Overview>("/lockers/overview"),
      api.get<Locker[]>("/lockers"),
    ]);
    setOverview(o.data);
    setLockers(l.data);
  }
  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const soon  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  function getStatus(l: Locker): "free" | "overdue" | "expiring_soon" | "permanent" {
    if (!l.assignment_id) return "free";
    if (!l.ends_at) return "permanent";
    if (l.ends_at < today) return "overdue";
    if (l.ends_at <= soon) return "expiring_soon";
    return "permanent";
  }

  const STATUS_COLOR = {
    free:          "border-l-emerald-400 bg-emerald-50/50",
    permanent:     "border-l-blue-400 bg-blue-50/50",
    expiring_soon: "border-l-amber-400 bg-amber-50/50",
    overdue:       "border-l-red-400 bg-red-50/50",
  };
  const STATUS_LABEL = {
    free:          { icon: "🟢", text: "Frei" },
    permanent:     { icon: "🔵", text: "Belegt" },
    expiring_soon: { icon: "🟡", text: "Läuft bald ab" },
    overdue:       { icon: "🔴", text: "Abgelaufen" },
  };

  const visible = filter === "all" ? lockers : lockers.filter(l => getStatus(l) === filter);

  const TILES = [
    { key: "overdue" as Filter,       icon: "🔴", label: "Abgelaufen",     val: overview?.overdue ?? 0,       color: "border-red-300 bg-red-50" },
    { key: "expiring_soon" as Filter, icon: "🟡", label: "Bald ablaufend", val: overview?.expiring_soon ?? 0, color: "border-amber-300 bg-amber-50" },
    { key: "permanent" as Filter,     icon: "🔵", label: "Belegt",         val: overview?.permanent ?? 0,     color: "border-blue-300 bg-blue-50" },
    { key: "free" as Filter,          icon: "🟢", label: "Frei",           val: overview?.free ?? 0,          color: "border-emerald-300 bg-emerald-50" },
  ];

  function personLabel(l: Locker) {
    if (!l.person_name) return null;
    return `${l.person_vorname} ${l.person_name}${l.person_berufsgruppe ? ` · ${l.person_berufsgruppe}` : ""}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TILES.map(tile => (
          <button key={tile.key}
            onClick={() => setFilter(f => f === tile.key ? "all" : tile.key)}
            className={`card !p-4 text-center border-2 transition-all ${tile.color} ${filter === tile.key ? "ring-2 ring-offset-1 ring-[color:var(--brand-400)]" : ""}`}
          >
            <div className="text-3xl mb-1">{tile.icon}</div>
            <div className="text-2xl font-bold">{tile.val}</div>
            <div className="text-xs text-slate-500 mt-0.5">{tile.label}</div>
          </button>
        ))}
      </div>

      {filter !== "all" && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{visible.length} Spind{visible.length !== 1 ? "e" : ""} · {STATUS_LABEL[filter].text}</p>
          <button className="btn-ghost text-sm" onClick={() => setFilter("all")}>✕ Filter aufheben</button>
        </div>
      )}

      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="card text-center text-slate-400 py-8">Keine Spinde in dieser Kategorie.</div>
        )}
        {visible.map(l => {
          const status = getStatus(l);
          return (
            <div key={l.id} className={`card !p-4 flex gap-4 border-l-4 ${STATUS_COLOR[status]}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold">Spind {l.number}</span>
                  <span className="text-xs text-slate-400">
                    {[l.house_name, l.area_name, l.station_name].filter(Boolean).join(" · ")}
                    {l.room_number && ` · Raum ${l.room_number}`}
                  </span>
                </div>
                {personLabel(l) ? (
                  <div className="text-sm">
                    <span className="font-medium">{personLabel(l)}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      seit {l.starts_at}{l.ends_at ? ` · bis ${l.ends_at}` : ""}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Kein Inhaber</span>
                )}
                {l.notes && <p className="text-xs text-slate-400 mt-1">{l.notes}</p>}
              </div>
              <div className="text-xl">{STATUS_LABEL[status].icon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
