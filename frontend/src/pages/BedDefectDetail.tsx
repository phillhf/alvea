import { useToast } from "../contexts/ToastContext";
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const SEVERITY_LABEL: Record<string, string> = {
  low: "Niedrig", medium: "Mittel", high: "Hoch", critical: "Kritisch",
};
const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-600", medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
};

const STATUS_FLOW: Record<string, { next: string; label: string; btnClass: string }[]> = {
  gemeldet:     [{ next: "in_reparatur", label: "🔧 Reparatur starten", btnClass: "btn-primary" }],
  in_reparatur: [
    { next: "behoben",      label: "✅ Als behoben markieren",   btnClass: "btn-success" },
    { next: "ausgemustert", label: "🗑 Ausmustern",               btnClass: "btn-ghost !text-red-500" },
  ],
};

interface PhysicalBed {
  id: string;
  barcode: string;
  bed_type_name: string | null;
  hersteller: string | null;
  modell: string | null;
  seriennummer: string | null;
  prueftermin: string | null;
  tage_ueberfaellig: number | null;
  gesperrt: number;
  gesperrt_grund: string | null;
  last_station_name: string | null;
  last_area_name: string | null;
  last_room_number: string | null;
  last_seen: string | null;
}

function pruefAmpel(bed: PhysicalBed) {
  if (!bed.prueftermin) return null;
  const d = bed.tage_ueberfaellig ?? 0;
  if (d > 0)   return { label: `${d} Tage überfällig`, cls: "bg-red-100 text-red-700 font-semibold" };
  if (d > -30) return { label: `in ${Math.abs(d)} Tagen fällig`, cls: "bg-amber-100 text-amber-700" };
  return { label: new Date(bed.prueftermin + "T00:00:00").toLocaleDateString("de-DE"), cls: "bg-emerald-100 text-emerald-700" };
}

