class WebAuthnProbeResult {
  final bool supported;
  final bool pkcSupported;
  final bool credentialsSupported;
  final bool secureContext;
  final bool platformAuthenticator;
  final String reason;

  const WebAuthnProbeResult({
    required this.supported,
    required this.pkcSupported,
    required this.credentialsSupported,
    required this.secureContext,
    required this.platformAuthenticator,
    required this.reason,
  });

  static const notSupportedNonWeb = WebAuthnProbeResult(
    supported: false,
    pkcSupported: false,
    credentialsSupported: false,
    secureContext: false,
    platformAuthenticator: false,
    reason: 'WebAuthn is only available in web browsers',
  );
}