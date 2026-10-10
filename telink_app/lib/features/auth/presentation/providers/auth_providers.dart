import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/security/dpop_client.dart';
import '../../../../core/security/webauthn_client.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../data/dpop_repository.dart';
import '../../data/datasources/auth_remote_datasource.dart';
import '../../data/models/user_model.dart';
import '../../data/repositories/auth_repository.dart';

final secureStorageProvider = Provider<SecureStorage>((ref) => SecureStorage());

final dioClientProvider = Provider<DioClient>((ref) {
  return DioClient(ref.read(secureStorageProvider));
});

final authRemoteProvider = Provider<AuthRemoteDataSource>((ref) {
  return AuthRemoteDataSource(ref.read(dioClientProvider).dio);
});

final dpopRepositoryProvider = Provider<DpopRepository>((ref) {
  return DpopRepository(ref.read(dioClientProvider).dio);
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    remote: ref.read(authRemoteProvider),
    storage: ref.read(secureStorageProvider),
  );
});

class AuthNotifier extends AsyncNotifier<AuthResult?> {
  @override
  Future<AuthResult?> build() async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final session = await ref.read(authRepositoryProvider).me();
        if (session != null) {
          _registerDpopAfterAuth();
        }
        return session;
      } on DioException catch (e) {
        final transient = e.type == DioExceptionType.cancel ||
            e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout ||
            e.type == DioExceptionType.sendTimeout;
        debugPrint(
            '[Auth] me() attempt ${attempt + 1} failed: ${e.type} ${e.message}');
        if (!transient || attempt == 2) {
          return null;
        }
        await Future.delayed(const Duration(milliseconds: 400));
      } catch (e) {
        debugPrint('[Auth] me() unexpected failure: $e');
        return null;
      }
    }
    return null;
  }

  /// Fire-and-forget DPoP registration. Never affects auth state.
  void _registerDpopAfterAuth() {
    Future(() async {
      try {
        final client = DpopClient();
        await client.ensureKey();
        final jwk = await client.publicJwk();
        if (jwk == null) return;
        await ref
            .read(dpopRepositoryProvider)
            .register(jwk, deviceName: 'mobile');
        debugPrint('[DPoP] registered for session');
      } catch (e) {
        debugPrint('[DPoP] register failed (non-fatal): $e');
      }
    });
  }

  Future<void> login(String identifier, String password) async {
    state = const AsyncLoading();

    // Only the actual login call can fail the login. Nothing else.
    final AuthResult result;
    try {
      result = await ref
          .read(authRepositoryProvider)
          .login(identifier, password);
    } catch (e, st) {
      state = AsyncError(e, st);
      rethrow;
    }

    // Login succeeded. Set state and fire DPoP registration
    // asynchronously so it can never change the login result.
    state = AsyncData(result);
    _registerDpopAfterAuth();
  }

  Future<void> loginWithPasskey({String? identifier}) async {
    state = const AsyncLoading();

    final AuthResult result;
    try {
      final repo = ref.read(authRepositoryProvider);
      final begin = await repo.passkeyLoginBegin(identifier: identifier);
      final client = WebAuthnClient();
      final response = await client.login(begin.options);
      result = await repo.passkeyLoginFinish(
        sessionId: begin.sessionId,
        response: response,
      );
    } catch (e, st) {
      state = AsyncError(e, st);
      rethrow;
    }

    state = AsyncData(result);
    _registerDpopAfterAuth();
  }

  Future<void> setSession(AuthResult result) async {
    state = AsyncData(result);
    _registerDpopAfterAuth();
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } catch (e) {
      debugPrint('[Auth] logout storage clear failed: $e');
    }
    state = const AsyncData(null);
  }
}

final authProvider =
    AsyncNotifierProvider<AuthNotifier, AuthResult?>(AuthNotifier.new);