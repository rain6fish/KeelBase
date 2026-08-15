import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/admin-react/' — React 预览版独立路径，与 Vue 版 /admin/ 错开，不冲突。
// 预览版本地 dev 独立：端口 10087，/api 代理到本机后端 3000。
export default defineConfig({
  base: '/admin-react/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 10087,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1024,
    outDir: 'dist',
  },
})
