import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 独立于 vite.config.ts（不含 vuetify 插件）：store/守卫测试不挂载组件，无需 Vuetify
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // 2026-08-20 提高：锁住当前水平（实际 36.1/81.1/59.2/36.1，留 4-6 点余量防 CI 波动）
        statements: 32,
        branches: 75,
        functions: 54,
        lines: 32,
      },
    },
  },
})
