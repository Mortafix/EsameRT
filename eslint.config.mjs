import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "node_modules/**",
    "venv/**",
    ".venv/**",
    "**/__pycache__/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "data/official-2026/generated/**",
  ]),
]);
