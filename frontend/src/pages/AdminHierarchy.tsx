import { useState, lazy, Suspense } from "react";

const BedTypeTab           = lazy(() => import("./admin/BedTypeTab"));
const PathogenTab          = lazy(() => import("./admin/PathogenTab"));
const AufbereitungsartenTab = lazy(() => import("./admin/AufbereitungsartenTab"));
const BerufsGruppenTab      = lazy(() => import("./admin/BerufsGruppenTab"));
const InstructionsTab      = lazy(() => import("./admin/InstructionsTab"));
const SettingsTab          = lazy(() => import("./admin/SettingsTab"));
const DesignTab            = lazy(() => import("./admin/DesignTab"));
const ModulesTab           = lazy(() => import("./admin/ModulesTab"));
const BackupTab            = lazy(() => import("./admin/BackupTab"));
const O2Tab                = lazy(() => import("./admin/O2Tab"));
const RuecksendungAbschluesseTab = lazy(() => import("./admin/RuecksendungAbschluesseTab"));
const AuditLogTab                = lazy(() => import("./admin/AuditLogTab"));
const WaescheTypenTab            = lazy(() => import("./admin/WaescheTypenTab"));
const UpdateTab                  = lazy(() => import("./admin/UpdateTab"));

type Tab = "bedtypes" | "pathogens" | "aufbereitungsarten" | "berufsgruppen"
         | "instructions" | "settings" | "design" | "modules" | "backup"
         | "o2" | "ruecksendung_abschluesse" | "audit_log" | "waesche_typen" | "update";

const LABEL: Record<Tab, string> = {
  bedtypes:                "Bett-Typen",
  pathogens:               "Krankheitserreger",
  aufbereitungsarten:      "Desinfektionsmaßnahmen",
  berufsgruppen:           "Berufsgruppen",
  instructions:            "Anleitungen",
  settings:                "⚙️ Einstellungen",
  design:                  "🎨 Design",
  modules:                 "🧩 Module",
  backup:                  "💾 Backup",
  o2:                      "💨 O₂",
  ruecksendung_abschluesse:"📦 Rücks.-Gründe",
  audit_log:               "🔍 Audit-Log",
  waesche_typen:           "🛏 Wäschetypen",
  update:                  "⬆️ Update",
};

const ALL_TABS: Tab[] = [
  "bedtypes","pathogens","aufbereitungsarten","berufsgruppen",
  "instructions","settings","design","modules","backup","o2",
  "ruecksendung_abschluesse","audit_log","waesche_typen","update",
];

function TabLoader() {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      Wird geladen…
    </div>
  );
}

export default function AdminHierarchy() {
  const [tab, setTab] = useState<Tab>("settings");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">⚙️ Verwaltung</h1>
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
        {tab === "bedtypes"           && <BedTypeTab />}
        {tab === "pathogens"          && <PathogenTab />}
        {tab === "aufbereitungsarten" && <AufbereitungsartenTab />}
        {tab === "berufsgruppen"      && <BerufsGruppenTab />}
        {tab === "instructions"       && <InstructionsTab />}
        {tab === "settings"           && <SettingsTab />}
        {tab === "design"             && <DesignTab />}
        {tab === "modules"            && <ModulesTab />}
        {tab === "backup"             && <BackupTab />}
        {tab === "o2"                      && <O2Tab />}
        {tab === "ruecksendung_abschluesse" && <RuecksendungAbschluesseTab />}
        {tab === "audit_log"                && <AuditLogTab />}
        {tab === "waesche_typen"            && <WaescheTypenTab />}
        {tab === "update"                   && <UpdateTab />}
      </Suspense>
    </div>
  );
}
