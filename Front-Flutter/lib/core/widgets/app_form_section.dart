// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';

/// A clean form section without the iOS grouped gray background.
///
/// Drop-in replacement for [CupertinoFormSection] that renders field rows
/// with clean dividers on a transparent background.
class AppFormSection extends StatelessWidget {
  final Widget? header;
  final Widget? footer;
  final List<Widget> children;

  const AppFormSection({
    super.key,
    this.header,
    this.footer,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final headerWidget = header;
    final footerWidget = footer;

    return Semantics(
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          if (headerWidget != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 6),
              child: DefaultTextStyle.merge(
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: CupertinoColors.systemGrey.resolveFrom(context),
                  letterSpacing: 0.5,
                ),
                child: headerWidget,
              ),
            ),
          ],

          // Cells
          if (children.isNotEmpty)
            Column(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(children.length, (i) {
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (i > 0)
                      Container(
                        height: 0.5,
                        width: double.infinity,
                        margin: const EdgeInsetsDirectional.only(start: 20),
                        color: CupertinoColors.separator
                            .resolveFrom(context)
                            .withValues(alpha: 60 / 255),
                      ),
                    children[i],
                  ],
                );
              }),
            ),

          // Footer
          if (footerWidget != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
              child: DefaultTextStyle.merge(
                style: TextStyle(
                  fontSize: 12,
                  color: CupertinoColors.systemGrey.resolveFrom(context),
                ),
                child: footerWidget,
              ),
            ),
        ],
      ),
    );
  }
}
