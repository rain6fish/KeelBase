// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';

class AppEmptyView extends StatelessWidget {
  final IconData? icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const AppEmptyView({
    super.key,
    this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  }) : assert(onAction == null || actionLabel != null,
            'onAction 提供时必须同时提供 actionLabel');

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);
    final textColor = theme.textTheme.textStyle.color;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ?? CupertinoIcons.tray,
              size: 56,
              color: (textColor ?? CupertinoColors.secondaryLabel)
                  .withValues(alpha: 100 / 255),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: (textColor ?? CupertinoColors.secondaryLabel)
                    .withValues(alpha: 180 / 255),
              ),
            ),
            if (onAction != null) ...[
              const SizedBox(height: 24),
              CupertinoButton(
                onPressed: onAction,
                color: theme.primaryColor,
                child: Text(actionLabel ?? ''),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
