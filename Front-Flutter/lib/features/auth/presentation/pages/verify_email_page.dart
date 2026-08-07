import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';

/// 邮箱验证页：输入验证码验证邮箱
class VerifyEmailPage extends StatefulWidget {
  final String email;

  const VerifyEmailPage({super.key, required this.email});

  @override
  State<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends State<VerifyEmailPage> {
  final _codeCtrl = TextEditingController();

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;

    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.verifyEmail(widget.email, code);

    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.emailVerifiedSuccess);
      // 已登录用户返回 profile；未登录跳登录
      context.go(auth.isAuthenticated ? '/profile' : '/login');
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  Future<void> _onResend() async {
    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.resendVerification(widget.email);
    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.codeSent);
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
        middle: Text(l10n.verifyEmail),
        previousPageTitle: l10n.back,
      ),
      child: ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 20),

        Text(l10n.verifyEmail,
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
        const SizedBox(height: 6),
        Text(
          '${l10n.codeSent} ${widget.email}',
          style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
        ),
        const SizedBox(height: 32),

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

        // Code
        Container(
          decoration: BoxDecoration(
            color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
          ),
          child: CupertinoTextField(
            controller: _codeCtrl,
            placeholder: l10n.verificationCodeHint,
            placeholderStyle: TextStyle(fontSize: 16, color: CupertinoColors.systemGrey.resolveFrom(context)),
            style: TextStyle(fontSize: 16, color: t.textTheme.textStyle.color),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            keyboardType: TextInputType.number,
            clearButtonMode: OverlayVisibilityMode.editing,
            prefix: Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Icon(CupertinoIcons.number, size: 22, color: CupertinoColors.systemGrey.resolveFrom(context)),
            ),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _onSubmit(),
          ),
        ),
        const SizedBox(height: 32),

        Consumer<AuthProvider>(builder: (_, a, _) => AppPrimaryButton(
          label: l10n.verifyEmail,
          isLoading: a.status == AuthStatus.loading,
          onPressed: _onSubmit,
        )),
        const SizedBox(height: 16),

        // Resend
        Center(
          child: CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: () => _onResend(),
            child: Text(
              l10n.resendCode,
              style: TextStyle(color: t.primaryColor, fontWeight: FontWeight.w600, fontSize: 15),
            ),
          ),
        ),
      ]),
    );
  }
}
