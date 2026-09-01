// SPDX-License-Identifier: Apache-2.0

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
  // 自定义 surface mode（user/admin）：vite 只为 production/development 设 NODE_ENV，
  // 自定义 mode 下 NODE_ENV 保持非 production，导致 vue 插件输出 dev 风格 chunk
  // （*.vue_vue_type_script_setup_true_lang-*）混入生产产物。构建时强制生产模式。
  if (mode !== 'production' && mode !== 'development' && process.env.NODE_ENV !== 'production') {
    process.env.NODE_ENV = 'production'
  }
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
      rollupOptions: {
        output: {
          // E-3 性能：vue 全家桶拆成稳定 vendor chunk（长期缓存命中 + 首屏并行加载）。
          // 勿把 element-plus 塞入——unplugin 已按需拆散，整体塞入会破坏 tree-shake。
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia', 'axios', 'vue-i18n', 'dayjs'],
          },
        },
      },
    },
  }
})
