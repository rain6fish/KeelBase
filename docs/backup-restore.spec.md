# 数据备份与恢复（PL-3）功能规格 / Data Backup and Restore (PL-3) Feature Spec

## 1. 概述 / Overview

提供数据库备份与恢复脚本，支持 SQLite（dev）与 PostgreSQL（prod）双驱动。定期备份由外部调度（cron/systemd/docker 定时）调用 `npm run backup`，脚本自身不做调度。

Provides database backup and restore scripts supporting both SQLite (dev) and PostgreSQL (prod) drivers. Scheduled backups are invoked by external schedulers (cron/systemd/docker timers) calling `npm run backup`; the script itself does not do scheduling.

## 2. 命令 / Commands

| 命令 / Command | 说明 / Description |
|------|------|
| `npm run backup` | 备份数据库到 `data/backups/<名>-<时间戳>.backup` / Backs up the database to `data/backups/<name>-<timestamp>.backup` |
| `npm run restore -- <备份文件>` | 恢复数据库（危险，需先停止应用） / Restores the database (dangerous; stop the application first) |

## 3. 备份方式 / Backup Methods

| DB_TYPE | 方式 / Method | 说明 / Description |
|---------|------|------|
| sqlite | better-sqlite3 `db.backup()` | WAL 安全在线一致性备份（不裸拷文件） / WAL-safe online consistent backup (no raw file copy) |
| postgres | `pg_dump --format=custom` | 需 pg_dump 可用（docker compose exec postgres pg_dump） / Requires pg_dump to be available (docker compose exec postgres pg_dump) |

输出目录 `data/backups/`（gitignore 忽略，含敏感数据）。

The output directory is `data/backups/` (ignored by gitignore; contains sensitive data).

## 4. 保留策略 / Retention Policy

- 默认保留最近 **7** 份（`BACKUP_KEEP` env 可调）
  Keeps the most recent **7** backups by default (`BACKUP_KEEP` env is configurable)
- 超出删除最旧，避免磁盘膨胀
  Deletes the oldest beyond that to avoid disk bloat
- 备份文件权限 `0600`（含 bcrypt hash + AES 加密字段，需保密）
  Backup files use permission `0600` (contain bcrypt hashes + AES-encrypted fields; must be kept confidential)

## 5. 恢复流程 / Restore Flow

1. 停止应用（避免写库）
   Stop the application (to avoid database writes)
2. `npm run restore -- data/backups/db-xxx.backup`
   - sqlite：备份文件拷贝回 `DB_PATH`
     sqlite: copy the backup file back to `DB_PATH`
   - postgres：`pg_restore --no-owner` 恢复到目标库（需先清空/建新库）
     postgres: restore to the target database with `pg_restore --no-owner` (empty or create a new database first)
3. 重启应用
   Restart the application

## 6. 定期调度示例（外部）/ Periodic Scheduling Example (External)

```bash
# cron 每天凌晨 2 点
0 2 * * * cd /path/to/Server-NestJS && npm run backup >> /var/log/backup.log 2>&1
```

## 7. 安全 / Security

- 备份文件含用户敏感数据（密码 hash、AES 加密 phone），权限 0600，目录 gitignore
  Backup files contain user-sensitive data (password hashes, AES-encrypted phone), permission 0600, directory gitignored
- 生产建议备份到异地/S3（ST-1 S3 存储可扩展）
  Production is advised to back up off-site / to S3 (ST-1 S3 storage is extensible)

## 8. 恢复演练 / Restore Drill

定期（如每季度）演练：备份 → 恢复到临时库 → 验证关键表数据 → 清理。

Drill regularly (e.g., quarterly): back up → restore to a temporary database → verify key table data → clean up.
