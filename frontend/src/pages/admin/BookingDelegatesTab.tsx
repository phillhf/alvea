import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

interface Delegate {
  id: string; delegate_id: string; represented_id: string;
  delegate_name: string; represented_name: string;
}
interface User { id: string; full_name: string; email: string; }

function BookingDelegatesTab() {
  const toast = useToast();
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [delegateId, setDelegateId] = useState("");
  const [representedId, setRepresentedId] = useState("");

  async function refresh() {
    try {
      setDelegates((await api.get<Delegate[]>("/shared-delegates")).data);
    } catch { toast.error("Fehler beim Laden."); }
  }
  useEffect(() => {
    refresh();
    api.get<User[]>("/shared-bookings/bookable-users").then(r => setUsers(r.data)).catch(() => {});
  }, []);

  async function create() {
    if (!delegateId || !representedId) { toast.error("Bitte beide Personen auswählen."); return; }
    if (delegateId === representedId) { toast.error("Eine Person kann nicht für sich selbst stellvertreten."); return; }
    try {
      await api.post("/shared-delegates", { delegate_id: delegateId, represented_id: representedId });
      toast.success("Stellvertretung angelegt.");
      setDelegateId(""); setRepresentedId("");
      refresh();
    } catch (e: any) {
      if (e?.response?.status === 409) toast.error("Diese Stellvertretung existiert bereits.");
      else toast.error("Fehler beim Anlegen.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Stellvertretung entfernen?")) return;
    try { await api.delete(`/shared-delegates/${id}`); refresh(); }
    catch { toast.error("Fehler beim Entfernen."); }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Stellvertretungen</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Legt fest, wer für wen Räume/Tische buchen darf (z. B. Sekretariat für Chefarzt).
          Ohne Eintrag hier kann niemand für eine andere Person buchen, auch nicht mit der
          Berechtigung „Raumbuchung – Stellvertretung".
        </p>
      </div>

      <div className="card flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Person (darf buchen für...)</label>
          <select className="input" value={delegateId} onChange={e => setDelegateId(e.target.value)}>
            <option value="">– wählen –</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">...darf buchen für</label>
          <select className="input" value={representedId} onChange={e => setRepresentedId(e.target.value)}>
            <option value="">– wählen –</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={create}>Anlegen</button>
      </div>

      <ul className="card !p-0 divide-y divide-slate-100">
        {delegates.length === 0 && (
          <li className="p-3 text-sm text-slate-400">Noch keine Stellvertretungen angelegt.</li>
        )}
        {delegates.map(d => (
          <li key={d.id} className="p-3 flex justify-between items-center gap-3">
            <div className="text-sm">
              <span className="font-medium">{d.delegate_name}</span>
              <span className="text-slate-400"> darf buchen für </span>
              <span className="font-medium">{d.represented_name}</span>
            </div>
            <button onClick={() => remove(d.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">
              Entfernen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default BookingDelegatesTab;
