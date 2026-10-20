import { useToast } from "../contexts/ToastContext";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface Station { id: string; name: string; area_name: string; house_name: string; }
interface Bed { id: string; bed_number: string; room_number: string; status: string; bed_type_name: string | null }
interface Pathogen {
  code: string; name: string; description: string; severity: number;
  disinfectant: string | null; cleaning_agent: string | null; hygiene_notes: string | null;
}

export default function NewBedTask() {
  const toast = useToast();
  const { id: stationIdParam } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();

  const [stations, setStations]       = useState<Station[]>([]);
  const [stationId, setStationId]     = useState(stationIdParam ?? "");
  const [beds, setBeds]               = useState<Bed[]>([]);
  const [pathogens, setPathogens]     = useState<Pathogen[]>([]);
  const [bedId, setBedId]             = useState("");
  const [cleaningType, setCleaningType] = useState<"normal" | "infektioes">("normal");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [priority, _setPriority]       = useState(2);
  const [notes, setNotes]             = useState("");
  const [saving, setSaving]           = useState(false);

  // Stationen laden (nur wenn kein fixer stationIdParam)
  useEffect(() => {
    if (!stationIdParam) {
      api.get<any[]>("/stations").then((r) => setStations(r.data));
    }
    api.get<Pathogen[]>("/pathogens").then((r) => setPathogens(r.data));
  }, [stationIdParam]);

  // Betten laden sobald Station bekannt
  useEffect(() => {
    if (!stationId) { setBeds([]); setBedId(""); return; }
    api.get<Bed[]>(`/beds?station_id=${stationId}`).then((r) =>
      setBeds(r.data.filter((b) => b.status === "frei" || b.status === "belegt" || b.status === "bereit"))
    );
    setBedId("");
  }, [stationId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bedId || !stationId) return;
    if (cleaningType === "infektioes" && selected.size === 0) {
      toast.error("Bitte mindestens einen Keim/Erreger auswählen.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/tasks", {
        category: "bed_cleaning",
        bed_id: bedId,
        cleaning_type: cleaningType,
        pathogens: Array.from(selected),
        priority, notes,
      });
      nav(stationIdParam ? `/stations/${stationId}` : "/");
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Fehler");
    } finally { setSaving(false); }
  }

  function togglePathogen(code: string) {
    const s = new Set(selected);
    s.has(code) ? s.delete(code) : s.add(code);
    setSelected(s);
  }

  // Stationen nach Haus/Bereich gruppiert für Dropdown
  const grouped = stations.reduce<Record<string, Station[]>>((acc, s) => {
    const key = `${s.house_name} – ${s.area_name}`;
    (acc[key] = acc[key] ?? []).push(s);
    return acc;
  }, {});

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">{t("task.newBedTask")}</h1>

      {/* Station wählen – nur wenn kein fixer URL-Param */}
      {!stationIdParam && (
        <div>
          <label className="label">Station auswählen</label>
          <select className="input" value={stationId}
                  onChange={(e) => setStationId(e.target.value)} required>
            <option value="">— Station wählen —</option>
            {Object.entries(grouped).map(([group, sts]) => (
              <optgroup key={group} label={group}>
                {sts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* Bett wählen */}
      <div>
        <label className="label">Bett auswählen</label>
        <select className="input" value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                required disabled={!stationId}>
          <option value="">
            {stationId ? "— auswählen —" : "Erst Station wählen"}
          </option>
          {beds.map((b) => (
            <option key={b.id} value={b.id}>
              Zimmer {b.room_number} · Stellplatz {b.bed_number}
              {b.bed_type_name ? ` · ${b.bed_type_name}` : ""} ({b.status})
            </option>
          ))}
        </select>
        {stationId && beds.length === 0 && (
          <p className="text-xs text-slate-500 mt-1">Keine freien/belegten Betten auf dieser Station.</p>
        )}
      </div>

      {/* Reinigungsart */}
      <div>
        <label className="label">Art der Reinigung</label>
        <div className="grid grid-cols-2 gap-2">
          <label className={`card cursor-pointer text-center ${cleaningType === "normal" ? "ring-2 ring-brand-500" : ""}`}>
            <input type="radio" name="ct" value="normal" className="sr-only"
                   checked={cleaningType === "normal"} onChange={() => setCleaningType("normal")} />
            <div className="text-2xl">🛏️</div>
            <div className="font-medium text-sm mt-1">{t("task.cleaningType.normal")}</div>
          </label>
          <label className={`card cursor-pointer text-center ${cleaningType === "infektioes" ? "ring-2 ring-status-danger" : ""}`}>
            <input type="radio" name="ct" value="infektioes" className="sr-only"
                   checked={cleaningType === "infektioes"} onChange={() => setCleaningType("infektioes")} />
            <div className="text-2xl">⚠️</div>
            <div className="font-medium text-sm mt-1 text-status-danger">{t("task.cleaningType.infektioes")}</div>
          </label>
        </div>
      </div>

      {/* Keime */}
      {cleaningType === "infektioes" && (
        <div>
          <label className="label">{"Krankheitserreger auswählen"} <span className="text-status-danger">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pathogens.map((p) => {
              const active = selected.has(p.code);
              return (
                <button type="button" key={p.code}
                        onClick={() => togglePathogen(p.code)}
                        className={`card !p-2 text-left text-sm hover:shadow-md ${active ? "ring-2 ring-status-danger bg-red-50 dark:bg-red-900/20" : ""}`}>
                  <div className="font-mono font-bold">{p.name}</div>
                  <div className="text-[11px] text-slate-500 leading-tight">{p.description}</div>
                </button>
              );
            })}
          </div>
          {selected.size > 0 && (
            <div className="text-xs text-slate-500 mt-2">{selected.size} ausgewählt</div>
          )}
          {selected.size > 0 && (() => {
            const chosen = pathogens.filter((p) => selected.has(p.code));
            const hasAny = chosen.some((p) => p.disinfectant || p.cleaning_agent || p.hygiene_notes);
            if (!hasAny) return null;
            return (
              <div className="mt-3 card bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 space-y-3">
                <div className="font-semibold text-sm">🧴 Hygiene-Empfehlungen</div>
                {chosen.map((p) => {
                  if (!p.disinfectant && !p.cleaning_agent && !p.hygiene_notes) return null;
                  return (
                    <div key={p.code} className="text-sm">
                      <div className="font-mono font-bold text-xs mb-1">{p.name}</div>
                      {p.disinfectant && <div className="mb-1"><b>Desinfektion:</b> {p.disinfectant}</div>}
                      {p.cleaning_agent && <div className="mb-1"><b>Reinigung:</b> {p.cleaning_agent}</div>}
                      {p.hygiene_notes && <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.hygiene_notes}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Notizen */}
      <div>
        <label className="label">{t("task.notes")}</label>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving || !bedId}>
          {saving ? t("common.loading") : t("common.save")}
        </button>
        <button type="button" className="btn-ghost" onClick={() => nav(-1)}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
