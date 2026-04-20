/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        surface: {
          DEFAULT: "#030303",
          1: "#080808",
          2: "#0d0d0d",
          3: "#131313",
          4: "#181818",
        },
        edge: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          light: "rgba(255, 255, 255, 0.1)",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        "glow": "0 0 20px rgba(16, 185, 129, 0.15)",
        "glow-lg": "0 0 40px rgba(16, 185, 129, 0.2), 0 0 80px rgba(16, 185, 129, 0.05)",
        "glow-inset": "inset 0 1px 0 rgba(16, 185, 129, 0.1)",
        "elevated": "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)",
      },
    },
  },
  plugins: [],
};
