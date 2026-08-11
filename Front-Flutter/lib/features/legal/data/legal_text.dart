/// 法律文本数据源 — 隐私政策 & 服务条款 中英文全文
///
/// 修改指引：修改下方 _privacyEN / _privacyZH / _termsEN / _termsZH 四个常量即可。
/// 两个页面（PrivacyPolicyPage / TermsOfServicePage）都从此文件读取。
class LegalText {
  // ═══════════════════════════════════════════════════════════
  //  隐私政策
  // ═══════════════════════════════════════════════════════════

  static const privacyPolicyEN = '''
# Privacy Policy

Last updated: July 30, 2026

## 1. Information We Collect

We collect information you provide directly to us, including:

- **Account Information**: When you register or log in, we collect your username, email address, and profile information such as nickname and avatar.
- **Third-Party Account Data**: When you log in via Google, Apple, WeChat, or Alipay, we receive your OpenID, nickname, and avatar from the respective platform.
- **Usage Data**: We collect information about how you interact with our application, including events you create, files you upload, and features you access.

## 2. How We Use Your Information

We use the collected information to:

- Provide, maintain, and improve our services
- Authenticate your identity and maintain your account
- Send service-related notifications
- Respond to your inquiries and support requests

## 3. Information Sharing

We do not sell your personal information. We may share your information only:

- With your consent
- To comply with legal obligations
- To protect our rights and safety

## 4. Data Storage and Security

Your data is stored on our secure servers. We implement industry-standard security measures including encryption in transit (TLS) and encrypted storage. You may request deletion of your account and associated data at any time.

## 5. Your Rights

Depending on your jurisdiction, you may have the right to:

- Access the personal data we hold about you
- Correct inaccurate data
- Delete your data
- Withdraw consent at any time

## 6. Contact Us

If you have questions about this Privacy Policy, please contact us at:

Email: support@front-app.com
''';

  static const privacyPolicyZH = '''
# 隐私政策

最后更新日期：2026 年 7 月 30 日

## 1. 我们收集的信息

我们在您使用服务时收集以下信息：

- **账户信息**：注册或登录时，我们会收集您的用户名、电子邮件地址以及昵称、头像等个人资料。
- **第三方账号数据**：通过 Google、Apple、微信或支付宝登录时，我们会从相应平台获取您的 OpenID、昵称和头像。
- **使用数据**：我们收集您与应用程序的互动信息，包括创建的事件、上传的文件以及访问的功能。

## 2. 信息使用

我们使用收集的信息用于：

- 提供、维护和改进我们的服务
- 验证您的身份并维护您的账户
- 发送与服务相关的通知
- 回应您的咨询和支持请求

## 3. 信息共享

我们不会出售您的个人信息。仅在以下情况下共享：

- 获得您的明确同意
- 遵守法律义务
- 保护我们的权利和安全

## 4. 数据存储与安全

您的数据存储在我们的安全服务器上。我们采用行业标准的安全措施，包括传输加密（TLS）和加密存储。您可以随时请求删除您的账户及相关数据。

## 5. 您的权利

根据您所在地的法律，您可能有权：

- 访问我们持有的您的个人数据
- 更正不准确的数据
- 删除您的数据
- 随时撤回同意

## 6. 联系我们

如果您对本隐私政策有任何疑问，请联系我们：

邮箱：support@front-app.com
''';

  // ═══════════════════════════════════════════════════════════
  //  服务条款
  // ═══════════════════════════════════════════════════════════

  static const termsOfServiceEN = '''
# Terms of Service

Last updated: July 30, 2026

## 1. Acceptance of Terms

By accessing or using KeelBase App ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.

## 2. Description of Service

KeelBase App provides a full-stack application platform that allows users to manage events, upload files, and access AI-powered features. The Service is provided "as is" and we reserve the right to modify or discontinue any feature at any time.

## 3. User Responsibilities

When using the Service, you agree to:

- Provide accurate and up-to-date registration information
- Maintain the confidentiality of your account credentials
- Use the Service in compliance with all applicable laws
- Not engage in any activity that disrupts or interferes with the Service

## 4. Account Termination

We reserve the right to suspend or terminate your account if you violate these Terms. You may delete your account at any time through your profile settings.

## 5. Limitation of Liability

To the maximum extent permitted by law, KeelBase App shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.

## 6. Changes to Terms

We may update these Terms from time to time. We will notify you of material changes via email or through the Service. Continued use after changes constitutes acceptance.

## 7. Governing Law

These Terms shall be governed by and construed in accordance with applicable laws.
''';

  static const termsOfServiceZH = '''
# 服务条款

最后更新日期：2026 年 7 月 30 日

## 1. 条款接受

访问或使用 KeelBase App（"本服务"）即表示您同意受本服务条款的约束。如果您不同意，请勿使用本服务。

## 2. 服务描述

KeelBase App 提供全栈应用平台，允许用户管理事件、上传文件以及使用 AI 功能。本服务按"现状"提供，我们保留随时修改或中断任何功能的权利。

## 3. 用户责任

使用本服务时，您同意：

- 提供准确和最新的注册信息
- 维护您的账户凭证的机密性
- 遵守所有适用法律使用本服务
- 不从事任何破坏或干扰本服务的行为

## 4. 账户终止

如果您违反本条款，我们保留暂停或终止您的账户的权利。您可以随时通过个人设置删除您的账户。

## 5. 责任限制

在法律允许的最大范围内，KeelBase App 不对因您使用本服务而产生的任何间接、附带或后果性损害承担责任。

## 6. 条款变更

我们可能会不时更新本条款。重大变更将通过电子邮件或本服务通知您。变更后继续使用即表示您接受变更。

## 7. 适用法律

本条款应受适用法律管辖并按其解释。
''';
}
