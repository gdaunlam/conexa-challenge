module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.cjs', 'dist', 'node_modules', 'coverage'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  // La barrera contra `.only`/`fit`/`fdescribe` aplica SOLO a los specs.
  // La regla vivia en el bloque global pero su selector
  // `CallExpression[callee.property.name='only']` matcheaba cualquier
  // CallExpression con propiedad `only` en produccion (ej. `arr.only()`),
  // rompiendo lint sin que sea un `.only` de Jest. El grep en
  // `.husky/pre-push` + la regla limitada a specs son las dos barreras
  // reales. `forbidOnly` (Jest 30+) se agregara cuando se suba la version.
  overrides: [
    {
      files: ['*.spec.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "CallExpression[callee.property.name='only']",
            message:
              'No uses `.only()` en tests: silencia el resto de la suite y `pnpm test` pasa igual. Remové el `.only` antes de commitear.',
          },
          {
            selector:
              "CallExpression[callee.computed=true][callee.property.value='only']",
            message:
              'No uses `[\'only\'](...)` en tests: silencia el resto de la suite. Remové el `.only` antes de commitear.',
          },
          {
            selector: "CallExpression[callee.name='fit']",
            message:
              'No uses `fit(...)` en tests: es shortcut de `it.only(...)` y silencia el resto de la suite. Removélo antes de commitear.',
          },
          {
            selector: "CallExpression[callee.name='fdescribe']",
            message:
              'No uses `fdescribe(...)` en tests: es shortcut de `describe.only(...)` y silencia el resto de la suite. Removélo antes de commitear.',
          },
        ],
      },
    },
  ],
};
