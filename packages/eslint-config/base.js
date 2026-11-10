import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

import { sharedTypeScriptRules } from "./rules.js";

export { sharedReactRules, sharedTypeScriptRules } from "./rules.js";

const defaultIgnores = [
  "node_modules/**",
  "dist/**",
  "**/generated/**",
  "*.js",
  "*.mjs",
];

/**
 * Type-aware TypeScript config for Node and library packages.
 *
 * @param {{ tsconfigPath?: string; ignores?: string[] }} [options]
 * @returns {import('eslint').Linter.Config[]}
 */
export function createBaseConfig(options = {}) {
  const { tsconfigPath = "./tsconfig.json", ignores = defaultIgnores } =
    options;

  return [
    { ignores },
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      rules: {
        "no-unused-vars": "off",
      },
    },
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          project: tsconfigPath,
        },
      },
      plugins: {
        "@typescript-eslint": tseslint,
      },
      rules: {
        ...tseslint.configs.recommended.rules,
        ...sharedTypeScriptRules,
      },
    },
    prettierConfig,
  ];
}

export default createBaseConfig();
