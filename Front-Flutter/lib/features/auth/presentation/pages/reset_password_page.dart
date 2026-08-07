import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';

/// 重置密码：从邮件链接进入，设置新密码
class ResetPasswordPage extends StatefulWidget {
  final String token;

  const ResetPasswordPage({super.key, required this.token});

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final password = _passwordCtrl.text;
    final confirm = _confirmCtrl.text;
    if (password.isEmpty || confirm.isEmpty) return;

    final l10n = context.l10n;
    if (password != confirm) {
      AppToast.error(context, l10n.passwordMismatch);
      return;
    }

    final auth = context.read<AuthProvider>();
    auth.clearError();
    final ok = await auth.resetPassword(widget.token, password);

    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.resetSuccess);
      context.go('/login');
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  Widget _buildField({
    required TextEditingController ctrl,
    required String placeholder,
    bool obscure = false,
    bool showToggle = false,
    VoidCallback? onToggle,
  }) {
    final t = CupertinoTheme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
      ),
      child: CupertinoTextField(
        controller: ctrl,
        placeholder: placeholder,
        placeholderStyle: TextStyle(fontSize: 16, color: CupertinoColors.systemGrey.resolveFrom(context)),
        style: TextStyle(fontSize: 16, color: t.textTheme.textStyle.color),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        obscureText: obscure,
        clearButtonMode: OverlayVisibilityMode.editing,
        prefix: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Icon(CupertinoIcons.lock_fill, size: 22, color: CupertinoColors.systemGrey.resolveFrom(context)),
        ),
        suffix: showToggle
            ? CupertinoButton(
                padding: const EdgeInsets.only(right: 6),
                minimumSize: const Size(32, 32),
                onPressed: onToggle,
                child: Icon(
                  obscure ? CupertinoIcons.eye : CupertinoIcons.eye_slash,
                  size: 20, color: CupertinoColors.systemGrey,
                ),
              )
            : null,
        textInputAction: showToggle ? TextInputAction.next : TextInputAction.done,
        onSubmitted: (_) => showToggle
            ? FocusScope.of(context).nextFocus()
            : _onSubmit(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final auth = context.watch<AuthProvider>();
    final authError = auth.status == AuthStatus.error ? auth.error : null;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.resetPassword),
        previousPageTitle: l10n.back,
      ),
      child: ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 20),

        Text(l10n.resetPassword,
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
        const SizedBox(height: 6),
        Text(l10n.resetPasswordHint,
            style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context))),
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

        _buildField(
          ctrl: _passwordCtrl,
          placeholder: l10n.newPassword,
          obscure: _obscurePassword,
          showToggle: true,
          onToggle: () => setState(() => _obscurePassword = !_obscurePassword),
        ),
        const SizedBox(height: 14),

        _buildField(ctrl: _confirmCtrl, placeholder: l10n.confirmPassword, obscure: true),
        const SizedBox(height: 32),

        Consumer<AuthProvider>(builder: (_, a, _) => AppPrimaryButton(
          label: l10n.resetPassword,
          isLoading: a.status == AuthStatus.loading,
          onPressed: _onSubmit,
        )),
        const SizedBox(height: 24),

        // Back to login
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
      ]),
    );
  }
}
