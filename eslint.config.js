import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    // Source files
    rules: {
      // codascon uses `any` intentionally in internal type machinery
      // (AnyCommand, Visit return types, etc.)
      "@typescript-eslint/no-explicit-any": "off",

      // Unused parameters are common in abstract/interface implementations;
      // prefix with _ to suppress per-site
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "all",
          argsIgnorePattern: "^_|^subject$|^object$",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Test files — relax rules that fire on intentional test patterns
    files: ["**/*.test.ts"],
    rules: {
      // Tests deliberately declare unused vars/params for compile-time checks,
      // unused visit-method params, and _T1/_14a/etc. assertion fixtures
      "@typescript-eslint/no-unused-vars": "off",

      // `const self = this` is used in VoidCommand to capture this in a closure
      "@typescript-eslint/no-this-alias": "off",

      // BadSubjectCommand intentionally uses `{}` as a base type to test
      // the "Subject not extending Subject base class" constraint
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/fixtures/**"],
  },
);
