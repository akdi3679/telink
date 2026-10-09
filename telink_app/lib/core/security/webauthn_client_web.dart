import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS('JSON.parse')
external JSAny? _jsonParse(String text);

@JS('JSON.stringify')
external String _jsonStringify(JSAny? value);

@JS('PublicKeyCredential.parseCreationOptionsFromJSON')
external JSObject? _parseCreationOptions(JSObject json);

@JS('PublicKeyCredential.parseRequestOptionsFromJSON')
external JSObject? _parseRequestOptions(JSObject json);

@JS('navigator.credentials.create')
external JSPromise<JSObject?> _credentialsCreate(JSObject options);

@JS('navigator.credentials.get')
external JSPromise<JSObject?> _credentialsGet(JSObject options);

class WebAuthnClient {
  /// Runs the WebAuthn creation ceremony.
  /// `options` is the JSON object returned by /auth/passkey/register/begin.
  /// Returns the RegistrationResponseJSON expected by the backend.
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) async {
    final jsOptions = _jsonParse(jsonEncode(options)) as JSObject;
    final parsed = _parseCreationOptions(jsOptions);
    if (parsed == null) {
      throw StateError('Could not parse creation options');
    }

    final wrapper = JSObject();
    wrapper.setProperty('publicKey'.toJS, parsed);

    final JSObject? credential;
    try {
      credential = await _credentialsCreate(wrapper).toDart;
    } catch (e) {
      throw StateError('WebAuthn registration failed: $e');
    }
    if (credential == null) {
      throw StateError('WebAuthn registration was cancelled');
    }

    final json = credential.callMethod<JSObject>('toJSON'.toJS);
    final jsonStr = _jsonStringify(json);
    return jsonDecode(jsonStr) as Map<String, dynamic>;
  }

  /// Runs the WebAuthn assertion ceremony.
  /// `options` is the JSON object returned by /auth/passkey/login/begin.
  /// Returns the AuthenticationResponseJSON expected by the backend.
  Future<Map<String, dynamic>> login(Map<String, dynamic> options) async {
    final jsOptions = _jsonParse(jsonEncode(options)) as JSObject;
    final parsed = _parseRequestOptions(jsOptions);
    if (parsed == null) {
      throw StateError('Could not parse request options');
    }

    final wrapper = JSObject();
    wrapper.setProperty('publicKey'.toJS, parsed);

    final JSObject? credential;
    try {
      credential = await _credentialsGet(wrapper).toDart;
    } catch (e) {
      throw StateError('WebAuthn sign-in failed: $e');
    }
    if (credential == null) {
      throw StateError('WebAuthn sign-in was cancelled');
    }

    final json = credential.callMethod<JSObject>('toJSON'.toJS);
    final jsonStr = _jsonStringify(json);
    return jsonDecode(jsonStr) as Map<String, dynamic>;
  }
}