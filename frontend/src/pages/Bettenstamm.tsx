import { useToast } from "../contexts/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";
import { useAuth } from "../contexts/AuthContext";

interface PhysicalBed {
  id: string;
  barcode: string;
  bed_type_id: string | null;
  bed_type_name: string | null;
  hersteller: string | null;
  modell: string | null;
  seriennummer: string | null;
  baujahr: number | null;
  prueftermin: string | null;
  tage_ueberfaellig: number | null;
  gesperrt: number;
  gesperrt_grund: string | null;
  gesperrt_seit: string | null;
  notizen: string | null;
  last_station_name: string | null;
  last_area_name: string | null;
  last_room_number: string | null;
  last_seen: string | null;
}

interface BedType { id: string; name: string; }

function pruefAmpel(bed: PhysicalBed) {
  if (!bed.prueftermin) return { color: "bg-slate-100 text-slate-400", label: "Kein Termin" };
  const days = bed.tage_ueberfaellig ?? 0;
  if (days > 0)   return { color: "bg-red-100 text-red-700 font-semibold", label: `${days} T. überfällig` };
  if (days > -30) return { color: "bg-amber-100 text-amber-700", label: `in ${Math.abs(days)} T.` };
  return { color: "bg-emerald-100 text-emerald-700", label: new Date(bed.prueftermin + "T00:00:00").toLocaleDateString("de-DE") };
}

