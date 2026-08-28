 # ---- Backend ----
 FROM node:22-alpine AS server-build
 WORKDIR /app/server
 # 中国网络 npm 官方 tarball 常不可达；默认阿里镜像，海外构建用 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖
 ARG NPM_REGISTRY=https://registry.npmmirror.com
 ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
 # better-sqlite3 原生编译需要工具链（prebuild 下载受 GitHub 网络影响时回退 node-gyp）
 RUN apk add --no-cache python3 make g++
 COPY Server-NestJS/package*.json ./
 RUN npm ci
 COPY Server-NestJS/ .
 RUN npm run build

FROM node:22-alpine AS server
WORKDIR /app/server
RUN apk add --no-cache wget
RUN addgroup -S keelbase && adduser -S keelbase -G keelbase && \
    mkdir -p /app/server/uploads /app/server/data && \
    chown -R keelbase:keelbase /app/server
COPY --from=server-build /app/server/dist ./dist
 COPY --from=server-build /app/server/node_modules ./node_modules
 COPY --from=server-build /app/server/package*.json ./
 # CR-23：deploy.sh 容器内 exec `npx ts-node scripts/create-admin.ts`，镜像必须含 scripts/ 才能建管理员
 COPY --from=server-build /app/server/scripts ./scripts
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
 FROM nginx:alpine AS web
 COPY --from=flutter-build /build/web /usr/share/nginx/html/mobile
 COPY --from=admin-build /app/admin/dist/user /usr/share/nginx/html/user
 COPY --from=admin-build /app/admin/dist/admin /usr/share/nginx/html/admin
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 80
 # nginx master runs as root, workers drop to nobody — standard nginx security model
 CMD ["nginx", "-g", "daemon off;"]
