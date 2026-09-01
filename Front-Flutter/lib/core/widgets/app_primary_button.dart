// SPDX-License-Identifier: Apache-2.0

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
    final isDisabled = disabled || isLoading || onPressed == null;
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
            ? theme.primaryColor.withValues(alpha: 30 / 255)
            : theme.primaryColor.withValues(alpha: 20 / 255),
        disabledColor: isDark
            ? CupertinoColors.systemGrey5.withValues(alpha: 30 / 255)
            : CupertinoColors.systemGrey5.withValues(alpha: 40 / 255),
        child: isLoading
            ? Semantics(
                label: label,
                child: const CupertinoActivityIndicator(
                  radius: 12,
                ),
              )
            : Center(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: isDisabled
                        ? CupertinoColors.secondaryLabel
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
