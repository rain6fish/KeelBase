# 在线 Demo 访问指南 / Live Demo Guide

> 云端在线演示（canonical 域名 `https://demo.keelbase.com.cn`）——三入口 + AI CRM Golden Flow，供外部体验。
> Cloud-hosted live demo (canonical domain `https://demo.keelbase.com.cn`) — three entry points + AI CRM Golden Flow.
>
> ⚠️ **请用域名访问**。旧 IP `http://121.199.30.80/...` 现 301 跳到 `https://121.199.30.80/...`，而该 IP 上装的是域名的证书 ⇒ 浏览器会因证书域名不匹配而拦截。部署/运维见 `demo-deploy.md`。

## 入口 / Entry Points

| 入口 | 地址 | 用途 |
|---|---|---|
| 工作台 Workbench | `https://demo.keelbase.com.cn/user/` | 普通用户（AI CRM / 事件 / 待办 / AI 对话） |
| 管理台 Admin Console | `https://demo.keelbase.com.cn/admin/` | 管理员（审计 / 治理 / 用户 / 监控） |
| 移动预览 Mobile | `https://demo.keelbase.com.cn/mobile/` | Flutter 主 App Web 预览（根因已修，见「备注」） |

## 演示账号 / Accounts

| 账号 | 密码 | 角色 |
|---|---|---|
| `alex` | `Alex@2026$Demo` | 工作台（AI CRM 演示） |
| `admin` | `Admin@2026$KeelBase` | 管理台 |

## Golden Flow（60 秒看懂） / 演示路径

1. 打开工作台 `https://demo.keelbase.com.cn/user/`，用 `alex` 账号登录（密码已更换为强密码，非默认 `123456`，见上表）
2. 进入 **AI 对话**（或 CRM 工作台），提问：
   > 「哪些客户值得跟进？请分析风险并给出建议。」
3. AI 实时分析业务数据（读客户 / 订单 / 风险，6+ 次工具调用）→ 返回**真实风险分级 + 建议动作**（如「澄海地产 critical，¥305,000 逾期」）
4. （可选）让 AI 写操作（如「为高风险客户创建跟进任务」）→ 触发**人工确认** → 确认后写入 → 可在管理台审计看到
5. 管理台 `https://demo.keelbase.com.cn/admin/`，用 `admin` 账号登录（密码已更换为强密码，非默认值）：
   - **AI 审计** → 看到 AI 每一步工具调用的审计（含用户 / 时间 / 动作）
   - **AI 行为回放** → 完整时间线（Human → Agent → System）
   - **治理总览 / 风险中心 / Agent 注册表 / 策略中心** → KeelBase Guard 五中心

## 演示价值 / What This Proves

- **Run**：AI 不是聊天——它在权限与确认边界内**真实读取并作用于业务数据**
- **Trust**：每步审计、写操作确认、副作用可撤销、哈希链可验证
- **三端**：同一后端；工作台 / 管理台 / 移动预览**三个入口均在线**（移动预览的渲染复测见「备注」）

## 备注 / Notes

- 后端健康检查：`https://demo.keelbase.com.cn/api/v1/health`
- AI 对话依赖 DeepSeek key（已配置）；本地/离线场景走 Ollama（见 `private-ai-verification.md`）
- **移动预览 `/mobile/`**：2026-09-24 曾报「页面停在 Loading」。**根因已修**——Flutter 产物的 API 基址是编译期 `--dart-define=API_BASE_URL` 决定的（默认 `http://localhost:3000/api/v1`），而当时**四处构建路径都没传这个 define** ⇒ 部署出来的移动预览会去连访客自己的 localhost。`2a1639f3`（2026-09-25）给全部构建路径补上了 `--dart-define=API_BASE_URL=/api/v1`（同域相对路径，见 `app_constants.dart` 注释），并给门禁 `npm run check:mobile-preview` **加了守卫这一层的一层**。线上产物已重建——2026-09-30 核：`/mobile/` 返回 200，`main.dart.js` 内**零** `localhost:3000`、含 `"/api/v1"`。**⚠ 浏览器内渲染未复测**（本轮只有产物级证据）；删去本条前，请先在浏览器打开 `/mobile/` 确认能进登录页。
- The mobile preview at `/mobile/` stalled on Loading when reported on 2026-09-24. **The root cause is fixed**: the Flutter artifact's API base comes from the compile-time `--dart-define=API_BASE_URL` (default `http://localhost:3000/api/v1`), and at the time **all four build paths omitted it**, so any deployed mobile preview called the visitor's own localhost. Commit `2a1639f3` (2026-09-25) added `--dart-define=API_BASE_URL=/api/v1` to every build path and gave the `npm run check:mobile-preview` gate **a layer that guards exactly this**. The deployed artifact has been rebuilt — checked 2026-09-30: `/mobile/` returns 200, and `main.dart.js` contains **zero** occurrences of `localhost:3000` and does contain `"/api/v1"`. **In-browser rendering was not re-tested** in that check (artifact-level evidence only), so confirm the login page loads before deleting this note.

## 数据复位（Demo Reset，V-4）/ Reset Demo Data

演示前把数据复位到干净种子态（删除演示产生的脏数据，重新 seed 演示账号 + AI CRM 客户）：

```bash
# 本地开发（先停后端）
./scripts/reset-demo.sh                     # 自动备份到 data/backups/ 再删库，重启后端自动 seed
# 容器部署（ECS）
docker compose stop server
./scripts/reset-demo.sh --docker --no-backup # 容器内复位（见 demo-deploy.md 复位一节）
docker compose up -d --force-recreate server
```

复位后：`alex / Alex@2026$Demo`（工作台）、`admin / Admin@2026$KeelBase`（管理台）自动重建，AI CRM 种子客户（辰光建材 / 澄海地产 / 瀚宇制造）恢复。
