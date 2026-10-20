import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

/* ── Types ── */
export interface ThemeConfig {
  primaryColor: string;
  fontBody: string;
  fontDisplay: string;
  bgImage: string;
  bgOpacity: number;
  appName: string;
}

export interface LoginThemeConfig {
  primaryColor: string;
  bgImage: string;
  bgOpacity: number;
  panelColor: string;
  panelHeadline: string;
  panelSubtext: string;
  panelFeature1: string;
  panelFeature2: string;
  panelFeature3: string;
  formHeadline: string;
  formSubtext: string;
}

export const APP_DEFAULTS: ThemeConfig = {
  primaryColor: "#0d9488",
  fontBody: "Plus Jakarta Sans",
  fontDisplay: "Bricolage Grotesque",
  bgImage: "",
  bgOpacity: 0.12,
  appName: "Alvea",
};

export const LOGIN_DEFAULTS: LoginThemeConfig = {
  primaryColor: "#0d9488",
  bgImage: "",
  bgOpacity: 0.15,
  panelColor: "#0f766e",
  panelHeadline: "Sauberkeit.\nOrganisiert.",
  panelSubtext: "Digitale Verwaltung der Bettenaufbereitung und Entlassreinigung – schnell, übersichtlich und zuverlässig.",
  panelFeature1: "🛏️ Bettenaufbereitung & Desinfektion",
  panelFeature2: "🧹 Zimmerreinigung & Schlussdesinfektion",
  panelFeature3: "📊 Berichte & Auswertungen",
  formHeadline: "Willkommen zurück",
  formSubtext: "Bitte melde dich an, um fortzufahren.",
};

/* ── Font presets ── */
export const FONT_PAIRS = [
  { label: "Jakarta + Bricolage (Standard)", body: "Plus Jakarta Sans", display: "Bricolage Grotesque",
    googleUrl: "family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800" },
  { label: "DM Sans + Syne", body: "DM Sans", display: "Syne",
    googleUrl: "family=DM+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800" },
  { label: "Nunito + Righteous", body: "Nunito", display: "Righteous",
    googleUrl: "family=Nunito:wght@400;500;600;700&family=Righteous" },
  { label: "Poppins + Montserrat", body: "Poppins", display: "Montserrat",
    googleUrl: "family=Poppins:wght@400;500;600;700&family=Montserrat:wght@600;700;800" },
  { label: "IBM Plex Sans + Outfit", body: "IBM Plex Sans", display: "Outfit",
    googleUrl: "family=IBM+Plex+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800" },
  { label: "Inter + Space Grotesk", body: "Inter", display: "Space Grotesk",
    googleUrl: "family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700" },
];

/* ── Color presets ── */
export const COLOR_PRESETS = [
  { label: "Teal (Standard)", value: "#0d9488" },
  { label: "Blau",            value: "#2563eb" },
  { label: "Indigo",          value: "#4f46e5" },
  { label: "Violett",         value: "#7c3aed" },
  { label: "Rose",            value: "#e11d48" },
  { label: "Orange",          value: "#ea580c" },
  { label: "Grün",            value: "#16a34a" },
  { label: "Slate",           value: "#475569" },
];

/* ── Hex → HSL-Shaden ── */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max+min)/2;
  if (max !== min) {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){ case r: h=((g-b)/d+(g<b?6:0))/6; break; case g: h=((b-r)/d+2)/6; break; case b: h=((r-g)/d+4)/6; break; }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

export function applyAppTheme(cfg: ThemeConfig) {
  const r = document.documentElement;
  const [h,s,l] = hexToHsl(cfg.primaryColor);
  r.style.setProperty("--brand-50",  `hsl(${h},${Math.min(s+10,100)}%,${Math.min(l+40,97)}%)`);
  r.style.setProperty("--brand-100", `hsl(${h},${Math.min(s+8,100)}%,${Math.min(l+32,95)}%)`);
  r.style.setProperty("--brand-400", `hsl(${h},${s}%,${Math.min(l+12,80)}%)`);
  r.style.setProperty("--brand-500", `hsl(${h},${s}%,${Math.min(l+5,70)}%)`);
  r.style.setProperty("--brand-600", `hsl(${h},${s}%,${l}%)`);
  r.style.setProperty("--brand-700", `hsl(${h},${s}%,${Math.max(l-8,10)}%)`);
  r.style.setProperty("--brand-800", `hsl(${h},${s}%,${Math.max(l-16,8)}%)`);
  r.style.setProperty("--font-body",    `'${cfg.fontBody}', system-ui, sans-serif`);
  r.style.setProperty("--font-display", `'${cfg.fontDisplay}', system-ui, sans-serif`);
  r.style.setProperty("--bg-image",   cfg.bgImage ? `url('${cfg.bgImage}')` : "none");
  r.style.setProperty("--bg-opacity", `${cfg.bgOpacity}`);

  const pair = FONT_PAIRS.find(p => p.body === cfg.fontBody) ?? FONT_PAIRS[0];
  let link = document.getElementById("dynamic-font") as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = "dynamic-font"; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?${pair.googleUrl}&display=swap`;
}

/* ── Context ── */
interface ThemeCtx {
  theme: ThemeConfig;
  loginTheme: LoginThemeConfig;
  setTheme: (t: ThemeConfig) => Promise<void>;
  setLoginTheme: (t: LoginThemeConfig) => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ThemeCtx>({
  theme: APP_DEFAULTS, loginTheme: LOGIN_DEFAULTS,
  setTheme: async () => {}, setLoginTheme: async () => {},
  loading: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(APP_DEFAULTS);
  const [loginTheme, setLoginThemeState] = useState<LoginThemeConfig>(LOGIN_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000); // 5s Timeout

    fetch("/api/theme", { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const t = { ...APP_DEFAULTS,   ...(data.theme_config       ?? {}) };
        const l = { ...LOGIN_DEFAULTS, ...(data.login_theme_config ?? {}) };
        setThemeState(t);
        setLoginThemeState(l);
        applyAppTheme(t);
      })
      .catch(() => applyAppTheme(APP_DEFAULTS))
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  const setTheme = useCallback(async (t: ThemeConfig) => {
    await api.patch("/settings/theme_config", { value: JSON.stringify(t) });
    setThemeState(t); applyAppTheme(t);
  }, []);

  const setLoginTheme = useCallback(async (t: LoginThemeConfig) => {
    await api.patch("/settings/login_theme_config", { value: JSON.stringify(t) });
    setLoginThemeState(t);
  }, []);

  return <Ctx.Provider value={{ theme, loginTheme, setTheme, setLoginTheme, loading }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
