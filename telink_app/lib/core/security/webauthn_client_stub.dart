/// Non-web stub. Passkey registration is web-only in this phase.
class WebAuthnClient {
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) {
    throw UnsupportedError('Passkeys are only supported on the web build');
  }

  Future<Map<String, dynamic>> login(Map<String, dynamic> options) {
    throw UnsupportedError('Passkeys are only supported on the web build');
  }
}