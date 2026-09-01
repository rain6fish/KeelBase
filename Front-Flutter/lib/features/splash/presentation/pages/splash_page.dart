// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/services/app_lock_provider.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../version/presentation/providers/version_check_provider.dart';
import '../../../version/presentation/widgets/update_dialog.dart';
import '../../../onboarding/presentation/providers/onboarding_provider.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  /// 启动引导：先查版本更新（强制更新阻断），再加载引导状态，再自动登录。
  Future<void> _bootstrap() async {
    final onboardingProvider = context.read<OnboardingProvider>();
    await onboardingProvider.load();
    if (!mounted) return;
    final versionProvider = context.read<VersionCheckProvider>();
    final decision = await versionProvider.check();
    if (!mounted) return;

    if (decision == AppUpdateDecision.forced) {
      final info = versionProvider.info;
      if (info != null) {
        await showForceUpdateDialog(context, info);
        return; // 强制更新：不自动登录，停留在升级提示
      }
    } else if (decision == AppUpdateDecision.optional) {
      final info = versionProvider.info;
      if (info != null) showOptionalUpdateDialog(context, info);
    }

    // UX-4 应用锁：若已开启，启动时先过生物识别（FaceID/指纹）
    final appLock = context.read<AppLockProvider>();
    if (appLock.enabled) {
      final ok = await appLock.authenticate();
      if (!mounted) return;
      if (!ok) return; // 验证失败：停留在 splash，不进入应用
    }

    context.read<AuthProvider>().tryAutoLogin();
  }

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);

    return CupertinoPageScaffold(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(CupertinoIcons.sparkles, size: 64, color: CupertinoColors.systemBlue),
            const SizedBox(height: 16),
            Text('KeelBase', style: theme.textTheme.navLargeTitleTextStyle.copyWith(fontSize: 34)),
            const SizedBox(height: 32),
            const CupertinoActivityIndicator(radius: 14),
          ],
        ),
      ),
    );
  }
}
