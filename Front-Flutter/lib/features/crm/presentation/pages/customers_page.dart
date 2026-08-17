import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/crm_provider.dart';

/// AI CRM：客户列表（旗舰应用主页）
class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key});

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<CrmProvider>().loadCustomers();
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
    final nameCtrl = TextEditingController();
    final companyCtrl = TextEditingController();
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(l10n.crmAddCustomer),
        actions: [
          CupertinoActionSheetAction(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: CupertinoTextField(controller: nameCtrl, placeholder: l10n.crmCustomerName),
                ),
                CupertinoTextField(controller: companyCtrl, placeholder: l10n.crmCustomerCompany),
              ],
            ),
            onPressed: () {},
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () async {
            final name = nameCtrl.text.trim();
            Navigator.pop(ctx);
            if (name.isEmpty) {
              AppToast.error(context, l10n.crmNameRequired);
              return;
            }
            final ok = await context.read<CrmProvider>().createCustomer({
              'name': name,
              'company': companyCtrl.text.trim().isEmpty ? null : companyCtrl.text.trim(),
            });
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
    final provider = context.watch<CrmProvider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.crmTitle),
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          child: const Icon(CupertinoIcons.add),
          onPressed: _showCreateSheet,
        ),
      ),
      child: provider.loading && provider.customers.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : provider.customers.isEmpty
              ? Center(child: Text(l10n.crmEmpty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: provider.customers.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    color: CupertinoColors.separator.resolveFrom(context).withValues(alpha: 0.5),
                  ),
                  itemBuilder: (ctx, i) {
                    final c = provider.customers[i];
                    return CupertinoListTile(
                      title: Text(c.name),
                      subtitle: Text([
                        if (c.company?.isNotEmpty == true) c.company!,
                        _statusLabel(l10n, c.status),
                      ].join(' · ')),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: _riskColor(c.riskLevel).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              l10n.crmRiskLabel(c.riskLevel),
                              style: TextStyle(fontSize: 12, color: _riskColor(c.riskLevel), fontWeight: FontWeight.w600),
                            ),
                          ),
                          const CupertinoListTileChevron(),
                        ],
                      ),
                      onTap: () => ctx.push('/crm/customers/${c.id}'),
                    );
                  },
                ),
    );
  }

  String _statusLabel(AppLocalizations l10n, String status) {
    switch (status) {
      case 'active':
        return l10n.crmStatusActive;
      case 'churn_risk':
        return l10n.crmStatusChurnRisk;
      case 'inactive':
        return l10n.crmStatusInactive;
      default:
        return l10n.crmStatusLead;
    }
  }
}
