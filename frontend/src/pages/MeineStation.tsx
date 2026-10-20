import { useToast } from "../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useModules } from "../contexts/ModulesContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";
import { BarcodeScanner } from "../components/BarcodeScanner";

/* ─── Typen ─────────────────────────────────────────── */
interface Station { id: string; name: string; area_name: string; }
interface Room    { id: string; room_number: string; beds: Bed[]; }
interface Bed     { id: string; bed_number: string; barcode: string | null;
                    bed_type_name: string | null; status: string; }
interface Task    { id: string; status: string; cleaning_type: string;
                    bed_number?: string; room_number: string; station_name?: string;
                    assigned_to_name: string | null; created_at: string; }
interface Pathogen { id: string; code: string; name: string; }
interface Barcode  { code: string; description: string | null; }

/* ─── Status-Darstellung ─────────────────────────────── */
const TASK_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  offen:         { label: "Auftrag offen",      color: "bg-amber-100 text-amber-800",    icon: "🕐" },
  unterwegs:     { label: "Reiniger unterwegs", color: "bg-blue-100 text-blue-800",      icon: "🚶" },
  angekommen:    { label: "Reiniger da",        color: "bg-indigo-100 text-indigo-700",  icon: "📍" },
  laufend:       { label: "In Bearbeitung",     color: "bg-violet-100 text-violet-700",  icon: "🔄" },
  abgeschlossen: { label: "Fertig",             color: "bg-emerald-100 text-emerald-700",icon: "✅" },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000;
  if (diff < 60)   return `${Math.round(diff)} Min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} Std.`;
  return `${Math.round(diff / 1440)} T.`;
}

/* ─── Hilfen ─────────────────────────────────────────── */
/** "Station 1A" statt "Station 1A (Station 1A)" – Bereich nur anzeigen, wenn er sich unterscheidet */
function stationLabel(s: Station): string {
  return s.area_name && s.area_name !== s.name ? `${s.name} (${s.area_name})` : s.name;
}

function StationSelect({ stations, value, onChange }: { stations: Station[]; value: string; onChange: (id: string) => void }) {
  // Bei nur einer Station keine Auswahl anzeigen – sie ist vorausgewählt
  if (stations.length === 1) return null;
  return (
    <div className="space-y-1">
      <label className="label">Station *</label>
      <select className="input w-full" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Station auswählen —</option>
        {stations.map(s => <option key={s.id} value={s.id}>{stationLabel(s)}</option>)}
      </select>
    </div>
  );
}

/** Zimmer + Betten einer Station laden (für Bett-Kacheln und Zimmerauswahl) */
function useStationRooms(stationId: string) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!stationId) { setRooms([]); return; }
    setLoading(true);
    api.get<Room[]>(`/defects/stations/${stationId}/beds`)
      .then(r => setRooms(r.data))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [stationId]);
  return { rooms, loading };
}

const bedIsBusy = (b: Bed) => !!b.status && b.status !== "abgeschlossen" && b.status !== "frei";

