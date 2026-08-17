import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/crm_provider.dart';
import '../../data/models/customer_detail_model.dart';

/// AI CRM：客户详情（订单 / 跟进 / 任务 / 风险 + 风险分析）
class CustomerDetailPage extends StatefulWidget {
  final int customerId;
  const CustomerDetailPage({super.key, required this.customerId});

  @override
  State<CustomerDetailPage> createState() => _CustomerDetailPageState();
}

class _CustomerDetailPageState extends State<CustomerDetailPage> {
  RiskAnalysisModel? _analysis;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<CrmProvider>().loadDetail(widget.customerId);
    });
  }

  Future<void> _analyze() async {
    final api = context.read<ApiClient>();
    try {
      final json = await api.get('/crm/customers/${widget.customerId}/analyze');
      final response = ApiResponse.fromJson(
        json,
        (data) => RiskAnalysisModel.fromJson(data as Map<String, dynamic>),
      );
      if (mounted) {
        setState(() => _analysis = response.data);
        AppToast.success(context, context.l10n.crmAnalysisDone);
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString());
    }
  }

  void _prompt(String title, String hint, Future<bool> Function(String) onSubmit) {
    final l10n = context.l10n;
    final ctrl = TextEditingController();
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(title),
        content: CupertinoTextField(controller: ctrl, placeholder: hint, autofocus: true),
        actions: [
          CupertinoDialogAction(child: Text(l10n.cancel), onPressed: () => Navigator.pop(ctx)),
          CupertinoDialogAction(
            isDefaultAction: true,
            child: Text(l10n.save),
            onPressed: () async {
              final value = ctrl.text.trim();
              Navigator.pop(ctx);
              if (value.isEmpty) return;
              final ok = await onSubmit(value);
              if (ok) AppToast.success(context, l10n.crmCreated);
            },
          ),
        ],
      ),
    );
  }

  void _addOrder() => _prompt(context.l10n.crmAddOrder, context.l10n.crmOrderAmountHint, (v) async {
        final amount = double.tryParse(v);
        if (amount == null) return false;
        return context.read<CrmProvider>().addOrder(widget.customerId, {'amount': amount});
      });

  void _addActivity() => _prompt(context.l10n.crmAddActivity, context.l10n.crmActivitySummaryHint, (v) async {
        return context.read<CrmProvider>().addActivity(widget.customerId, {'summary': v});
      });

  void _addTask() => _prompt(context.l10n.crmAddTask, context.l10n.crmTaskTitleHint, (v) async {
        return context.read<CrmProvider>().addTask(customerId: widget.customerId, title: v);
      });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<CrmProvider>();
    final detail = provider.detail;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(previousPageTitle: l10n.back),
        middle: Text(detail?.customer.name ?? l10n.crmTitle),
      ),
      child: provider.loading && detail == null
          ? const Center(child: CupertinoActivityIndicator())
          : detail == null
              ? Center(child: Text(provider.error ?? l10n.crmEmpty))
              : _buildDetail(context, l10n, detail),
    );
  }

  Widget _buildDetail(BuildContext context, AppLocalizations l10n, CustomerDetailModel detail) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 客户信息 + 风险分析
        _infoCard(context, l10n, detail),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.crmOrders, () => _addOrder()),
        ...detail.orders.map((o) => _row(
              '${o.status} · ¥${o.amount.toStringAsFixed(0)}',
              o.dueDate ?? '',
            )),
        if (detail.orders.isEmpty) _empty(context, l10n.crmNoOrders),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.crmActivities, () => _addActivity()),
        ...detail.activities.map((a) => _row(a.summary, a.type)),
        if (detail.activities.isEmpty) _empty(context, l10n.crmNoActivities),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.crmTasks, () => _addTask()),
        ...detail.tasks.map((t) => _taskRow(context, l10n, t)),
        if (detail.tasks.isEmpty) _empty(context, l10n.crmNoTasks),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.crmRisks, () {}),
        ...detail.risks.map((r) => _row('${l10n.crmRiskLabel(r.level)} · ${r.reason}', r.detectedAt ?? '')),
        if (detail.risks.isEmpty) _empty(context, l10n.crmNoRisks),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _infoCard(BuildContext context, AppLocalizations l10n, CustomerDetailModel detail) {
    final c = detail.customer;
    final analysis = _analysis;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${c.name}  ${c.company ?? ''}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            '${l10n.crmStatusLabel(c.status)} · ${l10n.crmRiskLabel(c.riskLevel)}',
            style: const TextStyle(fontSize: 14, color: CupertinoColors.systemGrey),
          ),
          if (c.email?.isNotEmpty == true) ...[
            const SizedBox(height: 4),
            Text(c.email!, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
          ],
          if (c.notes?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(c.notes!, style: const TextStyle(fontSize: 13)),
          ],
          const SizedBox(height: 12),
          CupertinoButton.filled(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(l10n.crmAnalyzeRisk),
            onPressed: _analyze,
          ),
          if (analysis != null) ...[
            const SizedBox(height: 10),
            Text(
              '${l10n.crmRiskLevel}: ${l10n.crmRiskLabel(analysis.level)}',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _riskColor(analysis.level)),
            ),
            for (final r in analysis.reasons)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('• $r', style: const TextStyle(fontSize: 13)),
              ),
          ],
        ],
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String title, VoidCallback onAdd) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        CupertinoButton(
          padding: EdgeInsets.zero,
          child: const Icon(CupertinoIcons.add, size: 18),
          onPressed: onAdd,
        ),
      ],
    );
  }

  Widget _row(String title, String subtitle) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 14))),
            if (subtitle.isNotEmpty)
              Text(subtitle, style: const TextStyle(fontSize: 12, color: CupertinoColors.systemGrey)),
          ],
        ),
      );

  Widget _taskRow(BuildContext context, AppLocalizations l10n, task) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: Text(
                task.title,
                style: TextStyle(
                  fontSize: 14,
                  decoration: task.status == 'completed' ? TextDecoration.lineThrough : null,
                  color: task.status == 'completed' ? CupertinoColors.systemGrey : null,
                ),
              ),
            ),
            if (task.status != 'completed')
              CupertinoButton(
                padding: EdgeInsets.zero,
                child: const Icon(CupertinoIcons.checkmark_circle, size: 20),
                onPressed: () => context.read<CrmProvider>().completeTask(task.id),
              ),
          ],
        ),
      );

  Widget _empty(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(text, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
      );

  Color _riskColor(String level) {
    switch (level) {
      case 'critical':
        return CupertinoColors.systemRed;
      case 'high':
        return CupertinoColors.systemOrange;
      case 'medium':
        return CupertinoColors.systemYellow;
      default:
        return CupertinoColors.systemGreen;
    }
  }
}
