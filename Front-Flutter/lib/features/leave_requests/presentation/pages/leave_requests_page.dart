// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/leave_requests_provider.dart';

/// 请假申请页
class LeaveRequestsPage extends StatefulWidget {
  const LeaveRequestsPage({super.key});

  @override
  State<LeaveRequestsPage> createState() => _LeaveRequestsPageState();
}

class _LeaveRequestsPageState extends State<LeaveRequestsPage> {
  final _requestNoCtrl = TextEditingController();
  String _leaveTypeVal = 'annual';
  final _startDateCtrl = TextEditingController();
  final _endDateCtrl = TextEditingController();
  final _daysCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  String _statusVal = 'pending';



  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<LeaveRequestsProvider>().load();
    });
  }

  @override
  void dispose() {
    _requestNoCtrl.dispose();
    _startDateCtrl.dispose();
    _endDateCtrl.dispose();
    _daysCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAdd() async {
    final l10n = context.l10n;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: CupertinoActionSheet(
          title: Text(l10n.leave_requestsAddTitle),
          message: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
          CupertinoTextField(
            placeholder: l10n.leave_requestsFieldRequestNo,
            controller: _requestNoCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoSegmentedControl<String>(
            groupValue: _leaveTypeVal,
            onValueChanged: (v) => setState(() => _leaveTypeVal = v),
            children: {
              for (final o in ["annual","sick","personal","other"]) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(o),
              ),
            },
          ),

          CupertinoTextField(
            placeholder: '${l10n.leave_requestsFieldStartDate} (ISO 8601)',
            controller: _startDateCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: '${l10n.leave_requestsFieldEndDate} (ISO 8601)',
            controller: _endDateCtrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.leave_requestsFieldDays,
            controller: _daysCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: false),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoTextField(
            placeholder: l10n.leave_requestsFieldReason,
            controller: _reasonCtrl,
            maxLines: 3,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),

          CupertinoSegmentedControl<String>(
            groupValue: _statusVal,
            onValueChanged: (v) => setState(() => _statusVal = v),
            children: {
              for (final o in ["pending","approved","rejected"]) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(o),
              ),
            },
          ),
            ],
          ),
          actions: [
            CupertinoActionSheetAction(
              isDefaultAction: true,
              onPressed: () async {
                final data = <String, dynamic>{};
if (_requestNoCtrl.text.isNotEmpty) data['requestNo'] = _requestNoCtrl.text.trim();
data['leaveType'] = _leaveTypeVal;
if (_startDateCtrl.text.isNotEmpty) data['startDate'] = _startDateCtrl.text.trim();
if (_endDateCtrl.text.isNotEmpty) data['endDate'] = _endDateCtrl.text.trim();
if (_daysCtrl.text.isNotEmpty) data['days'] = int.tryParse(_daysCtrl.text.trim());
if (_reasonCtrl.text.isNotEmpty) data['reason'] = _reasonCtrl.text.trim();
data['status'] = _statusVal;
                // 一个字段都没填就不提交 —— 否则会创建一条空记录。表单不该提交「什么都没说」。
                // Submitting an entirely empty form would create an empty row; don't.
                if (data.isEmpty) return;
                final provider = ctx.read<LeaveRequestsProvider>();
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
        title: Text(l10n.leave_requestsDeleteConfirm),
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
      final provider = context.read<LeaveRequestsProvider>();
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
    final provider = context.watch<LeaveRequestsProvider>();
    final items = provider.items;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.leave_requestsTitle),
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
              ? Center(child: Text(l10n.leave_requestsEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    margin: const EdgeInsets.only(left: 16),
                    color: CupertinoColors.systemGrey.withAlpha(30),
                  ),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    final title = item.requestNo.toString();
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
