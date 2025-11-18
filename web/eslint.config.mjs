import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import react from 'eslint-plugin-react';
import unusedImports from 'eslint-plugin-unused-imports';
import _import from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  // Global ignores
  {
    ignores: [
      '.now/*',
      '**/*.css',
      '**/.changeset',
      '**/dist',
      'esm/*',
      'public/*',
      'tests/*',
      'scripts/*',
      '**/*.config.js',
      '**/.DS_Store',
      '**/node_modules',
      '**/coverage',
      '**/.next',
      '**/build',
      '**/out',
      'src/generated/**/*',
      'prisma/generated/**/*',
      '**/prisma/index.d.ts',
      '!**/.commitlintrc.cjs',
      '!**/.lintstagedrc.cjs',
      '!**/jest.config.js',
      '!**/plopfile.js',
      '!**/react-shim.js',
      '!**/tsup.config.ts',
    ],
  },
  // Main config
  ...fixupConfigRules(
    compat.extends(
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'next',
      'next/core-web-vitals'
    )
  ),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],

    plugins: {
      '@typescript-eslint': fixupPluginRules(tsPlugin),
      'unused-imports': unusedImports,
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: 'module',

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: 'detect',
      },
    },

    rules: {
      // Disable or downgrade blocking rules
      'no-console': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'no-unreachable': 'warn',
      'no-useless-catch': 'warn',
      'no-constant-binary-expression': 'warn',

      // React rules
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'jsx-a11y/alt-text': 'warn',

      // TypeScript rules - all warnings
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Next.js rules
      '@next/next/no-img-element': 'off',

      // Prettier - off to not block builds
      'prettier/prettier': 'off',

      // Unused imports - off
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'off',
    },
  },
];
