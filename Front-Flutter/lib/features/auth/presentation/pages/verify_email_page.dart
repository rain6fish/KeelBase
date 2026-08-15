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
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // 本页错误独立于全局 AuthProvider，避免展示其它流程遗留的陈旧错误
    _error = null;
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final auth = context.read<AuthProvider>();
    final l10n = context.l10n;
    // 请求在途时忽略重复提交（键盘 Done + 按钮双入口）
    if (_submitting || auth.status == AuthStatus.loading) return;

    final code = _codeCtrl.text.trim();
    if (code.isEmpty || code.length != 6) {
      setState(() => _error = l10n.verificationCodeHint);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    auth.clearError();
    final wasAuthenticated = auth.isAuthenticated;
    try {
      final ok = await auth.verifyEmail(widget.email, code);
      if (!mounted) return;
      setState(() => _submitting = false);
      if (ok) {
        AppToast.success(context, l10n.emailVerifiedSuccess);
        // 仅当验证的邮箱与当前登录账号一致才返回 profile，否则回登录
        context.go(
          wasAuthenticated && auth.user?.email == widget.email
              ? '/profile'
              : '/login',
        );
      } else {
        final message = auth.error ?? l10n.unknownError;
        setState(() => _error = message);
        AppToast.error(context, message);
      }
    } catch (_) {
      // 兜底：provider 内部已捕获，防御未来抛错导致未处理异步异常
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = l10n.unknownError;
      });
      AppToast.error(context, l10n.unknownError);
    }
  }

  Future<void> _onResend() async {
    final auth = context.read<AuthProvider>();
    final l10n = context.l10n;
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    auth.clearError();
    try {
      final ok = await auth.resendVerification(widget.email);
      if (!mounted) return;
      setState(() => _submitting = false);
      if (ok) {
        AppToast.success(context, l10n.codeSent);
      } else {
        final message = auth.error ?? l10n.unknownError;
        setState(() => _error = message);
        AppToast.error(context, message);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = l10n.unknownError;
      });
      AppToast.error(context, l10n.unknownError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final error = _error;

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

        if (error != null)
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
              Expanded(child: Text(error, style: const TextStyle(fontSize: 14, color: CupertinoColors.destructiveRed))),
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
            maxLength: 6,
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
          isLoading: _submitting || a.status == AuthStatus.loading,
          onPressed: _submitting ? null : _onSubmit,
        )),
        const SizedBox(height: 16),

        // Resend
        Center(
          child: CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: _submitting ? null : () => _onResend(),
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
