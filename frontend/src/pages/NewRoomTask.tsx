import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { alertDialog } from "../components/Dialog";

interface Room { id: string; room_number: string }

export default function NewRoomTask() {
  const { id: stationId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();

  const [rooms, setRooms]             = useState<Room[]>([]);
  const [roomId, setRoomId]           = useState("");
  const [cleaningType, setCleaningType] = useState<"standard" | "schlussdesinfektion">("standard");
  const [notes, setNotes]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [freitext, setFreitext]       = useState("Das Zimmer ist frei von allen persönlichen Gegenständen des Patienten.");
  const [freiChecked, setFreiChecked] = useState(false);
  const [wunschDatum, setWunschDatum] = useState("");
  const [wunschZeit, setWunschZeit]   = useState("");

  useEffect(() => {
    api.get<Room[]>(`/rooms?station_id=${stationId}`).then(r => setRooms(r.data));
    api.get<{ key: string; value: string }[]>("/settings").then(r => {
      const s = r.data.find(x => x.key === "sw_freitext");
      if (s?.value) setFreitext(s.value);
    }).catch(() => {});
  }, [stationId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) return;
    if (!freiChecked) {
      alertDialog("Bitte bestätigen Sie dass das Zimmer frei von persönlichen Gegenständen ist.");
      return;
    }
    setSaving(true);
    try {
      const wunschtermin = wunschDatum
        ? `${wunschDatum}${wunschZeit ? "T" + wunschZeit : "T00:00"}`
        : undefined;
      await api.post("/tasks", {
        category: "room_cleaning",
        room_id: roomId,
        cleaning_type: cleaningType,
        pathogens: [],
        priority: 2,
        notes,
        wunschtermin,
      });
      nav(`/rooms/stations/${stationId}`);
    } catch (e: any) {
      alertDialog(e.response?.data?.error || "Fehler");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link to={`/rooms/stations/${stationId}`} className="text-sm text-slate-500 hover:underline">← Zurück</Link>
        <h1 className="font-display text-2xl font-bold mt-1">{t("task.newRoomTask")}</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Zimmer */}
        <div className="card space-y-2">
          <label className="label">Zimmer *</label>
          <select className="input" value={roomId} onChange={e => setRoomId(e.target.value)} required>
            <option value="">— auswählen —</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>Zimmer {r.room_number}</option>
            ))}
          </select>
        </div>

        {/* Reinigungsart */}
        <div className="card space-y-3">
          <label className="label">Reinigungsart *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["standard", "schlussdesinfektion"] as const).map(type => (
              <button key={type} type="button" onClick={() => setCleaningType(type)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  cleaningType === type
                    ? "border-[color:var(--brand-600)] bg-[color:var(--brand-50)]"
                    : "border-slate-200 hover:border-slate-300"
                }`}>
                <div className="font-medium text-sm">
                  {type === "standard" ? "🧹 Standardreinigung" : "🔴 Schlussdesinfektion"}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {type === "standard" ? "Reguläre Zimmerreinigung" : "Nach Entlassung / Isolationsende"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pflicht-Bestätigung */}
        <div className="card">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 accent-blue-600"
              checked={freiChecked} onChange={e => setFreiChecked(e.target.checked)} />
            <span className="text-sm font-medium text-slate-800">{freitext}</span>
          </label>
          {!freiChecked && (
            <p className="text-xs text-amber-600 mt-2 ml-7">* Pflichtangabe</p>
          )}
        </div>

        {/* Wunschtermin */}
        <div className="card space-y-3">
          <label className="label">Wunschtermin <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Datum</label>
              <input type="date" className="input w-full" value={wunschDatum}
                onChange={e => setWunschDatum(e.target.value)}
                min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Uhrzeit</label>
              <input type="time" className="input w-full" value={wunschZeit}
                onChange={e => setWunschZeit(e.target.value)}
                disabled={!wunschDatum} />
            </div>
          </div>
          {wunschDatum && (
            <p className="text-xs text-slate-400">
              Der Wunschtermin muss von der Reinigung bestätigt werden.
            </p>
          )}
        </div>

        {/* Notizen */}
        <div className="card space-y-2">
          <label className="label">{t("task.notes")} <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea className="input w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving || !roomId || !freiChecked}>
            {saving ? "Speichern…" : t("common.save")}
          </button>
          <Link to={`/rooms/stations/${stationId}`} className="btn-ghost flex-1 text-center">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
