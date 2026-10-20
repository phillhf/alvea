import { useToast } from "../contexts/ToastContext";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";
import { useAuth } from "../contexts/AuthContext";

interface WaescheAnfrage {
  id: string;
  status: string;
  station_name: string | null;
  notiz: string | null;
  erstellt_von_name: string | null;
  created_at: string;
  artikel: { id: string; typ_name: string | null; anzahl: number; geliefert_anzahl: number }[];
}

interface ZentralTask {
  id: string;
  status: string;
  cleaning_type: string;
  is_iso: number;
  pathogens: string[];
  bed_type_name: string | null;
  aufbereitungsart_name: string | null;
  scanned_barcode: string | null;
  assigned_to_name: string | null;
  assigned_to: string | null;
  priority: number;
  created_at: string;
}

interface DefectModalProps {
  barcode: string | null;
  bedTypeName: string | null;
  onClose: () => void;
}

const SEVERITIES = [
  { value: "low",      label: "🟢 Niedrig",  desc: "Kleine Mängel" },
  { value: "medium",   label: "🟡 Mittel",    desc: "Eingeschränkt nutzbar" },
  { value: "high",     label: "🟠 Hoch",      desc: "Stark eingeschränkt" },
  { value: "critical", label: "🔴 Kritisch",  desc: "Sofort außer Betrieb" },
] as const;

