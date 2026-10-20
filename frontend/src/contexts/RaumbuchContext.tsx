import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { api } from "../api/client";

interface House    { id: string; name: string; ki_number?: string; }
interface Building { id: string; name: string; short_code?: string; house_id: string; house_name?: string; }
interface Area     { id: string; name: string; bezeichnung?: string; bereichsnummer?: string; house_id: string; house_name?: string; building_id?: string | null; building_name?: string | null; }

interface RaumbuchCtx {
  houses:           House[];
  buildings:        Building[];
  areas:            Area[];
  selectedHouse:    House    | null;
  selectedBuilding: Building | null;
  selectedArea:     Area     | null;
  setSelectedHouse:    (h: House    | null) => void;
  setSelectedBuilding: (b: Building | null) => void;
  setSelectedArea:     (a: Area     | null) => void;
  filteredBuildings: Building[];
  filteredAreas:     Area[];
  reload: () => void;
}

const Ctx = createContext<RaumbuchCtx | null>(null);

export function RaumbuchProvider({ children }: { children: ReactNode }) {
  const [houses,    setHouses]    = useState<House[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [areas,     setAreas]     = useState<Area[]>([]);
  const [selectedHouse,    setSelectedHouseState]    = useState<House    | null>(null);
  const [selectedBuilding, setSelectedBuildingState] = useState<Building | null>(null);
  const [selectedArea,     setSelectedAreaState]     = useState<Area     | null>(null);

  function setSelectedHouse(h: House | null) {
    setSelectedHouseState(h);
    setSelectedBuildingState(null);
    setSelectedAreaState(null);
  }
  function setSelectedBuilding(b: Building | null) {
    setSelectedBuildingState(b);
    setSelectedAreaState(null);
  }
  function setSelectedArea(a: Area | null) { setSelectedAreaState(a); }

  async function reload() {
    try { setHouses((await api.get<House[]>("/houses")).data); } catch { /* noop */ }
    try { setBuildings((await api.get<Building[]>("/buildings")).data); } catch { /* noop */ }
    try { setAreas((await api.get<Area[]>("/areas")).data); } catch { /* noop */ }
  }
  useEffect(() => { reload(); }, []);

  const filteredBuildings = selectedHouse
    ? buildings.filter(b => b.house_id === selectedHouse.id)
    : buildings;

  const filteredAreas = areas.filter(a => {
    if (selectedArea)    return a.id === selectedArea.id;
    if (selectedBuilding) return a.building_id === selectedBuilding.id;
    if (selectedHouse)   return a.house_id === selectedHouse.id;
    return true;
  });

  return (
    <Ctx.Provider value={{
      houses, buildings, areas,
      selectedHouse, selectedBuilding, selectedArea,
      setSelectedHouse, setSelectedBuilding, setSelectedArea,
      filteredBuildings, filteredAreas, reload,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRaumbuch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRaumbuch outside RaumbuchProvider");
  return ctx;
}
