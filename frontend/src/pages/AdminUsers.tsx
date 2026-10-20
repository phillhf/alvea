import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Role { id: string; name: string; permissions: string[]; }
interface User { id: string; email: string; full_name: string; role_id: string | null; role_name: string | null; active: number; can_change_password: number; area_count: number; team_id: string | null; team_name: string | null; }
interface Area  { id: string; name: string; }
interface Station { id: string; name: string; short_code: string | null; area_name: string; }
interface House { id: string; name: string; ki_number: string | null; }
interface Team  { id: string; name: string; area_id: string | null; area_name: string | null; }

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  async function refresh() {
    const [u, r, a, s, h, t] = await Promise.all([
      api.get<User[]>("/users").catch(() => ({ data: [] as User[] })),
      api.get<Role[]>("/roles").catch(() => ({ data: [] as Role[] })),
      api.get<Area[]>("/areas").catch(() => ({ data: [] as Area[] })),
      api.get<Station[]>("/stations").catch(() => ({ data: [] as Station[] })),
      api.get<House[]>("/houses").catch(() => ({ data: [] as House[] })),
      api.get<Team[]>("/teams").catch(() => ({ data: [] as Team[] })),
    ]);
    setUsers(u.data); setRoles(r.data); setAreas(a.data); setStations(s.data); setHouses(h.data); setTeams(t.data);
  }
  useEffect(() => { refresh(); }, []);

  async function toggleActive(u: User) {
    await api.patch(`/users/${u.id}`, { active: u.active ? 0 : 1 });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Benutzer</h1>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Benutzer anlegen</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-1.5">
          <thead className="text-left">
            <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="pb-1 pl-4 pr-3">Name</th>
              <th className="pb-1 pr-2">Benutzername</th>
              <th className="pb-1 pr-2">Rolle</th>
              <th className="pb-1 pr-2">Team</th>
              <th className="pb-1 pr-2">Aktiv</th>
              <th className="pb-1 pr-2">PW ändern</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="bg-white shadow-sm hover:shadow-md transition-shadow rounded-xl">
                <td className="py-2.5 pl-4 pr-3 font-medium rounded-l-xl">{u.full_name}</td>
                <td className="pr-2 text-slate-500">{u.email}</td>
                <td className="pr-2"><span className="badge bg-brand-100 text-brand-700">{u.role_name ?? "–"}</span></td>
                <td className="pr-2">
                  {u.team_name
                    ? <span className="badge bg-emerald-100 text-emerald-700">👥 {u.team_name}</span>
                    : <span className="text-slate-400 text-xs">— kein Team —</span>}
                </td>
                <td className="pr-2">
                  <button onClick={() => toggleActive(u)}
                          className={`text-xs px-2 py-0.5 rounded ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                    {u.active ? "Aktiv" : "Inaktiv"}
                  </button>
                </td>
                <td className="pr-3 text-right rounded-r-xl">
                  <button className="btn-ghost !py-1 text-xs" onClick={() => setEditing(u)}>
                    ✏️ Bearbeiten
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <UserModal roles={roles} areas={areas} stations={stations} houses={houses} teams={teams} onClose={() => { setShowNew(false); refresh(); }} />}
      {editing  && <UserModal user={editing} roles={roles} areas={areas} stations={stations} houses={houses} teams={teams} onClose={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

import { useToast } from "../contexts/ToastContext";

function UserModal({ user, roles, areas, stations, houses, teams, onClose }: {
  user?: User; roles: Role[]; areas: Area[]; stations: Station[]; houses: House[]; teams: Team[]; onClose: () => void;
}) {
  const isEdit = !!user;
  const toast = useToast();
  const [form, setForm] = useState({
    email:    user?.email    ?? "",
    full_name: user?.full_name ?? "",
    password: "",
    role_id:  user?.role_id  ?? (roles[0]?.id ?? ""),
    team_id:  user?.team_id  ?? "",
    area_ids:    new Set<string>(),
    station_ids: new Set<string>(),
    house_ids:   new Set<string>(),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPw, setGeneratedPw] = useState<string | null>(null);

  function generatePassword() {
    const adjectives = ["Blau","Rot","Grün","Grau","Warm","Kalt","Neu","Alt","Hell","Stark"];
    const nouns      = ["Tiger","Adler","Baum","Stein","Fluss","Berg","Wind","Stern","Mond","Wolf"];
    const num = Math.floor(100 + Math.random() * 900);
    const pw = `${adjectives[Math.floor(Math.random()*adjectives.length)]}-${nouns[Math.floor(Math.random()*nouns.length)]}-${num}`;
    setForm(f => ({ ...f, password: pw }));
    setGeneratedPw(pw);
    setShowPassword(true);
  }

  useEffect(() => {
    if (user) {
      api.get(`/users/${user.id}/areas`).then((r) =>
        setForm((f) => ({ ...f, area_ids: new Set((r.data as any[]).map((a) => a.id)) }))
      );
      api.get(`/users/${user.id}/stations`).then((r) =>
        setForm((f) => ({ ...f, station_ids: new Set((r.data as any[]).map((s: any) => s.station_id)) }))
      );
      api.get(`/users/${user.id}/houses`).then((r) =>
        setForm((f) => ({ ...f, house_ids: new Set((r.data as any[]).map((h: any) => h.house_id)) }))
      );
    }
  }, [user?.id]);

  async function submit() {
    setErr(null); setSaving(true);
    try {
      if (!form.role_id) { setErr("Bitte eine Rolle auswählen."); setSaving(false); return; }
      if (isEdit) {
        const patch: any = { role_id: form.role_id, team_id: form.team_id || null };
        if (form.full_name) patch.full_name = form.full_name;
        if (form.email)     patch.email     = form.email;
        if (form.password)  patch.password  = form.password;
        await api.patch(`/users/${user!.id}`, patch);
        await api.put(`/users/${user!.id}/stations`, { station_ids: Array.from(form.station_ids) });
        if (!form.team_id && form.station_ids.size === 0 && form.area_ids.size > 0) {
          await api.put(`/users/${user!.id}/areas`, { area_ids: Array.from(form.area_ids) });
        } else if (!form.team_id && form.station_ids.size === 0 && form.area_ids.size === 0) {
          await api.put(`/users/${user!.id}/houses`, { house_ids: Array.from(form.house_ids) });
        }
      } else {
        if (!form.email || !form.password || !form.full_name) { setErr("Alle Pflichtfelder ausfüllen"); setSaving(false); return; }
        const newUser = await api.post("/users", {
          email: form.email, password: form.password, full_name: form.full_name,
          role_id: form.role_id, team_id: form.team_id || null,
          area_ids: form.team_id || form.station_ids.size > 0 ? [] : Array.from(form.area_ids),
        });
        if (form.station_ids.size > 0) {
          await api.put(`/users/${(newUser.data as any).id}/stations`, { station_ids: Array.from(form.station_ids) });
        }
      }
      toast.success(isEdit ? "Benutzer gespeichert." : "Benutzer angelegt.");
      onClose();
    } catch (e: any) {
      const raw = e.response?.data?.error ?? e.message ?? "Unbekannter Fehler";
      const details = e.response?.data?.details;
      const msg: Record<string, string> = {
        email_taken:       "Dieser Benutzername wird bereits verwendet.",
        missing_fields:    "Bitte alle Pflichtfelder ausfüllen.",
        invalid_role:      "Die gewählte Rolle existiert nicht.",
        not_found:         "Benutzer nicht gefunden.",
        forbidden:         "Keine Berechtigung für diese Aktion.",
        validation_error:  details
          ? `Ungültige Eingabe: ${details.map((d: any) => `${d.path.join(".")}: ${d.message}`).join(", ")}`
          : "Ungültige Eingabe – bitte alle Felder prüfen.",
      };
      setErr(msg[raw] ?? `Fehler: ${raw}`);
    } finally { setSaving(false); }
  }

  const selectedTeam = teams.find((t) => t.id === form.team_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="card max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold">
          {isEdit ? "Benutzer bearbeiten" : "Neuer Benutzer"}
        </h2>

        {!isEdit && (
          <>
            <input className="input" placeholder="Benutzername *" value={form.email}
                   autoComplete="off"
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Name *" value={form.full_name}
                   onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </>
        )}
        {isEdit && (
          <>
            <input className="input" placeholder="Benutzername" value={form.email}
                   autoComplete="off"
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Name" value={form.full_name}
                   onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="input w-full pr-10"
                placeholder={isEdit ? "Neues Passwort (leer = unverändert)" : "Passwort *"}
                type={showPassword ? "text" : "password"}
                value={form.password}
                autoComplete="new-password"
                onChange={(e) => { setForm({ ...form, password: e.target.value }); setGeneratedPw(null); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
            <button
              type="button"
              onClick={generatePassword}
              className="btn-ghost !px-3 border border-slate-200 text-sm shrink-0"
              title="Zufälliges Passwort generieren"
            >
              🎲 Generieren
            </button>
          </div>
          {generatedPw && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span className="text-emerald-700 text-xs font-medium">Generiertes Passwort:</span>
              <span className="font-mono text-sm font-bold text-emerald-800 flex-1">{generatedPw}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(generatedPw)}
                className="text-xs text-emerald-600 hover:text-emerald-800"
                title="Kopieren"
              >📋</button>
            </div>
          )}
        </div>

        <div>
          <label className="label">Rolle</label>
          <select className="input" value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            <option value="">— Rolle wählen —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Team</label>
          <select className="input" value={form.team_id}
                  onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
            <option value="">— kein Team (Bereich manuell zuweisen) —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.area_name ? ` → ${t.area_name}` : " (kein Bereich)"}
              </option>
            ))}
          </select>
          {selectedTeam?.area_name && (
            <p className="text-xs text-emerald-600 mt-1">
              ✅ Sieht automatisch Bereich: {selectedTeam.area_name}
            </p>
          )}
        </div>

        {!form.team_id && (
          <div className="space-y-3">
            {/* Stations-Einschränkung */}
            <div>
              <label className="label">Stations-Einschränkung</label>
              <p className="text-xs text-slate-500 mb-2">
                Wenn Stationen gewählt sind, sieht der Nutzer <strong>nur diese Stationen</strong> (ignoriert Bereichszuweisung).
              </p>
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                {stations.length === 0 && <span className="text-xs text-slate-400 col-span-2">Noch keine Stationen angelegt.</span>}
                {stations.map((s) => (
                  <label key={s.id} className={`flex items-center gap-2 text-sm p-1 rounded-lg cursor-pointer ${form.station_ids.has(s.id) ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                    <input type="checkbox" checked={form.station_ids.has(s.id)}
                           onChange={(e) => {
                             const ns = new Set(form.station_ids);
                             e.target.checked ? ns.add(s.id) : ns.delete(s.id);
                             setForm({ ...form, station_ids: ns });
                           }} />
                    <span>
                      <span className="font-medium">{s.name}</span>
                      {s.short_code && <span className="ml-1 text-xs text-slate-400 font-mono">[{s.short_code}]</span>}
                      <span className="block text-xs text-slate-400">{s.area_name}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Bereichs-Fallback – nur wenn keine Stationen gewählt */}
            {form.station_ids.size === 0 && (
              <div>
                <label className="label">Bereiche (wenn keine Station gewählt)</label>
                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-auto">
                  {areas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.area_ids.has(a.id)}
                             onChange={(e) => {
                               const s = new Set(form.area_ids);
                               e.target.checked ? s.add(a.id) : s.delete(a.id);
                               setForm({ ...form, area_ids: s, house_ids: new Set() });
                             }} />
                      {a.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Haus-Fallback – nur wenn weder Station noch Bereich gewählt */}
            {form.station_ids.size === 0 && form.area_ids.size === 0 && (
              <div>
                <label className="label">Häuser (wenn weder Station noch Bereich gewählt)</label>
                <p className="text-xs text-slate-500 mb-2">
                  Der Nutzer sieht alle Bereiche und Stationen des zugewiesenen Hauses.
                </p>
                <div className="grid grid-cols-2 gap-1 max-h-28 overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                  {houses.length === 0 && <span className="text-xs text-slate-400 col-span-2">Noch keine Häuser angelegt.</span>}
                  {houses.map((h) => (
                    <label key={h.id} className={`flex items-center gap-2 text-sm p-1 rounded-lg cursor-pointer ${form.house_ids.has(h.id) ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                      <input type="checkbox" checked={form.house_ids.has(h.id)}
                             onChange={(e) => {
                               const ns = new Set(form.house_ids);
                               e.target.checked ? ns.add(h.id) : ns.delete(h.id);
                               setForm({ ...form, house_ids: ns });
                             }} />
                      <span>
                        <span className="font-medium">{h.name}</span>
                        {h.ki_number && <span className="ml-1 text-xs text-slate-400">[{h.ki_number}]</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {err && <p className="text-sm text-red-600">❌ {err}</p>}
        <div className="flex gap-2 pt-1">
          <button className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Speichere…" : isEdit ? "Speichern" : "Anlegen"}
          </button>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
