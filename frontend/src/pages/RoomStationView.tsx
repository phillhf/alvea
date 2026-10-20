import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";
import { alertDialog } from "../components/Dialog";

interface Task {
  id: string; status: string; cleaning_type: string;
  room_id: string; room_number: string;
  assigned_to: string | null; assigned_to_name: string | null;
  priority: number; created_at: string; pathogens: string[];
  wunschtermin?: string | null;
  bestaetigt_termin?: string | null;
  aufbereitungsart_name?: string | null;
}
interface Room { id: string; room_number: string }

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000;
  if (diff < 60)   return `${Math.round(diff)} Min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} Std.`;
  return `${Math.round(diff / 1440)} T.`;
}

const STATUS_INFO: Record<string, { label: string; color: string; icon: string }> = {
  offen:         { label: "Angefordert", color: "bg-amber-100 text-amber-800",   icon: "🔔" },
  unterwegs:     { label: "Unterwegs",   color: "bg-blue-100 text-blue-800",     icon: "🚶" },
  angekommen:    { label: "Angekommen",  color: "bg-indigo-100 text-indigo-800", icon: "📍" },
  laufend:       { label: "In Arbeit",   color: "bg-violet-100 text-violet-700", icon: "🧽" },
  abgeschlossen: { label: "Fertig",      color: "bg-emerald-100 text-emerald-700", icon: "✅" },
};

const CLEANING_LABEL: Record<string, string> = {
  standard:          "🧹 Standardreinigung",
  schlussdesinfektion: "🔴 Schlussdesinfektion",
};

