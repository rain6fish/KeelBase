/// 登录设备（会话）信息
class DeviceSessionModel {
  final int id;
  final String? deviceId;
  final String? deviceName;
  final String? ip;
  final String? createdAt;
  final String? lastActiveAt;
  final String? expiresAt;
  final bool isCurrent;

  const DeviceSessionModel({
    required this.id,
    this.deviceId,
    this.deviceName,
    this.ip,
    this.createdAt,
    this.lastActiveAt,
    this.expiresAt,
    this.isCurrent = false,
  });

  factory DeviceSessionModel.fromJson(Map<String, dynamic> json) {
    return DeviceSessionModel(
      id: json['id'] as int,
      deviceId: json['deviceId'] as String?,
      deviceName: json['deviceName'] as String?,
      ip: json['ip'] as String?,
      createdAt: json['createdAt'] as String?,
      lastActiveAt: json['lastActiveAt'] as String?,
      expiresAt: json['expiresAt'] as String?,
      isCurrent: json['isCurrent'] as bool? ?? false,
    );
  }
}
