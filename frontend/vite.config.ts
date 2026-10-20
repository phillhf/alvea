import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:37843",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React-Core
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // i18n
          "vendor-i18n": ["i18next", "react-i18next"],
          // HTTP
          "vendor-axios": ["axios"],
          // Barcode-Scanner (gross – eigener Chunk)
          "vendor-zxing": ["@zxing/browser", "@zxing/library"],
          // Admin-Seite (2800 Zeilen – eigener Chunk via Lazy)
          // Reports und BedZentral sind bereits durch React.lazy getrennt
        },
      },
    },
  },
});
