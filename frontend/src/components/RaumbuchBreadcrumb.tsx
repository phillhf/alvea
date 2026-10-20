import { useRaumbuch } from "../contexts/RaumbuchContext";

export function RaumbuchBreadcrumb() {
  const { houses, filteredAreas, selectedHouse, selectedArea, setSelectedHouse, setSelectedArea } = useRaumbuch();

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button className="text-[color:var(--brand-600)] hover:underline font-medium"
          onClick={() => setSelectedHouse(null)}>
          🗺️ Raumbuch
        </button>
        {selectedHouse && (
          <>
            <span className="text-slate-400">/</span>
            <button className="text-[color:var(--brand-600)] hover:underline font-medium"
              onClick={() => setSelectedArea(null)}>
              🏥 {selectedHouse.name}
            </button>
          </>
        )}
        {selectedArea && (
          <>
            <span className="text-slate-400">/</span>
            <span className="text-slate-700 font-medium">
              📂 {selectedArea.bezeichnung ?? selectedArea.name}
              {selectedArea.bereichsnummer && <span className="ml-1 text-slate-400 text-xs">[{selectedArea.bereichsnummer}]</span>}
            </span>
          </>
        )}
      </div>

      {/* Filter-Dropdowns */}
      <div className="flex gap-2 flex-wrap">
        <select className="input !py-1.5 !text-sm max-w-[220px]"
          value={selectedHouse?.id ?? ""}
          onChange={e => {
            const h = houses.find(h => h.id === e.target.value);
            setSelectedHouse(h ?? null);
          }}>
          <option value="">🏥 Alle Häuser ({houses.length})</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}{h.ki_number ? ` [${h.ki_number}]` : ""}</option>)}
        </select>

        {filteredAreas.length > 0 && (
          <select className="input !py-1.5 !text-sm max-w-[250px]"
            value={selectedArea?.id ?? ""}
            onChange={e => setSelectedArea(filteredAreas.find(a => a.id === e.target.value) ?? null)}>
            <option value="">📂 Alle Bereiche/Stationen{selectedHouse ? ` (${filteredAreas.length})` : ""}</option>
            {filteredAreas.map(a => (
              <option key={a.id} value={a.id}>
                {a.bereichsnummer ? `[${a.bereichsnummer}] ` : ""}{a.bezeichnung ?? a.name}
              </option>
            ))}
          </select>
        )}

        {(selectedHouse || selectedArea) && (
          <button className="btn-ghost !py-1.5 !px-2.5 text-sm text-slate-500" onClick={() => setSelectedHouse(null)}>
            ✕ Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
