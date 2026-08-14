# 常见问题 FAQ

> 从「使用者」实际会踩的坑出发，按主题排查。没找到你的问题？先看 [快速上手](quickstart.md)，或在本仓库提 issue。

---

## 1. 环境准备

### Q: Node 版本怎么选？
A: 后端要求 **Node.js ≥ 22**。终端 `node -v` 查看。版本太老会导致依赖安装失败或启动报错。
```bash
# 用 nvm 切换（Mac/Linux）或从 nodejs.org 装 LTS（Windows）
node -v   # 应输出 v22.x 或更高
```

### Q: Flutter 版本怎么选？
A: 要求 **Flutter ≥ 3.12**。`flutter --version` 查看。前端跑 `flutter run` 前先 `flutter doctor` 检查环境是否完整。

### Q: Docker 装好后 compose 用不了？
A: 新版 Docker 自带 Compose v2（`docker compose`）。若只有 `docker-compose`（v1），升级 Docker。验证：`docker compose version`。

### Q: Windows 上 `python` 命令报错（exit 49 / Microsoft Store stub）？
A: Windows 的 `python` 可能是微软商店占位程序。两个选择：
- 装真 Python（python.org），或
- 用别的静态服务器托管前端 dist，如 `npx serve dist` 或 `npx http-server dist -p 10086`

---

## 2. 启动与端口

### Q: 后端 `npm run start:dev` 起不来，报端口占用？
A: 3000 端口被别的程序占了。改 `Server-NestJS/.env` 的 `PORT`，同时主 App 的 `lib/core/constants/app_constants.dart` 里的 `baseUrl` 要同步改端口。

### Q: 后端启动报缺数据库 / SQLite 错误？
A: 开发环境默认 SQLite（零配置，文件在 `Server-NestJS/data/front.sqlite`）。首次启动自动建库建表。若残留损坏的旧库，删掉 `data/front.sqlite` 重启即可重建。

### Q: 要接 PostgreSQL / Redis 怎么起？
```bash
docker compose up postgres redis -d
```
然后把 `Server-NestJS/.env` 的 `DB_TYPE=postgres` 并配好 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD`。Redis 用于缓存与队列，`CACHE_ENABLED=false` 可降级不用。

### Q: 主 App 页面一直转圈 / 连不上后端？
A: 三步排查：
1. 后端是否在跑：`curl http://localhost:3000/api/v1/health`
2. 端口是否一致：前端默认 `http://localhost:3000/api/v1`
3. 是否登录过期：退出重新登录

---

## 3. 登录与账号

### Q: 登录被锁定「账号已锁定」？
A: 连续失败 **10 次**锁 **15 分钟**（安全策略）。等 15 分钟或重启后端（development 环境重置计数）。这是防爆破设计，不是 bug。

### Q: 演示账号在哪？为什么我注册的账号进不了管理台？
A: 演示账号（development 首次启动自动建）：`alex / 123456`（普通）、`admin / Admin@1234`（管理员）。管理台**必须 admin 角色**，普通用户登录管理台会 403/空白。要提权，用 admin 登录管理台 → 用户管理 → 改角色。

### Q: 收不到邮箱验证码 / 忘记密码邮件？
A: 邮件需配置 SMTP（`.env` 的 `MAIL_ENABLED=true` + `SMTP_*`）。**开发环境没配 SMTP 也能注册**，只是不发邮件——邮箱验证页可直接跳过。要真发邮件，参考 [运维手册](operations.md) 的邮件配置。

### Q: 手机号验证码发到哪？
A: 默认 `SMS_DRIVER=console`，验证码打印在后端控制台日志里（开发用）。要接真实短信需配 `SMS_DRIVER=aliyun` 及阿里云凭据。

---

## 4. AI 部分

### Q: AI 对话回复「未配置」或报错？
A: 需配置 LLM API Key。在 `Server-NestJS/.env`：
```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的key
```
支持 DeepSeek / Qwen / OpenAI（OpenAI 兼容）。未配 Key 时 AI 相关功能降级（导航、洞察仍可用，对话不可用）。

### Q: 想用本地模型（数据不出域）？
A: 配 Ollama：
```bash
# 装 Ollama 并拉模型
ollama pull qwen2.5:7b
ollama pull bge-m3
# .env 加：
# OLLAMA_BASE_URL=http://localhost:11434
# AI_PROVIDER=ollama
```
详见 [离线部署](offline-deploy.md)「内网 AI」。

### Q: 模型怎么切换 / 为什么我的模型列表只有几个？
A: 主 App AI 页有模型选择器（DeepSeek/Qwen 热切换）。可用的 provider 取决于 `.env` 里配了哪些 `*_API_KEY`。未配 Key 的 provider 不会出现在列表。

### Q: 知识库检索不到我的文档？
A: 三步排查：
1. 文档是否上传成功：管理台 → 知识库 → 看条目
2. 向量检索是否启用：生产需 PostgreSQL + `EMBEDDING_*` 配置（或 `OLLAMA_BASE_URL`）；否则自动降级全文搜索（LIKE，效果差些但可用）
3. 提问时用知识库相关词（如「查一下手册里……」）

---

## 5. 部署

### Q: `docker compose up --build` 很慢 / 拉不动镜像？
A: 首次构建要下载镜像 + 编译，正常 10 分钟。网络慢配置 Docker 国内镜像加速。离线环境用 [离线部署](offline-deploy.md)。

### Q: HTTPS 怎么配？
A: 参考 [一键部署](one-click-deploy.md)：`HTTPS=1 ./deploy/deploy.sh` 自动生成自签名证书；生产用受信证书替换 `certs/`。

### Q: 生产环境没有演示账号？
A: 正确——seed 只在 development 执行。生产首次部署用 `npm run create:admin` 建管理员，见 [一键部署](one-click-deploy.md)。

### Q: CI（GitHub Actions）在哪里看结果？
A: 代码镜像到 GitHub（`rain6fish/KeelBase`），push 到 `main` 自动触发。在 GitHub 仓库的 Actions 页看 lint/test/build。Gitee 仓库仅供同步，不跑 CI。

---

## 6. 平台与权限

### Q: 管理端接口为什么对普通用户 403？
A: 管理功能全部要求 `role = admin`（CASL 权限），这是架构红线（三入口隔离）。普通用户 token 访问管理接口一律 403。

### Q: 我想给某个用户提权/降权？
A: 管理台 → 用户管理 → 找到用户 → 修改角色。不能用普通账号自己改自己。

### Q: 数据备份恢复怎么做？
A: `cd Server-NestJS && npm run backup`（备份到 `data/backups/`）；恢复 `npm run restore -- <file>`。详见 [运维手册](operations.md)。

---

## 7. 还是没解决？

- 带完整报错 + 操作步骤提 issue
- 看后端日志：`cd Server-NestJS && npm run start:dev` 的控制台输出，或生产 `docker compose logs server`
