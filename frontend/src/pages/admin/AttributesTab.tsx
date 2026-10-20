import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { EditModal } from "./shared";

interface AttrDef {
  id: string; entity_type: string; name: string;
  field_type: string; options: string[] | null;
  required: boolean; sort_order: number; active: boolean;
}
interface RoomType { id: string; name: string; icon: string; }

const FIELD_LABELS: Record<string, string> = {
  text: "Text", number: "Zahl", date: "Datum",
  select: "Auswahl (eine)", multiselect: "Auswahl (mehrere)", boolean: "Ja/Nein",
};

const BASE_ENTITIES = [
  { key: "station", label: "🏨 Station",   group: false },
  { key: "room",    label: "🚪 Raum (alle)", group: false },
  { key: "bed",     label: "🛏️ Stellplatz", group: false },
];

const EMPTY = {
  entity_type: "room", name: "", field_type: "text",
  options: [] as string[], required: false, sort_order: 0,
};

export default function AttributesTab() {
  const [defs,      setDefs]      = useState<AttrDef[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [editing,   setEditing]   = useState<AttrDef | null>(null);
  const [isNew,     setIsNew]     = useState(false);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);
  const [optInput,  setOptInput]  = useState("");

  async function load() {
    const [d, rt] = await Promise.all([
      api.get<AttrDef[]>("/attributes/definitions"),
      api.get<RoomType[]>("/room-types"),
    ]);
    setDefs(d.data);
    setRoomTypes(rt.data);
  }
  useEffect(() => { load(); }, []);

  // Alle Entitätstypen: fix + dynamische Raumtypen
  const allEntities = [
    ...BASE_ENTITIES,
    ...roomTypes.map(rt => ({
      key:   `room_${rt.id}`,
      label: `${rt.icon} Raum: ${rt.name}`,
      group: true,
    })),
  ];

  function labelFor(key: string) {
    return allEntities.find(e => e.key === key)?.label ?? key;
  }

  function openNew() {
    setForm({ ...EMPTY }); setEditing(null); setIsNew(true); setOptInput("");
  }
  function openEdit(d: AttrDef) {
    setForm({ entity_type: d.entity_type, name: d.name, field_type: d.field_type,
              options: d.options ?? [], required: d.required, sort_order: d.sort_order });
    setEditing(d); setIsNew(false); setOptInput("");
  }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form,
        options: ["select","multiselect"].includes(form.field_type) ? form.options : undefined };
      if (isNew) await api.post("/attributes/definitions", body);
      else       await api.patch(`/attributes/definitions/${editing!.id}`, body);
      load(); setIsNew(false); setEditing(null);
    } finally { setSaving(false); }
  }

  async function toggleActive(d: AttrDef) {
    await api.patch(`/attributes/definitions/${d.id}`, { active: !d.active }); load();
  }
  async function del(d: AttrDef) {
    if (!confirm(`Attribut „${d.name}" löschen? Alle eingetragenen Werte gehen verloren.`)) return;
    await api.delete(`/attributes/definitions/${d.id}`); load();
  }

  // Gruppierung: alle Entitätstypen die Attribute haben
  const usedEntityTypes = [...new Set(defs.map(d => d.entity_type))];
  const allEntityTypesToShow = [...new Set([
    ...allEntities.map(e => e.key),
    ...usedEntityTypes,
  ])];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Eigene Attribute</h2>
          <p className="text-sm text-slate-500 mt-1">
            Definiere zusätzliche Felder für Stellplätze, Räume (gesamt oder pro Raumtyp) und Stationen.
            Neue Raumtypen erscheinen automatisch als Option.
          </p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ Neues Attribut</button>
      </div>

      {allEntityTypesToShow.map(et => {
        const attrs = defs.filter(d => d.entity_type === et);
        const label = labelFor(et);
        return (
          <section key={et}>
            <h3 className="font-semibold text-sm text-slate-600 mb-2 flex items-center gap-2">
              {label}
              <span className="text-xs font-normal text-slate-400">({attrs.length} Attribute)</span>
            </h3>
            {attrs.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Keine Attribute definiert.</p>
            ) : (
              <div className="space-y-1">
                {attrs.map(d => (
                  <div key={d.id} className={`card !p-3 flex items-center gap-3 ${!d.active ? "opacity-50" : ""}`}>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{d.name}</span>
                      <span className="text-xs text-slate-400">{FIELD_LABELS[d.field_type]}</span>
                      {d.required && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Pflicht</span>}
                      {d.options?.length ? (
                        <span className="text-xs text-slate-400">[{d.options.join(", ")}]</span>
                      ) : null}
                      {!d.active && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Inaktiv</span>}
                    </div>
                    <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => openEdit(d)}>✎</button>
                    <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => toggleActive(d)}>
                      {d.active ? "⏸" : "▶"}
                    </button>
                    <button className="btn-ghost !py-1 !px-2 text-xs text-red-500" onClick={() => del(d)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {(isNew || editing) && (
        <EditModal
          title={isNew ? "Neues Attribut" : `Attribut: ${editing?.name}`}
          onSave={save} onClose={() => { setIsNew(false); setEditing(null); }} saving={saving}
        >
          <div className="space-y-3">
            <div>
              <label className="label">Für welchen Stammdatentyp?</label>
              <select className="input" value={form.entity_type}
                onChange={e => setForm({ ...form, entity_type: e.target.value })}
                disabled={!isNew}>
                {allEntities.map(e => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
              {form.entity_type.startsWith("room_") && (
                <p className="text-xs text-slate-400 mt-1">
                  Dieses Attribut gilt nur für Räume vom Typ „{roomTypes.find(rt => `room_${rt.id}` === form.entity_type)?.name}".
                </p>
              )}
            </div>
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="z. B. Kapazität, Gerät, Zertifizierung" />
            </div>
            <div>
              <label className="label">Feldtyp</label>
              <select className="input" value={form.field_type}
                onChange={e => setForm({ ...form, field_type: e.target.value })}>
                {Object.entries(FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {["select","multiselect"].includes(form.field_type) && (
              <div>
                <label className="label">Optionen</label>
                <div className="flex gap-2">
                  <input className="input flex-1" value={optInput}
                    onChange={e => setOptInput(e.target.value)}
                    placeholder="Option eingeben, Enter"
                    onKeyDown={e => {
                      if (e.key === "Enter" && optInput.trim()) {
                        setForm({ ...form, options: [...form.options, optInput.trim()] });
                        setOptInput(""); e.preventDefault();
                      }
                    }} />
                  <button className="btn-ghost" onClick={() => {
                    if (optInput.trim()) { setForm({ ...form, options: [...form.options, optInput.trim()] }); setOptInput(""); }
                  }}>+</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.options.map((o, i) => (
                    <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {o}
                      <button onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}
                        className="text-slate-400 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.required}
                onChange={e => setForm({ ...form, required: e.target.checked })} />
              Pflichtfeld
            </label>
          </div>
        </EditModal>
      )}
    </div>
  );
}
