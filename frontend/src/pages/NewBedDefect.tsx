import { useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { api } from "../api/client";

interface BedState {
  stationName?: string;
  roomNumber?: string;
  bedNumber?: string;
  bedTypeName?: string | null;
  barcode?: string | null;
}

const SEVERITIES = [
  { value: "low",      label: "🟢 Niedrig",  desc: "Kleine Mängel, kein Sicherheitsrisiko" },
  { value: "medium",   label: "🟡 Mittel",    desc: "Einschränkung der Nutzbarkeit" },
  { value: "high",     label: "🟠 Hoch",      desc: "Bett eingeschränkt nutzbar" },
  { value: "critical", label: "🔴 Kritisch",  desc: "Bett sofort außer Betrieb nehmen" },
] as const;

export default function NewBedDefect() {
  const { bedId } = useParams<{ bedId: string }>();
  const nav = useNavigate();
  const location = useLocation();
  const bedState = (location.state as BedState) ?? {};

  const [title, setTitle]       = useState("");
  const [description, setDesc]  = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [saving, setSaving]     = useState(false);

  const backTo = `/bed-defects/station/${/* stationId unbekannt, daher Übersicht */""}`; // Fallback

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post("/defects", {
        bed_id:      bedId,
        title:       title.trim(),
        description: description.trim() || undefined,
        severity,
        scanned_barcode: bedState.barcode || undefined,
      });
      nav("/bed-defects");
    } catch (e: any) {
      alert(e.response?.data?.error || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link to="/bed-defects" className="text-sm text-slate-500 hover:underline">
          ← Zurück zur Übersicht
        </Link>
        <h1 className="font-display text-2xl font-bold mt-1">🔧 Defekt melden</h1>
      </div>

      {/* Bett-Info */}
      <div className="card bg-slate-50 space-y-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bett</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {bedState.stationName && (
            <span className="font-medium">{bedState.stationName}</span>
          )}
          {bedState.roomNumber && (
            <span className="text-slate-600">Zi. {bedState.roomNumber}</span>
          )}
          {bedState.bedNumber && (
            <span className="text-slate-600">Bett {bedState.bedNumber}</span>
          )}
          {bedState.bedTypeName && (
            <span className="text-slate-500">{bedState.bedTypeName}</span>
          )}
          {bedState.barcode && (
            <span className="font-mono text-xs text-slate-400">{bedState.barcode}</span>
          )}
        </div>
      </div>

      {/* Kurzbeschreibung */}
      <div className="card space-y-1">
        <label className="label">Was ist defekt? *</label>
        <input
          className="input"
          required
          placeholder="z. B. Seitengitter defekt, Bremse blockiert, Kopfteil lose"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      {/* Schweregrad */}
      <div className="card space-y-2">
        <label className="label">Schweregrad *</label>
        {SEVERITIES.map(({ value, label, desc }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSeverity(value)}
            className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
              severity === value
                ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="font-medium text-sm">{label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

      {/* Optionale Detailbeschreibung */}
      <div className="card space-y-1">
        <label className="label">
          Weitere Details{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          className="input w-full"
          rows={3}
          placeholder="Wie wurde der Defekt entdeckt? Seit wann? Weitere Hinweise…"
          value={description}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={saving || !title.trim()}
          className="btn-primary flex-1"
        >
          {saving ? "Speichern…" : "Defekt melden"}
        </button>
        <Link to="/bed-defects" className="btn-ghost flex-1 text-center">
          Abbrechen
        </Link>
      </div>
    </div>
  );
}
