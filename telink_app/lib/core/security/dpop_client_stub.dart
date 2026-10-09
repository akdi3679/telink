/// Non-web stub. DPoP is web-only in this phase.
class DpopClient {
  Future<void> ensureKey() async {}
  Future<Map<String, dynamic>?> publicJwk() async => null;
  Future<String?> signRequest({
    required String method,
    required String url,
    required String accessToken,
  }) async =>
      null;
}