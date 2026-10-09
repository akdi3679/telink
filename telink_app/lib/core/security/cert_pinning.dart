import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Certificate pinning configuration for the API client.
///
/// On web, the browser handles TLS. Nothing to do here.
/// On mobile, we pin the leaf certificate's SHA-256 fingerprint.
///
/// To update the pins:
///   1. Get the new leaf cert from the server
///   2. openssl x509 -in cert.pem -noout -fingerprint -sha256
///   3. Paste the hex (no colons) into the list below
///   4. Always keep at least 2 pins (current + next) so rotation is graceful
class CertPinning {
  /// SHA-256 fingerprints of the leaf certificates. Add real ones in Phase 16.
  static const List<String> allowedSha256 = <String>[
    // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',  // example, replace later
  ];

  /// Returns an interceptor that verifies the server certificate.
  ///
  /// In dev or web, returns a no-op interceptor.
  static Interceptor? build() {
    if (kIsWeb) return null;
    if (kDebugMode) return null; // don't pin in dev
    if (allowedSha256.isEmpty) return null; // nothing configured yet

    return InterceptorsWrapper(
      onResponse: (response, handler) {
        // In a full implementation this would inspect the X.509 chain.
        // Dio does not expose the certificate by default; a native
        // transport with onBadCertificate would be needed.
        // We keep this placeholder so the config surface is present.
        handler.next(response);
      },
    );
  }
}