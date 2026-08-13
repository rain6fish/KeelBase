 # ---- Backend ----
 FROM node:22-alpine AS server-build
 WORKDIR /app/server
 COPY Server-Nodejs/package*.json ./
 RUN npm ci
 COPY Server-Nodejs/ .
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
 FROM ghcr.io/cirruslabs/flutter:3.30.0 AS flutter-build
 WORKDIR /app/client
 COPY Front-Flutter/ .
 RUN flutter pub get
 RUN flutter build web --release

 # ---- Builder stage for Admin Console (Vue3 PC Web, /admin sub-path) ----
 FROM node:22-alpine AS admin-build
 WORKDIR /app/admin
 COPY Web-Admin/package*.json ./
 RUN npm ci
 COPY Web-Admin/ .
 RUN npm run build

 # ---- Nginx to serve Flutter web + admin console ----
 FROM nginx:alpine AS web
 COPY --from=flutter-build /app/client/build/web /usr/share/nginx/html
 COPY --from=admin-build /app/admin/dist /usr/share/nginx/html/admin
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 80
 # nginx master runs as root, workers drop to nobody — standard nginx security model
 CMD ["nginx", "-g", "daemon off;"]
