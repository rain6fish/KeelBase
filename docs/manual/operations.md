# Operations Manual / 运维手册

> KeelBase — 面向运维人员的部署、环境变量、备份恢复与可观测性指南。
> For ops. Deployment, environment variables, backup/restore, observability.

Related manuals / 相关手册：
- [Usage Manual / 使用手册](usage.md)
- [Development Manual / 开发手册](development.md)

---

## 1. Environment Configuration / 环境配置

### 1.1 Config Files / 配置文件

```
.env                  # default (development, SQLite)
.env.staging          # staging (PostgreSQL)
.env.production       # production (PostgreSQL)
```

### 1.2 Core Variables / 核心变量

| Variable / 变量 | Default / 默认 | Purpose / 用途 |
|-----------------|----------------|----------------|
| `NODE_ENV` | `development` | development/staging/production |
| `PORT` | `3000` | API server port |
| `CORS_ORIGINS` | `*` | CORS whitelist (set domain in prod) |
| `JWT_SECRET` | — | ≥32 chars |
| `JWT_REFRESH_SECRET` | — | ≥32 chars |
| `DB_TYPE` | `sqlite` | sqlite (dev) / postgres (prod) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | localhost / 5432 / front | PostgreSQL connection |
| `ENCRYPTION_KEY` | — | 32-byte hex for AES-256-GCM static encryption |
| `ENCRYPTION_HMAC_KEY` | — | providerHash derivation key (falls back to ENCRYPTION_KEY) |

### 1.3 Optional Features / 可选功能

| Variable / 变量 | Default / 默认 | Purpose / 用途 |
|-----------------|----------------|----------------|
| `MAIL_ENABLED` | `false` | Enable SMTP email (verification/reset/notification) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | — | SMTP server |
| `APP_BASE_URL` | `http://localhost:8080` | Frontend URL for password-reset links |
| `STORAGE_DRIVER` | `local` | local / s3 (MinIO/OSS compatible) |
| `PUSH_DRIVER` | `none` | none / jpush (JPush device push) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `CACHE_ENABLED` | `true` | Redis cache layer on/off |
| `CACHE_TTL` | `300` | Default cache TTL (seconds) |
| `QUEUE_ENABLED` | `true` | BullMQ async queue (false = sync fallback) |
| `OTEL_ENABLED` | `false` | OpenTelemetry tracing |
| `LOKI_ENABLED` | `false` | Push pino logs to Loki |

Full reference: `Server-NestJS/.env.example` / 完整参考见 `Server-NestJS/.env.example`。

---

## 2. Deployment / 部署

### 2.1 Docker (Production) / Docker 生产部署

```bash
# 1. Prepare TLS certs / 准备证书
mkdir certs && cp your-cert.crt certs/server.crt && cp your-key.key certs/server.key

# 2. Configure production env / 配置生产环境
cp Server-NestJS/.env.production.example Server-NestJS/.env.production
# edit values / 填写真实值

# 3. Start / 启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

**Stack / 组件**: PostgreSQL 17 + Redis + NestJS API + Nginx (Flutter web). Runs as non-root (`keelbase` user).

### 2.2 Production Settings / 生产设置

- `synchronize: false`, `migrationsRun: true`
- Swagger disabled (dev only)
- HSTS enabled via `nginx.https.conf`
- CORS set to specific domains

### 2.3 Admin Console Deploy / 管理台部署

```bash
cd Web-Admin-Vue
npm run build    # → dist/（base=/admin/）
```

Serve `dist/` as static files. Recommended: separate domain (e.g. `admin.example.com`) + optional IP whitelist/VPN/MFA.

---

## 3. Database Migration / 数据库迁移

```bash
# Generate migration / 生成迁移
npm run migration:generate -- src/migrations/YourMigrationName

