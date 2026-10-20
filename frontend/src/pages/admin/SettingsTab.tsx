import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function refresh() {
    const r = await api.get("/settings");
    const map: Record<string, string> = {};
    for (const s of r.data as any[]) map[s.key] = s.value;
    setSettings(map);
    setDirty({});
  }
  useEffect(() => { refresh(); }, []);

  async function saveSetting(key: string) {
    const val = dirty[key] ?? settings[key];
    setSaving(key);
    try {
      await api.put(`/settings/${key}`, { value: val });
      setSettings((s) => ({ ...s, [key]: val }));
      setDirty((d) => { const n = { ...d }; delete n[key]; return n; });
    } finally {
      setSaving(null);
    }
  }

  function Field({
    k,
    label,
    unit,
    description,
  }: {
    k: string;
    label: string;
    unit?: string;
    description?: string;
  }) {
    const val = dirty[k] ?? settings[k] ?? "";
    const changed = dirty[k] !== undefined && dirty[k] !== settings[k];
    return (
      <div className="card flex flex-col gap-1">
        <label className="label font-semibold">{label}</label>
        {description && (
          <p className="text-xs text-slate-500">{description}</p>
        )}
        <div className="flex gap-2 items-center mt-1">
          <input
            className="input"
            style={{ width: 110 }}
            type="number"
            min={0}
            step={0.1}
            value={val}
            onChange={(e) => setDirty((d) => ({ ...d, [k]: e.target.value }))}
          />
          {unit && <span className="text-sm text-slate-500">{unit}</span>}
          <button
            className="btn-primary !py-1 !px-3 text-sm ml-2"
            disabled={!changed || saving === k}
            onClick={() => saveSetting(k)}
          >
            {saving === k ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    );
  }

  const base    = settings["prio_base"]    ?? "1";
  const minutes = settings["prio_minutes"] ?? "60";
  const bonus   = settings["prio_bonus"]   ?? "1.5";

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="font-display text-lg font-semibold">Prioritätsscore</h2>
        <p className="text-sm text-slate-500 mt-1">
          Jeder offene Auftrag erhält Basispunkte. Ist er älter als die
          eingestellte Zeit, kommen Bonus-Punkte dazu. Die Summe pro Station
          bestimmt die Sortierung — höchste Punktzahl zuerst.
        </p>
        <div className="card bg-brand-50 dark:bg-brand-900/20 text-sm font-mono mt-2">
          Score je Auftrag = {base} +{" "}
          {bonus} (wenn älter als {minutes} Min.)
        </div>
      </div>

      <Field
        k="prio_base"
        label="Basispunkte je Auftrag"
        unit="Punkte"
        description="Jeder offene Auftrag zählt mindestens diese Punkte."
      />
      <Field
        k="prio_minutes"
        label="Schwellenwert für Bonus"
        unit="Minuten"
        description="Nach dieser Zeit bekommt ein Auftrag zusätzliche Punkte."
      />
      <Field
        k="prio_bonus"
        label="Bonus-Punkte"
        unit="Punkte"
        description="Zusätzliche Punkte wenn der Auftrag den Schwellenwert überschritten hat."
      />

      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <h2 className="font-display text-lg font-semibold">Badge-Farben</h2>
        <p className="text-sm text-slate-500 mt-1">
          Ab welchem Prioritätsscore der Badge seine Farbe wechselt.
        </p>
        <div className="card bg-slate-50 dark:bg-slate-800/40 text-sm font-mono mt-2 flex gap-4 flex-wrap">
          <span className="text-slate-500">0 – {(dirty["prio_color_yellow"] ?? settings["prio_color_yellow"] ?? "2")} → <span className="text-slate-500 font-semibold">grau</span></span>
          <span>{dirty["prio_color_yellow"] ?? settings["prio_color_yellow"] ?? "2"} – {dirty["prio_color_red"] ?? settings["prio_color_red"] ?? "5"} → <span className="text-green-600 font-semibold">grün</span></span>
          <span>{dirty["prio_color_red"] ?? settings["prio_color_red"] ?? "5"} – … → <span className="text-yellow-600 font-semibold">gelb</span> / <span className="text-red-600 font-semibold">rot</span></span>
        </div>
      </div>

      <Field
        k="prio_color_yellow"
        label="Ab diesem Score: Gelb"
        unit="Punkte"
        description="Unterhalb dieser Schwelle erscheint der Badge grün."
      />
      <Field
        k="prio_color_red"
        label="Ab diesem Score: Rot"
        unit="Punkte"
        description="Ab dieser Schwelle erscheint der Badge rot."
      />

      <hr className="border-slate-200 dark:border-slate-700" />

      <div>
        <h2 className="font-display text-lg font-semibold">Badge-Farben</h2>
        <p className="text-sm text-slate-500 mt-1">
          Ab welchem Punktestand wechselt die Farbe des Prioritätsbadges in der Stationsübersicht?
        </p>
        <div className="card bg-slate-50 dark:bg-slate-800/40 text-sm font-mono mt-2 flex gap-4 flex-wrap">
          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
            0 – {(dirty["prio_color_yellow"] ?? settings["prio_color_yellow"] ?? "2")} Pkt. → grün
          </span>
          <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold">
            {(dirty["prio_color_yellow"] ?? settings["prio_color_yellow"] ?? "2")} – {(dirty["prio_color_red"] ?? settings["prio_color_red"] ?? "5")} Pkt. → gelb
          </span>
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
            ab {(dirty["prio_color_red"] ?? settings["prio_color_red"] ?? "5")} Pkt. → rot
          </span>
        </div>
      </div>

      <Field
        k="prio_color_yellow"
        label="Ab diesem Score → Gelb"
        unit="Punkte"
        description="Unterhalb dieser Grenze erscheint der Badge grün."
      />
      <Field
        k="prio_color_red"
        label="Ab diesem Score → Rot"
        unit="Punkte"
        description="Ab dieser Grenze erscheint der Badge rot (dazwischen gelb)."
      />

      <div className="border-t border-slate-200 pt-4">
        <h2 className="font-display text-lg font-semibold">Scheuer-Wisch Bestätigungstext</h2>
        <p className="text-sm text-slate-500 mt-1 mb-3">
          Pflichtbestätigung beim Anfordern von Scheuer-Wisch durch das Pflegepersonal.
        </p>
        <textarea
          className="input w-full"
          rows={3}
          value={dirty["sw_freitext"] ?? settings["sw_freitext"] ?? "Das Zimmer ist frei von allen persönlichen Gegenständen des Patienten."}
          onChange={e => setDirty((d: Record<string,string>) => ({ ...d, sw_freitext: e.target.value }))}
        />
        {dirty["sw_freitext"] !== undefined && (
          <button className="btn-primary mt-2" onClick={() => saveSetting("sw_freitext")}>Speichern</button>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* DESIGN / THEME                                               */
/* ============================================================ */

export default SettingsTab;
