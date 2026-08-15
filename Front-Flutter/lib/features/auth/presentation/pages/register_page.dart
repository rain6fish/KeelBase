import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _emailCtrl = TextEditingController();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _onRegister() async {
    final email = _emailCtrl.text.trim();
    final firstName = _firstNameCtrl.text.trim();
    final lastName = _lastNameCtrl.text.trim();
    final username = _usernameCtrl.text.trim();
    final password = _passwordCtrl.text;

    final auth = context.read<AuthProvider>();
    final l10n = context.l10n;
    // 请求在途时忽略重复提交（键盘 Done + 按钮双入口）
    if (auth.status == AuthStatus.loading) return;

    if (username.isEmpty) {
      AppToast.error(context, l10n.usernameRequired);
      return;
    }
    if (email.isEmpty) {
      AppToast.error(context, l10n.emailRequired);
      return;
    }
    if (password.isEmpty) {
      AppToast.error(context, l10n.passwordRequired);
      return;
    }

    auth.clearError();
    // 姓名为空时回退到 username，避免向后端提交空 nickname
    final nickname = '$firstName $lastName'.trim();
    final ok = await auth.register(
      username: username,
      email: email,
      password: password,
      nickname: nickname.isEmpty ? username : nickname,
      firstName: firstName.isNotEmpty ? firstName : null,
      lastName: lastName.isNotEmpty ? lastName : null,
    );

    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.registerSuccess);
      // 注册后跳验证码页验证邮箱
      context.push('/verify-email?email=${Uri.encodeQueryComponent(email)}');
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  Widget _buildField({
    required TextEditingController ctrl,
    required String placeholder,
    required IconData icon,
    required TextInputAction action,
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
          child: Icon(icon, size: 22, color: CupertinoColors.systemGrey.resolveFrom(context)),
        ),
        suffix: showToggle
            ? CupertinoButton(
                padding: const EdgeInsets.only(right: 6),
                minSize: 32,
                child: Icon(
                  obscure ? CupertinoIcons.eye : CupertinoIcons.eye_slash,
                  size: 20, color: CupertinoColors.systemGrey,
                ),
                onPressed: onToggle,
              )
            : null,
        textInputAction: action,
        onSubmitted: (_) => action == TextInputAction.next
            ? FocusScope.of(context).nextFocus()
            : _onRegister(),
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
        middle: Text(l10n.register),
        previousPageTitle: l10n.back,
      ),
      child: ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 20),

        // Title
        Text(l10n.register, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
        const SizedBox(height: 6),
        Text(l10n.registerSubtitle, style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context))),
        const SizedBox(height: 32),

        // Error
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
        _buildField(ctrl: _emailCtrl, placeholder: l10n.emailHint, icon: CupertinoIcons.mail, action: TextInputAction.next),
        const SizedBox(height: 14),

        // First Name
        _buildField(ctrl: _firstNameCtrl, placeholder: l10n.firstNameHint, icon: CupertinoIcons.person_fill, action: TextInputAction.next),
        const SizedBox(height: 14),

        // Last Name
        _buildField(ctrl: _lastNameCtrl, placeholder: l10n.lastNameHint, icon: CupertinoIcons.person_fill, action: TextInputAction.next),
        const SizedBox(height: 14),

        // Username
        _buildField(ctrl: _usernameCtrl, placeholder: l10n.username, icon: CupertinoIcons.at, action: TextInputAction.next),
        const SizedBox(height: 14),

        // Password
        _buildField(
          ctrl: _passwordCtrl, placeholder: l10n.password, icon: CupertinoIcons.lock_fill,
          action: TextInputAction.done, obscure: _obscurePassword,
          showToggle: true, onToggle: () => setState(() => _obscurePassword = !_obscurePassword),
        ),
        const SizedBox(height: 32),

        // Button
        Consumer<AuthProvider>(builder: (_, a, _) => AppPrimaryButton(
          label: l10n.register,
          isLoading: a.status == AuthStatus.loading,
          onPressed: _onRegister,
        )),
        const SizedBox(height: 24),

        // Login link
        Center(
          child: CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: () => context.pop(),
            child: Text.rich(TextSpan(
              text: l10n.hasAccount,
              style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context), fontSize: 15),
              children: [TextSpan(
                text: l10n.login,
                style: TextStyle(color: t.primaryColor, fontWeight: FontWeight.w600, fontSize: 15),
              )],
            )),
          ),
        ),
      ]),
    );
  }
}
