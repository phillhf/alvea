import { useEffect, useState, lazy, Suspense } from "react";
import { api } from "../api/client";

const OverviewTab = lazy(() => import("./spinde/OverviewTab"));
const SpindeTab   = lazy(() => import("./spinde/SpindeTab"));
const HistorieTab = lazy(() => import("./spinde/HistorieTab"));
const AnfragenTab = lazy(() => import("./spinde/AnfragenTab"));

type Tab = "anfragen" | "overview" | "spinde" | "historie";
const ALL_TABS: Tab[] = ["anfragen", "overview", "spinde", "historie"];

function TabLoader() {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      Wird geladen…
    </div>
  );
}

export default function Spindverwaltung() {
  const [tab, setTab]             = useState<Tab>("spinde");
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    api.get<any[]>("/lockers/requests")
      .then(r => setOpenCount(r.data.length))
      .catch(() => {});
  }, []);

  const LABEL: Record<Tab, string> = {
    anfragen: "📥 Anfragen",
    overview: "📊 Übersicht",
    spinde:   "🔐 Spinde",
    historie: "📋 Historie",
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">🔐 Spindverwaltung</h1>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {ALL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === t
                ? "border-[color:var(--brand-600)] text-[color:var(--brand-700)]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t === "anfragen" ? (
              <span className="flex items-center gap-1.5">
                {LABEL[t]}
                {openCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                    {openCount}
                  </span>
                )}
              </span>
            ) : LABEL[t]}
          </button>
        ))}
      </div>
      <Suspense fallback={<TabLoader />}>
        {tab === "anfragen"  && <AnfragenTab onCountChange={setOpenCount} />}
        {tab === "overview"  && <OverviewTab />}
        {tab === "spinde"    && <SpindeTab />}
        {tab === "historie"  && <HistorieTab />}
      </Suspense>
    </div>
  );
}
