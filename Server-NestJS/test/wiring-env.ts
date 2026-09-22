// SPDX-License-Identifier: Apache-2.0

/**
 * 给装配冒烟（`src/app-wiring.spec.ts`）一个属于**本次运行**的库文件。
 *
 * 为什么必须单独成一个模块、且必须在 `app.module` **之前** import：dotenv 不覆盖已经存在于
 * `process.env` 的键，所以「先落位」就赢过 `.env.test` 里的共享 `DB_PATH`；而 ES 的 import 求值顺序
 * 就是声明顺序，因此「先 import 本文件」是可依赖的。写在 spec 的模块体内则太晚——模块体在全部 import
 * 之后才执行。
 *
 * 不这么做会怎样：`.env.test` 指向共享的 `data/test.sqlite`，那是 e2e 早期遗留的路径，文件里表已在、
 * 迁移记录不在，于是 `migrationsRun` 一跑就 `SqliteError: table "users" already exists`。单测里没有
 * e2e 那套「每个 app 一个独立库」的编排（见 `helpers.ts` 的 `nextE2eDbPath`），所以这里补上等价的隔离。
 *
 * 命名沿用 `keelbase-e2e-` 前缀，helpers 的 `pruneStaleE2eDbs()` 会把 >24h 的残留一并清掉。
 *
 * **建表走 synchronize，不走迁移**：`buildTypeOrmOptions` 的 sqlite 迁移清单是
 * `['dist/migrations/*.js']`——**编译产物**。本机跑过 build 才有；CI 的单测 job 只 `npm ci` 不
 * build，那个库建出来**一张表都没有**，冒烟测试其实是在空库上跑（实测症状：日志打
 * "No migrations are pending"，随后任何启动期读库都 `no such table`，且因是 fire-and-forget
 * 而报在不相干的测试名下）。改由实体元数据建表，冒烟测试便不再依赖构建产物，本地与 CI 一致。
 */
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';

process.env.DB_PATH = path.join(
  os.tmpdir(),
  `keelbase-e2e-wiring-${process.pid}-${randomBytes(4).toString('hex')}.sqlite`,
);
process.env.DB_SYNCHRONIZE = 'true';
