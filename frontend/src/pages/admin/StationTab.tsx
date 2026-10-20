import { AttributeEditor } from "../../components/AttributeEditor";
import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { useRaumbuch } from "../../contexts/RaumbuchContext";

function StationTab() {
  const toast = useToast();
  const { filteredAreas, selectedHouse, selectedArea, reload: reloadCtx } = useRaumbuch();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ area_id: "", name: "", short_code: "" });
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => {
    if (selectedArea) setForm(f => ({ ...f, area_id: selectedArea.id }));
    else if (filteredAreas.length > 0 && !form.area_id) setForm(f => ({ ...f, area_id: filteredAreas[0].id }));
  }, [selectedArea, filteredAreas]);

  async function refresh() {
    const r = await api.get("/stations");
    setItems(r.data);
    reloadCtx();
  }
  useEffect(() => { refresh(); }, []);

  // Filtern nach Context
  const activeAreaId = selectedArea?.id ?? form.area_id;
  const visible = selectedArea  ? items.filter(s => s.area_id === selectedArea.id) :
                  activeAreaId  ? items.filter(s => s.area_id === activeAreaId) :
                  selectedHouse ? items.filter(s => filteredAreas.some(a => a.id === s.area_id)) :
                  items;

  async function create() {
    if (!form.area_id || !form.name.trim()) return;
    await api.post("/stations", {
      area_id: form.area_id,
      name: form.name.trim(),
      short_code: form.short_code.trim() || undefined,
    });
    setForm((f) => ({ ...f, name: "", short_code: "" }));
    refresh();
  }
  async function save() {
    await api.patch(`/stations/${editing.id}`, {
      area_id: editing.area_id,
      name: editing.name,
      short_code: editing.short_code || undefined,
    });
    setEditing(null);
    refresh();
  }
  async function remove(id: string, n: string) {
    if (!confirm(`Station „${n}" löschen? Alle Zimmer und Betten darunter werden mit gelöscht.`)) return;
    try {
      await api.delete(`/stations/${id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const d = e.response.data;
        if (!confirm(`Station „${n}" enthält noch:\n\u2022 ${d.rooms} Zimmer, ${d.beds} Betten\n\u2022 ${d.active_tasks} aktive Aufträge\n\nAlle Daten werden unwiderruflich gelöscht. Fortfahren?`)) return;
        await api.delete(`/stations/${id}?force=true`);
      } else { toast.error(e.response?.data?.error || "Fehler beim Löschen"); return; }
    }
    refresh();
  }

  function scoreColor(score: number) {
    if (score === 0) return "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
    if (score < 2)   return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    if (score < 5)   return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Bereich</label>
          <select
            className="input"
            value={form.area_id}
            onChange={(e) => setForm({ ...form, area_id: e.target.value })}
          >
            {filteredAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Name</label>
          <input className="input" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Kürzel</label>
          <input className="input" value={form.short_code}
            onChange={(e) => setForm({ ...form, short_code: e.target.value })}
            style={{ width: 90 }} />
        </div>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      {(selectedHouse || selectedArea) && (
        <p className="text-xs text-slate-400">
          Zeige {visible.length} Station{visible.length !== 1 ? "en" : ""}
          {selectedArea ? ` in Bereich „${selectedArea.name}"` : selectedHouse ? ` in Haus „${selectedHouse.name}"` : ""}
        </p>
      )}

      {/* Table header */}
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
              <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Station</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bereich / Haus</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kürzel</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Punkte</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-400 text-center">
                  Noch keine Stationen{selectedArea ? ` in „${selectedArea.name}"` : ""} angelegt.
                </td>
              </tr>
            )}
            {visible.map((s) => {
              const score = Number(s.priority_score ?? 0);
              return (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {s.area_name}
                    {s.house_name && (
                      <span className="ml-1 text-slate-400">· {s.house_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {s.short_code ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`inline-block min-w-[3rem] rounded-full px-2 py-0.5 text-xs font-semibold text-center ${scoreColor(score)}`}
                      title="Aktueller Prioritätsscore (offene Aufträge)"
                    >
                      {score > 0 ? score.toFixed(1) : "–"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RowActions
                      onEdit={() => setEditing(s)}
                      onDelete={() => remove(s.id, s.name)}
                      confirmMsg={`Station „${s.name}" löschen?`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Score-Legende */}
      <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> 0 = keine offenen Aufträge
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> &lt; 2 = niedrig
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 2–5 = mittel
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &gt; 5 = hoch
        </span>
      </div>

      {editing && (
        <EditModal
          title="Station bearbeiten"
          onSave={save}
          onClose={() => setEditing(null)}
        >
          <div>
            <label className="label">Bereich</label>
            <select
              className="input"
              value={editing.area_id}
              onChange={(e) =>
                setEditing({ ...editing, area_id: e.target.value })
              }
            >
              {filteredAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Kürzel</label>
            <input className="input" value={editing.short_code ?? ""}
              onChange={(e) => setEditing({ ...editing, short_code: e.target.value })} />
          </div>
          <AttributeEditor entityType="station" entityId={editing.id} />
        </EditModal>
      )}
    </div>
  );
}

/* ============================================================ */
/* ROOMS                                                        */
/* ============================================================ */

export default StationTab;
