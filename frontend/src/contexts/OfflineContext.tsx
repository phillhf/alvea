import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface OfflineCtx {
  isOnline: boolean;
  backOnline: boolean;
  lastOnlineAt: Date | null;
}

const Ctx = createContext<OfflineCtx>({
  isOnline: true,
  backOnline: false,
  lastOnlineAt: null,
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline]     = useState(navigator.onLine);
  const [backOnline, setBackOnline] = useState(false);
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(null);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setBackOnline(true);
      setLastOnlineAt(new Date());
      setTimeout(() => setBackOnline(false), 3500);
      // API-Cache nach Reconnect leeren – frische Daten holen
      navigator.serviceWorker?.controller?.postMessage("clearApiCache");
    };
    const goOffline = () => {
      setIsOnline(false);
      setBackOnline(false);
    };

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <Ctx.Provider value={{ isOnline, backOnline, lastOnlineAt }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOnlineStatus() {
  return useContext(Ctx);
}
