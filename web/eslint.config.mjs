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
        'plugin:prettier/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended',
        'plugin:@next/next/recommended'
      )
    ),

    plugins: {
      react: fixupPluginRules(react),
      'unused-imports': unusedImports,
      import: fixupPluginRules(_import),
      '@typescript-eslint': typescriptEslint,
      'jsx-a11y': fixupPluginRules(jsxA11Y),
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
      'react-hooks/exhaustive-deps': 'off',
      'react/self-closing-comp': 'warn',

      // Fix styled-jsx and other unknown properties
      'react/no-unknown-property': [
        'error',
        {
          ignore: ['jsx', 'global'],
        },
      ],

      // Accessibility - make most rules warnings instead of errors
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/anchor-is-valid': [
        'warn',
        {
          components: ['Link'],
          specialLink: ['hrefLeft', 'hrefRight'],
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      'jsx-a11y/no-autofocus': 'warn',

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

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_.*?$',
          varsIgnorePattern: '^_.*?$',
        },
      ],

      // Import order
      'import/order': [
        'warn',
        {
          groups: [
            'type',
            'builtin',
            'object',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],

          pathGroups: [
            {
              pattern: '~/**',
              group: 'external',
              position: 'after',
            },
          ],

          'newlines-between': 'always',
        },
      ],

      // JSX prop sorting
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          noSortAlphabetically: false,
          reservedFirst: true,
        },
      ],

      // Padding between statements
      'padding-line-between-statements': [
        'warn',
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
        {
          blankLine: 'always',
          prev: ['const', 'let', 'var'],
          next: '*',
        },
        {
          blankLine: 'any',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
      ],
    },
  },
]);
