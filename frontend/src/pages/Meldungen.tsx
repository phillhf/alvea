import { useEffect, useState } from "react";
import { api } from "../api/client";
import { confirmDialog } from "../components/Dialog";

interface Announcement {
  id: string; title: string; body: string;
  priority: "normal" | "wichtig" | "dringend";
  expires_at: string | null; created_by: string; created_by_name: string; created_at: string;
}

const PRIO_LABEL = { normal: "Meldung", wichtig: "Wichtig", dringend: "Dringend" };
const PRIO_COLOR = {
  normal:   "bg-blue-100 text-blue-700",
  wichtig:  "bg-amber-100 text-amber-700",
  dringend: "bg-red-100 text-red-700",
};

type FormState = { title: string; body: string; priority: "normal" | "wichtig" | "dringend"; expires_at: string };
const empty: FormState = { title: "", body: "", priority: "normal", expires_at: "" };

function AnnouncementCard({ a, onEdit, onDelete }: {
  a: Announcement;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card flex gap-4 items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIO_COLOR[a.priority]}`}>
            {PRIO_LABEL[a.priority]}
          </span>
          <span className="font-semibold text-sm">{a.title}</span>
        </div>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.body}</p>
        <div className="text-xs text-slate-400 mt-1.5 flex gap-3 flex-wrap">
          <span>Erstellt: {new Date(a.created_at.replace(" ", "T") + "Z").toLocaleDateString("de-DE")} · {a.created_by_name}</span>
          {a.expires_at && (
            <span>Gültig bis: {new Date(a.expires_at + "T00:00:00").toLocaleDateString("de-DE")}</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => onEdit(a)}>✏️</button>
        <button className="btn-ghost !py-1 !px-2 text-xs text-red-500" onClick={() => onDelete(a.id)}>🗑</button>
      </div>
    </div>
  );
}

export default function Meldungen() {
  const [items,        setItems]       = useState<Announcement[]>([]);
  const [form,         setForm]        = useState<FormState>({ ...empty });
  const [editing,      setEditing]     = useState<Announcement | null>(null);
  const [saving,       setSaving]      = useState(false);
  const [err,          setErr]         = useState<string | null>(null);
  const [archivOpen,   setArchivOpen]  = useState(false);

  async function load() {
    const { data } = await api.get<Announcement[]>("/announcements/all");
    setItems(data);
  }
  useEffect(() => { load(); }, []);

  const isExpired = (a: Announcement) =>
    !!a.expires_at && new Date(a.expires_at) < new Date();

  const aktiv   = items.filter(a => !isExpired(a));
  const archiv  = items.filter(a =>  isExpired(a));

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({ title: a.title, body: a.body, priority: a.priority, expires_at: a.expires_at ?? "" });
    setErr(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setErr(null);
    load();
    setSaving(false);
  }

  async function remove(id: string) {
    if (!(await confirmDialog("Meldung löschen?", { danger: true }))) return;
    await api.delete(`/announcements/${id}`);
    load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold">📢 Meldungen</h1>

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
              onChange={e => setForm({ ...form, priority: e.target.value as "normal" | "wichtig" | "dringend" })}>
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
            <button className="btn-ghost" onClick={() => { setEditing(null); setForm({ ...empty }); setErr(null); }}>
              Abbrechen
            </button>
          )}
        </div>
      </div>

      {/* Aktive Meldungen */}
      <div className="space-y-2">
        {aktiv.length === 0 && (
          <div className="card text-center text-slate-400 py-10">Keine aktiven Meldungen.</div>
        )}
        {aktiv.map(a => (
          <AnnouncementCard key={a.id} a={a} onEdit={openEdit} onDelete={remove} />
        ))}
      </div>

      {/* Archiv – aufklappbar */}
      {archiv.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-600"
            onClick={() => setArchivOpen(o => !o)}
          >
            <span>🗂 Archiv – {archiv.length} abgelaufene Meldung{archiv.length !== 1 ? "en" : ""}</span>
            <span className="text-slate-400">{archivOpen ? "▲" : "▼"}</span>
          </button>
          {archivOpen && (
            <div className="p-3 space-y-2 bg-white">
              {archiv.map(a => (
                <div key={a.id} className="opacity-60">
                  <AnnouncementCard a={a} onEdit={openEdit} onDelete={remove} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
