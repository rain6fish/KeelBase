// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/todos_provider.dart';

/// 待办清单页
class TodosPage extends StatefulWidget {
  const TodosPage({super.key});

  @override
  State<TodosPage> createState() => _TodosPageState();
}

class _TodosPageState extends State<TodosPage> {
  final _inputCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<TodosProvider>().load();
    });
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAdd() async {
    final title = _inputCtrl.text.trim();
    if (title.isEmpty) return;
    final ok = await context.read<TodosProvider>().add(title);
    if (ok && mounted) {
      _inputCtrl.clear();
    }
  }

  Future<void> _onToggle(int id, bool completed) async {
    await context.read<TodosProvider>().toggle(id);
  }

  Future<void> _onDelete(int id) async {
    final l10n = context.l10n;
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.deleteTodoConfirm),
        actions: [
          CupertinoDialogAction(child: Text(l10n.cancel), onPressed: () => Navigator.pop(ctx, false)),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: Text(l10n.delete),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await context.read<TodosProvider>().remove(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<TodosProvider>();
    final todos = provider.todos;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(middle: Text(l10n.tabTodos)),
      child: Column(
        children: [
          // 新增输入
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            decoration: BoxDecoration(
              color: CupertinoColors.secondarySystemBackground.resolveFrom(context),
              border: Border(
                bottom: BorderSide(color: CupertinoColors.systemGrey.withAlpha(30), width: 0.5),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: CupertinoTextField(
                    controller: _inputCtrl,
                    placeholder: l10n.todoInputHint,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: CupertinoColors.systemBackground.resolveFrom(context),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
                    ),
                    onSubmitted: (_) => _onAdd(),
                  ),
                ),
                const SizedBox(width: 8),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(36, 36),
                  onPressed: _onAdd,
                  child: Icon(
                    CupertinoIcons.add_circled_solid,
                    size: 32,
                    color: CupertinoTheme.of(context).primaryColor,
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: provider.loading && todos.isEmpty
                ? const Center(child: CupertinoActivityIndicator())
                : todos.isEmpty
                    ? Center(child: Text(l10n.todoEmpty, style: const TextStyle(fontSize: 16)))
                    : ListView.separated(
                        itemCount: todos.length,
                        separatorBuilder: (_, _) => Container(
                          height: 1,
                          margin: const EdgeInsets.only(left: 52),
                          color: CupertinoColors.systemGrey.withAlpha(30),
                        ),
                        itemBuilder: (_, i) {
                          final t = todos[i];
                          return CupertinoListTile(
                            leading: CupertinoButton(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(36, 36),
                              onPressed: () => _onToggle(t.id, t.completed),
                              child: Icon(
                                t.completed
                                    ? CupertinoIcons.checkmark_circle_fill
                                    : CupertinoIcons.circle,
                                size: 24,
                                color: t.completed
                                    ? CupertinoColors.systemGreen
                                    : CupertinoColors.systemGrey,
                              ),
                            ),
                            title: Text(
                              t.title,
                              style: TextStyle(
                                decoration: t.completed ? TextDecoration.lineThrough : null,
                                color: t.completed ? CupertinoColors.systemGrey : null,
                              ),
                            ),
                            trailing: CupertinoButton(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(32, 32),
                              onPressed: () => _onDelete(t.id),
                              child: const Icon(
                                CupertinoIcons.trash,
                                size: 18,
                                color: CupertinoColors.destructiveRed,
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
