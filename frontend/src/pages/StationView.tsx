import { useEffect, useState } from "react";
import { SkeletonList } from "../components/Skeleton";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";

interface Bed {
  id: string; bed_number: string; room_number: string; status: string;
  bed_type_name: string | null; barcode: string | null;
}
interface Task {
  id: string; category: string; status: string; cleaning_type: string;
  bed_number?: string; room_number: string; assigned_to: string | null;
  assigned_to_name: string | null; pathogens: string[];
  priority: number; created_at: string;
}

const BED_STATUS_COLOR: Record<string, string> = {
  frei:           "bg-slate-100 text-slate-600",
  belegt:         "bg-blue-100 text-blue-700",
  angefordert:    "bg-amber-100 text-amber-800",
  unterwegs:      "bg-indigo-100 text-indigo-700",
  angekommen:     "bg-yellow-100 text-yellow-800",
  in_bearbeitung: "bg-violet-100 text-violet-700",
  bereit:         "bg-emerald-100 text-emerald-700",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000;
  if (diff < 60)   return `${Math.round(diff)} Min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} Std.`;
  return `${Math.round(diff / 1440)} T.`;
}

function calcTaskScore(task: Task, prioSettings: { base: number; minutes: number; bonus: number }): number {
  const ageMin = (Date.now() - new Date(task.created_at.replace(" ", "T") + "Z").getTime()) / 60000;
  const isInfectious = task.cleaning_type === "infektioes" || task.cleaning_type === "schlussdesinfektion";
  return prioSettings.base + (ageMin / prioSettings.minutes) + (isInfectious ? prioSettings.bonus : 0);
}

function ScoreBadge({ score, yellow, red }: { score: number; yellow: number; red: number }) {
  const color = score >= red ? "bg-red-100 text-red-700" : score >= yellow ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700";
  return <span className={`badge text-xs font-mono ${color}`}>{score.toFixed(1)} P</span>;
}

