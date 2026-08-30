# Web-Admin Independent Deployment / 管理台独立部署指南（D.10）

> Deploy the Vue3 admin console (`Web-Admin-Vue`) as a standalone static site on its own domain, with the NestJS backend reachable either same-origin via a reverse proxy or cross-origin via a configured API base.
> 将 Vue3 管理台（`Web-Admin-Vue`）作为独立静态站点部署到专属域名，后端可同源（Nginx 反代）或跨域（配置 API 基址）访问。

Related manuals / 相关手册：
- [One-Click Deployment / 一键部署](one-click-deploy.md)
- [Offline Deployment / 离线部署](offline-deploy.md)
- [Operations Manual / 运维手册](operations.md)

---

## 1. Why separate / 为什么独立部署

- The default single-container build bundles the admin console under `/admin/` with the Flutter web app. Some deployments want the console on its own domain (e.g. `admin.example.com`) for access control, TLS isolation, or a cleaner URL.
  默认单容器构建把管理台随 Flutter Web 一起托管在 `/admin/`。部分部署希望管理台独立域名（如 `admin.example.com`），便于访问控制、TLS 隔离或更干净的 URL。
- The admin console is a pure static SPA (Vue3 + Vite). No backend logic lives in it — it talks to the same NestJS REST API as the app.
  管理台是纯静态 SPA（Vue3 + Vite），不含后端逻辑，与主 App 共用同一套 NestJS REST API。

## 2. Build / 构建产物

```bash
cd Web-Admin-Vue
npm ci
npm run build          # → dist/  （base=/admin/，资源走绝对路径 /admin/assets/*）
```

- Base path is fixed at `/admin/` (see `vite.config.ts`). Keep this prefix on the target domain: the site is served at `https://admin.example.com/admin/`.
  base 固定为 `/admin/`（见 `vite.config.ts`）。目标域名上保留此前缀：站点访问路径为 `https://admin.example.com/admin/`。
- To serve at the domain root instead, rebuild with `--base=/` (`npm run build -- --base=/`). Either way, API base (step 4) is independent.
  若要在域名根路径提供，改用 `--base=/` 重新构建（`npm run build -- --base=/`）。无论哪种，API 基址（第 4 步）都独立配置。

## 3. Nginx static hosting / Nginx 静态托管（独立域名）

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;

    ssl_certificate     /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;

    # Admin SPA（base=/admin/）
    location /admin/ {
        root   /srv/keelbase-admin;          # dist/ 解包到此目录
        try_files $uri $uri/ /admin/index.html;
    }

    # 同源 API 反代到 NestJS 后端（推荐；后端可位于另一台服务器）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;    # 头像等静态资源（后端存储）
    }
}
```

- `try_files ... /admin/index.html` gives SPA fallback for hash routes.
  `try_files ... /admin/index.html` 为 hash 路由提供 SPA 回退。
- Uploads: the admin shows avatars served by the backend; proxy `/uploads/` too.
  上传资源：管理台展示的头像由后端提供，需一并反代 `/uploads/`。

## 4. API base / API 基址配置

The admin defaults to same-origin `/api/v1` (`import.meta.env.VITE_API_BASE || '/api/v1'` in `src/utils/constants.ts`).
管理台默认同源 `/api/v1`（`src/utils/constants.ts` 的 `import.meta.env.VITE_API_BASE || '/api/v1'`）。

- **Same-origin (recommended) / 同源（推荐）**：with the `/api/` reverse proxy above, no extra config — cookies/credentials stay on one origin.
  配合上面的 `/api/` 反代，无需额外配置，凭证与请求同源。
- **Cross-origin / 跨域**：point the build at the backend, and add the console origin to the backend CORS allow-list.
  构建时指定后端地址，并在后端 CORS 白名单加入管理台来源。

  ```bash
  VITE_API_BASE=https://api.example.com/api/v1 npm run build
  ```

  Backend `.env.production` / 后端 `.env.production`：
  ```bash
  CORS_ORIGINS=https://admin.example.com,https://www.example.com
  ```

## 5. Coexistence with the single-container / 与单容器模式并存

- **Single-container**：`docker compose up` serves the app + admin at `/` and `/admin/` from the same Nginx. No change needed.
  **单容器**：`docker compose up` 由同一 Nginx 提供 `/` 与 `/admin/`。无需改动。
- **Split**：keep the backend in the single container (or standalone), host the admin SPA separately, and reverse-proxy `/api/` to the backend as above.
  **拆分**：后端保留在单容器（或独立运行），管理台 SPA 单独托管，按上面方式把 `/api/` 反代到后端。
- The two layouts share the same backend session (access/refresh tokens in localStorage); switching hosts does not invalidate logins.
  两种布局共用同一后端会话（localStorage 中的 access/refresh token）；换宿主不会使登录失效。

## 6. HTTPS & access control / HTTPS 与访问控制

- TLS：reuse `nginx.https.conf`'s HSTS headers (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) on the admin server block.
  TLS：在管理台 server 块复用 `nginx.https.conf` 的 HSTS 头（`Strict-Transport-Security: max-age=31536000; includeSubDomains`）。
- Access control / 访问控制：the console checks `role === 'admin'` after login; for stricter perimeter control, restrict by IP allow-list or a VPN in front of `admin.example.com` (see private roadmap D.1).
  管理台登录后校验 `role === 'admin'`；更严格的外围控制可在 `admin.example.com` 前置 IP 白名单或 VPN（见私有 roadmap D.1）。

## 7. Verify / 验证

```bash
curl -I https://admin.example.com/admin/          # 200，HTML SPA
curl -I https://admin.example.com/admin/assets/…  # 200，静态资源
curl -X POST https://admin.example.com/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@2026$KeelBase"}'   # 200，后端可达
```

- Log in as `admin` / `Admin@2026$KeelBase`（first-boot demo account）→ the console loads with data.
  用 `admin` / `Admin@2026$KeelBase`（首启演示账号）登录 → 控制台正常加载数据。
