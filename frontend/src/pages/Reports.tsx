import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { BarcodeInput } from "../components/BarcodeInput";
import { useAuth } from "../contexts/AuthContext";
import { alertDialog } from "../components/Dialog";

/* ── helpers ── */
function fmt(iso: string | null) {
  if (!iso) return "–";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string | null) {
  if (!iso) return "–";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function cleaningLabel(type: string) {
  return ({ normal: "Normal", infektioes: "⚠️ Infektiös", standard: "Standard", schlussdesinfektion: "🔴 Schlussdesinf." } as any)[type] ?? type;
}
function statusBadge(status: string) {
  const m: Record<string, string> = {
    offen: "bg-slate-100 text-slate-600",
    unterwegs: "bg-yellow-100 text-yellow-700",
    angekommen: "bg-orange-100 text-orange-700",
    laufend: "bg-blue-100 text-blue-700",
    abgeschlossen: "bg-green-100 text-green-700",
  };
  return m[status] ?? "bg-slate-100 text-slate-500";
}

export default function Reports() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [activeSection, setActiveSection] = useState<"station" | "barcode" | "zentral" | "bettenstamm" | "sauerstoff" | "ruecksendungen">("station");

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("nav.reports")}</h1>
      </div>

      {/* Section switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit flex-wrap">
        {([
          { key: "station",     label: "📊 Stationsbericht" },
          { key: "barcode",     label: "🔍 Bett-Reisehistorie" },
          { key: "zentral",     label: "🏥 Bett-Zentral" },
          { key: "bettenstamm", label: "🛏 Bettenstamm" },
          { key: "sauerstoff",  label: "💨 Sauerstoff" },
          { key: "ruecksendungen", label: "📦 Rücksendungen" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === key
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSection === "station"     && <StationReport />}
      {activeSection === "barcode"     && <BarcodeReport />}
      {activeSection === "zentral"     && <ZentralReport />}
      {activeSection === "bettenstamm" && <BettenstammReport />}
      {activeSection === "sauerstoff"  && <SauerstoffReport />}
      {activeSection === "ruecksendungen" && <RuecksendungenReport />}
    </div>
  );
}

/* ============================================================ */
/* STATIONSBERICHT (bestehend)                                  */
/* ============================================================ */
function StationReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [houses, setHouses]       = useState<any[]>([]);
  const [areas, setAreas]         = useState<any[]>([]);
  const [houseId, setHouseId]     = useState("");
  const [stationId, setStationId] = useState("");
  const [dateFrom, setDateFrom]   = useState(today);
  const [dateTo, setDateTo]       = useState(today);
  const [summary, setSummary]     = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  useEffect(() => {
    // Häuser und Bereiche parallel laden
    api.get("/houses").then(r => setHouses(r.data)).catch(() => {});
    api.get("/areas").then(r => {
      setAreas(r.data);
      if (r.data.length) setStationId(r.data[0].id);
    }).catch(() => {});
  }, []);

  // Wenn Haus wechselt → erste Station vorwählen, Ergebnis zurücksetzen
  function onHouseChange(id: string) {
    setHouseId(id);
    setSummary(null);
    const list = id ? areas.filter((a: any) => a.house_id === id) : areas;
    setStationId(list[0]?.id ?? "");
  }

  const filteredAreas = houseId
    ? areas.filter((a: any) => a.house_id === houseId)
    : areas;

  async function load() {
    if (!stationId) return;
    if (dateFrom > dateTo) { setErr("Von-Datum liegt nach Bis-Datum."); return; }
    setLoading(true); setErr(null);
    try {
      const { data } = await api.get(`/reports/summary?station_id=${stationId}&date_from=${dateFrom}&date_to=${dateTo}`);
      setSummary(data);
    } catch { setErr("Fehler beim Laden."); }
    finally { setLoading(false); }
  }

  const apiBase = import.meta.env.VITE_API_URL || "/api";
  const token = localStorage.getItem("token");

  async function downloadPdf() {
    const url = `${apiBase}/reports/pdf?station_id=${stationId}&date_from=${dateFrom}&date_to=${dateTo}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alertDialog("PDF konnte nicht erstellt werden."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Reinigungsbericht_${summary?.station_name}_${dateFrom}${dateFrom !== dateTo ? `_${dateTo}` : ""}.pdf`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3 items-end">
        <div className="min-w-[160px]">
          <label className="label">Haus</label>
          <select className="input" value={houseId} onChange={e => onHouseChange(e.target.value)}>
            <option value="">— Alle Häuser —</option>
            {houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">Bereich / Station</label>
          <select className="input" value={stationId} onChange={e => { setStationId(e.target.value); setSummary(null); }}>
            {filteredAreas.length === 0 && <option value="">— keine Bereiche —</option>}
            {filteredAreas.map((a: any) => (
              <option key={a.id} value={a.id}>
                {houses.length > 1 && !houseId ? `${a.house_name} – ` : ""}{a.bezeichnung ?? a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Von</label>
          <input className="input" type="date" value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Bis</label>
          <input className="input" type="date" value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? "Laden…" : "Laden"}
        </button>
        {summary && summary.total > 0 && (
          <button className="btn-ghost" onClick={downloadPdf}>📄 PDF exportieren</button>
        )}
      </div>
      {err && <div className="text-red-600 text-sm px-1">{err}</div>}

      {summary && (
        <div className="card space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Gesamt", value: summary.total, color: "text-slate-800 dark:text-white" },
              { label: "Abgeschlossen", value: summary.completed, color: "text-emerald-600" },
              { label: "Offen", value: summary.pending, color: "text-amber-600" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={`font-display text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                <th className="py-2">Zimmer / Bett</th><th>Typ</th><th>Status</th><th>Bearbeiter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summary.rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="py-1.5 font-medium">{r.room_number}</td>
                  <td className="text-xs font-mono">{r.task_type}</td>
                  <td>
                    <span className={`badge text-xs ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="text-xs text-slate-500">{r.assigned_to_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* BETT-REISEHISTORIE PER STRICHCODE                           */
/* ============================================================ */
function BarcodeReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [input, setInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "stations">("timeline");
  const [search, setSearch] = useState("");
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    api.get("/barcodes").then((r) => setBarcodes((r.data as any[]).map((b: any) => b.code)));
  }, []);

  async function lookup(code = input) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setData(null); setSearch("");
    try {
      const params = new URLSearchParams({ });
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to",   dateTo);
      const qs = params.toString() ? `&${params}` : "";
      const history = (await api.get(`/travel-history/barcode/${encodeURIComponent(trimmed)}${qs ? `?${params}` : ""}`)).data;
      setData(history);
      setActiveTab("timeline");
    } catch (e: any) {
      setError(e.response?.status === 404
        ? `Kein Reinigungsauftrag mit Strichcode "${trimmed}" gefunden. Die Reisehistorie wird erst befüllt wenn ein Reiniger diesen Barcode bei einem aktiven Auftrag scannt.`
        : "Fehler beim Laden der Daten.");
    } finally { setLoading(false); }
  }

  const apiBase = import.meta.env.VITE_API_URL || "/api";
  const token = localStorage.getItem("token");

  async function downloadPdf() {
    const params = new URLSearchParams({ barcode: input.trim() });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to",   dateTo);
    const res = await fetch(`${apiBase}/reports/barcode-pdf?${params}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alertDialog("PDF konnte nicht erstellt werden."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Reisehistorie_${input.trim()}${dateFrom ? `_${dateFrom}` : ""}.pdf`;
    a.click();
  }

  const filtered = (data?.history ?? []).filter((t: any) =>
    !search || [t.station_name, t.area_name, t.house_name, t.room_number, t.assigned_to_name]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Suchfeld */}
      <div className="card space-y-3">
        <div>
          <label className="label">Strichcode eingeben</label>
          <div className="flex gap-2">
            <BarcodeInput
              value={input}
              onChange={setInput}
              options={barcodes}
              placeholder="z.B. BT-DEMO-0001"
              className="flex-1"
            />
            <button
              className="btn-primary px-6"
              onClick={() => lookup()}
              disabled={loading || !input.trim()}
            >
              {loading ? "…" : "🔍 Suchen"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Von (optional)</label>
            <input className="input" type="date" value={dateFrom}
              max={dateTo || today}
              onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Bis (optional)</label>
            <input className="input" type="date" value={dateTo}
              min={dateFrom} max={today}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          {dateFrom && dateTo && (
            <button className="btn-ghost !py-1.5 text-xs"
              onClick={() => { setDateFrom(""); setDateTo(""); }}>
              ✕ Filter zurücksetzen
            </button>
          )}
          <div className="flex-1" />
          {data && data.total_tasks > 0 && (
            <button className="btn-ghost" onClick={downloadPdf}>📄 PDF exportieren</button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Strichcode eingeben oder scannen. Zeitraum ist optional – ohne Angabe werden alle Aufträge angezeigt.
        </p>
      </div>

      {/* Fehler */}
      {error && (
        <div className="card border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
          <span>⚠️</span><span>{error}</span>
        </div>
      )}

      {/* Ergebnis */}
      {data && (
        <div className="space-y-4">
          {/* Bett-Info Header */}
          <div className="card flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-2xl shrink-0"
                 style={{ backgroundColor: "var(--brand-600)" }}>
              🛏️
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-display text-xl font-bold">
                  Physisches Bett
                </h2>
                <span className="font-mono text-sm bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">
                  #{data.barcode}
                </span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5">
                {data.total_tasks} Reinigungen · {data.unique_stations} verschiedene Stationen
              </div>
            </div>
            <button
              className="btn-ghost text-sm shrink-0"
              onClick={() => { setData(null); setInput(""); setTimeout(() => inputRef.current?.focus(), 50); }}
            >
              ✕ Zurücksetzen
            </button>
          </div>

          {/* Kennzahlen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: "📋", label: "Aufträge gesamt",     value: data.total_tasks },
              { icon: "🏥", label: "Stationen besucht",   value: data.unique_stations },
              { icon: "✅", label: "Abgeschlossen",        value: data.history.filter((t: any) => t.status === "abgeschlossen").length },
              { icon: "⚠️", label: "Infektiöse Aufträge", value: data.history.filter((t: any) => t.cleaning_type === "infektioes" || t.cleaning_type === "schlussdesinfektion").length },
            ].map(s => (
              <div key={s.label} className="card text-center !p-4">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="font-display text-2xl font-bold" style={{ color: "var(--brand-600)" }}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + Suche */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {([
                { key: "timeline", label: "📅 Zeitverlauf" },
                { key: "stations", label: "🏥 Stationen" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          activeTab === key
                            ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white"
                            : "text-slate-500 hover:text-slate-700"
                        }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <input
              className="input !w-52 !py-1.5 text-sm"
              placeholder="In Ergebnissen suchen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* ZEITVERLAUF */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="card text-center text-slate-400 py-10">
                  {data.total_tasks === 0 ? "Noch keine Aufträge für dieses Bett erfasst." : "Keine Treffer für die Suche."}
                </div>
              )}
              <div className="relative">
                {filtered.length > 1 && (
                  <div className="absolute left-[23px] top-8 bottom-8 w-0.5 bg-slate-200 dark:bg-slate-600 z-0" />
                )}
                <div className="space-y-3">
                  {filtered.map((t: any, i: number) => (
                    <div key={t.id} className="flex gap-4 items-start relative z-10">
                      {/* Nummer */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 border-white dark:border-slate-800 ${
                        t.status === "abgeschlossen" ? "bg-green-500 text-white" :
                        t.status === "laufend"       ? "bg-blue-500 text-white" :
                        t.cleaning_type === "infektioes" || t.cleaning_type === "schlussdesinfektion"
                                                     ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {filtered.length - i}
                      </div>
                      {/* Inhalt */}
                      <div className="flex-1 card !p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <span className="font-display font-bold text-slate-900 dark:text-white">
                              {t.station_name}
                            </span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-sm text-slate-500">Zi. {t.room_number}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`badge text-xs ${statusBadge(t.status)}`}>{t.status}</span>
                            {(t.cleaning_type === "infektioes" || t.cleaning_type === "schlussdesinfektion") && (
                              <span className="badge text-xs bg-red-100 text-red-700">
                                {cleaningLabel(t.cleaning_type)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                          <span>🏠 {t.house_name} · {t.area_name}</span>
                          <span>🧹 {cleaningLabel(t.cleaning_type)}</span>
                          {t.assigned_to_name && <span>👤 {t.assigned_to_name}</span>}
                          {t.created_by_name   && <span>📝 Erstellt von {t.created_by_name}</span>}
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-2">
                          <span>📅 Erstellt: {fmt(t.created_at)}</span>
                          {t.started_at   && <span>▶️ Gestartet: {fmt(t.started_at)}</span>}
                          {t.completed_at && <span>✅ Abgeschlossen: {fmt(t.completed_at)}</span>}
                        </div>

                        {t.pathogens?.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap pt-1">
                            {t.pathogens.map((p: string) => (
                              <span key={p} className="badge bg-red-100 text-red-700 font-mono">⚠️ {p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STATIONEN */}
          {activeTab === "stations" && (
            <div className="space-y-2">
              {data.station_stats.length === 0 && (
                <div className="card text-center text-slate-400 py-10">Keine Stationsdaten vorhanden.</div>
              )}
              {data.station_stats
                .filter((s: any) => !search
                  || s.station_name.toLowerCase().includes(search.toLowerCase())
                  || s.area_name.toLowerCase().includes(search.toLowerCase())
                  || s.house_name.toLowerCase().includes(search.toLowerCase()))
                .map((s: any, i: number) => (
                <div key={i} className="card !p-4 flex items-center gap-4">
                  {/* Rang + Balken */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                       style={{ backgroundColor: "var(--brand-600)", opacity: Math.max(0.4, 1 - i * 0.1) }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-display font-bold">{s.station_name}</span>
                      <span className="badge text-xs" style={{ backgroundColor: "var(--brand-50)", color: "var(--brand-700)" }}>
                        {s.count}× besucht
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{s.house_name} · {s.area_name}</div>
                    {/* Fortschrittsbalken */}
                    <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          backgroundColor: "var(--brand-600)",
                          width: `${(s.count / data.station_stats[0].count) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-right shrink-0 text-slate-400">
                    <div>Letzter Besuch</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                      {fmtDate(s.last_visit)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* ZENTRAL-BERICHT                                              */
/* ============================================================ */
function ZentralReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pdfBusy,  setPdfBusy]  = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || "/api";
  const token = localStorage.getItem("token");

  async function load() {
    if (dateFrom > dateTo) { setErr("Von-Datum liegt nach Bis-Datum."); return; }
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/reports/zentral-summary?date_from=${dateFrom}&date_to=${dateTo}`);
      setData(r.data);
    } catch { setErr("Fehler beim Laden."); }
    finally { setLoading(false); }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const url = `${apiBase}/reports/zentral-pdf?date_from=${dateFrom}&date_to=${dateTo}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Zentral-Bericht_${dateFrom}_${dateTo}.pdf`;
      a.click();
    } catch { setErr("PDF konnte nicht erstellt werden."); }
    finally { setPdfBusy(false); }
  }

  async function downloadDayPdf(date: string) {
    setPdfBusy(true);
    try {
      const url = `${apiBase}/reports/zentral-pdf?date_from=${date}&date_to=${date}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Zentral-Bericht_${date}.pdf`;
      a.click();
    } catch { setErr("PDF konnte nicht erstellt werden."); }
    finally { setPdfBusy(false); }
  }

  function toggleDay(date: string) {
    const s = new Set(expanded);
    s.has(date) ? s.delete(date) : s.add(date);
    setExpanded(s);
  }

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="card space-y-4">
        <h2 className="font-display text-lg font-semibold">Bett-Zentral Tagesbericht</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Von</label>
            <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Bis</label>
            <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={load} disabled={loading}>
            {loading ? "Laden…" : "Bericht laden"}
          </button>
          {data && (
            <button className="btn-ghost border border-slate-200" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? "PDF…" : "📄 Gesamt-PDF"}
            </button>
          )}
        </div>
        {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      </div>

      {data && (
        <>
          {/* Gesamtkennzahlen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Aufträge gesamt",  value: data.total,                          color: "text-slate-700" },
              { label: "Abgeschlossen",    value: data.abgeschlossen,                  color: "text-emerald-700" },
              { label: "Offen / Laufend",  value: data.total - data.abgeschlossen,     color: "text-amber-700" },
              { label: "davon ISO-Betten", value: data.iso_count,                      color: "text-red-700" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-4">
                <div className={`text-3xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Verteilung */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card space-y-2">
              <h3 className="font-semibold text-sm text-slate-600">Nach Bett-Typ</h3>
              {Object.entries(data.by_type as Record<string, number>)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center text-sm">
                    <span>{name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ backgroundColor: "var(--brand-500)", width: `${Math.round((count as number) / data.total * 100)}%` }} />
                      </div>
                      <span className="font-medium w-6 text-right">{count as number}</span>
                    </div>
                  </div>
                ))}
            </div>
            <div className="card space-y-2">
              <h3 className="font-semibold text-sm text-slate-600">Nach Aufbereitungsart</h3>
              {Object.entries(data.by_art as Record<string, number>)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center text-sm">
                    <span>{name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ backgroundColor: "var(--brand-500)", width: `${Math.round((count as number) / data.total * 100)}%` }} />
                      </div>
                      <span className="font-medium w-6 text-right">{count as number}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Tagesansicht */}
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Detailansicht nach Tag</h2>
            {data.days.map((day: any) => (
              <div key={day.date} className="card">
                {/* Tages-Header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="flex-1 flex items-center gap-3 flex-wrap text-left min-w-0"
                    onClick={() => toggleDay(day.date)}
                  >
                    <span className="font-semibold">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("de-DE",
                        { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                    <span className="badge bg-slate-100 text-slate-600 text-xs">{day.total} Aufträge</span>
                    <span className="badge bg-emerald-100 text-emerald-700 text-xs">{day.abgeschlossen} erledigt</span>
                    {day.iso_count > 0 && (
                      <span className="badge bg-red-100 text-red-700 text-xs">⚠️ {day.iso_count} ISO</span>
                    )}
                    <span className="text-slate-400 ml-auto">{expanded.has(day.date) ? "▲" : "▼"}</span>
                  </button>
                  <button
                    className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1 shrink-0"
                    disabled={pdfBusy}
                    onClick={() => downloadDayPdf(day.date)}
                    title="Tagesbericht als PDF"
                  >
                    📄 PDF
                  </button>
                </div>

                {/* Auftrags-Tabelle */}
                {expanded.has(day.date) && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-100">
                          <th className="text-left py-1.5 pr-3 font-medium">Barcode</th>
                          <th className="text-left py-1.5 pr-3 font-medium">Bett-Typ</th>
                          <th className="text-left py-1.5 pr-3 font-medium">ISO</th>
                          <th className="text-left py-1.5 pr-3 font-medium">Aufbereitungsart</th>
                          <th className="text-left py-1.5 pr-3 font-medium">Erreger</th>
                          <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                          <th className="text-left py-1.5 font-medium">Mitarbeiter</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.tasks.map((task: any) => (
                          <tr key={task.created_at} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">{task.scanned_barcode ?? "–"}</td>
                            <td className="py-1.5 pr-3">{task.bed_type_name ?? "–"}</td>
                            <td className="py-1.5 pr-3">
                              {task.is_iso
                                ? <span className="badge bg-red-100 text-red-700 text-xs">⚠️ ISO</span>
                                : <span className="text-slate-300">–</span>}
                            </td>
                            <td className="py-1.5 pr-3">{task.aufbereitungsart_name ?? "–"}</td>
                            <td className="py-1.5 pr-3">
                              {task.pathogens?.length > 0
                                ? <span className="text-orange-600 text-xs">{task.pathogens.join(", ")}</span>
                                : <span className="text-slate-300">–</span>}
                            </td>
                            <td className="py-1.5 pr-3">
                              <span className={`badge text-xs ${
                                task.status === "abgeschlossen" ? "bg-emerald-100 text-emerald-700" :
                                task.status === "laufend"       ? "bg-violet-100 text-violet-700" :
                                "bg-amber-100 text-amber-700"}`}>
                                {task.status === "abgeschlossen" ? "Fertig" :
                                 task.status === "laufend"       ? "Laufend" : "Offen"}
                              </span>
                            </td>
                            <td className="py-1.5 text-slate-500 text-xs">{task.assigned_to_name ?? "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {data.days.length === 0 && (
              <div className="card text-center py-10 text-slate-400">
                Keine Zentral-Aufträge im gewählten Zeitraum.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================ */
/* BETTENSTAMM-BERICHT                                          */
/* ============================================================ */
function BettenstammReport() {
  const [beds, setBeds]       = useState<any[]>([]);
  const [houses, setHouses]   = useState<any[]>([]);
  const [houseId, setHouseId] = useState("");
  const [filter, setFilter]   = useState<"alle" | "faellig" | "gesperrt">("faellig");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/physical-beds"),
      api.get("/houses"),
    ]).then(([b, h]) => {
      setBeds(b.data);
      setHouses(h.data);
      setLoading(false);
    });
  }, []);

  const byHouse = houseId
    ? beds.filter((b: any) => b.last_house_id === houseId)
    : beds;

  const filtered = byHouse.filter((b: any) => {
    if (filter === "faellig")  return b.prueftermin && (b.tage_ueberfaellig ?? -999) > -30;
    if (filter === "gesperrt") return b.gesperrt === 1;
    return true;
  });

  const ueberfaellig = byHouse.filter((b: any) => b.prueftermin && (b.tage_ueberfaellig ?? -999) > 0).length;
  const baldFaellig  = byHouse.filter((b: any) => b.prueftermin && (b.tage_ueberfaellig ?? -999) > -30 && (b.tage_ueberfaellig ?? -999) <= 0).length;
  const gesperrt     = byHouse.filter((b: any) => b.gesperrt === 1).length;

  function ampel(bed: any) {
    if (!bed.prueftermin) return { label: "–", cls: "bg-slate-100 text-slate-400" };
    const d = bed.tage_ueberfaellig ?? 0;
    if (d > 0)   return { label: `${d} T. überfällig`, cls: "bg-red-100 text-red-700 font-semibold" };
    if (d > -30) return { label: `in ${Math.abs(d)} T.`, cls: "bg-amber-100 text-amber-700" };
    return { label: new Date(bed.prueftermin + "T00:00:00").toLocaleDateString("de-DE"), cls: "bg-emerald-100 text-emerald-700" };
  }

  function exportCSV() {
    const rows = [
      ["Barcode", "Bett-Typ", "Hersteller", "Modell", "Seriennummer", "Baujahr", "Prüftermin", "Überfällig (Tage)", "Gesperrt", "Gesperrt Grund", "Notizen"],
      ...filtered.map(b => [
        b.barcode, b.bed_type_name ?? "", b.hersteller ?? "", b.modell ?? "",
        b.seriennummer ?? "", b.baujahr ?? "", b.prueftermin ?? "",
        b.tage_ueberfaellig > 0 ? b.tage_ueberfaellig : "",
        b.gesperrt ? "Ja" : "Nein", b.gesperrt_grund ?? "", b.notizen ?? "",
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Bettenstamm_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  return (
    <div className="space-y-5">
      {/* Haus-Filter */}
      {houses.length > 1 && (
        <div className="card flex items-center gap-3">
          <label className="label mb-0 shrink-0">Haus</label>
          <select className="input flex-1 max-w-xs" value={houseId} onChange={e => setHouseId(e.target.value)}>
            <option value="">— Alle Häuser —</option>
            {houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          {houseId && <span className="text-sm text-slate-500">{byHouse.length} Betten in diesem Haus</span>}
        </div>
      )}

      {/* Zusammenfassung */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-4 border-l-4 border-red-400">
          <div className="text-2xl font-bold text-red-600">{ueberfaellig}</div>
          <div className="text-xs text-slate-500 mt-0.5">Prüfung überfällig</div>
        </div>
        <div className="card !p-4 border-l-4 border-amber-400">
          <div className="text-2xl font-bold text-amber-600">{baldFaellig}</div>
          <div className="text-xs text-slate-500 mt-0.5">Bald fällig (&lt;30 Tage)</div>
        </div>
        <div className="card !p-4 border-l-4 border-slate-400">
          <div className="text-2xl font-bold text-slate-700">{gesperrt}</div>
          <div className="text-xs text-slate-500 mt-0.5">Betten gesperrt</div>
        </div>
      </div>

      {/* Filter + Export */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl flex-1">
          {([
            { key: "faellig",  label: `⚠️ Prüfung (${ueberfaellig + baldFaellig})` },
            { key: "gesperrt", label: `🔒 Gesperrt (${gesperrt})` },
            { key: "alle",     label: `Alle (${beds.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-1 ${
                filter === key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="btn-ghost text-sm shrink-0">
          📥 CSV exportieren
        </button>
      </div>

      {/* Tabelle */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">✅</div>
          <div>Keine Einträge in dieser Kategorie.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <th className="pb-2 pr-3">Barcode</th>
                <th className="pb-2 pr-3">Typ</th>
                <th className="pb-2 pr-3">Hersteller / Modell</th>
                <th className="pb-2 pr-3">Prüftermin</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Notiz / Sperrgrund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(b => {
                const a = ampel(b);
                return (
                  <tr key={b.id} className={b.gesperrt ? "bg-red-50/30" : (b.tage_ueberfaellig > 0 ? "bg-red-50/20" : "")}>
                    <td className="py-2.5 pr-3 font-mono text-xs font-semibold">{b.barcode}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-500">{b.bed_type_name ?? "–"}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-500">
                      {[b.hersteller, b.modell].filter(Boolean).join(" · ") || "–"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`badge text-xs ${a.cls}`}>{a.label}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {b.gesperrt
                        ? <span className="badge bg-red-100 text-red-700 text-xs">🔒 Gesperrt</span>
                        : <span className="badge bg-slate-100 text-slate-500 text-xs">Frei</span>
                      }
                    </td>
                    <td className="py-2.5 text-xs text-slate-400">
                      {b.gesperrt_grund || b.notizen || "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */

// ── Sauerstoff-Bericht ────────────────────────────────────────────────────────

function SauerstoffReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [von, setVon]           = useState(today);
  const [bis, setBis]           = useState(today);
  const [houseId, setHouseId]   = useState("");
  const [houses, setHouses]     = useState<any[]>([]);
  const [lieferungen, setLieferungen] = useState<any[]>([]);
  const [rueckgaben, setRueckgaben]   = useState<any[]>([]);
  const [bewegungen, setBewegungen]   = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"lieferungen" | "rueckgaben" | "bewegungen">("lieferungen");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    api.get("/houses").then(r => setHouses(r.data)).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    const params: Record<string, string> = { von, bis };
    if (houseId) params.house_id = houseId;
    const qs = new URLSearchParams(params).toString();
    try {
      const [l, r, b] = await Promise.all([
        api.get(`/o2/berichte/lieferungen?${qs}`),
        api.get(`/o2/berichte/rueckgaben?${qs}`),
        api.get(`/o2/bewegungen?${qs}`),
      ]);
      setLieferungen(l.data);
      setRueckgaben(r.data);
      setBewegungen(b.data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  const AKTION_LABEL: Record<string, string> = {
    abholen_lager:   "Aus Lager genommen",
    liefern_station: "Auf Station geliefert",
    abholen_station: "Leere eingesammelt",
    einlagern_leer:  "Leere eingelagert",
    einlagern_voll:  "Volle eingelagert",
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Von</label>
            <input type="date" value={von} onChange={e => setVon(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bis</label>
            <input type="date" value={bis} onChange={e => setBis(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Haus</label>
            <select value={houseId} onChange={e => setHouseId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Alle Häuser</option>
              {houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--brand-600)" }}>
          {loading ? "Lädt…" : "Bericht laden"}
        </button>
        {(lieferungen.length > 0 || rueckgaben.length > 0) && (
          <a
            href={`/api/o2/berichte/pdf?${new URLSearchParams({ von, bis, ...(houseId ? { house_id: houseId } : {}) })}`}
            target="_blank" rel="noreferrer"
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
            📄 PDF
          </a>
        )}
      </div>

      {/* Sub-Tabs */}
      {(lieferungen.length > 0 || rueckgaben.length > 0 || bewegungen.length > 0) && (
        <>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {([
              { key: "lieferungen", label: `📦 Lieferungen (${lieferungen.length})` },
              { key: "rueckgaben",  label: `📥 Rückgaben (${rueckgaben.length})` },
              { key: "bewegungen",  label: `📋 Alle Bewegungen (${bewegungen.length})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === "lieferungen" && (
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead><tr className="text-xs text-slate-500 uppercase">
                <th className="text-left px-3">Station</th>
                <th className="text-left px-3">Typ</th>
                <th className="text-right px-3">Anzahl</th>
                <th className="text-left px-3">Zeitraum</th>
              </tr></thead>
              <tbody>
                {lieferungen.map((r: any, i: number) => (
                  <tr key={i} className="bg-white rounded-xl">
                    <td className="px-3 py-2 rounded-l-xl font-medium">{r.station_name ?? "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.typ_name ?? "–"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.anzahl}</td>
                    <td className="px-3 py-2 rounded-r-xl text-slate-500 text-xs">{r.erster_tag} – {r.letzter_tag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "rueckgaben" && (
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead><tr className="text-xs text-slate-500 uppercase">
                <th className="text-left px-3">Station</th>
                <th className="text-left px-3">Typ</th>
                <th className="text-right px-3">Anzahl</th>
              </tr></thead>
              <tbody>
                {rueckgaben.map((r: any, i: number) => (
                  <tr key={i} className="bg-white rounded-xl">
                    <td className="px-3 py-2 rounded-l-xl font-medium">{r.station_name ?? "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.typ_name ?? "–"}</td>
                    <td className="px-3 py-2 rounded-r-xl text-right font-semibold">{r.anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "bewegungen" && (
            <div className="space-y-1.5">
              {bewegungen.map((b: any, i: number) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="font-mono text-slate-800 font-medium w-28 shrink-0">{b.barcode}</span>
                  <span className="flex-1 text-slate-600">{AKTION_LABEL[b.aktion] ?? b.aktion}</span>
                  {b.station_name && <span className="text-violet-600 text-xs">📍 {b.station_name}</span>}
                  <span className="text-slate-400 text-xs whitespace-nowrap">{b.timestamp?.slice(0,16).replace("T"," ")}</span>
                  {b.user_name && <span className="text-slate-400 text-xs">{b.user_name}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================ */
/* RÜCKSENDUNGEN-BERICHT                                        */
/* ============================================================ */
function RuecksendungenReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [von, setVon]     = useState(monthAgo);
  const [bis, setBis]     = useState(today);
  const [stationStats, setStationStats] = useState<any[]>([]);
  const [abschlussgruende, setAbschlussgruende] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"stationen" | "gruende" | "details">("stationen");

  const STATUS_LABEL: Record<string, string> = {
    offen: "Beim Lager", in_bearbeitung: "Beim Lager", beim_einkauf: "Beim Einkauf",
    zurueck_ans_lager: "Zurück ans Lager", abgeschlossen: "Abgeschlossen",
  };

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ von, bis }).toString();
      const { data } = await api.get(`/ruecksendungen/berichte/statistik?${qs}`);
      setStationStats(data.stationStats);
      setAbschlussgruende(data.abschlussgruende);
      setDetails(data.details);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Von</label>
            <input type="date" value={von} onChange={e => setVon(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bis</label>
            <input type="date" value={bis} onChange={e => setBis(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--brand-600)" }}>
            {loading ? "Lädt…" : "Bericht laden"}
          </button>
          {details.length > 0 && (
            <a href={`/api/ruecksendungen/berichte/pdf?${new URLSearchParams({ von, bis })}&token=${localStorage.getItem("token") ?? ""}`}
              target="_blank" rel="noreferrer"
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
              📄 PDF
            </a>
          )}
        </div>
      </div>

      {details.length === 0 && !loading && (
        <div className="card text-center text-slate-400 py-10">Keine Rücksendungen im gewählten Zeitraum.</div>
      )}

      {details.length > 0 && (
        <>
          {/* Sub-Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
            {([
              { key: "stationen", label: `📍 Nach Station (${stationStats.length})` },
              { key: "gruende",   label: `🏷 Abschlussgründe (${abschlussgruende.length})` },
              { key: "details",   label: `📋 Alle Vorgänge (${details.length})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === "stationen" && (
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead><tr className="text-xs text-slate-500 uppercase">
                <th className="text-left px-3">Station</th>
                <th className="text-right px-3">Anzahl</th>
                <th className="text-right px-3">Abgeschlossen</th>
                <th className="text-right px-3">⌀ Lager (Std.)</th>
                <th className="text-right px-3">⌀ Einkauf (Std.)</th>
              </tr></thead>
              <tbody>
                {stationStats.map((s: any, i: number) => (
                  <tr key={i} className="bg-white rounded-xl">
                    <td className="px-3 py-2 rounded-l-xl font-medium">{s.station_name}</td>
                    <td className="px-3 py-2 text-right">{s.anzahl}</td>
                    <td className="px-3 py-2 text-right text-green-600">{s.abgeschlossen}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{s.avg_lager_stunden ?? "–"}</td>
                    <td className="px-3 py-2 rounded-r-xl text-right text-slate-600">{s.avg_einkauf_stunden ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "gruende" && (
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead><tr className="text-xs text-slate-500 uppercase">
                <th className="text-left px-3">Abschlussgrund</th>
                <th className="text-right px-3">Anzahl</th>
              </tr></thead>
              <tbody>
                {abschlussgruende.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400 bg-white rounded-xl">Noch keine abgeschlossenen Vorgänge.</td></tr>
                )}
                {abschlussgruende.map((g: any, i: number) => (
                  <tr key={i} className="bg-white rounded-xl">
                    <td className="px-3 py-2 rounded-l-xl font-medium">{g.grund}</td>
                    <td className="px-3 py-2 rounded-r-xl text-right font-semibold">{g.anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "details" && (
            <div className="space-y-1.5">
              {details.map((d: any) => (
                <div key={d.id} className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-medium w-32 shrink-0">{d.station_name ?? "–"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  <span className="text-slate-400 text-xs whitespace-nowrap">
                    {new Date(d.created_at).toLocaleDateString("de-DE")}
                  </span>
                  {d.lager_stunden_gesamt != null && (
                    <span className="text-xs text-blue-600">Lager: {d.lager_stunden_gesamt} Std.</span>
                  )}
                  {d.einkauf_stunden != null && (
                    <span className="text-xs text-purple-600">Einkauf: {d.einkauf_stunden} Std.</span>
                  )}
                  {d.abschlussgrund && (
                    <span className="text-xs text-green-600 ml-auto">✓ {d.abschlussgrund}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
