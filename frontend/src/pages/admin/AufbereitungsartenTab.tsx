import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

function DesinfektionsmaßnahmenTab() {
  const toast = useToast();
  interface Art {
    id: string; name: string; description: string; when_to_use: string;
    instructions: string; sort_order: number; active: number;
  }
  const [items, setItems] = useState<Art[]>([]);
  const [editing, setEditing] = useState<Art | null>(null);
  const [form, setForm] = useState({ name: "", description: "", when_to_use: "", instructions: "", sort_order: 0, active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function refresh() {
    const r = await api.get<Art[]>("/aufbereitungsarten?all=1");
    setItems(r.data);
  }
  useEffect(() => { refresh(); }, []);

  function startEdit(art: Art) {
    setEditing(art);
    setForm({ name: art.name, description: art.description, when_to_use: art.when_to_use, instructions: art.instructions, sort_order: art.sort_order, active: !!art.active });
  }
  function resetForm() { setEditing(null); setForm({ name: "", description: "", when_to_use: "", instructions: "", sort_order: 0, active: true }); }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/aufbereitungsarten/${editing.id}`, form);
      } else {
        await api.post("/aufbereitungsarten", form);
      }
      resetForm();
      refresh();
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!(await confirmDialog("Desinfektionsmaßnahme löschen?", { danger: true }))) return;
    setDeleting(id);
    try {
      await api.delete(`/aufbereitungsarten/${id}`);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error === "in_use"
        ? `Kann nicht gelöscht werden – noch ${e.response.data.tasks} Aufträge zugewiesen.`
        : "Fehler beim Löschen");
    } finally { setDeleting(null); }
  }

  return (
    <div className="space-y-6">
      {/* Formular */}
      <div className="card space-y-4">
        <h3 className="font-semibold">{editing ? `Bearbeiten: ${editing.name}` : "Neue Desinfektionsmaßnahme"}</h3>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name *</label>
            <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. RKI-Klasse A" />
          </div>
          <div>
            <label className="label">Reihenfolge</label>
            <input className="input w-full" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Beschreibung</label>
          <input className="input w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung des Verfahrens" />
        </div>

        <div>
          <label className="label">Wann anwenden?</label>
          <input className="input w-full" value={form.when_to_use} onChange={(e) => setForm({ ...form, when_to_use: e.target.value })}
            placeholder="z. B. Bei allen Isolations-Betten / nach Entlassung eines MRSA-Patienten" />
          <p className="text-xs text-slate-400 mt-1">Wird beim Auftrag-Erstellen als Hilfetext angezeigt.</p>
        </div>

        <div>
          <label className="label">Anleitung (Volltext)</label>
          <textarea className="input w-full font-mono text-sm" rows={8} value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder={"1. Schritt…\n2. Schritt…\n3. …"} />
          <p className="text-xs text-slate-400 mt-1">Wird dem Mitarbeiter beim Auftrag angezeigt.</p>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="art-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4" />
          <label htmlFor="art-active" className="text-sm">Aktiv (wird bei Auftragsanlage angezeigt)</label>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Speichern…" : editing ? "Änderungen speichern" : "Anlegen"}
          </button>
          {editing && <button className="btn-ghost" onClick={resetForm}>Abbrechen</button>}
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-400">Noch keine Desinfektionsmaßnahmen angelegt.</p>}
        {items.map((art) => (
          <div key={art.id} className={`card flex items-start justify-between gap-4 ${!art.active ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{art.name}</span>
                {!art.active && <span className="badge bg-slate-100 text-slate-500 text-xs">Inaktiv</span>}
                <span className="text-xs text-slate-400">Reihenf. {art.sort_order}</span>
              </div>
              {art.when_to_use && <div className="text-xs text-slate-500 mt-0.5"><span className="font-medium">Wann:</span> {art.when_to_use}</div>}
              {art.description && <div className="text-xs text-slate-400 mt-0.5">{art.description}</div>}
              {art.instructions && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Anleitung anzeigen</summary>
                  <pre className="text-xs whitespace-pre-wrap font-sans text-slate-600 mt-1 bg-slate-50 rounded p-2 max-h-32 overflow-y-auto">{art.instructions}</pre>
                </details>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => startEdit(art)}>✎</button>
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-500 hover:bg-red-50"
                onClick={() => del(art.id)} disabled={deleting === art.id}>
                {deleting === art.id ? "…" : "✕"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* AUFBEREITUNGSANLEITUNGEN                                     */
/* ============================================================ */

export default DesinfektionsmaßnahmenTab;
