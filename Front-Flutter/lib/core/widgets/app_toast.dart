// SPDX-License-Identifier: Apache-2.0

import 'dart:async';

import 'package:flutter/cupertino.dart';

/// iOS-style toast displayed as an overlay with spring animation.
class AppToast {
  AppToast._();

  static void show(BuildContext context, String message) {
    _showOverlay(context, message, CupertinoColors.activeBlue);
  }

  static void success(BuildContext context, String message) {
    _showOverlay(context, message, CupertinoColors.activeGreen);
  }

  static void error(BuildContext context, String message) {
    _showOverlay(context, message, CupertinoColors.destructiveRed);
  }

  static void _showOverlay(BuildContext context, String message, Color bgColor) {
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) return; // context 已失活或无 Overlay 祖先时不崩溃
    late OverlayEntry entry;

    entry = OverlayEntry(
      builder: (_) => _ToastWidget(
        message: message,
        color: bgColor,
        onDismiss: () {
          if (entry.mounted) entry.remove();
        },
      ),
    );

    overlay.insert(entry);
  }
}

class _ToastWidget extends StatefulWidget {
  final String message;
  final Color color;
  final VoidCallback onDismiss;

  const _ToastWidget({
    required this.message,
    required this.color,
    required this.onDismiss,
  });

  @override
  State<_ToastWidget> createState() => _ToastWidgetState();
}

class _ToastWidgetState extends State<_ToastWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _animation;
  Timer? _timer;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );

    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );

    _controller.forward();

    _timer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      _controller.reverse().then((_) {
        if (mounted) widget.onDismiss();
      }).catchError((Object _) {
        // 控制器在反向动画期间被 dispose 时 TickerFuture 以
        // TickerCanceled 完成，这里吞掉以避免未处理的异步错误。
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Positioned(
          bottom: 80 + bottom + (1 - _animation.value) * 16,
          left: 20,
          right: 20,
          // 完全透明（淡入开始 / 淡出期间）时也不拦截底部点击
          child: IgnorePointer(
            child: Opacity(
              opacity: _animation.value,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: widget.color,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: widget.color.withValues(alpha: 120 / 255),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Text(
                  widget.message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: CupertinoColors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
