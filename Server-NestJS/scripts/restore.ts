/**
 * 数据库恢复脚本
 *
 * 用法：npm run restore -- <备份文件路径>
 *  - sqlite：备份文件拷贝回 DB_PATH（需先停止应用）
 *  - postgres：pg_restore 恢复（需先清空目标库或建新库）
 * 危险操作：会覆盖当前数据库，执行前需确认。
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

const execFileAsync = promisify(execFile);

dotenv.config();

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('用法: npm run restore -- <备份文件路径>');
    process.exit(1);
  }

  const backupFile = resolve(fileArg);
  try {
    const stat = await fs.stat(backupFile);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error('备份文件不存在或为空');
    }
  } catch (err) {
    console.error('[restore] 无法读取备份文件:', (err as Error).message);
    process.exit(1);
  }

  const dbType = process.env.DB_TYPE || 'sqlite';

  if (dbType === 'postgres') {
    const dbName = process.env.DB_NAME || 'front';
    await execFileAsync('pg_restore', [
      '--no-owner',
      '--host', process.env.DB_HOST || 'localhost',
      '--port', process.env.DB_PORT || '5432',
      '--username', process.env.DB_USER || 'postgres',
      '--dbname', dbName,
      backupFile,
    ], {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'postgres' },
    });
    console.log(`[restore] postgres 恢复完成: ${backupFile}`);
  } else {
    const dbPath = resolve(process.env.DB_PATH || './data/front.sqlite');
    await fs.copyFile(backupFile, dbPath);
    console.log(`[restore] sqlite 恢复完成: ${backupFile} → ${dbPath}`);
  }

  console.log('[restore] 完成。如应用正在运行，请重启以加载恢复的数据。');
}

main().catch((err) => {
  console.error('[restore] 失败:', err.message);
  process.exit(1);
});
