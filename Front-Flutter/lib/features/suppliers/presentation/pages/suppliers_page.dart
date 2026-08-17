import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/suppliers_provider.dart';

/// 供应商页
class SuppliersPage extends StatefulWidget {
  const SuppliersPage({super.key});

  @override
  State<SuppliersPage> createState() => _SuppliersPageState();
}

class _SuppliersPageState extends State<SuppliersPage> {
  final _nameCtrl = TextEditingController();
  final _contactCtrl = TextEditingController();
  String _statusVal = 'active';
  String _riskLevelVal = 'low';
  final _annualSpendCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<SuppliersProvider>().load();
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _contactCtrl.dispose();
    _annualSpendCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAdd() async {
    final l10n = context.l10n;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: CupertinoActionSheet(
          title: Text(l10n.suppliersAddTitle),
          message: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
          CupertinoTextField(
            placeholder: 'name',
            controller: _nameCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: 'contact',
            controller: _contactCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoSegmentedControl<String>(
            groupValue: _statusVal,
            onValueChanged: (v) => setState(() => _statusVal = v),
            children: {
              for (final o in ["active","inactive","blacklist"]) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(o),
              ),
            },
          ),

          CupertinoSegmentedControl<String>(
            groupValue: _riskLevelVal,
            onValueChanged: (v) => setState(() => _riskLevelVal = v),
            children: {
              for (final o in ["low","medium","high"]) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(o),
              ),
            },
          ),

          CupertinoTextField(
            placeholder: 'annualSpend',
            controller: _annualSpendCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: false),
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
if (_contactCtrl.text.isNotEmpty) data['contact'] = _contactCtrl.text.trim();
data['status'] = _statusVal;
data['riskLevel'] = _riskLevelVal;
if (_annualSpendCtrl.text.isNotEmpty) data['annualSpend'] = int.tryParse(_annualSpendCtrl.text.trim());
                final ok = await ctx.read<SuppliersProvider>().add(data);
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
        title: Text(l10n.suppliersDeleteConfirm),
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
      await context.read<SuppliersProvider>().remove(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<SuppliersProvider>();
    final items = provider.items;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.suppliersTitle),
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
              ? Center(child: Text(l10n.suppliersEmpty, style: const TextStyle(fontSize: 16)))
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
