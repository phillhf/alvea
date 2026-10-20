import { useEffect, useState } from "react";
import { api } from "../api/client";
import { confirmDialog } from "../components/Dialog";
import { useToast } from "../contexts/ToastContext";
import { BarcodeInput } from "../components/BarcodeInput";

interface Flasche { id: string; barcode: string; status: string; typ_name: string|null; lager_name: string|null; house_name: string|null; station_name: string|null; }
interface Station  { id: string; name: string; }
interface Lager    { id: string; name: string; house_name: string|null; }
interface Typ      { id: string; name: string; }
interface Anfrage  { id: string; station_id: string; station_name: string|null; typ_id: string|null; typ_name: string|null; anzahl: number; status: "offen"|"angenommen"|"geliefert"; erstellt_von: string|null; created_at: string; notiz: string|null; }

type Modus = "wareneingang" | "tour_starten" | "leer_einsammeln" | "ins_leergutlager" | "warenausgang";
type Tab   = "anfragen" | "scan" | "uebersicht";

const MODI: { key: Modus; label: string; icon: string; desc: string; lagerNoetig: boolean }[] = [
  { key: "wareneingang",     label: "Wareneingang",      icon: "📦", desc: "Lieferant bringt volle Flaschen",    lagerNoetig: true  },
  { key: "tour_starten",     label: "Tour / Anfrage",    icon: "🚚", desc: "Volle Flaschen aus Volllager nehmen", lagerNoetig: false },
  { key: "leer_einsammeln",  label: "Leere einsammeln",  icon: "📥", desc: "Leere Flaschen von Station holen",   lagerNoetig: false },
  { key: "ins_leergutlager", label: "Ins Leergutlager",  icon: "↩️", desc: "Leere Flaschen einlagern",          lagerNoetig: false },
  { key: "warenausgang",     label: "Warenausgang",      icon: "📤", desc: "Leere Flaschen an Lieferanten",     lagerNoetig: false },
];

const STATUS: Record<string, { label: string; color: string }> = {
  volllager:        { label: "Volllager",        color: "bg-green-100 text-green-800"   },
  unterwegs:        { label: "Unterwegs",        color: "bg-blue-100 text-blue-800"     },
  auf_station:      { label: "Auf Station",      color: "bg-violet-100 text-violet-800" },
  leer_unterwegs:   { label: "Leer/Unterwegs",   color: "bg-amber-100 text-amber-800"   },
  leergutlager:     { label: "Leergutlager",     color: "bg-slate-100 text-slate-600"   },
  beim_lieferanten: { label: "Beim Lieferanten", color: "bg-red-50 text-red-600"        },
};

const ANFRAGE_STATUS: Record<string, { label: string; color: string }> = {
  offen:      { label: "Offen",     color: "bg-amber-100 text-amber-800" },
  angenommen: { label: "Unterwegs", color: "bg-blue-100 text-blue-800"   },
  geliefert:  { label: "Geliefert", color: "bg-green-100 text-green-800" },
};

