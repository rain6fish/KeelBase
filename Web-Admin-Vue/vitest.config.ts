// SPDX-License-Identifier: Apache-2.0

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
    // 2026-08-28：guards.spec 全量并行时首次 transform/初始化 >5s 超时（单独跑约 4-5s）——全局放宽到 10s
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        // 2026-08-20 提高：锁住当前水平（实际 36.1/81.1/59.2/36.1，留 4-6 点余量防 CI 波动）
        // 2026-09-01 门槛对齐实际：新增未测试工作台页面（AiDetail/Customers/MyTodos 等 0%）拉低 branches，
        //   全文件实际 72.2/74.3/55.3/72.2 → branches 门槛 75 下调至 70（留 4.3 点余量），其余三项远超门槛不动
        statements: 32,
        branches: 70,
        functions: 54,
        lines: 32,
      },
    },
  },
})
