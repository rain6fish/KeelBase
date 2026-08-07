# OAuth 第三方登录（免注册）配置指南

## 架构概述

```
┌──────────────┐  ID Token / Auth Code  ┌──────────────────────┐
│  Flutter App  │ ────────────────────→ │  Backend (NestJS)    │
│  (OAuth SDKs) │                       │  /api/v1/auth/oauth  │
│               │ ←────────────────── │  OAuthService         │
│               │    JWT tokens       │  ├─ Google: tokeninfo │
└──────────────┘                      │  ├─ Apple: JWKS       │
                                      │  ├─ WeChat: code→openid│
                                      │  └─ Alipay: code→user │
                                      └──────────────────────┘
```

### 关键设计

1. **配置驱动**: 通过 `OAUTH_ENABLED_PROVIDERS` 环境变量控制哪些认证方式可用，前后端自动适配。
2. **国际/国内分组**: 登录页按「国际」和「国内」两个区域展示按钮，由后端配置决定。
3. **免注册**: 新用户首次使用第三方登录时自动创建账号，无需填写注册表单。
4. **账号关联**: 同一邮箱的已有账号会自动关联新的第三方登录方式。

---

## 配置体系

### 环境变量（后端 `.env`）

```env
# 启用的 OAuth 提供商（逗号分隔）—— 这是核心配置开关
OAUTH_ENABLED_PROVIDERS=google,apple,wechat,alipay

# 国际
GOOGLE_CLIENT_ID=
APPLE_CLIENT_ID=

# 国内
WECHAT_APP_ID=
WECHAT_APP_SECRET=
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
```

### Provider 自动发现

前端在登录页加载时调用 `GET /api/v1/auth/oauth/providers`，后端返回基于 env 的可用列表：

```json
{
  "enabledProviders": ["google", "apple", "wechat"],
  "providers": [...],
  "groups": {
    "international": [
      { "id": "google", "name": "Google", "icon": "google", "nativeOnly": false }
    ],
    "china": [
      { "id": "wechat", "name": "微信", "icon": "wechat", "nativeOnly": true }
    ]
  }
}
```

### 前端配置

`lib/features/auth/data/services/oauth_providers.dart` 定义了所有 Provider 的元数据和图标映射。登录页按后端返回的数据动态渲染。

---

## 国际认证（International）

| 提供商 | 协议 | 前端 SDK | 后端验证 |
|--------|------|----------|---------|
| Google | ID Token (JWT) | `google_sign_in` | tokeninfo 端点 |
| Apple | Identity Token (JWT) | `sign_in_with_apple` | JWKS + jsonwebtoken |

### 配置要点

参见各平台 SDK 文档：
- `google_sign_in`: https://pub.dev/packages/google_sign_in
- `sign_in_with_apple`: https://pub.dev/packages/sign_in_with_apple

---

## 国内认证（China）

### 验证流程（授权码模式）

```
Flutter App                    Backend
    │                            │
    │  1. 调起 SDK 授权          │
    │  ← 获得 authorization_code │
    │                            │
    │  2. POST /auth/oauth       │
    │  { provider, authorizationCode }
    │                            │
    │  3. 后端用 code 换 token   │
    │    WeChat: api.weixin.qq.com│
    │    Alipay: openapi.alipay  │
    │  4. 获取用户信息           │
    │  5. 创建/查找用户          │
    │  ← JWT tokens              │
```

| 提供商 | 协议 | 前端 SDK | 后端验证 |
|--------|------|----------|---------|
| 微信 | authorization_code | `fluwx` (已集成) | code → access_token → openid/unionid → userinfo |
| 支付宝 | authorization_code | `tobias` (已集成) | auth_code → user_id → user info |

### 微信配置

