import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";
import { SkeletonList } from "../components/Skeleton";

interface StationSummary {
  id: string;
  name: string;
  area_name: string;
  open_beds: number;
  active_beds: number;
  open_rooms: number;
  active_rooms: number;
  open_zentral: number;
  score: number;
}

interface PruefterminStats {
  ueberfaellig: number;
  bald_faellig: number;
  gesperrt: number;
}

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) return <span className="badge bg-slate-100 text-slate-400 text-xs">–</span>;
  if (score < 3)   return <span className="badge bg-emerald-100 text-emerald-700 text-xs">{score.toFixed(1)}</span>;
  if (score < 6)   return <span className="badge bg-amber-100 text-amber-700 text-xs">{score.toFixed(1)}</span>;
  return <span className="badge bg-red-100 text-red-700 text-xs font-bold">{score.toFixed(1)}</span>;
}

interface O2Anfrage {
  id: string; anzahl: number; typ_name: string|null;
  station_name: string|null; status: string; created_at: string;
}
interface O2Bestand {
  status: string; typ_name: string|null; lager_name: string|null; anzahl: number;
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const [stations, setStations]         = useState<StationSummary[]>([]);
  const [prueftermin, setPrueftermin]   = useState<PruefterminStats>({ ueberfaellig: 0, bald_faellig: 0, gesperrt: 0 });
  const [o2Anfragen, setO2Anfragen]     = useState<O2Anfrage[]>([]);
  const [o2Bestand, setO2Bestand]       = useState<O2Bestand[]>([]);
  const [loading, setLoading]           = useState(true);
  const { touch, label: updatedLabel }  = useLastUpdated();

