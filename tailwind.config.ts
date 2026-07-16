import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        brand: {
          50: "#eefbf8",
          100: "#d5f5ee",
          500: "#14a38b",
          600: "#0d806e",
          700: "#0c665a",
        },
      },
      boxShadow: { panel: "0 12px 35px -18px rgb(23 33 43 / 0.3)" },
    },
  },
  plugins: [],
} satisfies Config;
