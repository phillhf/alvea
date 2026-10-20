import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";

interface PhysicalBed {
  id: string;
  barcode: string;
  bed_type_name: string | null;
  hersteller: string | null;
  modell: string | null;
  prueftermin: string | null;
  tage_ueberfaellig: number | null;
  gesperrt: number;
  gesperrt_grund: string | null;
  last_station_name: string | null;
  last_room_number: string | null;
  last_seen: string | null;
}

function ampel(bed: PhysicalBed): { label: string; cls: string; sort: number } {
  if (!bed.prueftermin) return { label: "Kein Termin", cls: "bg-slate-100 text-slate-400", sort: 9 };
  const d = bed.tage_ueberfaellig ?? 0;
  if (d > 0)    return { label: `${d} T. überfällig`,         cls: "bg-red-100 text-red-700 font-semibold", sort: 0 };
  if (d > -7)   return { label: `in ${Math.abs(d)} T. fällig`, cls: "bg-red-50 text-red-600",               sort: 1 };
  if (d > -30)  return { label: `in ${Math.abs(d)} T. fällig`, cls: "bg-amber-100 text-amber-700",          sort: 2 };
  if (d > -90)  return { label: `in ${Math.abs(d)} T.`,        cls: "bg-emerald-100 text-emerald-700",      sort: 3 };
  return { label: new Date(bed.prueftermin + "T00:00:00").toLocaleDateString("de-DE"), cls: "bg-emerald-100 text-emerald-700", sort: 4 };
}

type Filter = "alle" | "ueberfaellig" | "bald" | "gesperrt" | "kein_termin";

