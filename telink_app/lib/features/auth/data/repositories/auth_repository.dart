import 'package:dio/dio.dart';
import '../../../../core/storage/secure_storage.dart';
import '../datasources/auth_remote_datasource.dart';
import '../models/user_model.dart';

class AuthRepository {
  final AuthRemoteDataSource remote;
  final SecureStorage storage;

  AuthRepository({required this.remote, required this.storage});

  Future<String> signupStart(String phone, String email) =>
      remote.signupStart(phone, email);

  Future<String> signupVerifyEmail(String signupId, String code) =>
      remote.signupVerifyEmail(signupId, code);

  Future<AuthResult> signupComplete({
    required String signupToken,
    required String password,
    required String firstName,
    required String lastName,
    required String role,
    required String jobTitle,
  }) async {
    final data = await remote.signupComplete(
      signupToken: signupToken,
      password: password,
      firstName: firstName,
      lastName: lastName,
      role: role,
      jobTitle: jobTitle,
    );
    await storage.saveTokens(
      data['accessToken'] as String,
      data['refreshToken'] as String,
    );
    return _toAuthResult(data);
  }

  Future<AuthResult> login(String identifier, String password) async {
    final data = await remote.login(identifier, password);
    await storage.saveTokens(
      data['accessToken'] as String,
      data['refreshToken'] as String,
    );
    return _toAuthResult(data);
  }

  Future<AuthResult?> me() async {
    final token = await storage.readAccessToken();
    if (token == null || token.isEmpty) return null;
    try {
      final data = await remote.me();
      return _toAuthResult(data);
    } on DioException catch (e) {
      // Only clear on a genuine auth failure the interceptor could not
      // recover from. Do NOT clear on:
      //   - cancel (user refreshed the tab, navigated, etc.)
      //   - connection errors (offline)
      //   - timeouts
      //   - 5xx server errors
      final status = e.response?.statusCode;
      final type = e.type;
      if (status == 401 || status == 403) {
        await storage.clear();
        return null;
      }
      if (type == DioExceptionType.cancel ||
          type == DioExceptionType.connectionError ||
          type == DioExceptionType.connectionTimeout ||
          type == DioExceptionType.receiveTimeout ||
          type == DioExceptionType.sendTimeout) {
        // Transient. Keep tokens, propagate the error so the UI can
        // decide what to do (retry, show error, etc.).
        rethrow;
      }
      if (status != null && status >= 500) {
        // Server-side problem. Keep tokens.
        rethrow;
      }
      // Unknown. Be conservative, keep tokens.
      rethrow;
    } catch (e) {
      // Non-Dio error. Keep tokens.
      rethrow;
    }
  }

  Future<void> logout() => storage.clear();

  Future<PasskeyLoginBegin> passkeyLoginBegin({String? identifier}) =>
      remote.passkeyLoginBegin(identifier: identifier);

  Future<AuthResult> passkeyLoginFinish({
    required String sessionId,
    required Map<String, dynamic> response,
  }) async {
    final data = await remote.passkeyLoginFinish(
      sessionId: sessionId,
      response: response,
    );
    await storage.saveTokens(
      data['accessToken'] as String,
      data['refreshToken'] as String,
    );
    return _toAuthResult(data);
  }

  AuthResult _toAuthResult(Map<String, dynamic> data) {
    return AuthResult(
      user: User.fromJson((data['user'] as Map).cast<String, dynamic>()),
      profile: data['profile'] == null
          ? null
          : Profile.fromJson((data['profile'] as Map).cast<String, dynamic>()),
    );
  }
}