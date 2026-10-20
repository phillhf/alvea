import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

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

const TABS: Record<Tab, { label: string; icon: string; desc: string }> = {
  aufbereitungsarten:       { icon: "🧴", label: "Desinfektionsmaßnahmen", desc: "Verfahren für Bett-Zentral und Scheuer-Wisch" },
  pathogens:                { icon: "🦠", label: "Krankheitserreger",      desc: "Erreger mit Mittel, Material und Schutzmaßnahmen" },
  bedtypes:                 { icon: "🛏️", label: "Bett-Typen",             desc: "Arten von Betten" },
  instructions:             { icon: "📋", label: "Anleitungen",            desc: "Reinigungsanleitungen und Checklisten" },
  o2:                       { icon: "💨", label: "Sauerstoff",             desc: "Lager, Flaschentypen, Flaschen" },
  ruecksendung_abschluesse: { icon: "📦", label: "Rücksendungs-Gründe",    desc: "Abschlussgründe für Rücksendungen" },
  waesche_typen:            { icon: "🛏", label: "Wäschetypen",            desc: "Kissen, Bettdecken u. a." },
  berufsgruppen:            { icon: "🔐", label: "Berufsgruppen",          desc: "Auswahl für Spind-Anfragen" },
  modules:                  { icon: "🧩", label: "Module",                 desc: "Funktionen ein- und ausschalten" },
  design:                   { icon: "🎨", label: "Design",                 desc: "Farben, Schriften, Login-Seite" },
  settings:                 { icon: "⚙️", label: "Einstellungen",          desc: "Prioritäten, Farbschwellen, Texte" },
  backup:                   { icon: "💾", label: "Backup",                 desc: "Tägliche Datensicherung" },
  audit_log:                { icon: "🔍", label: "Audit-Log",              desc: "Protokoll aller Änderungen" },
  update:                   { icon: "⬆️", label: "Update",                 desc: "Neue Version installieren" },
};

const GROUPS: { title: string; tabs: Tab[] }[] = [
  { title: "Fachliche Stammdaten", tabs: ["aufbereitungsarten", "pathogens", "bedtypes", "instructions", "o2", "ruecksendung_abschluesse", "waesche_typen", "berufsgruppen"] },
  { title: "Darstellung & Module", tabs: ["modules", "design", "settings"] },
  { title: "System",               tabs: ["backup", "audit_log", "update"] },
];

const STORAGE_KEY = "alvea.admin.tab";

function readStoredTab(): Tab | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v && v in TABS ? (v as Tab) : null;
  } catch { return null; }
}

function TabLoader() {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
      Wird geladen…
    </div>
  );
}

export default function AdminHierarchy() {
  const { can } = useAuth();
  // null = Übersicht; der zuletzt geöffnete Bereich bleibt in dieser Sitzung erhalten
  const [tab, setTabState] = useState<Tab | null>(readStoredTab);

  function setTab(t: Tab | null) {
    setTabState(t);
    try { t ? sessionStorage.setItem(STORAGE_KEY, t) : sessionStorage.removeItem(STORAGE_KEY); } catch { /* egal */ }
  }

  if (!tab) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">⚙️ Verwaltung</h1>

        {/* Verwandte Bereiche mit eigenem Menüpunkt */}
        <div className="grid sm:grid-cols-2 gap-3">
          {(can("raumbuch") || can("verwaltung")) && (
            <Link to="/raumbuch" className="card-interactive flex items-center gap-3 !p-4">
              <span className="text-2xl">🗺️</span>
              <div>
                <div className="font-semibold">Raumbuch</div>
                <div className="text-xs text-slate-500">Häuser, Gebäude, Stationen, Räume, Stellplätze, Import</div>
              </div>
            </Link>
          )}
          {(can("benutzerverwaltung") || can("verwaltung")) && (
            <Link to="/benutzer-rollen" className="card-interactive flex items-center gap-3 !p-4">
              <span className="text-2xl">👥</span>
              <div>
                <div className="font-semibold">Benutzer &amp; Rollen</div>
                <div className="text-xs text-slate-500">Mitarbeiter, Rollen und Berechtigungen, Teams</div>
              </div>
            </Link>
          )}
        </div>

        {GROUPS.map(g => (
          <section key={g.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {g.tabs.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="card-interactive text-left flex items-start gap-3 !p-3">
                  <span className="text-xl leading-none mt-0.5">{TABS[t].icon}</span>
                  <span>
                    <span className="block font-medium text-sm">{TABS[t].label}</span>
                    <span className="block text-xs text-slate-500">{TABS[t].desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const group = GROUPS.find(g => g.tabs.includes(tab))!;

  return (
    <div className="space-y-4">
      <div>
        <button className="text-sm text-slate-500 hover:underline" onClick={() => setTab(null)}>← Verwaltung</button>
        <h1 className="font-display text-2xl font-bold mt-1">{TABS[tab].icon} {TABS[tab].label}</h1>
      </div>
      {/* Nur die Bereiche derselben Gruppe – statt 14 Tabs auf einmal */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {group.tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t
                ? "border-[color:var(--brand-600)] text-[color:var(--brand-700)]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {TABS[t].label}
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
