#!/usr/bin/env bash
#
# ShiYu-AppBase 一键体验脚本（傻瓜化）
#
# 目标：一条命令让零基础用户跑起来，不用看文档。
# 默认「本地开发模式」（零依赖，SQLite 免配），可选 Docker 模式。
#
# 用法：
#   ./deploy/experience.sh                # 本地模式：后端 + 管理台
#   FLUTTER=1 ./deploy/experience.sh      # 额外起 Flutter Web 主 App
#   DOCKER=1 ./deploy/experience.sh       # Docker 模式：一键起全部
#
# 端口：后端默认 3000、管理台默认 10086、Flutter 默认自动分配。
# 被占用时自动向上找空闲端口，避免「端口冲突」卡住新手。
#
# 结束时打印演示账号与访问地址。

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "==============================================="
echo "  ShiYu-AppBase 一键体验"
echo "==============================================="

# ── 工具函数 ───────────────────────────────────────────────
# 找空闲端口：从 preferred 起向上探测（默认 +20 范围内）
pick_port() {
  local preferred="$1"
  local port="$preferred"
  for _ in $(seq 0 20); do
    if ! (exec 3<>/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
      exec 3>&- 2>/dev/null || true
      echo "$port"
      return 0
    fi
    exec 3>&- 2>/dev/null || true
    port=$((port + 1))
  done
  echo "$preferred"
}

# ── Docker 模式：最简单，只需 Docker ───────────────────────
if [ "${DOCKER:-0}" = "1" ]; then
  command -v docker >/dev/null 2>&1 || { echo "✗ 需要 Docker。安装: https://www.docker.com/products/docker-desktop/"; exit 1; }
  echo "→ 用 Docker 一键起服务（首次构建约 10 分钟）..."
  docker compose up --build -d
  echo "→ 等待后端就绪..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
      break
    fi
    sleep 3
  done
  cat <<'EOF'

🎉 全部启动完成！

  主 App    http://localhost
  后端 API  http://localhost:3000  （Swagger: /api/docs）
  健康检查  http://localhost:3000/api/v1/health

  演示账号：
    普通用户  alex / 123456
    管理员    admin / Admin@1234 （管理台 http://localhost/admin 需自行部署管理台）

  停止：docker compose down
EOF
  exit 0
fi

# ── 本地开发模式 ───────────────────────────────────────────
# 检查 Node
command -v node >/dev/null 2>&1 || { echo "✗ 未找到 Node.js。安装: https://nodejs.org/ (≥22)"; exit 1; }
echo "✓ Node $(node -v)"

# ── 1. 后端（自动探测端口）────────────────────────────────
BACKEND_PORT=$(pick_port "${BACKEND_PORT:-3000}")
echo ""
echo "→ 启动后端（SQLite 零配置，首次自动建演示账号，端口 $BACKEND_PORT）..."
if [ ! -f Server-Nodejs/.env ]; then
  cp Server-Nodejs/.env.example Server-Nodejs/.env
  echo "  ✓ 已生成 .env"
fi
if [ ! -d Server-Nodejs/node_modules ]; then
  echo "→ 安装后端依赖（首次需几分钟）..."
  (cd Server-Nodejs && npm install)
fi

# 降级缓存/队列（CACHE_ENABLED/QUEUE_ENABLED=false）：本地无需 Redis 即可跑通
(cd Server-Nodejs && PORT="$BACKEND_PORT" CACHE_ENABLED=false QUEUE_ENABLED=false \
  npm run start:dev > "$ROOT/.experience-backend.log" 2>&1) &
BACKEND_PID=$!

echo "→ 等待后端就绪..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! curl -sf "http://localhost:$BACKEND_PORT/api/v1/health" >/dev/null 2>&1; then
  echo "✗ 后端启动超时。日志：.experience-backend.log"
  exit 1
fi
echo "✓ 后端就绪 (PID $BACKEND_PID)"

# ── 2. 管理台（node 静态服务器，兼容无 python）─────────────
ADMIN_PORT=$(pick_port "${ADMIN_PORT:-10086}")
echo ""
echo "→ 启动管理台（端口 $ADMIN_PORT）..."
if [ ! -d Front-Taro-Admin/node_modules ]; then
  echo "→ 安装管理台依赖（首次需几分钟）..."
  (cd Front-Taro-Admin && npm install)
fi
echo "→ 构建管理台..."
(cd Front-Taro-Admin && npm run build:h5 > "$ROOT/.experience-admin-build.log" 2>&1)

# 用 node 内置静态服务器（避免 python stub / 缺依赖）
node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const root=path.resolve("Front-Taro-Admin/dist");
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json"};
const port=Number(process.argv[1]);
http.createServer((req,res)=>{
  const url=req.url==="/"?"index.html":req.url.split("?")[0];
  const p=path.join(root,url);
  if(!p.startsWith(root)){res.writeHead(403);res.end();return;}
  fs.readFile(p,(e,d)=>{ if(e){res.writeHead(404);res.end("not found");return;} res.writeHead(200,{"Content-Type":types[path.extname(p)]||"text/plain"});res.end(d);});
}).listen(port,()=>console.log("admin on "+port));
' "$ADMIN_PORT" > "$ROOT/.experience-admin.log" 2>&1 &
ADMIN_PID=$!
sleep 1
ADMIN_URL="http://localhost:$ADMIN_PORT"

# ── 3. Flutter Web（可选）─────────────────────────────────
FLUTTER_URL="（未启动，加 FLUTTER=1 可启动）"
if [ "${FLUTTER:-0}" = "1" ]; then
  if command -v flutter >/dev/null 2>&1; then
    FLUTTER_PORT=$(pick_port "${FLUTTER_PORT:-8080}")
    echo "→ 启动 Flutter Web 主 App（端口 $FLUTTER_PORT）..."
    (cd Front-Flutter && flutter run -d web-server --web-port "$FLUTTER_PORT" \
      > "$ROOT/.experience-flutter.log" 2>&1) &
    FLUTTER_PID=$!
    # 等编译完成（flutter web 首次编译较慢，最多等 120s）
    for i in $(seq 1 40); do
      if curl -sf "http://localhost:$FLUTTER_PORT" >/dev/null 2>&1; then
        break
      fi
      sleep 3
    done
    if curl -sf "http://localhost:$FLUTTER_PORT" >/dev/null 2>&1; then
      FLUTTER_URL="http://localhost:$FLUTTER_PORT"
      echo "✓ Flutter Web 就绪"
    else
      echo "⚠ Flutter Web 编译超时（继续，日志：.experience-flutter.log）"
    fi
  else
    echo "⚠ 未找到 flutter，跳过主 App。安装: https://docs.flutter.dev/get-started/install"
  fi
fi

cat <<EOF

🎉 体验环境就绪！

  后端 API   http://localhost:$BACKEND_PORT  （Swagger: /api/docs）
  管理台     $ADMIN_URL
  主 App     $FLUTTER_URL

  演示账号：
    普通用户  alex / 123456     → 主 App 登录
    管理员    admin / Admin@1234 → 管理台登录

  停止：kill $BACKEND_PID $ADMIN_PID ${FLUTTER_PID:-}   （或关终端）
  后端日志：.experience-backend.log
  管理台日志：.experience-admin.log

  体验 AI：先配 LLM Key（Server-Nodejs/.env 的 DEEPSEEK_API_KEY），
  或用本地 Ollama（见 docs/manual/quickstart.md）
EOF
