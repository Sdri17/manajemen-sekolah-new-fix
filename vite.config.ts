import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const buildTimestamp = new Date().toISOString();

export default defineConfig(() => {
  return {
    define: {
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTimestamp),
      '__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp)
    },
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'inject-build-timestamp-meta',
        transformIndexHtml(html) {
          return html.replace(
            '</head>',
            `  <meta name="build-version" content="${buildTimestamp}" />\n  <meta name="build-timestamp" content="${buildTimestamp}" />\n</head>`
          );
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('xlsx')) {
                return 'vendor-excel';
              }
              if (id.includes('recharts') || id.includes('d3')) {
                return 'vendor-charts';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor-libs';
            }
          }
        }
      }
    }
  };
});

