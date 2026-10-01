const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["lib/**", "coverage/**", ".coverage/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: { sourceType: "commonjs" },
  },
];
