import { configApp } from '@adonisjs/eslint-config'

export default configApp({
  files: ['**/*.ts'],
  rules: {
    /**
     * This project uses UPPER_SNAKE_CASE for enums (e.g. USER_LEVEL_ENUM,
     * ACTIVITY_TYPE_ENUM), matching its constants convention. Allow it
     * alongside PascalCase. The remaining selectors mirror the AdonisJS
     * defaults so they are not lost when this rule is overridden.
     */
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
      // Destructured names often mirror snake_case API/DB shapes (e.g. request.body()).
      { selector: 'variable', modifiers: ['destructured'], format: null },
      { selector: 'enum', format: ['PascalCase', 'UPPER_CASE'] },
      { selector: 'typeLike', format: ['PascalCase'] },
      { selector: 'class', format: ['PascalCase'] },
      { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
    ],

    /**
     * Allow `== null` / `!= null` as an intentional shorthand for checking
     * both null and undefined (used in Lucid column `prepare` callbacks).
     * Strict equality is still required everywhere else.
     */
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
  },
})
