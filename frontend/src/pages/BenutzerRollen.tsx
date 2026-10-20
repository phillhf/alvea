import { useState, lazy, Suspense } from "react";

const MitarbeiterTab = lazy(() => import("./AdminUsers"));
const RollenTab      = lazy(() => import("./admin/RollenTab"));
const TeamsTab       = lazy(() => import("./admin/TeamsTab"));

type Tab = "mitarbeiter" | "rollen" | "teams";
const LABEL: Record<Tab, string> = {
  mitarbeiter: "👤 Mitarbeiter",
  rollen:      "🔐 Rollen",
  teams:       "Teams",
};
const ALL_TABS: Tab[] = ["mitarbeiter","rollen","teams"];

function TabLoader() {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      Wird geladen…
    </div>
  );
}

export default function BenutzerRollen() {
  const [tab, setTab] = useState<Tab>("mitarbeiter");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">👥 Benutzer &amp; Rollen</h1>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 flex-wrap">
        {ALL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t
                ? "border-[color:var(--brand-600)] text-[color:var(--brand-700)]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {LABEL[t]}
          </button>
        ))}
      </div>
      <Suspense fallback={<TabLoader />}>
        {tab === "mitarbeiter" && <MitarbeiterTab />}
        {tab === "rollen"      && <RollenTab />}
        {tab === "teams"       && <TeamsTab />}
      </Suspense>
    </div>
  );
}
