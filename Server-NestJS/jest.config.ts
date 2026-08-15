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
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
