module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs", "node_modules"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "react-hooks/exhaustive-deps": "error",
  },
  overrides: [
    {
      // Context providers and UI primitives export a hook or variants next
      // to the component on purpose.
      files: ["src/components/ui/**", "src/components/Toast.tsx", "src/hooks/**", "src/lib/**"],
      rules: { "react-refresh/only-export-components": "off" },
    },
  ],
};
