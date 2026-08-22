import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// 按构建模式分 surface：`--mode user` → /user/（普通用户工作台），其余 → /admin/（管理台）。
// base 与 nginx location（/user/ | /admin/）对齐；产物资源走绝对路径，两套部署链都命中。
// router 的 createWebHashHistory(import.meta.env.BASE_URL) 同步跟随 base。
export default defineConfig(({ mode }) => {
  const isUser = mode === 'user'
  return {
    base: isUser ? '/user/' : '/admin/',
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
      outDir: isUser ? 'dist/user' : 'dist/admin',
    },
  }
})
