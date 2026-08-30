# 在线 Demo 演示站部署（PM-1 / P0·产品证明）

> 目标：让评估者**无需安装**即可在线体验全栈基座——Web 工作台（AI CRM Golden Flow）+ 后端 + 种子演示数据（alex / Alex@2026$Demo）。演示站只读，数据随库可随时重置。

## 一、本地一键演示（最快）

```bash
./deploy/demo.sh
```

脚本做四件事：
1. 构建 Web-Admin-Vue 工作台（`npm run build` → `dist/admin`；AI CRM Copilot + 写操作确认 + 治理轨迹都在工作台）
2. 可选：复用 Flutter web 移动预览（`Front-Flutter/build/web` → `/mobile`，未构建自动跳过；`SKIP_MOBILE=1` 显式跳过）
3. 启动后端（开发模式，`SERVE_STATIC=1` 托管工作台/管理台/移动预览；空库首启**自动种演示数据**，见 `src/common/seed.ts` + `demo-data.ts`）
4. 打开 `http://localhost:3000` → 自动进入工作台 `/admin/#/workbench`

访问：
- 工作台 `http://localhost:3000` —— 演示账号 `alex / Alex@2026$Demo`（**AI CRM Golden Flow 演示入口**）
- 管理台 `http://localhost:3000/admin` —— `admin / Admin@2026$KeelBase`
- 移动预览 `http://localhost:3000/mobile`

自定义：`PORT=3000 ./deploy/demo.sh`、`SKIP_MOBILE=1 ./deploy/demo.sh`

## 二、公网部署（对外体验站）

### 1. 推荐：单容器（含工作台 + 管理台 + 移动预览）

```bash
./scripts/docker-single.sh          # 一键构建并启动，http://localhost:3000
```

单容器镜像（`ghcr.io/rain6fish/keelbase`）内嵌 Web 工作台（/admin，AI CRM Golden Flow）+ Flutter 移动预览（/mobile），后端 `SERVE_STATIC=1` 托管，空库首启自动种演示数据与账号。公网部署：映射 80 端口 + 域名 + HTTPS（参考 `docs/manual/one-click-deploy.md`）。

### 2. 备选：Nginx 静态托管工作台（后端单独部署）

```bash
cd Web-Admin-Vue
npm run build        # → dist/admin（base /admin/，hash 路由无需 SPA fallback）
```

```nginx
# nginx 示例：/srv/keelbase-demo 放 dist/admin/ 内容
server {
  listen 80;
  server_name demo.yourdomain.com;
  root /srv/keelbase-demo;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

后端（含种子数据）：推荐单容器或生产 compose（`./deploy/deploy.sh`，PostgreSQL + Redis + NestJS + Nginx）；`CORS_ORIGINS` 需允许演示站域名（生产禁通配+凭据，见 DEP-7）。

### 4. 域名 / HTTPS

- DNS A 记录：`api.yourdomain.com` → 后端服务器，`demo.yourdomain.com` → 静态托管
- 推荐 HTTPS（Let's Encrypt / Cloudflare）；生产 HTTPS 参考 `deploy/deploy.sh` 与 `docs/manual/one-click-deploy.md`

### 5. 验证

- `https://demo.yourdomain.com` 用 `alex / Alex@2026$Demo` 登录
- 数据可随时一键复位：`./scripts/reset-demo.sh`（本地备份后删库，重启自动 seed；容器模式 `--docker`），见 [demo-live.md](demo-live.md) 复位一节

## 三、README 首屏链接

部署完成后，把演示站 URL 填入 `README.md` 首屏「Live Demo」区块（替换本地命令上方的说明，或补一行 URL）。
