// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/approval_provider.dart';

/// AI Approval：审批请求列表
class ApprovalRequestsPage extends StatefulWidget {
  const ApprovalRequestsPage({super.key});

  @override
  State<ApprovalRequestsPage> createState() => _ApprovalRequestsPageState();
}

class _ApprovalRequestsPageState extends State<ApprovalRequestsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) {
        context.read<ApprovalProvider>().loadRequests();
        context.read<ApprovalProvider>().loadPolicies();
      }
    });
  }

  void _showCreateSheet() {
    final l10n = context.l10n;
    final titleCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    var type = 'reimbursement';
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => CupertinoActionSheet(
          title: Text(l10n.apSubmitRequest),
          actions: [
            CupertinoActionSheetAction(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: CupertinoTextField(controller: titleCtrl, placeholder: l10n.apTitleHint),
                  ),
                  CupertinoTextField(controller: amountCtrl, placeholder: l10n.apAmountHint, keyboardType: TextInputType.number),
                  CupertinoTextField(controller: reasonCtrl, placeholder: l10n.apReasonHint),
                  const SizedBox(height: 6),
                  CupertinoSegmentedControl<String>(
                    groupValue: type,
                    onValueChanged: (v) => setState(() => type = v),
                    children: const {
                      'reimbursement': Text('报销'),
                      'purchase': Text('采购'),
                      'leave': Text('请假'),
                    },
                  ),
                ],
              ),
              onPressed: () {},
            ),
          ],
          cancelButton: CupertinoActionSheetAction(
            isDefaultAction: true,
            onPressed: () async {
              final title = titleCtrl.text.trim();
              final amount = double.tryParse(amountCtrl.text.trim());
              final reason = reasonCtrl.text.trim();
              Navigator.pop(ctx);
              if (title.isEmpty || reason.isEmpty || amount == null) {
                AppToast.error(context, l10n.apRequired);
                return;
              }
              final ok = await context.read<ApprovalProvider>().createRequest({
                'title': title,
                'type': type,
                'amount': amount,
                'reason': reason,
              });
              if (ok) AppToast.success(context, l10n.crmCreated);
            },
            child: Text(l10n.save),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<ApprovalProvider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.apTitle),
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          child: const Icon(CupertinoIcons.add),
          onPressed: _showCreateSheet,
        ),
      ),
      child: provider.loading && provider.requests.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : provider.requests.isEmpty
              ? Center(child: Text(l10n.apEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: provider.requests.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    color: CupertinoColors.separator.resolveFrom(context).withValues(alpha: 0.5),
                  ),
                  itemBuilder: (ctx, i) {
                    final r = provider.requests[i];
                    return CupertinoListTile(
                      title: Text(r.title),
                      subtitle: Text('${l10n.apStatusLabel(r.status)} · ¥${r.amount.toStringAsFixed(0)}'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: _riskColor(r.riskLevel).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              l10n.crmRiskLabel(r.riskLevel),
                              style: TextStyle(fontSize: 12, color: _riskColor(r.riskLevel), fontWeight: FontWeight.w600),
                            ),
                          ),
                          const CupertinoListTileChevron(),
                        ],
                      ),
                      onTap: () => ctx.push('/approval/requests/${r.id}'),
                    );
                  },
                ),
    );
  }

  Color _riskColor(String level) {
    switch (level) {
      case 'high':
        return CupertinoColors.systemOrange;
      case 'medium':
        return CupertinoColors.systemYellow;
      default:
        return CupertinoColors.systemGreen;
    }
  }
}
