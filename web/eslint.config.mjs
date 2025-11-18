import { defineConfig } from 'eslint/config';
import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import react from 'eslint-plugin-react';
import unusedImports from 'eslint-plugin-unused-imports';
import _import from 'eslint-plugin-import';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import jsxA11Y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
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

export default defineConfig([
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
      // Ignore generated files
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
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],

    extends: fixupConfigRules(
      compat.extends(
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended'
      )
    ),

    plugins: {
      react: fixupPluginRules(react),
      'unused-imports': unusedImports,
      import: fixupPluginRules(_import),
      '@typescript-eslint': typescriptEslint,
      prettier: fixupPluginRules(prettier),
    },

    languageOptions: {
      globals: {
        ...Object.fromEntries(
          Object.entries(globals.browser).map(([key]) => [key, 'off'])
        ),
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 12,
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
      // Console warnings
      'no-console': 'warn',

      // React rules
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/exhaustive-deps': 'warn', // Keep as warning, not off

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error
      '@typescript-eslint/explicit-function-return-type': 'off', // Allow implicit return types
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Allow implicit parameter types

      // Prettier
      'prettier/prettier': [
        'warn',
        {
          endOfLine: 'auto',
        },
      ],

      // Unused imports
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
    },
  },
]);
