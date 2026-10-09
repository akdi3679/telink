class User {
  final String id;
  final String phone;
  final String email;
  final bool emailVerified;
  final String status;

  const User({
    required this.id,
    required this.phone,
    required this.email,
    required this.emailVerified,
    required this.status,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as String,
        phone: j['phone'] as String,
        email: j['email'] as String? ?? '',
        emailVerified: j['emailVerified'] as bool? ?? false,
        status: j['status'] as String? ?? 'active',
      );
}

class Profile {
  final String firstName;
  final String lastName;
  final String role;
  final String jobTitle;
  final String? headline;
  final String? bio;
  final String? workTitle;
  final String? workCompany;
  final String? city;
  final String? country;
  final String? photoUrl;
  final String? bannerUrl;
  final List<String> languages;
  final List<String> categories;

  const Profile({
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.jobTitle,
    this.headline,
    this.bio,
    this.workTitle,
    this.workCompany,
    this.city,
    this.country,
    this.photoUrl,
    this.bannerUrl,
    this.languages = const [],
    this.categories = const [],
  });

  factory Profile.fromJson(Map<String, dynamic> j) => Profile(
        firstName: j['firstName'] as String? ?? '',
        lastName: j['lastName'] as String? ?? '',
        role: j['role'] as String? ?? '',
        jobTitle: j['jobTitle'] as String? ?? '',
        headline: j['headline'] as String?,
        bio: j['bio'] as String?,
        workTitle: j['workTitle'] as String?,
        workCompany: j['workCompany'] as String?,
        city: j['city'] as String?,
        country: j['country'] as String?,
        photoUrl: j['photoUrl'] as String?,
        bannerUrl: j['bannerUrl'] as String?,
        languages: (j['languages'] as List?)?.cast<String>() ?? const [],
        categories: (j['categories'] as List?)?.cast<String>() ?? const [],
      );
}

class AuthResult {
  final User user;
  final Profile? profile;
  const AuthResult({required this.user, this.profile});
}