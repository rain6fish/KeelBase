// SPDX-License-Identifier: Apache-2.0

import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    // 生成型/入口文件不参与覆盖：TypeORM 自动迁移、进程入口与 tracing 引导
    '!src/migrations/**',
    // 进程入口（bootstrapping，与 src/main.ts 同类；含 governance/main.ts 与 governance-sidecar/main.ts）
    '!src/**/main.ts',
    '!src/tracing*.ts',
    '!src/tracing-init.ts',
    // 纯 DI 声明样板 module 排除（2026-08-16 决策）：仅 imports/controllers/providers 声明
    // 的模块不参与统计；含真实逻辑（useFactory/useValue/useClass/条件分支）的 module 重新纳入
    '!src/**/*.module.ts',
    'src/ai/ai.module.ts',
    'src/app.module.ts',
    'src/auth/auth.module.ts',
    'src/common/cache/cache.module.ts',
    'src/flows/flows.module.ts',
    'src/mail/mail.module.ts',
    'src/maintenance-tasks/maintenance-tasks.module.ts',
    'src/plugins/plugins.module.ts',
    'src/push/push.module.ts',
    'src/queue/queue.module.ts',
    'src/realtime/realtime.module.ts',
    'src/sms/sms.module.ts',
    'src/storage/storage.module.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    // 2026-09-13 提高：锁住当前水平（实际 91.5/78.2/87.5，沿用留 ~5-6 点余量防 CI 波动的惯例）
    global: {
      statements: 86,
      branches: 72,
      functions: 81,
      lines: 86,
    },
    // 关键安全模块分档门槛由 scripts/check-security-coverage.mjs 在 test:cov 后门控
    // （jest coverageThreshold 的目录 glob 在 Windows 反斜杠路径下无法匹配，见 T.5）
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
