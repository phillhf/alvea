import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

interface BackupSettings {
  backup_enabled: string;
  backup_path: string;
  backup_time: string;
  backup_username: string;
  backup_password: string;
  backup_last_run: string;
  backup_last_status: string;
}

export default function BackupTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<BackupSettings>({
    backup_enabled: "false",
    backup_path: "",
    backup_time: "02:00",
    backup_username: "",
    backup_password: "",
    backup_last_run: "",
    backup_last_status: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.get("/backup/settings")
      .then(r => {
        setSettings(r.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Backup-Einstellungen konnten nicht geladen werden.");
        setLoading(false);
      });
  }, []);

  function handleChange(key: keyof BackupSettings, value: string) {
    setSettings(s => ({ ...s, [key]: value }));
    if (key === "backup_password") setPwChanged(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<BackupSettings> = {
        backup_enabled: settings.backup_enabled,
        backup_path: settings.backup_path,
        backup_time: settings.backup_time,
        backup_username: settings.backup_username,
      };
      // Only send password if user typed a new one
      if (pwChanged) {
        payload.backup_password = settings.backup_password;
      }
      await api.patch("/backup/settings", payload);
      setPwChanged(false);
      toast.success("Einstellungen gespeichert.");
    } catch {
      toast.error("Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const r = await api.post("/backup/run");
      if (r.data.success) {
        toast.success(r.data.message);
        // Refresh status
        const s = await api.get("/backup/settings");
        setSettings(s.data);
      } else {
        toast.error(`Backup fehlgeschlagen: ${r.data.message}`);
        const s = await api.get("/backup/settings");
        setSettings(s.data);
      }
    } catch {
      toast.error("Backup konnte nicht ausgeführt werden.");
    } finally {
      setRunning(false);
    }
  }

  function formatDate(iso: string) {
    if (!iso) return "–";
    try {
      return new Date(iso).toLocaleString("de-DE");
    } catch {
      return iso;
    }
  }

  const lastStatus = settings.backup_last_status;
  const statusOk = lastStatus.startsWith("OK:");
  const statusErr = lastStatus.startsWith("FEHLER:");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        Wird geladen…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Automatisches Backup</h2>
        <p className="text-sm text-slate-500">
          Täglich wird die Datenbank auf einen Netzwerkpfad oder lokalen Pfad gesichert.
        </p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Letztes Backup</p>
        <p className="text-sm text-slate-700">{formatDate(settings.backup_last_run)}</p>
        {lastStatus && (
          <p className={`text-sm font-medium ${statusOk ? "text-green-600" : statusErr ? "text-red-600" : "text-slate-600"}`}>
            {lastStatus}
          </p>
        )}
      </div>

      {/* Toggle */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">Automatisches Backup aktiv</p>
          <p className="text-xs text-slate-500 mt-0.5">Täglich zur konfigurierten Uhrzeit</p>
        </div>
        <button
          onClick={() => handleChange("backup_enabled", settings.backup_enabled === "true" ? "false" : "true")}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            settings.backup_enabled === "true" ? "bg-brand-600" : "bg-slate-300"
          }`}
          style={settings.backup_enabled === "true" ? { backgroundColor: "var(--brand-600)" } : {}}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            settings.backup_enabled === "true" ? "translate-x-5" : ""
          }`} />
        </button>
      </div>

      {/* Formular */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Uhrzeit (täglich)
          </label>
          <input
            type="time"
            value={settings.backup_time}
            onChange={e => handleChange("backup_time", e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Zielpfad
          </label>
          <input
            type="text"
            value={settings.backup_path}
            onChange={e => handleChange("backup_path", e.target.value)}
            placeholder="\\\\server\\freigabe\\backup oder C:\\Backup"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">
            UNC-Pfad (\\server\freigabe) oder lokaler Pfad
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Benutzername (Netzwerk)
          </label>
          <input
            type="text"
            value={settings.backup_username}
            onChange={e => handleChange("backup_username", e.target.value)}
            placeholder="DOMAIN\\Benutzer"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Leer lassen für lokale Pfade ohne Authentifizierung
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Passwort (Netzwerk)
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={settings.backup_password}
              onChange={e => handleChange("backup_password", e.target.value)}
              onFocus={() => {
                // Clear placeholder "••••••••" on focus so user can type new pw
                if (settings.backup_password === "••••••••") {
                  setSettings(s => ({ ...s, backup_password: "" }));
                }
              }}
              placeholder="Passwort"
              className="border border-slate-200 rounded-lg px-3 py-2 pr-10 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Wird verschlüsselt gespeichert. Leer lassen = Passwort unverändert.
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--brand-600)" }}
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="px-5 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          {running ? "Backup läuft…" : "Jetzt sichern"}
        </button>
      </div>
    </div>
  );
}
