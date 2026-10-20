/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#EFF6FC",
          100: "#DEECF9",
          200: "#C7E0F4",
          400: "#2B88D8",
          500: "#0078D4",
          600: "#106EBE",
          700: "#005A9E",
          800: "#004578",
          900: "#003258",
        },
        status: {
          free:   "#64748b",
          clean:  "#f59e0b",
          disinf: "#8b5cf6",
          review: "#0ea5e9",
          ok:     "#10b981",
          danger: "#ef4444",
        },
      },
      fontFamily: {
        sans:    ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "card-md": "0 2px 6px -1px rgb(0 0 0 / 0.08)",
        "card-hover": "0 2px 8px -1px rgb(0 0 0 / 0.1)",
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.625rem",
      },
    },
  },
  plugins: [],
};