export default function BettenPW() {
  const { can } = useAuth();
  const [beds, setBeds]       = useState<PhysicalBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>("alle");
  const [search, setSearch]   = useState("");
  const { touch, label: updatedLabel } = useLastUpdated();

  async function load() {
    const r = await api.get<PhysicalBed[]>("/physical-beds");
    setBeds(r.data);
    setLoading(false);
    touch();
  }

  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, []);

  const counts = {
    ueberfaellig: beds.filter(b => (b.tage_ueberfaellig ?? -999) > 0).length,
    bald:         beds.filter(b => { const d = b.tage_ueberfaellig ?? -999; return d <= 0 && d > -30; }).length,
    gesperrt:     beds.filter(b => b.gesperrt === 1).length,
    kein_termin:  beds.filter(b => !b.prueftermin).length,
  };

  const filtered = beds
    .filter(b => {
      if (filter === "ueberfaellig") return (b.tage_ueberfaellig ?? -999) > 0;
      if (filter === "bald")         { const d = b.tage_ueberfaellig ?? -999; return d <= 0 && d > -30; }
      if (filter === "gesperrt")     return b.gesperrt === 1;
      if (filter === "kein_termin")  return !b.prueftermin;
      return true;
    })
    .filter(b => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b.barcode.toLowerCase().includes(q) ||
        (b.bed_type_name ?? "").toLowerCase().includes(q) ||
        (b.hersteller ?? "").toLowerCase().includes(q) ||
        (b.last_station_name ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => ampel(a).sort - ampel(b).sort || (a.tage_ueberfaellig ?? -9999) - (b.tage_ueberfaellig ?? -9999));

  const canSperren  = can("betten_reparatur") || can("verwaltung");
  const canPruefung = can("betten_pw") || can("verwaltung");
  const [pruefModal, setPruefModal] = useState<PhysicalBed | null>(null);
  const [newDate, setNewDate]       = useState("");

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  return (
    <div className="space-y-5">

      {/* P&W Modal */}
      {pruefModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setPruefModal(null); }}>
          <div className="bg-white rounded-lg shadow-md w-full max-w-sm space-y-4 p-6">
            <h2 className="font-display text-xl font-bold">🔧 P&amp;W durchführen</h2>
            <div className="text-sm text-slate-500">
              Bett <span className="font-mono font-semibold text-slate-700">{pruefModal.barcode}</span>
              {pruefModal.prueftermin && (
                <span className="ml-2 text-amber-600">
                  (aktuell: {new Date(pruefModal.prueftermin + "T00:00:00").toLocaleDateString("de-DE")})
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label className="label">Nächster Prüftermin *</label>
              <input
                type="date"
                className="input"
                value={newDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setNewDate(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                className="btn-primary flex-1"
                disabled={!newDate}
                onClick={async () => {
                  await api.patch(`/physical-beds/${pruefModal.id}`, { prueftermin: newDate });
                  setPruefModal(null);
                  setNewDate("");
                  load();
                }}>
                ✅ Prüftermin speichern
              </button>
              <button className="btn-ghost flex-1" onClick={() => { setPruefModal(null); setNewDate(""); }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">🔧 Betten P&amp;W</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-slate-500">Prüfung &amp; Wartung – {beds.length} Betten gesamt</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
        <Link to="/bettenstamm" className="btn-ghost text-sm">→ Bettenstamm</Link>
      </div>

      {/* Übersicht-Kacheln */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "ueberfaellig", label: "Überfällig",       value: counts.ueberfaellig, icon: "🔴", color: "border-red-400 text-red-600"     },
          { key: "bald",         label: "Bald fällig (<30T)",value: counts.bald,         icon: "🟡", color: "border-amber-400 text-amber-600" },
          { key: "gesperrt",     label: "Gesperrt",          value: counts.gesperrt,     icon: "🔒", color: "border-slate-400 text-slate-600" },
          { key: "kein_termin",  label: "Kein Termin",       value: counts.kein_termin,  icon: "⬜", color: "border-slate-200 text-slate-400" },
        ].map(({ key, label, value, icon, color }) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key as Filter ? "alle" : key as Filter)}
            className={`card !p-4 text-left border-l-4 transition-all hover:shadow-md ${
              filter === key ? "ring-2 ring-offset-1 ring-[color:var(--brand-400)]" : ""
            } ${color}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span>{icon}</span>
              <span className="text-2xl font-bold">{value}</span>
            </div>
            <div className="text-xs text-slate-500">{label}</div>
          </button>
        ))}
      </div>

      {/* Suche */}
      <input
        className="input w-full max-w-sm"
        placeholder="🔍 Barcode, Typ, Hersteller, Station…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Tabelle */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">✅</div>
          <div>Keine Betten in dieser Kategorie.</div>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-1 pl-4 pr-4">Barcode</th>
                  <th className="pb-1 pr-4">Typ / Hersteller</th>
                  <th className="pb-1 pr-4">Prüftermin</th>
                  <th className="pb-1 pr-4">Letzter Standort</th>
                  <th className="pb-1 pr-4">Gesperrt</th>
                  {canSperren && <th className="pb-1 pr-4">Sperren</th>}
                  {canPruefung && <th className="pb-1">P&amp;W</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const a = ampel(b);
                  return (
                    <tr key={b.id} className={`bg-white shadow-sm hover:shadow-md transition-shadow rounded-xl`}>
                      <td className="py-3 pl-4 pr-4 rounded-l-xl">
                        <span className="font-mono font-semibold text-sm">{b.barcode}</span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {b.bed_type_name && <div className="font-medium text-slate-700">{b.bed_type_name}</div>}
                        {b.hersteller && <div>{b.hersteller}</div>}
                      </td>
                      <td className="py-3 pr-4">
                        {b.prueftermin ? (
                          <div className="space-y-1">
                            <span className={`badge text-xs ${a.cls}`}>{a.label}</span>
                            <div className="text-xs text-slate-400">
                              {new Date(b.prueftermin + "T00:00:00").toLocaleDateString("de-DE", {
                                day: "2-digit", month: "2-digit", year: "numeric"
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">Nicht hinterlegt</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {b.last_station_name ? (
                          <div>
                            <div className="font-medium text-slate-700">📍 {b.last_station_name}</div>
                            {b.last_room_number && <div className="text-slate-400">Zi. {b.last_room_number}</div>}
                          </div>
                        ) : <span className="text-slate-300">Unbekannt</span>}
                      </td>
                      <td className={`py-3 pr-4 ${!canSperren && !canPruefung ? "rounded-r-xl" : ""}`}>
                        {b.gesperrt
                          ? <span className="badge bg-red-100 text-red-700 text-xs">🔒 Ja{b.gesperrt_grund ? ` · ${b.gesperrt_grund}` : ""}</span>
                          : <span className="text-slate-300 text-xs">–</span>
                        }
                      </td>
                      {canSperren && (
                        <td className={`py-3 pr-4 ${!canPruefung ? "rounded-r-xl" : ""}`}>
                          <Link to="/bettenstamm" className="text-xs text-slate-400 hover:underline">
                            → Bearbeiten
                          </Link>
                        </td>
                      )}
                      {canPruefung && (
                        <td className="py-3 pr-4 rounded-r-xl">
                          <button
                            className="btn-ghost !py-1 !px-2 text-xs text-emerald-600 hover:bg-emerald-50"
                            onClick={() => { setNewDate(""); setPruefModal(b); }}>
                            🔧 P&amp;W
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Karten */}
          <div className="md:hidden space-y-2">
            {filtered.map(b => {
              const a = ampel(b);
              return (
                <div key={b.id} className={`card !p-3 flex items-start justify-between gap-3 ${
                  (b.tage_ueberfaellig ?? -999) > 0 ? "border-l-4 border-red-400" :
                  (b.tage_ueberfaellig ?? -999) > -30 ? "border-l-4 border-amber-400" :
                  b.gesperrt ? "border-l-4 border-slate-400" : ""
                }`}>
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-sm">{b.barcode}</div>
                    {b.bed_type_name && <div className="text-xs text-slate-500">{b.bed_type_name}</div>}
                    {b.last_station_name && (
                      <div className="text-xs text-slate-400 mt-0.5">📍 {b.last_station_name}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <span className={`badge text-xs ${a.cls}`}>{a.label}</span>
                    {b.gesperrt && <div className="badge bg-red-100 text-red-700 text-xs">🔒</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 text-right">{filtered.length} von {beds.length} Betten</div>
        </>
      )}
    </div>
  );
}
