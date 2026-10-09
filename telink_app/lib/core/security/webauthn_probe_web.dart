import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'webauthn_probe_result.dart';

@JS('PublicKeyCredential')
external JSAny? get _publicKeyCredential;

@JS('navigator.credentials')
external JSAny? get _navigatorCredentials;

@JS('window.isSecureContext')
external bool get _isSecureContext;

WebAuthnProbeResult probeWebAuthn() {
  bool pkc = false;
  bool creds = false;
  bool secure = false;

  try {
    pkc = _publicKeyCredential != null;
  } catch (_) {}

  try {
    creds = _navigatorCredentials != null;
  } catch (_) {}

  try {
    secure = _isSecureContext;
  } catch (_) {}

  final supported = pkc && creds && secure;

  String reason;
  if (!secure) {
    reason = 'Not a secure context. HTTPS or http://localhost required.';
  } else if (!pkc) {
    reason = 'PublicKeyCredential is not defined in this browser.';
  } else if (!creds) {
    reason = 'navigator.credentials is not defined in this browser.';
  } else {
    reason = 'WebAuthn is available. Ready to build the passkey UI.';
  }

  return WebAuthnProbeResult(
    supported: supported,
    pkcSupported: pkc,
    credentialsSupported: creds,
    secureContext: secure,
    platformAuthenticator: false,
    reason: reason,
  );
}

Future<bool> platformAuthenticatorAvailable() async {
  try {
    final pkc = _publicKeyCredential;
    if (pkc == null) return false;

    final pkcObj = pkc as JSObject;
    final method = pkcObj.getProperty(
      'isUserVerifyingPlatformAuthenticatorAvailable'.toJS,
    );
    if (method == null || !method.isA<JSFunction>()) return false;

    final promise = (method as JSFunction).callAsFunction(pkc);
    if (promise == null || !promise.isA<JSPromise>()) return false;

    final result = await (promise as JSPromise).toDart;
    if (result == null || !result.isA<JSBoolean>()) return false;

    return (result as JSBoolean).toDart;
  } catch (_) {
    return false;
  }
}