export default function OxygenTransport() {
  const toast = useToast();
  const [tab, setTab]             = useState<Tab>("anfragen");
  const [modus, setModus]         = useState<Modus>("wareneingang");
  const [barcode, setBarcode]     = useState("");
  const [lagerId, setLagerId]     = useState("");
  const [typId, setTypId]         = useState("");
  const [stations, setStations]   = useState<Station[]>([]);
  const [lager, setLager]         = useState<Lager[]>([]);
  const [typen, setTypen]         = useState<Typ[]>([]);
  const [flaschen, setFlaschen]   = useState<Flasche[]>([]);
  const [barcodes, setBarcodes]   = useState<string[]>([]);
  const [anfragen, setAnfragen]   = useState<Anfrage[]>([]);
  const [loading, setLoading]     = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [sessionLog, setSessionLog] = useState<{ barcode: string; von: string; nach: string; ts: string; neu: boolean }[]>([]);
  const [aktivAnfrage, setAktivAnfrage] = useState<Anfrage | null>(null);
  const [anfrageScans, setAnfrageScans] = useState(0);

  useEffect(() => {
    api.get<Station[]>("/stations").then(r => setStations(r.data)).catch(() => {});
    api.get("/o2/barcodes").then(r => setBarcodes(r.data)).catch(() => {});
    api.get<Lager[]>("/o2/lager").then(r => {
      setLager(r.data);
      if (r.data.length === 1) setLagerId(r.data[0].id);
    }).catch(() => {});
    api.get<Typ[]>("/o2/typen").then(r => setTypen(r.data)).catch(() => {});
    loadAnfragen();
  }, []);

  useEffect(() => {
    if (tab === "uebersicht") loadFlaschen();
    if (tab === "anfragen")   loadAnfragen();
  }, [tab]);

  function loadAnfragen() { api.get<Anfrage[]>("/o2/anfragen").then(r => setAnfragen(r.data)).catch(() => {}); }
  function loadFlaschen() { api.get<Flasche[]>("/o2/flaschen").then(r => setFlaschen(r.data)).catch(() => {}); }

  async function handleAnnehmen(anfrage: Anfrage) {
    try {
      await api.patch(`/o2/anfragen/${anfrage.id}/status`, { status: "angenommen" });
      setAktivAnfrage(anfrage);
      setAnfrageScans(0);
      setSessionLog([]);
      setModus("tour_starten");
      setTab("scan");
      loadAnfragen();
      toast.success(`Anfrage angenommen – scanne jetzt ${anfrage.anzahl} Flasche(n) aus dem Volllager.`);
    } catch { toast.error("Fehler."); }
  }

  async function handleGeliefert() {
    if (!aktivAnfrage) return;
    const scannedBarcodes = sessionLog.map(e => e.barcode);
    const gescannt = scannedBarcodes.length;
    const bestellt = aktivAnfrage.anzahl;

    // Wenn weniger gescannt als bestellt: Bestätigung + Anpassung anbieten
    if (gescannt < bestellt) {
      const adjust = await confirmDialog(
        `Bestellt: ${bestellt} Flaschen\nGescannt: ${gescannt} Flaschen\n\nAnzahl der Anfrage auf ${gescannt} anpassen und als geliefert markieren?`,
        { confirmLabel: "Anpassen und liefern" }
      );
      if (!adjust) return;
      await api.patch(`/o2/anfragen/${aktivAnfrage.id}/anzahl`, { anzahl: gescannt }).catch(() => {});
    }

    try {
      await api.patch(`/o2/anfragen/${aktivAnfrage.id}/status`, { status: "geliefert", barcodes: scannedBarcodes });
      setAktivAnfrage(null);
      setAnfrageScans(0);
      setSessionLog([]);
      loadAnfragen();
      toast.success("Auftrag abgeschlossen – Flaschen auf Station gebucht.");
    } catch { toast.error("Fehler beim Abschließen."); }
  }

  async function handleScan() {
    const bc = barcode.trim();
    if (!bc) return;
    const modusDef = MODI.find(m => m.key === modus)!;
    if (modusDef.lagerNoetig && !lagerId && lager.length > 1) { toast.error("Bitte Lager wählen."); return; }

    setLoading(true);
    try {
      const payload: Record<string, string> = { barcode: bc, modus };
      if (lagerId) payload.lager_id = lagerId;
      if (typId)   payload.typ_id   = typId;

      const r = await api.post("/o2/scan", payload);
      const { von, nach, auto_created } = r.data;
      const msg = auto_created
        ? `✓ ${bc}: Neu angelegt → ${STATUS[nach]?.label}`
        : `✓ ${bc}: ${STATUS[von]?.label} → ${STATUS[nach]?.label}`;
      toast.success(msg);

      setSessionLog(prev => [{ barcode: bc, von, nach, ts: new Date().toLocaleTimeString("de-DE"), neu: !!auto_created }, ...prev.slice(0, 49)]);
      setBarcodes(prev => prev.includes(bc) ? prev : [...prev, bc]);
      if (aktivAnfrage && modus === "tour_starten") setAnfrageScans(n => n + 1);
      setBarcode("");
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const st   = err?.response?.data?.aktueller_status;
      if (code === "flasche_nicht_gefunden") toast.error(`Unbekannte Flasche: ${bc} – nur beim Wareneingang wird auto-angelegt.`);
      else if (code === "ungueltige_aktion") toast.error(`Flasche ist gerade: ${STATUS[st]?.label ?? st} – falscher Modus?`);
      else toast.error(`Fehler: ${err?.response?.data?.detail ?? code ?? ""}`);
    } finally { setLoading(false); }
  }

  const modusDef   = MODI.find(m => m.key === modus)!;
  const offeneAnfr = anfragen.filter(a => a.status !== "geliefert");
  const filtered   = filterStatus ? flaschen.filter(f => f.status === filterStatus) : flaschen;
  const bestand    = Object.entries(STATUS).map(([key, s]) => ({
    key, ...s, count: flaschen.filter(f => f.status === key).length
  })).filter(s => s.count > 0);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">💨 Sauerstofftransport</h1>

      {/* Tab-Navigation */}
      <div className="flex gap-2 border-b border-slate-200">
        {([
          { key: "anfragen",   label: `📋 Anfragen${offeneAnfr.length ? ` (${offeneAnfr.length})` : ""}` },
          { key: "scan",       label: "🔍 Scannen" },
          { key: "uebersicht", label: "📦 Übersicht" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={tab === t.key
              ? { borderBottomColor: "var(--brand-600)", color: "var(--brand-700)" }
              : { borderBottomColor: "transparent", color: "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Anfragen ── */}
      {tab === "anfragen" && (
        <div className="space-y-2">
          {offeneAnfr.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Keine offenen Anfragen.</p>}
          {offeneAnfr.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800 text-lg">{a.anzahl}× {a.typ_name ?? "Flasche"}</p>
                  <p className="text-sm text-slate-600">📍 {a.station_name ?? "–"}</p>
                  {a.notiz && <p className="text-xs text-slate-400 mt-0.5">„{a.notiz}"</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(a.created_at).toLocaleString("de-DE")}{a.erstellt_von ? ` · ${a.erstellt_von}` : ""}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ANFRAGE_STATUS[a.status].color}`}>
                  {ANFRAGE_STATUS[a.status].label}
                </span>
              </div>
              {a.status === "offen" && (
                <button onClick={() => handleAnnehmen(a)}
                  className="w-full py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "var(--brand-600)" }}>
                  ✋ Annehmen & Flaschen scannen
                </button>
              )}
              {a.status === "angenommen" && (
                <div className="flex gap-2">
                  <button onClick={() => { setAktivAnfrage(a); setAnfrageScans(0); setSessionLog([]); setModus("tour_starten"); setTab("scan"); }}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: "var(--brand-600)" }}>
                    🚚 Weiter scannen
                  </button>
                  <button onClick={async () => { setAktivAnfrage(a); await handleGeliefert(); }}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800">
                    ✓ Geliefert
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scan ── */}
      {tab === "scan" && (
        <div className="space-y-4">

          {/* Aktive Anfrage Banner */}
          {aktivAnfrage && (
            <div className={`rounded-xl p-4 border space-y-3 ${anfrageScans >= aktivAnfrage.anzahl ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"}`}>
              <div>
                <p className={`font-semibold ${anfrageScans >= aktivAnfrage.anzahl ? "text-green-800" : "text-blue-800"}`}>
                  Anfrage: {aktivAnfrage.anzahl}× {aktivAnfrage.typ_name ?? "Flasche"} → {aktivAnfrage.station_name}
                </p>
                <p className={`text-sm mt-0.5 ${anfrageScans >= aktivAnfrage.anzahl ? "text-green-600" : "text-blue-600"}`}>
                  {anfrageScans >= aktivAnfrage.anzahl
                    ? "✓ Alle Flaschen gescannt!"
                    : `${anfrageScans} von ${aktivAnfrage.anzahl} gescannt`}
                </p>
                {anfrageScans < aktivAnfrage.anzahl && anfrageScans > 0 && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    Nicht genug im Lager? Trotzdem abschließen – Anzahl wird automatisch angepasst.
                  </p>
                )}
              </div>
              <button onClick={handleGeliefert}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white ${anfrageScans >= aktivAnfrage.anzahl ? "bg-green-500 hover:bg-green-600" : "bg-slate-400 hover:bg-slate-500"}`}>
                ✓ Auftrag abschließen &amp; Flaschen auf Station buchen
              </button>
            </div>
          )}

          {/* Modus-Auswahl */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Was machst du gerade?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MODI.map(m => (
                <button key={m.key} onClick={() => { setModus(m.key); if (m.key !== "tour_starten") { setAktivAnfrage(null); setAnfrageScans(0); } }}
                  className="p-3 rounded-xl text-left border-2 transition-all"
                  style={modus === m.key
                    ? { borderColor: "var(--brand-500)", backgroundColor: "var(--brand-50)", color: "var(--brand-800)" }
                    : { borderColor: "#e2e8f0", backgroundColor: "white", color: "#334155" }}>
                  <span className="text-xl block mb-1">{m.icon}</span>
                  <span className="text-sm font-semibold block">{m.label}</span>
                  <span className="text-xs text-slate-500 block mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Lager-Auswahl (nur Wareneingang) */}
          {modusDef.lagerNoetig && lager.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lager *</label>
              <select value={lagerId} onChange={e => setLagerId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">– Lager wählen –</option>
                {lager.map(l => <option key={l.id} value={l.id}>{l.name}{l.house_name ? ` (${l.house_name})` : ""}</option>)}
              </select>
            </div>
          )}

          {/* Flaschentyp (nur Wareneingang) */}
          {modusDef.lagerNoetig && typen.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Flaschentyp <span className="font-normal text-slate-400">(optional)</span></label>
              <select value={typId} onChange={e => setTypId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">– kein Typ –</option>
                {typen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Scan-Eingabe */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {modusDef.icon} Barcode scannen
              {modus === "wareneingang" && <span className="ml-1 text-slate-400 font-normal">(neue Flaschen werden automatisch angelegt)</span>}
            </label>
            <div onKeyDown={e => e.key === "Enter" && handleScan()}>
              <BarcodeInput value={barcode} onChange={setBarcode} options={barcodes} placeholder="Scannen oder eingeben…" />
            </div>
          </div>

          <button onClick={handleScan} disabled={loading || !barcode.trim()}
            className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--brand-600)" }}>
            {loading ? "…" : `${modusDef.icon} ${modusDef.label}`}
          </button>

          {/* Session-Log */}
          {sessionLog.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <p className="text-xs font-medium text-slate-500 px-3 py-2 border-b border-slate-100">
                {modusDef.label} – diese Sitzung ({sessionLog.length})
              </p>
              <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
                {sessionLog.map((e, i) => (
                  <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="font-mono font-medium text-slate-800 flex-1 truncate">{e.barcode}</span>
                    {e.neu && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">NEU</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS[e.nach]?.color ?? "bg-slate-100"}`}>
                      {STATUS[e.nach]?.label ?? e.nach}
                    </span>
                    <span className="text-slate-400 text-xs shrink-0">{e.ts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Übersicht ── */}
      {tab === "uebersicht" && (
        <div className="space-y-3">
          {/* Bestandsübersicht */}
          {bestand.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {bestand.map(s => (
                <div key={s.key} className={`rounded-xl px-3 py-2.5 ${s.color}`}>
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {["", ...Object.keys(STATUS)].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterStatus === s ? "bg-slate-700 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-600"
                }`}>
                {s === "" ? `Alle (${flaschen.length})` : `${STATUS[s].label} (${flaschen.filter(f => f.status === s).length})`}
              </button>
            ))}
            <button onClick={loadFlaschen} className="ml-auto px-3 py-1 rounded-full text-xs bg-white border border-slate-200 text-slate-500">🔄</button>
          </div>

          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Keine Flaschen.</p>}
            {filtered.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-semibold text-slate-800 text-sm">{f.barcode}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.typ_name ?? "–"} · {f.lager_name ?? "Kein Lager"}{f.house_name ? ` (${f.house_name})` : ""}
                  </p>
                  {f.station_name && <p className="text-xs text-violet-600">📍 {f.station_name}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS[f.status]?.color ?? ""}`}>
                  {STATUS[f.status]?.label ?? f.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
