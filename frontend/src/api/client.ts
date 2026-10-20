import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Schreiboperationen offline blockieren
  const method = (config.method ?? "get").toUpperCase();
  const isMutation = ["POST","PUT","PATCH","DELETE"].includes(method);
  if (isMutation && !navigator.onLine) {
    return Promise.reject(
      Object.assign(new Error("offline"), { isOfflineError: true })
    );
  }

  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/** Gibt true zurück wenn der Fehler ein Offline-Fehler ist */
export function isOfflineError(err: unknown): boolean {
  return (
    (err as any)?.isOfflineError === true ||
    (err as any)?.response?.data?.error === "offline" ||
    (err as any)?.code === "ERR_NETWORK"
  );
}
