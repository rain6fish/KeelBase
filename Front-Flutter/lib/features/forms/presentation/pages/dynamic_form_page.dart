// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../data/models/form_schema_model.dart';
import '../../data/repositories/form_repository.dart';
import '../providers/form_provider.dart';

/// PL-10 动态表单页：按 JSON Schema 渲染字段 + 校验 + 提交。
/// 路由带 slug 参数（如 /form/:slug），页面内自建 FormProvider。
class DynamicFormPage extends StatelessWidget {
  final String slug;
  const DynamicFormPage({super.key, required this.slug});

  @override
  Widget build(BuildContext context) {
    final apiClient = context.read<ApiClient>();
    return ChangeNotifierProvider(
      create: (_) => FormProvider(FormRepository(apiClient), slug)..load(),
      child: const _FormBody(),
    );
  }
}

class _FormBody extends StatelessWidget {
  const _FormBody();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<FormProvider>();
    final theme = CupertinoTheme.of(context);

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(provider.schema?.title ?? l10n.formLoading),
      ),
      child: SafeArea(
        child: provider.loading
            ? const Center(child: CupertinoActivityIndicator())
            : provider.error != null
                ? Center(child: Text(provider.error!))
                : provider.submitted
                    ? _successView(theme)
                    : _buildForm(context, l10n, theme, provider),
      ),
    );
  }

  Widget _successView(CupertinoThemeData theme) {
    return Center(
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        const Icon(CupertinoIcons.checkmark_circle_fill, size: 64, color: CupertinoColors.systemGreen),
        const SizedBox(height: 16),
        Text('提交成功', style: theme.textTheme.navTitleTextStyle),
      ]),
    );
  }

  Widget _buildForm(BuildContext context, AppLocalizations l10n, CupertinoThemeData theme, FormProvider provider) {
    final schema = provider.schema!;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (schema.description != null) ...[
          Text(schema.description!, style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
          const SizedBox(height: 16),
        ],
        ...schema.fields.map((f) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: _buildField(context, provider, f),
            )),
        if (provider.submitError != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(provider.submitError!,
                style: const TextStyle(color: CupertinoColors.systemRed, fontSize: 13)),
          ),
        const SizedBox(height: 8),
        CupertinoButton.filled(
          borderRadius: BorderRadius.circular(14),
          onPressed: provider.submitting ? null : () async {
            final ok = await provider.submit();
            if (!ok && context.mounted) {
              AppToast.error(context, '请检查表单填写');
            }
          },
          child: Text(provider.submitting ? '提交中…' : l10n.formSubmit,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }

  Widget _buildField(BuildContext context, FormProvider provider, FormFieldModel f) {
    final error = provider.fieldErrors[f.key];
    final value = provider.values[f.key];
    Widget input;

    switch (f.type) {
      case 'select':
        input = CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => _pickSelect(context, provider, f),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: CupertinoColors.systemGrey.withAlpha(80)),
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.centerLeft,
            child: Text(value?.toString() ?? '请选择',
                style: TextStyle(color: value == null ? CupertinoColors.systemGrey.resolveFrom(context) : null)),
          ),
        );
        break;
      case 'boolean':
        input = CupertinoSwitch(
          value: value as bool? ?? false,
          onChanged: (v) => provider.setValue(f.key, v),
        );
        break;
      case 'textarea':
        input = CupertinoTextField(
          minLines: 3,
          maxLines: 5,
          placeholder: f.placeholder,
          onChanged: (v) => provider.setValue(f.key, v),
        );
        break;
      case 'number':
        input = CupertinoTextField(
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          placeholder: f.placeholder,
          onChanged: (v) => provider.setValue(f.key, num.tryParse(v)),
        );
        break;
      case 'date':
        input = CupertinoTextField(
          placeholder: f.placeholder ?? 'YYYY-MM-DD',
          onChanged: (v) => provider.setValue(f.key, v),
        );
        break;
      default: // text / tel / email
        input = CupertinoTextField(
          keyboardType: f.type == 'email'
              ? TextInputType.emailAddress
              : f.type == 'tel'
                  ? TextInputType.phone
                  : null,
          placeholder: f.placeholder,
          onChanged: (v) => provider.setValue(f.key, v),
        );
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${f.label}${f.required ? ' *' : ''}',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      input,
      if (error != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(error, style: const TextStyle(color: CupertinoColors.systemRed, fontSize: 12)),
        ),
    ]);
  }

  Future<void> _pickSelect(BuildContext context, FormProvider provider, FormFieldModel f) {
    return showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(f.label),
        actions: [
          for (final opt in f.options)
            CupertinoActionSheetAction(
              onPressed: () {
                provider.setValue(f.key, opt);
                Navigator.of(ctx).pop();
              },
              child: Text(opt),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('取消'),
        ),
      ),
    );
  }
}
