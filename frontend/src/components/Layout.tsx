import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { ChatWidget } from "./ChatWidget";
import { useModules } from "../contexts/ModulesContext";
import { useOnlineStatus } from "../contexts/OfflineContext";

export default function Layout() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();
  const { isActive, loading: modulesLoading } = useModules();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [highContrast, setHighContrast] = useState(false);
  const [sidebarMode, setSidebarMode]   = useState<"icon" | "full">(() =>
    (localStorage.getItem("sidebarMode") as "icon" | "full") ?? "icon"
  );

  function toggleSidebarMode() {
    const next = sidebarMode === "icon" ? "full" : "icon";
    setSidebarMode(next);
    localStorage.setItem("sidebarMode", next);
  }
  const [mobileOpen, setMobileOpen]     = useState(false);
  const { isOnline, backOnline } = useOnlineStatus();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  function toggleContrast() {
    const next = !highContrast;
    setHighContrast(next);
    document.body.classList.toggle("high-contrast", next);
  }

  const navItems = [
    ...(can("bettenaufbereitung")
      ? [{ to: "/",               label: t("nav.beds"),        icon: "🧽", end: true  }] : []),
    ...(can("bettenaufbereitung_zentral")
      ? [{ to: "/zentral",        label: t("nav.bedsZentral"), icon: "🏥", end: false }] : []),
    ...(can("zimmerreinigung") && (modulesLoading || isActive("room_cleaning"))
      ? [{ to: "/rooms",          label: "Scheuer-Wisch",      icon: "🚿", end: false }] : []),
    ...(can("sauerstofftransport") && (modulesLoading || isActive("oxygen_transport"))
      ? [{ to: "/oxygen-transport", label: "Sauerstoff",       icon: "💨", end: false }] : []),
    ...(can("stationspersonal")
      ? [{ to: "/meine-station",  label: user?.station_name ?? "Meine Station", icon: "📍", end: false }] : []),
    ...((can("betten_reparatur") || can("verwaltung")) && (modulesLoading || isActive("bed_defects"))
      ? [{ to: "/instandsetzung", label: "Instandsetzung",     icon: "🔩", end: false }] : []),
    ...(can("bettenstamm") || can("verwaltung")
      ? [{ to: "/bettenstamm",    label: "Bettenstamm",        icon: "🛏", end: false }] : []),
    ...(can("betten_pw") || can("verwaltung")
      ? [{ to: "/betten-pw",      label: "Betten P&W",         icon: "🔧", end: false }] : []),
    ...(can("dashboard") || can("verwaltung")
      ? [{ to: "/dashboard",      label: "Dashboard",          icon: "📊", end: false }] : []),
    ...(can("berichte")
      ? [{ to: "/reports",        label: t("nav.reports"),     icon: "📋", end: false }] : []),
    ...(can("meldungen") || can("verwaltung")
      ? [{ to: "/meldungen",      label: "Meldungen",          icon: "📢", end: false }] : []),
    ...(can("spindverwaltung") || can("verwaltung")
      ? [{ to: "/spindverwaltung",label: "Spindverwaltung",    icon: "🔐", end: false }] : []),
    ...(can("raumbuch") || can("verwaltung")
      ? [{ to: "/raumbuch",       label: "Raumbuch",           icon: "🗺️", end: false }] : []),
    ...(can("verwaltung") || can("lager")
      ? [{ to: "/ruecksendungen", label: "Rücksendungen",      icon: "📦", end: false }] : []),
    ...((can("raumbuchung") || can("raumbuchungsadmin") || can("verwaltung")) && (modulesLoading || isActive("raumbuchung"))
      ? [{ to: "/raumbuchung",    label: "Raumbuchung",        icon: "🪑", end: false }] : []),
    ...(can("benutzerverwaltung") || can("verwaltung")
      ? [{ to: "/benutzer-rollen",label: "Benutzer & Rollen",  icon: "👥", end: false }] : []),
    ...(can("verwaltung")
      ? [{ to: "/admin/hierarchy",label: t("nav.admin"),       icon: "⚙️", end: false }] : []),
  ];

  const activeStyle = {
    background: "linear-gradient(135deg, var(--brand-600), #0891b2)",
    boxShadow: "0 4px 14px color-mix(in srgb, var(--brand-600) 35%, transparent)",
  };

  return (
    <div className="min-h-screen">
      {/* Dekorative Blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-blob bg-blob-3" />

      {/* Offline-Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-white"
          style={{ background: "#D13438" }}>
          <span>📡</span>
          <span>Keine Verbindung – Ansicht aus Cache. Änderungen nicht möglich.</span>
        </div>
      )}
      {backOnline && (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 text-sm font-medium text-white"
          style={{ background: "#107C10" }}>
          <span>✅</span>
          <span>Verbindung wiederhergestellt – Daten werden aktualisiert.</span>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside className="glass-sidebar hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 items-center py-4 gap-1" style={{ width: sidebarMode === "icon" ? 72 : 220, transition: "width 0.25s ease" }}>
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-5 shrink-0 cursor-pointer"
             onClick={() => navigate("/")}
             style={{ background: "var(--brand-500)" }}>
          <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-white">
            <rect x="2" y="8" width="16" height="6" rx="2" fill="currentColor" opacity="0.9"/>
            <rect x="5" y="5" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.6"/>
            <rect x="4" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
            <rect x="14" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
          </svg>
        </div>

        {/* Nav */}
        <nav className="flex flex-col items-center gap-0.5 flex-1 overflow-y-auto w-full px-2">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `relative group flex items-center gap-3 rounded-xl transition-all duration-150 ${
                  sidebarMode === "icon"
                    ? "justify-center w-10 h-10"
                    : "w-full px-3 py-2.5 justify-start"
                } ${isActive
                    ? "text-blue-700 font-medium"
                    : "text-slate-500 hover:text-slate-800 hover:bg-[#F3F2F1]"}`
              }
              style={({ isActive }) => isActive && sidebarMode === "full"
                ? { background: "rgba(37,99,235,0.08)", borderLeft: "2px solid #2563eb", borderRadius: "0 10px 10px 0" }
                : isActive && sidebarMode === "icon"
                ? { background: "rgba(37,99,235,0.1)", borderRadius: 10 }
                : {}}
              title={sidebarMode === "icon" ? label : ""}
            >
              <span className="text-base leading-none shrink-0">{icon}</span>
              {sidebarMode === "full" && (
                <span className="text-sm truncate">{label}</span>
              )}
              {sidebarMode === "icon" && (
                <span className="absolute left-14 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100"
                  style={{
                    transition: "opacity 25ms ease",
                    background: "rgba(255,255,255,0.85)",
                    backdropFilter: "blur(20px) saturate(1.5)",
                    WebkitBackdropFilter: "blur(20px) saturate(1.5)",
                    color: "#0f172a",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "7px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.9)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)",
                  }}>
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Nutzer + Aktionen */}
        <div className="flex flex-col gap-1 mt-2 pt-3 border-t border-white/60 w-full px-2">
          {/* Toggle-Button */}
          <button
            onClick={toggleSidebarMode}
            title={sidebarMode === "icon" ? "Erweiterte Navigation" : "Kompakte Navigation"}
            className={`flex items-center gap-3 rounded-xl text-slate-400 hover:bg-[#F3F2F1] hover:text-slate-700 transition-colors ${sidebarMode === "icon" ? "w-10 h-8 justify-center self-center" : "w-full px-3 py-2"}`}
          >
            <span className="text-base shrink-0">{sidebarMode === "icon" ? "⇥" : "⇤"}</span>
            {sidebarMode === "full" && <span className="text-xs font-medium">Kompakt</span>}
          </button>
          {/* Profil */}
          <button onClick={() => navigate("/profile")} title={user?.full_name ?? "Profil"}
            className={`flex items-center gap-3 rounded-xl hover:bg-[#F3F2F1] transition-colors ${sidebarMode === "icon" ? "w-10 h-10 justify-center self-center" : "w-full px-3 py-2"}`}
            style={{ background: sidebarMode === "icon" ? "var(--brand-100)" : undefined }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                 style={{ background: "var(--brand-100)", minWidth: 28 }}>
              <span className="text-xs font-bold" style={{ color: "var(--brand-700)" }}>
                {user?.full_name?.charAt(0) ?? "?"}
              </span>
            </div>
            {sidebarMode === "full" && (
              <div className="min-w-0 text-left">
                <div className="text-xs font-semibold text-slate-800 truncate">{user?.full_name}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">{user?.role_name}</div>
              </div>
            )}
          </button>
          {/* Kontrast */}
          <button onClick={toggleContrast} title={highContrast ? "Normal" : "Kontrast"}
            className={`flex items-center gap-3 rounded-xl text-slate-400 hover:bg-[#F3F2F1] hover:text-slate-700 transition-colors ${sidebarMode === "icon" ? "w-10 h-8 justify-center self-center" : "w-full px-3 py-2"}`}>
            <span className="text-base shrink-0">{highContrast ? "☀️" : "🌙"}</span>
            {sidebarMode === "full" && <span className="text-xs font-medium">{highContrast ? "Normal" : "Kontrast"}</span>}
          </button>
          {/* Abmelden */}
          <button onClick={() => { logout(); navigate("/login"); }} title="Abmelden"
            className={`flex items-center gap-3 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors ${sidebarMode === "icon" ? "w-10 h-8 justify-center self-center" : "w-full px-3 py-2"}`}>
            <span className="text-base shrink-0">↩</span>
            {sidebarMode === "full" && <span className="text-xs font-medium">Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Mobile Sidebar (beschriftet) ── */}
      <aside className={`glass-sidebar fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ width: 220 }}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/60">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: "var(--brand-500)" }}>
            <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-white">
              <rect x="2" y="8" width="16" height="6" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="5" y="5" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.6"/>
              <rect x="4" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
              <rect x="14" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
            </svg>
          </div>
          <div>
            <div className="font-display font-bold text-sm text-slate-900 leading-tight">{theme.appName}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">System</div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive ? "text-white" : "text-slate-600 hover:text-slate-900 hover:bg-[#F3F2F1]"
                }`
              }
              style={({ isActive }) => isActive ? activeStyle : {}}
            >
              <span className="text-base shrink-0">{icon}</span>
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/60 space-y-1">
          <button onClick={() => navigate("/profile")} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#F3F2F1] transition-colors text-left">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--brand-100)" }}>
              <span className="text-xs font-bold" style={{ color: "var(--brand-700)" }}>{user?.full_name?.charAt(0) ?? "?"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">{user?.full_name}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide truncate">{user?.role_name}</div>
            </div>
          </button>
          <div className="flex gap-1">
            <button onClick={toggleContrast} className="flex-1 h-8 px-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-[#F3F2F1] transition-colors">
              {highContrast ? "☀️ Normal" : "🌙 Kontrast"}
            </button>
            <button onClick={() => { logout(); navigate("/login"); }} className="flex-1 h-8 px-2 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
              {t("auth.logout")}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Topbar ── */}
      <header className="glass-topbar lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F3F2F1] transition-colors">
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: "var(--brand-500)" }}>
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-white">
              <rect x="2" y="8" width="16" height="6" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="5" y="5" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.6"/>
              <rect x="4" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
              <rect x="14" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
            </svg>
          </div>
          <span className="font-display font-bold text-sm text-slate-900 truncate">{theme.appName}</span>
        </div>
        <button onClick={() => navigate("/profile")} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--brand-100)" }}>
          <span className="text-xs font-bold" style={{ color: "var(--brand-700)" }}>{user?.full_name?.charAt(0) ?? "?"}</span>
        </button>
      </header>

      {/* ── Content ── */}
      <main className="lg:min-h-screen" style={{ paddingLeft: typeof window !== "undefined" && window.innerWidth >= 1024 ? (sidebarMode === "icon" ? 72 : 220) : 0, transition: "padding-left 0.25s ease" }}>
        <div className="px-5 py-6 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
      {(can("chat") || can("verwaltung")) && isActive("chat") && (
        <ChatWidget userId={user?.id ?? ""} userName={user?.full_name || user?.email || "?"} />
      )}
    </div>
  );
}
