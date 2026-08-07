class AppVersionInfo {
  final String latestVersion;
  final String minRequiredVersion;
  final String updateUrl;
  final List<String> changelog;

  const AppVersionInfo({
    required this.latestVersion,
    required this.minRequiredVersion,
    required this.updateUrl,
    this.changelog = const [],
  });

  factory AppVersionInfo.fromJson(Map<String, dynamic> json) {
    return AppVersionInfo(
      latestVersion: json['latestVersion'] as String? ?? '',
      minRequiredVersion: json['minRequiredVersion'] as String? ?? '',
      updateUrl: json['updateUrl'] as String? ?? '',
      changelog: (json['changelog'] as List? ?? []).map((e) => e.toString()).toList(),
    );
  }
}
