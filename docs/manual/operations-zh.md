# 运维手册

> KeelBase — 面向运维人员的部署、环境变量、备份恢复与可观测性指南。

相关手册：
- [使用手册](usage.md)
- [开发手册](development.md)

---

## 1. 环境配置

### 1.1 配置文件

```
.env                  # 默认（开发，SQLite）
.env.staging          # 预发布（PostgreSQL）
.env.production       # 生产（PostgreSQL）
```

### 1.2 核心变量

| 变量 | 默认值 | 用途 |
|-----------------|----------------|----------------|
| `NODE_ENV` | `development` | development/staging/production |
| `PORT` | `3000` | API 服务端口 |
| `CORS_ORIGINS` | `*` | CORS 白名单（生产改为具体域名） |
| `JWT_SECRET` | — | ≥32 字符 |
| `JWT_REFRESH_SECRET` | — | ≥32 字符 |
| `DB_TYPE` | `sqlite` | sqlite（开发）/ postgres（生产） |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | localhost / 5432 / front | PostgreSQL 连接 |
| `ENCRYPTION_KEY` | — | AES-256-GCM 静态加密的 32 字节 hex 密钥 |
| `ENCRYPTION_HMAC_KEY` | — | providerHash 派生密钥（缺省回退 ENCRYPTION_KEY） |

### 1.3 可选功能

| 变量 | 默认值 | 用途 |
|-----------------|----------------|----------------|
| `MAIL_ENABLED` | `false` | 启用 SMTP 邮件（验证/重置/通知） |
| `SMTP_HOST/PORT/USER/PASS/FROM` | — | SMTP 服务器 |
| `APP_BASE_URL` | `http://localhost:8080` | 密码重置链接的前端地址 |
| `STORAGE_DRIVER` | `local` | local / s3（MinIO/OSS 兼容） |
| `PUSH_DRIVER` | `none` | none / jpush（极光设备推送） |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接 |
| `CACHE_ENABLED` | `true` | Redis 缓存层开关 |
| `CACHE_TTL` | `300` | 默认缓存 TTL（秒） |
| `QUEUE_ENABLED` | `true` | BullMQ 异步队列（false = 同步降级） |
| `OTEL_ENABLED` | `false` | OpenTelemetry 链路追踪 |
| `LOKI_ENABLED` | `false` | 把 pino 日志推送到 Loki |

完整参考见 `Server-NestJS/.env.example`。

---

## 2. 部署

### 2.1 Docker 生产部署

```bash
# 1. 准备证书
mkdir certs && cp your-cert.crt certs/server.crt && cp your-key.key certs/server.key

# 2. 配置生产环境
cp Server-NestJS/.env.production.example Server-NestJS/.env.production
# 填写真实值

# 3. 启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

**组件栈**：PostgreSQL 17 + Redis + NestJS API + Nginx（Flutter web）。以非 root（`keelbase` 用户）运行。

### 2.2 生产设置

- `synchronize: false`、`migrationsRun: true`
- 禁用 Swagger（仅开发环境）
- 经 `nginx.https.conf` 启用 HSTS
- CORS 设为具体域名

### 2.3 管理台部署

```bash
cd Web-Admin-Vue
npm run build    # → dist/（base=/admin/）
```

将 `dist/` 作为静态文件托管。建议独立域名（如 `admin.example.com`）+ 可选 IP 白名单/VPN/MFA。

---

## 3. 数据库迁移

```bash
# 生成迁移
npm run migration:generate -- src/migrations/YourMigrationName

