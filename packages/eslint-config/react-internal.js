import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { createBaseConfig } from "./base.js";
import { sharedReactRules } from "./rules.js";

/**
 * Base config plus React rules, for internal React packages (not Next apps).
 *
 * @param {{ tsconfigPath?: string; ignores?: string[] }} [options]
 * @returns {import('eslint').Linter.Config[]}
 */
export function createReactInternalConfig(options = {}) {
  return [
    ...createBaseConfig(options),
    {
      files: ["**/*.{jsx,tsx}"],
      ...react.configs.flat.recommended,
      languageOptions: {
        ...react.configs.flat.recommended.languageOptions,
        globals: { ...globals.browser, ...globals.serviceworker },
      },
      // "detect" calls context.getFilename, which ESLint 10 removed.
      settings: { react: { version: "19.3" } },
    },
    reactHooks.configs.flat.recommended,
    {
      rules: sharedReactRules,
    },
  ];
}

export default createReactInternalConfig();
