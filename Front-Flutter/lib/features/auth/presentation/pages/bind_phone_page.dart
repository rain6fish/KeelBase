import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/auth_provider.dart';

/// 绑定/更新手机号（发送验证码 → 校验绑定）
class BindPhonePage extends StatefulWidget {
  const BindPhonePage({super.key});

  @override
  State<BindPhonePage> createState() => _BindPhonePageState();
}

class _BindPhonePageState extends State<BindPhonePage> {
  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  bool _sendingCode = false;
  int _codeCooldown = 0;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  static bool _isValidPhone(String phone) {
    final digits = phone.replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^\+?\d{6,15}$').hasMatch(digits);
  }

  Future<void> _sendCode() async {
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

  Future<void> _bind() async {
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
    if (_submitting) return;
    setState(() => _submitting = true);
    final auth = context.read<AuthProvider>();
    try {
      final ok = await auth.bindPhone(phone, code);
      if (!mounted) return;
      if (ok) {
        AppToast.success(context, context.l10n.phoneBound);
        if (context.canPop()) context.pop();
      } else {
        AppToast.error(context, auth.error ?? context.l10n.unknownError);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);

    Widget field(TextEditingController ctrl, String placeholder, IconData icon, {bool obscure = false, bool number = false}) {
      return Container(
        decoration: BoxDecoration(
          color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
        ),
        child: CupertinoTextField(
          controller: ctrl,
          placeholder: placeholder,
          obscureText: obscure,
          keyboardType: number ? TextInputType.number : TextInputType.phone,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          clearButtonMode: OverlayVisibilityMode.editing,
          prefix: Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Icon(icon, size: 20, color: CupertinoColors.systemGrey.resolveFrom(context)),
          ),
        ),
      );
    }

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.bindPhone),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.phoneNumber, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
              const SizedBox(height: 8),
              field(_phoneCtrl, l10n.phoneHint, CupertinoIcons.phone_fill),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l10n.verificationCode, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
                      const SizedBox(height: 8),
                      field(_codeCtrl, l10n.verificationCode, CupertinoIcons.number, number: true),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  height: 46,
                  child: CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    color: _codeCooldown > 0 ? CupertinoColors.systemGrey : t.primaryColor,
                    borderRadius: const BorderRadius.all(Radius.circular(12)),
                    onPressed: (_codeCooldown > 0 || _sendingCode) ? null : _sendCode,
                    child: Text(
                      _codeCooldown > 0 ? '${_codeCooldown}s' : l10n.sendCode,
                      style: const TextStyle(fontSize: 14, color: CupertinoColors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ]),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                child: CupertinoButton.filled(
                  borderRadius: const BorderRadius.all(Radius.circular(27)),
                  onPressed: _submitting ? null : _bind,
                  child: Text(_submitting ? l10n.loading : l10n.bindPhone),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
