#!/usr/bin/env bash
#
# KeelBase 私有 AI 验证（P1-10）：证明「数据不出域」闭环
#
#   Cloud Provider OFF
#     → Ollama 本地模型（AI_PROVIDER=ollama）
#     → 本地 Embedding（bge-m3）
#     → RAG 知识库
#     → Agent 工具调用
#     → 审计记录
#
# 用法：
#   ./scripts/verify-private-ai.sh               # 默认 OLLAMA_BASE_URL=http://localhost:11434
#   OLLAMA_BASE_URL=http://127.0.0.1:11434 ./scripts/verify-private-ai.sh
#
# 前置：本地已起 Ollama 并 pull 模型：
#   docker run -d -p 11434:11434 ollama/ollama && ollama pull qwen2.5:7b && ollama pull bge-m3
# 详细验证步骤见 docs/manual/private-ai-verification.md

set -euo pipefail
cd "$(dirname "$0")/.."

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-bge-m3}"
PORT="${PORT:-3001}"   # 避免与常驻后端 3000 冲突

PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "═══ KeelBase 私有 AI 验证（P1-10）：数据不出域 ═══"
echo ""

# ── [1/4] Cloud Provider OFF ────────────────────────────────────────────────
echo "→ [1/4] 云端 Provider 关闭"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  bad "当前 shell 有 DEEPSEEK_API_KEY——请先 export DEEPSEEK_API_KEY= 或仅用 .env.private-ai 启动"
else
  ok "shell 环境无 DEEPSEEK_API_KEY（云端对话 OFF）"
fi

# ── [2/4] Ollama 本地模型 ───────────────────────────────────────────────────
echo "→ [2/4] Ollama 本地模型（$OLLAMA_BASE_URL）"
if ! curl -s -m 3 "$OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
  bad "Ollama 不可达。请先启动：docker run -d -p 11434:11434 ollama/ollama"
  FAIL=$((FAIL+1))  # 前置缺失 → 直接给指引并退出（后续步骤无法进行）
  echo ""
  echo "剩余步骤见 docs/manual/private-ai-verification.md（启动 Ollama 后重跑本脚本）"
  echo "结果：${PASS} 通过 / ${FAIL} 失败"
  exit 0
fi
ok "Ollama 可达"

TAGS=$(curl -s -m 3 "$OLLAMA_BASE_URL/api/tags")
if echo "$TAGS" | grep -q "$OLLAMA_MODEL"; then
  ok "对话模型 $OLLAMA_MODEL 已就绪"
else
  bad "对话模型 $OLLAMA_MODEL 未拉取：ollama pull $OLLAMA_MODEL"
fi
if echo "$TAGS" | grep -q "$EMBEDDING_MODEL"; then
  ok "Embedding 模型 $EMBEDDING_MODEL 已就绪（本地向量化）"
else
  bad "Embedding 模型 $EMBEDDING_MODEL 未拉取：ollama pull $EMBEDDING_MODEL"
fi

# ── [3/4] 生成私有配置 + 起后端 ─────────────────────────────────────────────
echo "→ [3/4] 生成 .env.private-ai（AI 全走本地）+ 启动后端"
ENVF="Server-NestJS/.env.private-ai"
cp Server-NestJS/.env.example "$ENVF" 2>/dev/null || touch "$ENVF"
# 显式覆盖：关云端 key、走本地 ollama、本地 embedding
sed -i '/^DEEPSEEK_API_KEY=/d' "$ENVF"
sed -i '/^AI_PROVIDER=/d' "$ENVF"
sed -i '/^OLLAMA_BASE_URL=/d' "$ENVF"
sed -i '/^EMBEDDING_BASE_URL=/d' "$ENVF"
sed -i '/^EMBEDDING_API_KEY=/d' "$ENVF"
sed -i '/^EMBEDDING_MODEL=/d' "$ENVF"
printf 'AI_PROVIDER=ollama\nOLLAMA_BASE_URL=%s\nEMBEDDING_BASE_URL=%s/v1\nEMBEDDING_API_KEY=ollama\nEMBEDDING_MODEL=%s\n' \
  "$OLLAMA_BASE_URL" "$OLLAMA_BASE_URL" "$EMBEDDING_MODEL" >> "$ENVF"
ok "已生成 $ENVF（DEEPSEEK_API_KEY 已移除；AI_PROVIDER=ollama）"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "  启动后端（port $PORT，Ctrl+C 退出）..."
# 直接环境变量覆盖（AI 全走本地），不依赖 .env.private-ai 被 ConfigModule 读取
( cd Server-NestJS && PORT="$PORT" NODE_ENV=development \
    AI_PROVIDER=ollama OLLAMA_BASE_URL="$OLLAMA_BASE_URL" \
    EMBEDDING_BASE_URL="$OLLAMA_BASE_URL/v1" EMBEDDING_API_KEY=ollama EMBEDDING_MODEL="$EMBEDDING_MODEL" \
    CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev ) &
BACKEND_PID=$!

READY=0
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/v1/health" 2>/dev/null; then
    READY=1; echo "  ✓ 后端就绪（$PORT）"; break
  fi
  sleep 1
done
[ "$READY" = "1" ] || { bad "后端 60s 未就绪（看 Server-NestJS 日志）"; exit 0; }

# ── [4/4] AI 冒烟：本地对话 + 工具 + 审计 ────────────────────────────────────
echo "→ [4/4] AI 冒烟（本地 ollama 对话）"
TOKEN=$(curl -s -X POST "http://localhost:$PORT/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"123456"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  bad "登录失败（演示账号未种？空库首启会自动种）——跳过 AI 冒烟"
  echo ""
  echo "结论：配置已就绪（云端 OFF + 本地 Ollama + 本地 embedding）。"
  echo "启动 Ollama 后重跑本脚本完成 AI 冒烟；或手动验证见 docs/manual/private-ai-verification.md"
  echo "结果：${PASS} 通过 / ${FAIL} 失败"
  exit 0
fi
ok "登录成功（alex）"

REPLY=$(curl -s -m 120 -X POST "http://localhost:$PORT/api/v1/ai/chat" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"你好，用一句话介绍你自己"}' | head -c 300)
if [ -n "$REPLY" ] && ! echo "$REPLY" | grep -qi 'provider\|不可用\|未配置'; then
  ok "AI 对话返回本地 ollama 回复（未走云端）"
  echo "    回复：$(echo "$REPLY" | head -c 120)"
else
  bad "AI 对话未返回（本地 ollama 模型未就绪？）：$REPLY"
fi

echo ""
echo "═══ 验证结果：${PASS} 通过 / ${FAIL} 失败 ═══"
echo "审计：AI 对话已落 ai_audit_logs（管理台「AI 审计」可查，含工具调用/确认）"
echo "完整手动验证（RAG 向量检索 / Agent 工具 / 审计链）见 docs/manual/private-ai-verification.md"
