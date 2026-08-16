class UserModel {
  final int id;
  final String username;
  final String email;
  final String nickname;
  final String? firstName;
  final String? lastName;
  final String? dateOfBirth;
  final String? phone;
  final String? bio;
  final String? avatarUrl;
  final String? createdAt;
  final bool emailVerified;
  /// 角色：user | admin（登录/me 返回，主 App 仅用于判断是否展示管理入口）。
  ///
  /// 注意：此字段仅作 UI 显示提示，绝不能作为权限边界——它直接来自未信任的
  /// JSON 载荷，任何权限判断一律在服务端（CASL）执行，前端不做授权决策。
  final String role;

  UserModel({
    required this.id,
    required this.username,
    required this.email,
    required this.nickname,
    this.firstName,
    this.lastName,
    this.dateOfBirth,
    this.phone,
    this.bio,
    this.avatarUrl,
    this.createdAt,
    this.emailVerified = false,
    this.role = 'user',
  });

  String get displayName {
    final name = [firstName, lastName].whereType<String>().join(' ');
    return name.isEmpty ? nickname : name;
  }

  static const Object _unset = Object();

  /// 哨兵：显式传 null 可清空可空字段（如 avatarUrl）。
  UserModel copyWith({
    bool? emailVerified,
    Object? avatarUrl = _unset,
  }) {
    return UserModel(
      id: id,
      username: username,
      email: email,
      nickname: nickname,
      firstName: firstName,
      lastName: lastName,
      dateOfBirth: dateOfBirth,
      phone: phone,
      bio: bio,
      avatarUrl: identical(avatarUrl, _unset) ? this.avatarUrl : avatarUrl as String?,
      createdAt: createdAt,
      emailVerified: emailVerified ?? this.emailVerified,
      role: role,
    );
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final rawUsername = json['username'];
    final rawNickname = json['nickname'];
    return UserModel(
      id: rawId is int ? rawId : 0,
      username: rawUsername is String ? rawUsername : '',
      email: json['email'] as String? ?? '',
      nickname: rawNickname is String ? rawNickname : '',
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      dateOfBirth: json['dateOfBirth'] as String?,
      phone: json['phone'] as String?,
      bio: json['bio'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      createdAt: json['createdAt'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
      role: json['role'] as String? ?? 'user',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'email': email,
        'nickname': nickname,
        'firstName': firstName,
        'lastName': lastName,
        'dateOfBirth': dateOfBirth,
        'phone': phone,
        'bio': bio,
        'avatarUrl': avatarUrl,
        'createdAt': createdAt,
        'emailVerified': emailVerified,
        'role': role,
      };
}
