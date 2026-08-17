import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/approval_provider.dart';
import '../../data/models/approval_models.dart';

/// AI Approval：审批请求详情（AI 预审 + 人工复核）
class ApprovalRequestDetailPage extends StatefulWidget {
  final int requestId;
  const ApprovalRequestDetailPage({super.key, required this.requestId});

  @override
  State<ApprovalRequestDetailPage> createState() => _ApprovalRequestDetailPageState();
}

class _ApprovalRequestDetailPageState extends State<ApprovalRequestDetailPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<ApprovalProvider>().loadRequests();
    });
  }

  Future<void> _review() async {
    final provider = context.read<ApprovalProvider>();
    final updated = await provider.reviewRequest(widget.requestId);
    if (updated != null) {
      AppToast.success(context, context.l10n.apReviewed);
    } else {
      AppToast.error(context, provider.error ?? context.l10n.unknownError);
    }
  }

  Future<void> _decide(String decision) async {
    final provider = context.read<ApprovalProvider>();
    final updated = await provider.decideRequest(widget.requestId, decision);
    if (updated != null) {
      AppToast.success(context, context.l10n.apDecided);
    } else {
      AppToast.error(context, provider.error ?? context.l10n.unknownError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<ApprovalProvider>();
    final req = provider.requests.where((r) => r.id == widget.requestId).firstOrNull;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(previousPageTitle: l10n.back),
        middle: Text(req?.title ?? l10n.apTitle),
      ),
      child: req == null
          ? Center(child: Text(provider.error ?? l10n.apEmpty))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _card(context, l10n, req),
                const SizedBox(height: 16),
                if (req.status == 'pending')
                  CupertinoButton.filled(
                    child: Text(l10n.apReview),
                    onPressed: _review,
                  ),
                if (req.status == 'needs_review') ...[
                  CupertinoButton.filled(
                    child: Text(l10n.apApprove),
                    onPressed: () => _decide('approved'),
                  ),
                  const SizedBox(height: 8),
                  CupertinoButton.filled(
                    key: const ValueKey('reject'),
                    child: Text(l10n.apReject),
                    onPressed: () => _decide('rejected'),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _card(BuildContext context, AppLocalizations l10n, ApprovalRequestModel req) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(req.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            '${l10n.apStatusLabel(req.status)} · ${l10n.crmRiskLabel(req.riskLevel)} · ¥${req.amount.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 14, color: CupertinoColors.systemGrey),
          ),
          const SizedBox(height: 8),
          Text(l10n.apReason, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
          Text(req.reason, style: const TextStyle(fontSize: 14)),
          if (req.aiRecommendation != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: CupertinoColors.systemYellow.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${l10n.apAiRecommendation}:\n${req.aiRecommendation}',
                style: const TextStyle(fontSize: 13),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
