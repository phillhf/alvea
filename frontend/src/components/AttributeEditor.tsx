import { useEffect, useState } from "react";
import { api } from "../api/client";

interface AttrEntry {
  definition: {
    id: string; name: string; field_type: string;
    options: string[] | null; required: boolean; entity_type: string;
  };
  value: string | null;
}

interface Props {
  entityType: string;       // "bed" | "room" | "station"
  entityId:   string;
  roomTypeId?: string | null; // für raumtyp-spezifische Attribute
  onSave?:    () => void;
}

export function AttributeEditor({ entityType, entityId, roomTypeId, onSave }: Props) {
  const [entries, setEntries] = useState<AttrEntry[]>([]);
  const [values,  setValues]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    if (!entityId) return;
    const requests = [api.get<AttrEntry[]>(`/attributes/values/${entityType}/${entityId}`)];
    // Raumtyp-spezifische Attribute laden
    if (entityType === "room" && roomTypeId) {
      requests.push(api.get<AttrEntry[]>(`/attributes/values/room_${roomTypeId}/${entityId}`));
    }
    Promise.all(requests).then(results => {
      const all = results.flatMap(r => r.data);
      setEntries(all);
      const init: Record<string, string> = {};
      all.forEach(e => { if (e.value != null) init[e.definition.id] = e.value; });
      setValues(init);
    });
  }, [entityType, entityId, roomTypeId]);

  if (entries.length === 0) return null;

  async function save() {
    setSaving(true);
    try {
      // Allgemeine Attribute
      const generalEntries = entries.filter(e => e.definition.entity_type === entityType);
      const typeEntries    = entries.filter(e => e.definition.entity_type !== entityType);
      const generalValues  = Object.fromEntries(
        Object.entries(values).filter(([k]) => generalEntries.some(e => e.definition.id === k))
      );
      const typeValues     = Object.fromEntries(
        Object.entries(values).filter(([k]) => typeEntries.some(e => e.definition.id === k))
      );

      await api.put(`/attributes/values/${entityType}/${entityId}`, generalValues);
      if (typeEntries.length > 0 && entityType === "room" && roomTypeId) {
        await api.put(`/attributes/values/room_${roomTypeId}/${entityId}`, typeValues);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave?.();
    } finally { setSaving(false); }
  }

  function renderField(entry: AttrEntry) {
    const { id, name, field_type, options, required } = entry.definition;
    const value = values[id] ?? "";

    switch (field_type) {
      case "text":
        return <input className="input" value={value} required={required}
          onChange={e => setValues({ ...values, [id]: e.target.value })} />;
      case "number":
        return <input className="input" type="number" value={value} required={required}
          onChange={e => setValues({ ...values, [id]: e.target.value })} />;
      case "date":
        return <input className="input" type="date" value={value} required={required}
          onChange={e => setValues({ ...values, [id]: e.target.value })} />;
      case "boolean":
        return (
          <select className="input" value={value} onChange={e => setValues({ ...values, [id]: e.target.value })}>
            <option value="">— wählen —</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        );
      case "select":
        return (
          <select className="input" value={value} required={required}
            onChange={e => setValues({ ...values, [id]: e.target.value })}>
            <option value="">— wählen —</option>
            {(options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case "multiselect": {
        const selected = value ? value.split(",") : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {(options ?? []).map(o => {
              const active = selected.includes(o);
              return (
                <button key={o} type="button"
                  onClick={() => {
                    const next = active ? selected.filter(s => s !== o) : [...selected, o];
                    setValues({ ...values, [id]: next.join(",") });
                  }}
                  className={`px-3 py-1 rounded-lg text-sm border transition-all ${
                    active
                      ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)] text-[color:var(--brand-700)]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}>
                  {o}
                </button>
              );
            })}
          </div>
        );
      }
      default: return null;
    }
  }

  // Gruppierung nach allgemein / raumtyp-spezifisch
  const generalEntries = entries.filter(e => !e.definition.entity_type.startsWith("room_"));
  const typeEntries    = entries.filter(e =>  e.definition.entity_type.startsWith("room_"));

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4 mt-2">
      <h3 className="font-semibold text-sm text-slate-600">📋 Weitere Angaben</h3>

      {generalEntries.map(entry => (
        <div key={entry.definition.id}>
          <label className="label">
            {entry.definition.name}
            {entry.definition.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {renderField(entry)}
        </div>
      ))}

      {typeEntries.length > 0 && (
        <>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Raumtyp-spezifisch</p>
          {typeEntries.map(entry => (
            <div key={entry.definition.id}>
              <label className="label">
                {entry.definition.name}
                {entry.definition.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderField(entry)}
            </div>
          ))}
        </>
      )}

      <button className="btn-primary text-sm" onClick={save} disabled={saving}>
        {saving ? "Speichern…" : saved ? "✓ Gespeichert" : "Angaben speichern"}
      </button>
    </div>
  );
}
