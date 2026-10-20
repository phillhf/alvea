import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

interface ReleaseInfo {
  version: string;
  name: string;
  notes: string;
  url: string;
  published_at: string;
}

interface UpdateInfo {
  current: string;
  repo: string;
  can_self_update: boolean;
  update_available: boolean;
  latest: ReleaseInfo | null;
  error?: string;
  status: { state: string; message: string; version?: string; updated_at: string } | null;
}

function formatDate(iso?: string) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export default function UpdateTab() {
  const toast = useToast();
  const [info, setInfo]           = useState<UpdateInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [checking, setChecking]   = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating]   = useState(false);
  const pollRef = useRef<number | null>(null);

  async function load(refresh = false) {
    try {
      const r = await api.get<UpdateInfo>("/system/update", { params: refresh ? { refresh: 1 } : {} });
      setInfo(r.data);
    } catch {
      toast.error("Update-Informationen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  async function check() {
    setChecking(true);
    await load(true);
    setChecking(false);
  }

  // Während des Updates ist der Server kurz weg. /api/health ohne Login abfragen,
  // bis die neue Version antwortet, dann Seite neu laden.
  function waitForNewVersion(oldVersion: string) {
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await axios.get("/api/health", { timeout: 3000 });
        if (r.data?.version && r.data.version !== oldVersion) {
          window.clearInterval(pollRef.current!);
          toast.success(`Update auf Version ${r.data.version} abgeschlossen.`);
          window.setTimeout(() => location.reload(), 1500);
        }
      } catch { /* Server startet gerade neu */ }
      if (Date.now() - started > 15 * 60 * 1000) {
        window.clearInterval(pollRef.current!);
        setUpdating(false);
        toast.error("Update dauert ungewöhnlich lange – bitte Update-Protokoll auf dem Server prüfen.");
        load();
      }
    }, 5000);
  }

  async function startUpdate() {
    if (!info) return;
    setConfirming(false);
    setUpdating(true);
    try {
      await api.post("/system/update");
      waitForNewVersion(info.current);
    } catch (e: any) {
      setUpdating(false);
      toast.error(e?.response?.data?.error || "Update konnte nicht gestartet werden.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        Wird geladen…
      </div>
    );
  }
  if (!info) return null;

  const lastFailed = info.status?.state === "failed";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Programm-Update</h2>
        <p className="text-sm text-slate-500">
          Neue Versionen werden über GitHub veröffentlicht (<span className="font-mono">{info.repo}</span>).
          Vor jedem Update wird die Datenbank automatisch gesichert.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Installiert</p>
          <p className="text-xl font-semibold text-slate-800">{info.current}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Neueste Version</p>
          <p className="text-xl font-semibold text-slate-800">{info.latest?.version ?? "–"}</p>
          {info.latest && <p className="text-xs text-slate-500">{formatDate(info.latest.published_at)}</p>}
        </div>
      </div>

      {info.error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Update-Prüfung nicht möglich: {info.error}
          {!info.error.startsWith("Noch kein Release") && (
            <p className="text-xs mt-1 text-amber-700">
              Der Server braucht Internetzugriff auf api.github.com und github.com.
            </p>
          )}
        </div>
      )}

      {lastFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Letztes Update fehlgeschlagen ({formatDate(info.status?.updated_at)}): {info.status?.message}
        </div>
      )}

      {!info.error && !info.update_available && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✓ Alvea ist auf dem neuesten Stand.
        </div>
      )}

      {info.update_available && info.latest && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800">{info.latest.name}</p>
              <a href={info.latest.url} target="_blank" rel="noreferrer" className="text-sm text-[color:var(--brand-600)] hover:underline">
                Release auf GitHub ansehen
              </a>
            </div>
            {info.can_self_update && !updating && !confirming && (
              <button className="btn-primary" onClick={() => setConfirming(true)}>Jetzt aktualisieren</button>
            )}
          </div>
          {info.latest.notes && (
            <pre className="whitespace-pre-wrap text-sm text-slate-600 bg-slate-50 rounded-lg p-3 max-h-64 overflow-auto font-sans">
              {info.latest.notes}
            </pre>
          )}
          {!info.can_self_update && (
            <p className="text-sm text-slate-500">
              Diese Installation wurde nicht über das Setup eingerichtet. Bitte das Setup aus dem Release herunterladen und ausführen.
            </p>
          )}
        </div>
      )}

      {confirming && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-900">
            Während des Updates ist Alvea für alle Nutzer ca. 1–3 Minuten nicht erreichbar. Jetzt starten?
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={startUpdate}>Ja, Update starten</button>
            <button className="btn-ghost" onClick={() => setConfirming(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {updating && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3 text-sm text-slate-700">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          Update läuft… Die Seite lädt automatisch neu, sobald die neue Version bereit ist.
        </div>
      )}

      <button className="btn-outline" onClick={check} disabled={checking || updating}>
        {checking ? "Prüfe…" : "Erneut prüfen"}
      </button>
    </div>
  );
}