# 执行迁移
npm run migration:run
```

- 开发：`synchronize: true`（自动同步）
- 生产：`synchronize: false`，手动执行迁移
- CI 校验迁移一致性：跑 baseline + `migration:generate`，有漂移即失败

### 3.1 v1.0 兼容与升级政策

> 1.0 Candidate Exit Criteria #10（`release-1.0-candidate.md` §3）。

**版本契约**：v1.0 为首个稳定发布。REST API（`/api/v1`）与 AI 工具契约（工具名/参数）在 v1.x 内**向后兼容（additive only）**——新增为兼容，破坏性变更进大版本。

**数据模式**：所有 schema 变更以**双驱动 TypeORM 迁移**（SQLite + PostgreSQL）发布；生产 `synchronize: false` + `migrationsRun: true`（无自动同步漂移）；CI 强制迁移一致性（baseline + `migration:generate`，有漂移即失败）。

**升级路径 v0.9.x → v1.0**：
1. 备份：`npm run backup`
2. 拉取 v1.0 → `npm run build`
3. 应用迁移：`npm run migration:run`
4. 验证：`npm run healthcheck` + `npm run test:e2e`

无需数据迁移——只要此前一直在跑迁移（schema 由迁移驱动）；`synchronize: true` 的开发库需对全新 baseline 跑一次 `migration:generate` 并对齐。

**兼容性声明**：
- REST：v1.x 内 additive-only，废弃端点记入 CHANGELOG；
- 环境变量：新变量带默认值（见 `.env.example`），删除仅在大版本；
- `Settings` 动态配置：key 稳定，未知 key 忽略；
- AI Agent 运行时（工具注册 / 确认 / 审计）为稳定契约，供插件/扩展依赖。

**诚实声明**（§7.4 #5）：**技术 1.0**（稳定 API + 迁移契约）与**市场验证后置**（External developer validation = 1.0 后增长里程碑）分开表述，不混淆。

---

## 4. 备份与恢复

### 4.1 备份

```bash
npm run backup
```

- SQLite：`db.backup()`（WAL 安全）；PostgreSQL：`pg_dump`
- 输出：`data/backups/`，保留 `BACKUP_KEEP=7` 份轮转
- 文件 chmod 0600

### 4.2 恢复

```bash
npm run restore -- <file>    # ⚠️ 先停应用
```

> 恢复有破坏性，务必先停止应用。

---

## 5. 可观测性

### 5.1 组件栈

```bash
docker compose -f docker-compose.observability.yml up -d
```

| 组件 | 端口 | 用途 |
|-----------------|-------------|----------------|
| Prometheus | 9090 | 抓取 `server:3000/api/v1/metrics` |
| Grafana | 3001 | 看板 + 告警（匿名只读） |
| Jaeger | 16686 (UI) / 4318 (OTLP) | OpenTelemetry 链路 |
| Loki | 3100 | 集中式 pino 日志 |

### 5.1.1 四工具速查：各答什么问题

遇到问题先看管理台「运维」页（一页聚合派生告警/指标/近 24h 错误/7 天趋势，无需登录四套系统）；深入定位时按问题选工具：

| 你遇到什么问题 | 用它 | 示例 |
|------|------|------|
| 服务与依赖还正常吗？当前有哪些异常告警？ | 管理台「运维」页 / `GET /admin/ops/summary` | 派生告警（错误率/Redis/5xx）、7 天操作趋势 |
| 当前指标数值（QPS / 错误率 / P95 / 并发） | Prometheus | `rate(http_requests_total[5m])` |
| 指标可视化看板 + 告警通知 | Grafana | ServerDown / High error rate / High latency 规则 |
| 一次请求内部调用链（慢在哪一环节） | Jaeger | 按 service/operation 查 trace 瀑布图 |
| 结构化错误日志检索 | Loki | `{service="server"} |= "ERROR"` |

### 5.2 告警规则

`infra/observability/prometheus/rules/server-alerts.yml`：
- ServerDown（critical，1 分钟不可达）
- High error rate（5xx > 10% 持续 5 分钟）
- High latency（P95 > 1s 持续 5 分钟）
- High concurrency（in-flight > 100 持续 5 分钟）

### 5.3 启用追踪与日志

```bash
OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
LOKI_ENABLED=true LOKI_URL=http://localhost:3100 \
npm run start:dev
```

- Loki label：`app=keelbase-server`
- 完整编排：`docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build`（更新 Prometheus targets 为 `server:3000`）

---

## 6. CI 与发布流程

### 6.1 CI 流水线

CI 运行在 **GitHub Actions**（仓库镜像到 GitHub），push 到 `main` 触发。

`.github/workflows/ci.yml`：
- 后端 lint + 单元 + E2E 测试 + 构建
- 管理台构建
- Flutter analyze + test
- 迁移一致性检查

### 6.2 双远程推送

```bash
git push github master:main    # GitHub（触发 CI）
git push origin master         # Gitee
```

> GitHub 统一走 main，Gitee 保持 master（pre-push hook 拦截 master 推 GitHub）。

### 6.3 发布步骤

1. 本地提交并测试
2. 推送双远程
3. 查看 CI 结果
4. Docker 部署

---

## 7. 故障排查

| 现象 | 原因与解决 |
|----------------|--------------------------|
| CI 迁移一致性失败 | 实体漂移——生成新迁移 |
| 邮件未发送 | `MAIL_ENABLED=true` + 有效 SMTP 凭据 |
| 缓存不生效 | 检查 Redis 起来 + `CACHE_ENABLED=true` |
| 队列任务不执行 | 检查 Redis + `QUEUE_ENABLED=true` |
| Jaeger 无链路数据 | `OTEL_ENABLED=true`；tracing-init 必须是 main.ts 的第一个 import |
| 指标为空 | Prometheus target 可访问 `/api/v1/metrics` |
