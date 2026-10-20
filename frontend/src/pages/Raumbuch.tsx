import { useState, lazy, Suspense } from "react";
import { RaumbuchProvider } from "../contexts/RaumbuchContext";
import { RaumbuchBreadcrumb } from "../components/RaumbuchBreadcrumb";

const HouseTab      = lazy(() => import("./admin/HouseTab"));
const BuildingTab   = lazy(() => import("./admin/BuildingTab"));
const BereichTab    = lazy(() => import("./admin/AreaTab"));
const RoomTab       = lazy(() => import("./admin/RoomTab"));
const BedTab        = lazy(() => import("./admin/BedTab"));
const RoomTypesTab  = lazy(() => import("./admin/RoomTypesTab"));
const ImportTab     = lazy(() => import("./admin/ImportTab"));
const AttributesTab = lazy(() => import("./admin/AttributesTab"));

type Tab = "houses" | "buildings" | "bereiche" | "rooms" | "beds" | "roomtypes" | "import" | "attributes";
const LABEL: Record<Tab, string> = {
  houses:     "🏥 Häuser",
  buildings:  "🏢 Gebäude",
  bereiche:   "📂 Bereiche/Stationen",
  rooms:      "🚪 Räume",
  beds:       "🛏️ Stellplätze",
  roomtypes:  "🏷️ Raumarten",
  import:     "📥 Import",
  attributes: "📋 Eigene Attribute",
};
const FILTERED_TABS: Tab[] = ["bereiche","rooms","beds"];
const ALL_TABS: Tab[] = ["houses","buildings","bereiche","rooms","beds","roomtypes","import","attributes"];

function TabLoader() {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      Wird geladen…
    </div>
  );
}

export default function Raumbuch() {
  const [tab, setTab] = useState<Tab>("houses");
  return (
    <RaumbuchProvider>
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold">🗺️ Raumbuch</h1>

        {FILTERED_TABS.includes(tab) && (
          <div className="card !p-3"><RaumbuchBreadcrumb /></div>
        )}

        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {ALL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t
                  ? "border-[color:var(--brand-600)] text-[color:var(--brand-700)]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {LABEL[t]}
            </button>
          ))}
        </div>

        <Suspense fallback={<TabLoader />}>
          {tab === "houses"     && <HouseTab />}
          {tab === "buildings"  && <BuildingTab />}
          {tab === "bereiche"   && <BereichTab />}
          {tab === "rooms"      && <RoomTab />}
          {tab === "beds"       && <BedTab />}
          {tab === "roomtypes"  && <RoomTypesTab />}
          {tab === "import"     && <ImportTab />}
          {tab === "attributes" && <AttributesTab />}
        </Suspense>
      </div>
    </RaumbuchProvider>
  );
}
