import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

interface WaescheTyp { id: string; name: string; sort_order: number; aktiv: number; }

export default function WaescheTypenTab() {
  const toast = useToast();
  const [list, setList]       = useState<WaescheTyp[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<WaescheTyp | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    const r = await api.get<WaescheTyp[]>("/waesche/typen/alle");
    setList(r.data);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post("/waesche/typen", { name: newName.trim(), sort_order: list.length });
      setNewName(""); load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler beim Anlegen");
    } finally { setSaving(false); }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/waesche/typen/${editing.id}`, { name: editing.name, sort_order: editing.sort_order });
      setEditing(null); load();
    } finally { setSaving(false); }
  }

  async function toggleAktiv(t: WaescheTyp) {
    await api.patch(`/waesche/typen/${t.id}`, { aktiv: !t.aktiv });
    load();
  }

  return (
    <div className="space-y-4 max-w-xl">
      {/* Neu anlegen */}
      <div className="card !p-4 flex gap-2">
        <input className="input flex-1" placeholder="Neuer Wäschetyp…"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn-primary" onClick={add} disabled={saving || !newName.trim()}>
          + Anlegen
        </button>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {list.map(t => (
          <div key={t.id} className={`card !p-3 flex items-center gap-3 ${!t.aktiv ? "opacity-50" : ""}`}>
            {editing?.id === t.id ? (
              <>
                <input className="input flex-1 text-sm" value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && save()} autoFocus />
                <button className="btn-primary !py-1 !px-3 text-xs" onClick={save} disabled={saving}>✓</button>
                <button className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setEditing(null)}>✕</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{t.name}</span>
                {!t.aktiv && <span className="text-xs text-slate-400">Inaktiv</span>}
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setEditing(t)}>✏️</button>
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => toggleAktiv(t)}>
                  {t.aktiv ? "⏸ Deakt." : "▶ Aktiv."}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Deaktivierte Typen erscheinen nicht im Dropdown der Wäsche-Anfrage. Standard: Kissen, Bettdecke.
      </p>
    </div>
  );
}
