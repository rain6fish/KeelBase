// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/pm_provider.dart';

/// AI Project Management：项目列表
class ProjectsPage extends StatefulWidget {
  const ProjectsPage({super.key});

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<PmProvider>().loadProjects();
    });
  }

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

  void _showCreateSheet() {
    final l10n = context.l10n;
    final ctrl = TextEditingController();
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(l10n.pmAddProject),
        actions: [
          CupertinoActionSheetAction(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: CupertinoTextField(controller: ctrl, placeholder: l10n.pmProjectName),
            ),
            onPressed: () {},
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () async {
            final name = ctrl.text.trim();
            Navigator.pop(ctx);
            if (name.isEmpty) {
              AppToast.error(context, l10n.pmNameRequired);
              return;
            }
            final ok = await context.read<PmProvider>().createProject({'name': name});
            if (ok) AppToast.success(context, l10n.crmCreated);
          },
          child: Text(l10n.save),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<PmProvider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.pmTitle),
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          child: const Icon(CupertinoIcons.add),
          onPressed: _showCreateSheet,
        ),
      ),
      child: provider.loading && provider.projects.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : provider.projects.isEmpty
              ? Center(child: Text(l10n.pmEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: provider.projects.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    color: CupertinoColors.separator.resolveFrom(context).withValues(alpha: 0.5),
                  ),
                  itemBuilder: (ctx, i) {
                    final p = provider.projects[i];
                    return CupertinoListTile(
                      title: Text(p.name),
                      subtitle: Text(l10n.pmStatusLabel(p.status)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: _riskColor(p.riskLevel).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              l10n.crmRiskLabel(p.riskLevel),
                              style: TextStyle(fontSize: 12, color: _riskColor(p.riskLevel), fontWeight: FontWeight.w600),
                            ),
                          ),
                          const CupertinoListTileChevron(),
                        ],
                      ),
                      onTap: () => ctx.push('/pm/projects/${p.id}'),
                    );
                  },
                ),
    );
  }
}
