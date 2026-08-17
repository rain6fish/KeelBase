# 微信小程序能力（MINI-2 订阅消息 + MINI-3 快捷登录）需求确认书

> 状态：已确认（2026-08-16）
> 范围：MINI-2（小程序订阅消息）+ MINI-3（微信快捷登录 code2Session）
> 关联：CLAUDE.md §5.1 认证安全、§9 API 汇总、docs/oauth-config.md

## 一、目标

小程序（Front-Taro）是国内获客第一渠道，补齐两项微信生态能力：

1. **MINI-3 微信快捷登录**：用户在微信内打开小程序，`Taro.login()` 拿 code → 后端 `code2Session` 换 openid → 自动注册/登录，消除「输账号密码」门槛。
2. **MINI-2 微信订阅消息**：小程序无设备推送通道，用微信订阅消息补事件提醒触达——用户在设置页授权订阅后，后端在事件提醒时推微信订阅消息。

## 二、范围

### 本期（已完成）

| 项 | 内容 |
|----|------|
| 后端 MINI-3 | `POST /auth/oauth` 支持 `providerType: 'miniapp'`，WeChat 走 `sns/jscode2session`（openid+session_key），自动注册新用户，`providerId = openid` |
| 后端 MINI-2 | 复用已实现的 `WxSubscribeService`（`reminder.processor` → 事件提醒推送订阅消息，空模板/非微信用户 no-op） |
| Taro MINI-3 | 登录页「微信一键登录」按钮（仅小程序环境显示），`auth-store.wechatLogin()` → `/auth/oauth` |
| Taro MINI-2 | 设置页「开启微信事件提醒」→ `requestSubscribeMessage`（构建时 `TARO_APP_WX_TEMPLATE_ID`） |

### 不做（后续）

- **unionid 合并**：公众号（存 unionid）与小程序（存 openid）登录同一人会分账号，需开放平台绑定后按 unionid 合并。
- **订阅授权状态回传**：当前前端授权一次即由微信侧记录，后端不额外持久化「已授权」标记；如需发送前校验可用性，后续加。
- **模板字段配置化**：`thing1/time2` 字段名与 `page` 硬编码（需与微信后台实际模板匹配），后续可改 env 配置。

## 三、约束

- 真机小程序闭环（登录 + 订阅 + 提醒到达）需**真实 `WECHAT_APP_ID`/`WECHAT_APP_SECRET`** + 微信开发者工具；无凭据时以 mock 测试 + 文档降级。
- 小程序 API base：默认 `http://localhost:3000/api/v1` 仅本地调试；真机需 `TARO_APP_API_BASE` 指 https 公网域名，且微信后台配置 request 合法域名。
- 与后端 `WECHAT_REMIND_TEMPLATE_ID` 对应的模板：需在微信公众平台选用「事件提醒」类目模板，字段 `thing1`（事件标题）/`time2`（时间）。
