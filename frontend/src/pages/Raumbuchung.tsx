import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import AgendaView from "../components/AgendaView";
import SharedRoomsTab from "./admin/SharedRoomsTab";
import BookingDelegatesTab from "./admin/BookingDelegatesTab";

interface Room {
  id: string;
  name: string;
  location: string | null;
  teilbar: number;
  raum_buchbar: number;
  notiz: string | null;
  desk_count: number;
}
interface Desk { id: string; room_id: string; name: string; sort_order: number; ausstattung: string | null; }
interface Booking {
  id: string; room_id: string; desk_id: string | null; whole_room: number;
  user_id: string; user_name: string | null; start_at: string; end_at: string;
  booked_by_id?: string | null; booked_by_name?: string | null;
}
interface MyBooking extends Booking { room_name: string; desk_name: string | null; }
interface BookableUser { id: string; full_name: string; email: string; }

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function roundToQuarterHour(d: Date): Date {
  const rounded = new Date(d);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  rounded.setMinutes(0);
  rounded.setTime(rounded.getTime() + roundedMinutes * 60 * 1000);
  return rounded;
}
function fmt(iso: string) {
  return new Date(iso.replace(" ", "T")).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}
function getMonthGrid(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Montag = 0 ... Sonntag = 6
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array(leadingBlanks).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Raumbuchung() {
  const toast = useToast();
  const { can } = useAuth();
  const isAdmin = can("verwaltung");
  const isModuleAdmin = can("raumbuchungsadmin") || isAdmin;
  const canProxy = can("raumbuchung_stellvertretung") || isModuleAdmin;

  const [bookableUsers, setBookableUsers] = useState<BookableUser[]>([]);
  const [bookForUserId, setBookForUserId] = useState<string>("");
  const [recurring, setRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(4);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [viewMode, setViewMode] = useState<"rooms" | "agenda" | "all" | "admin">("rooms");
  const [desks, setDesks] = useState<Desk[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [monthBookings, setMonthBookings] = useState<Booking[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [calDeskFilter, setCalDeskFilter] = useState<string>(""); // "" = Ganzer Raum/Aggregat
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [favorites, setFavorites] = useState<{ desk_id: string; desk_name: string; room_id: string; room_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Zeitfenster-Auswahl
  const now = roundToQuarterHour(new Date());
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const [startAt, setStartAt] = useState(toLocalInput(now));
  const [endAt, setEndAt]     = useState(toLocalInput(inOneHour));

  // Buchungsdialog
  const [bookingTarget, setBookingTarget] = useState<{ deskId?: string; wholeRoom?: boolean; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => { loadRooms(); loadMyBookings(); loadFavorites(); if (canProxy) loadBookableUsers(); }, []);
  useEffect(() => { if (selectedRoom) loadRoomDetail(selectedRoom.id); }, [selectedRoom?.id]);
  useEffect(() => { if (selectedRoom) loadBookings(selectedRoom.id); }, [selectedRoom?.id, startAt, endAt]);

  async function loadRooms() {
    setLoading(true);
    try { setRooms((await api.get<Room[]>("/shared-rooms")).data); }
    catch { toast.error("Fehler beim Laden der Räume."); }
    finally { setLoading(false); }
  }

  async function loadRoomDetail(roomId: string) {
    try {
      const r = await api.get<Room & { desks: Desk[] }>(`/shared-rooms/${roomId}`);
      setDesks(r.data.desks);
    } catch { toast.error("Fehler beim Laden der Tische."); }
  }

  async function loadBookings(roomId: string) {
    try {
      const qs = new URLSearchParams({ room_id: roomId, from: new Date(startAt).toISOString(), to: new Date(endAt).toISOString() }).toString();
      const r = await api.get<Booking[]>(`/shared-bookings?${qs}`);
      setBookings(r.data);
    } catch { /* ignore */ }
  }

  async function loadMonthBookings(roomId: string, monthDate: Date) {
    try {
      const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const qs = new URLSearchParams({ room_id: roomId, from: from.toISOString(), to: to.toISOString() }).toString();
      const r = await api.get<Booking[]>(`/shared-bookings?${qs}`);
      setMonthBookings(r.data);
    } catch { /* ignore */ }
  }

  async function loadMyBookings() {
    try { setMyBookings((await api.get<MyBooking[]>("/shared-bookings/my")).data); }
    catch { /* ignore */ }
  }

  async function loadFavorites() {
    try { setFavorites((await api.get("/shared-bookings/favorites")).data); }
    catch { /* ignore */ }
  }

  async function toggleFavorite(deskId: string) {
    try {
      await api.post(`/shared-bookings/favorites/${deskId}`);
      loadFavorites();
    } catch { toast.error("Fehler beim Speichern des Favoriten."); }
  }

  async function loadBookableUsers() {
    try { setBookableUsers((await api.get<BookableUser[]>("/shared-bookings/bookable-users")).data); }
    catch { /* ignore */ }
  }

  function deskStatus(deskId: string): Booking | null {
    return bookings.find(b => (b.desk_id === deskId || b.whole_room) && overlaps(b.start_at, b.end_at, new Date(startAt).toISOString(), new Date(endAt).toISOString())) ?? null;
  }
  function wholeRoomStatus(): Booking | null {
    return bookings.find(b => b.whole_room && overlaps(b.start_at, b.end_at, new Date(startAt).toISOString(), new Date(endAt).toISOString())) ?? null;
  }

  // Prüft ob an einem bestimmten Kalendertag irgendeine Buchung existiert,
  // die diesen Tisch (oder bei whole_room=true den ganzen Raum) betrifft.
  function isDayOccupied(day: Date, deskId?: string, wholeRoomCheck?: boolean): boolean {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
    return monthBookings.some(b => {
      const relevant = wholeRoomCheck ? b.whole_room : (deskId ? (b.desk_id === deskId || b.whole_room) : true);
      return relevant && overlaps(b.start_at, b.end_at, dayStart.toISOString(), dayEnd.toISOString());
    });
  }

  // Springt mit der Zeitauswahl auf den gewählten Tag (Uhrzeit bleibt erhalten)
  function jumpToDay(day: Date) {
    const currentStart = new Date(startAt);
    const currentEnd = new Date(endAt);
    const newStart = new Date(day);
    newStart.setHours(currentStart.getHours(), currentStart.getMinutes(), 0, 0);
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);
    setStartAt(toLocalInput(newStart));
    setEndAt(toLocalInput(newEnd));
  }

  async function confirmBooking() {
    if (!selectedRoom || !bookingTarget) return;
    if (new Date(endAt) <= new Date(startAt)) { toast.error("Ende muss nach dem Start liegen."); return; }
    setSaving(true);
    try {
      const basePayload = {
        room_id: selectedRoom.id,
        desk_id: bookingTarget.deskId,
        whole_room: bookingTarget.wholeRoom ?? false,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        for_user_id: bookForUserId || undefined,
      };

      if (recurring) {
        const r = await api.post("/shared-bookings/recurring", { ...basePayload, weeks: recurringWeeks });
        const { created, skipped } = r.data as { created: any[]; skipped: any[] };
        if (skipped.length === 0) {
          toast.success(`Alle ${created.length} Termine gebucht.`);
        } else {
          toast.error(`${created.length} von ${recurringWeeks} Terminen gebucht – ${skipped.length} entfielen wegen Überschneidung.`);
        }
      } else {
        await api.post("/shared-bookings", basePayload);
        toast.success("Gebucht.");
      }

      setBookingTarget(null);
      setBookForUserId("");
      setRecurring(false);
      loadBookings(selectedRoom.id);
      loadMonthBookings(selectedRoom.id, calMonth);
      loadMyBookings();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        toast.error(`Zeitraum überschneidet sich mit einer Buchung von ${e.response.data?.conflict?.user_name ?? "jemand anderem"}.`);
      } else if (e?.response?.data?.error === "not_authorized_for_this_person") {
        toast.error("Du bist nicht berechtigt, für diese Person zu buchen.");
      } else {
        toast.error("Buchung fehlgeschlagen.");
      }
    } finally { setSaving(false); }
  }

  // ── Raumübersicht ────────────────────────────────────────────────────────
  if (!selectedRoom) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="font-display text-2xl font-bold">🪑 Raumbuchung</h1>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
          {([
            { key: "rooms",  label: "📍 Räume" },
            { key: "agenda", label: "📅 Meine Buchungen" },
            ...(isModuleAdmin ? [
              { key: "all" as const,   label: "📋 Alle Buchungen" },
              { key: "admin" as const, label: "⚙️ Verwaltung" },
            ] : []),
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setViewMode(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {viewMode === "agenda" ? (
          <AgendaView />
        ) : viewMode === "all" ? (
          <AgendaView adminMode />
        ) : viewMode === "admin" ? (
          <div className="space-y-8">
            <SharedRoomsTab />
            <BookingDelegatesTab />
          </div>
        ) : (
          <>
            {loading && <p className="text-sm text-slate-400">Lädt…</p>}
            {!loading && rooms.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-12">Keine teilbaren Räume vorhanden.</p>
            )}

            {favorites.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-2">⭐ Meine Favoriten</p>
                <div className="flex flex-wrap gap-2">
                  {favorites.map(f => (
                    <button key={f.desk_id}
                      onClick={() => {
                        const room = rooms.find(r => r.id === f.room_id);
                        if (room) setSelectedRoom(room);
                      }}
                      className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">
                      ⭐ {f.room_name} · {f.desk_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map(r => (
                <button key={r.id} onClick={() => setSelectedRoom(r)}
                  className="card-interactive text-left">
                  <p className="font-semibold">{r.name}</p>
                  {r.location && <p className="text-xs text-slate-400 mt-0.5">📍 {r.location}</p>}
                  {r.notiz && <p className="text-xs text-slate-500 mt-0.5">ℹ️ {r.notiz}</p>}
                  <p className="text-xs text-slate-500 mt-2">{r.desk_count} Tisch{r.desk_count !== 1 ? "e" : ""}{r.raum_buchbar ? " · auch als ganzer Raum buchbar" : ""}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Raumdetail mit visueller Tisch-Anzeige ──────────────────────────────
  const wholeStatus = wholeRoomStatus();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={() => { setSelectedRoom(null); setBookingTarget(null); }} className="text-sm text-slate-500 hover:text-slate-700">
        ← Zurück zur Übersicht
      </button>
      <h1 className="font-display text-2xl font-bold">{selectedRoom.name}</h1>
      {(selectedRoom.location || selectedRoom.notiz) && (
        <p className="text-sm text-slate-500 -mt-2">
          {selectedRoom.location && <span>📍 {selectedRoom.location}</span>}
          {selectedRoom.location && selectedRoom.notiz && <span> · </span>}
          {selectedRoom.notiz && <span>ℹ️ {selectedRoom.notiz}</span>}
        </p>
      )}

      {/* Zeitfenster – Viertelstunden-Raster */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Von</label>
          <input type="datetime-local" step={900} value={startAt}
            onChange={e => { if (e.target.value) setStartAt(toLocalInput(roundToQuarterHour(new Date(e.target.value)))); }}
            className="input" />
        </div>
        <div>
          <label className="label">Bis</label>
          <input type="datetime-local" step={900} value={endAt}
            onChange={e => { if (e.target.value) setEndAt(toLocalInput(roundToQuarterHour(new Date(e.target.value)))); }}
            className="input" />
        </div>
      </div>

      {/* Kalender-Button statt dauerhafter Tabelle */}
      <button onClick={() => { setShowCalendar(true); setCalMonth(new Date()); setCalDeskFilter(""); loadMonthBookings(selectedRoom.id, new Date()); }}
        className="btn-outline text-sm">
        📅 Verfügbarkeit im Kalender ansehen
      </button>

      {/* Ganzer Raum buchbar */}
      {!!selectedRoom.raum_buchbar && (
        <div className={`card flex items-center justify-between border-l-4 ${wholeStatus ? "border-l-red-400" : "border-l-green-400"}`}>
          <div>
            <p className="font-medium text-sm">Ganzer Raum</p>
            {wholeStatus ? (
              <p className="text-xs text-red-500 mt-0.5">Belegt von {wholeStatus.user_name ?? "jemandem"} · {fmt(wholeStatus.start_at)}–{fmt(wholeStatus.end_at)}</p>
            ) : (
              <p className="text-xs text-green-600 mt-0.5">Frei im gewählten Zeitraum</p>
            )}
          </div>
          {!wholeStatus && (
            <button onClick={() => setBookingTarget({ wholeRoom: true, label: "den ganzen Raum" })}
              className="btn-primary text-sm py-1.5 px-3">Buchen</button>
          )}
        </div>
      )}

      {/* Tisch-Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {desks.map(d => {
          const status = deskStatus(d.id);
          const occupied = !!status;
          const isFavorite = favorites.some(f => f.desk_id === d.id);
          return (
            <div key={d.id} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(d.id); }}
                className={`absolute top-1.5 right-1.5 text-sm z-10 ${isFavorite ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
                title={isFavorite ? "Favorit entfernen" : "Als Favorit merken"}>
                {isFavorite ? "⭐" : "☆"}
              </button>
              <button
                disabled={occupied}
                onClick={() => setBookingTarget({ deskId: d.id, label: d.name })}
              onMouseEnter={e => {
                if (status) {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  const who = status.whole_room ? "Ganzer Raum" : (status.user_name ?? "Belegt");
                  const proxyInfo = status.booked_by_name ? ` (gebucht von ${status.booked_by_name})` : "";
                  setHoverInfo({
                    x: rect.left + rect.width / 2, y: rect.top,
                    text: `${who}${proxyInfo} · ${fmt(status.start_at)}–${fmt(status.end_at)}`,
                  });
                }
              }}
              onMouseLeave={() => setHoverInfo(null)}
              className={`w-full relative rounded-xl p-4 text-center font-medium text-sm transition-colors border-2 ${
                occupied
                  ? "bg-red-50 border-red-300 text-red-700 cursor-not-allowed"
                  : "bg-green-50 border-green-300 text-green-700 hover:bg-green-100 cursor-pointer"
              }`}
            >
              🪑 {d.name}
              {d.ausstattung && <div className="text-[11px] mt-0.5 font-normal opacity-75">{d.ausstattung}</div>}
              <div className="text-xs mt-1 font-normal">{occupied ? "Belegt" : "Frei"}</div>
              </button>
            </div>
          );
        })}
      </div>

      {desks.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">Keine Tische in diesem Raum angelegt.</p>
      )}

      {/* Hover-Tooltip */}
      {hoverInfo && (
        <div className="fixed z-50 -translate-x-1/2 -translate-y-full -mt-2 bg-slate-800 text-white text-xs rounded-lg px-3 py-1.5 pointer-events-none whitespace-nowrap"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}>
          {hoverInfo.text}
        </div>
      )}

      {/* Buchungsbestätigung */}
      {bookingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-sm p-5 space-y-4">
            <h2 className="font-semibold text-base">{bookingTarget.label} buchen</h2>
            <p className="text-sm text-slate-600">
              {fmt(new Date(startAt).toISOString())} bis {fmt(new Date(endAt).toISOString())}
            </p>
            {canProxy && (
              <div>
                <label className="label">Für wen buchen?</label>
                <select className="input" value={bookForUserId} onChange={e => setBookForUserId(e.target.value)}>
                  <option value="">Für mich selbst</option>
                  {bookableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
                Wöchentlich wiederholen
              </label>
              {recurring && (
                <div className="mt-2 flex items-center gap-2">
                  <select className="input !w-auto" value={recurringWeeks} onChange={e => setRecurringWeeks(Number(e.target.value))}>
                    {[2,3,4,5,6,8,10,12].map(n => <option key={n} value={n}>{n} Wochen</option>)}
                  </select>
                  <span className="text-xs text-slate-400">jeweils zur gleichen Uhrzeit</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={confirmBooking} disabled={saving}
                className="btn-primary flex-1 disabled:opacity-40">
                {saving ? "Wird gebucht…" : "Bestätigen"}
              </button>
              <button onClick={() => { setBookingTarget(null); setBookForUserId(""); setRecurring(false); }} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kalender-Popover */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowCalendar(false)}>
          <div className="bg-white rounded-lg shadow-md border border-[#E8E8E8] w-full max-w-sm p-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => {
                const prev = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
                setCalMonth(prev); loadMonthBookings(selectedRoom.id, prev);
              }} className="text-slate-400 hover:text-slate-700 px-2">‹</button>
              <span className="font-semibold text-sm">
                {calMonth.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => {
                const next = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
                setCalMonth(next); loadMonthBookings(selectedRoom.id, next);
              }} className="text-slate-400 hover:text-slate-700 px-2">›</button>
            </div>

            {(desks.length > 0 || selectedRoom.raum_buchbar) && (
              <select className="input text-sm mb-3" value={calDeskFilter} onChange={e => setCalDeskFilter(e.target.value)}>
                <option value="">Alle Tische (Gesamtbelegung)</option>
                {!!selectedRoom.raum_buchbar && <option value="__whole__">Nur ganzer Raum</option>}
                {desks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
              {["Mo","Di","Mi","Do","Fr","Sa","So"].map(w => <div key={w}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {getMonthGrid(calMonth).map((day, i) => {
                if (!day) return <div key={i} />;
                const isPast = day < new Date(new Date().setHours(0,0,0,0));
                const occupied = calDeskFilter === "__whole__"
                  ? isDayOccupied(day, undefined, true)
                  : calDeskFilter
                    ? isDayOccupied(day, calDeskFilter)
                    : isDayOccupied(day);
                const isToday = sameDay(day, new Date());
                return (
                  <button key={i} disabled={isPast}
                    onClick={() => { jumpToDay(day); setShowCalendar(false); }}
                    className={`aspect-square rounded-lg text-xs flex items-center justify-center transition-colors ${
                      isPast ? "text-slate-300 cursor-not-allowed" :
                      occupied ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                    } ${isToday ? "ring-2 ring-slate-400" : ""}`}>
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> frei</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> belegt</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
