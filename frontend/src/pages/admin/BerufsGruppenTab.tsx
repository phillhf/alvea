import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { confirmDialog } from "../../components/Dialog";

interface BG { id: string; name: string; sort_order: number; active: number; }

export default function BerufsGruppenTab() {
  const toast = useToast();
  const [list, setList]   = useState<BG[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<BG | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    const r = await api.get<BG[]>("/berufsgruppen");
    setList(r.data);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post("/berufsgruppen", { name: newName.trim(), sort_order: list.length });
      setNewName(""); load();
    } finally { setSaving(false); }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/berufsgruppen/${editing.id}`, { name: editing.name, sort_order: editing.sort_order });
      setEditing(null); load();
    } finally { setSaving(false); }
  }

  async function toggleActive(bg: BG) {
    await api.patch(`/berufsgruppen/${bg.id}`, { active: !bg.active });
    load();
  }

  async function remove(bg: BG) {
    if (!(await confirmDialog(`"${bg.name}" wirklich löschen?`, { danger: true }))) return;
    await api.delete(`/berufsgruppen/${bg.id}`);
    toast.success("Gelöscht");
    load();
  }

  return (
    <div className="space-y-4 max-w-xl">
      {/* Neu anlegen */}
      <div className="card !p-4 flex gap-2">
        <input className="input flex-1" placeholder="Neue Berufsgruppe…"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn-primary" onClick={add} disabled={saving || !newName.trim()}>
          + Anlegen
        </button>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {list.map(bg => (
          <div key={bg.id} className={`card !p-3 flex items-center gap-3 ${!bg.active ? "opacity-50" : ""}`}>
            {editing?.id === bg.id ? (
              <>
                <input className="input flex-1 text-sm" value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && save()} autoFocus />
                <button className="btn-primary !py-1 !px-3 text-xs" onClick={save} disabled={saving}>✓</button>
                <button className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setEditing(null)}>✕</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{bg.name}</span>
                {!bg.active && <span className="text-xs text-slate-400">Inaktiv</span>}
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setEditing(bg)}>✏️</button>
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => toggleActive(bg)}>
                  {bg.active ? "⏸ Deakt." : "▶ Aktiv."}
                </button>
                <button className="btn-ghost !py-1 !px-2 text-xs text-red-500" onClick={() => remove(bg)}>🗑</button>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Deaktivierte Berufsgruppen erscheinen nicht im Dropdown der Spind-Anfrage.</p>
    </div>
  );
}
