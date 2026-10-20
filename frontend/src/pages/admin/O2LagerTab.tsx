import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { confirmDialog } from "../../components/Dialog";

interface Lager { id: string; name: string; house_id: string | null; house_name: string | null; }
interface House  { id: string; name: string; }

export default function O2LagerTab() {
  const toast = useToast();
  const [lager, setLager]   = useState<Lager[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName]     = useState("");
  const [houseId, setHouseId] = useState("");
  const [editId, setEditId]   = useState<string | null>(null);
  const [editName, setEditName]   = useState("");
  const [editHouseId, setEditHouseId] = useState("");

  useEffect(() => {
    load();
    api.get<House[]>("/houses").then(r => setHouses(r.data)).catch(() => {});
  }, []);

  function load() {
    api.get<Lager[]>("/o2/lager").then(r => setLager(r.data)).catch(() => {});
  }

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await api.post("/o2/lager", { name: name.trim(), house_id: houseId || null });
      setName(""); setHouseId(""); load(); toast.success("Lager angelegt.");
    } catch { toast.error("Fehler."); }
  }

  async function handleSave(id: string) {
    try {
      await api.patch(`/o2/lager/${id}`, { name: editName, house_id: editHouseId || null });
      setEditId(null); load(); toast.success("Gespeichert.");
    } catch { toast.error("Fehler."); }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog("Lager löschen?", { danger: true }))) return;
    try { await api.delete(`/o2/lager/${id}`); load(); toast.success("Gelöscht."); }
    catch { toast.error("Fehler."); }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-slate-800">Sauerstofflager</h2>
      <p className="text-sm text-slate-500">Pro Haus ein Lager anlegen.</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name des Lagers"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
        <select value={houseId} onChange={e => setHouseId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
          <option value="">– Haus zuordnen (optional) –</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--brand-600)" }}>
          + Lager anlegen
        </button>
      </div>

      <div className="space-y-1.5">
        {lager.map(l => (
          <div key={l.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            {editId === l.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                <select value={editHouseId} onChange={e => setEditHouseId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">– Kein Haus –</option>
                  {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => handleSave(l.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: "var(--brand-600)" }}>Speichern</button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700">Abbrechen</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{l.name}</p>
                  {l.house_name && <p className="text-xs text-slate-500">{l.house_name}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditId(l.id); setEditName(l.name); setEditHouseId(l.house_id ?? ""); }}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded">✏️</button>
                  <button onClick={() => handleDelete(l.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">🗑</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {lager.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Noch keine Lager.</p>}
      </div>
    </div>
  );
}
