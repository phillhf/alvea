import { lazy, Suspense, useState } from "react";

const O2LagerTab    = lazy(() => import("./O2LagerTab"));
const O2TypenTab    = lazy(() => import("./O2TypenTab"));
const O2FlaschenTab = lazy(() => import("./O2FlaschenTab"));

type Sub = "lager" | "typen" | "flaschen";
const SUBS: { key: Sub; label: string }[] = [
  { key: "lager",    label: "Lager"       },
  { key: "typen",    label: "Flaschentypen" },
  { key: "flaschen", label: "Flaschen"    },
];

function Loader() {
  return <div className="flex items-center gap-2 py-6 text-slate-400 text-sm">
    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
    Wird geladen…
  </div>;
}

export default function O2Tab() {
  const [sub, setSub] = useState<Sub>("lager");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {SUBS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              sub === s.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}>
            {s.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<Loader />}>
        {sub === "lager"    && <O2LagerTab />}
        {sub === "typen"    && <O2TypenTab />}
        {sub === "flaschen" && <O2FlaschenTab />}
      </Suspense>
    </div>
  );
}
