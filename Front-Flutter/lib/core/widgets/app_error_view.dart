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
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              CupertinoIcons.exclamationmark_triangle,
              size: 56,
              color: theme.textTheme.textStyle.color?.withAlpha(120),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: theme.textTheme.textStyle.color?.withAlpha(200),
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
    );
  }
}
