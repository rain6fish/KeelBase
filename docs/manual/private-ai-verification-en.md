# Private AI Verification (P1-10) — the Data-Stays-In-Perimeter Loop

> Goal: **prove KeelBase's full AI chain can run with zero cloud calls** — chat, tool calls, RAG vector search, and audit all complete on the local machine.
> Aligned with the "data sovereignty / privatization" positioning: once `OLLAMA_BASE_URL` is configured, the local ollama provider auto-registers (no key); with `AI_PROVIDER=ollama`, chat/tools all go local; vector search automatically uses local embeddings (bge-m3); when the cloud is available, a degradation chain is formed.

## The Verified Loop

```text
Cloud Provider OFF
  ↓
Ollama / Local Model (AI_PROVIDER=ollama)
  ↓
Local Embedding (bge-m3, /v1/embeddings)
  ↓
RAG knowledge base
  ↓
Agent Tool calls
  ↓
Audit (HS-11 hash chain)
```

## Quick Verification (one-command script)

```bash
./scripts/verify-private-ai.sh
```

The script automatically: detects Cloud OFF + Ollama reachable + models ready → generates `.env.private-ai` → starts the backend → signs in → AI chat smoke test, and outputs a "data never leaves" verification report.

**Prerequisites** (Docker or Ollama installed locally):

```bash
docker run -d -p 11434:11434 ollama/ollama
ollama pull qwen2.5:7b      # chat model (any OpenAI-compatible local model works)
ollama pull bge-m3          # local embedding
```

## Manual Verification Steps

### 1. Cloud Provider OFF

Confirm `Server-NestJS/.env` **does not contain** `DEEPSEEK_API_KEY` (or temporarily `export DEEPSEEK_API_KEY=` to clear it).

```bash
grep DEEPSEEK_API_KEY Server-NestJS/.env   # should have no output
```

### 2. Local AI Configuration

```bash
cd Server-NestJS
cp .env.example .env.private-ai
# set explicitly in .env.private-ai (2026-08-19 fix: AI_PROVIDER=ollama is rejected by the Joi schema):
#   OLLAMA_BASE_URL=http://localhost:11434     ← activates the local ollama provider
#   AI_CHAT_MODEL=qwen2.5:7b                   ← required: the ollama provider uses a local model, not the default deepseek-v4-flash
#   EMBEDDING_BASE_URL=http://localhost:11434/v1
#   EMBEDDING_API_KEY=ollama
#   EMBEDDING_MODEL=bge-m3
# confirm no DEEPSEEK_API_KEY (the script removes it automatically)
```

### 3. Start the Backend (development mode)

```bash
# Note: do not set NODE_ENV (otherwise ConfigModule reads .env.development → missing JWT);
# do not set AI_PROVIDER=ollama (the schema rejects it; ollama is activated by OLLAMA_BASE_URL);
# do not set QUEUE_ENABLED=false (that instead makes the BullMQ worker complain "requires a connection")
OLLAMA_BASE_URL=http://localhost:11434 AI_CHAT_MODEL=qwen2.5:7b \
  EMBEDDING_BASE_URL=http://localhost:11434/v1 EMBEDDING_API_KEY=ollama EMBEDDING_MODEL=bge-m3 \
  npm run start:dev
# health check:
curl http://localhost:3000/api/v1/health?detail=true   # OK when db/redis/storage are normal
```

### 4. AI Chat Goes Local

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"123456"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"Hello, introduce yourself in one sentence"}'
```

**Expected**: a reply from the local ollama model (the backend log shows the provider resolved to `ollama`). If it reports "no provider available", check `AI_PROVIDER=ollama` + `OLLAMA_BASE_URL` and that the model is ready.

### 5. RAG Knowledge Base (local vector search)

```bash
# Query the knowledge base (via RAG): needs an existing knowledge entry first (Admin Console "Knowledge base" or POST /ai/knowledge)
curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"What is the annual-leave policy?"}'
```

**Expected**: hits the knowledge base and cites its content (local embedding enabled; without pgvector, full-text search degrades gracefully but stays local). Verify hits and scores via `GET /ai/knowledge/debug`.

### 6. Agent Tool Calls

```bash
curl -s -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"What events do I have scheduled this month?"}'
```

**Expected**: AI calls the `query_events` tool and returns real data (the Admin Console "AI behavior replay" shows the tool-call timeline).

### 7. Audit (hash chain verifiable)

```bash
curl -s http://localhost:3000/api/v1/audit/verify \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: `{ valid: true }` — this AI chat/tool call already landed in `ai_audit_logs` and the hash chain is intact (HS-11).

## 8. AI CRM Golden Path (Phase 2 Phase 1, business-scenario loop)

Run the complete "data-stays-in-perimeter" business loop on AI CRM (`verify-private-ai.sh` already auto-checks CRM data readability in step 5):

1. Sign in and ask "**which customers deserve follow-up this week?**" — AI calls `query_customers` / `query_customer_orders` / `analyze_customer_risk` (read tools, blue "read" badge, local DB)
2. AI answers "Yunfan Trading has overdue orders and hasn't renewed for two months" → ask "create a follow-up task for Yunfan?"
3. Click "confirm" → AI calls `create_followup_task` (write tool, orange "write" badge) → persisted
4. The tool card shows "confirmed · revocable" → can revoke (own-revoke P0-15)
5. Check this chat/tool call in the Admin Console "AI audit"; `/audit/verify` hash chain intact

**Verification point**: AI operates real business data + write confirmation + audit + revocation, all on the local machine (no cloud).

## Common Issues

| Symptom | Fix |
|---|---|
| Chat reports "Provider not configured / no provider" | Confirm `AI_PROVIDER=ollama` and `OLLAMA_BASE_URL` reachable; `curl $OLLAMA_BASE_URL/api/tags` |
| Model not pulled | `ollama pull qwen2.5:7b` / `ollama pull bge-m3` |
| Vector search degraded to full-text | Local embedding enabled → goes vector; pgvector requires `DB_TYPE=postgres` + `VECTOR_SEARCH_ENABLED=true` |
| Want to verify the "cloud degradation chain" | Configure both `DEEPSEEK_API_KEY` + `OLLAMA_BASE_URL`: cloud works normally when up; on cloud failure, circuit-breaks and degrades to local |

## Related

- [offline-deploy.md](offline-deploy.md) — offline/intranet deployment (image presets + external-dependency degradation)
- [operations.md](operations.md) — operations manual (AI provider configuration)
- [enterprise-capabilities-en.md](../enterprise-capabilities-en.md) — §10 Private AI
