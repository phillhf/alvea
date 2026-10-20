import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BarcodeInput } from "../components/BarcodeInput";
import { alertDialog } from "../components/Dialog";

interface BedType { id: string; name: string; description: string | null }
interface Aufbereitungsart {
  id: string; name: string; description: string; when_to_use: string;
  instructions: string; sort_order: number;
}
interface Pathogen { code: string; name: string; severity: number; }

const SEVERITY_COLOR: Record<number, string> = {
  1: "bg-yellow-50 border-yellow-200 text-yellow-800",
  2: "bg-orange-50 border-orange-200 text-orange-800",
  3: "bg-red-50 border-red-200 text-red-800",
};

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold shrink-0"
          style={{ backgroundColor: "var(--brand-600)" }}>{n}</span>
  );
}

export default function NewZentralTask() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const [bedTypes, setBedTypes]                     = useState<BedType[]>([]);
  const [aufbereitungsarten, setAufbereitungsarten] = useState<Aufbereitungsart[]>([]);
  const [pathogens, setPathogens]                   = useState<Pathogen[]>([]);

  const [barcode, setBarcode] = useState("");
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [showScanner, setShowScanner]               = useState(false);
  const [bedTypeId, setBedTypeId]                   = useState("");
  const [isIso, setIsIso]                           = useState(false);
  const [selected, setSelected]                     = useState<Set<string>>(new Set());
  const [aufbereitungsartId, setAufbereitungsartId] = useState("");
  const [notes, setNotes]                           = useState("");
  const [saving, setSaving]                         = useState(false);

  useEffect(() => {
    api.get<BedType[]>("/bed-types").then((r) => setBedTypes(r.data));
    api.get<Aufbereitungsart[]>("/aufbereitungsarten").then((r) => {
      setAufbereitungsarten(r.data);
      if (r.data.length > 0) setAufbereitungsartId(r.data[0].id);
    });
    api.get<Pathogen[]>("/pathogens").then((r) => setPathogens(r.data));
    api.get("/barcodes").then((r) => setBarcodes((r.data as any[]).map((b: any) => b.code)));
  }, []);

  // Bett-Typ aus dem Bettenstamm übernehmen, sobald ein bekannter Barcode eingegeben ist
  const [typVomBettenstamm, setTypVomBettenstamm] = useState(false);
  useEffect(() => {
    const code = barcode.trim();
    if (!code) { setTypVomBettenstamm(false); return; }
    const t = setTimeout(() => {
      api.get(`/physical-beds/by-barcode/${encodeURIComponent(code)}`)
        .then(r => {
          if (r.data?.bed_type_id) { setBedTypeId(r.data.bed_type_id); setTypVomBettenstamm(true); }
        })
        .catch(() => setTypVomBettenstamm(false));
    }, 300);
    return () => clearTimeout(t);
  }, [barcode]);

  function togglePathogen(code: string) {
    const s = new Set(selected);
    s.has(code) ? s.delete(code) : s.add(code);
    setSelected(s);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim() || !bedTypeId || !aufbereitungsartId) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        category: "bed_cleaning_zentral",
        scanned_barcode: barcode.trim(),
        bed_type_id: bedTypeId,
        aufbereitungsart_id: aufbereitungsartId,
        is_iso: isIso,
        cleaning_type: "aufbereitung_zentral",
        pathogens: Array.from(selected),
        priority: 2,
        notes,
      });
      nav("/zentral");
    } catch (e: any) {
      alertDialog(e.response?.data?.error || "Fehler");
    } finally { setSaving(false); }
  }

  const chosenArt = aufbereitungsarten.find((a) => a.id === aufbereitungsartId);
  const canSubmit = barcode.trim() && bedTypeId && aufbereitungsartId;

  return (
    <div className="max-w-2xl space-y-6">
      {showScanner && (
        <BarcodeScanner
          onScan={(code) => { setBarcode(code); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div>
        <Link to="/zentral" className="text-sm text-slate-500 hover:underline">← Zurück</Link>
        <h1 className="font-display text-2xl font-bold mt-1">{t("task.newZentralTask")}</h1>
      </div>

      <form onSubmit={submit} className="space-y-6">

        {/* Schritt 1: Barcode */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <StepBadge n={1} />
            Bett-Barcode <span className="text-red-500 text-sm">*</span>
          </h2>
          <BarcodeInput
            value={barcode}
            onChange={setBarcode}
            options={barcodes}
            onScanClick={() => setShowScanner(true)}
            placeholder="Barcode eingeben, scannen oder aus Liste wählen…"
            required
            autoFocus
          />
          {barcode && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              ✅ <span className="font-mono font-semibold">{barcode}</span>
              <button type="button" className="ml-auto text-slate-400 hover:text-slate-600 text-xs" onClick={() => setBarcode("")}>Löschen</button>
            </div>
          )}
        </div>

        {/* Schritt 2: Bett-Typ */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <StepBadge n={2} /> Bett-Typ
            {typVomBettenstamm && <span className="text-xs font-normal text-emerald-600">✓ aus Bettenstamm übernommen</span>}
          </h2>
          {bedTypes.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Keine Bett-Typen angelegt – bitte unter Verwaltung anlegen.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {bedTypes.map((bt) => (
                <button key={bt.id} type="button" onClick={() => setBedTypeId(bt.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${bedTypeId === bt.id ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="font-medium text-sm">{bt.name}</div>
                  {bt.description && <div className="text-xs text-slate-400 mt-0.5 truncate">{bt.description}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Schritt 3: ISO */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <StepBadge n={3} /> {t("task.isIso")}
          </h2>
          <div className="flex gap-3">
            <button type="button" onClick={() => setIsIso(false)}
              className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${!isIso ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
              ✓ Kein ISO-Bett
            </button>
            <button type="button" onClick={() => setIsIso(true)}
              className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${isIso ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-500"}`}>
              ⚠️ ISO-Bett
            </button>
          </div>
          {isIso && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Erhöhte Schutzmaßnahmen – bitte Erreger angeben.</p>}
        </div>

        {/* Schritt 4: Erreger */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <StepBadge n={4} />
            {t("task.pathogens")}
            <span className="text-xs font-normal text-slate-400">(optional)</span>
          </h2>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {pathogens.map((p) => {
              const isSel = selected.has(p.code);
              return (
                <button key={p.code} type="button" onClick={() => togglePathogen(p.code)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${isSel ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]" : `${SEVERITY_COLOR[p.severity] ?? "bg-slate-50 border-slate-200"} opacity-70 hover:opacity-100`}`}>
                  <span className="font-medium">{p.code}</span>
                  <span className="ml-2 text-slate-600">{p.name}</span>
                  {isSel && <span className="float-right">✓</span>}
                </button>
              );
            })}
          </div>
          {selected.size > 0 && <div className="text-xs text-slate-500">Ausgewählt: {Array.from(selected).join(", ")}</div>}
        </div>

        {/* Schritt 5: Aufbereitungsart */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <StepBadge n={5} /> Aufbereitungsart
          </h2>
          {aufbereitungsarten.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Keine Aufbereitungsarten angelegt – bitte unter Verwaltung anlegen.</p>
          ) : (
            <div className="space-y-2">
              {aufbereitungsarten.map((art) => (
                <button key={art.id} type="button" onClick={() => setAufbereitungsartId(art.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${aufbereitungsartId === art.id ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="font-semibold text-sm">{art.name}</div>
                  {art.when_to_use && <div className="text-xs text-slate-500 mt-0.5"><span className="font-medium">Wann:</span> {art.when_to_use}</div>}
                  {art.description && <div className="text-xs text-slate-400 mt-0.5">{art.description}</div>}
                </button>
              ))}
            </div>
          )}
          {chosenArt?.instructions && (
            <p className="text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-700">
              💡 Anleitung wird beim Auftrag angezeigt.
            </p>
          )}
        </div>

        {/* Notizen */}
        <div className="card space-y-2">
          <label className="label">{t("task.notes")} <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea className="input w-full" rows={2} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="z. B. Besondere Hinweise zum Bett…" />
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving || !canSubmit}>
            {saving ? "Speichern…" : "Auftrag anlegen"}
          </button>
          <Link to="/zentral" className="btn-ghost flex-1 text-center">{t("common.cancel")}</Link>
        </div>

        {!canSubmit && (
          <p className="text-xs text-center text-slate-400">
            {!barcode.trim() ? "⬆ Barcode wird benötigt" : !bedTypeId ? "⬆ Bett-Typ auswählen" : "⬆ Aufbereitungsart auswählen"}
          </p>
        )}
      </form>
    </div>
  );
}
