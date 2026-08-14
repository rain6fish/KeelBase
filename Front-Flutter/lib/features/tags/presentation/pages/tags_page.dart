import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/tags_provider.dart';

/// 标签页
class TagsPage extends StatefulWidget {
  const TagsPage({super.key});

  @override
  State<TagsPage> createState() => _TagsPageState();
}

class _TagsPageState extends State<TagsPage> {
  final _nameCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<TagsProvider>().load();
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAdd() async {
    final l10n = context.l10n;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: CupertinoActionSheet(
          title: Text(l10n.tagsAddTitle),
          message: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
          CupertinoTextField(
            placeholder: 'name',
            controller: _nameCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
            ],
          ),
          actions: [
            CupertinoActionSheetAction(
              isDefaultAction: true,
              onPressed: () async {
                final data = <String, dynamic>{};
if (_nameCtrl.text.isNotEmpty) data['name'] = _nameCtrl.text.trim();
                final ok = await ctx.read<TagsProvider>().add(data);
                if (ctx.mounted) Navigator.pop(ctx, ok);
              },
              child: const Text('保存'),
            ),
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('取消'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onDelete(int id) async {
    final l10n = context.l10n;
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.tagsDeleteConfirm),
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
      await context.read<TagsProvider>().remove(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<TagsProvider>();
    final items = provider.items;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.tagsTitle),
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          minimumSize: const Size(36, 36),
          onPressed: _onAdd,
          child: Icon(
            CupertinoIcons.add,
            size: 24,
            color: CupertinoTheme.of(context).primaryColor,
          ),
        ),
      ),
      child: provider.loading && items.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : items.isEmpty
              ? Center(child: Text(l10n.tagsEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    margin: const EdgeInsets.only(left: 16),
                    color: CupertinoColors.systemGrey.withAlpha(30),
                  ),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    final title = item.name.toString();
                    return CupertinoListTile(
                      title: Text(title),
                      trailing: CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(32, 32),
                        onPressed: () => _onDelete(item.id),
                        child: const Icon(
                          CupertinoIcons.trash,
                          size: 18,
                          color: CupertinoColors.destructiveRed,
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