1. 在 [微信开放平台](https://open.weixin.qq.com/) 注册开发者账号，创建移动应用
2. 获取 AppID 和 AppSecret
3. iOS: 在 Info.plist 配置 URL Schemes（`wx{AppID}`）
4. Android: 在 AndroidManifest 配置 WXEntryActivity

```env
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_APP_SECRET=abcdef1234567890abcdef1234567890
```

### 支付宝配置

1. 在 [支付宝开放平台](https://open.alipay.com/) 创建应用
2. 获取 AppID，配置接口加签方式（RSA2）
3. 生成 RSA 密钥对，在平台配置公钥

```env
ALIPAY_APP_ID=2021001111666666
ALIPAY_PRIVATE_KEY="——BEGIN RSA PRIVATE KEY——\nMI...\n——END RSA PRIVATE KEY——"
```

### 前端 SDK（已集成）

两个国内 SDK 已集成到 `oauth_service.dart` 并在 `pubspec.yaml` 中激活：

| 包 | 版本 | 集成文件 | 状态 |
|----|------|---------|------|
| `fluwx` | ^4.0.0 | `oauth_service.dart: signInWithWeChat()` — 微信授权码获取 | ✅ 已验证兼容 |
| `tobias` | ^3.0.0 | `oauth_service.dart: signInWithAlipay()` — 支付宝 auth_code 获取 | ✅ 已验证兼容 |

初始化在 `main.dart` 中完成，启动时注册 WeChat SDK：

```dart
final oauthService = OAuthService();
await oauthService.init(
  weChatAppId: 'wx...',   // ← 替换为微信 AppID
);
```

各平台的**原生项目配置**（Info.plist / AndroidManifest）仍需在 Xcode / Android Studio 中手动完成（见第三阶段 Checklist）。

---

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/auth/oauth` | 第三方登录认证 |
| GET | `/api/v1/auth/oauth/providers` | 获取可用提供商列表 |

### POST /api/v1/auth/oauth

**ID Token 模式（Google / Apple）**:
```json
{
  "provider": "google",
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**授权码模式（WeChat / Alipay）**:
```json
{
  "provider": "wechat",
  "authorizationCode": "081LJL000m2zG41I3r200e5Guh1LJL0Y"
}
```

---

---

## 联调 Checklist

以下步骤在正式联调前逐项完成。每项标记 ✅ 后即可进入集成测试。

### 第一阶段：平台注册与凭证获取

| # | 步骤 | 平台 | 时间 | 完成 |
|---|------|------|------|------|
| 1.1 | 注册微信开放平台账号 → 创建移动应用 → 等待审核通过 | [open.weixin.qq.com](https://open.weixin.qq.com/) | 1-3 工作日 | ☐ |
| 1.2 | 从微信开放平台获取 AppID 和 AppSecret | — | — | ☐ |
| 1.3 | 注册支付宝开放平台账号 → 创建应用（支付能力可选） | [open.alipay.com](https://open.alipay.com/) | 即时 | ☐ |
| 1.4 | 支付宝应用配置接口加签 → 生成 RSA2 密钥对 → 上传公钥 | — | — | ☐ |
| 1.5 | （可选）Google Cloud Console → 创建 OAuth 2.0 凭据 | [console.cloud.google.com](https://console.cloud.google.com/) | 即时 | ☐ |
| 1.6 | （可选）Apple Developer → 配置 Sign In with Apple Service ID | [developer.apple.com](https://developer.apple.com/) | 即时 | ☐ |

### 第二阶段：后端配置

| # | 步骤 | 文件 | 完成 |
|---|------|------|------|
| 2.1 | 设置 `OAUTH_ENABLED_PROVIDERS`（联调时推荐全开） | `Server-Nodejs/.env` | ☐ |
| 2.2 | 填入 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` | `Server-Nodejs/.env` | ☐ |
| 2.3 | 填入 `ALIPAY_APP_ID` 和 `ALIPAY_PRIVATE_KEY`（私钥可从支付宝开放平台下载） | `Server-Nodejs/.env` | ☐ |
| 2.4 | 验证环境变量加载：`npm run start:dev` 后无 `Missing config` 错误 | 终端日志 | ☐ |
| 2.5 | 验证 `/api/v1/auth/oauth/providers` 返回正确列表 | `curl` 或浏览器 | ☐ |

### 第三阶段：前端项目配置

| # | 步骤 | 平台 | 文件 | 完成 |
|---|------|------|------|------|
| 3.1 | 将前端 `main.dart` 中的 `weChatAppId` 替换为真实微信 AppID | Flutter | `lib/main.dart` | ☐ |
| 3.2 | 执行 `flutter pub get` 确认 SDK 安装成功 | Flutter | 终端日志 | ☐ |
| 3.3 | 执行 `flutter analyze` 确保无编译错误 | Flutter | 终端日志 | ☐ |

#### iOS 原生配置（在 Xcode 中操作）

| # | 步骤 | 操作位置 | 完成 |
|---|------|----------|------|
| 3.4 | 打开 `ios/Runner.xcworkspace` | Xcode | ☐ |
| 3.5 | 微信：在 `Info.plist` 添加 `CFBundleURLTypes`，URL Schemes 填入 `wx{AppID}`（如 `wx1234567890abcdef`） | `ios/Runner/Info.plist` | ☐ |
| 3.7 | 微信：在 `Info.plist` 添加 `LSApplicationQueriesSchemes` 包含 `weixin` 和 `weixinULAPI` | `ios/Runner/Info.plist` | ☐ |
| 3.8 | Apple Sign-In：Target → Signing & Capabilities → "+" → "Sign In with Apple" | Xcode | ☐ |
| 3.9 | Google Sign-In：下载 `GoogleService-Info.plist` 拖入 Runner target，并添加 `CFBundleURLTypes`（REVERSED_CLIENT_ID） | Xcode | ☐ |

示例 `Info.plist` 片段（微信 URL Scheme）：

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>wx1234567890abcdef</string>
    </array>
  </dict>
</array>
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>weixin</string>
  <string>weixinULAPI</string>
</array>
```

#### Android 原生配置

| # | 步骤 | 文件 | 完成 |
|---|------|------|------|
| 3.10 | 微信：创建 `wxapi/WXEntryActivity.kt` 继承 `WXEntryActivity`（fluwx 要求的空壳类） | `android/app/src/main/kotlin/.../wxapi/` | ☐ |
| 3.11 | 微信：在 `AndroidManifest.xml` 注册 WXEntryActivity | `android/app/src/main/AndroidManifest.xml` | ☐ |
| 3.12 | Google：将 `google-services.json` 放入 `android/app/` | — | ☐ |
| 3.13 | Google：在项目级 `build.gradle` 添加 google-services 插件依赖 | `android/build.gradle` | ☐ |

Android `AndroidManifest.xml` 片段：

```xml
<application>
  <!-- WeChat -->
  <activity
    android:name=".wxapi.WXEntryActivity"
    android:exported="true" />
</application>
```

### 第四阶段：联调验证

| # | 测试场景 | 预期结果 | 完成 |
|---|---------|----------|------|
| 4.1 | 用户未安装微信 → 点击"微信登录" → 按钮不显示或显示不可用 | 正确隐藏/禁用 | ☐ |
| 4.2 | 用户已安装微信 → 点击"微信登录" → 调起微信 App → 授权 → 返回原 App → 登录成功 | 跳转首页 | ☐ |
| 4.3 | 用户点击"支付宝登录" → 调起支付宝 App → 授权 → 返回 → 登录成功 | 跳转首页 | ☐ |
| 4.4 | 同一个微信用户第二次登录 → 直接登录（不需重新注册） | 匹配已有账号 | ☐ |
| 4.6 | 退出登录 → 刷新 token 失效 → 重新登录 → 正常 | 完整登出登入 | ☐ |
| 4.7 | 用户取消授权（各平台）→ 返回登录页，无崩溃 | 优雅处理取消 | ☐ |
| 4.8 | Web 端运行 → 国内按钮不可见（nativeOnly=true）→ Google 按钮可见（如已配置 clientId） | 平台隔离正确 | ☐ |

### 已知问题和注意事项

| 问题 | 说明 | 对策 |
|------|------|------|
| 微信未审核通过前 | 新注册的微信开放平台应用默认只有「未审核」状态，可以在测试白名单中加微信号后联调 | 在微信开放平台 → 应用详情 → 白名单中添加测试微信号 |
| 支付宝沙箱环境 | 支付宝支持沙箱环境联调，无需真实资金 | 配置沙箱版支付宝 App，使用沙箱参数 |
| unionid 为空 | 未绑定微信开放平台的账号不返回 unionid | 后端已做降级处理：无 unionid 时用 openid 作为 providerId |
| Android 签名不一致 | 微信严格校验包名和签名，不一致会调起失败 | 在微信开放平台配置的签名必须与打包签名一致 |
| iOS Universal Link | 微信 iOS 推荐使用 Universal Link 替代 URL Scheme 回调 | 在 `main.dart` 的 `init()` 中传入 `weChatUniversalLink` 参数 |

---

## 安全说明

1. **服务端验证**: 前端传递的凭证必须由后端验证，不能信任前端直接传递的用户信息。
2. **WeChat unionid**: 微信的 unionid 只在开放平台绑定后才返回。未绑定时使用 openid，换设备会获得不同 openid。
3. **Apple 隐私邮箱**: Apple 的隐藏邮箱可能每次不同，后端以 `providerId`（Apple sub）为准。
4. **Alipay RSA 签名**: 支付宝需要 RSA2 签名，后端使用 Node.js crypto 模块实现。
