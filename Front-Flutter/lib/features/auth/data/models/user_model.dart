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
  });

  String get displayName {
    if (firstName != null && lastName != null) return '$firstName $lastName';
    return nickname;
  }

  UserModel copyWith({bool? emailVerified, String? avatarUrl}) {
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
      avatarUrl: avatarUrl ?? this.avatarUrl,
      createdAt: createdAt,
      emailVerified: emailVerified ?? this.emailVerified,
    );
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as int,
      username: json['username'] as String,
      email: json['email'] as String? ?? '',
      nickname: json['nickname'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      dateOfBirth: json['dateOfBirth'] as String?,
      phone: json['phone'] as String?,
      bio: json['bio'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      createdAt: json['createdAt'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
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
      };
}
