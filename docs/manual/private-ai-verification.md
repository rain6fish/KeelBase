# 私有 AI 验证（P1-10）— 数据不出域闭环

> 目标：**证明 KeelBase 的 AI 全链路可以在「零云端调用」下运行**——对话、工具调用、RAG 向量检索、审计全部在本机完成。
> 对齐「数据主权 / 私有化」定位：`OLLAMA_BASE_URL` 配置后自动注册本地 ollama provider（无 Key）；`AI_PROVIDER=ollama` 时对话/工具全走本地；向量检索自动用本地 embedding（bge-m3）；云端可用时形成降级链。

## 验证闭环

```text
Cloud Provider OFF
  ↓
Ollama / Local Model（AI_PROVIDER=ollama）
  ↓
Local Embedding（bge-m3，/v1/embeddings）
  ↓
RAG 知识库
  ↓
Agent Tool 调用
  ↓
审计（HS-11 哈希链）
```

## 快速验证（一键脚本）

```bash
./scripts/verify-private-ai.sh
```

脚本自动：检测云端 OFF + Ollama 可达 + 模型就绪 → 生成 `.env.private-ai` → 起后端 → 登录 → AI 对话冒烟，输出「数据不出域」验证报告。

**前置**（本地已装 Docker 或 Ollama）：

```bash
docker run -d -p 11434:11434 ollama/ollama
ollama pull qwen2.5:7b      # 对话模型（可用任意 OpenAI 兼容本地模型）
ollama pull bge-m3          # 本地 embedding
```

**方式 B — Docker Compose 编排（P1-3，可选）**：

```bash
docker compose --profile private-ai up -d ollama   # 起本地模型（ollama:11434）
docker compose up -d                                # 起 postgres / redis / server / web
```
> `docker-compose.yml` 已内置 ollama 服务（`profiles: ["private-ai"]`）+ server 的 `OLLAMA_BASE_URL=http://ollama:11434`；`AI_PROVIDER=ollama` 时对话/工具全走本地（数据不出域）。默认 `docker compose up` 不起 ollama（避免国内拉镜像）。中国网络拉 Docker Hub `ollama/ollama` 可能受限——也可用宿主机原生 Ollama（方式 A，`OLLAMA_BASE_URL=http://host.docker.internal:11434`）。

## 手动验证步骤

### 1. Cloud Provider OFF

确认 `Server-NestJS/.env` **不含** `DEEPSEEK_API_KEY`（或临时 `export DEEPSEEK_API_KEY=` 清空）。

```bash
grep DEEPSEEK_API_KEY Server-NestJS/.env   # 应无输出
```

### 2. 本地 AI 配置

```bash
cd Server-NestJS
cp .env.example .env.private-ai
# .env.private-ai 中显式设置（2026-08-19 修正：AI_PROVIDER=ollama 会被 Joi schema 拒绝）：
#   OLLAMA_BASE_URL=http://localhost:11434     ← 激活本地 ollama provider
#   AI_CHAT_MODEL=qwen2.5:7b                   ← 必须：ollama provider 用本地模型，而非默认 deepseek-v4-flash
#   EMBEDDING_BASE_URL=http://localhost:11434/v1
#   EMBEDDING_API_KEY=ollama
#   EMBEDDING_MODEL=bge-m3
# 确认无 DEEPSEEK_API_KEY（脚本已自动移除）
```

### 3. 起后端（开发模式）

```bash
# 注意：不要设 NODE_ENV（否则 ConfigModule 读 .env.development 导致 JWT 缺失）；
# 不要设 AI_PROVIDER=ollama（schema 拒绝，ollama 由 OLLAMA_BASE_URL 激活）；
# 不要设 QUEUE_ENABLED=false（反而让 BullMQ worker 报「requires a connection」）
OLLAMA_BASE_URL=http://localhost:11434 AI_CHAT_MODEL=qwen2.5:7b \
  EMBEDDING_BASE_URL=http://localhost:11434/v1 EMBEDDING_API_KEY=ollama EMBEDDING_MODEL=bge-m3 \
  npm run start:dev
# 健康检查：
curl http://localhost:3000/api/v1/health?detail=true   # db/redis/storage 正常即 OK
```

### 4. AI 对话走本地

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"123456"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"你好，用一句话介绍你自己"}'
```

**预期**：返回 ollama 本地模型的回复（后端日志可见 provider 解析为 `ollama`）。若报「无 provider 可用」，检查 `AI_PROVIDER=ollama` + `OLLAMA_BASE_URL` 与模型就绪。

### 5. RAG 知识库（本地向量检索）

```bash
# 查询知识库（走 RAG）：需先有知识条目（管理台「知识库」或 POST /ai/knowledge）
curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"年假政策是什么？"}'
```

**预期**：命中知识库并引用内容（本地 embedding 已启用；无 pgvector 时全文检索降级，仍本地）。验证 `GET /ai/knowledge/debug` 看检索命中与分数。

### 6. Agent 工具调用

```bash
curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"我这个月有哪些事件安排？"}'
```

**预期**：AI 调用 `query_events` 工具返回真实数据（管理台「AI 行为回放」可见工具调用时间线）。

### 7. 审计（哈希链可验证）

```bash
curl -s http://localhost:3000/api/v1/audit/verify \
  -H "Authorization: Bearer $TOKEN"
```

**预期**：`{ valid: true }`——本次 AI 对话/工具调用已落 `ai_audit_logs` 且哈希链完整（HS-11）。

## 8. AI CRM Golden Path（阶段 2 Phase 1，业务场景闭环）

在 AI CRM 上跑通「数据不出域」完整业务闭环（`verify-private-ai.sh` 已含第 5 步自动校验 CRM 数据可读）：

1. 登录后问 AI「**哪些客户本周最值得跟进？**」——AI 调 `query_customers` / `query_customer_orders` / `analyze_customer_risk`（读工具，蓝色「读」徽标，本地库）
2. AI 回答「云帆商贸有逾期订单且连续两月未续约」→ 问「要为云帆创建跟进任务吗？」
3. 点「确认」→ AI 调 `create_followup_task`（写工具，橙色「写」徽标）→ 落库
4. 工具卡显示「已确认 · 可撤销」→ 可撤销（本人 P0-15）
5. 管理台「AI 审计」查这次对话/工具调用，`/audit/verify` 哈希链完整

**验证点**：AI 操作真实业务数据 + 写操作确认 + 审计 + 撤销，全部在本机（无云端）。

## 常见问题

| 现象 | 处理 |
|---|---|
| 对话报「Provider 未配置 / 无 provider」 | 确认 `AI_PROVIDER=ollama` 且 `OLLAMA_BASE_URL` 可达；`curl $OLLAMA_BASE_URL/api/tags` |
| 模型未拉取 | `ollama pull qwen2.5:7b` / `ollama pull bge-m3` |
| 向量检索降级全文 | 本地 embedding 已启用即走向量；pgvector 需 `DB_TYPE=postgres` + `VECTOR_SEARCH_ENABLED=true` |
| 想验证「云端降级链」 | 同时配 `DEEPSEEK_API_KEY` + `OLLAMA_BASE_URL`：云端正常走云端，云端故障熔断后降级本地 |

## 相关

- [offline-deploy.md](offline-deploy.md) — 离线/内网部署（镜像预置 + 外部依赖降级）
- [operations.md](operations.md) — 运维手册（AI provider 配置）
- [enterprise-capabilities.md](../enterprise-capabilities.md) — §10 私有 AI
