import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.astro/**',
      '.vercel/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'src/data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch {}` without a binding is ES2019; the ES5-safe scripts under
          // public/ must bind the error even when they deliberately ignore it.
          caughtErrorsIgnorePattern: '^(_|e|error)$',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}', 'tests/**/*'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.astro'],
    rules: {
      // Astro components frequently declare props that the template consumes.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    /**
     * Files under `public/` are served verbatim — no bundler, no transpiler,
     * no module scope. They are written in conservative ES5-compatible style on
     * purpose (`var`, IIFEs, no optional chaining) so they execute identically
     * everywhere, including inside the service worker and before hydration.
     */
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      'no-console': 'off',
    },
  }
);