function TaskCard({ task, onAction, prioSettings, prioYellow, prioRed }: {
  task: Task; onAction: () => void;
  prioSettings: { base: number; minutes: number; bonus: number };
  prioYellow: number; prioRed: number;
}) {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const mine = task.assigned_to === user?.id;
  const isInfectious = task.cleaning_type === "infektioes";
  const score = calcTaskScore(task, prioSettings);
  const canAct = can("bettenaufbereitung") || can("verwaltung");

  async function handleClaim() {
    try { await api.post(`/tasks/${task.id}/claim`); nav(`/tasks/${task.id}`); }
    catch (e: any) { alert(e.response?.data?.error || "Fehler"); }
  }

  return (
    <div className={`card flex flex-col gap-2 ${isInfectious ? "border-l-4 border-red-400" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            Zi. {task.room_number}
            {task.bed_number && <span className="text-slate-500"> · Stellplatz {task.bed_number}</span>}
          </div>
          <div className="text-sm">
            {isInfectious
              ? <span className="text-red-600 font-medium">⚠️ Infektiöse Aufbereitung</span>
              : <span className="text-slate-500">Normale Bettenaufbereitung</span>}
          </div>
          {task.assigned_to_name && (
            <div className="text-xs text-slate-500 mt-0.5">👤 {task.assigned_to_name}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <ScoreBadge score={score} yellow={prioYellow} red={prioRed} />
          <StatusBadge status={task.status} />
        </div>
      </div>

      {task.pathogens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.pathogens.map((p) => (
            <span key={p} className="badge bg-red-100 text-red-700 font-mono text-[11px]">{p}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span className="text-xs text-slate-500">⏱ {timeAgo(task.created_at)}</span>
        <div className="flex gap-1">
          <Link to={`/tasks/${task.id}`} className="btn-ghost !py-1 text-xs">Details</Link>
          {task.status === "offen" && canAct && (
            <button className="btn-primary !py-1 text-xs" onClick={handleClaim}>
              🚶 Auf dem Weg
            </button>
          )}
          {mine && canAct && task.status === "unterwegs" && (
            <button className="btn-primary !py-1 text-xs" onClick={async () => {
              await api.patch(`/tasks/${task.id}`, { status: "angekommen" }); onAction();
            }}>📍 Angekommen</button>
          )}
          {mine && canAct && task.status === "angekommen" && (
            <button className="btn-primary !py-1 text-xs" onClick={() => nav(`/tasks/${task.id}`)}>
              ✋ Annehmen
            </button>
          )}
          {mine && canAct && task.status === "laufend" && (
            <button className="btn-success !py-1 text-xs" onClick={() => nav(`/tasks/${task.id}`)}>
              ✓ Erledigen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    offen: "bg-slate-100 text-slate-600",
    unterwegs: "bg-blue-100 text-blue-700",
    angekommen: "bg-yellow-100 text-yellow-700",
    laufend: "bg-orange-100 text-orange-700",
    abgeschlossen: "bg-green-100 text-green-700",
  };
  const labels: Record<string, string> = {
    offen: "Offen", unterwegs: "Auf dem Weg",
    angekommen: "Angekommen", laufend: "In Arbeit", abgeschlossen: "Abgeschlossen",
  };
  return (
    <span className={`badge ${colors[status] ?? "bg-slate-100"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function StationView() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const [beds, setBeds] = useState<Bed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stationName, setStationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [prioSettings, setPrioSettings] = useState({ base: 1, minutes: 60, bonus: 1.5 });
  const [prioYellow, setPrioYellow] = useState(3);
  const [prioRed, setPrioRed] = useState(6);
  const { touch, label: updatedLabel } = useLastUpdated();

  async function arrivedAll() {
    await api.post(`/stations/${id}/arrived`);
    refresh();
  }
  async function leaveAll() {
    if (!confirm("Station verlassen? Alle nicht gestarteten Aufträge werden freigegeben.")) return;
    await api.post(`/stations/${id}/leave`);
    refresh();
  }

  async function refresh() {
    const [bRes, tRes, sRes, settRes] = await Promise.all([
      api.get<Bed[]>(`/beds?station_id=${id}`),
      api.get<Task[]>(`/tasks?station_id=${id}&category=bed_cleaning`),
      api.get(`/stations`),
      api.get(`/settings/prio`).catch(() => ({ data: null })),
    ]);
    setBeds(bRes.data);
    setTasks(tRes.data);
    const st = (sRes.data as any[]).find((x) => x.id === id);
    if (st) { setStationName(st.name); setMyStatus(st.my_status ?? null); }
    if (settRes.data) {
      setPrioSettings({
        base:    parseFloat(settRes.data.prio_base    ?? "1"),
        minutes: parseFloat(settRes.data.prio_minutes ?? "60"),
        bonus:   parseFloat(settRes.data.prio_bonus   ?? "1.5"),
      });
      setPrioYellow(parseFloat(settRes.data.prio_color_yellow ?? "3"));
      setPrioRed(parseFloat(settRes.data.prio_color_red       ?? "6"));
    }
    setLoading(false);
    touch();
  }

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 10000);
    return () => clearInterval(i);
  }, [id]);

  if (loading) return <div className="p-4 space-y-3"><SkeletonList count={3} /></div>;

  const canCreate  = can("auftraege_erstellen");
  const canActStation = can("bettenaufbereitung") || can("verwaltung");

  // Aufträge nach Status gruppieren
  const offene      = tasks.filter((t) => t.status === "offen");
  const unterwegs   = tasks.filter((t) => t.status === "unterwegs");
  const angekommen  = tasks.filter((t) => t.status === "angekommen");
  const laufend     = tasks.filter((t) => t.status === "laufend");
  const done        = tasks.filter((t) => t.status === "abgeschlossen");

  const activeCount = offene.length + unterwegs.length + angekommen.length + laufend.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:underline">← Zurück</Link>
          <h1 className="font-display text-2xl font-bold">{stationName}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-500">{activeCount} aktive Aufträge</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canActStation && myStatus === "unterwegs" && (
            <>
              <button className="btn-primary" onClick={arrivedAll}>
                📍 Auf der Station angekommen
              </button>
              <button className="btn-danger" onClick={leaveAll}>
                ↩ Doch nicht – zurück
              </button>
            </>
          )}
          {canActStation && (myStatus === "angekommen" || myStatus === "laufend") && (
            <button className="btn-ghost" onClick={leaveAll}>
              ↩ Station verlassen
            </button>
          )}
          {canCreate && (
            <>
              <Link to={`/stations/${id}/new-bed`}  className="btn-primary">+ Bettenaufbereitung</Link>
              <Link to={`/stations/${id}/new-room`} className="btn-ghost">+ Zimmerreinigung</Link>
            </>
          )}
        </div>
      </div>

      {/* Workflow-Übersicht */}
      {activeCount === 0 && done.length === 0 && (
        <div className="card text-slate-500">Keine Aufträge auf dieser Station.</div>
      )}

      {/* 1. Offene Aufträge – höchste Prio */}
      {offene.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            🔔 Offene Aufträge
            <span className="badge bg-amber-100 text-amber-700">{offene.length}</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {offene.map((t) => <TaskCard key={t.id} task={t} onAction={refresh} prioSettings={prioSettings} prioYellow={prioYellow} prioRed={prioRed} />)}
          </div>
        </section>
      )}

      {/* 2. Auf dem Weg */}
      {unterwegs.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            🚶 Auf dem Weg
            <span className="badge bg-blue-100 text-blue-700">{unterwegs.length}</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {unterwegs.map((t) => <TaskCard key={t.id} task={t} onAction={refresh} prioSettings={prioSettings} prioYellow={prioYellow} prioRed={prioRed} />)}
          </div>
        </section>
      )}

      {/* 3. Angekommen */}
      {angekommen.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            📍 Auf der Station
            <span className="badge bg-yellow-100 text-yellow-700">{angekommen.length}</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {angekommen.map((t) => <TaskCard key={t.id} task={t} onAction={refresh} prioSettings={prioSettings} prioYellow={prioYellow} prioRed={prioRed} />)}
          </div>
        </section>
      )}

      {/* 4. In Arbeit */}
      {laufend.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            🧽 In Bearbeitung
            <span className="badge bg-orange-100 text-orange-700">{laufend.length}</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {laufend.map((t) => <TaskCard key={t.id} task={t} onAction={refresh} prioSettings={prioSettings} prioYellow={prioYellow} prioRed={prioRed} />)}
          </div>
        </section>
      )}

      {/* Abgeschlossene (heute) */}
      {done.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2 text-slate-500">
            ✅ Heute abgeschlossen
            <span className="badge bg-green-100 text-green-700">{done.length}</span>
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {done.map((t) => (
              <Link key={t.id} to={`/tasks/${t.id}`}
                    className="card !p-3 hover:shadow text-sm text-slate-500">
                Zi. {t.room_number}{t.bed_number ? ` · Bett ${t.bed_number}` : ""}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Alle Betten */}
      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Alle Betten</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {beds.map((b) => (
            <div key={b.id} className="card !p-3">
              <div className="flex items-center justify-between gap-1">
                <div>
                  <div className="font-medium text-sm">Zi. {b.room_number} · {b.bed_number}</div>
                  {b.bed_type_name && <div className="text-[11px] text-slate-500">{b.bed_type_name}</div>}
                  {b.barcode && <div className="text-[10px] font-mono text-slate-400">📦 {b.barcode}</div>}
                </div>
                <span className={`badge text-xs ${BED_STATUS_COLOR[b.status] ?? "bg-slate-100"}`}>
                  {{ frei: "Frei", belegt: "Belegt", angefordert: "Angefordert",
                     unterwegs: "Unterwegs", angekommen: "Angekommen",
                     in_bearbeitung: "In Arbeit", bereit: "Bereit" }[b.status] ?? b.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
