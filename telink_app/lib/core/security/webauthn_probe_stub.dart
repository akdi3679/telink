import 'webauthn_probe_result.dart';

/// Non-web implementation. Always returns "not supported".
WebAuthnProbeResult probeWebAuthn() {
  return WebAuthnProbeResult.notSupportedNonWeb;
}

/// Non-web. Always returns false.
Future<bool> platformAuthenticatorAvailable() async => false;