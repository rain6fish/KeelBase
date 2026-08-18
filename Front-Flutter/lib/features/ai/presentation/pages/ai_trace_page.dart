import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../data/models/ai_trace_models.dart';
import '../providers/conversation_provider.dart';

/// P0-14 Agent Decision Trace：单条对话的用户可见执行轨迹。
/// 从对话历史列表进入，展示工具调用 / 确认决策 / 创建记录 / 结果。
class AiTracePage extends StatefulWidget {
  final String id;

  const AiTracePage({super.key, required this.id});

  @override
  State<AiTracePage> createState() => _AiTracePageState();
}

class _AiTracePageState extends State<AiTracePage> {
  @override
  void initState() {
    super.initState();
    // 延迟加载，避免 build 期间 notify
    Future.microtask(() {
      if (mounted) context.read<ConversationProvider>().loadTrace(widget.id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<ConversationProvider>();
    final steps = provider.trace?.steps ?? const <AiTraceStep>[];

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        middle: Text(l10n.aiTrace),
      ),
      child: provider.traceLoading
          ? const Center(child: CupertinoActivityIndicator())
          : provider.traceError != null
              ? AppErrorView(
                  message: provider.traceError!,
                  onRetry: () => provider.loadTrace(widget.id),
                )
              : steps.isEmpty
                  ? Center(
                      child: Text(
                        l10n.aiTraceEmpty,
                        style: const TextStyle(color: CupertinoColors.systemGrey),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      itemCount: steps.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) => _StepCard(
                        step: steps[index],
                        l10n: l10n,
                        onRevoke: (effectId) => _handleRevoke(provider, effectId),
                        revoking: provider.revokingEffectId,
                      ),
                    ),
    );
  }

  /// P0-15 本人撤销 AI 创建的记录；结果以 toast 反馈。
  Future<void> _handleRevoke(ConversationProvider provider, int effectId) async {
    final ok = await provider.revokeEffect(effectId);
    if (!mounted) return;
    if (ok) {
      AppToast.show(context, context.l10n.traceRevoked);
    } else {
      AppToast.error(context, context.l10n.traceRevokeFailed);
    }
  }
}

class _StepCard extends StatelessWidget {
  final AiTraceStep step;
  final AppLocalizations l10n;
  final void Function(int effectId) onRevoke;
  final int? revoking;

  const _StepCard({
    required this.step,
    required this.l10n,
    required this.onRevoke,
    required this.revoking,
  });

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = _visual();
    final time = step.time.isEmpty ? '' : _timeLabel();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 17, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGroupedBackground,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        time,
                        style: const TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ..._body(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  (IconData, Color, String) _visual() {
    switch (step.type) {
      case 'input':
        return (CupertinoIcons.person, CupertinoColors.activeBlue, l10n.traceStepInput);
      case 'assistant':
        return (CupertinoIcons.sparkles, CupertinoColors.systemIndigo, l10n.traceStepAssistant);
      case 'tool_call':
        return (
          CupertinoIcons.wrench,
          step.success == false ? CupertinoColors.systemRed : CupertinoColors.systemBlue,
          l10n.traceStepToolCall,
        );
      case 'confirmation':
        return (
          CupertinoIcons.checkmark_circle,
          step.outcome == 'approve' ? CupertinoColors.systemGreen : CupertinoColors.systemOrange,
          l10n.traceStepConfirmation,
        );
      case 'effect':
        return (CupertinoIcons.doc_text, CupertinoColors.systemGreen, l10n.traceStepEffect);
      default:
        return (CupertinoIcons.chat_bubble, CupertinoColors.systemGrey, l10n.traceStepNotice);
    }
  }

  String _timeLabel() {
    final d = DateTime.tryParse(step.time)?.toLocal();
    if (d == null) return step.time;
    return '${d.month}/${d.day} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  List<Widget> _body() {
    const caption = TextStyle(fontSize: 13, color: CupertinoColors.systemGrey);
    const body = TextStyle(fontSize: 14);
    const bodyMuted = TextStyle(fontSize: 13, color: CupertinoColors.systemGrey);
    const errorStyle = TextStyle(fontSize: 13, color: CupertinoColors.systemRed);
    final list = <Widget>[];

    switch (step.type) {
      case 'input':
      case 'assistant':
        if (step.content != null && step.content!.trim().isNotEmpty) {
          list.add(Text(step.content!, style: body));
        }
        break;
      case 'tool_call':
        if (step.toolName != null) {
          list.add(Text.rich(TextSpan(children: [
            TextSpan(text: step.toolName!, style: body),
            if (step.args != null && step.args!.isNotEmpty)
              TextSpan(text: ' (${step.args})', style: caption),
          ])));
        }
        list.add(const SizedBox(height: 4));
        list.add(Text(
          step.success == false ? l10n.traceFailed : l10n.traceSuccess,
          style: step.success == false ? errorStyle : bodyMuted,
        ));
        if (step.errorMessage != null && step.errorMessage!.isNotEmpty) {
          list.add(const SizedBox(height: 2));
          list.add(Text(step.errorMessage!, style: errorStyle));
        }
        break;
      case 'confirmation':
        if (step.toolName != null) {
          list.add(Text(step.toolName!, style: body));
        }
        list.add(const SizedBox(height: 4));
        final outcomeText = switch (step.outcome) {
          'approve' => l10n.traceApproved,
          'decline' => l10n.traceDeclined,
          _ => l10n.traceTimedOut,
        };
        list.add(Text(
          step.trusted == true ? '$outcomeText · ${l10n.traceTrusted}' : outcomeText,
          style: bodyMuted,
        ));
        break;
      case 'effect':
        final effect = step.effect;
        if (effect != null) {
          list.add(Text(
            '${step.toolName ?? ''} → ${effect.resultType} #${effect.resultId}',
            style: body,
          ));
          if (effect.targetTitle != null && effect.targetTitle!.isNotEmpty) {
            list.add(const SizedBox(height: 2));
            list.add(Text(effect.targetTitle!, style: bodyMuted));
          }
          if (effect.revocable) {
            list.add(const SizedBox(height: 6));
            list.add(
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: revoking == effect.effectId ? null : () => onRevoke(effect.effectId),
                child: revoking == effect.effectId
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CupertinoActivityIndicator(),
                      )
                    : Text(
                        l10n.traceRevoke,
                        style: const TextStyle(fontSize: 13, color: CupertinoColors.systemOrange),
                      ),
              ),
            );
          }
        }
        break;
      default:
        if (step.detail != null && step.detail!.isNotEmpty) {
          list.add(Text(step.detail!, style: bodyMuted));
        }
        if (step.errorMessage != null && step.errorMessage!.isNotEmpty) {
          list.add(Text(step.errorMessage!, style: errorStyle));
        }
    }

    if (list.isEmpty) {
      list.add(Text('—', style: bodyMuted));
    }
    return list;
  }
}