export default function RoomStationView() {
  const { id } = useParams();
  const { t: tr } = useTranslation();
  const { user, can } = useAuth();
  const nav = useNavigate();
  const [rooms, setRooms]       = useState<Room[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [stationName, setStationName] = useState("");
  const [loading, setLoading]   = useState(true);
  const { touch, label: updatedLabel } = useLastUpdated();

  async function refresh() {
    const [rRes, tRes, sRes] = await Promise.all([
      api.get<Room[]>(`/rooms?station_id=${id}`),
      api.get<Task[]>(`/tasks?station_id=${id}&category=room_cleaning`),
      api.get(`/stations`),
    ]);
    setRooms(rRes.data);
    setTasks(tRes.data);
    const st = (sRes.data as any[]).find((x) => x.id === id);
    if (st) setStationName(st.name);
    setLoading(false);
    touch();
  }
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 10000);
    return () => clearInterval(i);
  }, [id]);

  async function claim(taskId: string) {
    try {
      await api.post(`/tasks/${taskId}/claim`);
      nav(`/tasks/${taskId}`);
    } catch (e: any) {
      alertDialog(e.response?.data?.error || "Fehler");
    }
  }

  if (loading) return <div className="text-slate-500">{tr("common.loading")}</div>;

  const canCreate = can("auftraege_erstellen");

  // Aufträge nach Raum gruppieren (nur aktive)
  const tasksByRoom = tasks.reduce<Record<string, Task>>((acc, t) => {
    if (t.status !== "abgeschlossen") acc[t.room_id] = t;
    return acc;
  }, {});

  // Statistiken
  const totalTasks  = tasks.filter(t => t.status !== "abgeschlossen").length;
  const openTasks   = tasks.filter(t => t.status === "offen");
  const activeTasks = tasks.filter(t => ["unterwegs","angekommen","laufend"].includes(t.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link to="/rooms" className="text-sm text-slate-500 hover:underline">
            ← {tr("common.back")}
          </Link>
          <h1 className="font-display text-2xl font-bold">{stationName}</h1>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-sm text-slate-500">{tr("nav.rooms")}</span>
            {totalTasks > 0 && (
              <span className="badge bg-amber-100 text-amber-800 text-xs">{totalTasks} {totalTasks === 1 ? "aktiver Auftrag" : "aktive Aufträge"}</span>
            )}
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
        {canCreate && (
          <Link to={`/stations/${id}/new-room`} className="btn-primary">
            + {tr("task.newRoomTask")}
          </Link>
        )}
      </div>

      {/* Schnellaktion: Offene Aufträge */}
      {openTasks.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            🔔 Offen &amp; nicht angenommen ({openTasks.length})
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {openTasks.map((x) => (
              <div key={x.id} className={`card flex flex-col gap-2 ${x.cleaning_type === "schlussdesinfektion" ? "border-l-4 border-red-400" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">Zimmer {x.room_number}</div>
                    <div className="text-sm text-slate-500">
                      {CLEANING_LABEL[x.cleaning_type] ?? x.cleaning_type}
                    </div>
                    {x.pathogens?.length > 0 && (
                      <div className="text-xs text-orange-600 mt-0.5">⚠️ {x.pathogens.join(", ")}</div>
                    )}
                  </div>
                  {x.priority === 1 && (
                    <span className="badge bg-red-100 text-red-700 text-xs">Hoch</span>
                  )}
                </div>
                {/* Wunschtermin */}
                {x.wunschtermin && (
                  <TerminKonfirmation task={x} onSaved={refresh} />
                )}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs text-slate-400">⏱ {timeAgo(x.created_at)}</span>
                  <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={() => claim(x.id)}>
                    › Annehmen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* In Bearbeitung */}
      {activeTasks.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            🧽 In Bearbeitung ({activeTasks.length})
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {activeTasks.map((x) => {
              const info = STATUS_INFO[x.status];
              return (
                <Link key={x.id} to={`/tasks/${x.id}`}
                  className="card hover:shadow-md transition-shadow flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">Zimmer {x.room_number}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {CLEANING_LABEL[x.cleaning_type] ?? x.cleaning_type}
                    </div>
                    {x.assigned_to_name && (
                      <div className="text-xs text-slate-400 mt-0.5">👤 {x.assigned_to_name}</div>
                    )}
                  </div>
                  <span className={`badge text-xs shrink-0 ${info?.color}`}>
                    {info?.icon} {info?.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Zimmer-Übersicht mit Status-Badges */}
      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Alle Zimmer</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {rooms.map((r) => {
            const task = tasksByRoom[r.id];
            const info = task ? STATUS_INFO[task.status] : null;
            const isSchluss = task?.cleaning_type === "schlussdesinfektion";
            return (
              <div
                key={r.id}
                onClick={() => task && nav(`/tasks/${task.id}`)}
                className={`card !p-3 transition-shadow ${task ? "cursor-pointer hover:shadow-md" : ""} ${isSchluss ? "border-l-4 border-red-400" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">Zi. {r.room_number}</div>
                  {info ? (
                    <span className={`badge text-xs ${info.color}`}>
                      {info.icon} {info.label}
                    </span>
                  ) : (
                    <span className="badge bg-emerald-50 text-emerald-600 text-xs">✓ Frei</span>
                  )}
                </div>
                {task?.cleaning_type && (
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {task.cleaning_type === "schlussdesinfektion" ? "Schlussdesinf." : "Standardreinigung"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {rooms.length === 0 && (
        <div className="card text-center py-10 text-slate-400">
          Keine Zimmer auf dieser Station angelegt.
        </div>
      )}
    </div>
  );
}

function TerminKonfirmation({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [datum, setDatum] = useState(
    task.bestaetigt_termin
      ? task.bestaetigt_termin.slice(0, 10)
      : task.wunschtermin!.slice(0, 10)
  );
  const [zeit, setZeit] = useState(
    task.bestaetigt_termin
      ? task.bestaetigt_termin.slice(11, 16)
      : task.wunschtermin!.slice(11, 16)
  );
  const [saving, setSaving] = useState(false);

  function fmt(iso: string) {
    return new Date(iso.replace(" ", "T")).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        bestaetigt_termin: `${datum}T${zeit || "00:00"}`,
      });
      setEditMode(false);
      onSaved();
    } finally { setSaving(false); }
  }

  if (task.bestaetigt_termin && !editMode) {
    return (
      <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2 text-sm">
        <span className="text-emerald-700 font-medium">✅ {fmt(task.bestaetigt_termin)}</span>
        <button className="text-xs text-slate-400 hover:text-slate-600 ml-2" onClick={() => setEditMode(true)}>
          ändern
        </button>
      </div>
    );
  }

  if (!editMode) {
    return (
      <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 text-sm">
        <span className="text-amber-700">⏳ Wunsch: {fmt(task.wunschtermin!)}</span>
        <button className="text-xs text-white rounded px-2 py-1 ml-2 font-medium"
          style={{ backgroundColor: "var(--brand-600)" }}
          onClick={() => setEditMode(true)}>
          Bestätigen
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-slate-600">Termin bestätigen:</p>
      <div className="flex gap-2">
        <input type="date" className="input flex-1 !py-1.5 text-sm" value={datum}
          onChange={e => setDatum(e.target.value)} />
        <input type="time" className="input w-24 !py-1.5 text-sm" value={zeit}
          onChange={e => setZeit(e.target.value)} />
        <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={save} disabled={saving || !datum}>
          {saving ? "…" : "✓"}
        </button>
        <button className="btn-ghost !py-1.5 !px-2 text-sm" onClick={() => setEditMode(false)}>✕</button>
      </div>
    </div>
  );
}
