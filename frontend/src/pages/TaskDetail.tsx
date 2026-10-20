import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { CameraCapture } from "../components/CameraCapture";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BarcodeInput } from "../components/BarcodeInput";

interface Pathogen { code: string; name: string; disinfectant: string | null; cleaning_agent: string | null; hygiene_notes: string | null; }
interface TaskDetail {
  id: string; category: string; cleaning_type: string; status: string;
  room_number: string; bed_number?: string; station_name: string; area_name: string;
  assigned_to: string | null; assigned_to_name: string | null;
  notes: string | null; pathogens: string[]; photos: string[];
  created_at: string; scanned_barcode?: string | null;
  wunschtermin?: string | null;
  bestaetigt_termin?: string | null;
  // Zentral-Felder
  bed_type_name?: string | null;
  is_iso?: number;
  aufbereitungsart_name?: string | null;
  aufbereitungsart_instructions?: string | null;
}

const STATUS_ORDER = ["offen", "unterwegs", "angekommen", "laufend", "abgeschlossen"];
const STATUS_LABELS: Record<string, string> = {
  offen: "Offen", unterwegs: "Auf dem Weg", angekommen: "Angekommen",
  laufend: "In Bearbeitung", abgeschlossen: "Abgeschlossen",
};
const STATUS_COLOR: Record<string, string> = {
  offen: "bg-slate-100 text-slate-700",
  unterwegs: "bg-blue-100 text-blue-700",
  angekommen: "bg-yellow-100 text-yellow-700",
  laufend: "bg-orange-100 text-orange-700",
  abgeschlossen: "bg-green-100 text-green-700",
};