/* ─── Defekt-Modal ───────────────────────────────────── */
interface DefectModalProps { stations: Station[]; onClose: () => void; }
function DefectModal({ stations, onClose }: DefectModalProps) {
  const toast = useToast();
  const [barcodes, setBarcodes]       = useState<Barcode[]>([]);
  const [suggestions, setSuggestions] = useState<Barcode[]>([]);
  const [showSug, setShowSug]         = useState(false);
  const [stationId, setStationId]     = useState(stations.length === 1 ? stations[0].id : "");
  const [roomId, setRoomId]           = useState("");
  const [barcode, setBarcode]         = useState("");
  const [location, setLocation]       = useState("");
  const [description, setDescription] = useState("");
  const [scanning, setScanning]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const { rooms } = useStationRooms(stationId);

  useEffect(() => { api.get<Barcode[]>("/barcodes").then(r => setBarcodes(r.data)); }, []);
  useEffect(() => { setRoomId(""); }, [stationId]);

  function onBarcodeInput(val: string) {
    setBarcode(val);
    if (val.length >= 1) {
      const q = val.toLowerCase();
      setSuggestions(barcodes.filter(b => b.code.toLowerCase().includes(q)).slice(0, 8));
      setShowSug(true);
    } else setShowSug(false);
  }

  async function submit() {
    if (!stationId || !description.trim()) return;
    setSaving(true);
    try {
      await api.post("/defects", {
        scanned_barcode: barcode.trim() || undefined,
        title:           description.trim(),
        station_id:      stationId,
        room_id:         roomId || undefined,
        notes:           location.trim() ? `Standort: ${location.trim()}` : undefined,
        severity:        "medium",
      });
      toast.success("Defekt gemeldet");
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Speichern");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md space-y-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">🔧 Defektes Bett melden</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <StationSelect stations={stations} value={stationId} onChange={setStationId} />
        <div className="space-y-1">
          <label className="label">Was ist defekt? *</label>
          <input className="input" placeholder="z. B. Seitengitter defekt, Bremse blockiert"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {stationId && rooms.length > 0 && (
          <div className="space-y-1">
            <label className="label">Zimmer <span className="text-slate-400 font-normal">(optional)</span></label>
            <select className="input w-full" value={roomId} onChange={e => setRoomId(e.target.value)}>
              <option value="">— kein bestimmtes Zimmer —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>Zimmer {r.room_number}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label className="label">Bett-Nummer / Barcode <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input className="input w-full" placeholder="Eingeben, auswählen oder scannen…"
                value={barcode} autoComplete="off"
                onChange={e => onBarcodeInput(e.target.value)}
                onFocus={() => barcode.length >= 1 && setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 150)} />
              {showSug && suggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-md overflow-hidden">
                  {suggestions.map(b => (
                    <button key={b.code} type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      onMouseDown={() => { setBarcode(b.code); setShowSug(false); }}>
                      <span className="font-mono text-sm font-medium">{b.code}</span>
                      {b.description && <span className="text-xs text-slate-400 ml-2">{b.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn-ghost !px-3" onClick={() => setScanning(true)}>📷</button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="label">Genauer Standort <span className="text-slate-400 font-normal">(optional)</span></label>
          <input className="input" placeholder="z. B. Flur, Lager, vor Zimmer 12"
            value={location} onChange={e => setLocation(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={saving || !stationId || !description.trim()}
            className="btn-primary flex-1">
            {saving ? "Wird gesendet…" : "Defekt melden"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
        {scanning && <BarcodeScanner onScan={code => { setBarcode(code); setScanning(false); }} onClose={() => setScanning(false)} />}
      </div>
    </div>
  );
}

/* ─── Reinigung-Modal ────────────────────────────────── */
interface ReinigungModalProps { stations: Station[]; onClose: () => void; onSaved: () => void; }
function ReinigungModal({ stations, onClose, onSaved }: ReinigungModalProps) {
  const toast = useToast();
  const [stationId, setStationId]     = useState(stations.length === 1 ? stations[0].id : "");
  const [bedId, setBedId]             = useState("");
  const [cleaningType, setCleaningType] = useState<"normal" | "infektioes">("normal");
  const [pathogens, setPathogens]     = useState<Pathogen[]>([]);
  const [pathogenId, setPathogenId]   = useState("");
  const [saving, setSaving]           = useState(false);
  const { rooms, loading } = useStationRooms(stationId);

  useEffect(() => { setBedId(""); }, [stationId]);
  useEffect(() => {
    api.get<Pathogen[]>("/pathogens").then(r => setPathogens(r.data));
  }, []);

  async function submit() {
    if (!bedId) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        bed_id:        bedId,
        category:      "bed_cleaning",
        cleaning_type: cleaningType,
        pathogens:     cleaningType === "infektioes" && pathogenId ? [pathogenId] : [],
      });
      onSaved();
    } catch (e: any) {
      const err = e.response?.data?.error;
      if (err === "active_task_exists") {
        toast.error("Für diesen Stellplatz existiert bereits ein aktiver Auftrag.");
      } else {
        toast.error(err || "Fehler beim Speichern");
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md space-y-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">🛏 Bettenreinigung anfordern</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <StationSelect stations={stations} value={stationId} onChange={setStationId} />

        {/* Bett direkt antippen (statt Zimmer- und Stellplatz-Auswahlliste) */}
        {stationId && (
          <div className="space-y-2">
            <label className="label">Bett antippen *</label>
            {loading ? (
              <p className="text-sm text-slate-400">Wird geladen…</p>
            ) : rooms.length === 0 ? (
              <p className="text-sm text-slate-400">Für diese Station sind keine Zimmer angelegt.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {rooms.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Zi. {r.room_number}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {r.beds.map(b => {
                        const busy = bedIsBusy(b);
                        const selected = bedId === b.id;
                        return (
                          <button key={b.id} type="button" disabled={busy}
                            title={busy ? "Bereits in Bearbeitung" : b.bed_type_name ?? undefined}
                            onClick={() => setBedId(b.id)}
                            className={`min-w-[3rem] px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              selected ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)] text-[color:var(--brand-700)]"
                              : busy ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                              : "border-slate-200 hover:border-slate-300"}`}>
                            {b.bed_number}{busy ? " ⏳" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Art */}
        {bedId && (
          <div className="space-y-2">
            <label className="label">Reinigungsart *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "normal",     label: "🟢 Normal",    desc: "Standardaufbereitung" },
                { value: "infektioes", label: "🔴 Infektiös", desc: "Erhöhte Hygienemaßnahmen" },
              ].map(({ value, label, desc }) => (
                <button key={value} type="button"
                  onClick={() => { setCleaningType(value as any); setPathogenId(""); }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    cleaningType === value
                      ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]"
                      : "border-slate-200 hover:border-slate-300"
                  }`}>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
            {cleaningType === "infektioes" && (
              <div className="space-y-1">
                <label className="label">Erreger <span className="text-slate-400 font-normal">(optional)</span></label>
                <select className="input" value={pathogenId} onChange={e => setPathogenId(e.target.value)}>
                  <option value="">— Erreger auswählen —</option>
                  {pathogens.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={saving || !bedId}
            className="btn-primary flex-1">
            {saving ? "Wird gespeichert…" : "Reinigung anfordern"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Scheuer-Wisch Modal ────────────────────────── */
interface Aufbereitungsart { id: string; name: string; instructions: string; when_to_use: string; }
interface ZimmerModalProps { stations: Station[]; onClose: () => void; onSaved: () => void; }
function ScheuernWischModal({ stations, onClose, onSaved }: ZimmerModalProps) {
  const toast = useToast();
  const [stationId, setStationId]       = useState(stations.length === 1 ? stations[0].id : "");
  const [rooms, setRooms]               = useState<Room[]>([]);
  const [roomId, setRoomId]             = useState("");
  const [aufbereitungsarten, setAufbereitungsarten] = useState<Aufbereitungsart[]>([]);
  const [aufbereitungsartId, setAufbereitungsartId] = useState("");
  const [wunschDatum, setWunschDatum]   = useState("");
  const [wunschZeit, setWunschZeit]     = useState("");
  const [freiChecked, setFreiChecked]   = useState(false);
  const [freitext, setFreitext]         = useState("Im Patientenzimmer befinden sich keine privaten Gegenstände.");
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    api.get<Aufbereitungsart[]>("/aufbereitungsarten").then(r => {
      const aktiv = r.data.filter((a: any) => a.active);
      setAufbereitungsarten(aktiv);
      // Nur eine Maßnahme vorhanden → direkt vorauswählen
      if (aktiv.length === 1) setAufbereitungsartId(aktiv[0].id);
    });
    api.get<{ key: string; value: string }[]>("/settings").then(r => {
      const s = r.data.find((x: any) => x.key === "sw_freitext");
      if (s?.value) setFreitext(s.value);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (stationId) {
      api.get<Room[]>(`/rooms?station_id=${stationId}`).then(r => {
        setRooms(r.data); setRoomId("");
      });
    }
  }, [stationId]);

  const selectedArt = aufbereitungsarten.find(a => a.id === aufbereitungsartId);
  // Ohne angelegte Desinfektionsmaßnahmen darf das Anfordern nicht blockiert sein
  const artPflicht = aufbereitungsarten.length > 0;

  async function submit() {
    if (!stationId || !roomId || (artPflicht && !aufbereitungsartId)) return;
    if (!freiChecked) { toast.error("Bitte bestätigen Sie die Pflichtangabe."); return; }
    setSaving(true);
    try {
      const wunschtermin = wunschDatum
        ? `${wunschDatum}T${wunschZeit || "00:00"}`
        : undefined;
      await api.post("/tasks", {
        room_id:             roomId,
        category:            "room_cleaning",
        cleaning_type:       "schlussdesinfektion",
        aufbereitungsart_id: aufbereitungsartId || undefined,
        pathogens:           [],
        wunschtermin,
      });
      toast.success("Scheuer-Wisch angefordert");
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Speichern");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md space-y-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">🧹 Scheuer-Wisch anfordern</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Station */}
        {stations.length > 1 && (
          <div className="space-y-1">
            <label className="label">Station *</label>
            <select className="input w-full" value={stationId} onChange={e => setStationId(e.target.value)}>
              <option value="">— Station auswählen —</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Zimmer */}
        <div className="space-y-1">
          <label className="label">Zimmer *</label>
          <select className="input w-full" value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!stationId}>
            <option value="">— Zimmer auswählen —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>Zimmer {r.room_number}</option>)}
          </select>
        </div>

        {/* Desinfektionsart */}
        {artPflicht && <div className="space-y-1">
          <label className="label">Desinfektionsart *</label>
          <select className="input w-full" value={aufbereitungsartId} onChange={e => setAufbereitungsartId(e.target.value)}>
            <option value="">— Desinfektionsart auswählen —</option>
            {aufbereitungsarten.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {selectedArt?.when_to_use && (
            <p className="text-xs text-slate-500 mt-1">ℹ️ {selectedArt.when_to_use}</p>
          )}
        </div>}

        {/* Wunschtermin */}
        <div className="space-y-1">
          <label className="label">Wunschtermin <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <input type="date" className="input flex-1" value={wunschDatum}
              onChange={e => setWunschDatum(e.target.value)}
              min={new Date().toISOString().slice(0,10)} />
            <input type="time" className="input w-28" value={wunschZeit}
              onChange={e => setWunschZeit(e.target.value)}
              disabled={!wunschDatum} />
          </div>
          {wunschDatum && <p className="text-xs text-slate-400">Muss von der Reinigung bestätigt werden.</p>}
        </div>

        {/* Pflicht-Bestätigung */}
        <label className="flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors"
          style={{ borderColor: freiChecked ? "var(--brand-600)" : "#e2e8f0", backgroundColor: freiChecked ? "var(--brand-50)" : "white" }}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded"
            checked={freiChecked} onChange={e => setFreiChecked(e.target.checked)} />
          <span className="text-sm font-medium text-slate-800">{freitext}</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={saving || !stationId || !roomId || (artPflicht && !aufbereitungsartId) || !freiChecked}
            className="btn-primary flex-1">
            {saving ? "Wird gespeichert…" : "Scheuer-Wisch anfordern"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/* ─── O₂-Anfrage Modal ───────────────────────────────── */
interface O2ModalProps { stations: Station[]; onClose: () => void; }
function O2AnfrageModal({ stations, onClose }: O2ModalProps) {
  const toast     = useToast();
  const [typen, setTypen]     = useState<{ id: string; name: string }[]>([]);
  const [stationId, setStationId] = useState(stations.length === 1 ? stations[0].id : "");
  const [typId, setTypId]     = useState("");
  const [anzahl, setAnzahl]   = useState(1);
  const [notiz, setNotiz]     = useState("");
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.get("/o2/typen").then(r => setTypen(r.data)).catch(() => {});
  }, []);

  async function handleSubmit() {
    if (!stationId) { toast.error("Bitte Station auswählen."); return; }
    if (anzahl < 1)  { toast.error("Mindestens 1 Flasche."); return; }
    setSaving(true);
    try {
      await api.post("/o2/anfragen", {
        station_id: stationId,
        typ_id:     typId || null,
        anzahl,
        notiz:      notiz.trim() || undefined,
      });
      toast.success(`Sauerstoff-Anfrage gesendet: ${anzahl}× ${typen.find(t => t.id === typId)?.name ?? "Flasche"}`);
      onClose();
    } catch (err: any) {
      const status = err?.response?.status;
      const code   = err?.response?.data?.error;
      if (status === 403) toast.error("Keine Berechtigung (403). Bitte neu anmelden.");
      else if (status === 400) toast.error(`Ungültige Eingabe (400): ${code ?? ""}`);
      else if (status === 404) toast.error("Endpunkt nicht gefunden (404) – Server neu starten?");
      else toast.error(`Fehler (${status ?? "?"}): ${err?.response?.data?.detail ?? code ?? err?.message ?? ""}`);
    }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">💨 Sauerstoff anfordern</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {stations.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Station *</label>
            <select value={stationId} onChange={e => setStationId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2">
              <option value="">– Station wählen –</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Anzahl *</label>
            <input type="number" min={1} max={999} value={anzahl}
              onChange={e => setAnzahl(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 text-center font-semibold" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Flaschentyp</label>
            <select value={typId} onChange={e => setTypId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2">
              <option value="">– beliebig –</option>
              {typen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notiz (optional)</label>
          <input value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="z.B. bitte bis 14 Uhr"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleSubmit} disabled={saving || !stationId}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--brand-600)" }}>
            {saving ? "Wird gesendet…" : "Anfrage senden"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Spind-Anfrage Modal ────────────────────────────── */
interface SpindModalProps { stations: Station[]; onClose: () => void; }
function SpindAnfrageModal({ stations, onClose }: SpindModalProps) {
  const toast = useToast();
  const [vorname, setVorname]           = useState("");
  const [nachname, setNachname]         = useState("");
  const [berufsgruppe, setBerufsgruppe] = useState("");
  const [startsAt, setStartsAt]         = useState("");
  const [endsAt, setEndsAt]             = useState("");
  const [saving, setSaving]             = useState(false);
  const [berufsgruppen, setBerufsgruppen] = useState<{id:string;name:string}[]>([]);

  const station = stations[0] ?? null;

  useEffect(() => {
    api.get<{id:string;name:string;active:number}[]>("/berufsgruppen")
      .then(r => setBerufsgruppen(r.data.filter(b => b.active)));
  }, []);

  async function submit() {
    if (!vorname.trim() || !nachname.trim() || !berufsgruppe) return;
    setSaving(true);
    try {
      await api.post("/lockers/requests", {
        vorname:        vorname.trim(),
        nachname:       nachname.trim(),
        berufsgruppe:   berufsgruppe,
        station_id:   station?.id,
        station_name: station?.name,
        starts_at:    startsAt || undefined,
        ends_at:      endsAt   || undefined,
      });
      toast.success("Spind-Anfrage wurde gesendet");
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Senden");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md space-y-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">🔐 Spind-Anfrage</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Station – schreibgeschützt */}
        {station && (
          <div className="space-y-1">
            <label className="label">Bereich / Station</label>
            <div className="input bg-slate-50 text-slate-500 cursor-not-allowed">{station.name}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="label">Vorname *</label>
            <input className="input w-full" value={vorname} onChange={e => setVorname(e.target.value)} placeholder="Vorname" />
          </div>
          <div className="space-y-1">
            <label className="label">Nachname *</label>
            <input className="input w-full" value={nachname} onChange={e => setNachname(e.target.value)} placeholder="Nachname" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="label">Berufsgruppe / Funktion *</label>
          <select className="input w-full" value={berufsgruppe} onChange={e => setBerufsgruppe(e.target.value)}>
            <option value="">— Bitte auswählen —</option>
            {berufsgruppen.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="label">Von (optional)</label>
            <input type="date" className="input w-full" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="label">Bis (optional)</label>
            <input type="date" className="input w-full" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit}
            disabled={saving || !vorname.trim() || !nachname.trim() || !berufsgruppe}
            className="btn-primary flex-1">
            {saving ? "Wird gesendet…" : "Anfrage senden"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Hauptseite ─────────────────────────────────────── */
interface Announcement { id: string; title: string; body: string; priority: "normal"|"wichtig"|"dringend"; expires_at: string|null; created_by: string; created_at: string; }
interface SpindRequest { id: string; vorname: string; nachname: string; berufsgruppe: string; status: "offen"|"zugewiesen"|"abgelehnt"; starts_at: string|null; ends_at: string|null; locker_number: string|null; created_at: string; resolved_at: string|null; }

export default function MeineStation() {
  const toast = useToast();
  const { user, can } = useAuth();
  const { isActive, loading: modulesLoading } = useModules();
  // Knöpfe nur für aktive Module (während des Ladens alles zeigen, damit nichts springt)
  const modulAn = (key: string) => modulesLoading || isActive(key);
  const [stations, setStations]   = useState<Station[]>([]);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [spindRequests, setSpindRequests] = useState<SpindRequest[]>([]);
  const [o2Anfragen, setO2Anfragen]       = useState<{id:string;anzahl:number;geliefert_anzahl:number;typ_name:string|null;status:string;created_at:string}[]>([]);
  const [o2Open, setO2Open]               = useState(true);
  const [ruecksendungen, setRuecksendungen] = useState<{id:string;artikel:string;menge:string;status:string;created_at:string}[]>([]);
  const [rueckOpen, setRueckOpen]           = useState(true);
  const [waescheAnfragen, setWaescheAnfragen] = useState<{id:string;status:string;created_at:string;artikel:{id:string;typ_name:string|null;anzahl:number;geliefert_anzahl:number}[]}[]>([]);
  const [waescheOpen, setWaescheOpen]         = useState(true);
  const [showWaesche, setShowWaesche]         = useState(false);
  const [myDefects, setMyDefects]           = useState<{id:string;status:string;severity:string;description:string;title:string|null;notes:string|null;barcode:string|null;created_at:string;bed_number:string|null;station_name:string|null;room_number:string|null}[]>([]);
  const [defektOpen, setDefektOpen]         = useState(true);
  const [loading, setLoading]     = useState(true);
  const [showDefect, setShowDefect]     = useState(false);
  const [showReinigung, setShowReinigung] = useState(false);
  const [showZimmer, setShowZimmer]     = useState(false);
  const [showSpind, setShowSpind]       = useState(false);
  const [showO2, setShowO2]                     = useState(false);
  const [showRuecksendung, setShowRuecksendung] = useState(false);
  const [roomTasks, setRoomTasks]   = useState<Task[]>([]);
  const { touch, label: updatedLabel } = useLastUpdated();
  const [spindOpen, setSpindOpen]   = useState(true);
  const [bettenOpen, setBettenOpen] = useState(true);
  const [wischOpen, setWischOpen]   = useState(true);

  async function load() {
    try {
      const [st, tk, tkRoom, an, sr, o2, rueck, defects, waesche] = await Promise.all([
        api.get<Station[]>("/defects/stations"),
        api.get<Task[]>("/tasks?category=bed_cleaning&limit=200"),
        api.get<Task[]>("/tasks?category=room_cleaning&limit=200"),
        api.get<Announcement[]>("/announcements"),
        api.get<SpindRequest[]>("/lockers/requests/my"),
        api.get("/o2/anfragen/my").catch(() => ({ data: [] })),
        api.get("/ruecksendungen").catch(() => ({ data: [] })),
        api.get("/defects/my").catch(() => ({ data: [] })),
        api.get("/waesche/anfragen").catch(() => ({ data: [] })),
      ]);
      setStations(st.data);
      setAnnouncements(an.data);
      setSpindRequests(sr.data);
      setO2Anfragen(o2.data);
      setRuecksendungen(rueck.data);
      setMyDefects(defects.data ?? []);
      setWaescheAnfragen(waesche.data ?? []);

      const myStationIds = new Set(st.data.map((s: any) => s.id));
      const todayStr = new Date().toISOString().slice(0, 10);

      function filterTasks(data: Task[]) {
        return data.filter((t: any) => {
          const taskAreaId = t.station_id ?? t.area_id;
          if (myStationIds.size > 0 && taskAreaId && !myStationIds.has(taskAreaId)) return false;
          if (t.status === "abgeschlossen") {
            const completedDate = (t.completed_at ?? t.updated_at ?? t.created_at ?? "").slice(0, 10);
            return completedDate === todayStr;
          }
          return true;
        });
      }

      setTasks(filterTasks(tk.data));
      setRoomTasks(filterTasks(tkRoom.data));
    } catch (e) {
      console.error("[MeineStation] load error:", e);
    } finally {
      setLoading(false);
      touch();
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  const activeCount = tasks.filter(t => !["abgeschlossen"].includes(t.status)).length;

  return (
    <div className="space-y-5">
      {showDefect   && <DefectModal   stations={stations} onClose={() => { setShowDefect(false); load(); }} />}
      {showReinigung && <ReinigungModal stations={stations}
        onClose={() => setShowReinigung(false)}
        onSaved={() => { setShowReinigung(false); load(); }} />}
      {showZimmer && <ScheuernWischModal stations={stations}
        onClose={() => setShowZimmer(false)}
        onSaved={() => { setShowZimmer(false); load(); }} />}
      {showSpind && <SpindAnfrageModal stations={stations} onClose={() => { setShowSpind(false); load(); }} />}
      {showO2    && <O2AnfrageModal   stations={stations} onClose={() => { setShowO2(false); load(); }} />}
      {showRuecksendung && <RuecksendungModal stations={stations} onClose={() => { setShowRuecksendung(false); load(); }} />}
      {showWaesche && <WaescheModal stations={stations} onClose={() => { setShowWaesche(false); load(); }} />}

      {/* ── Hero-Header ── */}
      <div className="card card-accent !p-0 overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap"
          style={{ background: "var(--brand-50)" }}>
          <div>
            {user?.station_name && (
              <p className="text-label mb-1" style={{ color: "#3b82f6" }}>{user.station_name}</p>
            )}
            <h1 className="font-display text-2xl font-medium tracking-tight text-slate-800">
              🏥 Meine Station
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-2 h-2 rounded-full inline-block ${activeCount > 0 ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-sm text-slate-500">
                {activeCount > 0 ? `${activeCount} ${activeCount === 1 ? "aktiver Auftrag" : "aktive Aufträge"}` : "Alle Aufträge erledigt"}
              </span>
              <LiveIndicator label={updatedLabel} />
            </div>
          </div>
          {/* Schnell-Stats */}
          <div className="flex gap-3">
            {tasks.filter(t => t.status !== "abgeschlossen").length > 0 && (
              <div className="text-center bg-white/60 rounded-xl px-3 py-2">
                <div className="text-xl font-medium text-amber-600 text-mono-num">{tasks.filter(t => t.status !== "abgeschlossen").length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Betten</div>
              </div>
            )}
            {roomTasks.filter(t => t.status !== "abgeschlossen").length > 0 && (
              <div className="text-center bg-white/60 rounded-xl px-3 py-2">
                <div className="text-xl font-medium text-blue-600 text-mono-num">{roomTasks.filter(t => t.status !== "abgeschlossen").length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Zimmer</div>
              </div>
            )}
            {o2Anfragen.filter(a => a.status !== "geliefert").length > 0 && (
              <div className="text-center bg-white/60 rounded-xl px-3 py-2">
                <div className="text-xl font-medium text-violet-600 text-mono-num">{o2Anfragen.filter(a => a.status !== "geliefert").length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">O₂</div>
              </div>
            )}
          </div>
        </div>
        {/* Action-Buttons in einer Zeile darunter */}
        <div className="px-4 py-3 flex gap-2 flex-wrap border-t border-white/60"
          style={{ background: "rgba(255,255,255,0.5)" }}>
          {modulAn("bed_defects") && (
            <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowDefect(true)}>
              🔧 Defektes Bett
            </button>
          )}
          {modulAn("room_cleaning") && (can("zimmerreinigung") || can("stationspersonal")) && (
            <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowZimmer(true)}>
              🧹 Scheuer-Wisch
            </button>
          )}
          {modulAn("spindverwaltung") && (
            <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowSpind(true)}>
              🔐 Spind-Anfrage
            </button>
          )}
          {modulAn("oxygen_transport") && (
            <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowO2(true)}>
              💨 Sauerstoff
            </button>
          )}
          <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowRuecksendung(true)}>
            📦 Rücksendung
          </button>
          {modulAn("waesche") && (can("waesche") || can("verwaltung")) && (
            <button className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setShowWaesche(true)}>
              🛏 Kissen & Bettdecken
            </button>
          )}
          {modulAn("bed_cleaning") && (
            <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => setShowReinigung(true)}>
              🛏 Bettenreinigung anfordern
            </button>
          )}
        </div>
      </div>

      {/* 1. MELDUNGEN – kompakt, 2-spaltig */}
      {announcements.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {announcements.map(a => {
            const styles = {
              dringend: { wrap: "bg-red-50 border border-red-300",    icon: "🚨", label: "bg-red-100 text-red-700",    title: "text-red-800" },
              wichtig:  { wrap: "bg-amber-50 border border-amber-300", icon: "⚠️", label: "bg-amber-100 text-amber-700", title: "text-amber-800" },
              normal:   { wrap: "bg-blue-50 border border-blue-200",  icon: "📢", label: "bg-blue-100 text-blue-700",   title: "text-blue-800" },
            }[a.priority];
            return (
              <div key={a.id} className={`card !px-3 !py-2 ${styles.wrap}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{styles.icon}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${styles.label}`}>
                    {a.priority === "dringend" ? "Dringend" : a.priority === "wichtig" ? "Wichtig" : "Info"}
                  </span>
                  <span className={`font-semibold text-sm truncate ${styles.title}`}>{a.title}</span>
                </div>
                {a.body && <p className="text-xs text-slate-600 line-clamp-2">{a.body}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Haupt-Layout: links Aufträge, rechts Status ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

        {/* LINKE SPALTE: Bettenreinigung + Scheuer-Wisch */}
        <div className="space-y-4">

      {/* 2. BETTENREINIGUNG */}
      {(() => {
        const active = tasks.filter(t => t.status !== "abgeschlossen");
        const done   = tasks.filter(t => t.status === "abgeschlossen");
        return (
          <div className="space-y-2">
            <button className="flex items-center gap-2 w-full text-left py-1 hover:opacity-75 transition-opacity"
              onClick={() => setBettenOpen(o => !o)}>
              <h3 className="text-label flex items-center gap-2">🛏 Bettenreinigung
                {active.length > 0 && <span className="ml-2 normal-case font-normal text-slate-400">({active.length} offen)</span>}
              </h3>
              <span className="text-slate-400 text-xs ml-auto">{bettenOpen ? "▲" : "▼"}</span>
            </button>
            {bettenOpen && (active.length === 0 && done.length === 0 ? (
              <div className="card text-center py-6 text-slate-400 text-sm">Keine offenen Aufträge</div>
            ) : (
              <div className="space-y-2">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
                {active.map(t => {
                  const st = TASK_STATUS[t.status] ?? { label: t.status, color: "bg-slate-100 text-slate-600", icon: "?" };
                  const isInfectious = t.cleaning_type === "infektioes";
                  return (
                    <div key={t.id} className={`card !p-3 flex items-center justify-between gap-2 ${isInfectious ? "border-l-4 border-red-400" : ""}`}>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {t.station_name && <span className="text-slate-400 text-xs">{t.station_name} · </span>}
                          Zi. {t.room_number}{t.bed_number ? ` · Bett ${t.bed_number}` : ""}
                          {isInfectious && <span className="ml-1 text-red-600 text-xs">⚠️</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t.assigned_to_name ? `👤 ${t.assigned_to_name}` : "Nicht angenommen"} · {timeAgo(t.created_at)}
                        </div>
                      </div>
                      <span className={`badge text-xs shrink-0 ${st.color}`}>{st.icon} {st.label}</span>
                    </div>
                  );
                })}
                </div>
                {done.length > 0 && (
                  <details className="text-sm text-slate-400 cursor-pointer">
                    <summary className="select-none">✅ {done.length} heute abgeschlossen</summary>
                    <div className="space-y-2 mt-2">
                      {done.map(t => (
                        <div key={t.id} className="card !opacity-80 flex items-center justify-between gap-3 py-2">
                          <div className="text-sm text-slate-600">Zi. {t.room_number}{t.bed_number ? ` · Bett ${t.bed_number}` : ""}</div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="badge bg-emerald-100 text-emerald-700 text-xs">✅ Fertig</span>
                            <button className="text-xs text-slate-400 hover:text-red-500 underline"
                              onClick={async () => {
                                try { await api.delete(`/tasks/${t.id}/dismiss`); load(); } catch { /* ignore */ }
                              }}>Löschen</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        );
      })()}
      {(() => {
        const active = roomTasks.filter(t => t.status !== "abgeschlossen");
        const done   = roomTasks.filter(t => t.status === "abgeschlossen");
        if (active.length === 0 && done.length === 0) return null;
        return (
          <div className="space-y-2">
            <button className="flex items-center gap-2 w-full text-left"
              onClick={() => setWischOpen(o => !o)}>
              <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">🧹 Scheuer-Wisch
                {active.length > 0 && <span className="ml-2 normal-case font-normal text-slate-400">({active.length} offen)</span>}
              </h3>
              <span className="text-slate-400 text-xs ml-auto">{wischOpen ? "▲" : "▼"}</span>
            </button>
            {wischOpen && <div className="space-y-2">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {active.map(t => {
                const st = TASK_STATUS[t.status] ?? { label: t.status, color: "bg-slate-100 text-slate-600", icon: "?" };
                const isInfectious = t.cleaning_type === "infektioes";
                return (
                  <div key={t.id} className={`card !p-3 flex items-center justify-between gap-2 ${isInfectious ? "border-l-4 border-red-400" : ""}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        Zi. {t.room_number}
                        {(t as any).aufbereitungsart_name && <span className="ml-1 text-xs text-slate-500">{(t as any).aufbereitungsart_name}</span>}
                        {isInfectious && <span className="ml-1 text-red-600 text-xs">⚠️</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t.assigned_to_name ? `👤 ${t.assigned_to_name}` : "Nicht angenommen"} · {timeAgo(t.created_at)}
                      </div>
                      {(t as any).bestaetigt_termin && (
                        <div className="text-xs text-emerald-600 font-medium mt-0.5">
                          📅 {new Date((t as any).bestaetigt_termin.replace(" ","T")).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                        </div>
                      )}
                      {!(t as any).bestaetigt_termin && (t as any).wunschtermin && (
                        <div className="text-xs text-amber-600 mt-0.5">
                          ⏳ Wunsch: {new Date((t as any).wunschtermin.replace(" ","T")).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})} (unbestätigt)
                        </div>
                      )}
                    </div>
                    <span className={`badge text-xs shrink-0 ${st.color}`}>{st.icon} {st.label}</span>
                  </div>
                );
              })}
              </div>
              {done.length > 0 && (
                <details className="text-sm text-slate-400 cursor-pointer">
                  <summary className="select-none">✅ {done.length} heute abgeschlossen</summary>
                  <div className="space-y-2 mt-2">
                    {done.map(t => (
                      <div key={t.id} className="card !opacity-80 flex items-center justify-between gap-3 py-2">
                        <div className="text-sm text-slate-600">Zi. {t.room_number}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="badge bg-emerald-100 text-emerald-700 text-xs">✅ Fertig</span>
                          <button className="text-xs text-slate-400 hover:text-red-500 underline"
                            onClick={async () => {
                              try { await api.delete(`/tasks/${t.id}/dismiss`); load(); } catch { /* ignore */ }
                            }}>Löschen</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>}
          </div>
        );
      })()}

        </div>{/* end linke Spalte */}

        {/* RECHTE SPALTE: Status-Sektionen */}
        <div className="space-y-4">

      {/* 4. SPIND-ANFRAGEN – einklappbar */}
      {spindRequests.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 w-full text-left"
            onClick={() => setSpindOpen(o => !o)}>
            <h3 className="text-label flex items-center gap-2">🔐 Meine Spind-Anfragen</h3>
            <span className="text-slate-400 text-xs ml-auto">{spindOpen ? "▲" : "▼"}</span>
          </button>
          {spindOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {spindRequests.map(r => {
                const isDone = r.status !== "offen";
                const statusStyle =
                  r.status === "zugewiesen" ? { wrap: "bg-emerald-50 border border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "✅" } :
                  r.status === "abgelehnt"  ? { wrap: "bg-red-50 border border-red-200",         badge: "bg-red-100 text-red-700",         icon: "❌" } :
                                              { wrap: "bg-blue-50 border border-blue-200",        badge: "bg-blue-100 text-blue-600",       icon: "⏳" };
                return (
                  <div key={r.id} className="card !p-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{statusStyle.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.vorname} {r.nachname} · {r.berufsgruppe}</div>
                      {(r.starts_at || r.ends_at) && (
                        <div className="text-xs text-slate-500">
                          📅 {r.starts_at ? new Date(r.starts_at).toLocaleDateString("de-DE") : "–"} –{" "}
                          {r.ends_at ? new Date(r.ends_at).toLocaleDateString("de-DE") : "unbefristet"}
                        </div>
                      )}
                      {r.status === "zugewiesen" && r.locker_number && (
                        <div className="text-xs text-emerald-700 font-medium mt-0.5">Spind {r.locker_number} zugewiesen</div>
                      )}
                      {r.status === "abgelehnt" && (
                        <div className="text-xs text-red-600 mt-0.5">Anfrage wurde abgelehnt</div>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">{new Date(r.created_at).toLocaleDateString("de-DE")}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`badge ${statusStyle.badge}`}>
                        {r.status === "offen" ? "Offen" : r.status === "zugewiesen" ? "Zugewiesen" : "Abgelehnt"}
                      </span>
                      {isDone && (
                        <button className="text-xs text-slate-400 hover:text-red-500 underline"
                          onClick={async () => {
                            await api.delete(`/lockers/requests/${r.id}/dismiss`);
                            setSpindRequests(prev => prev.filter(x => x.id !== r.id));
                          }}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* O₂-Anfragen */}
      {o2Anfragen.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 w-full text-left"
            onClick={() => setO2Open(o => !o)}>
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
              💨 Meine Sauerstoff-Anfragen
              {o2Anfragen.filter(a => a.status !== "geliefert").length > 0 && (
                <span className="ml-2 normal-case font-normal text-slate-400">
                  ({o2Anfragen.filter(a => a.status !== "geliefert").length} offen)
                </span>
              )}
            </h3>
            <span className="text-slate-400 text-xs ml-auto">{o2Open ? "▲" : "▼"}</span>
          </button>
          {o2Open && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {o2Anfragen.map(a => {
                const style =
                  a.status === "geliefert"  ? { wrap: "bg-emerald-50 border border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "✅" } :
                  a.status === "angenommen" ? { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",       icon: "🚚" } :
                                              { wrap: "bg-amber-50 border border-amber-200",      badge: "bg-amber-100 text-amber-800",     icon: "⏳" };
                return (
                  <div key={a.id} className="card !p-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {a.typ_name ?? "Flasche"}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        <span className="font-medium">{a.anzahl} angefordert</span>
                        {" · "}
                        <span className={a.status === "geliefert" ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                          {a.geliefert_anzahl ?? 0} geliefert
                        </span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(a.created_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`badge ${style.badge}`}>
                        {a.status === "offen" ? "Offen" : a.status === "angenommen" ? "Unterwegs" : "Geliefert"}
                      </span>
                      {a.status === "geliefert" && (
                        <button
                          className="text-xs text-slate-400 hover:text-red-500 underline"
                          onClick={async () => {
                            await api.delete(`/o2/anfragen/${a.id}/dismiss`);
                            setO2Anfragen(prev => prev.filter(x => x.id !== a.id));
                          }}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Meine Defektmeldungen */}
      {myDefects.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 w-full text-left"
            onClick={() => setDefektOpen(o => !o)}>
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
              🔧 Meine Defektmeldungen
              {myDefects.filter(d => d.status === "gemeldet").length > 0 && (
                <span className="ml-2 normal-case font-normal text-slate-400">
                  ({myDefects.filter(d => d.status === "gemeldet").length} offen)
                </span>
              )}
            </h3>
            <span className="text-slate-400 text-xs ml-auto">{defektOpen ? "▲" : "▼"}</span>
          </button>
          {defektOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {myDefects.map(d => {
                const style =
                  d.status === "behoben"      ? { wrap: "bg-emerald-50 border border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "✅" } :
                  d.status === "in_reparatur" ? { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",     icon: "🔨" } :
                                                { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",    icon: "🔄" };

                // Standort aus notes extrahieren ("Station: X | Standort: Y")
                let standort = "";
                if (d.notes) {
                  const m = d.notes.match(/Standort:\s*(.+)/);
                  if (m) standort = m[1].trim();
                }

                return (
                  <div key={d.id} className="card !p-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{d.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        📍 {d.station_name ?? "–"}
                        {d.room_number ? ` · Zimmer ${d.room_number}` : ""}
                        {d.bed_number  ? ` · Bett ${d.bed_number}` : ""}
                        {standort      ? ` · ${standort}` : ""}
                        {d.barcode     ? ` · ${d.barcode}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString("de-DE")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`badge ${style.badge}`}>
                        {d.status === "gemeldet" ? "Gemeldet" : d.status === "in_reparatur" ? "In Reparatur" : "Behoben"}
                      </span>
                      {d.status === "behoben" && (
                        <button
                          className="text-xs text-slate-400 hover:text-red-500 underline"
                          onClick={async () => {
                            try {
                              await api.delete(`/defects/${d.id}/dismiss`);
                              setMyDefects(prev => prev.filter(x => x.id !== d.id));
                            } catch { /* ignore */ }
                          }}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Rücksendungen */}
      {ruecksendungen.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 w-full text-left"
            onClick={() => setRueckOpen(o => !o)}>
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
              📦 Meine Rücksendungen
              {ruecksendungen.filter(r => r.status !== "abgeschlossen").length > 0 && (
                <span className="ml-2 normal-case font-normal text-slate-400">
                  ({ruecksendungen.filter(r => r.status !== "abgeschlossen").length} offen)
                </span>
              )}
            </h3>
            <span className="text-slate-400 text-xs ml-auto">{rueckOpen ? "▲" : "▼"}</span>
          </button>
          {rueckOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {ruecksendungen.map(r => {
                const style =
                  r.status === "abgeschlossen"     ? { wrap: "bg-emerald-50 border border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "✅" } :
                  r.status === "in_bearbeitung"    ? { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",     icon: "🔄" } :
                  r.status === "beim_einkauf"      ? { wrap: "bg-purple-50 border border-purple-200",   badge: "bg-purple-100 text-purple-700", icon: "🛒" } :
                  r.status === "zurueck_ans_lager" ? { wrap: "bg-orange-50 border border-orange-200",   badge: "bg-orange-100 text-orange-700", icon: "↩" } :
                                                     { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",    icon: "🔄" };

                const statusLabel =
                  r.status === "abgeschlossen"     ? "Abgeschlossen" :
                  r.status === "in_bearbeitung"    ? "In Bearbeitung" :
                  r.status === "beim_einkauf"      ? "Beim Einkauf" :
                  r.status === "zurueck_ans_lager" ? "Zurück ans Lager" : "Beim Lager";

                let artikelLabel = r.menge;
                try {
                  const parsed = JSON.parse(r.artikel);
                  if (Array.isArray(parsed)) {
                    artikelLabel = parsed.map((a: any) => `${a.menge} ${a.artikel}`).join(", ");
                  }
                } catch { /* plain text */ }

                return (
                  <div key={r.id} className="card !p-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{artikelLabel}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(r.created_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`badge ${style.badge}`}>{statusLabel}</span>
                      {r.status === "abgeschlossen" && (
                        <button
                          className="text-xs text-slate-400 hover:text-red-500 underline"
                          onClick={async () => {
                            try {
                              await api.delete(`/ruecksendungen/${r.id}/dismiss`);
                              setRuecksendungen(prev => prev.filter(x => x.id !== r.id));
                            } catch { /* ignore */ }
                          }}>
                          Ausblenden
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Wäsche-Anfragen */}
      {(can("waesche") || can("verwaltung")) && waescheAnfragen.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 w-full text-left"
            onClick={() => setWaescheOpen(o => !o)}>
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
              🛏 Kissen & Bettdecken
              {waescheAnfragen.filter(a => a.status !== "erledigt").length > 0 && (
                <span className="ml-2 normal-case font-normal text-slate-400">
                  ({waescheAnfragen.filter(a => a.status !== "erledigt").length} offen)
                </span>
              )}
            </h3>
            <span className="text-slate-400 text-xs ml-auto">{waescheOpen ? "▲" : "▼"}</span>
          </button>
          {waescheOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "8px" }}>
              {waescheAnfragen.map(a => {
                const style =
                  a.status === "erledigt"   ? { wrap: "bg-emerald-50 border border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "✅" } :
                  a.status === "angenommen" ? { wrap: "bg-blue-50 border border-blue-200",       badge: "bg-blue-100 text-blue-700",       icon: "🚚" } :
                                              { wrap: "bg-amber-50 border border-amber-200",      badge: "bg-amber-100 text-amber-800",     icon: "⏳" };
                return (
                  <div key={a.id} className={`card !p-3 flex items-start gap-3 ${style.wrap}`}>
                    <span className="text-lg mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="space-y-0.5">
                        {a.artikel.map((ar, i) => (
                          <p key={i} className="text-sm font-medium">
                            {ar.typ_name ?? "–"}:&nbsp;
                            <span className="font-semibold">{ar.anzahl} angefordert</span>
                            {" · "}
                            <span className={a.status === "erledigt" ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                              {ar.geliefert_anzahl} geliefert
                            </span>
                          </p>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(a.created_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`badge ${style.badge}`}>
                        {a.status === "offen" ? "Offen" : a.status === "angenommen" ? "In Bearbeitung" : "Erledigt"}
                      </span>
                      {a.status === "erledigt" && (
                        <button
                          className="text-xs text-slate-400 hover:text-red-500 underline"
                          onClick={async () => {
                            try {
                              await api.delete(`/waesche/anfragen/${a.id}/dismiss`);
                              setWaescheAnfragen(prev => prev.filter(x => x.id !== a.id));
                            } catch { /* ignore */ }
                          }}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </div>{/* end rechte Spalte */}
      </div>{/* end grid */}

    </div>
  );
}

interface WaescheModalProps { stations: Station[]; onClose: () => void; }
function WaescheModal({ stations, onClose }: WaescheModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [stationId, setStationId] = useState(
    stations.length === 1 ? stations[0].id :
    (user as any)?.station_id ?? (stations[0]?.id ?? "")
  );
  const [typen, setTypen]   = useState<{ id: string; name: string }[]>([]);
  const [artikel, setArtikel] = useState<{ typ_id: string; anzahl: number }[]>([{ typ_id: "", anzahl: 1 }]);
  const [notiz, setNotiz]   = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/waesche/typen").then(r => {
      setTypen(r.data);
      if (r.data.length > 0) setArtikel([{ typ_id: r.data[0].id, anzahl: 1 }]);
    });
  }, []);

  function addRow() { setArtikel(p => [...p, { typ_id: typen[0]?.id ?? "", anzahl: 1 }]); }
  function removeRow(i: number) { setArtikel(p => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, field: "typ_id" | "anzahl", val: string | number) {
    setArtikel(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function submit() {
    if (stations.length > 0 && !stationId) {
      toast.error("Bitte eine Station auswählen.");
      return;
    }
    if (artikel.some(a => !a.typ_id || a.anzahl < 1)) {
      toast.error("Bitte Typ und Menge für alle Artikel angeben.");
      return;
    }
    setSaving(true);
    try {
      const stationName = stations.find(s => s.id === stationId)?.name ?? "";
      await api.post("/waesche/anfragen", {
        station_id:   stationId,
        station_name: stationName,
        notiz:        notiz.trim() || undefined,
        artikel,
      });
      toast.success("Anfrage gesendet.");
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Senden");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="modal-header-colored modal-header-blue flex items-center gap-3">
          <span className="modal-icon-badge modal-icon-blue">🛏</span>
          <h2 className="font-display text-base font-medium">Kissen & Bettdecken anfordern</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {stations.length > 1 && (
            <div>
              <label className="text-label block mb-1">Station</label>
              <select className="input w-full" value={stationId} onChange={e => setStationId(e.target.value)}>
                <option value="">– wählen –</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-label block mb-2">Artikel</label>
            <div className="space-y-2">
              {artikel.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="input flex-1 text-sm" value={row.typ_id}
                    onChange={e => updateRow(i, "typ_id", e.target.value)}>
                    <option value="">– Typ –</option>
                    {typen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input type="number" min={1} className="input w-20 text-sm text-center"
                    value={row.anzahl} onChange={e => updateRow(i, "anzahl", parseInt(e.target.value) || 1)} />
                  {artikel.length > 1 && (
                    <button className="text-slate-400 hover:text-red-500 text-lg leading-none px-1"
                      onClick={() => removeRow(i)}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <button className="mt-2 text-xs text-blue-600 hover:underline" onClick={addRow}>+ Zeile hinzufügen</button>
          </div>

          <div>
            <label className="text-label block mb-1">Notiz (optional)</label>
            <textarea className="input w-full text-sm" rows={2} placeholder="z. B. dringend benötigt…"
              value={notiz} onChange={e => setNotiz(e.target.value)} />
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button className="btn-primary flex-1" onClick={submit} disabled={saving}>
            {saving ? "Wird gesendet…" : "Anfrage senden"}
          </button>
          <button className="btn-ghost flex-1" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

interface RuecksendungModalProps { stations: Station[]; onClose: () => void; }
function RuecksendungModal({ stations, onClose }: RuecksendungModalProps) {
  const toast = useToast();
  const [stationId, setStationId] = useState(stations.length === 1 ? stations[0].id : "");
  const [artikel, setArtikel] = useState<{ artikel: string; menge: string; grund: string }[]>([
    { artikel: "", menge: "", grund: "" }
  ]);
  const [saving, setSaving]   = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const stationName = stations.find(s => s.id === stationId)?.name ?? "";

  function updateArtikel(i: number, field: "artikel" | "menge" | "grund", val: string) {
    setArtikel(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  }
  function addArtikel() { setArtikel(prev => [...prev, { artikel: "", menge: "", grund: "" }]); }
  function removeArtikel(i: number) { setArtikel(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit() {
    if (!stationId) { toast.error("Bitte Station wählen."); return; }
    const filled = artikel.filter(a => a.artikel.trim());
    if (filled.length === 0) { toast.error("Mindestens ein Artikel angeben."); return; }
    if (filled.some(a => !a.menge.trim())) { toast.error("Bitte bei jedem Artikel eine Menge angeben."); return; }
    if (filled.some(a => !a.grund.trim())) { toast.error("Bitte bei jedem Artikel einen Grund angeben."); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/ruecksendungen", {
        station_id:   stationId,
        station_name: stationName,
        artikel:      JSON.stringify(filled),
        menge:        filled.map(a => `${a.menge} ${a.artikel}`).join(", "),
        grund:        filled.map(a => `${a.artikel}: ${a.grund}`).join(" | "),
      });
      toast.success("Rücksendung gemeldet – Begleitschein wird geöffnet…");
      setSavedId(data.id);
      // Begleitschein sofort öffnen
      setTimeout(() => window.open(`/api/ruecksendungen/${data.id}/begleitschein?token=${localStorage.getItem("token") ?? ""}`, "_blank"), 300);
    } catch { toast.error("Fehler beim Senden."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="modal-header-colored modal-header-amber">
          <div className="modal-icon-badge modal-icon-amber">📦</div>
          <div>
            <h2 className="font-display text-base font-medium">Rücksendung melden</h2>
            {stations.length === 1 && <p className="text-xs text-slate-500 mt-0.5">📍 {stations[0].name}</p>}
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {stations.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Station *</label>
              <select value={stationId} onChange={e => setStationId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2">
                <option value="">– Station wählen –</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Artikel mit je eigenem Grund */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Artikel * <span className="font-normal text-slate-400">– mehrere Artikel möglich</span>
            </label>
            <div className="space-y-3">
              {artikel.map((a, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input value={a.artikel} onChange={e => updateArtikel(i, "artikel", e.target.value)}
                      placeholder="Artikel / Material *"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white" />
                    <input value={a.menge} onChange={e => updateArtikel(i, "menge", e.target.value)}
                      placeholder="Menge *"
                      className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white" />
                    {artikel.length > 1 && (
                      <button onClick={() => removeArtikel(i)}
                        className="text-slate-400 hover:text-red-500 text-lg leading-none px-1 shrink-0">×</button>
                    )}
                  </div>
                  <input value={a.grund} onChange={e => updateArtikel(i, "grund", e.target.value)}
                    placeholder="Grund für Rücksendung *"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white" />
                </div>
              ))}
            </div>
            <button onClick={addArtikel}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors">
              <span className="text-base leading-none">＋</span> Artikel hinzufügen
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            {savedId ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="font-semibold text-green-800 text-sm">Rücksendung wurde gemeldet</p>
                    <p className="text-xs text-green-600 mt-0.5">Das Lager wurde benachrichtigt.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => window.open(`/api/ruecksendungen/${savedId}/begleitschein?token=${localStorage.getItem("token") ?? ""}`, "_blank")}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                    style={{ backgroundColor: "var(--brand-600)" }}>
                    🖨 Begleitschein erneut drucken
                  </button>
                  <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium">
                    Schließen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: "var(--brand-600)" }}>
                  {saving ? "Wird gesendet…" : "Rücksendung melden"}
                </button>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium">
                  Abbrechen
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

