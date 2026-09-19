import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#07111f",
        "ink-soft": "#0f1b2e",
        "ink-line": "#1c2940",
        slate: {
          DEFAULT: "#9aa8bf",
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617"
        },
        mist: "#d8e1ef",
        accent: "#7cc4ff",
        success: "#86d2a7"
      },
      boxShadow: {
        panel: "0 12px 40px rgba(2, 8, 23, 0.35)"
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgba(154, 168, 191, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(154, 168, 191, 0.08) 1px, transparent 1px)"
      },
      animation: {
        rise: "rise 700ms ease-out forwards"
      },
      keyframes: {
        rise: {
          "0%": {
            opacity: "0",
            transform: "translateY(18px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        }
      }
    }
  },
  plugins: []
};

export default config;
