import { useState, useEffect, useCallback } from "react";

export function useLastUpdated() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [label, setLabel] = useState("");

  const touch = useCallback(() => setLastUpdated(new Date()), []);

  useEffect(() => {
    function update() {
      if (!lastUpdated) { setLabel(""); return; }
      const secs = Math.round((Date.now() - lastUpdated.getTime()) / 1000);
      if (secs < 5)   setLabel("Gerade aktualisiert");
      else if (secs < 60) setLabel(`Vor ${secs} Sek. aktualisiert`);
      else setLabel(`Vor ${Math.round(secs / 60)} Min. aktualisiert`);
    }
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  return { touch, label, lastUpdated };
}
