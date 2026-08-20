#!/usr/bin/env bash
#
# KeelBase 合成陌生人挑战 runner（W3）：干净 clone + 起后端 + 打印挑战卡 + 记录模板。
#
# 用法：
#   ./scripts/challenge/run.sh                    # 干净 clone 到临时目录 + 打印挑战卡
#   REPO=git@github.com:rain6fish/KeelBase.git ./scripts/challenge/run.sh
#   ./scripts/challenge/run.sh /path/to/existing-clone   # 用已有 clone（跳过克隆）
#
# 说明：挑战目的是测 onboarding 卡点（Where stuck/Why/Missing），所以默认从干净 clone 开始，
# 执行者（无上下文 AI / 外部开发者）只按 README/文档操作，不提前看源码内部。
set -euo pipefail
cd "$(dirname "$0")/../.."

REPO="${REPO:-$(git remote get-url github 2>/dev/null || echo .)}"
WORK=$(mktemp -d)
CLONE_DIR="${1:-$WORK/keelbase}"

echo "═══ KeelBase 合成陌生人挑战 ═══"
echo "目标：30min Build（生成业务模块）+ 60min Business（AI 安全完成任务），记录 onboarding 卡点"
echo ""

# ── 1. 干净 clone ────────────────────────────────────────────────────────────
if [ "$1" = "" ]; then
  echo "→ 从 $REPO 干净 clone 到 $CLONE_DIR ..."
  git clone --depth 1 "$REPO" "$CLONE_DIR" >/dev/null 2>&1 || { echo "✗ clone 失败（网络？）——可改用已有 clone：$0 /path/to/clone"; exit 1; }
  echo "  ✓ clone 完成（$(du -sh "$CLONE_DIR" 2>/dev/null | cut -f1)）"
else
  echo "→ 使用已有 clone：$CLONE_DIR"
fi

# ── 2. 后端就绪（可选：环境有 Redis/Docker 时自动起；否则提示手动）────────────
echo ""
echo "→ 后端启动（挑战 2/4 需后端可访问）"
BACKEND_URL="http://localhost:3000/api/v1"
if curl -s -m 3 "$BACKEND_URL/health" >/dev/null 2>&1; then
  echo "  ✓ 后端已在跑（$BACKEND_URL）"
else
  echo "  ⚠ 后端未运行。请按 README 启动（单容器最快）或本地开发："
  echo "    cd $CLONE_DIR && docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest"
  echo "    # 或本地：cd Server-NestJS && npm ci && npm run build && node dist/main.js"
  echo "  （若在 CI/无 Docker 环境，可先跳过，仅做 Build 前半段 + 记录卡点）"
fi

# ── 3. 打印挑战卡 + 记录模板 ─────────────────────────────────────────────────
echo ""
echo "═══ 挑战卡（复制以下内容给执行者）═══"
cat scripts/challenge/stranger-challenge.md
echo ""
echo "═══ 记录模板（交回反馈）═══"
cat > "$CLONE_DIR/challenge-feedback.md" <<'EOF'
# 挑战反馈表
| 步骤 | 用时 (min) | Where stuck | Why stuck | Missing abstraction |
|------|-----------|-------------|-----------|---------------------|
| Build-1 找命令 | | | | |
| Build-2 生成 | | | | |
| Build-3 编译 | | | | |
| Build-4 管理台 | | | | |
| Build-5 AI 查询 | | | | |
| Business 写任务 | | | | |

30min Build 完成? Y/N
60min Business 完成? Y/N
Would use again? Y/N + 一句话：
EOF
echo "  ✓ 已生成 $CLONE_DIR/challenge-feedback.md"
echo ""
echo "完成挑战后，把反馈表交回（或运行 ${0} 重新挑战）。"