  async function load() {
    try {
      const r = await api.get<{ stations: StationSummary[]; prueftermin: PruefterminStats }>("/dashboard/summary");
      setStations(r.data.stations);
      setPrueftermin(r.data.prueftermin);
      touch();
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function loadO2() {
    const hasO2 = can("sauerstofftransport") || can("verwaltung");
    if (!hasO2) return;
    try {
      const [anf, bestand] = await Promise.all([
        api.get<O2Anfrage[]>("/o2/anfragen"),
        api.get<O2Bestand[]>("/o2/bestand"),
      ]);
      setO2Anfragen(anf.data.filter(a => a.status !== "geliefert"));
      setO2Bestand(bestand.data);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    load();
    loadO2();
    const i = setInterval(() => { load(); loadO2(); }, 30000);
    return () => clearInterval(i);
  }, []);

  if (loading) return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="skeleton skeleton-title" style={{ width: 200, height: 18 }} />
      <SkeletonList count={3} />
    </div>
  );

  const totalOpenBeds   = stations.reduce((s, x) => s + x.open_beds, 0);
  const totalActiveBeds = stations.reduce((s, x) => s + x.active_beds, 0);
  const totalOpenRooms  = stations.reduce((s, x) => s + x.open_rooms, 0);
  const totalZentral    = stations.reduce((s, x) => s + x.open_zentral, 0);

  // Nach Bereich gruppieren
  const byArea = stations.reduce<Record<string, StationSummary[]>>((acc, s) => {
    (acc[s.area_name] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* ── Hero-Header ── */}
      <div className="card card-accent !p-0 overflow-hidden">
        <div className="px-5 py-4" style={{ background: "var(--brand-50)" }}>
          <p className="text-label mb-1" style={{ color: "#3b82f6" }}>Schichtübersicht</p>
          <h1 className="font-display text-2xl font-medium tracking-tight text-slate-800">
            Guten Tag{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}! 👋
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
      </div>

      {/* Gesamtkennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Betten offen",  value: totalOpenBeds,   cls: "stat-card-amber",  icon: "🔔", link: "/" },
          { label: "Betten aktiv",  value: totalActiveBeds, cls: "stat-card-violet", icon: "🧽", link: "/" },
          { label: "Zimmer offen",  value: totalOpenRooms,  cls: "stat-card-blue",   icon: "🚪", link: "/rooms" },
          { label: "Zentral offen", value: totalZentral,    cls: "stat-card-teal",   icon: "🏥", link: "/zentral" },
        ].map(({ label, value, cls, icon, link }) => (
          <Link key={label} to={link} className={`stat-card ${cls} hover:brightness-110 transition-all`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-num text-mono-num">{value}</div>
          </Link>
        ))}
      </div>

      {/* Stationen nach Bereich */}
      {Object.entries(byArea).map(([area, areaStations]) => {
        const activeStations = areaStations.filter(
          (s) => s.open_beds + s.active_beds + s.open_rooms + s.active_rooms > 0
        );
        if (activeStations.length === 0) return null;
        return (
        <section key={area}>
          <h2 className="font-display text-base font-semibold text-slate-500 mb-2">{area}</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {areaStations
              .filter((s) => s.open_beds + s.active_beds + s.open_rooms + s.active_rooms > 0)
              .sort((a, b) => b.score - a.score)
              .map((s) => {
                return (
                  <div key={s.id}
                    className={`card !p-3 flex items-center gap-3 flex-wrap ${
                      s.score >= 6 ? "border-l-4 border-red-400" :
                      s.score >= 3 ? "border-l-4 border-amber-400" : ""
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{s.name}</div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {s.open_beds > 0 && (
                        <Link to={`/stations/${s.id}`}
                          className="badge bg-amber-100 text-amber-700 text-xs hover:bg-amber-200">
                          🔔 {s.open_beds} Bett{s.open_beds !== 1 ? "en" : ""}
                        </Link>
                      )}
                      {s.active_beds > 0 && (
                        <Link to={`/stations/${s.id}`}
                          className="badge bg-violet-100 text-violet-700 text-xs hover:bg-violet-200">
                          🧽 {s.active_beds} aktiv
                        </Link>
                      )}
                      {s.open_rooms > 0 && (
                        <Link to={`/rooms/stations/${s.id}`}
                          className="badge bg-blue-100 text-blue-700 text-xs hover:bg-blue-200">
                          🚪 {s.open_rooms} Zimmer
                        </Link>
                      )}
                      <ScoreBadge score={s.score} />
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
        );
      })}

      {stations.length > 0 && !stations.some(s => s.open_beds + s.active_beds + s.open_rooms + s.active_rooms > 0) && (
        <div className="card text-center py-12 text-emerald-600">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-medium">Alle Stationen erledigt – nichts zu tun!</div>
        </div>
      )}
      {stations.length === 0 && (
        <div className="card text-center py-12 text-slate-400">
          Keine Stationen im zugewiesenen Bereich.
        </div>
      )}

      {/* O2 Lagerbestand-Warnung */}
      {(() => {
        const volllager = o2Bestand.filter(b => b.status === "volllager").reduce((s, b) => s + b.anzahl, 0);
        if (volllager === 0 && o2Bestand.length > 0) return (
          <div className="card border-l-4 border-red-400 bg-red-50 flex items-center gap-3 !p-4">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="font-semibold text-red-800">Volllager leer!</p>
              <p className="text-sm text-red-600">Keine vollen Sauerstoffflaschen im Lager – Wareneingang prüfen.</p>
            </div>
          </div>
        );
        if (volllager > 0 && volllager <= 5) return (
          <div className="card border-l-4 border-amber-400 bg-amber-50 flex items-center gap-3 !p-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Lagerbestand niedrig: {volllager} volle Flasche(n)</p>
              <p className="text-sm text-amber-600">Bald Wareneingang einplanen.</p>
            </div>
          </div>
        );
        return null;
      })()}

      {/* O2 Anfragen */}
      {o2Anfragen.length > 0 && (
        <section>
          <h2 className="font-display text-base font-semibold text-slate-500 mb-2">
            💨 Offene Sauerstoff-Anfragen ({o2Anfragen.length})
          </h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {o2Anfragen.map(a => (
              <Link key={a.id} to="/oxygen-transport"
                className={`card !p-3 flex items-center gap-3 hover:shadow-md transition-shadow ${
                  a.status === "offen" ? "border-l-4 border-amber-400" : "border-l-4 border-blue-400"
                }`}>
                <span className="text-xl">{a.status === "offen" ? "⏳" : "🚚"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{a.anzahl}× {a.typ_name ?? "Flasche"}</p>
                  <p className="text-xs text-slate-500">📍 {a.station_name ?? "–"}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  a.status === "offen" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                }`}>
                  {a.status === "offen" ? "Offen" : "Unterwegs"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