export default function BedDefectDetail() {
  const toast = useToast();
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const [defect, setDefect]     = useState<any>(null);
  const [physBed, setPhysBed]   = useState<PhysicalBed | null>(null);
  const [notes, setNotes]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [sperrBusy, setSperrBusy] = useState(false);
  const [sperrGrund, setSperrGrund] = useState("");
  const [showSperrInput, setShowSperrInput] = useState(false);

  async function load() {
    const r = await api.get(`/defects/${id}`);
    setDefect(r.data);
    // Physisches Bett laden wenn Barcode vorhanden
    if (r.data.scanned_barcode) {
      try {
        const pb = await api.get<PhysicalBed | null>(
          `/physical-beds/by-barcode/${encodeURIComponent(r.data.scanned_barcode)}`
        );
        setPhysBed(pb.data);
      } catch { setPhysBed(null); }
    }
  }

  useEffect(() => { load(); }, [id]);

  async function transition(status: string) {
    const labels: Record<string, string> = {
      in_reparatur: "In Reparatur", behoben: "Behoben", ausgemustert: "Ausgemustert",
    };
    if (!confirm(`Status auf "${labels[status] ?? status}" setzen?`)) return;
    setBusy(true);
    try {
      await api.patch(`/defects/${id}/status`, { status, notes: notes || undefined });
      if (["behoben", "ausgemustert"].includes(status)) nav("/instandsetzung");
      else load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Speichern – bitte erneut versuchen.");
    } finally { setBusy(false); }
  }

  async function toggleSperren() {
    if (!physBed) return;
    const sperren = !physBed.gesperrt;
    if (sperren && !showSperrInput) { setShowSperrInput(true); return; }
    if (!sperren && !confirm("Bett entsperren?")) return;
    setSperrBusy(true);
    try {
      await api.patch(`/physical-beds/${physBed.id}/sperren`, {
        gesperrt: sperren,
        grund: sperren ? (sperrGrund.trim() || undefined) : undefined,
      });
      setShowSperrInput(false);
      setSperrGrund("");
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    } finally { setSperrBusy(false); }
  }

  if (!defect) return <div className="text-slate-400">Wird geladen…</div>;

  const canManage = can("betten_reparatur") || can("verwaltung");
  const nextActions = STATUS_FLOW[defect.status] ?? [];
  const ampel = physBed ? pruefAmpel(physBed) : null;

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link to="/instandsetzung" className="text-sm text-slate-500 hover:underline">← Instandsetzung</Link>
        <h1 className="font-display text-2xl font-bold mt-1">🔧 {defect.title}</h1>
      </div>

      {/* Status + Schwere */}
      <div className="flex gap-2 flex-wrap">
        <span className={`badge ${SEVERITY_COLOR[defect.severity]}`}>
          {SEVERITY_LABEL[defect.severity]}
        </span>
        <span className="badge bg-slate-100 text-slate-700">{defect.status.replace("_"," ")}</span>
      </div>

      {/* Defekt-Details */}
      <div className="card space-y-3">
        {defect.scanned_barcode && (
          <div>
            <div className="text-xs text-slate-500">Barcode</div>
            <div className="font-mono font-semibold">{defect.scanned_barcode}</div>
          </div>
        )}
        {(defect.station_name || defect.room_number || defect.bed_number) && (
          <div>
            <div className="text-xs text-slate-500">Standort (Meldung)</div>
            <div className="font-medium">
              {[defect.station_name, defect.room_number && `Zi. ${defect.room_number}`,
                defect.bed_number && `Bett ${defect.bed_number}`].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}
        {defect.notes && (
          <div>
            <div className="text-xs text-slate-500">Notizen</div>
            <div className="text-sm text-slate-600">{defect.notes}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-2 border-t border-slate-100">
          <div>Gemeldet von: {defect.reported_by_name ?? "–"}</div>
          <div>Zuständig: {defect.assigned_to_name ?? "–"}</div>
          <div>Gemeldet: {new Date(defect.created_at.replace(" ","T")+"Z").toLocaleDateString("de-DE")}</div>
          {defect.resolved_at && (
            <div>Behoben: {new Date(defect.resolved_at.replace(" ","T")+"Z").toLocaleDateString("de-DE")}</div>
          )}
        </div>
      </div>

      {/* Bettenstamm-Info */}
      {physBed && (
        <div className={`card space-y-3 ${physBed.gesperrt ? "border-l-4 border-red-400" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">🛏 Bettenstamm</h3>
            {physBed.gesperrt
              ? <span className="badge bg-red-100 text-red-700 text-xs">🔒 Gesperrt</span>
              : <span className="badge bg-slate-100 text-slate-500 text-xs">Frei</span>
            }
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {(physBed.bed_type_name || physBed.hersteller || physBed.modell) && (
              <div className="col-span-2">
                <div className="text-xs text-slate-500">Bett</div>
                <div className="font-medium">
                  {[physBed.bed_type_name, physBed.hersteller, physBed.modell].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}
            {physBed.seriennummer && (
              <div>
                <div className="text-xs text-slate-500">Seriennummer</div>
                <div className="font-mono text-xs">{physBed.seriennummer}</div>
              </div>
            )}
            {physBed.last_station_name && (
              <div>
                <div className="text-xs text-slate-500">Letzter Standort</div>
                <div className="text-sm font-medium">
                  📍 {physBed.last_station_name}
                  {physBed.last_room_number && ` · Zi. ${physBed.last_room_number}`}
                </div>
                {physBed.last_seen && (
                  <div className="text-xs text-slate-400">
                    {new Date(physBed.last_seen.replace(" ","T")+"Z").toLocaleDateString("de-DE")}
                  </div>
                )}
              </div>
            )}
            {ampel && (
              <div>
                <div className="text-xs text-slate-500">Prüftermin</div>
                <span className={`badge text-xs ${ampel.cls}`}>{ampel.label}</span>
              </div>
            )}
            {physBed.gesperrt_grund && (
              <div className="col-span-2">
                <div className="text-xs text-slate-500">Sperrgrund</div>
                <div className="text-sm text-red-600">{physBed.gesperrt_grund}</div>
              </div>
            )}
          </div>

          {/* Sperren / Entsperren */}
          {canManage && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              {showSperrInput && !physBed.gesperrt && (
                <div className="space-y-1">
                  <label className="label">Sperrgrund <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input className="input" value={sperrGrund}
                    onChange={e => setSperrGrund(e.target.value)}
                    placeholder="z. B. Prüfung fällig, Defekt noch nicht behoben"
                    autoFocus />
                </div>
              )}
              <div className="flex gap-2">
                {physBed.gesperrt ? (
                  <button onClick={toggleSperren} disabled={sperrBusy}
                    className="btn-primary flex-1 text-sm">
                    🔓 Bett entsperren
                  </button>
                ) : showSperrInput ? (
                  <>
                    <button onClick={toggleSperren} disabled={sperrBusy}
                      className="btn-danger flex-1 text-sm">
                      {sperrBusy ? "…" : "🔒 Jetzt sperren"}
                    </button>
                    <button onClick={() => { setShowSperrInput(false); setSperrGrund(""); }}
                      className="btn-ghost text-sm">
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button onClick={toggleSperren}
                    className="btn-ghost !text-red-500 flex-1 text-sm">
                    🔒 Bett sperren
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aktionen für Reparatur-Berechtigte */}
      {canManage && nextActions.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Status ändern</h3>
          <div>
            <label className="label">Notiz zur Statusänderung <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea className="input w-full" rows={2} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z. B. Seitengitter ersetzt, Bremse repariert…" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextActions.map(({ next, label, btnClass }) => (
              <button key={next} className={`${btnClass} flex-1`}
                disabled={busy} onClick={() => transition(next)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
