// SPDX-License-Identifier: Apache-2.0

import '../../../../core/i18n/app_localizations.dart';
import '../../data/services/oauth_service.dart';

/// Turn an [OAuthException]'s key into a sentence in the reader's language.
///
/// The service that raises it has no build context, so it carries a key and the sentence is built
/// here, where there is one. The mapping lives on this side of the boundary rather than inside
/// [AppLocalizations] because core must not depend on features (docs/architecture-boundary.md).
///
/// 把 [OAuthException] 的 key 译成读者语言的句子。
///
/// 抛它的服务没有 build context，所以它只带 key，句子在有 context 的这一侧拼。映射放在这一侧而不是
/// [AppLocalizations] 里，是因为 core 不允许依赖 features（见 docs/architecture-boundary.md）。
String oauthErrorText(AppLocalizations l10n, OAuthException e) => switch (e.key) {
      OAuthErrorKey.nativeOnly => l10n.oauthNativeOnly,
      OAuthErrorKey.notAvailableBrowser => l10n.oauthNotAvailableBrowser,
      OAuthErrorKey.notAvailableDevice => l10n.oauthNotAvailableDevice,
      OAuthErrorKey.cancelled => l10n.oauthCancelled,
      OAuthErrorKey.noCredential => l10n.oauthNoCredential,
      OAuthErrorKey.sdkNotConfigured => l10n.oauthSdkNotConfigured,
      OAuthErrorKey.unsupportedProvider => l10n.oauthUnsupportedProvider,
      OAuthErrorKey.failed => l10n.oauthFailed(e.params['detail'] ?? ''),
    };
