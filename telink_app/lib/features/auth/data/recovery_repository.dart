import 'package:dio/dio.dart';
import '../../../core/storage/secure_storage.dart';
import 'models/user_model.dart';

class RecoveryStatus {
  final int total;
  final int remaining;
  final DateTime? generatedAt;

  const RecoveryStatus({
    required this.total,
    required this.remaining,
    this.generatedAt,
  });

  factory RecoveryStatus.fromJson(Map<String, dynamic> j) => RecoveryStatus(
        total: j['total'] as int? ?? 0,
        remaining: j['remaining'] as int? ?? 0,
        generatedAt: j['generatedAt'] == null
            ? null
            : DateTime.parse(j['generatedAt'] as String),
      );
}

class RecoveryRepository {
  final Dio _dio;
  final SecureStorage _storage;
  RecoveryRepository(this._dio, this._storage);

  Future<RecoveryStatus> status() async {
    final res = await _dio.get('/auth/recovery/status');
    return RecoveryStatus.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<List<String>> generate() async {
    final res = await _dio.post('/auth/recovery/generate');
    final list = (res.data as Map)['codes'] as List;
    return list.cast<String>();
  }

  /// Returns the short-lived reset token.
  Future<String> verify(String email, String code) async {
    final res = await _dio.post('/auth/recovery/verify', data: {
      'email': email,
      'code': code,
    });
    return (res.data as Map)['resetToken'] as String;
  }

  /// Sets a new password. Saves tokens. Returns the new session.
  Future<AuthResult> complete(String resetToken, String newPassword) async {
    final res = await _dio.post('/auth/recovery/complete', data: {
      'resetToken': resetToken,
      'newPassword': newPassword,
    });
    final data = (res.data as Map).cast<String, dynamic>();
    await _storage.saveTokens(
      data['accessToken'] as String,
      data['refreshToken'] as String,
    );
    return AuthResult(
      user: User.fromJson((data['user'] as Map).cast<String, dynamic>()),
      profile: data['profile'] == null
          ? null
          : Profile.fromJson((data['profile'] as Map).cast<String, dynamic>()),
    );
  }
}