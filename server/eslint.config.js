// server/eslint.config.js
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/__tests__/**', 'dist/**', 'node_modules/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // ── TypeScript 핵심 규칙 ──────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',          // any 사용 경고
      '@typescript-eslint/no-unused-vars': ['warn', {        // 미사용 변수 경고
        argsIgnorePattern: '^_',                              // _로 시작하면 무시
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',                     // catch(_error) 무시
      }],
      '@typescript-eslint/explicit-function-return-type': 'off', // 반환 타입 생략 허용
      '@typescript-eslint/no-floating-promises': 'error',    // await 빠뜨린 Promise 에러
      '@typescript-eslint/no-misused-promises': 'error',     // Promise를 if 조건에 넣는 실수 차단

      // ── 일반 규칙 ──────────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],  // console.log 경고
      'no-duplicate-imports': 'error',                        // 중복 import 차단
      'eqeqeq': ['error', 'always'],                         // == 대신 === 강제
      'no-var': 'error',                                      // var 사용 금지
      'prefer-const': 'error',                               // const 우선 사용
    },
  },
  {
    // 테스트 파일은 규칙 완화
    files: ['src/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
];
