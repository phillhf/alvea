// Service Worker registrieren und Updates verwalten
export function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");

      // Update erkennen
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Neuer SW bereit – sofort aktivieren
            newWorker.postMessage("skipWaiting");
          }
        });
      });

      // Nach SW-Wechsel Seite neu laden
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      console.log("[SW] registriert");
    } catch (e) {
      console.warn("[SW] Fehler:", e);
    }
  });
}
