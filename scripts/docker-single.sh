#!/usr/bin/env bash
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
#   演示账号    alex / 123456（主 App）、admin / Admin@1234（管理台）

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
build_flutter_web() {
  if [ ! -d Front-Flutter/build/web ]; then
    echo "→ 宿主机构建 Flutter web（首次约 2 分钟）..."
    (cd Front-Flutter && flutter pub get >/dev/null 2>&1 && flutter build web --release)
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
    普通用户  alex / 123456
    管理员    admin / Admin@1234

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
