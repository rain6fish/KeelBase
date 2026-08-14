import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// base: '/admin/' — 与 nginx /admin location 和单容器 SERVE_STATIC prefix 对齐。
// 产物资源走绝对路径 /admin/assets/*，两套部署链都命中。
export default defineConfig({
  base: '/admin/',
  plugins: [
    vue(),
    vuetify({
      autoImport: true,
      styles: { configFile: 'src/styles/settings.scss' },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 10086,
    proxy: {
      // 开发免 CORS：/api 转发到本机后端
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
