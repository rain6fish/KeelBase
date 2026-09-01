// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';

class LoadingWidget extends StatelessWidget {
  final String? message;

  const LoadingWidget({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CupertinoActivityIndicator(radius: 16),
          if (message case final msg?) ...[
            const SizedBox(height: 16),
            Text(
              msg,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15,
                color: theme.textTheme.textStyle.color
                    ?.withValues(alpha: 180 / 255),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
