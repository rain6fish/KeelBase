// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * The `.env.test` every e2e suite reads its configuration from, and the bootstrap that creates it when a
 * fresh clone does not have it (the file is gitignored).
 *
 * It lives in its own module, rather than inside `helpers.ts`, because one suite deliberately builds a
 * minimal module graph instead of the full app: `ws-realtime.e2e-spec.ts` stubs `AiService` and imports
 * only `RealtimeModule` + `FeatureFlagsModule`, to stay clear of AiModule→OrgModule→RealtimeModule. Importing
 * `helpers.ts` there would drag that whole graph in just to reach this file — importing this module costs
 * nothing else.
 *
 * 每个 e2e 套件读配置用的 `.env.test`，以及「全新 clone 没有这个文件时把它写出来」的引导（该文件被
 * `.gitignore` 排除）。
 *
 * 它单独成模块、不留在 `helpers.ts` 里，是因为有一个套件**故意**只装最小模块图而不是整个应用：
 * `ws-realtime.e2e-spec.ts` 用替身顶掉 `AiService`，只引入 `RealtimeModule` + `FeatureFlagsModule`，为的是
 * 绕开 AiModule→OrgModule→RealtimeModule 那条环。为了拿到这个文件而 import `helpers.ts`，会把那整张图
 * 一起拖进来 —— 只 import 本模块则没有别的代价。
 */
export const TEST_ENV_PATH = path.resolve(__dirname, '../.env.test');

/**
 * Kept as one block so the two callers cannot drift from each other.
 *
 * `QUEUE_ENABLED` / `CACHE_ENABLED` are the two that matter most: without this file the Joi schema defaults
 * them to `true`, and with no Redis around BullMQ's `pushQueue.add` blocks and retries until the e2e run
 * times out and `app.close` hangs.
 *
 * 保持单块，两个调用方因此不会各写一份、各自漂移。
 *
 * 其中 `QUEUE_ENABLED` / `CACHE_ENABLED` 最关键：没有这个文件时 Joi 把它们取默认值 `true`，而本机没有
 * Redis，BullMQ 的 `pushQueue.add` 会阻塞重试，直到 e2e 超时、`app.close` 挂住。
 */
export const TEST_ENV_CONTENT = `# 测试环境配置（自动生成，不入库）
NODE_ENV=test
PORT=3001
JWT_SECRET=test-jwt-secret-at-least-32-characters!!
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=test-refresh-secret-at-least-32-chars!!
JWT_REFRESH_EXPIRES_IN=7d
DB_TYPE=sqlite
DB_PATH=./data/test.sqlite
LOCKOUT_THRESHOLD=10
LOCKOUT_DURATION=15
ENCRYPTION_KEY=e640ea00aa5e1e0425b174fdbd2c56cd07c56b7f12daa57a6180bce226bcb1c4
ENCRYPTION_HMAC_KEY=c6c1385a82395cafcfc856f775e1fb54efd985aa628869e2652d86f500b84bfd
AUDIT_HMAC_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
MAIL_ENABLED=false
STORAGE_DRIVER=local
CACHE_ENABLED=false
QUEUE_ENABLED=false
`;

/**
 * Writing it has to happen while the importing module is being evaluated, not inside a `beforeAll`:
 * `ConfigModule.forRoot` reads the file (and runs the Joi schema) when its options object is built, i.e. at
 * decorator-evaluation time. A file created after that point is simply not seen.
 *
 * 落盘必须发生在**导入方模块求值期间**，不能放进 `beforeAll`：`ConfigModule.forRoot` 是在构造它的选项
 * 对象时（即装饰器求值那一刻）读文件、跑 Joi 校验的。之后才写出来的文件，它根本看不到。
 */
export function ensureTestEnvFile(): void {
  if (fs.existsSync(TEST_ENV_PATH)) return;
  fs.writeFileSync(TEST_ENV_PATH, TEST_ENV_CONTENT, 'utf8');
}

// Import-time side effect, on purpose. Any e2e file that needs `.env.test` imports this module and gets it.
// 有意放在导入时执行：需要 `.env.test` 的 e2e 文件只要 import 本模块就有了。
ensureTestEnvFile();
