import { useRef, useState, useEffect } from "react";
import { api } from "../../api/client";
import { useRaumbuch } from "../../contexts/RaumbuchContext";

interface FieldDef {
  key: string; label: string; entity: string;
  required: boolean; custom: boolean;
  field_type?: string; options?: string[] | null; attr_id?: string;
}

type Step = "upload" | "mapping" | "preview" | "done";

const ENTITY_ICON: Record<string, string> = {
  house: "🏥", area: "📂", room: "🚪", bed: "🛏️"
};

export default function ImportTab() {
  const { reload } = useRaumbuch();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fields,   setFields]   = useState<FieldDef[]>([]);
  const [step,     setStep]     = useState<Step>("upload");
  const [headers,  setHeaders]  = useState<string[]>([]);
  const [rows,     setRows]     = useState<Record<string, string>[]>([]);
  const [mapping,  setMapping]  = useState<Record<string, string>>({});
  const [preview,  setPreview]  = useState<Record<string, string>[]>([]);
  const [errors,   setErrors]   = useState<any[]>([]);
  const [result,   setResult]   = useState<any | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [fileName, setFileName] = useState("");

  // Felder dynamisch vom Backend laden
  useEffect(() => {
    api.get<FieldDef[]>("/import/raumbuch/fields").then(r => setFields(r.data));
  }, []);

  function reset() {
    setStep("upload"); setHeaders([]); setRows([]);
    setMapping({}); setPreview([]); setErrors([]); setResult(null); setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await api.post<{ headers: string[]; rows: Record<string,string>[]; total: number }>(
        "/import/parse-excel", formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const { headers: hdrs, rows: parsed } = r.data;
      setHeaders(hdrs); setRows(parsed);
      const autoMap: Record<string, string> = {};
      setMapping(autoMap);
      setStep("mapping");
    } catch (err: any) {
      alert("Fehler beim Lesen der Datei: " + (err.response?.data?.message ?? err.message));
    } finally { setBusy(false); }
  }

  async function loadPreview() {
    setBusy(true);
    try {
      const r = await api.post("/import/raumbuch/preview", { mapping, rows });
      setPreview(r.data.preview); setErrors(r.data.errors); setStep("preview");
    } finally { setBusy(false); }
  }

  async function runImport() {
    setBusy(true);
    try {
      const r = await api.post("/import/raumbuch", { mapping, rows });
      setResult(r.data.stats); setStep("done"); reload();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? "Unbekannter Fehler";
      alert("Import fehlgeschlagen: " + msg);
    } finally { setBusy(false); }
  }

  const hardErrors = errors.filter(e => e.severity === "error");
  const usedFields = new Set(Object.values(mapping));
  const missingReq = fields.filter(f => f.required && !usedFields.has(f.key));

  // Felder nach Entity gruppieren für das Mapping-UI
  const fieldsByEntity = fields.reduce<Record<string, FieldDef[]>>((acc, f) => {
    const key = f.entity; (acc[key] = acc[key] || []).push(f); return acc;
  }, {});

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">📥 Raumbuch importieren</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Importiert Haus → Bereich → Zimmer → Stellplatz aus Excel.
            Bestehende Einträge werden nicht überschrieben.
          </p>
        </div>
        {step !== "upload" && (
          <button className="btn-ghost text-sm" onClick={reset}>↩ Neu starten</button>
        )}
      </div>

      {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="card space-y-4">
          <p className="text-sm text-slate-600">
            Lade eine Excel-Datei hoch. Die <strong>erste Zeile</strong> muss die Spaltenüberschriften enthalten.
          </p>
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-[color:var(--brand-400)] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <div className="text-5xl mb-3">📊</div>
            <p className="text-slate-500 text-sm font-medium">Klicken zum Auswählen</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx · .xls · .csv</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />

          {/* Verfügbare Felder anzeigen */}
          {fields.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">
                Verfügbare Importfelder ({fields.length} gesamt, {fields.filter(f=>f.custom).length} eigene Attribute)
              </div>
              <div className="p-3 grid grid-cols-2 gap-1">
                {fields.map(f => (
                  <div key={f.key} className="flex items-center gap-2 text-xs py-0.5">
                    <span>{ENTITY_ICON[f.entity] ?? "•"}</span>
                    <span className={f.custom ? "text-[color:var(--brand-700)]" : "text-slate-600"}>
                      {f.label}
                    </span>
                    {f.required && <span className="text-red-400">*</span>}
                    {f.custom && <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded">eigen</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Mapping ────────────────────────────────────────────────── */}
      {step === "mapping" && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm text-slate-500 mb-4">
              📄 <strong>{fileName}</strong> · {rows.length} Zeilen · {headers.length} Spalten
            </p>

            {Object.entries(fieldsByEntity).map(([entity, entityFields]) => (
              <div key={entity} className="mb-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  {ENTITY_ICON[entity]} {entityLabel(entity)}
                </h3>
                <div className="space-y-2">
                  {entityFields.map(field => {
                    const currentExcelCol = Object.entries(mapping).find(([,v]) => v === field.key)?.[0] ?? "";
                    return (
                      <div key={field.key} className="flex items-center gap-3">
                        <div className="w-48 shrink-0 text-sm">
                          {field.label.split(" (")[0]}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                          {field.custom && (
                            <span className="ml-1 text-[10px] text-[color:var(--brand-600)] bg-[color:var(--brand-50)] px-1 rounded">
                              eigen
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-xs">←</span>
                        <select
                          className="input flex-1 !py-1.5 !text-sm"
                          value={currentExcelCol}
                          onChange={(e) => {
                            const newMap = { ...mapping };
                            Object.keys(newMap).forEach(k => { if (newMap[k] === field.key) delete newMap[k]; });
                            if (e.target.value) newMap[e.target.value] = field.key;
                            setMapping(newMap);
                          }}
                        >
                          <option value="">— nicht importieren —</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}{mapping[h] && mapping[h] !== field.key ? " ✓" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Vorschau der ersten 3 Zeilen */}
          <div className="card !p-0 overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500">
              Excel-Vorschau (erste 3 Zeilen)
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {headers.map(h => (
                    <th key={h} className={`px-3 py-2 text-left font-medium ${mapping[h] ? "text-[color:var(--brand-700)]" : "text-slate-300"}`}>
                      {h}
                      {mapping[h] && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          → {fields.find(f => f.key === mapping[h])?.label?.split(" (")[0]}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {headers.map(h => (
                      <td key={h} className={`px-3 py-1.5 ${mapping[h] ? "" : "text-slate-200"}`}>
                        {row[h] || "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {missingReq.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
              ⚠️ Pflichtfelder noch nicht zugeordnet: {missingReq.map(f => f.label.split(" (")[0]).join(", ")}
            </div>
          )}

          <button className="btn-primary" disabled={busy || missingReq.length > 0} onClick={loadPreview}>
            {busy ? "Prüfe…" : "Weiter → Vorschau prüfen"}
          </button>
        </div>
      )}

      {/* ── STEP 3: Vorschau ───────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <p className="text-sm text-slate-600">
              <strong>{rows.length}</strong> Zeilen · gemappte Felder: <strong>{Object.keys(mapping).length}</strong>
              {fields.filter(f => f.custom && Object.values(mapping).includes(f.key)).length > 0 && (
                <span className="ml-2 text-[color:var(--brand-600)]">
                  + {fields.filter(f => f.custom && Object.values(mapping).includes(f.key)).length} eigene Attribute
                </span>
              )}
            </p>

            {hardErrors.length > 0 && (
              <div className="bg-red-50 rounded-xl p-3 space-y-1">
                <p className="text-sm font-semibold text-red-700">❌ {hardErrors.length} Fehler – Import nicht möglich:</p>
                {hardErrors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">Zeile {e.row}: {e.message}</p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {fields.filter(f => usedFields.has(f.key)).map(f => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-slate-600">
                        {ENTITY_ICON[f.entity]} {f.label.split(" (")[0]}
                        {f.custom && <span className="ml-1 text-[10px] text-[color:var(--brand-600)]">✦</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {fields.filter(f => usedFields.has(f.key)).map(f => (
                        <td key={f.key} className={`px-3 py-1.5 ${!row[f.key] && f.required ? "text-red-400" : ""}`}>
                          {row[f.key] || "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep("mapping")}>← Zurück</button>
            <button className="btn-primary" disabled={busy || hardErrors.length > 0} onClick={runImport}>
              {busy ? "Importiere…" : `✅ ${rows.length} Zeilen importieren`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Ergebnis ───────────────────────────────────────────────── */}
      {step === "done" && result && (
        <div className="card space-y-4">
          <div className="text-center">
            <div className="text-5xl mb-3">✅</div>
            <h3 className="font-display text-xl font-bold text-emerald-700">Import abgeschlossen</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Häuser",       val: result.houses },
              { label: "Bereiche",     val: result.areas },
              { label: "Zimmer",       val: result.rooms },
              { label: "Stellplätze",  val: result.beds },
              { label: "Attributwerte",val: result.attributes ?? 0 },
              { label: "Übersprungen", val: result.skipped },
            ].map(({ label, val }) => (
              <div key={label} className="text-center bg-slate-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-[color:var(--brand-600)]">{val}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={reset}>Weiteren Import starten</button>
        </div>
      )}
    </div>
  );
}

function entityLabel(e: string) {
  const map: Record<string, string> = { house: "Haus", area: "Bereich", room: "Zimmer", bed: "Stellplatz" };
  return map[e] ?? e;
}
