import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { api } from "../api/client";

interface Bed {
  id: string;
  bed_number: string;
  barcode: string | null;
  bed_type_name: string | null;
  active_defects: number;
}

interface Room {
  id: string;
  room_number: string;
  beds: Bed[];
}

export default function DefectStationView() {
  const { stationId } = useParams<{ stationId: string }>();
  const location = useLocation();
  const stationName = (location.state as any)?.stationName ?? "Station";

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Room[]>(`/defects/stations/${stationId}/beds`).then((r) => {
      setRooms(r.data);
      setLoading(false);
    });
  }, [stationId]);

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  const totalBeds = rooms.reduce((sum, r) => sum + r.beds.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link to="/bed-defects" className="text-sm text-slate-500 hover:underline">
          ← Betten-Reparatur
        </Link>
        <h1 className="font-display text-2xl font-bold mt-1">🏥 {stationName}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Bett antippen um einen Defekt zu melden
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <div className="text-4xl mb-3">🛏</div>
          <div>Keine Betten auf dieser Station.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <div key={room.id}>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
                Zimmer {room.room_number}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {room.beds.map((bed) => (
                  <Link
                    key={bed.id}
                    to={`/bed-defects/neu/${bed.id}`}
                    state={{
                      stationName,
                      roomNumber: room.room_number,
                      bedNumber: bed.bed_number,
                      bedTypeName: bed.bed_type_name,
                      barcode: bed.barcode,
                    }}
                    className={`card hover:shadow-md transition-all flex flex-col gap-2 ${
                      bed.active_defects > 0
                        ? "border-l-4 border-amber-400 bg-amber-50"
                        : "hover:border-[color:var(--brand-400)]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm">Bett {bed.bed_number}</div>
                        {bed.bed_type_name && (
                          <div className="text-xs text-slate-400">{bed.bed_type_name}</div>
                        )}
                        {bed.barcode && (
                          <div className="font-mono text-xs text-slate-400 mt-0.5">{bed.barcode}</div>
                        )}
                      </div>
                      {bed.active_defects > 0 && (
                        <span className="badge bg-amber-100 text-amber-800 text-xs shrink-0">
                          🔔 {bed.active_defects}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium mt-auto" style={{ color: "var(--brand-600)" }}>
                      🔧 Defekt melden
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalBeds > 0 && (
        <div className="text-xs text-slate-400 text-center">
          {totalBeds} Bett{totalBeds !== 1 ? "en" : ""} auf {rooms.length} Zimmer{rooms.length !== 1 ? "n" : ""}
        </div>
      )}
    </div>
  );
}
