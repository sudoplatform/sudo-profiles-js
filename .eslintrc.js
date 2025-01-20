module.exports = {
  root: true,
  overrides: [
    {
      files: ['*.js'],
      extends: 'eslint:recommended',
      parserOptions: { ecmaVersion: 2018 },
      env: { node: true },
    },
    {
      files: ['**/*.ts'],
      excludedFiles: ['**/*.spec.ts'],
      plugins: ['@typescript-eslint', 'import', 'prettier', 'tree-shaking'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
      },
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'prettier',
        'plugin:prettier/recommended',
      ],
      rules: {
        // Disallow `any`.  (This is overridden for test files, below)
        '@typescript-eslint/no-explicit-any': 'error',

        // Allow "newspaper" code structure
        '@typescript-eslint/no-use-before-define': 'off',

        // Allow property definition of prop: string = ""
        // instead of inferred type such as prop = ""
        '@typescript-eslint/no-inferrable-types': 'off',

        // Allow TS convention of ignoring args
        // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#flag-unused-declarations-with---nounusedparameters-and---nounusedlocals
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_' },
        ],

        // Soften eslint defaults so that callbacks don't need to be as verbose
        '@typescript-eslint/explicit-function-return-type': [
          'error',
          {
            allowExpressions: true,
            allowTypedFunctionExpressions: true,
          },
        ],

        // Allow use of unbound static methods
        '@typescript-eslint/unbound-method': [
          'error',
          {
            ignoreStatic: true,
          },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        'tree-shaking/no-side-effects-in-initialization': 2,
      },
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['test/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: `${__dirname}/tsconfig.test.json`,
      },
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'prettier',
        'plugin:prettier/recommended',
      ],
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/restrict-plus-operands': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],
}
