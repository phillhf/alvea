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
  primaryColor: "#0078D4",
  fontBody: "Plus Jakarta Sans",
  fontDisplay: "Bricolage Grotesque",
  bgImage: "",
  bgOpacity: 0.12,
  appName: "Alvea",
};

export const LOGIN_DEFAULTS: LoginThemeConfig = {
  primaryColor: "#0078D4",
  bgImage: "",
  bgOpacity: 0.15,
  panelColor: "#005A9E",
  panelHeadline: "Sauberkeit.\nOrganisiert.",
  panelSubtext: "Digitale Krankenhaus-Logistik – schnell, übersichtlich und zuverlässig.",
  panelFeature1: "🛏️ Bettenaufbereitung & Desinfektion",
  panelFeature2: "🧹 Zimmerreinigung & Schlussdesinfektion",
  panelFeature3: "📊 Berichte & Auswertungen",
  formHeadline: "Willkommen zurück",
  formSubtext: "Bitte melde dich an, um fortzufahren.",
};

/* ── Font presets ── */
// Alle Schriften werden lokal mitgeliefert (@fontsource) und erst bei Auswahl
// nachgeladen – keine Verbindung zu Google Fonts (Datenschutz, CSP, Offline-LAN).
// Das Standardpaar ist bereits in main.tsx eingebunden.
export const FONT_PAIRS: { label: string; body: string; display: string; load: () => Promise<unknown> }[] = [
  { label: "Jakarta + Bricolage (Standard)", body: "Plus Jakarta Sans", display: "Bricolage Grotesque",
    load: () => Promise.resolve() },
  { label: "DM Sans + Syne", body: "DM Sans", display: "Syne",
    load: () => Promise.all([
      import("@fontsource/dm-sans/400.css"), import("@fontsource/dm-sans/500.css"),
      import("@fontsource/dm-sans/600.css"), import("@fontsource/dm-sans/700.css"),
      import("@fontsource/syne/600.css"), import("@fontsource/syne/700.css"), import("@fontsource/syne/800.css"),
    ]) },
  { label: "Nunito + Righteous", body: "Nunito", display: "Righteous",
    load: () => Promise.all([
      import("@fontsource/nunito/400.css"), import("@fontsource/nunito/500.css"),
      import("@fontsource/nunito/600.css"), import("@fontsource/nunito/700.css"),
      import("@fontsource/righteous/400.css"),
    ]) },
  { label: "Poppins + Montserrat", body: "Poppins", display: "Montserrat",
    load: () => Promise.all([
      import("@fontsource/poppins/400.css"), import("@fontsource/poppins/500.css"),
      import("@fontsource/poppins/600.css"), import("@fontsource/poppins/700.css"),
      import("@fontsource/montserrat/600.css"), import("@fontsource/montserrat/700.css"), import("@fontsource/montserrat/800.css"),
    ]) },
  { label: "IBM Plex Sans + Outfit", body: "IBM Plex Sans", display: "Outfit",
    load: () => Promise.all([
      import("@fontsource/ibm-plex-sans/400.css"), import("@fontsource/ibm-plex-sans/500.css"),
      import("@fontsource/ibm-plex-sans/600.css"), import("@fontsource/ibm-plex-sans/700.css"),
      import("@fontsource/outfit/600.css"), import("@fontsource/outfit/700.css"), import("@fontsource/outfit/800.css"),
    ]) },
  { label: "Inter + Space Grotesk", body: "Inter", display: "Space Grotesk",
    load: () => Promise.all([
      import("@fontsource/inter/400.css"), import("@fontsource/inter/500.css"),
      import("@fontsource/inter/600.css"), import("@fontsource/inter/700.css"),
      import("@fontsource/space-grotesk/500.css"), import("@fontsource/space-grotesk/600.css"), import("@fontsource/space-grotesk/700.css"),
    ]) },
];

/* ── Color presets ── */
export const COLOR_PRESETS = [
  { label: "Fluent-Blau (Standard)", value: "#0078D4" },
  { label: "Teal",            value: "#0d9488" },
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
  pair.load().catch(() => { /* Fallback: system-ui */ });
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
