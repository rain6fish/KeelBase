// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import '../i18n/app_localizations.dart';

class AppErrorView extends StatelessWidget {
  final String message;
  final String? actionLabel;
  final VoidCallback? onRetry;

  const AppErrorView({
    super.key,
    required this.message,
    this.actionLabel,
    this.onRetry,
  }) : assert(actionLabel == null || onRetry != null,
            'actionLabel 提供时必须同时提供 onRetry');

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);
    final textColor = theme.textTheme.textStyle.color;

    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                CupertinoIcons.exclamationmark_triangle,
                size: 56,
                color: (textColor ?? CupertinoColors.secondaryLabel)
                    .withValues(alpha: 120 / 255),
              ),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  color: (textColor ?? CupertinoColors.secondaryLabel)
                      .withValues(alpha: 200 / 255),
                ),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: 24),
                CupertinoButton(
                  onPressed: onRetry,
                  color: theme.primaryColor,
                  child: Text(actionLabel ?? l10n.retry),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
