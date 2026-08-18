import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// base: '/admin/' — 与 nginx /admin location 和单容器 SERVE_STATIC prefix 对齐。
// 产物资源走绝对路径 /admin/assets/*，两套部署链都命中。
export default defineConfig({
  base: '/admin/',
  plugins: [
    vue(),
    // Element Plus 按需引入：模板 el-* 组件 + v-loading 指令 + 组件样式自动注入，
    // 替代 main.ts 的全量 app.use(ElementPlus) + index.css，压缩主 chunk 体积。
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
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
