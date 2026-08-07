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
RUN addgroup -S shiyu-appbase && adduser -S shiyu-appbase -G shiyu-appbase && \
    mkdir -p /app/server/uploads /app/server/data && \
    chown -R shiyu-appbase:shiyu-appbase /app/server
COPY --from=server-build /app/server/dist ./dist
 COPY --from=server-build /app/server/node_modules ./node_modules
 COPY --from=server-build /app/server/package*.json ./
 EXPOSE 3000
 USER shiyu-appbase
 CMD ["node", "dist/main"]

 # ---- Builder stage for Flutter ----
 FROM ghcr.io/cirruslabs/flutter:3.30.0 AS flutter-build
 WORKDIR /app/client
 COPY Front-Flutter/ .
 RUN flutter pub get
 RUN flutter build web --release

 # ---- Nginx to serve Flutter web ----
 FROM nginx:alpine AS web
 COPY --from=flutter-build /app/client/build/web /usr/share/nginx/html
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 80
 # nginx master runs as root, workers drop to nobody — standard nginx security model
 CMD ["nginx", "-g", "daemon off;"]
