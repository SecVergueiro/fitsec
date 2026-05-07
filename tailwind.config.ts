import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--background)",
        text: "var(--text)",
        primary: "var(--primary)",
        secondary: "var(--secondary)",
        accent: "var(--accent)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        surface: "var(--surface)",
        border: "var(--border)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Escala que voce mandou (em rem)
        xs: ["0.75rem", { lineHeight: "1.4" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.333rem", { lineHeight: "1.3" }],   // h5
        "2xl": ["1.777rem", { lineHeight: "1.2" }], // h4
        "3xl": ["2.369rem", { lineHeight: "1.15" }], // h3
        "4xl": ["3.158rem", { lineHeight: "1.1" }],  // h2
        "5xl": ["4.21rem", { lineHeight: "1.05" }],  // h1
      },
    },
  },
  plugins: [],
};

export default config;
