import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { theme, loginTheme } = useTheme();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@openclinic.local");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try { await login(email, password); nav("/"); }
    catch { setErr(t("auth.invalid")); }
    finally { setLoading(false); }
  }

  const panel  = loginTheme.panelColor  || "#0f766e";
  const accent = loginTheme.primaryColor || theme.primaryColor;

  const hasBg = Boolean(loginTheme.bgImage);

  return (
    <div
      className="min-h-screen flex items-stretch relative overflow-hidden"
      style={hasBg ? {
        backgroundImage: `url('${loginTheme.bgImage}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      } : {}}
    >
      {/* Abdunkelungs-Overlay – steuert wie stark das Bild durchscheint */}
      {hasBg && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ backgroundColor: `rgba(0,0,0,${1 - loginTheme.bgOpacity - 0.3})` }}
        />
      )}

      {/* Left decorative panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 p-10 relative overflow-hidden z-10"
        style={{ backgroundColor: hasBg ? panel + "cc" : panel }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <BedIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-semibold text-white text-lg tracking-tight">
              {theme.appName}
            </span>
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold text-white leading-tight mb-4"
                style={{ whiteSpace: "pre-line" }}>
              {loginTheme.panelHeadline}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              {loginTheme.panelSubtext}
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-3">
          {[loginTheme.panelFeature1, loginTheme.panelFeature2, loginTheme.panelFeature3]
            .filter(Boolean)
            .map((label) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div
        className="flex-1 flex items-center justify-center p-6 relative z-10"
        style={hasBg ? { backgroundColor: "rgba(248,250,252,0.85)", backdropFilter: "blur(12px)" } : { backgroundColor: "rgb(248,250,252)" }}
      >
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent }}>
              <BedIcon className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-semibold text-slate-900 dark:text-white">
              {theme.appName}
            </span>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white mb-1">
              {loginTheme.formHeadline}
            </h2>
            <p className="text-slate-500 text-sm">{loginTheme.formSubtext}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.email")}</label>
              <input className="input" type="text" value={email} autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)}
                     autoFocus required
                     placeholder="Benutzername" />
            </div>
            <div>
              <label className="label">{t("auth.password")}</label>
              <input className="input" type="password" value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     required autoComplete="current-password"
                     placeholder="••••••••" />
            </div>

            {err && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30
                              border border-red-100 dark:border-red-900/40 rounded-md px-3.5 py-2.5">
                <span>⚠️</span><span>{err}</span>
              </div>
            )}

            <button
              className="w-full mt-2 btn text-white active:scale-[0.98]"
              style={{ backgroundColor: accent }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Anmelden…
                </span>
              ) : t("auth.login")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function BedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="8" width="16" height="6" rx="2" fill="currentColor" opacity="0.9"/>
      <rect x="5" y="5" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.6"/>
      <rect x="4" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="14" y="14" width="2" height="3" rx="1" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}
