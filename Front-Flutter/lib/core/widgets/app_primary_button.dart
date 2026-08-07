import 'package:flutter/cupertino.dart';

/// iOS-style capsule primary button.
///
/// Matches the iOS Settings / Mail-style prominent action button:
/// - 54pt tall, fully pill-shaped (borderRadius = 27)
/// - Light blue background, blue text (dark mode adapts automatically)
/// - Semibold 17pt SF-style typography
class AppPrimaryButton extends StatelessWidget {
  final String label;
  final bool disabled;
  final bool isLoading;
  final VoidCallback? onPressed;

  const AppPrimaryButton({
    super.key,
    required this.label,
    this.disabled = false,
    this.isLoading = false,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isDisabled = disabled || isLoading;
    final theme = CupertinoTheme.of(context);
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;

    return SizedBox(
      width: double.infinity,
      height: 54,
      child: CupertinoButton(
        onPressed: isDisabled ? null : onPressed,
        pressedOpacity: isDisabled ? 1.0 : 0.7,
        borderRadius: const BorderRadius.all(Radius.circular(27)),
        color: isDark
            ? theme.primaryColor.withAlpha(30)
            : theme.primaryColor.withAlpha(20),
        disabledColor: isDark
            ? CupertinoColors.systemGrey5.withAlpha(30)
            : CupertinoColors.systemGrey5.withAlpha(40),
        child: isLoading
            ? const CupertinoActivityIndicator(
                radius: 12,
              )
            : Center(
                child: Text(
                  label,
                  maxLines: 1,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: isDisabled
                        ? theme.primaryColor.withAlpha(isDark ? 80 : 60)
                        : theme.primaryColor,
                    letterSpacing: -0.43,
                    // NotoSansSC 字体行高较大，固定高度按钮需压缩垂直度量避免文字被裁剪
                    height: 1.0,
                  ),
                ),
              ),
      ),
    );
  }
}
