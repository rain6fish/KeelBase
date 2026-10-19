// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/inventory_movements_provider.dart';

/// 库存出入库页
class InventoryMovementsPage extends StatefulWidget {
  const InventoryMovementsPage({super.key});

  @override
  State<InventoryMovementsPage> createState() => _InventoryMovementsPageState();
}

class _InventoryMovementsPageState extends State<InventoryMovementsPage> {
  final _documentNoCtrl = TextEditingController();
  final _skuCtrl = TextEditingController();
  final _itemNameCtrl = TextEditingController();
  String _directionVal = 'in';
  final _quantityCtrl = TextEditingController();
  final _unitCtrl = TextEditingController();
  final _partnerCtrl = TextEditingController();
  final _occurredAtCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();



  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<InventoryMovementsProvider>().load();
    });
  }

  @override
  void dispose() {
    _documentNoCtrl.dispose();
    _skuCtrl.dispose();
    _itemNameCtrl.dispose();
    _quantityCtrl.dispose();
    _unitCtrl.dispose();
    _partnerCtrl.dispose();
    _occurredAtCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAdd() async {
    final l10n = context.l10n;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: CupertinoActionSheet(
          title: Text(l10n.inventory_movementsAddTitle),
          message: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldDocumentNo,
            controller: _documentNoCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldSku,
            controller: _skuCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldItemName,
            controller: _itemNameCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoSegmentedControl<String>(
            groupValue: _directionVal,
            onValueChanged: (v) => setState(() => _directionVal = v),
            children: {
              for (final o in ["in","out"]) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(o),
              ),
            },
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldQuantity,
            controller: _quantityCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: false),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldUnit,
            controller: _unitCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldPartner,
            controller: _partnerCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: '${l10n.inventory_movementsFieldOccurredAt} (ISO 8601)',
            controller: _occurredAtCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.inventory_movementsFieldNote,
            controller: _noteCtrl,
            maxLines: 3,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
            ],
          ),
          actions: [
            CupertinoActionSheetAction(
              isDefaultAction: true,
              onPressed: () async {
                final data = <String, dynamic>{};
if (_documentNoCtrl.text.isNotEmpty) data['documentNo'] = _documentNoCtrl.text.trim();
if (_skuCtrl.text.isNotEmpty) data['sku'] = _skuCtrl.text.trim();
if (_itemNameCtrl.text.isNotEmpty) data['itemName'] = _itemNameCtrl.text.trim();
data['direction'] = _directionVal;
if (_quantityCtrl.text.isNotEmpty) data['quantity'] = int.tryParse(_quantityCtrl.text.trim());
if (_unitCtrl.text.isNotEmpty) data['unit'] = _unitCtrl.text.trim();
if (_partnerCtrl.text.isNotEmpty) data['partner'] = _partnerCtrl.text.trim();
if (_occurredAtCtrl.text.isNotEmpty) data['occurredAt'] = _occurredAtCtrl.text.trim();
if (_noteCtrl.text.isNotEmpty) data['note'] = _noteCtrl.text.trim();
                // 一个字段都没填就不提交 —— 否则会创建一条空记录。表单不该提交「什么都没说」。
                // Submitting an entirely empty form would create an empty row; don't.
                if (data.isEmpty) return;
                final provider = ctx.read<InventoryMovementsProvider>();
                final ok = await provider.add(data);
                if (!ctx.mounted) return;
                if (!ok) {
                  // 失败时**留着弹层**：用户的输入不作废，只把原因说清。
                  // On failure the sheet stays open — the input is not thrown away, only explained.
                  AppToast.error(ctx, provider.error ?? l10n.unknownError);
                  return;
                }
                Navigator.pop(ctx, true);
              },
              child: Text(l10n.save),
            ),
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx),
              child: Text(l10n.cancel),
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
        title: Text(l10n.inventory_movementsDeleteConfirm),
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
      final provider = context.read<InventoryMovementsProvider>();
      final ok = await provider.remove(id);
      // 删除失败要说出来：静默什么都不发生，用户只会再点一次。
      // A failed delete has to say so — silently doing nothing invites a second tap.
      if (!ok && mounted) {
        AppToast.error(context, provider.error ?? l10n.unknownError);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<InventoryMovementsProvider>();
    final items = provider.items;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.inventory_movementsTitle),
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
              ? Center(child: Text(l10n.inventory_movementsEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    margin: const EdgeInsets.only(left: 16),
                    color: CupertinoColors.systemGrey.withAlpha(30),
                  ),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    final title = item.documentNo.toString();
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
