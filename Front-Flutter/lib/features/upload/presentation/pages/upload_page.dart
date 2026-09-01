// SPDX-License-Identifier: Apache-2.0

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_list_section.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../../core/widgets/loading_widget.dart';
import '../providers/upload_provider.dart';

class UploadPage extends StatefulWidget {
  const UploadPage({super.key});

  @override
  State<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends State<UploadPage> {
  String? _selectedFilePath;
  String? _selectedFileName;

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'zip'],
      allowMultiple: false,
    );

    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      setState(() {
        _selectedFilePath = file.path;
        _selectedFileName = file.name;
      });
    }
  }

  Future<void> _upload() async {
    if (_selectedFilePath == null) return;

    final provider = context.read<UploadProvider>();
    final ok = await provider.uploadFile(
      _selectedFilePath!,
      _selectedFileName ?? 'file',
    );

    if (!mounted) return;
    if (ok) {
      setState(() {
        _selectedFilePath = null;
        _selectedFileName = null;
      });
    } else {
      AppToast.error(context, provider.error ?? context.l10n.unknownError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.uploadTitle),
        previousPageTitle: l10n.back,
      ),
      child: Consumer<UploadProvider>(
        builder: (_, provider, _) {
          if (provider.isUploading) {
            return LoadingWidget(message: l10n.uploading);
          }

          if (provider.result != null) {
            final r = provider.result!;
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 40),
                const Icon(CupertinoIcons.check_mark_circled_solid, size: 64, color: CupertinoColors.systemGreen),
                const SizedBox(height: 16),
                // 图片文件预览（r.mimeType 以 image/ 开头时）
                if (r.mimeType.startsWith('image/'))
                  Center(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        AppConstants.resolveUrl(r.url),
                        height: 160,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  )
                else
                  const SizedBox(height: 0),
                Center(child: Text(l10n.uploadSuccess, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600))),
                const SizedBox(height: 24),
                AppListSection(
                  children: [
                    CupertinoListTile(title: Text(l10n.uploadFileLabel), trailing: Text(r.originalName)),
                    CupertinoListTile(title: Text(l10n.uploadSizeLabel), trailing: Text('${(r.size / 1024).toStringAsFixed(1)} KB')),
                    CupertinoListTile(title: Text(l10n.uploadTypeLabel), trailing: Text(r.mimeType)),
                  ],
                ),
                const SizedBox(height: 24),
                AppPrimaryButton(
                  label: l10n.uploadFile,
                  onPressed: () => provider.clear(),
                ),
              ],
            );
          }

          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 40),
              Center(
                child: Icon(
                  CupertinoIcons.cloud_upload_fill,
                  size: 64,
                  color: CupertinoColors.systemBlue.resolveFrom(context),
                ),
              ),
              const SizedBox(height: 16),
              Center(child: Text(l10n.selectFile, style: const TextStyle(fontSize: 18))),
              const SizedBox(height: 24),

              // Selected file info
              if (_selectedFileName != null)
                AppListSection(
                  children: [
                    CupertinoListTile(
                      leading: const Icon(CupertinoIcons.doc_text, size: 22),
                      title: Text(_selectedFileName!, overflow: TextOverflow.ellipsis),
                      trailing: CupertinoButton(
                        padding: EdgeInsets.zero,
                        child: const Icon(CupertinoIcons.clear_circled, size: 20, color: CupertinoColors.destructiveRed),
                        onPressed: () => setState(() {
                          _selectedFilePath = null;
                          _selectedFileName = null;
                        }),
                      ),
                    ),
                  ],
                ),
              if (_selectedFileName != null) const SizedBox(height: 16),

              // Pick file button
              Center(
                child: CupertinoButton(
                  color: _selectedFileName == null ? theme.primaryColor : CupertinoColors.systemGrey,
                  onPressed: _pickFile,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(CupertinoIcons.doc_on_doc, size: 20),
                      const SizedBox(width: 8),
                      Text(_selectedFileName == null ? l10n.selectFile : l10n.selectFile),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Upload button (only when file selected)
              if (_selectedFileName != null)
                AppPrimaryButton(
                  label: l10n.uploadFile,
                  onPressed: _upload,
                ),
            ],
          );
        },
      ),
    );
  }
}
