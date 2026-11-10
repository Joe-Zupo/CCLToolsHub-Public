import { createRequire } from "node:module";

import { baseConfig } from "./base.js";

const require = createRequire(import.meta.url);

/** @type {import('prettier').Config} */
const config = {
  ...baseConfig,
  endOfLine: "auto",
  importOrder: [
    "^(react/(.*)$)|^(react$)",
    "^(next/(.*)$)|^(next$)",
    "",
    "<THIRD_PARTY_MODULES>",
    "",
    "^@repo/(.*)$",
    "",
    "^@/(.*)$",
    "",
    "^[./]",
  ],
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  plugins: [
    require.resolve("@ianvs/prettier-plugin-sort-imports"),
    require.resolve("prettier-plugin-tailwindcss"),
  ],
};

export default config;
