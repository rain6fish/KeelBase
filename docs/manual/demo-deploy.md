# 在线 Demo 演示站部署（PM-1）

> 目标：让评估者**无需安装**即可在线体验全栈基座——Taro H5 主 App + 后端 + 种子演示数据（alex / 123456）。演示站只读，数据随库可随时重置。

## 一、本地一键演示（最快）

```bash
./deploy/demo.sh
```

脚本做三件事：
1. 构建 Taro H5 主 App（`build:h5`，`TARO_APP_API_BASE` 默认 `http://localhost:3000/api/v1`，dev CORS 放行跨域）
2. 启动后端（开发模式；空库首启**自动种演示数据**，见 `src/common/seed.ts` + `demo-data.ts`）
3. 静态托管 Taro 产物到 `http://localhost:8080`

访问：
- 主 App `http://localhost:8080` —— 演示账号 `alex / 123456`
- 管理台 `http://localhost:3000/admin` —— `admin / Admin@1234`

自定义：`PORT=8081 ./deploy/demo.sh`、`API_BASE=https://api.example.com/api/v1 ./deploy/demo.sh`

## 二、公网部署（对外体验站）

### 1. 构建前端（指向公网 API）

```bash
cd Front-Taro
TARO_APP_API_BASE=https://api.yourdomain.com/api/v1 npm run build:h5
# 产物在 dist/
```

### 2. 托管 Taro 静态产物

任选（Nginx / 任意静态托管 / CDN）：

```nginx
# nginx 示例：/srv/keelbase-demo 放 dist/ 内容
server {
  listen 80;
  server_name demo.yourdomain.com;
  root /srv/keelbase-demo;
  index index.html;
  # hash 路由，无需 SPA fallback
  location / { try_files $uri $uri/ /index.html; }
}
```

### 3. 部署后端（含种子数据）

推荐：单容器（`ghcr.io/rain6fish/keelbase`，含 Flutter Web + 管理台），或生产 compose（`./deploy/deploy.sh`，PostgreSQL + Redis + NestJS + Nginx）。空库首启自动种演示数据与账号；如需手动补种：`npm run seed:demo`。

后端环境 `CORS_ORIGINS` 需允许演示站域名（生产禁通配+凭据，见 DEP-7）。

### 4. 域名 / HTTPS

- DNS A 记录：`api.yourdomain.com` → 后端服务器，`demo.yourdomain.com` → 静态托管
- 推荐 HTTPS（Let's Encrypt / Cloudflare）；生产 HTTPS 参考 `deploy/deploy.sh` 与 `docs/manual/one-click-deploy.md`

### 5. 验证

- `https://demo.yourdomain.com` 用 `alex / 123456` 登录
- 数据可随时重置：演示库为非生产库，重建容器/库即恢复初始种子

## 三、README 首屏链接

部署完成后，把演示站 URL 填入 `README.md` 首屏「Live Demo」区块（替换本地命令上方的说明，或补一行 URL）。
