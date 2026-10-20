import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Announcement {
  id: string; title: string; body: string;
  priority: "normal"|"wichtig"|"dringend";
  expires_at: string|null; created_by: string; created_at: string;
}

const PRIO_LABEL = { normal: "Meldung", wichtig: "Wichtig", dringend: "Dringend" };
const PRIO_COLOR = {
  normal:   "bg-blue-100 text-blue-700",
  wichtig:  "bg-amber-100 text-amber-700",
  dringend: "bg-red-100 text-red-700",
};

const empty = { title: "", body: "", priority: "normal" as const, expires_at: "" };

export function AnnouncementsTab() {
  const [items,   setItems]   = useState<Announcement[]>([]);
  const [form, setForm] = useState<{ title: string; body: string; priority: "normal"|"wichtig"|"dringend"; expires_at: string }>({ ...empty });
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string|null>(null);

  async function load() {
    const { data } = await api.get<Announcement[]>("/announcements/all");
    setItems(data);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...empty }); setErr(null); }
  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({ title: a.title, body: a.body, priority: a.priority, expires_at: a.expires_at ?? "" });
    setErr(null);
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) { setErr("Titel und Text sind Pflichtfelder."); return; }
    setSaving(true);
    const payload = { ...form, expires_at: form.expires_at || null };
    if (editing) {
      await api.patch(`/announcements/${editing.id}`, payload);
    } else {
      await api.post("/announcements", payload);
    }
    setEditing(null);
    setForm({ ...empty });
    load();
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Meldung löschen?")) return;
    await api.delete(`/announcements/${id}`);
    load();
  }

  const isExpired = (a: Announcement) =>
    !!a.expires_at && new Date(a.expires_at) < new Date();

  return (
    <div className="space-y-5">
      {/* Formular */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-base">
          {editing ? "✏️ Meldung bearbeiten" : "📢 Neue Meldung"}
        </h3>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="space-y-1">
          <label className="label">Titel *</label>
          <input className="input" placeholder="z. B. Rückruf Medizinprodukt XY"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>

        <div className="space-y-1">
          <label className="label">Text *</label>
          <textarea className="input min-h-[100px]" placeholder="Meldungstext…"
            value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="label">Priorität</label>
            <select className="input" value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value as any })}>
              <option value="normal">📢 Meldung (normal)</option>
              <option value="wichtig">⚠️ Wichtig</option>
              <option value="dringend">🚨 Dringend</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="label">Gültig bis (optional)</label>
            <input className="input" type="date"
              value={form.expires_at}
              onChange={e => setForm({ ...form, expires_at: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Speichert…" : editing ? "Speichern" : "Meldung erstellen"}
          </button>
          {editing && (
            <button className="btn-ghost" onClick={() => { setEditing(null); setForm({ ...empty }); }}>
              Abbrechen
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="card text-center text-slate-400 py-10">Keine Meldungen vorhanden.</div>
        )}
        {items.map(a => (
          <div key={a.id} className={`card flex gap-4 items-start ${isExpired(a) ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIO_COLOR[a.priority]}`}>
                  {PRIO_LABEL[a.priority]}
                </span>
                <span className="font-semibold text-sm">{a.title}</span>
                {isExpired(a) && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Abgelaufen</span>
                )}
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.body}</p>
              <div className="text-xs text-slate-400 mt-1.5 flex gap-3 flex-wrap">
                <span>
                  Erstellt: {new Date(a.created_at.replace(" ","T")+"Z").toLocaleDateString("de-DE")} · {a.created_by}
                </span>
                {a.expires_at && (
                  <span>Gültig bis: {new Date(a.expires_at+"T00:00:00").toLocaleDateString("de-DE")}</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => openEdit(a)}>✏️</button>
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-500" onClick={() => remove(a.id)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
