import 'package:flutter/cupertino.dart';

/// A clean list section without iOS grouped-table gray background.
///
/// Renders a header label, a list of cells separated by thin dividers,
/// and an optional footer — all on a transparent background that lets
/// the page's scaffold color show through uniformly.
class AppListSection extends StatelessWidget {
  final Widget? header;
  final Widget? footer;
  final List<Widget> children;

  const AppListSection({
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
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 0),
            decoration: BoxDecoration(
              color: CupertinoColors.systemBackground.resolveFrom(context),
              borderRadius: BorderRadius.circular(0),
            ),
            child: Column(
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
                    children[i],
                  ],
                );
              }),
            ),
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
