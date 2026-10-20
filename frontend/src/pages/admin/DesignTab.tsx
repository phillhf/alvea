import { useToast } from "../../contexts/ToastContext";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";
import { useTheme, FONT_PAIRS, COLOR_PRESETS, ThemeConfig } from "../../contexts/ThemeContext";

function DesignTab() {
  const toast = useToast();
  const { theme, loginTheme, setTheme, setLoginTheme } = useTheme();
  const [draft, setDraft] = useState<ThemeConfig>(theme);
  const [loginDraft, setLoginDraft] = useState(loginTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginSaved, setLoginSaved] = useState(false);
  const [bgInputMode, setBgInputMode] = useState<"url" | "upload">("url");
  const [loginBgMode, setLoginBgMode] = useState<"url" | "upload">("url");
  const fileRef = useRef<HTMLInputElement>(null);
  const loginFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(theme); }, [theme]);
  useEffect(() => { setLoginDraft(loginTheme); }, [loginTheme]);

  async function save() {
    setSaving(true);
    try { await setTheme(draft); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  }
  async function saveLogin() {
    setLoginSaving(true);
    try { await setLoginTheme(loginDraft); setLoginSaved(true); setTimeout(() => setLoginSaved(false), 2000); }
    finally { setLoginSaving(false); }
  }

  async function uploadBg(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/settings/upload-bg", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDraft((d) => ({ ...d, bgImage: r.data.url }));
    } catch {
      toast.error("Upload fehlgeschlagen.");
    }
  }

  const selectedPair = FONT_PAIRS.find(
    (p) => p.body === draft.fontBody && p.display === draft.fontDisplay
  ) ?? FONT_PAIRS[0];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display text-lg font-semibold">Design & Erscheinungsbild</h2>
        <p className="text-sm text-slate-500 mt-1">
          Passe Farben, Schriften und Hintergrundbild für Login und App an.
          Änderungen gelten sofort für alle Nutzer.
        </p>
      </div>

      {/* App-Name */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm">App-Name</h3>
        <div>
          <label className="label">Anzeigename</label>
          <input
            className="input"
            value={draft.appName}
            onChange={(e) => setDraft((d) => ({ ...d, appName: e.target.value }))}
            placeholder="Alvea"
          />
        </div>
      </div>

      {/* Farbe */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm">Primärfarbe</h3>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => setDraft((d) => ({ ...d, primaryColor: c.value }))}
              className={`w-9 h-9 rounded-xl border-2 transition-all ${
                draft.primaryColor === c.value
                  ? "border-slate-700 dark:border-white scale-110 shadow-md"
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="label">Eigene Farbe</label>
            <input
              type="color"
              value={draft.primaryColor}
              onChange={(e) => setDraft((d) => ({ ...d, primaryColor: e.target.value }))}
              className="w-12 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
            />
          </div>
          <div className="flex-1">
            <label className="label">Hex-Wert</label>
            <input
              className="input font-mono"
              value={draft.primaryColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDraft((d) => ({ ...d, primaryColor: v }));
              }}
              placeholder="#0d9488"
            />
          </div>
          {/* Live-Vorschau */}
          <div className="mt-5">
            <button
              className="btn text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm"
              style={{ backgroundColor: draft.primaryColor }}
            >
              Vorschau
            </button>
          </div>
        </div>
      </div>

      {/* Schriften */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm">Schriftart</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {FONT_PAIRS.map((pair) => (
            <button
              key={pair.label}
              onClick={() => setDraft((d) => ({ ...d, fontBody: pair.body, fontDisplay: pair.display }))}
              className={`text-left p-3 rounded-xl border-2 transition-all ${
                selectedPair.label === pair.label
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
              }`}
              style={{ borderColor: selectedPair.label === pair.label ? draft.primaryColor : undefined }}
            >
              <div className="text-xs text-slate-500 mb-0.5">{pair.label}</div>
              <div className="font-bold" style={{ fontFamily: `'${pair.display}', sans-serif` }}>
                Überschrift
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300" style={{ fontFamily: `'${pair.body}', sans-serif` }}>
                Fließtext & Beschriftungen
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Hintergrundbild */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm">Hintergrundbild</h3>
        <p className="text-xs text-slate-500">
          Das Bild wird mit einer Transparenz-Überlagerung angezeigt, damit es nicht vom Inhalt ablenkt.
        </p>

        <div className="flex gap-2 mb-2">
          <button
            className={`btn text-sm py-1 px-3 ${bgInputMode === "url" ? "btn-primary" : "btn-ghost"}`}
            style={bgInputMode === "url" ? { backgroundColor: draft.primaryColor } : {}}
            onClick={() => setBgInputMode("url")}
          >
            🔗 URL
          </button>
          <button
            className={`btn text-sm py-1 px-3 ${bgInputMode === "upload" ? "btn-primary" : "btn-ghost"}`}
            style={bgInputMode === "upload" ? { backgroundColor: draft.primaryColor } : {}}
            onClick={() => setBgInputMode("upload")}
          >
            📁 Hochladen
          </button>
        </div>

        {bgInputMode === "url" ? (
          <div>
            <label className="label">Bild-URL</label>
            <input
              className="input"
              value={draft.bgImage}
              onChange={(e) => setDraft((d) => ({ ...d, bgImage: e.target.value }))}
              placeholder="https://example.com/bild.jpg"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button className="btn-ghost text-sm" onClick={() => fileRef.current?.click()}>
              📁 Bild auswählen…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadBg(e.target.files[0])}
            />
            {draft.bgImage && (
              <span className="text-xs text-slate-500 truncate max-w-xs">
                ✅ Bild gesetzt
              </span>
            )}
          </div>
        )}

        {/* Transparenz-Slider */}
        <div>
          <label className="label">
            Transparenz-Überlagerung — {Math.round((1 - draft.bgOpacity) * 100)} % transparent
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">sichtbarer</span>
            <input
              type="range"
              min={0.03}
              max={0.40}
              step={0.01}
              value={draft.bgOpacity}
              onChange={(e) => setDraft((d) => ({ ...d, bgOpacity: Number(e.target.value) }))}
              className="flex-1 accent-current"
              style={{ accentColor: draft.primaryColor }}
            />
            <span className="text-xs text-slate-400">dezenter</span>
          </div>
        </div>

        {/* Vorschau */}
        {draft.bgImage && (
          <div
            className="relative h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
            style={{ backgroundImage: `url('${draft.bgImage}')`, backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <div className="absolute inset-0 bg-white dark:bg-[#0a1628]" style={{ opacity: 1 - draft.bgOpacity }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Vorschau</span>
            </div>
          </div>
        )}

        {draft.bgImage && (
          <button
            className="btn-ghost text-sm text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDraft((d) => ({ ...d, bgImage: "" }))}
          >
            🗑 Hintergrundbild entfernen
          </button>
        )}
      </div>

      {/* Speichern App-Theme */}
      <div className="flex items-center gap-3 pt-2">
        <button className="btn text-white shadow-sm" style={{ backgroundColor: draft.primaryColor }}
                onClick={save} disabled={saving}>
          {saving ? "Speichern…" : saved ? "✅ Gespeichert!" : "App-Design speichern"}
        </button>
        <button className="btn-ghost text-sm" onClick={() => setDraft(theme)}>Zurücksetzen</button>
      </div>

      {/* ── Login-Design ── */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-6 space-y-6">
        <div>
          <h2 className="font-display text-lg font-semibold">🔐 Anmeldeseite – eigenes Design</h2>
          <p className="text-sm text-slate-500 mt-1">
            Unabhängige Gestaltung des Login-Bildschirms. Wird auch ohne Anmeldung geladen.
          </p>
        </div>

        {/* Panel-Farbe */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Panel-Farbe (linke Seite)</h3>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button key={c.value} title={c.label}
                      onClick={() => setLoginDraft(d => ({ ...d, panelColor: c.value }))}
                      className={`w-9 h-9 rounded-xl border-2 transition-all ${loginDraft.panelColor === c.value ? "border-slate-700 dark:border-white scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c.value }} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="label">Eigene Farbe</label>
              <input type="color" value={loginDraft.panelColor}
                     onChange={(e) => setLoginDraft(d => ({ ...d, panelColor: e.target.value }))}
                     className="w-12 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
            </div>
            <div className="flex-1">
              <label className="label">Hex-Wert</label>
              <input className="input font-mono" value={loginDraft.panelColor}
                     onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setLoginDraft(d => ({ ...d, panelColor: v })); }}
                     placeholder="#0f766e" />
            </div>
            <div className="mt-5">
              <div className="w-16 h-9 rounded-xl shadow-sm" style={{ backgroundColor: loginDraft.panelColor }} />
            </div>
          </div>
        </div>

        {/* Texte */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Texte</h3>

          <div>
            <label className="label">Schlagzeile (linkes Panel)</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={loginDraft.panelHeadline}
              onChange={(e) => setLoginDraft(d => ({ ...d, panelHeadline: e.target.value }))}
              placeholder="Sauberkeit.\nOrganisiert."
            />
            <p className="text-xs text-slate-400 mt-1">Zeilenumbruch mit Enter möglich</p>
          </div>

          <div>
            <label className="label">Beschreibungstext (linkes Panel)</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={loginDraft.panelSubtext}
              onChange={(e) => setLoginDraft(d => ({ ...d, panelSubtext: e.target.value }))}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            {(["panelFeature1","panelFeature2","panelFeature3"] as const).map((k, i) => (
              <div key={k}>
                <label className="label">Feature {i+1}</label>
                <input
                  className="input text-sm"
                  value={loginDraft[k]}
                  onChange={(e) => setLoginDraft(d => ({ ...d, [k]: e.target.value }))}
                  placeholder={`🛏️ Feature ${i+1}`}
                />
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
            <div>
              <label className="label">Formular-Überschrift</label>
              <input
                className="input"
                value={loginDraft.formHeadline}
                onChange={(e) => setLoginDraft(d => ({ ...d, formHeadline: e.target.value }))}
                placeholder="Willkommen zurück"
              />
            </div>
            <div>
              <label className="label">Formular-Unterzeile</label>
              <input
                className="input"
                value={loginDraft.formSubtext}
                onChange={(e) => setLoginDraft(d => ({ ...d, formSubtext: e.target.value }))}
                placeholder="Bitte melde dich an…"
              />
            </div>
          </div>
        </div>

        {/* Akzentfarbe Login */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Akzentfarbe (Button & Highlights)</h3>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button key={c.value} title={c.label}
                      onClick={() => setLoginDraft(d => ({ ...d, primaryColor: c.value }))}
                      className={`w-9 h-9 rounded-xl border-2 transition-all ${loginDraft.primaryColor === c.value ? "border-slate-700 dark:border-white scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c.value }} />
            ))}
          </div>
        </div>

        {/* Login-Hintergrundbild */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Hintergrundbild (Login)</h3>
          <div className="flex gap-2 mb-2">
            <button className={`btn text-sm py-1 px-3 ${loginBgMode === "url" ? "btn-primary" : "btn-ghost"}`}
                    style={loginBgMode === "url" ? { backgroundColor: loginDraft.primaryColor } : {}}
                    onClick={() => setLoginBgMode("url")}>🔗 URL</button>
            <button className={`btn text-sm py-1 px-3 ${loginBgMode === "upload" ? "btn-primary" : "btn-ghost"}`}
                    style={loginBgMode === "upload" ? { backgroundColor: loginDraft.primaryColor } : {}}
                    onClick={() => setLoginBgMode("upload")}>📁 Hochladen</button>
          </div>
          {loginBgMode === "url" ? (
            <div>
              <label className="label">Bild-URL</label>
              <input className="input" value={loginDraft.bgImage}
                     onChange={(e) => setLoginDraft(d => ({ ...d, bgImage: e.target.value }))}
                     placeholder="https://example.com/bild.jpg" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button className="btn-ghost text-sm" onClick={() => loginFileRef.current?.click()}>📁 Bild auswählen…</button>
              <input ref={loginFileRef} type="file" accept="image/*" className="hidden"
                     onChange={async (e) => {
                       const file = e.target.files?.[0]; if (!file) return;
                       const fd = new FormData(); fd.append("file", file);
                       try {
                         const r = await api.post("/settings/upload-bg", fd, { headers: { "Content-Type": "multipart/form-data" } });
                         setLoginDraft(d => ({ ...d, bgImage: r.data.url }));
                       } catch { toast.error("Upload fehlgeschlagen."); }
                     }} />
              {loginDraft.bgImage && <span className="text-xs text-slate-500">✅ Bild gesetzt</span>}
            </div>
          )}
          <div>
            <label className="label">Bild-Intensität — {Math.round(loginDraft.bgOpacity * 100)} % sichtbar</label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">dezenter</span>
              <input type="range" min={0.05} max={0.70} step={0.01} value={loginDraft.bgOpacity}
                     onChange={(e) => setLoginDraft(d => ({ ...d, bgOpacity: Number(e.target.value) }))}
                     className="flex-1" style={{ accentColor: loginDraft.primaryColor }} />
              <span className="text-xs text-slate-400">stärker</span>
            </div>
          </div>
          {loginDraft.bgImage && (
            <>
              <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
                   style={{ backgroundImage: `url('${loginDraft.bgImage}')`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${Math.max(0, 0.7 - loginDraft.bgOpacity)})` }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold text-white drop-shadow">Vorschau</span>
                </div>
              </div>
              <button className="btn-ghost text-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setLoginDraft(d => ({ ...d, bgImage: "" }))}>
                🗑 Hintergrundbild entfernen
              </button>
            </>
          )}
        </div>

        {/* Speichern Login-Theme */}
        <div className="flex items-center gap-3 pb-4">
          <button className="btn text-white shadow-sm" style={{ backgroundColor: loginDraft.primaryColor }}
                  onClick={saveLogin} disabled={loginSaving}>
            {loginSaving ? "Speichern…" : loginSaved ? "✅ Gespeichert!" : "Login-Design speichern"}
          </button>
          <button className="btn-ghost text-sm" onClick={() => setLoginDraft(loginTheme)}>Zurücksetzen</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* ROLLEN                                                       */
/* ============================================================ */
const ALL_PERMISSIONS = [
  { key: "bettenaufbereitung",         label: "Bettenaufb.-Dezentral",  desc: "Tab Bettenaufbereitung-Dezentral sichtbar" },
  { key: "bettenaufbereitung_zentral", label: "Bettenaufb.-Zentral",    desc: "Tab Bettenaufbereitung-Zentral sichtbar" },
  { key: "zimmerreinigung",            label: "Zimmerreinigung",         desc: "Tab Zimmerreinigung sichtbar" },
  { key: "berichte",                   label: "Berichte",                desc: "Tab Berichte sichtbar" },
  { key: "stationspersonal",           label: "Meine Station",           desc: "Tab 'Meine Station' für Pflegepersonal" },
  { key: "auftraege_erstellen",        label: "Aufträge erstellen",      desc: "Neue Aufträge anlegen" },
  { key: "verwaltung",                 label: "Verwaltung",              desc: "Vollzugriff Verwaltung (nur Admin-Rollen)" },
] as const;

type PermKey = typeof ALL_PERMISSIONS[number]["key"];


export default DesignTab;
