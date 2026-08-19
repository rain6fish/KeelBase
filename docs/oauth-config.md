# OAuth 第三方登录（免注册）配置指南 / OAuth Third-Party Login (Registration-Free) Configuration Guide

## 架构概述 / Architecture Overview

```
┌──────────────┐  ID Token / Auth Code  ┌──────────────────────┐
│  Flutter App  │ ────────────────────→ │  Backend (NestJS)    │
│  (OAuth SDKs) │                       │  /api/v1/auth/oauth  │
│               │ ←────────────────── │  OAuthService         │
│               │    JWT tokens       │  ├─ Google: tokeninfo │
└──────────────┘                      │  ├─ Apple: JWKS       │
                                      │  ├─ WeChat: code→openid│
                                      │  ├─ Alipay: code→user │
                                      │  └─ OIDC: 发现+JWKS   │
                                      └──────────────────────┘
```

### 关键设计 / Key Design Decisions

1. **配置驱动**: 通过 `OAUTH_ENABLED_PROVIDERS` 环境变量控制哪些认证方式可用，前后端自动适配。
   **Config-driven**: the `OAUTH_ENABLED_PROVIDERS` env var controls which auth methods are available; frontend and backend adapt automatically.
2. **国际/国内/企业分组**: 登录页按「国际」「国内」「企业」三个区域展示按钮，由后端配置决定。
   **International/China/Enterprise grouping**: the login page shows buttons in "International", "China" and "Enterprise" sections, determined by backend config.
3. **免注册**: 新用户首次使用第三方登录时自动创建账号，无需填写注册表单。
   **Registration-free**: a new user's first third-party login auto-creates an account without filling out a registration form.
4. **账号关联**: 同一邮箱的已有账号会自动关联新的第三方登录方式。
   **Account linking**: existing accounts with the same email are automatically linked to the new third-party login method.

---

## 配置体系 / Configuration System

### 环境变量（后端 `.env`） / Environment Variables (Backend .env)

```env
# 启用的 OAuth 提供商（逗号分隔）—— 这是核心配置开关
OAUTH_ENABLED_PROVIDERS=google,apple,wechat,alipay,oidc

# 国际
GOOGLE_CLIENT_ID=
APPLE_CLIENT_ID=

# 国内
WECHAT_APP_ID=
WECHAT_APP_SECRET=
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=

# 企业 SSO（通用 OIDC）：配齐 issuer/client_id/client_secret 后，/auth/oauth/providers 出现 oidc（enterprise 组）
OIDC_ISSUER=https://sso.example.com/realms/your-realm
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
```

### Provider 自动发现 / Provider Auto-Discovery

前端在登录页加载时调用 `GET /api/v1/auth/oauth/providers`，后端返回基于 env 的可用列表：

The frontend calls `GET /api/v1/auth/oauth/providers` when the login page loads; the backend returns the available list based on env:

```json
{
  "enabledProviders": ["google", "apple", "wechat", "oidc"],
  "providers": [...],
  "groups": {
    "international": [
      { "id": "google", "name": "Google", "icon": "google", "nativeOnly": false }
    ],
    "china": [
      { "id": "wechat", "name": "微信", "icon": "wechat", "nativeOnly": true }
    ],
    "enterprise": [
      { "id": "oidc", "name": "企业 SSO", "icon": "sso", "nativeOnly": false }
    ]
  }
}
```

### 前端配置 / Frontend Configuration

`lib/features/auth/data/services/oauth_providers.dart` 定义了所有 Provider 的元数据和图标映射。登录页按后端返回的数据动态渲染。

`lib/features/auth/data/services/oauth_providers.dart` defines the metadata and icon mapping for all providers. The login page renders dynamically based on the data returned by the backend.

---

## 国际认证（International） / International Authentication

| 提供商 / Provider | 协议 / Protocol | 前端 SDK / Frontend SDK | 后端验证 / Backend verification |
|--------|------|----------|---------|
| Google | ID Token (JWT) | `google_sign_in` | tokeninfo 端点 / tokeninfo endpoint |
| Apple | Identity Token (JWT) | `sign_in_with_apple` | JWKS + jsonwebtoken |

