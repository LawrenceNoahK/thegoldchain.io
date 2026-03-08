import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gc: {
          bg: "#020A04",
          panel: "#030D05",
          green: "#00FF41",
          "green-mid": "#00C032",
          "green-dim": "#007A1F",
          "green-muted": "#1A4020",
          gold: "#D4A800",
          amber: "#FFB800",
          cyan: "#00FFD1",
          lime: "#A8FF3E",
          red: "#FF3131",
          border: "#0D3015",
        },
      },
      fontFamily: {
        mono: ["Fira Code", "Share Tech Mono", "monospace"],
        vt: ["VT323", "monospace"],
        share: ["Share Tech Mono", "monospace"],
      },
      borderRadius: {
        gc: "2px",
      },
      animation: {
        blink: "blink 1.1s step-end infinite",
        scanline: "scanH 10s linear infinite",
        flicker: "flicker 8s infinite",
        "shimmer-bar": "progressShimmer 2s linear infinite",
        "tx-in": "txIn 0.3s ease",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        scanH: {
          "0%": { top: "-2px" },
          "100%": { top: "100vh" },
        },
        flicker: {
          "0%, 97%, 100%": { opacity: "1" },
          "98%": { opacity: "0.7" },
          "99%": { opacity: "0.9" },
        },
        progressShimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        txIn: {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
