import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// 타임존을 운영과 같게 못박는다. UTC 에서 돌리면 '한국 시간 09시 이전' 경계가 사라져
// 날짜를 UTC 로 자르는 버그가 테스트를 그대로 통과한다(CI 는 UTC 다).
process.env.TZ = 'Asia/Seoul';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'src/test'],
    },
  },
  resolve: {
    alias: {
      // import.meta.dirname — Vite 의 새 설정 로더는 __dirname 을 주지 않는다
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