export default function TaskDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const nav = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [pathogens, setPathogens] = useState<Record<string, Pathogen>>({});
  const [instruction, setInstruction] = useState<{ title: string; content: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeOk, setBarcodeOk] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const r = await api.get<TaskDetail>(`/tasks/${id}`);
    setTask(r.data);
  }
  useEffect(() => { refresh(); }, [id]);
  useEffect(() => {
    api.get("/pathogens").then((r) => {
      const m: Record<string, Pathogen> = {};
      (r.data as Pathogen[]).forEach((p) => { m[p.code] = p; });
      setPathogens(m);
    });
  }, []);
  useEffect(() => {
    api.get("/barcodes").then((r) => setBarcodes((r.data as any[]).map((b) => b.code)));
  }, []);
  useEffect(() => {
    if (!task) return;
    if (task.aufbereitungsart_instructions) {
      // Aufbereitungsart-Anleitung: gilt für Zentral UND Scheuer-Wisch
      setInstruction({ title: task.aufbereitungsart_name ?? "Aufbereitungsanleitung", content: task.aufbereitungsart_instructions });
    } else if (task.category === "bed_cleaning_zentral") {
      setInstruction(null);
    } else {
      api.get(`/instructions/${task.category}/${task.cleaning_type}`)
        .then((r) => setInstruction(r.data))
        .catch(() => setInstruction(null));
    }
  }, [task?.category, task?.cleaning_type, task?.aufbereitungsart_instructions]);

  async function doAction(action: () => Promise<any>) {
    setActionError(null); setBusy(true);
    try {
      await action();
      const updated = (await api.get(`/tasks/${id}`)).data;
      if (updated.status === "abgeschlossen") {
        const route = updated.category === "bed_cleaning_zentral"
          ? "/zentral"
          : updated.category === "bed_cleaning"
            ? `/stations/${updated.station_id}`
            : `/rooms/stations/${updated.station_id}`;
        nav(route, { replace: true });
      } else {
        await refresh();
      }
    }
    catch (e: any) { setActionError(e.response?.data?.error ?? "Fehler"); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File) {
    const fd = new FormData(); fd.append("photo", file);
    await api.post(`/tasks/${id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    refresh();
  }
  async function deleteTask() {
    if (!confirm("Auftrag wirklich unwiderruflich löschen?")) return;
    await api.delete(`/tasks/${id}`);
    nav("/");
  }

  if (!task) return <div className="text-slate-500">Lade…</div>;

  const isZentral = task.category === "bed_cleaning_zentral";
  const mine = task.assigned_to === user?.id;
  const isActive = mine || can("auftraege_erstellen");

  // Fortschrittsanzeige – vereinfacht für Zentral (kein Unterwegs/Angekommen)
  const statusOrderForTask = isZentral
    ? ["offen", "laufend", "abgeschlossen"]
    : STATUS_ORDER;

  const progress = () => {
    const idx = statusOrderForTask.indexOf(task.status);
    return (
      <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
        {statusOrderForTask.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              i < idx ? "bg-green-100 text-green-700" :
              i === idx ? "bg-brand-100 text-brand-700 ring-1 ring-brand-400" :
              "bg-slate-100 text-slate-400"}`}>
              {STATUS_LABELS[s]}
            </span>
            {i < statusOrderForTask.length - 1 && <span className="text-slate-300">→</span>}
          </div>
        ))}
      </div>
    );
  };

  // Workflow-Buttons
  const actionBar = () => {
    if (task.status === "abgeschlossen") return null;

    return (
      <div className="flex flex-col gap-2 w-full">
        {/* Auf dem Weg – wer auch immer (nicht für Zentral: Claim geht direkt zu laufend) */}
        {task.status === "offen" && task.category !== "bed_cleaning_zentral" && (
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => doAction(() => api.post(`/tasks/${id}/claim`))}>
            🚶 Auf dem Weg zur Station
          </button>
        )}
        {task.status === "offen" && task.category === "bed_cleaning_zentral" && (
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => doAction(() => api.post(`/tasks/${id}/claim`))}>
            🛏️ Aufbereitung starten
          </button>
        )}
        {/* Angekommen (nur dezentral) */}
        {task.status === "unterwegs" && mine && (
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => doAction(() => api.patch(`/tasks/${id}`, { status: "angekommen" }))}>
            📍 Auf der Station angekommen
          </button>
        )}
        {/* Barcode scannen – erst wenn Auftrag aktiv (laufend) */}
        {task.status === "laufend" && mine && task.category === "bed_cleaning" && (
          <div className="card !p-3 border border-slate-200 bg-slate-50 dark:bg-slate-800/60 space-y-2">
            <div className="text-sm font-medium">📦 Physisches Bett scannen (optional)</div>
            {task.scanned_barcode ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm bg-green-100 text-green-700 px-2 py-1 rounded">✅ {task.scanned_barcode}</span>
                <button className="btn-ghost !py-0.5 !px-2 text-xs"
                  onClick={() => doAction(() => api.patch(`/tasks/${id}`, { scanned_barcode: null }))}>
                  Zurücksetzen
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <BarcodeInput
                  value={barcodeInput}
                  onChange={setBarcodeInput}
                  options={barcodes}
                  placeholder="Barcode eingeben…"
                />
                <div className="flex gap-2">
                  <button className="btn-ghost !py-1 text-xs"
                    disabled={!barcodeInput.trim()}
                    onClick={() => {
                      doAction(() => api.patch(`/tasks/${id}`, { scanned_barcode: barcodeInput.trim() }));
                      setBarcodeInput("");
                    }}>
                    Speichern
                  </button>
                  <button
                    className="btn-ghost !py-1.5 text-sm"
                    onClick={() => setShowScanner(true)}>
                    📷 Kamera
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-400">Der Barcode wird für die Reisehistorie des physischen Betts gespeichert.</p>
          </div>
        )}

        {/* Auftrag annehmen im Zimmer */}
        {task.status === "angekommen" && mine && (
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => doAction(() => api.patch(`/tasks/${id}`, { status: "laufend" }))}>
            ✋ Auftrag im Zimmer annehmen
          </button>
        )}
        {/* Erledigt */}
        {task.status === "laufend" && mine && (
          <button className="btn-success w-full" disabled={busy}
            onClick={async () => {
              if (task.category === "bed_cleaning" && !task.scanned_barcode) {
                if (!confirm("⚠️ Kein Barcode erfasst!\n\nDie Reisehistorie dieses Betts wird nicht aktualisiert.\n\nTrotzdem abschließen?")) return;
              }
              // Prüfen ob das Bett im Bettenstamm gesperrt ist
              if (task.scanned_barcode) {
                try {
                  const r = await api.get(`/physical-beds/by-barcode/${encodeURIComponent(task.scanned_barcode)}`);
                  if (r.data?.gesperrt) {
                    alert(`🔒 ACHTUNG – Dieses Bett ist gesperrt!\n\nBitte das Bett physisch sperren/kennzeichnen, damit es nicht wieder in Betrieb genommen wird.\n\nGrund: ${r.data.gesperrt_grund || "–"}`);
                  }
                } catch { /* ignorieren */ }
              }
              doAction(() => api.patch(`/tasks/${id}`, { status: "abgeschlossen" }));
            }}>
            ✓ Auftrag als erledigt melden
          </button>
        )}
        {/* Zurückgeben */}
        {["unterwegs", "angekommen", "laufend"].includes(task.status) && mine && (
          <button className="btn-ghost w-full" disabled={busy}
            onClick={() => {
              if (!confirm("Auftrag wirklich zurückgeben?\n\nDer Auftrag wird wieder als 'Offen' markiert und kann von einem anderen Mitarbeiter angenommen werden.")) return;
              doAction(() => api.post(`/tasks/${id}/release`));
            }}>
            ↩ Auftrag zurückgeben
          </button>
        )}
        {actionError && <p className="text-xs text-red-600">❌ {actionError}</p>}

        {/* Drucken */}
        <button
          className="btn-ghost w-full text-slate-400 text-sm"
          onClick={() => window.print()}
        >
          🖨️ Auftrag drucken
        </button>
      </div>
    );
  };

  return (
    <>
    <div className="space-y-5 max-w-2xl">
      <div>
        <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:underline">← Zurück</button>
        <h1 className="font-display text-2xl font-bold mt-1">
          {isZentral
            ? <>🛏️ {task.bed_type_name ?? "Zentrale Aufbereitung"}{task.is_iso ? <span className="ml-2 text-red-600 text-lg">⚠️ ISO</span> : null}</>
            : <>Zi. {task.room_number} {task.bed_number && `· Bett ${task.bed_number}`}</>
          }
        </h1>
        <div className="text-sm text-slate-500">
          {isZentral ? (task.aufbereitungsart_name ?? "Bettenzentrale") : `${task.area_name} · ${task.station_name}`}
        </div>
        {task.scanned_barcode && <div className="text-xs text-slate-400 font-mono mt-0.5">📦 {task.scanned_barcode}</div>}
      </div>

      {/* Fortschritt */}
      {progress()}

      {/* Badges */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className={`badge ${task.cleaning_type === "infektioes" || task.cleaning_type === "schlussdesinfektion"
          ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-700"}`}>
          {task.cleaning_type === "normal"              ? "🛏️ Normale Aufbereitung" :
           task.cleaning_type === "infektioes"          ? "⚠️ Infektiöse Aufbereitung" :
           task.cleaning_type === "standard"            ? "🧹 Standardreinigung" :
           task.cleaning_type === "schlussdesinfektion" ? "🔴 Schlussdesinfektion" :
           task.cleaning_type === "aufbereitung_zentral" ? `🏥 ${task.aufbereitungsart_name ?? "Zentrale Aufbereitung"}` :
           task.cleaning_type}
        </span>
        {task.pathogens.map((p) => (
          <span key={p} className="badge bg-red-100 text-red-700 font-mono">{pathogens[p]?.name ?? p}</span>
        ))}
      </div>

      {/* Infobox */}
      {instruction && (
        <div className={`card border-l-4 ${task.cleaning_type === "infektioes" || task.cleaning_type === "schlussdesinfektion"
          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
          : "border-brand-500 bg-brand-50 dark:bg-brand-900/20"}`}>
          <div className="font-semibold mb-2">📋 {instruction.title}</div>
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{instruction.content}</pre>
        </div>
      )}

      {/* Krankheitserreger-Details */}
      {task.pathogens.length > 0 && (() => {
        const infos = task.pathogens.map((c) => pathogens[c]).filter(Boolean)
          .filter((p) => p.disinfectant || p.hygiene_notes);
        if (!infos.length) return null;
        return (
          <div className="card bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 space-y-3">
            <div className="font-semibold">🧫 Erreger-spezifische Maßnahmen</div>
            {infos.map((p) => (
              <div key={p.code} className="text-sm border-t border-emerald-200 pt-2 first:border-0 first:pt-0">
                <div className="font-bold mb-1">{p.name}</div>
                {p.disinfectant && <div className="mb-1"><b>Desinfektion:</b> {p.disinfectant}</div>}
                {p.cleaning_agent && <div className="mb-1"><b>Reinigung:</b> {p.cleaning_agent}</div>}
                {p.hygiene_notes && <div className="whitespace-pre-wrap text-slate-700">{p.hygiene_notes}</div>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Zuweisung */}
      <div className="card">
        <div className="text-sm text-slate-500 mb-1">Bearbeitet von</div>
        <div className="font-medium">{task.assigned_to_name ?? "— noch nicht angenommen —"}</div>
      </div>

      {/* Fotos */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-semibold">Fotos</h2>
          {(mine || can("auftraege_erstellen")) && task.status !== "abgeschlossen" && (
            <>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-ghost !py-1" onClick={() => setShowCamera(true)}>
                  📷 Kamera
                </button>
                <button className="btn-ghost !py-1" onClick={() => fileRef.current?.click()}>
                  🖼 Galerie
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                     onChange={(e) => { if (e.target.files?.[0]) { uploadPhoto(e.target.files[0]); e.target.value = ""; } }} />
            </>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {task.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt="" className="rounded-lg aspect-square object-cover" />
            </a>
          ))}
          {task.photos.length === 0 && <div className="text-sm text-slate-500 col-span-3">Keine Fotos.</div>}
        </div>
      </section>

      {task.notes && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Notizen</h2>
          <pre className="card whitespace-pre-wrap text-sm">{task.notes}</pre>
        </section>
      )}

      {/* Termin-Bereich – nur bei Scheuer-Wisch */}
      {task.category === "room_cleaning" && (task.wunschtermin || can("zimmerreinigung") || can("verwaltung")) && (
        <TerminBlock taskId={task.id} wunschtermin={task.wunschtermin ?? null}
          bestaetigt_termin={task.bestaetigt_termin ?? null}
          canConfirm={can("zimmerreinigung") || can("verwaltung")}
          onSaved={() => window.location.reload()} />
      )}

      {/* Aktions-Bar */}
      <div className="sticky bottom-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur py-3 -mx-4 px-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
        {actionBar()}
        {can("verwaltung") && (
          <button className="btn-danger w-full" onClick={deleteTask}>🗑 Auftrag löschen (Admin)</button>
        )}
      </div>
    </div>
    {showCamera && (
      <CameraCapture
        onCapture={(file) => uploadPhoto(file)}
        onClose={() => setShowCamera(false)}
      />
    )}
    {showScanner && (
      <BarcodeScanner
        onScan={(code) => {
          doAction(() => api.patch(`/tasks/${id}`, { scanned_barcode: code }));
        }}
        onClose={() => setShowScanner(false)}
      />
    )}
    </>
  );
}

function TerminBlock({ taskId, wunschtermin, bestaetigt_termin, canConfirm, onSaved }:
  { taskId: string; wunschtermin: string | null; bestaetigt_termin: string | null; canConfirm: boolean; onSaved: () => void }) {

  const [editDatum, setEditDatum] = useState(
    bestaetigt_termin ? bestaetigt_termin.slice(0, 10) : (wunschtermin ? wunschtermin.slice(0, 10) : "")
  );
  const [editZeit, setEditZeit] = useState(
    bestaetigt_termin ? bestaetigt_termin.slice(11, 16) : (wunschtermin ? wunschtermin.slice(11, 16) : "")
  );
  const [saving, setSaving] = useState(false);

  function fmt(iso: string | null) {
    if (!iso) return "–";
    return new Date(iso.replace(" ", "T")).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  async function save() {
    if (!editDatum) return;
    setSaving(true);
    try {
      await api.patch(`/tasks/${taskId}`, {
        bestaetigt_termin: `${editDatum}T${editZeit || "00:00"}`,
      });
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-display text-lg font-semibold">📅 Termin</h2>
      {wunschtermin && (
        <div className="text-sm">
          <span className="text-slate-500">Wunschtermin Station:</span>{" "}
          <span className="font-medium">{fmt(wunschtermin)}</span>
        </div>
      )}
      {bestaetigt_termin && (
        <div className="text-sm">
          <span className="text-slate-500">Bestätigter Termin:</span>{" "}
          <span className="font-semibold text-emerald-700">✅ {fmt(bestaetigt_termin)}</span>
        </div>
      )}
      {canConfirm && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs text-slate-500">Termin bestätigen oder anpassen:</p>
          <div className="flex gap-2">
            <input type="date" className="input flex-1" value={editDatum}
              onChange={e => setEditDatum(e.target.value)} />
            <input type="time" className="input w-28" value={editZeit}
              onChange={e => setEditZeit(e.target.value)}
              disabled={!editDatum} />
            <button className="btn-primary !px-3" onClick={save} disabled={saving || !editDatum}>
              {saving ? "…" : "✓"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
