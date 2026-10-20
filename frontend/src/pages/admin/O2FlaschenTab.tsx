import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { BarcodeInput } from "../../components/BarcodeInput";
import { confirmDialog } from "../../components/Dialog";

interface Flasche { id: string; barcode: string; typ_id: string | null; lager_id: string | null; status: string; typ_name: string | null; lager_name: string | null; house_name: string | null; }
interface Typ   { id: string; name: string; }
interface Lager { id: string; name: string; house_name: string | null; }

const STATUS_LABEL: Record<string, string> = {
  lager: "Im Lager", unterwegs: "Unterwegs", auf_station: "Auf Station",
  leer_unterwegs: "Leer/Unterwegs", leer_lager: "Leer/Lager",
};

export default function O2FlaschenTab() {
  const toast = useToast();
  const [flaschen, setFlaschen] = useState<Flasche[]>([]);
  const [typen, setTypen]       = useState<Typ[]>([]);
  const [lager, setLager]       = useState<Lager[]>([]);
  const [barcode, setBarcode]   = useState("");
  const [typId, setTypId]       = useState("");
  const [lagerId, setLagerId]   = useState("");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    load();
    api.get<Typ[]>("/o2/typen").then(r => setTypen(r.data)).catch(() => {});
    api.get<Lager[]>("/o2/lager").then(r => setLager(r.data)).catch(() => {});
  }, []);

  function load() {
    api.get<Flasche[]>("/o2/flaschen").then(r => setFlaschen(r.data)).catch(() => {});
  }

  async function handleAdd() {
    if (!barcode.trim()) return;
    try {
      await api.post("/o2/flaschen", { barcode: barcode.trim(), typ_id: typId || null, lager_id: lagerId || null });
      setBarcode(""); load(); toast.success("Flasche angelegt.");
    } catch (err: any) {
      if (err?.response?.data?.error === "barcode_exists") toast.error("Barcode bereits vorhanden.");
      else toast.error("Fehler.");
    }
  }

  async function handleDelete(id: string, bc: string) {
    if (!(await confirmDialog(`Flasche ${bc} löschen?`, { danger: true }))) return;
    try { await api.delete(`/o2/flaschen/${id}`); load(); toast.success("Gelöscht."); }
    catch { toast.error("Fehler."); }
  }

  const existingBarcodes = flaschen.map(f => f.barcode);
  const filtered = search
    ? flaschen.filter(f => f.barcode.toLowerCase().includes(search.toLowerCase()) || (f.typ_name ?? "").toLowerCase().includes(search.toLowerCase()))
    : flaschen;

  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-lg font-semibold text-slate-800">Flaschen</h2>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Barcode *</label>
          <div onKeyDown={e => e.key === "Enter" && handleAdd()}>
            <BarcodeInput value={barcode} onChange={setBarcode} options={[]} placeholder="Barcode scannen oder eingeben" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Flaschentyp</label>
            <select value={typId} onChange={e => setTypId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">– kein Typ –</option>
              {typen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lager</label>
            <select value={lagerId} onChange={e => setLagerId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">– kein Lager –</option>
              {lager.map(l => <option key={l.id} value={l.id}>{l.name}{l.house_name ? ` (${l.house_name})` : ""}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleAdd} disabled={!barcode.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--brand-600)" }}>
          + Flasche anlegen
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Suchen…"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />

      <p className="text-xs text-slate-400">{filtered.length} Flaschen</p>

      <div className="space-y-1.5">
        {filtered.map(f => (
          <div key={f.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-mono font-semibold text-slate-800 text-sm">{f.barcode}</p>
              <p className="text-xs text-slate-500">
                {f.typ_name ?? "–"} · {f.lager_name ?? "Kein Lager"}{f.house_name ? ` (${f.house_name})` : ""}
              </p>
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">{STATUS_LABEL[f.status] ?? f.status}</span>
            <button onClick={() => handleDelete(f.id, f.barcode)}
              className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Keine Flaschen.</p>}
      </div>
    </div>
  );
}
