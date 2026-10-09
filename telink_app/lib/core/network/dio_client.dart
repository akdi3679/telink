import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../env/env.dart';
import '../security/cert_pinning.dart';
import '../security/dpop_client.dart';
import '../storage/secure_storage.dart';

/// Paths that should never receive a DPoP proof.
bool _skipDpop(String path) {
  return path.startsWith('/auth/dpop') ||
      path.startsWith('/oidc/') ||
      path.startsWith('/auth/signup') ||
      path == '/auth/login' ||
      path == '/auth/refresh';
}

/// Paths whose 401 should NOT trigger an automatic refresh.
/// These are the auth endpoints themselves - refreshing would loop.
bool _isAuthEndpoint(String path) {
  return path == '/auth/login' ||
      path == '/auth/refresh' ||
      path.startsWith('/auth/signup') ||
      path.startsWith('/auth/dpop') ||
      path.startsWith('/oidc/');
}

class DioClient {
  final Dio dio;
  final SecureStorage storage;

  /// Set when a refresh is in-flight. All concurrent 401s await the same
  /// future, so we only refresh once per expiry event.
  Future<bool>? _refreshFuture;

  DioClient(this.storage)
      : dio = Dio(
          BaseOptions(
            baseUrl: Env.apiUrl,
            connectTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
            contentType: 'application/json',
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storage.readAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';

            final path = options.uri.path;
            if (!_skipDpop(path)) {
              try {
                final proof = await DpopClient().signRequest(
                  method: options.method,
                  url: path,
                  accessToken: token,
                );
                if (proof != null) {
                  options.headers['DPoP'] = proof;
                }
              } catch (e) {
                debugPrint('[DPoP] signing failed: $e');
              }
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final response = error.response;
          final status = response?.statusCode;
          final path = error.requestOptions.uri.path;
          final alreadyRetried =
              error.requestOptions.extra['_auth_retried'] == true;

          // Trigger auto-refresh only on 401 from a non-auth endpoint,
          // and only if we have not already retried this request.
          if (status == 401 &&
              !alreadyRetried &&
              !_isAuthEndpoint(path)) {
            final refreshed = await _refreshOnce();
            if (refreshed) {
              try {
                final retried = await _retryWithFreshToken(error.requestOptions);
                return handler.resolve(retried);
              } catch (e) {
                debugPrint('[Auth] retry after refresh failed: $e');
                // Fall through to returning the original error.
              }
            }
          }

          handler.next(error);
        },
      ),
    );

    final pinning = CertPinning.build();
    if (pinning != null) {
      dio.interceptors.add(pinning);
    }
  }

  /// Coalesce concurrent 401s into a single refresh attempt.
  Future<bool> _refreshOnce() {
    final inFlight = _refreshFuture;
    if (inFlight != null) return inFlight;

    final future = _doRefresh().whenComplete(() {
      _refreshFuture = null;
    });
    _refreshFuture = future;
    return future;
  }

  Future<bool> _doRefresh() async {
    final rt = await storage.readRefreshToken();
    if (rt == null || rt.isEmpty) return false;

    // Use a bare Dio so this call cannot trigger our own interceptors.
    final bare = Dio(
      BaseOptions(
        baseUrl: Env.apiUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        contentType: 'application/json',
      ),
    );

    try {
      final res = await bare.post(
        '/auth/refresh',
        data: {'refreshToken': rt},
      );
      final data = (res.data as Map).cast<String, dynamic>();
      await storage.saveTokens(
        data['accessToken'] as String,
        data['refreshToken'] as String,
      );
      debugPrint('[Auth] token refreshed');
      return true;
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      debugPrint('[Auth] refresh failed ($code): ${e.message}');
      // Refresh token is invalid, revoked, replayed, or expired.
      // Clear everything - the user must log in again.
      await storage.clear();
      return false;
    } catch (e) {
      debugPrint('[Auth] refresh failed: $e');
      await storage.clear();
      return false;
    }
  }

  /// Re-issue the failed request with the new access token and a fresh
  /// DPoP proof (the old proof's `ath` binds to the old token).
  Future<Response<dynamic>> _retryWithFreshToken(RequestOptions original) async {
    final newToken = await storage.readAccessToken();
    if (newToken == null || newToken.isEmpty) {
      throw StateError('no token after refresh');
    }

    original.extra['_auth_retried'] = true;
    original.headers['Authorization'] = 'Bearer $newToken';

    final path = original.uri.path;
    if (!_skipDpop(path)) {
      try {
        final proof = await DpopClient().signRequest(
          method: original.method,
          url: path,
          accessToken: newToken,
        );
        if (proof != null) {
          original.headers['DPoP'] = proof;
        }
      } catch (e) {
        debugPrint('[DPoP] re-sign failed: $e');
      }
    }

    return dio.fetch(original);
  }
}