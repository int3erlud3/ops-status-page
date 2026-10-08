import js from '@eslint/js';
import nounsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  nounsanitized.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      // DOM sinks that could turn data into markup are forbidden outright
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'use textContent / createElement' },
        { property: 'outerHTML', message: 'use textContent / createElement' },
        { property: 'insertAdjacentHTML', message: 'use createElement' },
        { object: 'document', property: 'write', message: 'not allowed' },
      ],
    },
  },
  { files: ['public/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  { files: ['bin/**/*.js', 'src/**/*.js', 'tests/**/*.js', 'eslint.config.js'], languageOptions: { globals: { ...globals.node } } },
];
