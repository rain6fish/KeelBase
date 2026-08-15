import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/loading_widget.dart';
import '../../../../core/widgets/app_empty_view.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../data/models/org_models.dart';
import '../providers/org_provider.dart';

/// ORG-7：我的组织 / 通讯录（只读）——查看本人所属组织、部门树与脱敏成员。
class MyOrgPage extends StatefulWidget {
  const MyOrgPage({super.key});

  @override
  State<MyOrgPage> createState() => _MyOrgPageState();
}

class _MyOrgPageState extends State<MyOrgPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<OrgProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<OrgProvider>();
    final myOrg = provider.myOrg;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.myOrgTitle),
      ),
      child: provider.loading && myOrg == null
          ? const LoadingWidget()
          : provider.error != null && myOrg == null
              ? provider.notInOrg
                  ? AppEmptyView(
                      icon: CupertinoIcons.person_crop_circle_badge_exclam,
                      message: l10n.notInOrg,
                    )
                  : AppErrorView(
                      message: provider.error!,
                      actionLabel: l10n.retry,
                      onRetry: () => context.read<OrgProvider>().load(),
                    )
              : myOrg == null
                  ? const SizedBox.shrink()
                  : _OrgContent(provider: provider, myOrg: myOrg),
    );
  }
}

class _OrgContent extends StatelessWidget {
  final OrgProvider provider;
  final MyOrgInfo myOrg;

  const _OrgContent({required this.provider, required this.myOrg});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 组织信息卡
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: CupertinoTheme.of(context).primaryColor.withAlpha(16),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(CupertinoIcons.building_2_fill, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      myOrg.name,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                    ),
                  ),
                  _RoleChip(role: myOrg.role, l10n: l10n),
                ],
              ),
              if (myOrg.deptPath.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(CupertinoIcons.square_list, size: 16),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        myOrg.deptPath.join(' / '),
                        style: TextStyle(fontSize: 14, color: CupertinoTheme.of(context).primaryColor),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),

        // 部门树（缩进层级展示）
        Text(l10n.myOrgDept, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        if (provider.tree.isEmpty)
          _hint(l10n.noDept)
        else
          ...provider.tree.map((n) => _DeptNodeTile(node: n, depth: 0)),
        const SizedBox(height: 20),

        // 成员
        Text(
          '${l10n.myOrgMembers}（${provider.members.length}）',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        if (provider.members.isEmpty)
          _hint(l10n.noMember)
        else
          ...provider.members.map((m) => _MemberTile(member: m, l10n: l10n)),
      ],
    );
  }

  Widget _hint(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(text, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
    );
  }
}

/// 部门树节点：按层级缩进，展示名称与成员数。
class _DeptNodeTile extends StatelessWidget {
  final OrgDeptNode node;
  final int depth;

  const _DeptNodeTile({required this.node, required this.depth});

  @override
  Widget build(BuildContext context) {
    final children = node.children.map((c) => _DeptNodeTile(node: c, depth: depth + 1)).toList();
    return Column(
      children: [
        Padding(
          padding: EdgeInsets.only(left: 12.0 * depth, top: 6, bottom: 6),
          child: Row(
            children: [
              Icon(
                node.children.isEmpty ? CupertinoIcons.folder : CupertinoIcons.folder_fill,
                size: 16,
                color: node.children.isEmpty
                    ? CupertinoColors.systemGrey
                    : CupertinoTheme.of(context).primaryColor,
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(node.name, style: const TextStyle(fontSize: 14))),
              Text(
                '${node.memberCount}',
                style: const TextStyle(fontSize: 12, color: CupertinoColors.systemGrey),
              ),
            ],
          ),
        ),
        ...children,
      ],
    );
  }
}

class _MemberTile extends StatelessWidget {
  final MyOrgMember member;
  final AppLocalizations l10n;

  const _MemberTile({required this.member, required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          // 头像（无图时显示昵称首字）
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: CupertinoTheme.of(context).primaryColor.withAlpha(32),
            ),
            clipBehavior: Clip.antiAlias,
            child: (member.avatarUrl?.isNotEmpty ?? false)
                ? Image.network(member.avatarUrl!, fit: BoxFit.cover)
                : Text(
                    (member.nickname?.isNotEmpty ?? false) ? member.nickname!.substring(0, 1) : '?',
                    style: TextStyle(color: CupertinoTheme.of(context).primaryColor, fontSize: 14),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(member.nickname ?? '-', style: const TextStyle(fontSize: 14)),
                if (member.deptName != null)
                  Text(
                    member.deptName!,
                    style: const TextStyle(fontSize: 12, color: CupertinoColors.systemGrey),
                  ),
              ],
            ),
          ),
          _RoleChip(role: member.role, l10n: l10n),
        ],
      ),
    );
  }
}

class _RoleChip extends StatelessWidget {
  final String role;
  final AppLocalizations l10n;

  const _RoleChip({required this.role, required this.l10n});

  @override
  Widget build(BuildContext context) {
    final label = switch (role) {
      'owner' => l10n.roleOwner,
      'admin' => l10n.roleAdmin,
      _ => l10n.roleMember,
    };
    final color = switch (role) {
      'owner' => CupertinoColors.systemOrange,
      'admin' => CupertinoTheme.of(context).primaryColor,
      _ => CupertinoColors.systemGrey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(24),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(label, style: TextStyle(fontSize: 11, color: color)),
    );
  }
}
