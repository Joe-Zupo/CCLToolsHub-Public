import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";

import { sharedReactRules, sharedTypeScriptRules } from "./rules.js";

/**
 * Config for Next.js apps (core web vitals + TypeScript). eslint-config-next
 * loads `next` at runtime, so only use it from a package that depends on `next`.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      ...sharedTypeScriptRules,
      ...sharedReactRules,
    },
  },
]);
