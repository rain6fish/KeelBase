import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../auth/data/models/user_model.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../upload/presentation/providers/upload_provider.dart';

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({super.key});

  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  final _emailCtrl = TextEditingController();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _nicknameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _dateOfBirthCtrl = TextEditingController();
  bool _saving = false;
  bool _uploadingAvatar = false;
  String? _avatarUrl;
  int? _lastUserId;

  @override
  void initState() {
    super.initState();
    // Sync user data into controllers on first load
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncFromUser());
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _nicknameCtrl.dispose();
    _phoneCtrl.dispose();
    _bioCtrl.dispose();
    _dateOfBirthCtrl.dispose();
    super.dispose();
  }

  /// Pull latest user data into controllers. Safe to call repeatedly.
  void _syncFromUser() {
    final user = context.read<AuthProvider>().user;
    if (user == null || user.id == _lastUserId) return;
    _lastUserId = user.id;
    _emailCtrl.text = user.email ?? '';
    _firstNameCtrl.text = user.firstName ?? '';
    _lastNameCtrl.text = user.lastName ?? '';
    _nicknameCtrl.text = user.nickname;
    _phoneCtrl.text = user.phone ?? '';
    _bioCtrl.text = user.bio ?? '';
    _dateOfBirthCtrl.text = user.dateOfBirth ?? '';
    _avatarUrl = user.avatarUrl;
  }

  Future<void> _pickAvatar() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    if (file.path == null || !mounted) return;

    setState(() => _uploadingAvatar = true);
    try {
      final uploadProvider = context.read<UploadProvider>();
      final ok = await uploadProvider.uploadFile(file.path!, file.name);
      if (!mounted) return;
      if (ok && uploadProvider.result != null) {
        setState(() => _avatarUrl = uploadProvider.result!.url);
      } else {
        AppToast.error(context, uploadProvider.error ?? context.l10n.unknownError);
      }
    } catch (_) {
      // uploadProvider.uploadFile 内部已 catch；这里兜底
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _save() async {
    final nickname = _nicknameCtrl.text.trim();
    if (nickname.isEmpty) {
      AppToast.error(context, context.l10n.nicknameRequired);
      return;
    }

    setState(() => _saving = true);
    try {
      final apiClient = context.read<ApiClient>();
      final user = context.read<AuthProvider>().user;
      if (user == null) return;

      final data = <String, dynamic>{
        'nickname': nickname,
        'email': _emailCtrl.text.trim(),
        'firstName': _firstNameCtrl.text.trim(),
        'lastName': _lastNameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'bio': _bioCtrl.text.trim(),
        'dateOfBirth': _dateOfBirthCtrl.text.trim(),
        if (_avatarUrl != null) 'avatarUrl': _avatarUrl,
      };

      final json = await apiClient.put('/users/${user.id}', data: data);
      final response = ApiResponse.fromJson(json, (data) => UserModel.fromJson(data));
      if (response.data != null && mounted) {
        context.read<AuthProvider>().updateUser(response.data!);
        AppToast.success(context, context.l10n.save);
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _buildRow(String label, TextEditingController ctrl, {TextInputAction action = TextInputAction.next, bool isLast = false}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: CupertinoTextField(
              controller: ctrl,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
              ),
              textInputAction: action,
              onSubmitted: (_) => !isLast ? FocusScope.of(context).nextFocus() : _save(),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // Watch AuthProvider so controllers sync when user data changes
    context.watch<AuthProvider>();
    _syncFromUser();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.editProfile),
        previousPageTitle: l10n.back,
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          pressedOpacity: _saving ? 1.0 : 0.6,
          onPressed: _saving ? null : _save,
          child: _saving
              ? const CupertinoActivityIndicator()
              : Text(l10n.save, style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
      ),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Avatar — tap to upload
          Center(
            child: GestureDetector(
              onTap: _uploadingAvatar ? null : _pickAvatar,
              child: Stack(
                children: [
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: CupertinoTheme.of(context).primaryColor.withAlpha(40),
                      shape: BoxShape.circle,
                      image: _avatarUrl != null && _avatarUrl!.isNotEmpty
                          ? DecorationImage(
                              image: NetworkImage(AppConstants.resolveUrl(_avatarUrl)),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    child: _avatarUrl == null || _avatarUrl!.isEmpty
                        ? Center(
                            child: Text(
                              (context.watch<AuthProvider>().user?.displayName ?? 'U')
                                  .substring(0, 1)
                                  .toUpperCase(),
                              style: TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.w600,
                                color: CupertinoTheme.of(context).primaryColor,
                              ),
                            ),
                          )
                        : null,
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: CupertinoColors.systemBlue,
                        shape: BoxShape.circle,
                      ),
                      child: _uploadingAvatar
                          ? const SizedBox(
                              width: 12,
                              height: 12,
                              child: CupertinoActivityIndicator(),
                            )
                          : const Icon(
                              CupertinoIcons.camera_fill,
                              size: 14,
                              color: CupertinoColors.white,
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Username — read-only display
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(
              children: [
                SizedBox(
                  width: 100,
                  child: Text(l10n.username, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
                ),
                Expanded(
                  child: Text(
                    '@${context.watch<AuthProvider>().user?.username ?? ''}',
                    style: TextStyle(fontSize: 16, color: CupertinoColors.systemGrey.resolveFrom(context)),
                  ),
                ),
              ],
            ),
          ),
          _buildRow(l10n.email, _emailCtrl),
          _buildRow(l10n.firstName, _firstNameCtrl),
          _buildRow(l10n.lastName, _lastNameCtrl),
          _buildRow(l10n.nickname, _nicknameCtrl),
          _buildRow(l10n.phone, _phoneCtrl),
          _buildRow(l10n.dateOfBirth, _dateOfBirthCtrl),
          _buildRow(l10n.bio, _bioCtrl, isLast: true, action: TextInputAction.done),
        ],
      ),
    );
  }
}
