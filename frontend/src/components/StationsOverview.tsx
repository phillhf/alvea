import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "./LiveIndicator";
import { confirmDialog } from "./Dialog";

interface Area { id: string; name: string; house_name?: string }
interface Station {
  id: string; name: string; short_code?: string; area_id: string;
  open_count: number; running_count: number; oldest_open: string | null;
  priority_score: number; my_status: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "–";
  const diff = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000;
  if (diff < 60)   return `${Math.round(diff)} Min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} Std.`;
  return `${Math.round(diff / 1440)} T.`;
}

export default function StationsOverview({
  category, title, stationLinkPrefix = "/stations",
}: {
  category: "bed_cleaning" | "room_cleaning";
  title: string;
  stationLinkPrefix?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [stationsByArea, setStationsByArea] = useState<Record<string, Station[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { touch, label: updatedLabel } = useLastUpdated();
  const [colorYellow, setColorYellow] = useState(2);
  const [colorRed, setColorRed] = useState(5);

  async function refresh() {
    const [hRes, sRes, cfgRes] = await Promise.all([
      api.get<Area[]>("/houses").catch(() => ({ data: [] as Area[] })),
      api.get<Station[]>(`/stations?category=${category}`).catch(() => ({ data: [] as Station[] })),
      api.get<any[]>("/settings").catch(() => ({ data: [] as any[] })),
    ]);
    setAreas(hRes.data);
    const map: Record<string, Station[]> = {};
    sRes.data.forEach((s) => { (map[s.area_id] ||= []).push(s); });
    setStationsByArea(map);
    const cfg: Record<string, string> = {};
    cfgRes.data.forEach((s: any) => { cfg[s.key] = s.value; });
    if (cfg["prio_color_yellow"]) setColorYellow(Number(cfg["prio_color_yellow"]));
    if (cfg["prio_color_red"])    setColorRed(Number(cfg["prio_color_red"]));
    setLoading(false);
    touch();
  }

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 15000);
    return () => clearInterval(i);
  }, [category]);

  async function enRoute(stationId: string) {
    setBusy(stationId);
    try { await api.post(`/stations/${stationId}/en-route`); await refresh(); }
    finally { setBusy(null); }
  }

  async function leave(stationId: string) {
    if (!(await confirmDialog("Station verlassen? Alle nicht gestarteten Aufträge werden freigegeben.", { danger: true }))) return;
    setBusy(stationId);
    try { await api.post(`/stations/${stationId}/leave`); await refresh(); }
    finally { setBusy(null); }
  }

  async function arrived(stationId: string) {
    setBusy(stationId);
    try {
      await api.post(`/stations/${stationId}/arrived`);
      // Direkt in die Station – spart den Klick auf "Station öffnen"
      nav(`${stationLinkPrefix}/${stationId}`);
    }
    finally { setBusy(null); }
  }

  if (loading) return <div className="text-slate-500">{t("common.loading")}</div>;

  function renderStation(s: Station, maxScore: number) {
    const isTop = s.priority_score > 0 && s.priority_score === maxScore;
    return (
      <div key={s.id} className={`card-interactive flex flex-col gap-3 group ${
        isTop ? "ring-2 ring-red-500 shadow-md shadow-red-100 dark:shadow-red-900/20"
              : "ring-1 ring-brand-500/30"
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-bold text-slate-900 dark:text-white group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">{s.name}</div>
            {s.short_code && <div className="text-xs text-slate-400 font-mono mt-0.5">{s.short_code}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="badge bg-amber-100 text-amber-700">{s.open_count} offen</div>
            {s.running_count > 0 && <div className="badge bg-orange-100 text-orange-700">{s.running_count} aktiv</div>}
            <div className={`badge font-semibold ${
              s.priority_score === 0         ? "bg-slate-100 text-slate-500" :
              s.priority_score < colorYellow ? "bg-green-100 text-green-700" :
              s.priority_score < colorRed    ? "bg-yellow-100 text-yellow-800" :
                                               "bg-red-100 text-red-700"
            }`} title="Prioritätsscore">⚡ {s.priority_score.toFixed(1)} Pkt.</div>
          </div>
        </div>
        <div className="text-xs text-slate-500">⏱ Ältester: <b>{timeAgo(s.oldest_open)}</b></div>
        <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
          {!s.my_status && (
            <button className="btn-primary w-full" disabled={busy === s.id} onClick={() => enRoute(s.id)}>
              {busy === s.id ? "⏳…" : "🚶 Auf dem Weg zur Station"}
            </button>
          )}
          {s.my_status === "unterwegs" && (
            <button className="btn-primary w-full" disabled={busy === s.id} onClick={() => arrived(s.id)}>
              {busy === s.id ? "⏳…" : "📍 Auf der Station angekommen"}
            </button>
          )}
          {(s.my_status === "angekommen" || s.my_status === "laufend") && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-center text-emerald-600 font-medium">
                {s.my_status === "angekommen" ? "📍 Du bist auf dieser Station" : "🧽 In Bearbeitung"}
              </span>
              <Link to={`${stationLinkPrefix}/${s.id}`} className="btn-ghost w-full text-center text-sm">Station öffnen →</Link>
              <button className="text-xs text-red-500 hover:text-red-700 text-center py-0.5" disabled={busy === s.id} onClick={() => leave(s.id)}>↩ Station verlassen</button>
            </div>
          )}
          {s.my_status === "unterwegs" && (
            <button className="text-xs text-red-500 hover:text-red-700 text-center py-0.5" disabled={busy === s.id} onClick={() => leave(s.id)}>↩ Doch nicht – zurück</button>
          )}
          {!s.my_status && (
            <Link to={`${stationLinkPrefix}/${s.id}`} className="btn-ghost w-full text-center text-sm">Station ansehen →</Link>
          )}
        </div>
      </div>
    );
  }

  // Alle Stationen mit offenen Aufträgen – gruppiert nach Haus
  const allStationsWithOpen = Object.entries(stationsByArea)
    .flatMap(([, stations]) => stations)
    .filter(s => s.open_count > 0);

  const areasWithOpen = areas
    .map((a) => ({ area: a, stations: (stationsByArea[a.id] || []).filter((s) => s.open_count > 0) }))
    .filter((x) => x.stations.length > 0);

  // Stationen ohne Haus-Zuordnung (Fallback)
  const houseIds = new Set(areas.map(a => a.id));
  const orphanStations = allStationsWithOpen.filter(s => !houseIds.has(s.area_id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-sm text-slate-500">
            Hallo {user?.full_name}! Wähle eine Station mit offenen Aufträgen.
          </span>
          <LiveIndicator label={updatedLabel} />
        </div>
      </div>

      {areasWithOpen.length === 0 && orphanStations.length === 0 && (
        <div className="card text-slate-500">{t("dashboard.noOpen")}</div>
      )}

      {/* Stationen ohne Haus-Zuordnung */}
      {orphanStations.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold tracking-tight mb-3">Bereiche/Stationen</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orphanStations.map((s) => renderStation(s, s.priority_score))}
          </div>
        </section>
      )}

      {areasWithOpen.map(({ area: a, stations }) => {
        const maxScore = Math.max(...stations.map(s => s.priority_score));
        return (
        <section key={a.id}>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-display text-xl font-bold tracking-tight">{a.name}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stations.map((s) => renderStation(s, maxScore))}
          </div>
        </section>
        );
      })}
    </div>
  );
}
