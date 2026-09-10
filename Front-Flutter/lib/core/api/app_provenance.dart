// SPDX-License-Identifier: Apache-2.0

/// FE-1：`GET /app/provenance` —— 运行时来源指纹
/// （来源身份 `.keelbase/manifest.json` + 能力清单 + AI 工具指纹）。
class ProvenanceSource {
  final bool manifestPresent;
  final String? identity;
  final String? generator;
  final String? generatorVersion;
  final String? protocol;

  const ProvenanceSource({
    required this.manifestPresent,
    this.identity,
    this.generator,
    this.generatorVersion,
    this.protocol,
  });

  factory ProvenanceSource.fromJson(Map<String, dynamic> json) => ProvenanceSource(
        manifestPresent: json['manifestPresent'] as bool? ?? false,
        identity: json['identity'] as String?,
        generator: json['generator'] as String?,
        generatorVersion: json['generatorVersion'] as String?,
        protocol: json['protocol'] as String?,
      );
}

class AiToolFingerprint {
  final int total;
  final int read;
  final int write;

  const AiToolFingerprint({required this.total, required this.read, required this.write});

  factory AiToolFingerprint.fromJson(Map<String, dynamic> json) => AiToolFingerprint(
        total: json['total'] as int? ?? 0,
        read: json['read'] as int? ?? 0,
        write: json['write'] as int? ?? 0,
      );
}

class AppProvenance {
  final ProvenanceSource source;
  final String preset;
  final int moduleCount;
  final AiToolFingerprint tools;

  const AppProvenance({
    required this.source,
    required this.preset,
    required this.moduleCount,
    required this.tools,
  });

  factory AppProvenance.fromJson(Map<String, dynamic> json) {
    final rt = (json['runtime'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final mods = (rt['businessModules'] as List?) ?? const [];
    return AppProvenance(
      source: ProvenanceSource.fromJson(
        (json['source'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      preset: rt['preset'] as String? ?? '',
      moduleCount: mods.length,
      tools: AiToolFingerprint.fromJson(
        (rt['aiToolFingerprint'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
    );
  }
}