### 配置要点 / Configuration Notes

参见各平台 SDK 文档：

See each platform's SDK documentation:

- `google_sign_in`: https://pub.dev/packages/google_sign_in
- `sign_in_with_apple`: https://pub.dev/packages/sign_in_with_apple

---

## 国内认证（China） / China Authentication

### 验证流程（授权码模式） / Verification Flow (Authorization Code Mode)

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

| 提供商 / Provider | 协议 / Protocol | 前端 SDK / Frontend SDK | 后端验证 / Backend verification |
|--------|------|----------|---------|
| 微信 / WeChat | authorization_code | `fluwx` (已集成 / integrated) | code → access_token → openid/unionid → userinfo |
| 支付宝 / Alipay | authorization_code | `tobias` (已集成 / integrated) | auth_code → user_id → user info |

### 微信配置 / WeChat Configuration

1. 在 [微信开放平台](https://open.weixin.qq.com/) 注册开发者账号，创建移动应用
   Register a developer account on the [WeChat Open Platform](https://open.weixin.qq.com/) and create a mobile app
2. 获取 AppID 和 AppSecret
   Obtain the AppID and AppSecret
3. iOS: 在 Info.plist 配置 URL Schemes（`wx{AppID}`）
   iOS: configure URL Schemes in Info.plist (`wx{AppID}`)
4. Android: 在 AndroidManifest 配置 WXEntryActivity
   Android: configure WXEntryActivity in AndroidManifest

```env
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_APP_SECRET=abcdef1234567890abcdef1234567890
```

### 支付宝配置 / Alipay Configuration

1. 在 [支付宝开放平台](https://open.alipay.com/) 创建应用
   Create an app on the [Alipay Open Platform](https://open.alipay.com/)
2. 获取 AppID，配置接口加签方式（RSA2）
   Obtain the AppID and configure the interface signing method (RSA2)
3. 生成 RSA 密钥对，在平台配置公钥
   Generate an RSA key pair and configure the public key on the platform

```env
ALIPAY_APP_ID=2021001111666666
ALIPAY_PRIVATE_KEY="——BEGIN RSA PRIVATE KEY——\nMI...\n——END RSA PRIVATE KEY——"
```

### 前端 SDK（已集成） / Frontend SDK (Integrated)

两个国内 SDK 已集成到 `oauth_service.dart` 并在 `pubspec.yaml` 中激活：

The two China SDKs are integrated into `oauth_service.dart` and activated in `pubspec.yaml`:

| 包 / Package | 版本 / Version | 集成文件 / Integration file | 状态 / Status |
|----|------|---------|------|
| `fluwx` | ^4.0.0 | `oauth_service.dart: signInWithWeChat()` — 微信授权码获取 / obtains the WeChat auth code | ✅ 已验证兼容 / Verified compatible |
| `tobias` | ^3.0.0 | `oauth_service.dart: signInWithAlipay()` — 支付宝 auth_code 获取 / obtains the Alipay auth_code | ✅ 已验证兼容 / Verified compatible |

初始化在 `main.dart` 中完成，启动时注册 WeChat SDK：

Initialization happens in `main.dart`; the WeChat SDK is registered at startup:

```dart
final oauthService = OAuthService();
await oauthService.init(
  weChatAppId: 'wx...',   // ← 替换为微信 AppID
);
```

各平台的**原生项目配置**（Info.plist / AndroidManifest）仍需在 Xcode / Android Studio 中手动完成（见第三阶段 Checklist）。

Each platform's **native project configuration** (Info.plist / AndroidManifest) still must be done manually in Xcode / Android Studio (see Phase 3 Checklist).

---

## 企业 SSO（OIDC） / Enterprise SSO (OIDC)

> 通用 OIDC authorization code flow（P2-4）——对接任何标准 OIDC 身份提供方（如 Keycloak / Azure AD / Authing），登录页展示「企业 SSO」按钮。
> Generic OIDC authorization code flow (P2-4) — works with any standards-compliant OIDC identity provider (e.g. Keycloak / Azure AD / Authing); the login page shows an "Enterprise SSO" button.

### 验证流程（授权码模式） / Verification Flow (Authorization Code Mode)

```
Flutter App                    Backend
    │                            │
    │  1. 调起企业 SSO 授权      │
    │  ← 获得 authorization_code │
    │                            │
    │  2. POST /auth/oauth       │
    │  { provider: "oidc", authorizationCode }
    │                            │
    │  3. 动态发现               │
    │    GET {issuer}/.well-known/openid-configuration
    │  4. token 交换             │
    │    POST token_endpoint     │
    │  5. id_token 签名验证      │
    │    issuer + audience + JWKS
    │  6. userinfo 获取          │
    │    Bearer access_token     │
    │  7. 创建/查找用户          │
    │  ← JWT tokens              │
```

| 提供商 / Provider | 协议 / Protocol | 前端 SDK / Frontend SDK | 后端验证 / Backend verification |
|--------|------|----------|---------|
| 企业 SSO / OIDC | authorization_code | 浏览器 / 系统浏览器（`nativeOnly=false`） | 动态发现 + token 交换 + id_token 签名验证（issuer/audience/JWKS）+ userinfo |

### 配置要点 / Configuration Notes

1. 在 IdP 侧创建 **confidential client** 应用，配置回调地址，获取 `client_id` / `client_secret`
   Create a **confidential client** app in the IdP, configure the callback URL, and obtain `client_id` / `client_secret`
2. 后端填 `OIDC_ISSUER` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET`（缺一则 `/auth/oauth/providers` 不返回 oidc）
   Fill `OIDC_ISSUER` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` in the backend (missing any one → oidc absent from `/auth/oauth/providers`)
3. `OAUTH_ENABLED_PROVIDERS` 需包含 `oidc`
   `OAUTH_ENABLED_PROVIDERS` must include `oidc`

```env
OIDC_ISSUER=https://sso.example.com/realms/your-realm
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

### 安全说明 / Security Notes

- **动态发现 + 防混淆**：后端 GET `{issuer}/.well-known/openid-configuration` 动态发现端点，并校验发现文档返回的 `issuer` 与配置一致（防混淆攻击）
  **Dynamic discovery + anti-confusion**: the backend discovers endpoints via `{issuer}/.well-known/openid-configuration` and verifies the returned `issuer` matches the configured one
- **id_token 签名验证**：按 `kid` 从 `jwks_uri` 取公钥验签，同时校验 `issuer` 与 `audience`（= client_id）——双重防混淆
  **id_token signature verification**: the public key is fetched from `jwks_uri` by `kid`, and both `issuer` and `audience` (= client_id) are verified — double anti-confusion
- **userinfo 降级**：userinfo 端点不可用时，降级用 id_token 内的声明（sub/email/name/picture）
  **userinfo fallback**: when the userinfo endpoint is unavailable, claims from the id_token are used (sub/email/name/picture)

---

## API 端点 / API Endpoints

| Method | Path | 说明 / Description |
|--------|------|------|
| POST | `/api/v1/auth/oauth` | 第三方登录认证 / Third-party login authentication |
| GET | `/api/v1/auth/oauth/providers` | 获取可用提供商列表 / Get the available provider list |

### POST /api/v1/auth/oauth

**ID Token 模式（Google / Apple）** / **ID Token mode (Google / Apple)**:
```json
{
  "provider": "google",
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**授权码模式（WeChat / Alipay / OIDC）** / **Authorization code mode (WeChat / Alipay / OIDC)**:
```json
{
  "provider": "wechat",
  "authorizationCode": "081LJL000m2zG41I3r200e5Guh1LJL0Y"
}
```

---

---

## 联调 Checklist / Integration Testing Checklist

以下步骤在正式联调前逐项完成。每项标记 ✅ 后即可进入集成测试。

Complete the following steps one by one before formal integration testing. Once each item is marked ✅, proceed to integration testing.

### 第一阶段：平台注册与凭证获取 / Phase 1: Platform Registration and Credential Acquisition

| # | 步骤 / Step | 平台 / Platform | 时间 / Time | 完成 / Done |
|---|------|------|------|------|
| 1.1 | 注册微信开放平台账号 → 创建移动应用 → 等待审核通过 / Register a WeChat Open Platform account → create a mobile app → wait for approval | [open.weixin.qq.com](https://open.weixin.qq.com/) | 1-3 工作日 / 1-3 business days | ☐ |
| 1.2 | 从微信开放平台获取 AppID 和 AppSecret / Obtain AppID and AppSecret from the WeChat Open Platform | — | — | ☐ |
| 1.3 | 注册支付宝开放平台账号 → 创建应用（支付能力可选） / Register an Alipay Open Platform account → create an app (payment capability optional) | [open.alipay.com](https://open.alipay.com/) | 即时 / Immediate | ☐ |
| 1.4 | 支付宝应用配置接口加签 → 生成 RSA2 密钥对 → 上传公钥 / Configure interface signing for the Alipay app → generate an RSA2 key pair → upload the public key | — | — | ☐ |
| 1.5 | （可选）Google Cloud Console → 创建 OAuth 2.0 凭据 / (Optional) Google Cloud Console → create OAuth 2.0 credentials | [console.cloud.google.com](https://console.cloud.google.com/) | 即时 / Immediate | ☐ |
| 1.6 | （可选）Apple Developer → 配置 Sign In with Apple Service ID / (Optional) Apple Developer → configure the Sign In with Apple Service ID | [developer.apple.com](https://developer.apple.com/) | 即时 / Immediate | ☐ |

### 第二阶段：后端配置 / Phase 2: Backend Configuration

| # | 步骤 / Step | 文件 / File | 完成 / Done |
|---|------|------|------|
| 2.1 | 设置 `OAUTH_ENABLED_PROVIDERS`（联调时推荐全开） / Set `OAUTH_ENABLED_PROVIDERS` (recommended to enable all during integration) | `Server-NestJS/.env` | ☐ |
| 2.2 | 填入 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` / Fill in `WECHAT_APP_ID` and `WECHAT_APP_SECRET` | `Server-NestJS/.env` | ☐ |
| 2.3 | 填入 `ALIPAY_APP_ID` 和 `ALIPAY_PRIVATE_KEY`（私钥可从支付宝开放平台下载） / Fill in `ALIPAY_APP_ID` and `ALIPAY_PRIVATE_KEY` (the private key can be downloaded from the Alipay Open Platform) | `Server-NestJS/.env` | ☐ |
| 2.4 | 验证环境变量加载：`npm run start:dev` 后无 `Missing config` 错误 / Verify env loading: no `Missing config` errors after `npm run start:dev` | 终端日志 / Terminal logs | ☐ |
| 2.5 | 验证 `/api/v1/auth/oauth/providers` 返回正确列表 / Verify `/api/v1/auth/oauth/providers` returns the correct list | `curl` 或浏览器 / `curl` or a browser | ☐ |

### 第三阶段：前端项目配置 / Phase 3: Frontend Project Configuration

| # | 步骤 / Step | 平台 / Platform | 文件 / File | 完成 / Done |
|---|------|------|------|------|
| 3.1 | 将前端 `main.dart` 中的 `weChatAppId` 替换为真实微信 AppID / Replace the `weChatAppId` in the frontend `main.dart` with the real WeChat AppID | Flutter | `lib/main.dart` | ☐ |
| 3.2 | 执行 `flutter pub get` 确认 SDK 安装成功 / Run `flutter pub get` to confirm the SDK installed successfully | Flutter | 终端日志 / Terminal logs | ☐ |
| 3.3 | 执行 `flutter analyze` 确保无编译错误 / Run `flutter analyze` to ensure no compile errors | Flutter | 终端日志 / Terminal logs | ☐ |

#### iOS 原生配置（在 Xcode 中操作） / iOS Native Configuration (Done in Xcode)

| # | 步骤 / Step | 操作位置 / Location | 完成 / Done |
|---|------|----------|------|
| 3.4 | 打开 `ios/Runner.xcworkspace` / Open `ios/Runner.xcworkspace` | Xcode | ☐ |
| 3.5 | 微信：在 `Info.plist` 添加 `CFBundleURLTypes`，URL Schemes 填入 `wx{AppID}`（如 `wx1234567890abcdef`） / WeChat: add `CFBundleURLTypes` in `Info.plist`, fill URL Schemes with `wx{AppID}` (e.g. `wx1234567890abcdef`) | `ios/Runner/Info.plist` | ☐ |
| 3.7 | 微信：在 `Info.plist` 添加 `LSApplicationQueriesSchemes` 包含 `weixin` 和 `weixinULAPI` / WeChat: add `LSApplicationQueriesSchemes` in `Info.plist` containing `weixin` and `weixinULAPI` | `ios/Runner/Info.plist` | ☐ |
| 3.8 | Apple Sign-In：Target → Signing & Capabilities → "+" → "Sign In with Apple" / Apple Sign-In: Target → Signing & Capabilities → "+" → "Sign In with Apple" | Xcode | ☐ |
| 3.9 | Google Sign-In：下载 `GoogleService-Info.plist` 拖入 Runner target，并添加 `CFBundleURLTypes`（REVERSED_CLIENT_ID） / Google Sign-In: download `GoogleService-Info.plist`, drag it into the Runner target, and add `CFBundleURLTypes` (REVERSED_CLIENT_ID) | Xcode | ☐ |

示例 `Info.plist` 片段（微信 URL Scheme）：

Sample `Info.plist` snippet (WeChat URL Scheme):

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

#### Android 原生配置 / Android Native Configuration

| # | 步骤 / Step | 文件 / File | 完成 / Done |
|---|------|------|------|
| 3.10 | 微信：创建 `wxapi/WXEntryActivity.kt` 继承 `WXEntryActivity`（fluwx 要求的空壳类） / WeChat: create `wxapi/WXEntryActivity.kt` extending `WXEntryActivity` (the shell class fluwx requires) | `android/app/src/main/kotlin/.../wxapi/` | ☐ |
| 3.11 | 微信：在 `AndroidManifest.xml` 注册 WXEntryActivity / WeChat: register WXEntryActivity in `AndroidManifest.xml` | `android/app/src/main/AndroidManifest.xml` | ☐ |
| 3.12 | Google：将 `google-services.json` 放入 `android/app/` / Google: put `google-services.json` into `android/app/` | — | ☐ |
| 3.13 | Google：在项目级 `build.gradle` 添加 google-services 插件依赖 / Google: add the google-services plugin dependency to the project-level `build.gradle` | `android/build.gradle` | ☐ |

Android `AndroidManifest.xml` 片段：

Android `AndroidManifest.xml` snippet:

```xml
<application>
  <!-- WeChat -->
  <activity
    android:name=".wxapi.WXEntryActivity"
    android:exported="true" />
</application>
```

### 第四阶段：联调验证 / Phase 4: Integration Verification

| # | 测试场景 / Test scenario | 预期结果 / Expected result | 完成 / Done |
|---|---------|----------|------|
| 4.1 | 用户未安装微信 → 点击"微信登录" → 按钮不显示或显示不可用 / User has no WeChat installed → tap "WeChat login" → button hidden or shown disabled | 正确隐藏/禁用 / Correctly hidden/disabled | ☐ |
| 4.2 | 用户已安装微信 → 点击"微信登录" → 调起微信 App → 授权 → 返回原 App → 登录成功 / User has WeChat installed → tap "WeChat login" → launches the WeChat app → authorize → return to the app → login succeeds | 跳转首页 / Navigate to home | ☐ |
| 4.3 | 用户点击"支付宝登录" → 调起支付宝 App → 授权 → 返回 → 登录成功 / User taps "Alipay login" → launches the Alipay app → authorize → return → login succeeds | 跳转首页 / Navigate to home | ☐ |
| 4.4 | 同一个微信用户第二次登录 → 直接登录（不需重新注册） / The same WeChat user logs in a second time → direct login (no re-registration) | 匹配已有账号 / Matches existing account | ☐ |
| 4.6 | 退出登录 → 刷新 token 失效 → 重新登录 → 正常 / Logout → refresh token invalidated → log in again → works | 完整登出登入 / Complete logout/login | ☐ |
| 4.7 | 用户取消授权（各平台）→ 返回登录页，无崩溃 / User cancels authorization (each platform) → back to the login page, no crash | 优雅处理取消 / Gracefully handle cancellation | ☐ |
| 4.8 | Web 端运行 → 国内按钮不可见（nativeOnly=true）→ Google 按钮可见（如已配置 clientId） / Running on Web → China buttons hidden (nativeOnly=true) → Google button visible (if clientId configured) | 平台隔离正确 / Correct platform isolation | ☐ |

### 已知问题和注意事项 / Known Issues and Notes

| 问题 / Issue | 说明 / Description | 对策 / Mitigation |
|------|------|------|
| 微信未审核通过前 / Before WeChat approval | 新注册的微信开放平台应用默认只有「未审核」状态，可以在测试白名单中加微信号后联调 / Newly registered WeChat Open Platform apps default to the "unreviewed" status; integration can be done by adding WeChat IDs to the test whitelist | 在微信开放平台 → 应用详情 → 白名单中添加测试微信号 / Add test WeChat IDs in WeChat Open Platform → app details → whitelist |
| 支付宝沙箱环境 / Alipay sandbox | 支付宝支持沙箱环境联调，无需真实资金 / Alipay supports sandbox integration without real funds | 配置沙箱版支付宝 App，使用沙箱参数 / Configure the sandbox Alipay app and use sandbox parameters |
| unionid 为空 / Empty unionid | 未绑定微信开放平台的账号不返回 unionid / Accounts not bound to the WeChat Open Platform do not return a unionid | 后端已做降级处理：无 unionid 时用 openid 作为 providerId / The backend handles the fallback: without a unionid, openid is used as providerId |
| Android 签名不一致 / Android signature mismatch | 微信严格校验包名和签名，不一致会调起失败 / WeChat strictly validates the package name and signature; mismatches cause launch failure | 在微信开放平台配置的签名必须与打包签名一致 / The signature configured on the WeChat Open Platform must match the packaging signature |
| iOS Universal Link | 微信 iOS 推荐使用 Universal Link 替代 URL Scheme 回调 / WeChat iOS recommends Universal Link over URL Scheme callbacks | 在 `main.dart` 的 `init()` 中传入 `weChatUniversalLink` 参数 / Pass the `weChatUniversalLink` parameter in `main.dart`'s `init()` |

---

## 安全说明 / Security Notes

1. **服务端验证**: 前端传递的凭证必须由后端验证，不能信任前端直接传递的用户信息。
   **Server-side verification**: credentials passed by the frontend must be verified by the backend; user info passed directly by the frontend must not be trusted.
2. **WeChat unionid**: 微信的 unionid 只在开放平台绑定后才返回。未绑定时使用 openid，换设备会获得不同 openid。
   **WeChat unionid**: WeChat returns the unionid only after binding on the Open Platform. When unbound, openid is used; a different device yields a different openid.
3. **Apple 隐私邮箱**: Apple 的隐藏邮箱可能每次不同，后端以 `providerId`（Apple sub）为准。
   **Apple private email**: Apple's relay email may differ each time; the backend uses `providerId` (Apple sub) as the source of truth.
4. **Alipay RSA 签名**: 支付宝需要 RSA2 签名，后端使用 Node.js crypto 模块实现。
   **Alipay RSA signature**: Alipay requires an RSA2 signature, implemented in the backend with the Node.js crypto module.
