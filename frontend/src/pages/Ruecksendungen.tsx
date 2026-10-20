import { useEffect, useRef, useState } from "react";
import { SkeletonList } from "../components/Skeleton";
import { api } from "../api/client";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

interface ArtikelItem { artikel: string; menge: string; }
interface Ruecksendung {
  id: string;
  station_id: string;
  station_name: string | null;
  station_name_ref: string | null;
  artikel: string;
  menge: string;
  grund: string;
  status: "offen" | "in_bearbeitung" | "beim_einkauf" | "zurueck_ans_lager" | "abgeschlossen";
  erstellt_von: string | null;
  bearbeitet_von: string | null;
  created_at: string;
  updated_at: string;
  notiz: string | null;
  lager_notiz: string | null;
  einkauf_notiz: string | null;
  weitergeleitet_at: string | null;
  zurueck_at: string | null;
  anhaenge: string[];
}

const STATUS_STYLE: Record<string, { label: string; color: string; badge: string }> = {
  offen:             { label: "Offen",           color: "border-l-amber-400",  badge: "bg-amber-100 text-amber-800"   },
  in_bearbeitung:    { label: "In Bearbeitung",   color: "border-l-blue-400",   badge: "bg-blue-100 text-blue-800"     },
  beim_einkauf:      { label: "Beim Einkauf",     color: "border-l-purple-400", badge: "bg-purple-100 text-purple-800" },
  zurueck_ans_lager: { label: "Zurück ans Lager", color: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" },
  abgeschlossen:     { label: "Abgeschlossen",    color: "border-l-green-400",  badge: "bg-green-100 text-green-800"   },
};

const FILTER_OPTIONS = [
  { key: "lager",             label: "Lager"         },
  { key: "beim_einkauf",      label: "Einkauf"       },
  { key: "abgeschlossen",     label: "Abgeschlossen" },
  { key: "alle",              label: "Alle"          },
];

function getArtikelList(r: Ruecksendung): ArtikelItem[] {
  try {
    const p = JSON.parse(r.artikel);
    if (Array.isArray(p) && p.length > 0 && "artikel" in p[0]) return p;
  } catch { /* noop */ }
  return [{ artikel: r.artikel, menge: r.menge }];
}

function fmtDate(iso: string) {
  return new Date(iso.replace(" ", "T")).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function AnhaengeBox({ r, onRefresh }: { r: Ruecksendung; onRefresh: () => void }) {
  const toast   = useToast();
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canEdit = can("lager") || can("verwaltung");

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/ruecksendungen/${r.id}/anhang`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onRefresh();
      toast.success("Anhang hochgeladen.");
    } catch { toast.error("Upload fehlgeschlagen."); }
    finally { setUploading(false); }
  }

  async function remove(url: string) {
    if (!confirm("Anhang löschen?")) return;
    try {
      await api.delete(`/ruecksendungen/${r.id}/anhang`, { data: { url } });
      onRefresh();
    } catch { toast.error("Fehler beim Löschen."); }
  }

  const isImage = (url: string) => /\.(jpg|jpeg|png|webp|heic)$/i.test(url);

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-400 mb-2">Anhänge ({r.anhaenge.length})</p>
      <div className="flex flex-wrap gap-2">
        {r.anhaenge.map((url, i) => (
          <div key={i} className="relative group">
            {isImage(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="Anhang" className="w-16 h-16 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition" />
              </a>
            ) : (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-600 hover:bg-slate-200 transition">
                📄 Dok. {i + 1}
              </a>
            )}
            {canEdit && (
              <button onClick={() => remove(url)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition flex items-center justify-center text-2xl disabled:opacity-40">
            {uploading ? "…" : "+"}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

export default function Ruecksendungen() {
  const toast        = useToast();
  const { can } = useAuth();
  const canLagerInit = can("lager") || can("verwaltung");
  const [filterStatus, setFilterStatus] = useState("lager");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [items, setItems]               = useState<Ruecksendung[]>([]);
  const [abschluesse, setAbschluesse]   = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]           = useState(false);
  const [notizId, setNotizId]           = useState<string | null>(null);
  const [notizText, setNotizText]       = useState("");
  const [weiterleitenId, setWeiterleitenId]     = useState<string | null>(null);
  const [weiterleitenText, setWeiterleitenText] = useState("");
  const [zurueckId, setZurueckId]       = useState<string | null>(null);
  const [zurueckText, setZurueckText]   = useState("");
  const [lagerNotizId, setLagerNotizId]     = useState<string | null>(null);
  const [lagerNotizText, setLagerNotizText] = useState("");
  const [einkaufNotizId, setEinkaufNotizId]     = useState<string | null>(null);
  const [einkaufNotizText, setEinkaufNotizText] = useState("");

  const canLager = canLagerInit;

  useEffect(() => {
    load();
    loadCounts();
    api.get<{ id: string; name: string }[]>("/ruecksendung-abschluesse")
      .then(r => setAbschluesse(r.data)).catch(() => {});
  }, [filterStatus]);

  async function loadCounts() {
    try {
      const r = await api.get<Ruecksendung[]>("/ruecksendungen?status=alle");
      const c: Record<string, number> = { lager: 0, beim_einkauf: 0 };
      r.data.forEach((item: Ruecksendung) => {
        if (["offen","in_bearbeitung","zurueck_ans_lager"].includes(item.status)) c.lager++;
        if (item.status === "beim_einkauf") c.beim_einkauf++;
      });
      setCounts(c);
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<Ruecksendung[]>(`/ruecksendungen?status=${filterStatus}`);
      setItems(r.data);
    } catch { toast.error("Fehler beim Laden."); }
    finally { setLoading(false); }
  }

  async function saveLagerNotiz(id: string) {
    try {
      await api.patch(`/ruecksendungen/${id}/lager-notiz`, { lager_notiz: lagerNotizText });
      setLagerNotizId(null); load(); loadCounts(); toast.success("Lager-Notiz gespeichert.");
    } catch { toast.error("Fehler."); }
  }

  async function saveEinkaufNotiz(id: string) {
    try {
      await api.patch(`/ruecksendungen/${id}/einkauf-notiz`, { einkauf_notiz: einkaufNotizText });
      setEinkaufNotizId(null); load(); loadCounts(); toast.success("Einkauf-Notiz gespeichert.");
    } catch { toast.error("Fehler."); }
  }

  async function annehmen(id: string) {
    try { await api.patch(`/ruecksendungen/${id}/annehmen`, {}); load(); loadCounts(); toast.success("Angenommen."); }
    catch { toast.error("Fehler."); }
  }

  async function weiterleiten(id: string) {
    try {
      await api.patch(`/ruecksendungen/${id}/weiterleiten`, { notiz: weiterleitenText || undefined });
      setWeiterleitenId(null); setWeiterleitenText(""); load(); loadCounts(); toast.success("An Einkauf weitergeleitet.");
    } catch { toast.error("Fehler."); }
  }

  async function zurueckAnsLager(id: string) {
    try {
      await api.patch(`/ruecksendungen/${id}/zurueck`, { einkauf_notiz: zurueckText || undefined });
      setZurueckId(null); setZurueckText(""); load(); loadCounts(); toast.success("Zurück ans Lager gesendet.");
    } catch { toast.error("Fehler."); }
  }

  async function abschliessen(id: string, notiz?: string) {
    try {
      await api.patch(`/ruecksendungen/${id}/abschliessen`, { notiz });
      setNotizId(null); setNotizText(""); load(); loadCounts(); toast.success("Abgeschlossen.");
    } catch { toast.error("Fehler."); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Rücksendung löschen?")) return;
    try { await api.delete(`/ruecksendungen/${id}`); load(); loadCounts(); toast.success("Gelöscht."); }
    catch { toast.error("Fehler."); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-2xl font-bold">📦 Rücksendungen</h1>

      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(f => {
          const count = f.key === "lager" ? counts.lager : f.key === "beim_einkauf" ? counts.beim_einkauf : undefined;
          return (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              filterStatus === f.key
                ? "border-2"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
            style={filterStatus === f.key ? { backgroundColor: "var(--brand-500)", borderColor: "var(--brand-500)", color: "white" } : {}}>
            {f.label}
            {count !== undefined && count > 0 && (
              <span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                filterStatus === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}>{count > 99 ? "99+" : count}</span>
            )}
          </button>
        );
        })}
        <button onClick={() => { load(); loadCounts(); }} className="ml-auto px-3 py-1.5 rounded-full text-sm bg-white border border-slate-200 text-slate-500 hover:border-slate-400">
          🔄
        </button>
      </div>

      {loading && <SkeletonList count={2} />}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Keine Rücksendungen.</p>
      )}

      <div className="space-y-4">
        {items.map(r => {
          const st       = STATUS_STYLE[r.status] ?? STATUS_STYLE.offen;
          const stName   = r.station_name_ref ?? r.station_name ?? "–";
          const artikels = getArtikelList(r);

          return (
            <div key={r.id} className={`card border-l-4 ${st.color} !p-0 overflow-hidden`}>
              <div className="p-4 space-y-3">
                {/* Kopfzeile */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                      <span className="text-xs text-slate-400">{fmtDate(r.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      📍 {stName}{r.erstellt_von && ` · ${r.erstellt_von}`}
                    </p>
                  </div>
                  <button onClick={() => window.open(`/api/ruecksendungen/${r.id}/begleitschein?token=${localStorage.getItem("token") ?? ""}`, "_blank")}
                    className="shrink-0 text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                    🖨 Begleitschein
                  </button>
                </div>

                {/* Artikel */}
                <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-medium text-slate-400 mb-1.5">Artikel</p>
                  {artikels.map((a, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="font-semibold text-slate-700 min-w-[4rem]">{a.menge}</span>
                      <span className="text-slate-600">{a.artikel}</span>
                    </div>
                  ))}
                </div>

                {/* Grund */}
                <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-medium text-slate-400 mb-0.5">Grund</p>
                  <p className="text-sm text-slate-700">{r.grund}</p>
                </div>

                {/* Lager-Notiz */}
                {r.notiz && (
                  <div className="bg-blue-50 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-medium text-blue-400 mb-0.5">Notiz Lager</p>
                    <p className="text-sm text-blue-800">{r.notiz}</p>
                  </div>
                )}

                {/* Lager-Freitext (editierbar bei in_bearbeitung + zurueck_ans_lager) */}
                {canLager && (r.status === "in_bearbeitung" || r.status === "zurueck_ans_lager") && (
                  lagerNotizId === r.id ? (
                    <div className="space-y-2">
                      <textarea value={lagerNotizText} onChange={e => setLagerNotizText(e.target.value)}
                        placeholder="Lager-Notiz eintragen…" rows={3} autoFocus
                        className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none bg-blue-50" />
                      <div className="flex gap-2">
                        <button onClick={() => saveLagerNotiz(r.id)}
                          className="flex-1 py-1.5 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600">
                          💾 Speichern
                        </button>
                        <button onClick={() => setLagerNotizId(null)}
                          className="px-4 py-1.5 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-xl px-3 py-2.5 cursor-pointer hover:opacity-80 transition ${r.lager_notiz ? "bg-blue-50" : "border border-dashed border-blue-200"}`}
                      onClick={() => { setLagerNotizId(r.id); setLagerNotizText(r.lager_notiz ?? ""); }}>
                      {r.lager_notiz
                        ? <><p className="text-xs font-medium text-blue-400 mb-0.5">Lager-Notiz ✏️</p><p className="text-sm text-blue-800">{r.lager_notiz}</p></>
                        : <p className="text-xs text-blue-300 text-center py-1">+ Lager-Notiz hinzufügen</p>
                      }
                    </div>
                  )
                )}
                {r.lager_notiz && !canLager && (
                  <div className="bg-blue-50 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-medium text-blue-400 mb-0.5">Lager-Notiz</p>
                    <p className="text-sm text-blue-800">{r.lager_notiz}</p>
                  </div>
                )}

                {/* Einkauf-Notiz */}
                {r.einkauf_notiz && r.status !== "beim_einkauf" && (
                  <div className="bg-purple-50 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-medium text-purple-400 mb-0.5">Notiz Einkauf</p>
                    <p className="text-sm text-purple-800">{r.einkauf_notiz}</p>
                    {r.zurueck_at && <p className="text-xs text-purple-400 mt-1">Zurückgesendet: {fmtDate(r.zurueck_at)}</p>}
                  </div>
                )}

                {/* Einkauf-Freitext (editierbar solange beim_einkauf) */}
                {canLager && r.status === "beim_einkauf" && (
                  einkaufNotizId === r.id ? (
                    <div className="space-y-2">
                      <textarea value={einkaufNotizText} onChange={e => setEinkaufNotizText(e.target.value)}
                        placeholder="Einkauf-Notiz eintragen…" rows={3} autoFocus
                        className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none bg-purple-50" />
                      <div className="flex gap-2">
                        <button onClick={() => saveEinkaufNotiz(r.id)}
                          className="flex-1 py-1.5 rounded-xl text-sm font-medium bg-purple-500 text-white hover:bg-purple-600">
                          💾 Speichern
                        </button>
                        <button onClick={() => setEinkaufNotizId(null)}
                          className="px-4 py-1.5 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-xl px-3 py-2.5 cursor-pointer hover:opacity-80 transition ${r.einkauf_notiz ? "bg-purple-50" : "border border-dashed border-purple-200"}`}
                      onClick={() => { setEinkaufNotizId(r.id); setEinkaufNotizText(r.einkauf_notiz ?? ""); }}>
                      {r.einkauf_notiz
                        ? <><p className="text-xs font-medium text-purple-400 mb-0.5">Einkauf-Notiz ✏️</p><p className="text-sm text-purple-800">{r.einkauf_notiz}</p></>
                        : <p className="text-xs text-purple-300 text-center py-1">+ Einkauf-Notiz hinzufügen</p>
                      }
                    </div>
                  )
                )}

                {/* Anhänge */}
                <AnhaengeBox r={r} onRefresh={load} />
              </div>

              {/* Aktionsbereich */}
              {canLager && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 flex flex-col gap-2">

                  {(r.status === "offen" || r.status === "in_bearbeitung") && (
                    weiterleitenId === r.id ? (
                      <div className="space-y-2">
                        <textarea value={weiterleitenText} onChange={e => setWeiterleitenText(e.target.value)}
                          placeholder="Notiz für den Einkauf (optional)…" rows={2}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => weiterleiten(r.id)}
                            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600">
                            ➡ An Einkauf weiterleiten
                          </button>
                          <button onClick={() => setWeiterleitenId(null)} className="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                        </div>
                      </div>
                    ) : notizId === r.id ? (
                      <div className="space-y-2">
                        <select value={notizText} onChange={e => setNotizText(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                          <option value="">– Abschlussgrund wählen –</option>
                          {abschluesse.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => abschliessen(r.id, notizText || undefined)} disabled={!notizText}
                            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-40">
                            ✓ Abschließen
                          </button>
                          <button onClick={() => setNotizId(null)} className="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setWeiterleitenId(r.id); setWeiterleitenText(""); }}
                          className="flex-1 py-2 rounded-xl text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200">
                          ➡ An Einkauf
                        </button>
                        <button onClick={() => { setNotizId(r.id); setNotizText(""); }}
                          className="flex-1 py-2 rounded-xl text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200">
                          ✓ Abschließen
                        </button>
                      </div>
                    )
                  )}

                  {r.status === "beim_einkauf" && (
                    zurueckId === r.id ? (
                      <div className="space-y-2">
                        <textarea value={zurueckText} onChange={e => setZurueckText(e.target.value)}
                          placeholder="Notiz für das Lager…" rows={2}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => zurueckAnsLager(r.id)}
                            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600">
                            ↩ Zurück ans Lager
                          </button>
                          <button onClick={() => setZurueckId(null)} className="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setZurueckId(r.id); setZurueckText(""); }}
                        className="w-full py-2 rounded-xl text-sm font-medium bg-orange-100 text-orange-700 hover:bg-orange-200">
                        ↩ Zurück ans Lager senden
                      </button>
                    )
                  )}

                  {r.status === "zurueck_ans_lager" && (
                    notizId === r.id ? (
                      <div className="space-y-2">
                        <select value={notizText} onChange={e => setNotizText(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                          <option value="">– Abschlussgrund wählen –</option>
                          {abschluesse.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => abschliessen(r.id, notizText || undefined)} disabled={!notizText}
                            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-40">
                            ✓ Abschließen
                          </button>
                          <button onClick={() => setNotizId(null)} className="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setNotizId(r.id); setNotizText(""); }}
                        className="w-full py-2 rounded-xl text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200">
                        ✓ Abschließen
                      </button>
                    )
                  )}

                  {r.status === "abgeschlossen" && (
                    <button onClick={() => handleDelete(r.id)} className="text-sm text-red-400 hover:text-red-600 py-1">
                      🗑 Löschen
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
