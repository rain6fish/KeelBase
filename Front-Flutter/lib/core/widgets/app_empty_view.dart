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
  });

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ?? CupertinoIcons.tray,
              size: 56,
              color: theme.textTheme.textStyle.color?.withAlpha(100),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: theme.textTheme.textStyle.color?.withAlpha(180),
              ),
            ),
            if (onAction != null) ...[
              const SizedBox(height: 24),
              CupertinoButton(
                onPressed: onAction,
                color: theme.primaryColor,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
