// SPDX-License-Identifier: Apache-2.0

/**
 * NC-4 本地 postgres 迁移一致性校验（与 CI migration-consistency-postgres job 同源，杜绝两处逻辑漂移）：
 * 全量白名单迁移在真实 pg 上跑通 + migration:generate 无实体漂移（No changes）+ 最后一条迁移的
 * down() 回滚并在同一连接上重跑。sqlite 的单测只覆盖 sqlite 方言，pg 的 down 由本门覆盖。
 * - 已提供 DB_TYPE=postgres + DB_HOST 环境（如 CI services）→ 直连现有 pg，不自起容器；
 *   该路径下 migration:revert（删表）默认跳过，除非 CI=true 或 PG_CONSISTENCY_ALLOW_REVERT=1
 * - 否则自动起临时 pgvector/pg17 容器（用完即清）
 * sqlite 侧请跑 npm run migration-consistency:sqlite 的 CI（长度类漂移 sqlite 检测不到——本脚本专门补 pg）。
 *
 * 用法：npm run migration:consistency:pg
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..'); // Server-NestJS
const DRIFT_GLOB = path.join(root, 'src', 'migrations', '*_PgConsistencyCheck*.ts');
// Pinned like the compose entry it mirrors; the digest is the one docs/manual/supply-chain.md §4 records.
// 与它所对应的编排条目一样钉住；摘要就是 docs/manual/supply-chain.md §4 记录的那一个。
const IMAGE = 'pgvector/pgvector:pg17@sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8';
const DB_NAME = 'keelbase_consistency';

const env = { ...process.env };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r;
}

function sh(line, opts = {}) {
  return run(line, [], { shell: true, ...opts });
}

function ensureSecrets() {
  if (!env.ENCRYPTION_KEY) env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  if (!env.ENCRYPTION_HMAC_KEY) env.ENCRYPTION_HMAC_KEY = crypto.randomBytes(32).toString('hex');
  if (!env.JWT_SECRET) env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  if (!env.JWT_REFRESH_SECRET) env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
}

function cleanDriftFiles() {
  for (const f of fs.existsSync(path.join(root, 'src', 'migrations'))
    ? fs.readdirSync(path.join(root, 'src', 'migrations'))
    : []) {
    if (f.includes('_PgConsistencyCheck')) fs.rmSync(path.join(root, 'src', 'migrations', f));
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function provisionPostgres() {
  const port = await findFreePort();
  const container = `keelbase_pg_consistency_${process.pid}`;
  console.log(`[consistency:pg] 起临时容器 ${container}（端口 ${port}）...`);
  const up = sh(`docker run -d --rm --name ${container} -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=${DB_NAME} -p ${port}:5432 ${IMAGE}`);
  if (up.status !== 0) {
    throw new Error(`无法启动 pgvector/pg17 容器（请确认 Docker 已运行）：\n${up.stderr || up.stdout}`);
  }
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const ok = sh(`docker exec ${container} pg_isready -U postgres`);
    if (ok.status === 0) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) {
    sh(`docker rm -f ${container}`);
    throw new Error('postgres 容器未在 60s 内就绪');
  }
  const cleanup = () => { sh(`docker rm -f ${container}`); };
  return {
    cleanup,
    setEnv() {
      env.DB_TYPE = 'postgres';
      env.DB_HOST = 'localhost';
      env.DB_PORT = String(port);
      env.DB_USER = 'postgres';
      env.DB_PASSWORD = 'postgres';
      env.DB_NAME = DB_NAME;
    },
  };
}

async function main() {
  ensureSecrets();
  let provisioned = null;
  const useExisting = env.DB_TYPE === 'postgres' && env.DB_HOST;
  if (useExisting) {
    console.log('[consistency:pg] 复用现有 postgres 连接（DB_HOST 已设置）');
  } else {
    provisioned = await provisionPostgres();
    provisioned.setEnv();
  }
  try {
    // migration:run + migration:generate 走同一 env（DB_* 在 provision 后已写入 env）
    const childEnv = { ...env };
    console.log('=== migration:run ===');
    // Windows 下 npm 是 npm.cmd，spawn 需走 shell（CI ubuntu 同理，shell:true 兼容）
    const r1 = sh('npm run migration:run', { env: childEnv });
    if (r1.status !== 0) {
      // throw 走 try/finally，确保临时容器被清理（process.exit 会跳过 finally 泄漏容器）
      throw new Error('migration:run 失败（postgres 方言错误），详见上方输出');
    }
    cleanDriftFiles();
    console.log('=== migration:generate 一致性检查 ===');
    // 无变化时 typeorm 返回退出码 1；有漂移则生成文件。靠文件判定（与 CI 同语义）
    sh('npm run migration:generate -- src/migrations/_PgConsistencyCheck', { env: childEnv });
    const drifted = fs.readdirSync(path.join(root, 'src', 'migrations')).some((f) => f.includes('_PgConsistencyCheck'));
    cleanDriftFiles();
    if (drifted) {
      throw new Error('::error::postgres 实体新增了未迁移的变更，请运行 migration:generate 提交迁移（sqlite 绿不代表 pg 无漂移）');
    }
    // The newest migration's `down()` must actually run in the postgres dialect: the jest spec only
    // exercises sqlite's. `migration:revert` reverts whatever ran last (today that is
    // 1850000000000-AddAiToolResultBodies), and re-running proves the same connection can recreate it.
    //
    // 最后一条迁移的 `down()` 必须在 postgres 方言下真跑一遍：jest 单测只覆盖 sqlite 的。
    // `migration:revert` 回滚最后执行的那条（当前即 1850000000000-AddAiToolResultBodies），随后的重跑
    // 证明同一连接能把它重新建起来。
    // Destructive: `migration:revert` drops the table the newest migration created. That is safe
    // against the container this script provisions and against CI's throwaway service container,
    // but not against a database the caller actually uses (the `useExisting` path). It runs there
    // only on explicit opt-in.
    // 破坏性：`migration:revert` 会删掉最新迁移建的表。对本脚本自起的容器与 CI 的一次性 service
    // 容器安全，但对调用方真实在用的库（`useExisting` 路径）不安全。该路径下仅在显式开启时执行。
    const canRevert =
      !useExisting || process.env.CI === 'true' || process.env.PG_CONSISTENCY_ALLOW_REVERT === '1';
    let reverted = false;
    if (canRevert) {
      console.log('=== migration:revert（pg down 校验） ===');
      const r2 = sh('npm run migration:revert', { env: childEnv });
      if (r2.status !== 0) {
        throw new Error('migration:revert 失败（postgres 方言的 down 有误），详见上方输出');
      }
      console.log('=== migration:run（回滚后重跑） ===');
      const r3 = sh('npm run migration:run', { env: childEnv });
      if (r3.status !== 0) {
        throw new Error('回滚后重跑 migration:run 失败，详见上方输出');
      }
      reverted = true;
    } else {
      console.log(
        '[consistency:pg] 复用外部 postgres：跳过破坏性的 migration:revert'
        + '（设 PG_CONSISTENCY_ALLOW_REVERT=1 或 CI=true 可启用）',
      );
      console.log(
        '[consistency:pg] reused postgres: skipped destructive migration:revert'
        + ' (set PG_CONSISTENCY_ALLOW_REVERT=1 or CI=true to enable)',
      );
    }
    console.log(
      reverted
        ? '[consistency:pg] PASS — postgres 全量迁移跑通、实体↔迁移无漂移，且最后一条迁移的 down/重跑成立（No changes）'
        : '[consistency:pg] PASS — postgres 全量迁移跑通、实体↔迁移无漂移；down/重跑已跳过（复用外部库）',
    );
  } finally {
    cleanDriftFiles();
    if (provisioned) provisioned.cleanup();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
