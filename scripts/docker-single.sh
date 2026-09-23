#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# EASY-1 单容器 all-in-one 交付
# 一条命令起全栈（后端 API + Flutter web 主 App + 管理台），只需装 Docker。
# 默认 SQLite 零配置 + Redis/队列降级；数据落在命名卷 keelbase_data 持久化。
#
# 用法：
#   ./scripts/docker-single.sh          # 构建并启动
#   ./scripts/docker-single.sh up       # 同上
#   ./scripts/docker-single.sh build    # 只构建镜像
#   ./scripts/docker-single.sh stop     # 停止
#   ./scripts/docker-single.sh down     # 停止并删除容器
#   ./scripts/docker-single.sh logs     # 查看日志
#
# 访问：
#   主 App      http://localhost:3000
#   管理台      http://localhost:3000/admin
#   后端 API    http://localhost:3000/api/v1   （Swagger: /api/docs，dev 仅）
#   演示账号    alex / Alex@2026$Demo（主 App）、admin / Admin@2026$KeelBase（管理台）

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

IMAGE="${IMAGE:-keelbase:single}"
CONTAINER="${CONTAINER:-keelbase}"
VOLUME="${VOLUME:-keelbase_data}"
PORT="${PORT:-3000}"

cmd="${1:-up}"

# flutter build web 在容器内（BuildKit）偶发 dart2js 崩溃（宿主机稳定）；
# Dockerfile 只 COPY build/web 产物，这里先宿主机构建（需已装 Flutter SDK）
# --base-href 必须等于运行时挂载点：产物落在 /mobile，用默认 / 会让 flutter_bootstrap.js
# 被解析到根路径（根路径回的是工作台 HTML），页面永远停在 Loading。
# --no-web-resources-cdn：CanvasKit/字体随产物自托管，否则默认从 gstatic 取，被本应用 CSP 拦下。
# 两者都是「服务端不报错、只在浏览器里白屏」的坑，由 scripts/check-mobile-preview.mjs 守着。
# MSYS_NO_PATHCONV=1：Git Bash 会把 `--base-href=/mobile/` 这个以 / 开头的值改写成 Windows 路径，
# flutter 于是报「should start and end with /」且不产出——故禁用参数转换。
# 判据用 main.dart.js（编译产物）而非 build/web 目录：构建失败也会留下 canvaskit/index.html 等残缺文件，
# 会让「已构建」的判断为真、把残缺产物 COPY 进镜像。
build_flutter_web() {
  if [ ! -f Front-Flutter/build/web/main.dart.js ]; then
    echo "→ 宿主机构建 Flutter web（首次约 2 分钟）..."
    (cd Front-Flutter && flutter pub get >/dev/null 2>&1 &&
      MSYS_NO_PATHCONV=1 flutter build web --release --base-href=/mobile/ --no-web-resources-cdn) ||
      { echo "✗ Flutter web 构建失败"; exit 1; }
    [ -f Front-Flutter/build/web/main.dart.js ] ||
      { echo "✗ Flutter web 未产出 build/web/main.dart.js"; exit 1; }
  fi
}

ensure_image() {
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "→ 构建单容器镜像 $IMAGE..."
    build_flutter_web
    docker build -f Dockerfile.single -t "$IMAGE" .
  fi
}

case "$cmd" in
  build)
    build_flutter_web
    docker build -f Dockerfile.single -t "$IMAGE" .
    echo "✔ 镜像 $IMAGE 构建完成"
    ;;
  up)
    ensure_image
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      echo "→ 容器 $CONTAINER 已存在，启动..."
      docker start "$CONTAINER"
    else
      echo "→ 启动单容器 $CONTAINER（端口 $PORT）..."
      docker run -d \
        --name "$CONTAINER" \
        -p "$PORT:3000" \
        -v "$VOLUME:/app/server/data" \
        -e PORT=3000 \
        --restart unless-stopped \
        "$IMAGE"
      echo "✔ 已启动。等待后端就绪..."
      for i in $(seq 1 30); do
        if curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
    fi
    cat <<EOF

🎉 单容器 KeelBase 已就绪！

  主 App      http://localhost:$PORT
  管理台      http://localhost:$PORT/admin
  健康检查    http://localhost:$PORT/api/v1/health

  演示账号：
    普通用户  alex / Alex@2026\$Demo
    管理员    admin / Admin@2026\$KeelBase

  停止：./scripts/docker-single.sh stop
  数据：SQLite 存于命名卷 $VOLUME（持久化）
EOF
    ;;
  stop)
    docker stop "$CONTAINER" 2>/dev/null || echo "未运行"
    ;;
  down)
    docker rm -f "$CONTAINER" 2>/dev/null || echo "无容器"
    ;;
  logs)
    docker logs -f "$CONTAINER"
    ;;
  *)
    echo "用法：$0 [up|build|stop|down|logs]"
    exit 1
    ;;
esac
