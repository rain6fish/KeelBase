 # ---- Backend ----
 FROM node:22-alpine AS server-build
 WORKDIR /app/server
 # 中国网络 npm 官方 tarball 常不可达；默认阿里镜像，海外构建用 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖
 ARG NPM_REGISTRY=https://registry.npmmirror.com
 ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
 # better-sqlite3 原生编译需要工具链（prebuild 下载受 GitHub 网络影响时回退 node-gyp）
 # node-gyp 拉 Node headers：alpine 镜像来自 unofficial-builds，默认 base 国内常超时；
 # 默认官方 dist（海外/CI 快），中国区构建用 --build-arg NODE_HEADERS_MIRROR=https://registry.npmmirror.com/-/binary/node 覆盖
 ARG NODE_HEADERS_MIRROR=https://nodejs.org/dist
 ENV npm_config_disturl=$NODE_HEADERS_MIRROR
 RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++
 COPY Server-NestJS/package*.json ./
 RUN npm ci
 COPY Server-NestJS/ .
 RUN npm run build

FROM node:22-alpine AS server
WORKDIR /app/server
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories && \
    apk add --no-cache wget
RUN addgroup -S keelbase && adduser -S keelbase -G keelbase && \
    mkdir -p /app/server/uploads /app/server/data && \
    chown -R keelbase:keelbase /app/server
COPY --from=server-build /app/server/dist ./dist
 COPY --from=server-build /app/server/node_modules ./node_modules
 COPY --from=server-build /app/server/package*.json ./
 # CR-23：deploy.sh 容器内 exec `npx ts-node scripts/create-admin.ts`，镜像必须含 scripts/ 才能建管理员
 COPY --from=server-build /app/server/scripts ./scripts
 # CR-23（补齐 2026-09-14）：上面 scripts/*.ts `import '../src/*'`，且 ts-node 需 tsconfig.json 才能按 CJS 解析
 #   （无 tsconfig 时容器内 ts-node 走 ESM 解析 → 无扩展名 import 直接 ERR_MODULE_NOT_FOUND）。
 #   缺 src/ + tsconfig 时 create-admin（deploy.sh 第 5 步，失败被 `||` 吞掉）与 seed-demo（§6 ①）在 prod 必然报错。
 COPY --from=server-build /app/server/src ./src
 COPY --from=server-build /app/server/tsconfig.json ./tsconfig.json
 EXPOSE 3000
 USER keelbase
 CMD ["node", "dist/main"]

 # ---- Builder stage for Flutter ----
 # 注：flutter build web 在容器内（BuildKit）偶发 dart2js 崩溃且无一致根因（宿主机/交互容器稳定）。
 # 改为宿主机构建产物，Dockerfile 只 COPY build/web —— 确定性最高，也更快。
 FROM scratch AS flutter-build
 COPY Front-Flutter/build/web /build/web

 # ---- Builder stage for Admin Console (Vue3 PC Web) ----
 # 双 surface 构建：build:user → dist/user（普通用户工作台，/user 子路径）；build:admin → dist/admin（管理台，/admin）
 FROM node:22-alpine AS admin-build
 WORKDIR /app/admin
 # 中国网络 npm 官方 tarball 常不可达；默认阿里镜像，海外构建用 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖
 ARG NPM_REGISTRY=https://registry.npmmirror.com
 ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
 COPY Web-Admin-Vue/package*.json ./
 RUN npm ci
 COPY Web-Admin-Vue/ .
 RUN npm run build:user && npm run build:admin

 # ---- Nginx to serve Flutter web + user workbench + admin console ----
 # 基座用 Alpine 的 nginx 包，而**不是**官方 `nginx:alpine` 镜像：官方镜像由 nginx.org 自行编译
 # （当前 1.31.4），与 Alpine 仓库里的 `nginx-mod-http-brotli`（对着 Alpine 的 nginx 1.30.4 编）
 # **版本不匹配**——nginx 的动态模块要求版本严格一致，混用会拒绝加载。要用 brotli 就只能走这一条。
 #
 # 代价是这里要自己复刻官方镜像做过、而 Alpine 包不做的三件事（改动前务必知道）：
 #   1. 日志软链到 stdout/stderr，否则 `docker logs` 什么都看不到；
 #   2. server 块放 `/etc/nginx/http.d/`——Alpine 的 `nginx.conf` 把 **`conf.d` 包含在 root 上下文**
 #      （见其注释 "config snippets into the root context"），`server{}` 放那里会直接报错；
 #      官方镜像的 `conf.d` 是在 `http{}` 里的，两者路径不同，**这也是 prod 挂载点要跟着改的原因**；
 #   3. brotli 模块无需手写 `load_module`，Alpine 的包已放进 `/etc/nginx/modules/`，
 #      由 `nginx.conf` 的 `include /etc/nginx/modules/*.conf;` 自动加载。
 FROM alpine:3.24 AS web
 # 中国网络下 Alpine 官方 CDN 很慢（与 npm 走阿里镜像同理），离线构建见 deploy/deploy-offline.sh 的说明
 RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
     && apk add --no-cache nginx nginx-mod-http-brotli \
     && ln -sf /dev/stdout /var/log/nginx/access.log \
     && ln -sf /dev/stderr /var/log/nginx/error.log
 COPY --from=flutter-build /build/web /usr/share/nginx/html/mobile
 COPY --from=admin-build /app/admin/dist/user /usr/share/nginx/html/user
 COPY --from=admin-build /app/admin/dist/admin /usr/share/nginx/html/admin
 COPY nginx.conf /etc/nginx/http.d/default.conf
 EXPOSE 80
 # nginx master runs as root, workers drop to nginx — standard nginx security model
 CMD ["nginx", "-g", "daemon off;"]