function BedModal({ bed, bedTypes, onClose, onSaved }: {
  bed?: PhysicalBed; bedTypes: BedType[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!bed;
  const [form, setForm] = useState({
    barcode:      bed?.barcode      ?? "",
    bed_type_id:  bed?.bed_type_id  ?? "",
    hersteller:   bed?.hersteller   ?? "",
    modell:       bed?.modell       ?? "",
    seriennummer: bed?.seriennummer ?? "",
    baujahr:      bed?.baujahr      ? String(bed.baujahr) : "",
    prueftermin:  bed?.prueftermin  ?? "",
    notizen:      bed?.notizen      ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  async function submit() {
    if (!form.barcode.trim()) { setErr("Barcode ist Pflichtfeld."); return; }
    setSaving(true); setErr(null);
    const payload = {
      barcode:      form.barcode.trim(),
      bed_type_id:  form.bed_type_id || null,
      hersteller:   form.hersteller.trim() || null,
      modell:       form.modell.trim() || null,
      seriennummer: form.seriennummer.trim() || null,
      baujahr:      form.baujahr ? parseInt(form.baujahr) : null,
      prueftermin:  form.prueftermin || null,
      notizen:      form.notizen.trim() || null,
    };
    try {
      if (isEdit) await api.patch(`/physical-beds/${bed!.id}`, payload);
      else await api.post("/physical-beds", payload);
      onSaved();
    } catch (e: any) {
      const raw = e.response?.data?.error ?? "Fehler";
      setErr(raw === "barcode_exists" ? "Dieser Barcode ist bereits vergeben." : `Fehler: ${raw}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md w-full max-w-lg space-y-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">
            {isEdit ? "Bett bearbeiten" : "Neues Bett anlegen"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="label">Barcode / Nummer *</label>
            <input className="input" value={form.barcode}
              onChange={e => setForm(f => ({...f, barcode: e.target.value}))}
              placeholder="z. B. BET-0042" autoFocus={!isEdit} />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="label">Bett-Typ</label>
            <select className="input" value={form.bed_type_id}
              onChange={e => setForm(f => ({...f, bed_type_id: e.target.value}))}>
              <option value="">— Typ wählen —</option>
              {bedTypes.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="label">Hersteller</label>
            <input className="input" value={form.hersteller}
              onChange={e => setForm(f => ({...f, hersteller: e.target.value}))}
              placeholder="z. B. Stiegelmeyer" />
          </div>
          <div className="space-y-1">
            <label className="label">Modell</label>
            <input className="input" value={form.modell}
              onChange={e => setForm(f => ({...f, modell: e.target.value}))}
              placeholder="z. B. Evario" />
          </div>

          <div className="space-y-1">
            <label className="label">Seriennummer</label>
            <input className="input" value={form.seriennummer}
              onChange={e => setForm(f => ({...f, seriennummer: e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="label">Baujahr</label>
            <input className="input" type="number" min="1990" max="2030"
              value={form.baujahr}
              onChange={e => setForm(f => ({...f, baujahr: e.target.value}))}
              placeholder="z. B. 2019" />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="label">Nächster Prüftermin</label>
            <input className="input" type="date" value={form.prueftermin}
              onChange={e => setForm(f => ({...f, prueftermin: e.target.value}))} />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="label">Notizen</label>
            <textarea className="input w-full" rows={2} value={form.notizen}
              onChange={e => setForm(f => ({...f, notizen: e.target.value}))}
              placeholder="Interne Hinweise…" />
          </div>
        </div>

        {err && <div className="text-red-600 text-sm">❌ {err}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? "Speichern…" : isEdit ? "Speichern" : "Anlegen"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

function SperrModal({ bed, onClose, onSaved }: {
  bed: PhysicalBed; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const sperren = !bed.gesperrt;
  const [grund, setGrund] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.patch(`/physical-beds/${bed.id}/sperren`, { gesperrt: sperren, grund: grund.trim() || undefined });
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-md w-full max-w-sm space-y-4 p-5">
        <h2 className="font-display text-xl font-bold">
          {sperren ? "🔒 Bett sperren" : "🔓 Bett entsperren"}
        </h2>
        <div className="text-sm text-slate-600">
          Barcode: <span className="font-mono font-semibold">{bed.barcode}</span>
        </div>
        {sperren && (
          <div className="space-y-1">
            <label className="label">Grund <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className="input" value={grund} onChange={e => setGrund(e.target.value)}
              placeholder="z. B. Prüfung fällig, Wartung geplant" autoFocus />
          </div>
        )}
        {!sperren && (
          <div className="text-sm text-slate-500">
            Das Bett wird wieder freigegeben. Bisheriger Grund: {bed.gesperrt_grund ?? "–"}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={submit} disabled={saving}
            className={sperren ? "btn-danger flex-1" : "btn-primary flex-1"}>
            {saving ? "…" : sperren ? "Sperren" : "Entsperren"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

export default function Bettenstamm() {
  const toast = useToast();
  const { can } = useAuth();
  const [beds, setBeds]         = useState<PhysicalBed[]>([]);
  const [bedTypes, setBedTypes] = useState<BedType[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<"alle" | "faellig" | "gesperrt">("alle");
  const [search, setSearch]     = useState("");
  const [editing, setEditing]   = useState<PhysicalBed | null>(null);
  const [sperrung, setSperrung] = useState<PhysicalBed | null>(null);
  const [showNew, setShowNew]   = useState(false);
  const { touch, label: updatedLabel } = useLastUpdated();

  const canSperren = can("betten_reparatur") || can("verwaltung");
  const canEdit    = can("bettenstamm") || can("verwaltung");

  async function load() {
    const [b, bt] = await Promise.all([
      api.get<PhysicalBed[]>("/physical-beds"),
      api.get<BedType[]>("/bed-types"),
    ]);
    setBeds(b.data);
    setBedTypes(bt.data);
    setLoading(false);
    touch();
  }

  useEffect(() => { load(); }, []);

  const filtered = beds.filter(b => {
    if (filter === "faellig")  return b.prueftermin && (b.tage_ueberfaellig ?? -999) > -30;
    if (filter === "gesperrt") return b.gesperrt === 1;
    return true;
  }).filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.barcode.toLowerCase().includes(q) ||
      (b.hersteller ?? "").toLowerCase().includes(q) ||
      (b.modell ?? "").toLowerCase().includes(q) ||
      (b.seriennummer ?? "").toLowerCase().includes(q);
  });

  const counts = {
    faellig:  beds.filter(b => b.prueftermin && (b.tage_ueberfaellig ?? -999) > -30).length,
    gesperrt: beds.filter(b => b.gesperrt === 1).length,
  };

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  return (
    <div className="space-y-5">
      {(showNew || editing) && (
        <BedModal
          bed={editing ?? undefined}
          bedTypes={bedTypes}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); load(); }}
        />
      )}
      {sperrung && (
        <SperrModal
          bed={sperrung}
          onClose={() => setSperrung(null)}
          onSaved={() => { setSperrung(null); load(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">🛏 Bettenstamm</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-slate-500">{beds.length} physische Betten</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + Neues Bett
          </button>
        )}
      </div>

      {/* Suche + Filter */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-48"
          placeholder="🔍 Barcode, Hersteller, Modell, Seriennummer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {([
            { key: "alle",     label: `Alle (${beds.length})` },
            { key: "faellig",  label: `⚠️ Prüfung (${counts.faellig})` },
            { key: "gesperrt", label: `🔒 Gesperrt (${counts.gesperrt})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabelle */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">🛏</div>
          <div>{search ? "Keine Betten gefunden." : "Noch keine Betten angelegt."}</div>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-1 pl-4 pr-3">Barcode</th>
                  <th className="pb-1 pr-3">Typ</th>
                  <th className="pb-1 pr-3">Hersteller / Modell</th>
                  <th className="pb-1 pr-3">Letzter Standort</th>
                  <th className="pb-1 pr-3">Prüftermin</th>
                  <th className="pb-1 pr-3">Status</th>
                  <th className="pb-1 pr-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const ampel = pruefAmpel(b);
                  return (
                    <tr key={b.id} className={`bg-white shadow-sm hover:shadow-md transition-shadow rounded-xl ${b.gesperrt ? "outline outline-1 outline-red-200" : ""}`}>
                      <td className="py-3 pl-4 pr-3 rounded-l-xl">
                        <span className="font-mono font-semibold text-sm">{b.barcode}</span>
                        {b.baujahr && <div className="text-xs text-slate-400">BJ {b.baujahr}</div>}
                      </td>
                      <td className="py-3 pr-3 text-slate-600 text-xs">{b.bed_type_name ?? "–"}</td>
                      <td className="py-3 pr-3 text-slate-600 text-xs">
                        {[b.hersteller, b.modell].filter(Boolean).join(" · ") || "–"}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        {b.last_station_name ? (
                          <div>
                            <div className="font-medium text-slate-700">{b.last_station_name}</div>
                            <div className="text-slate-400">
                              {b.last_room_number ? `Zi. ${b.last_room_number}` : ""}
                              {b.last_seen ? ` · ${new Date(b.last_seen.replace(" ","T")+"Z").toLocaleDateString("de-DE")}` : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">Unbekannt</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`badge text-xs ${ampel.color}`}>{ampel.label}</span>
                      </td>
                      <td className="py-3 pr-3">
                        {b.gesperrt
                          ? <span className="badge bg-red-100 text-red-700 text-xs">🔒 Gesperrt{b.gesperrt_grund ? `: ${b.gesperrt_grund}` : ""}</span>
                          : <span className="badge bg-slate-100 text-slate-500 text-xs">Frei</span>
                        }
                      </td>
                      <td className="py-3 pr-4 rounded-r-xl">
                        <div className="flex gap-1">
                          {canEdit && (
                            <button onClick={() => setEditing(b)}
                              className="btn-ghost !py-1 !px-2 text-xs">✏️</button>
                          )}
                          {canSperren && (
                            <button onClick={() => setSperrung(b)}
                              className={`btn-ghost !py-1 !px-2 text-xs ${b.gesperrt ? "text-emerald-600" : "text-red-500"}`}>
                              {b.gesperrt ? "🔓" : "🔒"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filtered.map(b => {
              const ampel = pruefAmpel(b);
              return (
                <div key={b.id}
                  className={`card space-y-2 ${b.gesperrt ? "border-l-4 border-red-400 bg-red-50/30" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold">{b.barcode}</div>
                      <div className="text-xs text-slate-400">
                        {[b.bed_type_name, b.hersteller, b.modell].filter(Boolean).join(" · ") || "–"}
                      </div>
                      {b.last_station_name && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          📍 {b.last_station_name}{b.last_room_number ? ` · Zi. ${b.last_room_number}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {canEdit && (
                        <button onClick={() => setEditing(b)} className="btn-ghost !py-1 !px-2 text-xs">✏️</button>
                      )}
                      {canSperren && (
                        <button onClick={() => setSperrung(b)}
                          className={`btn-ghost !py-1 !px-2 text-xs ${b.gesperrt ? "text-emerald-600" : "text-red-500"}`}>
                          {b.gesperrt ? "🔓" : "🔒"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`badge text-xs ${ampel.color}`}>{ampel.label}</span>
                    {b.gesperrt
                      ? <span className="badge bg-red-100 text-red-700 text-xs">🔒 Gesperrt</span>
                      : <span className="badge bg-slate-100 text-slate-500 text-xs">Frei</span>
                    }
                  </div>
                  {b.gesperrt_grund && (
                    <div className="text-xs text-red-600">Grund: {b.gesperrt_grund}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
