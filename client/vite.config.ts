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
  if (msg.includes('esbuild') && (msg.includes('deprecated') || msg.includes('oxc options will be used'))) return;
  originalWarn(msg, options);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    customLogger: logger,
    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
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
        '@fullcalendar/timegrid',
        '@fullcalendar/interaction',
        '@fullcalendar/list',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-popover',
        '@floating-ui/dom',
        '@floating-ui/react',
        'lucide-react',
        'axios',
        'zustand',
        'lodash.throttle',
        'fuzzysort',
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
          manualChunks: id => {
            if (!id.includes('node_modules')) return;
            if (id.includes('ckeditor5') || id.includes('@ckeditor')) return 'vendor-ckeditor';
            if (id.includes('@fullcalendar')) return 'vendor-calendar';
            if (id.includes('highlight.js')) return 'vendor-highlight';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('react-router') ||
              id.includes('/scheduler/')
            )
              return 'vendor-react';
            if (id.includes('@radix-ui') || id.includes('@floating-ui')) return 'vendor-ui';
            if (
              id.includes('axios') ||
              id.includes('zustand') ||
              id.includes('lodash') ||
              id.includes('lucide-react')
            )
              return 'vendor-utils';
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
