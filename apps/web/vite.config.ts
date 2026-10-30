import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // GitHub Pages 等子路径部署时通过 VITE_BASE=/<repo>/ 注入；本地默认根路径。
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5199,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // DSH/editor atomic writes create temporary dirs next to source files.
      // Watching those files can crash chokidar on Windows with EBUSY.
      ignored: [
        '**/.*.tmpdir/**',
        '**/*.tmp',
        /\.tmpdir/,
        /\.tmp$/,
      ],
    },
  },
  build: {
    target: 'es2022',
  },
})
