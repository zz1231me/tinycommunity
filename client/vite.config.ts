import { defineConfig, loadEnv, createLogger } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Suppress the noisy deprecation warning emitted by @vitejs/plugin-react-swc
// which still passes `esbuild` JSX options to Vite 8 (Vite 8 uses `oxc` instead).
// The esbuild options are effectively replaced by the `oxc` block below.
// Remove this filter once the plugin is updated to use the oxc API.
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (
    msg.includes('esbuild') &&
    (msg.includes('deprecated') || msg.includes('oxc options will be used'))
  )
    return;
  originalWarn(msg, options);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    customLogger: logger,
    plugins: [react()],

    resolve: {
      alias: {
        // import.meta.dirname — Vite 의 새 설정 로더는 __dirname 을 주지 않는다
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },

    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName:
          mode === 'production' ? '[hash:base64:8]' : '[name]__[local]__[hash:base64:5]',
      },
    },

    assetsInclude: ['**/*.svg'],

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react-router-dom',
        '@fullcalendar/core',
        '@fullcalendar/react',
        '@fullcalendar/daygrid',
        '@fullcalendar/interaction',
        '@fullcalendar/list',
        'lucide-react',
        'axios',
        'zustand',
        '@tanstack/react-query',
        'ckeditor5',
        '@ckeditor/ckeditor5-react',
      ],
    },

    server: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: true,
      hmr: {
        overlay: true,
        clientPort: 8080,
      },
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/dist/**'],
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://127.0.0.1:4000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://127.0.0.1:4000',
          changeOrigin: true,
          secure: false,
        },
      },
      cors: true,
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: 'es2022',
      sourcemap: mode === 'development',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1500,
      // Vite 8: use 'oxc' (Rolldown built-in) instead of deprecated 'esbuild'
      minify: mode === 'production' ? 'oxc' : false,
      rollupOptions: {
        output: {
          // 청크 나누기는 Rolldown 의 codeSplitting 규칙으로 한다.
          //
          // 예전에는 manualChunks(id => ...) 를 썼는데, React 처럼 CommonJS 로 배포되는
          // 패키지가 이 함수의 판정을 타지 않고 남의 vendor 청크(캘린더·CKEditor)에 얹혔다.
          // 모든 화면이 React 를 쓰므로, 그 청크가 통째로 첫 화면에 딸려 들어왔다
          // (캘린더 71KB, 심할 땐 CKEditor 326KB 가 gzip 기준으로 그냥 얹혔다).
          // codeSplitting 은 Rolldown 이 직접 쓰는 규칙이라 CJS 도 같은 기준으로 갈린다.
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 100,
              },
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/]react-router(-dom)?[\\/]/,
                priority: 95,
              },
              {
                name: 'vendor-ckeditor',
                test: /[\\/]node_modules[\\/](ckeditor5|@ckeditor[\\/])/,
                priority: 90,
              },
              {
                name: 'vendor-calendar',
                test: /[\\/]node_modules[\\/]@fullcalendar[\\/]/,
                priority: 90,
              },
              {
                name: 'vendor-highlight',
                test: /[\\/]node_modules[\\/]highlight\.js[\\/]/,
                priority: 90,
              },
              {
                name: 'vendor-tanstack',
                test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
                priority: 80,
              },
              // lucide-react 는 일부러 묶지 않는다. 여기에 넣으면 앱 전체가 쓰는 아이콘
              // 73개가 한 청크로 뭉쳐 첫 화면에 통째로 실린다. 풀어 두면 아이콘이
              // 각자 쓰이는 화면의 청크로 따라가 초기 전송량이 줄어든다.
              {
                name: 'vendor-utils',
                test: /[\\/]node_modules[\\/](axios|zustand)[\\/]/,
                priority: 80,
              },
            ],
          },
          assetFileNames: assetInfo => {
            const name = assetInfo.name || '';
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(name)) {
              return 'assets/images/[name]-[hash][extname]';
            }
            if (/\.(woff2?|eot|ttf|otf)$/.test(name)) {
              return 'assets/fonts/[name]-[hash][extname]';
            }
            if (/\.css$/.test(name)) {
              return 'assets/css/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
      reportCompressedSize: true,
      emptyOutDir: true,
    },

    preview: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: true,
      cors: true,
      // dev 서버와 동일한 proxy — npm run preview 시에도 API 요청이 Express로 전달됨
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://127.0.0.1:4000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://127.0.0.1:4000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    cacheDir: 'node_modules/.vite',

    define: {
      __DEV__: mode === 'development',
      __PROD__: mode === 'production',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    // Vite 8: oxc supersedes the deprecated esbuild transform config.
    // Must include JSX settings here so @vitejs/plugin-react-swc's esbuild
    // JSX options (which Vite 8 ignores) are correctly replaced.
    oxc: {
      target: 'es2022',
      jsx: 'automatic',
      jsxImportSource: 'react',
    },

    logLevel: mode === 'development' ? 'info' : 'warn',
    clearScreen: false,
  };
});
