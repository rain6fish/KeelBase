/**
 * 数据库备份脚本
 *
 * 用法：npm run backup
 *  - sqlite：better-sqlite3 db.backup()（WAL 安全在线一致性备份）
 *  - postgres：pg_dump --format=custom（需 pg_dump 可用，docker-compose exec postgres pg_dump）
 * 输出：data/backups/<DB名>-<时间戳>.backup，保留最近 BACKUP_KEEP（默认 7）份，权限 0600。
 * 定期执行由外部 cron/systemd/docker 定时调用，脚本自身不做调度。
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as dotenv from 'dotenv';

const execFileAsync = promisify(execFile);

// 加载环境变量（优先级：已存在的环境变量 > .env）
dotenv.config();

const BACKUP_DIR = join(__dirname, '../data/backups');

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function resolveEnv(key: string, def = ''): string {
  return process.env[key] || def;
}

async function backupSqlite(dbPath: string, outFile: string): Promise<void> {
  // 动态 require（脚本不被 nest 编译，用 require 避免 tsconfig 类型问题）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(outFile);
  } finally {
    db.close();
  }
}

async function backupPostgres(
  host: string,
  port: string,
  user: string,
  password: string,
  database: string,
  outFile: string,
): Promise<void> {
  const env = { ...process.env, PGPASSWORD: password };
  await execFileAsync('pg_dump', [
    '--format=custom',
    '--file', outFile,
    '--host', host,
    '--port', port,
    '--username', user,
    database,
  ], { env });
}

async function rotate(keep: number): Promise<void> {
  const files = (await fs.readdir(BACKUP_DIR))
    .filter((f) => f.endsWith('.backup'))
    .sort(); // 时间戳升序
  const toDelete = files.slice(0, Math.max(0, files.length - keep));
  for (const f of toDelete) {
    await fs.unlink(join(BACKUP_DIR, f));
    console.log(`[backup] 删除旧备份: ${f}`);
  }
}

async function main(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const dbType = resolveEnv('DB_TYPE', 'sqlite');
  const keep = Number(resolveEnv('BACKUP_KEEP', '7')) || 7;
  const outFile = join(BACKUP_DIR, `db-${ts()}.backup`);

  if (dbType === 'postgres') {
    const dbName = resolveEnv('DB_NAME', 'front');
    const outPg = join(BACKUP_DIR, `${dbName}-${ts()}.backup`);
    await backupPostgres(
      resolveEnv('DB_HOST', 'localhost'),
      resolveEnv('DB_PORT', '5432'),
      resolveEnv('DB_USER', 'postgres'),
      resolveEnv('DB_PASSWORD', 'postgres'),
      dbName,
      outPg,
    );
    console.log(`[backup] postgres 备份完成: ${outPg}`);
  } else {
    const dbPath = resolveEnv('DB_PATH', './data/front.sqlite');
    await backupSqlite(dbPath, outFile);
    console.log(`[backup] sqlite 备份完成: ${outFile}`);
  }

  await fs.chmod(outFile, 0o600);
  await rotate(keep);
  console.log(`[backup] 保留最近 ${keep} 份`);
}

main().catch((err) => {
  console.error('[backup] 失败:', err.message);
  process.exit(1);
});
