// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import '../providers/ai_chat_provider.dart';

/// 单个消息气泡
class ChatBubble extends StatelessWidget {
  final ChatMessageModel message;

  const ChatBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) const SizedBox(width: 4),
          Flexible(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 320),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isUser
                    ? CupertinoTheme.of(context).primaryColor
                    : (isDark
                        ? CupertinoColors.systemGrey5.resolveFrom(context).withValues(alpha: 0.6)
                        : CupertinoColors.systemGrey6.resolveFrom(context)),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(isUser ? 18 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 18),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      message.content,
                      style: TextStyle(
                        fontSize: 15,
                        color: isUser
                            ? CupertinoColors.white
                            : CupertinoTheme.of(context).textTheme.textStyle.color,
                      ),
                    ),
                  ),
                  if (message.isStreaming)
                    const _BlinkingCursor(),
                ],
              ),
            ),
          ),
          if (isUser) const SizedBox(width: 4),
        ],
      ),
    );
  }
}

/// AI 回复流式输出时的闪烁光标
class _BlinkingCursor extends StatefulWidget {
  const _BlinkingCursor();

  @override
  State<_BlinkingCursor> createState() => _BlinkingCursorState();
}

class _BlinkingCursorState extends State<_BlinkingCursor>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    return FadeTransition(
      opacity: _controller,
      child: Padding(
        padding: const EdgeInsets.only(left: 2),
        child: Text(
          '|',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w300,
            color: isDark ? CupertinoColors.white : CupertinoColors.black,
          ),
        ),
      ),
    );
  }
}
