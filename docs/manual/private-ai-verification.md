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
# .env.private-ai 中显式设置：
#   AI_PROVIDER=ollama
#   OLLAMA_BASE_URL=http://localhost:11434
#   EMBEDDING_BASE_URL=http://localhost:11434/v1
#   EMBEDDING_API_KEY=ollama
#   EMBEDDING_MODEL=bge-m3
# 确认无 DEEPSEEK_API_KEY（脚本已自动移除）
```

### 3. 起后端（开发模式）

```bash
NODE_ENV=development AI_PROVIDER=ollama OLLAMA_BASE_URL=http://localhost:11434 \
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
curl -s http://localhost:3000/api/v1/audit/logs/verify \
  -H "Authorization: Bearer $TOKEN"
```

**预期**：`{ valid: true }`——本次 AI 对话/工具调用已落 `ai_audit_logs` 且哈希链完整（HS-11）。

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
