import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/pm_provider.dart';
import '../../data/models/project_model.dart';

/// AI Project Management：项目详情（里程碑 / 任务 / 风险 + 风险分析）
class ProjectDetailPage extends StatefulWidget {
  final int projectId;
  const ProjectDetailPage({super.key, required this.projectId});

  @override
  State<ProjectDetailPage> createState() => _ProjectDetailPageState();
}

class _ProjectDetailPageState extends State<ProjectDetailPage> {
  ProjectRiskAnalysis? _analysis;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<PmProvider>().loadDetail(widget.projectId);
    });
  }

  Future<void> _analyze() async {
    final api = context.read<ApiClient>();
    try {
      final json = await api.get('/pm/projects/${widget.projectId}/analyze');
      final response = ApiResponse.fromJson(
        json,
        (data) => ProjectRiskAnalysis.fromJson(data as Map<String, dynamic>),
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

  void _addMilestone() => _prompt(context.l10n.pmAddMilestone, context.l10n.pmMilestoneTitleHint, (v) async {
        return context.read<PmProvider>().addMilestone(widget.projectId, {'title': v});
      });

  void _addTask() => _prompt(context.l10n.pmAddTask, context.l10n.pmTaskTitleHint, (v) async {
        return context.read<PmProvider>().addTask(widget.projectId, v);
      });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<PmProvider>();
    final detail = provider.detail;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(previousPageTitle: l10n.back),
        middle: Text(detail?.project.name ?? l10n.pmTitle),
      ),
      child: provider.loading && detail == null
          ? const Center(child: CupertinoActivityIndicator())
          : detail == null
              ? Center(child: Text(provider.error ?? l10n.pmEmpty))
              : _buildDetail(context, l10n, detail),
    );
  }

  Widget _buildDetail(BuildContext context, AppLocalizations l10n, ProjectDetailModel detail) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _infoCard(context, l10n, detail),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.pmMilestones, () => _addMilestone()),
        ...detail.milestones.map((m) => _row(m.title, '${m.status}${m.dueDate != null ? ' · ${m.dueDate}' : ''}')),
        if (detail.milestones.isEmpty) _empty(context, l10n.pmNoMilestones),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.pmTasks, () => _addTask()),
        ...detail.tasks.map((t) => _taskRow(context, l10n, t)),
        if (detail.tasks.isEmpty) _empty(context, l10n.pmNoTasks),
        const SizedBox(height: 12),
        _sectionTitle(context, l10n.pmRisks, () {}),
        ...detail.risks.map((r) => _row('${l10n.crmRiskLabel(r.level)} · ${r.reason}', '')),
        if (detail.risks.isEmpty) _empty(context, l10n.pmNoRisks),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _infoCard(BuildContext context, AppLocalizations l10n, ProjectDetailModel detail) {
    final p = detail.project;
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
          Text(p.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            '${l10n.pmStatusLabel(p.status)} · ${l10n.crmRiskLabel(p.riskLevel)} · ${detail.memberCount} ${l10n.pmMembers}',
            style: const TextStyle(fontSize: 14, color: CupertinoColors.systemGrey),
          ),
          if (p.description?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(p.description!, style: const TextStyle(fontSize: 13)),
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

  Widget _taskRow(BuildContext context, AppLocalizations l10n, ProjectTaskModel task) => Padding(
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
                onPressed: () => context.read<PmProvider>().completeTask(task.id),
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
