# 在线 Demo 访问指南 / Live Demo Guide

> 云端在线演示（阿里云 ECS `121.199.30.80`）——三入口 + AI CRM Golden Flow，供外部体验。
> Cloud-hosted live demo (Aliyun ECS `121.199.30.80`) — three entry points + AI CRM Golden Flow.
>
> ⚠️ 备案阻塞 HTTPS，当前走 HTTP；部署/运维见 `demo-deploy.md`。

## 入口 / Entry Points

| 入口 | 地址 | 用途 |
|---|---|---|
| 工作台 Workbench | `http://121.199.30.80/user/` | 普通用户（AI CRM / 事件 / 待办 / AI 对话） |
| 管理台 Admin Console | `http://121.199.30.80/admin/` | 管理员（审计 / 治理 / 用户 / 监控） |
| 移动预览 Mobile | `http://121.199.30.80/mobile/` | Flutter 主 App Web 预览 |

## 演示账号 / Accounts

| 账号 | 密码 | 角色 |
|---|---|---|
| `alex` | 强密码（已更换，非默认 `123456`，向部署方获取） | 工作台（AI CRM 演示） |
| `admin` | 强密码（已更换，非默认 `Admin@1234`，向部署方获取） | 管理台 |

## Golden Flow（60 秒看懂） / 演示路径

1. 打开工作台 `http://121.199.30.80/user/`，用 `alex` 账号登录（密码已更换为强密码，非默认 `123456`，见上表）
2. 进入 **AI 对话**（或 CRM 工作台），提问：
   > 「哪些客户值得跟进？请分析风险并给出建议。」
3. AI 实时分析业务数据（读客户 / 订单 / 风险，6+ 次工具调用）→ 返回**真实风险分级 + 建议动作**（如「澄海地产 critical，¥305,000 逾期」）
4. （可选）让 AI 写操作（如「为高风险客户创建跟进任务」）→ 触发**人工确认** → 确认后写入 → 可在管理台审计看到
5. 管理台 `http://121.199.30.80/admin/`，用 `admin` 账号登录（密码已更换为强密码，非默认值）：
   - **AI 审计** → 看到 AI 每一步工具调用的审计（含用户 / 时间 / 动作）
   - **AI 行为回放** → 完整时间线（Human → Agent → System）
   - **治理总览 / 风险中心 / Agent 注册表 / 策略中心** → KeelBase Guard 五中心

## 演示价值 / What This Proves

- **Run**：AI 不是聊天——它在权限与确认边界内**真实读取并作用于业务数据**
- **Trust**：每步审计、写操作确认、副作用可撤销、哈希链可验证
- **三端**：同一后端，工作台 / 管理台 / 移动三端可用

## 备注 / Notes

- 后端健康检查：`http://121.199.30.80/api/v1/health`
- AI 对话依赖 DeepSeek key（已配置）；本地/离线场景走 Ollama（见 `private-ai-verification.md`）
