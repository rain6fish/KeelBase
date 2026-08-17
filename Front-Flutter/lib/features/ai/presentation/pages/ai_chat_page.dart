import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/ai_chat_provider.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/chat_confirmation_card.dart';
import '../widgets/chat_tool_step_card.dart';
import '../widgets/typing_indicator.dart';
import '../widgets/suggested_questions.dart';

/// AI 对话主页面
class AiChatPage extends StatefulWidget {
  const AiChatPage({super.key});

  @override
  State<AiChatPage> createState() => _AiChatPageState();
}

class _AiChatPageState extends State<AiChatPage> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      // 检查是否有来自首页输入框的待发送消息
      final provider = context.read<AiChatProvider>();
      final pending = provider.consumePendingMessage();
      if (pending != null && pending.isNotEmpty) {
        // 延迟一帧让页面完成渲染后再发送
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _sendMessage(pending);
        });
      }
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// AI navigateTo 白名单（与后端 navigate-page.tool.ts PAGE_ROUTES 对齐）。
  /// 仅允许已注册的合法目的地，防止 AI 返回的任意字符串导致导航错误/越权跳转。
  static const Set<String> _aiAllowedRoutes = {
    '/', '/events', '/explore', '/ai', '/profile', '/settings', '/todos',
    '/flows/tasks', '/tags', '/notes', '/books', '/posts', '/my-org',
    '/points', '/upload', '/privacy', '/terms', '/crm', '/pm',
  };

  void _sendMessage(String text) {
    if (text.trim().isEmpty) return;
    final provider = context.read<AiChatProvider>();
    if (provider.isLoading || provider.isStreaming) return; // 防止流式请求进行中重复发送
    _textController.clear();
    provider.sendMessage(text).then((_) {
      if (!mounted) return;
      _scrollToBottom();
      _handleNavigation();
    }).catchError((Object e) {
      // Provider 内部已处理大多数错误，这里兜底避免未捕获异常
      debugPrint('sendMessage failed: $e');
    });
    _scrollToBottom();
  }

  /// AI 请求页面跳转时执行导航（用 push 保留返回栈）
  void _handleNavigation() {
    if (!mounted) return;
    final provider = context.read<AiChatProvider>();
    final route = provider.consumeNavigateTo();
    if (route != null && _aiAllowedRoutes.contains(route)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          context.push(route);
        }
      });
    }
  }

  /// 模型选择弹层（仿 settings 页语言选择器）
  void _showModelPicker(AiChatProvider provider) {
    final l10n = context.l10n;
    const options = [
      ('deepseek', 'DeepSeek'),
      ('qwen', '通义千问'),
    ];
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(l10n.aiModelPickerTitle),
        actions: [
          for (final (value, label) in options)
            CupertinoActionSheetAction(
              isDefaultAction: provider.provider == value,
              onPressed: () {
                Navigator.pop(ctx);
                provider.switchModel(value);
              },
              child: Text(label),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDestructiveAction: false,
          onPressed: () => Navigator.pop(ctx),
          child: Text(
            l10n.cancel,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17),
          ),
        ),
      ),
    );
  }

  /// 由 build 方法中的 listener 触发：流式输出时持续滚动到底部。
  /// 仅在用户已接近底部时自动滚动，避免与用户上翻阅读产生对抗。
  void _maybeScrollToBottom(bool isStreaming) {
    if (!isStreaming) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final pos = _scrollController.position;
      final nearBottom = pos.maxScrollExtent - pos.pixels < 120;
      if (nearBottom) {
        _scrollController.animateTo(
          pos.maxScrollExtent,
          duration: const Duration(milliseconds: 50),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final aiProvider = context.watch<AiChatProvider>();
    final messages = aiProvider.messages;
    final isLoading = aiProvider.isLoading;
    final isStreaming = aiProvider.isStreaming;
    // 流式输出时持续自动滚动
    _maybeScrollToBottom(isStreaming);
    // 流式时已有一条占位消息在列表里，不需要额外 TypingIndicator
    final showTyping = isLoading && !isStreaming && messages.isEmpty;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.aiTitle),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            GestureDetector(
              onTap: () => _showModelPicker(aiProvider),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    aiProvider.providerLabel,
                    style: TextStyle(
                      color: CupertinoTheme.of(context).primaryColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Icon(
                    CupertinoIcons.chevron_down,
                    size: 12,
                    color: CupertinoColors.systemGrey,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: () {
                showCupertinoModalPopup(
                  context: context,
                  builder: (ctx) => CupertinoActionSheet(
                    actions: [
                      CupertinoActionSheetAction(
                        onPressed: () {
                          Navigator.pop(ctx);
                          context.push('/ai/history');
                        },
                        child: Text(l10n.aiHistory),
                      ),
                      CupertinoActionSheetAction(
                        onPressed: () {
                          Navigator.pop(ctx);
                          aiProvider.clearConversation();
                        },
                        child: Text(l10n.aiClearConversation),
                      ),
                    ],
                    cancelButton: CupertinoActionSheetAction(
                      isDestructiveAction: false,
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(l10n.cancel,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                );
              },
              child: Icon(
                CupertinoIcons.ellipsis_circle,
                color: CupertinoTheme.of(context).primaryColor,
              ),
            ),
          ],
        ),
      ),
      child: Column(
        children: [
          // 消息列表
          Expanded(
            child: messages.isEmpty && !isLoading
                ? Center(
                    child: SingleChildScrollView(
                      child: SuggestedQuestions(
                        onTap: _sendMessage,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.only(top: 8, bottom: 8),
                    itemCount: messages.length + (showTyping ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i == messages.length && showTyping) {
                        return const TypingIndicator();
                      }
                      final msg = messages[i];
                      if (msg.pendingConfirmation != null) {
                        return ChatConfirmationCard(
                          confirmation: msg.pendingConfirmation!,
                        );
                      }
                      if (msg.toolStep != null) {
                        return ChatToolStepCard(step: msg.toolStep!);
                      }
                      return ChatBubble(message: msg);
                    },
                  ),
          ),

          // 底部输入区
          Container(
            decoration: BoxDecoration(
              color: CupertinoTheme.of(context).scaffoldBackgroundColor,
              border: Border(
                top: BorderSide(
                  color: CupertinoTheme.of(context)
                      .textTheme
                      .textStyle
                      .color!
                      .withValues(alpha: 0.08),
                  width: 0.5,
                ),
              ),
            ),
            padding: EdgeInsets.only(
              left: 12,
              right: 12,
              top: 8,
              bottom: MediaQuery.of(context).padding.bottom + 8,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // UX-11 示例 chips：真实触发句，点击填入输入框（agent 能力发现）
                _buildExampleChips(l10n),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: CupertinoTextField(
                        controller: _textController,
                        placeholder: l10n.aiInputHint,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: CupertinoTheme.of(context).scaffoldBackgroundColor,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: CupertinoColors.systemGrey4.resolveFrom(context),
                          ),
                        ),
                        onSubmitted: isLoading ? null : _sendMessage,
                      ),
                    ),
                    const SizedBox(width: 8),
                    CupertinoButton(
                      padding: EdgeInsets.zero,
                      minSize: 36,
                      onPressed:
                          isLoading ? null : () => _sendMessage(_textController.text),
                      child: Icon(
                        CupertinoIcons.arrow_up_circle_fill,
                        size: 32,
                        color: isLoading
                            ? CupertinoColors.systemGrey
                            : CupertinoTheme.of(context).primaryColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// UX-11 AI 示例 chips：一排可点击的真实触发句，点击填入输入框并发送
  Widget _buildExampleChips(AppLocalizations l10n) {
    final examples = [
      l10n.aiExampleWeekPlan,
      l10n.aiExampleCreateMeeting,
      l10n.aiExampleTrend,
    ];
    final theme = CupertinoTheme.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          Text(
            l10n.aiExampleChipsTitle,
            style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context)),
          ),
          const SizedBox(width: 8),
          ...examples.map((q) => Padding(
            key: ValueKey('example-$q'),
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => _sendMessage(q),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.primaryColor.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: theme.primaryColor.withValues(alpha: 0.16)),
                ),
                child: Text(
                  q,
                  style: TextStyle(fontSize: 13, color: theme.primaryColor),
                ),
              ),
            ),
          )),
        ],
      ),
    );
  }
}