function DefectModal({ barcode, bedTypeName, onClose }: DefectModalProps) {
  const toast = useToast();
  const [title, setTitle]       = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [saving, setSaving]     = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post("/defects", {
        scanned_barcode: barcode || undefined,
        title: title.trim(),
        severity,
      });
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md w-full max-w-md space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold">🔧 Defekt melden</h2>
            {barcode && (
              <div className="font-mono text-xs text-slate-400 mt-0.5">🏷 {barcode}</div>
            )}
            {bedTypeName && (
              <div className="text-sm text-slate-500">{bedTypeName}</div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div>
          <label className="label">Was ist defekt? *</label>
          <input
            className="input"
            placeholder="z. B. Seitengitter defekt, Bremse blockiert"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map(({ value, label, desc }) => (
            <button key={value} type="button"
              onClick={() => setSeverity(value)}
              className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                severity === value
                  ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]"
                  : "border-slate-200 hover:border-slate-300"
              }`}>
              <div className="font-medium text-xs">{label}</div>
              <div className="text-xs text-slate-400">{desc}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={saving || !title.trim()} className="btn-primary flex-1">
            {saving ? "Speichern…" : "Defekt melden"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  offen:          "bg-amber-100 text-amber-800",
  laufend:        "bg-violet-100 text-violet-700",
  abgeschlossen:  "bg-emerald-100 text-emerald-700",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000;
  if (diff < 60)   return `${Math.round(diff)} Min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} Std.`;
  return `${Math.round(diff / 1440)} T.`;
}

function TaskCard({ task, onClaim, onReportDefect }: {
  task: ZentralTask;
  onClaim: (id: string) => void;
  onReportDefect: (barcode: string | null, bedTypeName: string | null) => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const mine = task.assigned_to === user?.id;
  const isIso = !!task.is_iso;

  return (
    <div
      className={`card flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow ${isIso ? "border-l-4 border-red-400" : ""}`}
      onClick={() => nav(`/tasks/${task.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              {task.bed_type_name ?? "Unbekannter Bett-Typ"}
            </span>
            {isIso && (
              <span className="badge bg-red-100 text-red-700 text-xs">⚠️ ISO</span>
            )}
            <span className={`badge text-xs ${STATUS_COLOR[task.status] ?? "bg-slate-100 text-slate-600"}`}>
              {task.status === "offen" ? "Offen" : task.status === "laufend" ? "In Arbeit" : "Fertig"}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">
            {task.aufbereitungsart_name ?? task.cleaning_type}
            {task.scanned_barcode && (
              <div className="text-xs font-mono text-slate-400">🏷 {task.scanned_barcode}</div>
            )}
            {task.pathogens?.length > 0 && (
              <span className="ml-2 text-orange-600">· {task.pathogens.join(", ")}</span>
            )}
          </div>
          {task.assigned_to_name && (
            <div className="text-xs text-slate-400 mt-0.5">👤 {task.assigned_to_name}</div>
          )}
        </div>
        <div className="text-xs text-slate-400 shrink-0">⏱ {timeAgo(task.created_at)}</div>
      </div>

      <div className="flex gap-2 mt-auto pt-1 justify-end">
        <button
          className="btn-ghost !py-1 !px-2 text-xs text-orange-600 hover:bg-orange-50"
          onClick={(e) => { e.stopPropagation(); onReportDefect(task.scanned_barcode, task.bed_type_name); }}
        >
          🔧 Defekt
        </button>

        {task.status === "offen" && (
          <button
            className="btn-primary !py-1.5 !px-3 text-sm"
            onClick={(e) => { e.stopPropagation(); onClaim(task.id); }}
          >
            › Annehmen
          </button>
        )}
        {task.status === "laufend" && mine && (
          <Link
            to={`/tasks/${task.id}`}
            className="btn-primary !py-1.5 !px-3 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            › Weiterbearbeiten
          </Link>
        )}
      </div>
    </div>
  );
}

export default function BedZentral() {
  const toast = useToast();
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const nav = useNavigate();
  const { touch, label: updatedLabel } = useLastUpdated();
  const [tasks, setTasks] = useState<ZentralTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("all");
  const [defectModal, setDefectModal] = useState<{ barcode: string | null; bedTypeName: string | null } | null>(null);
  const [waescheAnfragen, setWaescheAnfragen] = useState<WaescheAnfrage[]>([]);
  const [waescheModal, setWaescheModal] = useState<WaescheAnfrage | null>(null);

  async function refresh() {
    try {
      const r = await api.get<ZentralTask[]>("/tasks?category=bed_cleaning_zentral");
      setTasks(r.data);
    } catch { setTasks([]); }
    if (can("waesche") || can("verwaltung")) {
      api.get<WaescheAnfrage[]>("/waesche/anfragen").then(w => setWaescheAnfragen(w.data)).catch(() => {});
    }
    setLoading(false);
    touch();
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  async function claim(taskId: string) {
    try {
      await api.post(`/tasks/${taskId}/claim`);
      nav(`/tasks/${taskId}`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    }
  }

  if (loading) return <div className="text-slate-500">{t("common.loading")}</div>;

  const filtered = tasks.filter((t) => {
    if (filter === "open") return t.status === "offen";
    if (filter === "mine") return t.assigned_to === user?.id;
    return true;
  });

  const open       = filtered.filter((t) => t.status === "offen");
  const inProgress = filtered.filter((t) => t.status === "laufend");
  const done       = filtered.filter((t) => t.status === "abgeschlossen");

  return (
    <div className="space-y-6">
      {defectModal && (
        <DefectModal
          barcode={defectModal.barcode}
          bedTypeName={defectModal.bedTypeName}
          onClose={() => setDefectModal(null)}
        />
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("nav.bedsZentral")}</h1>
          <p className="text-sm text-slate-500">Zentrale Aufbereitung – alle angelieferten Betten</p>
          <LiveIndicator label={updatedLabel} />
        </div>
        {can("auftraege_erstellen") && (
          <Link to="/zentral/new" className="btn-primary">
            + {t("task.newZentralTask")}
          </Link>
        )}
      </div>

      {/* Filterleiste */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        {([
          { key: "all",  label: `Alle (${tasks.length})` },
          { key: "open", label: `Offen (${tasks.filter(tx => tx.status === "offen").length})` },
          { key: "mine", label: `Meine (${tasks.filter(tx => tx.assigned_to === user?.id).length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === key
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {open.length === 0 && inProgress.length === 0 && done.length === 0 && (
        <div className="card text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">🛏️</div>
          <div>Keine Aufträge vorhanden.</div>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            🔔 Offen ({open.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {open.map((t) => (
              <TaskCard key={t.id} task={t} onClaim={claim}
                onReportDefect={(b, bt) => setDefectModal({ barcode: b, bedTypeName: bt })} />
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            🔄 In Arbeit ({inProgress.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inProgress.map((t) => (
              <TaskCard key={t.id} task={t} onClaim={claim}
                onReportDefect={(b, bt) => setDefectModal({ barcode: b, bedTypeName: bt })} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 text-slate-500">
            ✅ Abgeschlossen ({done.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-70">
            {done.map((t) => (
              <TaskCard key={t.id} task={t} onClaim={claim}
                onReportDefect={(b, bt) => setDefectModal({ barcode: b, bedTypeName: bt })} />
            ))}
          </div>
        </section>
      )}

      {/* ── Wäsche-Anfragen ── */}
      {(can("waesche") || can("verwaltung")) && waescheAnfragen.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            🛏 Kissen & Bettdecken
            {waescheAnfragen.filter(a => a.status === "offen").length > 0 && (
              <span className="ml-2 text-sm font-normal text-amber-600">
                ({waescheAnfragen.filter(a => a.status === "offen").length} offen)
              </span>
            )}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {waescheAnfragen.map(a => {
              const statusStyle =
                a.status === "erledigt"   ? "border-emerald-300 bg-emerald-50" :
                a.status === "angenommen" ? "border-blue-300 bg-blue-50" :
                                            "border-amber-300 bg-amber-50";
              const badgeStyle =
                a.status === "erledigt"   ? "bg-emerald-100 text-emerald-700" :
                a.status === "angenommen" ? "bg-blue-100 text-blue-700" :
                                            "bg-amber-100 text-amber-800";
              return (
                <div key={a.id} className={`card !p-4 border-2 ${statusStyle}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs text-slate-500">{a.station_name ?? "–"}</p>
                      <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString("de-DE")}</p>
                      {a.erstellt_von_name && <p className="text-xs text-slate-400">👤 {a.erstellt_von_name}</p>}
                    </div>
                    <span className={`badge text-xs ${badgeStyle}`}>
                      {a.status === "offen" ? "Offen" : a.status === "angenommen" ? "Angenommen" : "Erledigt"}
                    </span>
                  </div>
                  <div className="space-y-1 mb-3">
                    {a.artikel.map((ar, i) => (
                      <div key={i} className="text-sm flex justify-between">
                        <span className="font-medium">{ar.typ_name ?? "–"}</span>
                        <span className="text-slate-600">
                          {ar.anzahl} angefordert · <span className="font-semibold">{ar.geliefert_anzahl} geliefert</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {a.notiz && <p className="text-xs text-slate-500 italic mb-2">💬 {a.notiz}</p>}
                  {a.status !== "erledigt" && (
                    <button className="btn-primary !py-1.5 !px-3 text-sm w-full"
                      onClick={() => setWaescheModal(a)}>
                      {a.status === "offen" ? "Annehmen & Bearbeiten" : "Bearbeiten / Erledigen"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Wäsche-Bearbeitungs-Modal */}
      {waescheModal && (
        <WaescheBearbeitungModal
          anfrage={waescheModal}
          onClose={() => setWaescheModal(null)}
          onSaved={() => { setWaescheModal(null); refresh(); }}
        />
      )}
    </div>
  );
}

interface WaescheBearbeitungModalProps {
  anfrage: WaescheAnfrage;
  onClose: () => void;
  onSaved: () => void;
}
function WaescheBearbeitungModal({ anfrage, onClose, onSaved }: WaescheBearbeitungModalProps) {
  const toast = useToast();
  const [mengen, setMengen] = useState<Record<string, number>>(
    Object.fromEntries(anfrage.artikel.map(a => [a.id, a.geliefert_anzahl > 0 ? a.geliefert_anzahl : a.anzahl]))
  );
  const [saving, setSaving] = useState(false);

  async function handleStatus(status: "angenommen" | "erledigt") {
    setSaving(true);
    try {
      await api.patch(`/waesche/anfragen/${anfrage.id}/status`, {
        status,
        artikel: anfrage.artikel.map(a => ({ id: a.id, geliefert_anzahl: mengen[a.id] ?? a.anzahl })),
      });
      toast.success(status === "erledigt" ? "Anfrage erledigt." : "Anfrage angenommen.");
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md w-full max-w-md">
        <div className="modal-header-colored modal-header-blue flex items-center gap-3">
          <span className="modal-icon-badge modal-icon-blue">🛏</span>
          <div>
            <h2 className="font-display text-base font-medium">Wäsche-Anfrage bearbeiten</h2>
            <p className="text-xs text-blue-700/70">{anfrage.station_name ?? "–"}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">Gelieferte Menge pro Artikel anpassen:</p>
          {anfrage.artikel.map(a => (
            <div key={a.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm font-medium">{a.typ_name ?? "–"}</span>
              <span className="text-xs text-slate-400">{a.anzahl} angefordert</span>
              <input type="number" min={0} className="input w-24 text-sm text-center"
                value={mengen[a.id] ?? a.anzahl}
                onChange={e => setMengen(p => ({ ...p, [a.id]: parseInt(e.target.value) || 0 }))} />
              <span className="text-xs text-slate-400 w-16">geliefert</span>
            </div>
          ))}
          {anfrage.notiz && <p className="text-xs text-slate-500 italic">💬 {anfrage.notiz}</p>}
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-2">
          {anfrage.status === "offen" && (
            <button className="btn-outline flex-1" onClick={() => handleStatus("angenommen")} disabled={saving}>
              Annehmen
            </button>
          )}
          <button className="btn-primary flex-1" onClick={() => handleStatus("erledigt")} disabled={saving}>
            {saving ? "…" : "✅ Erledigt"}
          </button>
          <button className="btn-ghost flex-1" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
