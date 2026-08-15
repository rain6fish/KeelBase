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
    '!src/main.ts',
    '!src/tracing*.ts',
    '!src/tracing-init.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 55,
      functions: 60,
      lines: 65,
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
