-- 治理控制台独立库（CR-23 同类：全新部署缺口修复，2026-09-14）
--
-- governance 服务以 `GOVERNANCE_DB_NAME=governance`（默认库名）连接，用户取自 `DB_USER`。
-- 先前 docker/init 只建了 pgvector 扩展、未建该库 → **全新部署**下：
--   governance 启动失败（error: database "governance" does not exist）
--   → `docker compose up -d` 返回非零 → deploy.sh（set -e）在第 4 步中断，管理员也不会被创建；
--   sidecar 依赖 governance 健康，同样起不来。
-- 此处与 POSTGRES_DB 一并建出（init 脚本仅在 pgdata 卷首次初始化时执行，幂等写成防重复）。
SELECT 'CREATE DATABASE governance'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'governance')\gexec
