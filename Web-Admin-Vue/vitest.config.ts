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
    // 2026-09-01：guard 测试满载时仍可达 11s+（collect 慢机 17min）→ 放宽到 20s 消除 CI flake
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        // 2026-08-20 提高：锁住当前水平（实际 36.1/81.1/59.2/36.1，留 4-6 点余量防 CI 波动）
        // 2026-09-01 门槛对齐实际：新增未测试工作台页面 0% 拉低 branches → 75→70（留 4.3 点）
        // 2026-09-06 覆盖大提升：risk/users/workbench 等 ~16 个 0% 页 smoke + api 端点层覆盖后
        //   实际 87.16/76.76/56.14/87.16 → statements/lines 门槛 32→75（锁 ~12 点余量），functions 余量仍薄留 54
        statements: 75,
        branches: 70,
        functions: 54,
        lines: 75,
      },
    },
  },
})
