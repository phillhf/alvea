import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.get("/users/me").then((r: any) => setProfile(r.data));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) { setMsg({ type: "err", text: "Neues Passwort und Bestätigung stimmen nicht überein." }); return; }
    if (next.length < 8)  { setMsg({ type: "err", text: "Neues Passwort muss mindestens 8 Zeichen haben." }); return; }
    setSaving(true);
    try {
      await api.patch("/users/me/password", { current_password: current, new_password: next });
      setMsg({ type: "ok", text: "Passwort erfolgreich geändert." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e: any) {
      const code = e.response?.data?.error;
      const msgs: Record<string, string> = {
        current_password_wrong:    "Das aktuelle Passwort ist falsch.",
        password_change_disabled:  "Passwortänderung wurde von einem Administrator deaktiviert.",
        current_password_required: "Bitte aktuelles Passwort eingeben.",
      };
      setMsg({ type: "err", text: msgs[code] ?? "Fehler beim Ändern des Passworts." });
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 px-4 py-6">
      <h1 className="font-display text-2xl font-bold">Mein Profil</h1>

      {/* Profil-Info */}
      {profile && (
        <div className="card space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                 style={{ backgroundColor: "var(--brand-600)" }}>
              {profile.full_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="font-semibold">{profile.full_name}</div>
              <div className="text-sm text-slate-500">{profile.email}</div>
              <div className="text-xs text-slate-400 mt-0.5">{profile.role_name ?? "–"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Passwort ändern */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg">Passwort ändern</h2>

        {profile && !profile.can_change_password ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
            ⚠️ Die Passwortänderung wurde für dieses Konto von einem Administrator deaktiviert.
            Bitte wende dich an den Administrator.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">Aktuelles Passwort</label>
              <input className="input" type="password" value={current}
                onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
            <div>
              <label className="label">Neues Passwort</label>
              <input className="input" type="password" value={next}
                onChange={e => setNext(e.target.value)} required minLength={8}
                autoComplete="new-password" placeholder="Mindestens 8 Zeichen" />
            </div>
            <div>
              <label className="label">Neues Passwort bestätigen</label>
              <input className="input" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>

            {msg && (
              <div className={`text-sm rounded-lg px-3 py-2 ${
                msg.type === "ok"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {msg.type === "ok" ? "✅" : "❌"} {msg.text}
              </div>
            )}

            <button className="btn-primary w-full" type="submit" disabled={saving || !current || !next || !confirm}>
              {saving ? "Wird gespeichert…" : "Passwort ändern"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
