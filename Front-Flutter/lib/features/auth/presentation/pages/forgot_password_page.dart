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

  Future<void> _onSubmit() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;

    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.requestPasswordReset(email);

    if (!mounted) return;
    if (ok) {
      setState(() => _sent = true);
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final auth = context.watch<AuthProvider>();
    final authError = auth.status == AuthStatus.error ? auth.error : null;

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
          if (authError != null)
            Container(
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