# Run migrations / 执行迁移
npm run migration:run
```

- Dev: `synchronize: true` (auto-sync)
- Prod: `synchronize: false`, run migrations manually
- CI checks migration consistency: runs baseline + `migration:generate`, fails if drift

### 3.1 v1.0 Compatibility / Upgrade Policy / v1.0 兼容与升级政策

> 1.0 Candidate Exit Criteria #10（`release-1.0-candidate.md` §3）。

**Version contract / 版本契约**：v1.0 为首个稳定发布。REST API（`/api/v1`）与 AI 工具契约（工具名/参数）在 v1.x 内**向后兼容（additive only）**——新增为兼容，破坏性变更进大版本。

**Schema / 数据模式**：所有 schema 变更以**双驱动 TypeORM 迁移**（SQLite + PostgreSQL）发布；生产 `synchronize: false` + `migrationsRun: true`（无自动同步漂移）；CI 强制迁移一致性（baseline + `migration:generate`，有漂移即失败）。

**Upgrade path v0.9.x → v1.0 / 升级路径**：
1. 备份：`npm run backup`
2. 拉取 v1.0 → `npm run build`
3. 应用迁移：`npm run migration:run`
4. 验证：`npm run healthcheck` + `npm run test:e2e`

无需数据迁移——只要此前一直在跑迁移（schema 由迁移驱动）；`synchronize: true` 的开发库需对全新 baseline 跑一次 `migration:generate` 并对齐。

**Backward compatibility statement / 兼容性声明**：
- REST：v1.x 内 additive-only，废弃端点记入 CHANGELOG；
- 环境变量：新变量带默认值（见 `.env.example`），删除仅在大版本；
- `Settings` 动态配置：key 稳定，未知 key 忽略；
- AI Agent 运行时（工具注册 / 确认 / 审计）为稳定契约，供插件/扩展依赖。

**Honest declaration / 诚实声明**（§7.4 #5）：**技术 1.0**（稳定 API + 迁移契约）与**市场验证后置**（External developer validation = 1.0 后增长里程碑）分开表述，不混淆。

---

## 4. Backup & Restore / 备份与恢复

### 4.1 Backup / 备份

```bash
npm run backup
```

- SQLite: `db.backup()` (WAL-safe); PostgreSQL: `pg_dump`
- Output: `data/backups/`, keeps `BACKUP_KEEP=7` rotations
- Files chmod 0600

### 4.2 Restore / 恢复

```bash
npm run restore -- <file>    # ⚠️ stop the app first / 先停应用
```

> Restore is destructive — stop the application before restoring / 恢复有破坏性，务必先停止应用。

---

## 5. Observability / 可观测性

### 5.1 Stack / 组件栈

```bash
docker compose -f docker-compose.observability.yml up -d
```

| Component / 组件 | Port / 端口 | Purpose / 用途 |
|-----------------|-------------|----------------|
| Prometheus | 9090 | Scrapes `server:3000/api/v1/metrics` |
| Grafana | 3001 | Dashboards + alerts (anonymous read-only / 匿名只读) |
| Jaeger | 16686 (UI) / 4318 (OTLP) | OpenTelemetry traces |
| Loki | 3100 | Centralized pino logs |

### 5.1.1 Quick reference: what each tool answers / 四工具速查：各答什么问题

遇到问题先看管理台「运维」页（一页聚合派生告警/指标/近 24h 错误/7 天趋势，无需登录四套系统）；深入定位时按问题选工具：

| Problem you have / 你遇到什么问题 | Use / 用它 | Example / 示例 |
|------|------|------|
| 服务与依赖还正常吗？当前有哪些异常告警？ | 管理台「运维」页 / `GET /admin/ops/summary` | 派生告警（错误率/Redis/5xx）、7 天操作趋势 |
| 当前指标数值（QPS / 错误率 / P95 / 并发） | Prometheus | `rate(http_requests_total[5m])` |
| 指标可视化看板 + 告警通知 | Grafana | ServerDown / High error rate / High latency 规则 |
| 一次请求内部调用链（慢在哪一环节） | Jaeger | 按 service/operation 查 trace 瀑布图 |
| 结构化错误日志检索 | Loki | `{service="server"} |= "ERROR"` |

### 5.2 Alert Rules / 告警规则

`infra/observability/prometheus/rules/server-alerts.yml`:
- ServerDown (critical, 1m unreachable)
- High error rate (5xx > 10% for 5m)
- High latency (P95 > 1s for 5m)
- High concurrency (in-flight > 100 for 5m)

### 5.3 Enabling Tracing & Logs / 启用追踪与日志

```bash
OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
LOKI_ENABLED=true LOKI_URL=http://localhost:3100 \
npm run start:dev
```

- Loki label: `app=keelbase-server`
- Full compose: `docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build` (update Prometheus targets to `server:3000`)

---

## 6. CI & Release Workflow / CI 与发布流程

### 6.1 CI Pipeline / CI 流水线

CI runs on **GitHub Actions** (repo mirrored to GitHub). Triggered by push to `main`.

`.github/workflows/ci.yml`:
- Backend lint + unit + E2E tests + build
- Admin console build
- Flutter analyze + test
- Migration consistency check

### 6.2 Dual-Remote Push / 双远程推送

```bash
git push github master:main    # GitHub (triggers CI) / GitHub 触发 CI
git push origin master         # Gitee
```

> GitHub only uses `main` (master is blocked by pre-push hook). Gitee uses `master` / GitHub 统一走 main，Gitee 保持 master。

### 6.3 Release Steps / 发布步骤

1. Commit + test locally / 本地提交并测试
2. Push dual-remotes / 推送双远程
3. Monitor GitHub Actions / 查看 CI 结果
4. Deploy via Docker / Docker 部署

---

## 7. Troubleshooting / 故障排查

| Symptom / 现象 | Cause & Fix / 原因与解决 |
|----------------|--------------------------|
| CI fails on migration check / CI 迁移一致性失败 | Entity drift — generate a new migration |
| Email not sent / 邮件未发送 | `MAIL_ENABLED=true` + valid SMTP creds |
| Cache not working / 缓存不生效 | Check Redis up + `CACHE_ENABLED=true` |
| Queue jobs not running / 队列任务不执行 | Check Redis + `QUEUE_ENABLED=true` |
| Traces missing in Jaeger / 无链路数据 | `OTEL_ENABLED=true`; tracing-init must be first import in main.ts |
| Metrics empty / 指标为空 | Prometheus target reachable at `/api/v1/metrics` |
