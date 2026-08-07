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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Header
        if (header != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 6),
            child: DefaultTextStyle(
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: CupertinoColors.systemGrey.resolveFrom(context),
                letterSpacing: 0.5,
              ),
              child: header!,
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
                      margin: const EdgeInsets.only(left: 20),
                      color: CupertinoColors.separator.resolveFrom(context).withAlpha(60),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 0),
                    child: children[i],
                  ),
                ],
              );
            }),
          ),

        // Footer
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
            child: DefaultTextStyle(
              style: TextStyle(
                fontSize: 12,
                color: CupertinoColors.systemGrey.resolveFrom(context),
              ),
              child: footer!,
            ),
          ),
      ],
    );
  }
}
