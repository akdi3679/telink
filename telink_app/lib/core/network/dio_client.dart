import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../env/env.dart';
import '../security/cert_pinning.dart';
import '../security/dpop_client.dart';
import '../storage/secure_storage.dart';

bool _skipDpop(String path) {
  return path.startsWith('/auth/dpop') ||
      path.startsWith('/oidc/') ||
      path.startsWith('/auth/signup') ||
      path == '/auth/login' ||
      path == '/auth/refresh';
}

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
          // Read the token defensively. If secure storage is broken on
          // this device, we proceed without a token rather than crashing
          // the request. Endpoints that require auth will return 401 and
          // the app can handle it properly.
          String? token;
          try {
            token = await storage.readAccessToken();
          } catch (e) {
            debugPrint('[Dio] secure storage read failed: $e');
            token = null;
          }

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
    String? rt;
    try {
      rt = await storage.readRefreshToken();
    } catch (e) {
      debugPrint('[Auth] refresh token read failed: $e');
      return false;
    }
    if (rt == null || rt.isEmpty) return false;

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
      try {
        await storage.saveTokens(
          data['accessToken'] as String,
          data['refreshToken'] as String,
        );
      } catch (e) {
        debugPrint('[Auth] saving refreshed tokens failed: $e');
      }
      debugPrint('[Auth] token refreshed');
      return true;
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      debugPrint('[Auth] refresh failed ($code): ${e.message}');
      try {
        await storage.clear();
      } catch (_) {}
      return false;
    } catch (e) {
      debugPrint('[Auth] refresh failed: $e');
      try {
        await storage.clear();
      } catch (_) {}
      return false;
    }
  }

  Future<Response<dynamic>> _retryWithFreshToken(RequestOptions original) async {
    String? newToken;
    try {
      newToken = await storage.readAccessToken();
    } catch (e) {
      debugPrint('[Dio] secure storage read failed on retry: $e');
      throw StateError('no token after refresh');
    }
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