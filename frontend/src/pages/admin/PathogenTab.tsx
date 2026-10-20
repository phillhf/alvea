import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { confirmDialog } from "../../components/Dialog";
import { RowActions, EditModal } from "./shared";

function PathogenTab() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    severity: 2,
  });
  const [editing, setEditing] = useState<any | null>(null);

  async function refresh() {
    setItems((await api.get("/pathogens")).data);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!form.code.trim() || !form.name.trim()) return;
    try {
      await api.post("/pathogens", {
        code: form.code.toUpperCase().trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        severity: form.severity,
      });
      setForm({ code: "", name: "", description: "", severity: 2 });
      refresh();
    } catch (e: any) {
      const err = e.response?.data?.error;
      toast.error(
        err === "duplicate_code"
          ? "Code existiert bereits."
          : "Fehler: " + (err || e.message)
      );
    }
  }
  async function save() {
    await api.patch(`/pathogens/${editing.code}`, {
      name: editing.name,
      description: editing.description || undefined,
      severity: editing.severity,
      disinfectant: editing.disinfectant || null,
      cleaning_agent: editing.cleaning_agent || null,
      hygiene_notes: editing.hygiene_notes || null,
    });
    setEditing(null);
    refresh();
  }
  async function remove(code: string, name: string) {
    if (!(await confirmDialog(
      `Krankheitserreger „${name}" (${code}) löschen? Bereits angelegte Aufträge behalten den Code in ihrer Historie.`,
      { danger: true }
    ))) return;
    await api.delete(`/pathogens/${code}`);
    refresh();
  }

  const sevLabel = (s: number) =>
    s === 1
      ? { text: "hoch", css: "bg-red-100 text-red-700" }
      : s === 2
      ? { text: "mittel", css: "bg-yellow-100 text-yellow-700" }
      : { text: "niedrig", css: "bg-green-100 text-green-700" };

  return (
    <div className="space-y-3">
      <div className="card flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">Code</label>
          <input
            className="input font-mono"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            style={{ width: 90 }}
            placeholder="MRSA"
          />
        </div>
        <div className="flex-1">
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Meticillin-resistenter Staphylococcus aureus"
          />
        </div>
        <div className="flex-1">
          <label className="label">Beschreibung</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Risiko</label>
          <select
            className="input"
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })}
          >
            <option value={1}>hoch</option>
            <option value={2}>mittel</option>
            <option value={3}>niedrig</option>
          </select>
        </div>
        <button className="btn-primary" onClick={create}>
          Anlegen
        </button>
      </div>
      <ul className="card !p-0 divide-y divide-slate-100 dark:divide-slate-700">
        {items.length === 0 && (
          <li className="p-3 text-sm text-slate-400">
            Noch keine Krankheitserreger angelegt.
          </li>
        )}
        {items.map((p) => {
          const sev = sevLabel(p.severity);
          return (
            <li key={p.code} className="p-3 flex justify-between items-center gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="font-mono font-bold text-sm">{p.code}</span>
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-slate-400">{p.description}</div>
                  )}
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sev.css}`}
                >
                  {sev.text}
                </span>
              </div>
              <RowActions
                onEdit={() => setEditing(p)}
                onDelete={() => remove(p.code, p.name)}
                confirmMsg={`Krankheitserreger „${p.name}" (${p.code}) löschen?`}
              />
            </li>
          );
        })}
      </ul>
      {editing && (
        <EditModal
          title="Krankheitserreger bearbeiten"
          onSave={save}
          onClose={() => setEditing(null)}
        >
          <div>
            <label className="label">Code</label>
            <input
              className="input font-mono"
              value={editing.code}
              disabled
            />
          </div>
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <input
              className="input"
              value={editing.description ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Risiko</label>
            <select
              className="input"
              value={editing.severity}
              onChange={(e) =>
                setEditing({ ...editing, severity: Number(e.target.value) })
              }
            >
              <option value={1}>hoch</option>
              <option value={2}>mittel</option>
              <option value={3}>niedrig</option>
            </select>
          </div>
          <div>
            <label className="label">Desinfektion</label>
            <input
              className="input"
              value={editing.disinfectant ?? ""}
              placeholder="z. B. Flächendesinfektion auf Alkoholbasis"
              onChange={(e) => setEditing({ ...editing, disinfectant: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Reinigungsmittel</label>
            <input
              className="input"
              value={editing.cleaning_agent ?? ""}
              placeholder="z. B. Einmal-Reinigungstücher"
              onChange={(e) => setEditing({ ...editing, cleaning_agent: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Hygiene-Hinweise</label>
            <textarea
              className="input"
              rows={4}
              value={editing.hygiene_notes ?? ""}
              placeholder="PSA, Einwirkzeit, Besonderheiten…"
              onChange={(e) => setEditing({ ...editing, hygiene_notes: e.target.value })}
            />
          </div>
        </EditModal>
      )}
    </div>
  );
}

/* ============================================================ */
/* STRICHCODES                                                  */
/* ============================================================ */

export default PathogenTab;
