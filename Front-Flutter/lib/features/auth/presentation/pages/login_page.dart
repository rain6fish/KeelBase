// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';
import '../../data/services/oauth_providers.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _usernameFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _phoneFocus = FocusNode();
  final _codeFocus = FocusNode();
  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _agree = false;
  bool _appleAvailable = true;
  bool _weChatAvailable = false;
  bool _smsTab = false;
  bool _sendingCode = false;
  int _codeCooldown = 0;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final auth = context.read<AuthProvider>();
    await auth.fetchProviderConfig();
    final svc = auth.oauthService;
    if (mounted) {
      setState(() {
        _appleAvailable = true;
      });
    }
    // Non-blocking checks for native SDK availability
    auth.oauthService.isAppleSignInAvailable().then((v) {
      if (mounted) setState(() => _appleAvailable = v);
    }).catchError((_) {
      // 探测失败视为不可用，避免显示必失败的入口
      if (mounted) setState(() => _appleAvailable = false);
    });
    if (!kIsWeb) {
      svc.isWeChatInstalled().then((v) {
        if (mounted) setState(() => _weChatAvailable = v);
      }).catchError((_) {
        if (mounted) setState(() => _weChatAvailable = false);
      });
    }
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    _usernameFocus.dispose();
    _passwordFocus.dispose();
    _phoneFocus.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  /// Check agreement before any login action.
  bool _checkAgree() {
    if (!_agree) {
      AppToast.error(context, context.l10n.agreementRequired);
      return false;
    }
    return true;
  }

  Future<void> _onLogin() async {
    if (!_checkAgree()) return;
    final username = _usernameCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (username.isEmpty || password.isEmpty) return;

    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.login(username, password);

    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.loginSuccess);
    } else {
      if (auth.cooldownRemaining == 0) {
        AppToast.error(context, auth.error ?? l10n.unknownError);
      }
    }
  }

  Future<void> _onLoginPhone() async {
    if (!_checkAgree()) return;
    final phone = _phoneCtrl.text.trim();
    final code = _codeCtrl.text.trim();
    if (phone.isEmpty) {
      AppToast.error(context, context.l10n.phoneRequired);
      return;
    }
    if (!_isValidPhone(phone) || code.length != 6) {
      AppToast.error(context, context.l10n.phoneOrCodeInvalid);
      return;
    }
    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.loginPhone(phone, code);
    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.loginSuccess);
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  Future<void> _onSendCode() async {
    if (!_checkAgree()) return;
    final phone = _phoneCtrl.text.trim();
    if (phone.isEmpty) {
      AppToast.error(context, context.l10n.phoneRequired);
      return;
    }
    if (!_isValidPhone(phone)) {
      AppToast.error(context, context.l10n.phoneOrCodeInvalid);
      return;
    }
    // 防止请求在途时重复发送（重复短信 + 并发倒计时竞态）
    if (_sendingCode || _codeCooldown > 0) return;
    setState(() => _sendingCode = true);
    final auth = context.read<AuthProvider>();
    try {
      final ok = await auth.sendSmsCode(phone);
      if (!mounted) return;
      if (ok) {
        setState(() => _codeCooldown = 60);
        _startCodeCooldown();
        AppToast.success(context, context.l10n.smsCodeSent);
      } else {
        AppToast.error(context, auth.error ?? context.l10n.unknownError);
      }
    } finally {
      if (mounted) setState(() => _sendingCode = false);
    }
  }

  void _startCodeCooldown() {
    // 倒计时（简化：每 1s 递减，到 0 停）
    Future.doWhile(() async {
      if (!mounted) return false;
      await Future.delayed(const Duration(seconds: 1));
      if (mounted && _codeCooldown > 1) {
        setState(() => _codeCooldown -= 1);
        return true;
      }
      if (mounted) setState(() => _codeCooldown = 0);
      return false;
    });
  }

  static bool _isValidPhone(String phone) {
    final digits = phone.replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^\+?\d{6,15}$').hasMatch(digits);
  }

  Future<void> _onOAuthLogin(String provider) async {
    if (!_checkAgree()) return;
    final auth = context.read<AuthProvider>();
    auth.clearError();
    final l10n = context.l10n;
    final ok = await auth.oauthLogin(provider);

    if (!mounted) return;
    if (ok) {
      AppToast.success(context, l10n.loginSuccess);
    } else if (auth.error != null && !auth.error!.toLowerCase().contains('cancel')) {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  // ─── Widget builders ──────────────────────────────────────────────────

  Widget _buildSocialButton({
    required OAuthProviderMeta provider,
    required bool isLoading,
    bool? enabled,
  }) {
    final isEnabled = enabled ?? true;
    final t = CupertinoTheme.of(context);
    return SizedBox(
      width: 60,
      child: CupertinoButton(
        padding: EdgeInsets.zero,
        borderRadius: const BorderRadius.all(Radius.circular(30)),
        minSize: 0,
        onPressed: (isLoading || !isEnabled) ? null : () => _onOAuthLogin(provider.id),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: isEnabled
                    ? CupertinoColors.tertiarySystemBackground.resolveFrom(context)
                    : CupertinoColors.tertiarySystemBackground.resolveFrom(context).withAlpha(80),
                borderRadius: BorderRadius.circular(26),
                border: Border.all(
                  color: CupertinoColors.systemGrey.withAlpha(40),
                ),
              ),
              child: Center(
                child: Icon(
                  OAuthProviders.iconFor(provider.id),
                  size: 24,
                  color: isEnabled ? CupertinoColors.label : CupertinoColors.systemGrey,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              provider.name,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: isEnabled
                    ? CupertinoColors.systemGrey.resolveFrom(context)
                    : CupertinoColors.systemGrey.withAlpha(80),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildField({
    required TextEditingController ctrl,
    required FocusNode focusNode,
    required String placeholder,
    required IconData icon,
    required TextInputAction action,
    bool obscure = false,
    bool showToggle = false,
    VoidCallback? onToggle,
    VoidCallback? onSubmitted,
    TextInputType? keyboardType,
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
        focusNode: focusNode,
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
        keyboardType: keyboardType,
        onSubmitted: (_) => onSubmitted ?? (action == TextInputAction.next
            ? _passwordFocus.requestFocus()
            : _onLogin()),
      ),
    );
  }

  Widget _buildTab({
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    final t = CupertinoTheme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: active ? t.primaryColor : CupertinoColors.systemGrey.resolveFrom(context),
        ),
      ),
    );
  }

  Widget _buildOrDivider() {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: Container(height: 0.5,
              color: CupertinoColors.separator.resolveFrom(context).withAlpha(60))),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(l10n.or, style: TextStyle(
                fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context))),
          ),
          Expanded(child: Container(height: 0.5,
              color: CupertinoColors.separator.resolveFrom(context).withAlpha(60))),
        ],
      ),
    );
  }

  Widget _buildProviderSection({
    required String title,
    required List<OAuthProviderMeta> providers,
    required bool isLoading,
  }) {
    if (providers.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: CupertinoColors.systemGrey.resolveFrom(context),
            ),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: providers.map((p) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: _buildSocialButton(provider: p, isLoading: isLoading),
            );
          }).toList(),
        ),
      ],
    );
  }

  /// Agreement checkbox with tappable links to legal pages.
  Widget _buildAgreement() {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final grey = CupertinoColors.systemGrey.resolveFrom(context);

    TextStyle bodyStyle = TextStyle(fontSize: 13, color: grey);
    TextStyle linkStyle = TextStyle(fontSize: 13, color: t.primaryColor, fontWeight: FontWeight.w600);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 4,
        runSpacing: 4,
        children: [
          // Checkbox
          GestureDetector(
            onTap: () => setState(() => _agree = !_agree),
            child: Container(
              width: 22,
              height: 22,
              margin: const EdgeInsets.only(right: 10),
              decoration: BoxDecoration(
                color: _agree
                    ? t.primaryColor
                    : CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: _agree
                      ? t.primaryColor
                      : grey.withAlpha(120),
                  width: _agree ? 0 : 1.5,
                ),
              ),
              child: _agree
                  ? const Icon(CupertinoIcons.check_mark, size: 16, color: CupertinoColors.white)
                  : null,
            ),
          ),
          // Text
          Text.rich(
            TextSpan(
              style: bodyStyle,
              children: [
                TextSpan(text: l10n.agreeLabel),
                const TextSpan(text: ' '),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => context.push('/privacy'),
            child: Text(l10n.privacyPolicyLink, style: linkStyle),
          ),
          Text(' ${l10n.and} ', style: bodyStyle),
          GestureDetector(
            onTap: () => context.push('/terms'),
            child: Text(l10n.termsOfServiceLink, style: linkStyle),
          ),
        ],
      ),
    );
  }

  // ─── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final auth = context.watch<AuthProvider>();
    final isLoading = auth.status == AuthStatus.loading;
    final authError = auth.status == AuthStatus.error ? auth.error : null;
    final cooldown = auth.cooldownRemaining;
    final isCooldown = cooldown > 0;
    final cfg = auth.providerConfig;

    // Filter providers by platform availability
    List<OAuthProviderMeta> _available(List<OAuthProviderMeta> list) {
      return list.where((p) {
        if (p.id == 'apple' && !_appleAvailable) return false;
        if (p.id == 'wechat' && !_weChatAvailable) return false;
        // nativeOnly（微信/支付宝）仅在原生移动端展示，Web/桌面一律过滤
        if (p.nativeOnly && !OAuthProviders.isMobilePlatform) return false;
        return true;
      }).toList();
    }

    final international = _available(cfg.international);
    final china = _available(cfg.china);
    final showInternational = international.isNotEmpty;
    final showChina = china.isNotEmpty;
    final showOAuth = showInternational || showChina;

    return CupertinoPageScaffold(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            // Logo
            Container(
              width: 88, height: 88,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [t.primaryColor, t.primaryColor.withAlpha(180)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(CupertinoIcons.sparkles, size: 44, color: CupertinoColors.white),
            ),
            const SizedBox(height: 20),
            Text('KeelBase', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
            const SizedBox(height: 8),
            Text(
              l10n.loginSlogan,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.primaryColor),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.loginSloganSub,
              style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            // 演示账号提示（评估者 clone 后最需要的就是账号）。
            // 仅在 debug/dev 构建展示，避免生产环境暴露演示凭据。
            if (kDebugMode)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: t.primaryColor.withAlpha(10),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: t.primaryColor.withAlpha(30)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    l10n.demoAccounts,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.primaryColor),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.demoAccountUser,
                    style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.demoAccountAdmin,
                    style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context)),
                  ),
                ]),
              ),
            const SizedBox(height: 32),

            // Error
            if (authError != null && !isCooldown)
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

            // 登录方式切换（账号密码 / 手机号）
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _buildTab(label: l10n.passwordLogin, active: !_smsTab, onTap: () => setState(() => _smsTab = false)),
              const SizedBox(width: 24),
              _buildTab(label: l10n.phoneLogin, active: _smsTab, onTap: () => setState(() => _smsTab = true)),
            ]),
            const SizedBox(height: 24),

            if (!_smsTab) ...[
              // Username (Enter → focus password)
              _buildField(
                ctrl: _usernameCtrl, focusNode: _usernameFocus,
                placeholder: l10n.username, icon: CupertinoIcons.person_fill,
                action: TextInputAction.next,
                onSubmitted: () => _passwordFocus.requestFocus(),
              ),
              const SizedBox(height: 14),

              // Password (Enter → login)
              _buildField(
                ctrl: _passwordCtrl, focusNode: _passwordFocus,
                placeholder: l10n.password, icon: CupertinoIcons.lock_fill,
                action: TextInputAction.done, obscure: _obscurePassword,
                showToggle: true, onToggle: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
              const SizedBox(height: 32),

              // Login button
              if (isCooldown)
                SizedBox(
                  width: double.infinity, height: 54,
                  child: CupertinoButton(
                    onPressed: null,
                    disabledColor: CupertinoColors.systemGrey5.withAlpha(60),
                    borderRadius: const BorderRadius.all(Radius.circular(27)),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(CupertinoIcons.timer, size: 18, color: CupertinoColors.systemGrey),
                      const SizedBox(width: 8),
                      Text(l10n.retryIn(cooldown), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: CupertinoColors.systemGrey, height: 1.2)),
                    ]),
                  ),
                )
              else
                AppPrimaryButton(label: l10n.login, isLoading: isLoading, onPressed: _onLogin),
            ] else ...[
              // 手机号
              _buildField(
                ctrl: _phoneCtrl, focusNode: _phoneFocus,
                placeholder: l10n.phoneNumber, icon: CupertinoIcons.phone_fill,
                keyboardType: TextInputType.phone,
                action: TextInputAction.next,
                onSubmitted: () => _codeFocus.requestFocus(),
              ),
              const SizedBox(height: 14),

              // 验证码 + 发送按钮
              Row(children: [
                Expanded(
                  child: _buildField(
                    ctrl: _codeCtrl, focusNode: _codeFocus,
                    placeholder: l10n.verificationCode, icon: CupertinoIcons.number,
                    keyboardType: TextInputType.number,
                    action: TextInputAction.done,
                    onSubmitted: _onLoginPhone,
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  height: 46,
                  child: CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    color: _codeCooldown > 0 ? CupertinoColors.systemGrey : t.primaryColor,
                    borderRadius: const BorderRadius.all(Radius.circular(12)),
                    onPressed: (_codeCooldown > 0 || _sendingCode) ? null : _onSendCode,
                    child: Text(
                      _codeCooldown > 0 ? '${_codeCooldown}s' : l10n.sendCode,
                      style: const TextStyle(fontSize: 14, color: CupertinoColors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ]),
              const SizedBox(height: 32),

              AppPrimaryButton(label: l10n.login, isLoading: isLoading, onPressed: _onLoginPhone),
            ],

            // ── Agreement checkbox ──
            _buildAgreement(),

            // ── OAuth providers (China first) ──
            if (showOAuth) ...[
              _buildOrDivider(),

              // China (default)
              if (showChina)
                _buildProviderSection(
                  title: l10n.chinaLogin,
                  providers: china,
                  isLoading: isLoading,
                ),

              // International
              if (showInternational) ...[
                const SizedBox(height: 8),
                _buildProviderSection(
                  title: l10n.internationalLogin,
                  providers: international,
                  isLoading: isLoading,
                ),
              ],
            ],

            const SizedBox(height: 8),

            // Register link
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => context.push('/register'),
              child: Text.rich(TextSpan(
                text: l10n.noAccount,
                style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context), fontSize: 15),
                children: [TextSpan(
                  text: l10n.register,
                  style: TextStyle(color: t.primaryColor, fontWeight: FontWeight.w600, fontSize: 15),
                )],
              )),
            ),
            const SizedBox(height: 8),
            // Forgot password link
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => context.push('/forgot-password'),
              child: Text(
                l10n.forgotPassword,
                style: TextStyle(
                  color: CupertinoColors.systemGrey.resolveFrom(context),
                  fontSize: 14,
                ),
              ),
            ),
            const SizedBox(height: 16),
          ]),
        ),
      ),
    );
  }
}
