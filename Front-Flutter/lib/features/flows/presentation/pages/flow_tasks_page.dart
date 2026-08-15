import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Divider;
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../data/models/flow_task_model.dart';
import '../providers/flows_provider.dart';

/// 审批待办页（FLOW-7）：我的待办列表 + 通过/驳回。
class FlowTasksPage extends StatefulWidget {
  const FlowTasksPage({super.key});

  @override
  State<FlowTasksPage> createState() => _FlowTasksPageState();
}

class _FlowTasksPageState extends State<FlowTasksPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<FlowsProvider>().load();
    });
  }

  Future<void> _onDecide(FlowTaskModel task, String decision) async {
    final l10n = context.l10n;
    final noteCtrl = TextEditingController();
    final ok = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(decision == 'approve' ? l10n.flowApprove : l10n.flowReject),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            CupertinoTextField(
              controller: noteCtrl,
              placeholder: l10n.flowNote,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          ],
        ),
        actions: [
          CupertinoDialogAction(
            child: Text(l10n.cancel),
            onPressed: () => Navigator.pop(ctx, false),
          ),
          CupertinoDialogAction(
            isDestructiveAction: decision == 'reject',
            child: Text(decision == 'approve' ? l10n.flowApprove : l10n.flowReject),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      final success = await context
          .read<FlowsProvider>()
          .approve(task.id, decision, note: noteCtrl.text);
      if (!success && mounted) AppToast.error(context, l10n.flowOpFailed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<FlowsProvider>();
    final tasks = provider.tasks;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.flowTasksTitle),
      ),
      child: provider.loading && tasks.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : tasks.isEmpty
              ? Center(
                  child: Text(
                    l10n.flowTasksEmpty,
                    style: const TextStyle(fontSize: 16, color: CupertinoColors.systemGrey),
                  ),
                )
              : ListView.separated(
                  itemCount: tasks.length,
                  separatorBuilder: (_, _) =>
                      const Divider(height: 1, indent: 16, endIndent: 16),
                  itemBuilder: (_, i) {
                    final t = tasks[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.title ?? l10n.flowTaskTitle,
                                  style: const TextStyle(fontSize: 16),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${t.flowName ?? ''}${t.createdAt != null ? ' · ${t.createdAt}' : ''}',
                                  style: const TextStyle(fontSize: 12, color: CupertinoColors.systemGrey),
                                ),
                              ],
                            ),
                          ),
                          CupertinoButton(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            child: Text(
                              l10n.flowReject,
                              style: const TextStyle(color: CupertinoColors.destructiveRed),
                            ),
                            onPressed: () => _onDecide(t, 'reject'),
                          ),
                          CupertinoButton(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            child: Text(
                              l10n.flowApprove,
                              style: TextStyle(color: CupertinoTheme.of(context).primaryColor),
                            ),
                            onPressed: () => _onDecide(t, 'approve'),
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
