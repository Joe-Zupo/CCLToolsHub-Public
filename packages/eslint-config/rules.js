/** @type {import('eslint').Linter.RulesRecord} */
export const sharedTypeScriptRules = {
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      args: "none",
      varsIgnorePattern: "^React$|^_",
      caughtErrorsIgnorePattern: "^_|^err|^error",
      ignoreRestSiblings: true,
    },
  ],
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-empty-object-type": "off",
};

/** @type {import('eslint').Linter.RulesRecord} */
export const sharedReactRules = {
  "react/react-in-jsx-scope": "off",
  "react/prop-types": "off",
  "react-hooks/exhaustive-deps": "off",
  "react-hooks/immutability": "off",
  "react-hooks/incompatible-library": "off",
  "react-hooks/refs": "off",
  "react-hooks/set-state-in-effect": "off",
};
