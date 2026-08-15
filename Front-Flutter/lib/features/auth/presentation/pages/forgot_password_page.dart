import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';

/// 忘记密码：输入邮箱请求发送重置邮件
class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _emailCtrl = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  static bool _isValidEmail(String email) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email);

  Future<void> _onSubmit() async {
    final email = _emailCtrl.text.trim();
    final auth = context.read<AuthProvider>();
    final l10n = context.l10n;
    // 请求在途时忽略重复提交（键盘 Done + 按钮双入口）
    if (auth.status == AuthStatus.loading) return;

    if (email.isEmpty) {
      AppToast.error(context, l10n.emailRequired);
      return;
    }
    if (!_isValidEmail(email)) {
      AppToast.error(context, l10n.invalidEmail);
      return;
    }

    auth.clearError();
    try {
      final ok = await auth.requestPasswordReset(email);
      if (!mounted) return;
      if (ok) {
        setState(() => _sent = true);
      } else {
        AppToast.error(context, auth.error ?? l10n.unknownError);
      }
    } catch (_) {
      // 兜底：provider 内部已捕获，防御未来抛错导致未处理异步异常
      if (!mounted) return;
      AppToast.error(context, l10n.unknownError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.forgotPassword),
        previousPageTitle: l10n.back,
      ),
      child: ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 20),

        Text(l10n.forgotPassword,
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
        const SizedBox(height: 6),
        Text(l10n.resetPasswordHint,
            style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context))),
        const SizedBox(height: 32),

        if (_sent) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGreen.withAlpha(15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: CupertinoColors.systemGreen.withAlpha(40)),
            ),
            child: Column(children: [
              const Icon(CupertinoIcons.checkmark_circle, size: 40, color: CupertinoColors.systemGreen),
              const SizedBox(height: 12),
              Text(l10n.resetEmailSent,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15)),
            ]),
          ),
          const SizedBox(height: 24),
          Center(
            child: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => context.go('/login'),
              child: Text(
                l10n.backToLogin,
                style: TextStyle(color: t.primaryColor, fontWeight: FontWeight.w600, fontSize: 15),
              ),
            ),
          ),
        ] else ...[
          Consumer<AuthProvider>(
            builder: (_, a, _) {
              final authError = a.status == AuthStatus.error ? a.error : null;
              if (authError == null) return const SizedBox.shrink();
              return Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: CupertinoColors.destructiveRed.withAlpha(15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: CupertinoColors.destructiveRed.withAlpha(40)),
                ),
                child: Row(children: [
                  const Icon(CupertinoIcons.exclamationmark_circle, size: 18, color: CupertinoColors.destructiveRed),
                  const SizedBox(width: 10),
                  Expanded(child: Text(authError, style: const TextStyle(fontSize: 14, color: CupertinoColors.destructiveRed))),
                ]),
              );
            },
          ),

          // Email
          Container(
            decoration: BoxDecoration(
              color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
            ),
            child: CupertinoTextField(
              controller: _emailCtrl,
              placeholder: l10n.emailHint,
              placeholderStyle: TextStyle(fontSize: 16, color: CupertinoColors.systemGrey.resolveFrom(context)),
              style: TextStyle(fontSize: 16, color: t.textTheme.textStyle.color),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              keyboardType: TextInputType.emailAddress,
              clearButtonMode: OverlayVisibilityMode.editing,
              prefix: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Icon(CupertinoIcons.mail, size: 22, color: CupertinoColors.systemGrey.resolveFrom(context)),
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _onSubmit(),
            ),
          ),
          const SizedBox(height: 32),

          Consumer<AuthProvider>(builder: (_, a, _) => AppPrimaryButton(
            label: l10n.sendResetLink,
            isLoading: a.status == AuthStatus.loading,
            onPressed: _onSubmit,
          )),
        ],
      ]),
    );
  }
}
