import { createRequire } from "node:module";

import { baseConfig } from "./base.js";

const require = createRequire(import.meta.url);

/** @type {import('prettier').Config} */
const config = {
  ...baseConfig,
  endOfLine: "auto",
  importOrder: [
    "<THIRD_PARTY_MODULES>",
    "",
    "^@repo/(.*)$",
    "",
    "^[./]",
  ],
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  plugins: [require.resolve("@ianvs/prettier-plugin-sort-imports")],
};

export default config;
