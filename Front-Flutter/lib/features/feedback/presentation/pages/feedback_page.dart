import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../data/repositories/feedback_repository.dart';

/// G-1 应用内反馈：类型选择 + 内容 + 联系方式，提交后提示成功。
class FeedbackPage extends StatefulWidget {
  const FeedbackPage({super.key});

  @override
  State<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends State<FeedbackPage> {
  final _contentCtrl = TextEditingController();
  final _contactCtrl = TextEditingController();
  int _type = 0; // 0=suggestion 1=bug 2=praise
  bool _submitting = false;

  @override
  void dispose() {
    _contentCtrl.dispose();
    _contactCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final content = _contentCtrl.text.trim();
    if (content.isEmpty) {
      AppToast.show(context, context.l10n.feedbackContentRequired);
      return;
    }
    setState(() => _submitting = true);
    try {
      final apiClient = context.read<ApiClient>();
      await FeedbackRepository(apiClient).submit(
        type: const ['suggestion', 'bug', 'praise'][_type],
        content: content,
        contact: _contactCtrl.text.trim(),
      );
      if (!mounted) return;
      AppToast.success(context, context.l10n.feedbackSubmitted);
      context.pop();
    } catch (_) {
      if (!mounted) return;
      AppToast.error(context, context.l10n.feedbackSubmitFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final types = [l10n.feedbackTypeSuggestion, l10n.feedbackTypeBug, l10n.feedbackTypePraise];

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.feedbackTitle),
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(l10n.feedbackTypeLabel,
                style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context))),
            const SizedBox(height: 8),
            CupertinoSlidingSegmentedControl<int>(
              groupValue: _type,
              children: {
                for (var i = 0; i < types.length; i++) i: Text(types[i]),
              },
              onValueChanged: (v) => setState(() => _type = v ?? 0),
            ),
            const SizedBox(height: 20),
            CupertinoTextField(
              controller: _contentCtrl,
              minLines: 4,
              maxLines: 8,
              maxLength: 2000,
              placeholder: l10n.feedbackContentHint,
              padding: const EdgeInsets.all(12),
            ),
            const SizedBox(height: 16),
            CupertinoTextField(
              controller: _contactCtrl,
              placeholder: l10n.feedbackContactHint,
            ),
            const SizedBox(height: 24),
            CupertinoButton.filled(
              borderRadius: BorderRadius.circular(14),
              onPressed: _submitting ? null : _submit,
              child: Text(
                l10n.feedbackSubmit,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}