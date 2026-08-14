 # ---- Backend ----
 FROM node:22-alpine AS server-build
 WORKDIR /app/server
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
 EXPOSE 3000
 USER keelbase
 CMD ["node", "dist/main"]

 # ---- Builder stage for Flutter ----
 # 注：flutter build web 在容器内（BuildKit）偶发 dart2js 崩溃且无一致根因（宿主机/交互容器稳定）。
 # 改为宿主机构建产物，Dockerfile 只 COPY build/web —— 确定性最高，也更快。
 FROM scratch AS flutter-build
 COPY Front-Flutter/build/web /build/web

 # ---- Builder stage for Admin Console (Vue3 PC Web, /admin sub-path) ----
 FROM node:22-alpine AS admin-build
 WORKDIR /app/admin
 COPY Web-Admin-Vue/package*.json ./
 RUN npm ci
 COPY Web-Admin-Vue/ .
 RUN npm run build

 # ---- Nginx to serve Flutter web + admin console ----
 FROM nginx:alpine AS web
 COPY --from=flutter-build /build/web /usr/share/nginx/html
 COPY --from=admin-build /app/admin/dist /usr/share/nginx/html/admin
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 80
 # nginx master runs as root, workers drop to nobody — standard nginx security model
 CMD ["nginx", "-g", "daemon off;"]
