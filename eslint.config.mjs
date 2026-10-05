import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // BKLit UI chart source installed with the shadcn CLI (`shadcn add @bklit/...`).
    // Vendored third-party code: not linted here. Only the two local edits we made
    // (no `dark:` classes, a fixed import path) differ from the registry copy.
    "src/components/charts/**",
    "src/components/shimmering-text.tsx",
  ]),
]);

export default eslintConfig;
