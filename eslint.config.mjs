import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "coverage/**",
      "desktop-dist/**",
      "playwright-report/**",
      "release/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  prettier,
];

export default config;
