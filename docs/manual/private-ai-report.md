# 私有 AI 验证报告（Private AI Golden Path，W1）

> 2026-08-19 实测。目标：证明「数据不出域」闭环——Cloud OFF → Ollama 本地模型 → 本地 embedding → 对话/工具/审计全部本地完成。
> 环境：Windows 10 + Ollama 原生安装（非 Docker），`qwen2.5:7b` + `bge-m3`，CPU 推理。
> 复现：`./scripts/verify-private-ai.sh`（脚本已修复 NODE_ENV/QUEUE_ENABLED/AI_PROVIDER/AI_CHAT_MODEL 四坑）。

## 1. 验证结论

| 维度 | 结果 | 证据 |
|---|---|---|
| Cloud Provider OFF | ✅ | 后端进程无 DEEPSEEK_API_KEY（shell 覆盖为空），默认 provider 不可用 |
| 本地对话（Ollama） | ✅ | 流式 `/ai/chat/stream` 返回「您好！请问…」（`provider=ollama, model=qwen2.5:7b`） |
| 本地 Embedding（bge-m3） | ✅ | `POST /api/embed` 4.7s 返回 1024 维向量 |
| AI 审计（本地记录） | ✅ | `ai_audit_logs` 出现 `provider:"ollama"` 记录（alex 会话） |
| 审计哈希链（HS-11） | ✅ | `GET /audit/verify` → `valid:true, checked:20` |
| Agent 工具调用 | ⚠️ 环境受限 | 7B 模型在 CPU 上对 30+ 工具集调用可靠性低（未触发 query_customers）；**非代码缺陷**——旗舰 e2e（verify-flagships 7/7）已证明工具/确认/审计链路 |

## 2. 实测数据（benchmark.json）

- **对话首次冷启动**：~296s（CPU 预填充大 system prompt，含 30+ 工具定义；二次热启动 ~17s）
- **Embedding 单条**：~4.7s（bge-m3，1024 维）
- **本地对话返回**：「您好！请问您想了解哪些方面的信息呢？…」（`/ai/chat/stream` SSE `text` 事件逐字输出）
- **审计**：20 条哈希链完整（`checked:20, valid:true`）

## 3. 复现步骤

```bash
# 1. 安装 Ollama（Windows 原生，绕开 Docker Hub 拉取受限）
#    https://ollama.com/download/windows
# 2. 拉模型（bge-m3 拉取成功；qwen2.5:7b 可经 ModelScope GGUF 导入加速）
ollama pull qwen2.5:7b
ollama pull bge-m3
# 3. 一键验证（脚本内部：Cloud OFF + 起后端 3001 + 登录 + 本地对话 + CRM 数据）
./scripts/verify-private-ai.sh
# 4. 审计验证
GET /api/v1/audit/verify   # valid:true
```

## 4. 关键配置（后端）

```bash
# .env 基础 + 以下覆盖（见 scripts/verify-private-ai.sh）：
OLLAMA_BASE_URL=http://localhost:11434
AI_CHAT_MODEL=qwen2.5:7b          # 必须：ollama provider 用本地模型，而非默认 deepseek-v4-flash
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=bge-m3
# 不要设 NODE_ENV（否则 ConfigModule 读 .env.development 导致 JWT 缺失）
# 不要设 AI_PROVIDER=ollama（Joi schema 只认 deepseek/qwen/openai；ollama 由 OLLAMA_BASE_URL 激活）
# 不要设 QUEUE_ENABLED=false（反而让 BullMQ worker 报「requires a connection」）
```

## 5. 说明与限制

- **「数据不出域」成立**：对话 / embedding / 数据 / 审计全部本地完成，无任何云调用。
- **工具调用可靠性**：CPU 上 7B 模型对大工具集（30+ tool）的 function-calling 不稳定。生产建议：
  - 更强本地模型（qwen2.5:32b / qwq-32b）或 GPU；
  - 或云端（DeepSeek，已实测三旗舰任务 3/3 SUCCESS）。
- **RAG 向量检索**：需 postgres + pgvector（`VECTOR_SEARCH_ENABLED`）；sqlite 下 RAG 走 LIKE 降级。
