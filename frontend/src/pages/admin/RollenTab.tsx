import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { confirmDialog } from "../../components/Dialog";

const ALL_PERMISSIONS = [
  { key: "bettenaufbereitung",         label: "Bettenaufb.-Dezentral",  desc: "Tab Bettenaufbereitung-Dezentral sichtbar" },
  { key: "bettenaufbereitung_zentral", label: "Bettenaufb.-Zentral",    desc: "Tab Bettenaufbereitung-Zentral sichtbar" },
  { key: "zimmerreinigung",            label: "Scheuer-Wisch",         desc: "Tab Zimmerreinigung sichtbar" },
  { key: "berichte",                   label: "Berichte",                desc: "Tab Berichte sichtbar" },
  { key: "sauerstofftransport",        label: "Sauerstofftransport",     desc: "Sauerstofftransporte annehmen und durchführen" },
  { key: "betten_reparatur",           label: "Betten-Reparatur",        desc: "Defekte Betten verwalten und reparieren (Instandsetzung)" },
  { key: "bettenstamm",               label: "Bettenstamm",             desc: "Physische Betten anlegen und verwalten" },
  { key: "betten_pw",                 label: "Betten P\u0026W",             desc: "Tab Betten Prüfung & Wartung – Prüftermine und Sperrungen" },
  { key: "meldungen",          label: "Meldungen",          desc: "Meldungen und Ankündigungen erstellen, bearbeiten, löschen" },
  { key: "raumbuch",           label: "Raumbuch",            desc: "Häuser, Bereiche, Stationen, Zimmer und Platzhalterbetten verwalten" },
  { key: "benutzerverwaltung", label: "Benutzer & Rollen",   desc: "Mitarbeiter, Rollen und Teams verwalten" },
  { key: "spindverwaltung",    label: "Spindverwaltung",     desc: "Spinde verwalten und Personen zuweisen" },
  { key: "stationspersonal",   label: "Meine Station",       desc: "Tab 'Meine Station' für Pflegepersonal – Reinigung anfordern & Defekte melden" },
  { key: "waesche",            label: "Kissen & Bettdecken", desc: "Wäsche-Anfragen von Stationen aufgeben und bearbeiten" },
  { key: "chat",               label: "Stations-Chat",       desc: "Chat-Widget in 'Meine Station' – stationsübergreifender Gruppenchat" },
  { key: "dashboard",                  label: "Dashboard",               desc: "Schichtleiter-Dashboard sichtbar" },
  { key: "auftraege_erstellen",        label: "Aufträge erstellen",      desc: "Neue Aufträge anlegen" },
  { key: "verwaltung",                 label: "Verwaltung",              desc: "Vollzugriff Verwaltung (nur Admin-Rollen)" },
] as const;

type PermKey = typeof ALL_PERMISSIONS[number]["key"];

function RollenTab() {
  const toast = useToast();
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm]   = useState({ name: "", description: "", permissions: [] as PermKey[] });

  async function refresh() {
    const r = await api.get("/roles");
    setRoles(r.data);
  }
  useEffect(() => { refresh(); }, []);

  function togglePerm(key: PermKey, arr: PermKey[]): PermKey[] {
    return arr.includes(key) ? arr.filter(p => p !== key) : [...arr, key];
  }

  async function create() {
    if (!form.name.trim()) return;
    await api.post("/roles", { name: form.name.trim(), description: form.description, permissions: form.permissions });
    setForm({ name: "", description: "", permissions: [] });
    refresh();
  }

  async function save() {
    await api.patch(`/roles/${editing.id}`, {
      name: editing.name,
      description: editing.description,
      permissions: editing.permissions,
    });
    setEditing(null);
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog(`Rolle „${name}" löschen?`, { danger: true }))) return;
    try {
      await api.delete(`/roles/${id}`);
      refresh();
    } catch (e: any) {
      if (e.response?.status === 409)
        toast.error(`Die Rolle ist noch ${e.response.data.users} Nutzer(n) zugewiesen. Bitte zuerst diesen Nutzern eine andere Rolle zuweisen.`);
      else toast.error("Fehler beim Löschen");
    }
  }

  const PermCheckboxes = ({ perms, onChange }: { perms: PermKey[]; onChange: (p: PermKey[]) => void }) => (
    <div className="space-y-2">
      {ALL_PERMISSIONS.map(p => (
        <label key={p.key} className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
            checked={perms.includes(p.key)}
            onChange={() => onChange(togglePerm(p.key, perms))}
          />
          <div>
            <div className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{p.label}</div>
            <div className="text-xs text-slate-400">{p.desc}</div>
          </div>
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Neue Rolle anlegen */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm text-slate-700">Neue Rolle anlegen</h3>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1" style={{ minWidth: 160 }}>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="z. B. Bereichsleiter" />
          </div>
          <div className="flex-1" style={{ minWidth: 200 }}>
            <label className="label">Beschreibung (optional)</label>
            <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung" />
          </div>
        </div>
        <div>
          <label className="label">Berechtigungen</label>
          <PermCheckboxes perms={form.permissions} onChange={p => setForm({ ...form, permissions: p })} />
        </div>
        <button className="btn-primary" onClick={create} disabled={!form.name.trim()}>Anlegen</button>
      </div>

      {/* Rollenliste */}
      <ul className="card divide-y divide-slate-100 dark:divide-slate-700 !p-0 overflow-hidden">
        {roles.length === 0 && (
          <li className="p-4 text-sm text-slate-400">Noch keine Rollen angelegt.</li>
        )}
        {roles.map(role => (
          <li key={role.id} className="p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{role.name}</div>
              {role.description && <div className="text-xs text-slate-400 mt-0.5">{role.description}</div>}
              <div className="flex flex-wrap gap-1 mt-2">
                {(role.permissions as string[]).map(p => {
                  const meta = ALL_PERMISSIONS.find(x => x.key === p);
                  return (
                    <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {meta?.label ?? p}
                    </span>
                  );
                })}
                {role.permissions.length === 0 && <span className="text-xs text-slate-400">Keine Berechtigungen</span>}
              </div>
            </div>
            <RowActions
              onEdit={() => setEditing({ ...role, permissions: [...role.permissions] })}
              onDelete={() => remove(role.id, role.name)}
              confirmMsg={`Rolle „${role.name}" löschen?`}
            />
          </li>
        ))}
      </ul>

      {/* Edit Modal */}
      {editing && (
        <EditModal title="Rolle bearbeiten" onSave={save} onClose={() => setEditing(null)}>
          <div>
            <label className="label">Name</label>
            <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <input className="input" value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Berechtigungen</label>
            <PermCheckboxes
              perms={editing.permissions}
              onChange={p => setEditing({ ...editing, permissions: p })}
            />
          </div>
        </EditModal>
      )}
    </div>
  );
}


export default RollenTab;
