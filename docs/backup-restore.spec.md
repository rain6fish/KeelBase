# 数据备份与恢复（PL-3）功能规格

## 1. 概述

提供数据库备份与恢复脚本，支持 SQLite（dev）与 PostgreSQL（prod）双驱动。定期备份由外部调度（cron/systemd/docker 定时）调用 `npm run backup`，脚本自身不做调度。

## 2. 命令

| 命令 | 说明 |
|------|------|
| `npm run backup` | 备份数据库到 `data/backups/<名>-<时间戳>.backup` |
| `npm run restore -- <备份文件>` | 恢复数据库（危险，需先停止应用） |

## 3. 备份方式

| DB_TYPE | 方式 | 说明 |
|---------|------|------|
| sqlite | better-sqlite3 `db.backup()` | WAL 安全在线一致性备份（不裸拷文件） |
| postgres | `pg_dump --format=custom` | 需 pg_dump 可用（docker compose exec postgres pg_dump） |

输出目录 `data/backups/`（gitignore 忽略，含敏感数据）。

## 4. 保留策略

- 默认保留最近 **7** 份（`BACKUP_KEEP` env 可调）
- 超出删除最旧，避免磁盘膨胀
- 备份文件权限 `0600`（含 bcrypt hash + AES 加密字段，需保密）

## 5. 恢复流程

1. 停止应用（避免写库）
2. `npm run restore -- data/backups/db-xxx.backup`
   - sqlite：备份文件拷贝回 `DB_PATH`
   - postgres：`pg_restore --no-owner` 恢复到目标库（需先清空/建新库）
3. 重启应用

## 6. 定期调度示例（外部）

```bash
# cron 每天凌晨 2 点
0 2 * * * cd /path/to/Server-Nodejs && npm run backup >> /var/log/backup.log 2>&1
```

## 7. 安全

- 备份文件含用户敏感数据（密码 hash、AES 加密 phone），权限 0600，目录 gitignore
- 生产建议备份到异地/S3（ST-1 S3 存储可扩展）

## 8. 恢复演练

定期（如每季度）演练：备份 → 恢复到临时库 → 验证关键表数据 → 清理。
