# 微信小程序能力（MINI-2 订阅消息 + MINI-3 快捷登录）规格说明

> 对应需求：docs/wechat-miniapp-requirements.md
> 协议版本：v1（2026-08-16）

## 一、MINI-3 微信快捷登录

### 1.1 流程

```
小程序端                                   后端
  Taro.login() ── code ─────────────► POST /api/v1/auth/oauth
                                        { provider:'wechat', providerType:'miniapp',
                                          authorizationCode: code }
                                        ↓
                                        GET https://api.weixin.qq.com/sns/jscode2session
                                          ?appid &secret &js_code=code
                                        ← { openid, session_key, unionid? }
                                        ↓ 按 providerHash(openid) 查/建用户
  ◄────── { accessToken, refreshToken, user } ── JWT
```

### 1.2 接口契约

`POST /auth/oauth`（公开，限流 10/min，`@FeatureFlag('oauth')`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | string | 是 | `'wechat'` |
| `providerType` | `'web'\|'miniapp'` | 否 | 默认 `web`（公众号网页授权，兼容原流程）；`miniapp` 走 code2Session |
| `authorizationCode` | string | 是 | `Taro.login()` 返回的 code |

响应与 `/auth/login` 一致：`{ accessToken, refreshToken, mustChangePassword, user }`。

### 1.3 后端细节

- 新用户自动注册：占位随机密码 + `provider=wechat` + `providerId=AES 加密存储` + `providerHash=HMAC(openid)` 供查询。
- **`providerId = openid`**（非 unionid）——订阅消息 `touser` 需小程序 openid；公众号流程保持 `providerId = unionid ?? openid`。
- 微信返回 `errcode` 或无 `openid` → 401 `Invalid WeChat mini-app code`（防枚举统一提示）。
- 未配置 `WECHAT_APP_ID/SECRET` → 401 `not configured`。

### 1.4 Taro 端

- `auth-service.ts`：`oauthLogin(authorizationCode)` → POST `/auth/oauth`（providerType 固定 `miniapp`）。
- `auth-store.ts`：`wechatLogin()` — `Taro.login()` → 调 oauthLogin → 存 token/user；`process.env.TARO_ENV==='h5'` 时返回失败（H5 无 wx.login）。
- `login/index.vue`：`WeChat Login` 按钮（仅 `!isH5` 显示），成功后 `redirectTo` dashboard。
- `api-client.ts`：`/auth/oauth` 加入 `PUBLIC_ENDPOINTS`（免 token）。

## 二、MINI-2 微信订阅消息

### 2.1 流程

```
用户(小程序)                        后端
 设置页 tap「开启微信事件提醒」
   Taro.requestSubscribeMessage({ tmplIds:[TARO_APP_WX_TEMPLATE_ID] })
   ← accept/reject
  （微信侧记录授权，后端不持久化）
  …事件创建时 _scheduleReminder 排队 →
     reminder.processor 到点 → WxSubscribeService.sendReminder(userId, eventTitle)
       guard：模板空 / appid·secret 空 / 用户非 wechat 或 providerId 空 → no-op
       GET cgi-bin/token（内存缓存，提前 5min 刷新）→ POST cgi-bin/message/subscribe/send
       { touser: providerId(openid), template_id, page, data:{thing1,time2}, miniprogram_state:'formal' }
```

### 2.2 关键实现

- 后端已完整（`src/push/wx-subscribe.service.ts` + `src/queue/reminder.processor.ts` 接线），本期不修改。
- 模板字段 `thing1`（标题）/`time2`（时间）、`page` 硬编码——**必须与微信后台实际选用的模板字段一致**，否则发送返回 errcode 被静默吞掉。
- 前端触发：`settings/index.vue`「Notifications → Enable WeChat Event Reminders」行点击（用户手势）→ `requestSubscribeMessage`；仅 `!isH5` 可用。

## 三、环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 后端 env | 小程序 appid/secret（真机必需） |
| `WECHAT_REMIND_TEMPLATE_ID` | 后端 env | 事件提醒订阅模板 id（空则 sendReminder no-op） |
| `TARO_APP_WX_TEMPLATE_ID` | Taro 构建 env | 前端 requestSubscribeMessage 的模板 id，**需与后端 `WECHAT_REMIND_TEMPLATE_ID` 一致** |
| `TARO_APP_API_BASE` | Taro 构建 env | 真机指 https 公网 API；H5 默认同源 `/api/v1` |

## 四、安全

- 登录：`code2Session` 一次 code 仅可用一次（微信侧保证）；失败统一 401 防枚举；自动注册用户无邮箱（未验证态，写操作受限逻辑沿用现有）。
- 订阅消息：服务端只向**微信侧已授权**的模板发送；无订阅 → 微信返回 errcode 静默（不影响业务）。
- 无真实凭据时：单元测试 mock fetch 验证分支；真机闭环待 appid/secret。

## 五、测试

- 后端 `oauth.service.spec.ts`：miniapp 用例（成功 openid / 网络错误 / errcode / 无 openid / 分发透传）——45 用例全绿。
- Taro：`build:h5` 编译通过；`requestSubscribeMessage`/`wx.login` 为小程序 API，H5 构建不实际调用。

## 六、后续

- unionid 合并（开放平台绑定后公众号/小程序同人统一）。
- 模板字段/page 配置化（env）。
- 订阅授权状态后端持久化 + 管理端查看。
