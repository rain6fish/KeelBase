// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import '../../../../core/i18n/app_localizations.dart';

/// 空状态下的建议问题列表
class SuggestedQuestions extends StatelessWidget {
  final void Function(String text) onTap;

  const SuggestedQuestions({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final questions = [
      l10n.aiSuggested1,
      l10n.aiSuggested2,
      l10n.aiSuggested3,
    ];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          CupertinoIcons.sparkles,
          size: 48,
          color: CupertinoTheme.of(context).primaryColor.withValues(alpha: 0.47),
        ),
        const SizedBox(height: 12),
        Text(
          l10n.aiWelcomeTitle,
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: CupertinoTheme.of(context).textTheme.textStyle.color,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          l10n.aiInputHint,
          style: TextStyle(
            fontSize: 13,
            color: CupertinoColors.systemGrey.resolveFrom(context),
          ),
        ),
        const SizedBox(height: 24),
        ...questions.map(
          (q) => Padding(
            key: ValueKey('suggested-$q'),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 4),
            child: CupertinoButton.filled(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              onPressed: () => onTap(q),
              child: Text(
                q,
                style: const TextStyle(fontSize: 14),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
