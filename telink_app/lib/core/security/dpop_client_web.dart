import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

@JS('crypto.subtle')
external JSObject get _subtle;

@JS('indexedDB')
external JSObject get _indexedDB;

@JS('crypto.randomUUID')
external String _randomUUID();

@JS('JSON.stringify')
external String _jsonStringify(JSAny? value);

const _dbName = 'telink-dpop';
const _storeName = 'keys';
const _recordId = 'current';

class DpopClient {
  JSObject? _db;
  JSObject? _privateKey;
  Map<String, dynamic>? _publicJwkCache;

  // ---- IndexedDB plumbing ----

  Future<JSObject> _openDb() async {
    if (_db != null) return _db!;
    final request = _indexedDB.callMethod<JSObject>(
      'open'.toJS,
      _dbName.toJS,
      1.toJS,
    );
    final completer = Completer<JSObject>();

    request.setProperty(
      'onupgradeneeded'.toJS,
      ((JSObject event) {
        final db = ((event.getProperty('target'.toJS) as JSObject)
            .getProperty('result'.toJS)) as JSObject;
        db.callMethod('createObjectStore'.toJS, _storeName.toJS);
      }).toJS,
    );

    request.setProperty(
      'onsuccess'.toJS,
      ((JSObject event) {
        final db = ((event.getProperty('target'.toJS) as JSObject)
            .getProperty('result'.toJS)) as JSObject;
        if (!completer.isCompleted) completer.complete(db);
      }).toJS,
    );

    request.setProperty(
      'onerror'.toJS,
      ((JSObject event) {
        if (!completer.isCompleted) {
          completer.completeError(StateError('IndexedDB open failed'));
        }
      }).toJS,
    );

    _db = await completer.future;
    return _db!;
  }

  Future<JSObject?> _loadRecord() async {
    final db = await _openDb();
    final tx = db.callMethod<JSObject>(
      'transaction'.toJS,
      _storeName.toJS,
      'readonly'.toJS,
    );
    final store = tx.callMethod<JSObject>('objectStore'.toJS, _storeName.toJS);
    final req = store.callMethod<JSObject>('get'.toJS, _recordId.toJS);

    final completer = Completer<JSObject?>();
    req.setProperty(
      'onsuccess'.toJS,
      ((JSObject event) {
        final result = ((event.getProperty('target'.toJS) as JSObject)
            .getProperty('result'.toJS));
        if (result.isUndefinedOrNull) {
          completer.complete(null);
        } else {
          completer.complete(result as JSObject);
        }
      }).toJS,
    );
    req.setProperty(
      'onerror'.toJS,
      ((JSObject event) {
        if (!completer.isCompleted) {
          completer.completeError(StateError('IndexedDB get failed'));
        }
      }).toJS,
    );
    return completer.future;
  }

  Future<void> _storeRecord(JSObject privateKey, Map<String, dynamic> publicJwk) async {
    final db = await _openDb();
    final record = <String, dynamic>{
      'privateKey': privateKey,
      'publicJwk': publicJwk,
    };
    final tx = db.callMethod<JSObject>(
      'transaction'.toJS,
      _storeName.toJS,
      'readwrite'.toJS,
    );
    final store = tx.callMethod<JSObject>('objectStore'.toJS, _storeName.toJS);
    final req = store.callMethod<JSObject>(
      'put'.toJS,
      record.jsify(),
      _recordId.toJS,
    );

    final completer = Completer<void>();
    req.setProperty(
      'onsuccess'.toJS,
      (() {
        if (!completer.isCompleted) completer.complete();
      }).toJS,
    );
    req.setProperty(
      'onerror'.toJS,
      ((JSObject event) {
        if (!completer.isCompleted) {
          completer.completeError(StateError('IndexedDB put failed'));
        }
      }).toJS,
    );
    await completer.future;
  }

  // ---- Key lifecycle ----

  Future<void> ensureKey() async {
    if (_privateKey != null && _publicJwkCache != null) return;

    final record = await _loadRecord();
    if (record != null) {
      final priv = record.getProperty('privateKey'.toJS);
      final pub = record.getProperty('publicJwk'.toJS);
      if (!priv.isUndefinedOrNull && !pub.isUndefinedOrNull) {
        _privateKey = priv as JSObject;
        final decoded = jsonDecode(_jsonStringify(pub as JSAny)) as Map<String, dynamic>;
        _publicJwkCache = decoded;
        return;
      }
    }

    await _generateAndStore();
  }

  Future<void> _generateAndStore() async {
    // 1. Generate extractable keypair (needed to export public JWK).
    final keyPair = await _subtle
        .callMethod<JSPromise>(
          'generateKey'.toJS,
          (<String, dynamic>{'name': 'ECDSA', 'namedCurve': 'P-256'}).jsify(),
          true.toJS,
          <String>['sign', 'verify'].jsify(),
        )
        .toDart as JSObject;

    final publicKey = keyPair.getProperty('publicKey'.toJS) as JSObject;
    final privateKey = keyPair.getProperty('privateKey'.toJS) as JSObject;

    // 2. Export public JWK (safe to store).
    final pubJwkJs = await _subtle
        .callMethod<JSPromise>('exportKey'.toJS, 'jwk'.toJS, publicKey)
        .toDart as JSObject;
    final pubJwk = jsonDecode(_jsonStringify(pubJwkJs)) as Map<String, dynamic>;

    // 3. Re-import private as NON-extractable so the raw bytes never
    //    leave the browser's crypto subsystem afterwards.
    final privJwkJs = await _subtle
        .callMethod<JSPromise>('exportKey'.toJS, 'jwk'.toJS, privateKey)
        .toDart as JSObject;

    final nonExtractable = await _subtle
        .callMethodVarArgs<JSPromise>(
          'importKey'.toJS,
          <JSAny?>[
            'jwk'.toJS,
            privJwkJs,
            (<String, dynamic>{'name': 'ECDSA', 'namedCurve': 'P-256'})
                .jsify(),
            false.toJS,
            <String>['sign'].jsify(),
          ],
        )
        .toDart as JSObject;

    // 4. Store the non-extractable handle + public JWK.
    await _storeRecord(nonExtractable, pubJwk);
    _privateKey = nonExtractable;
    _publicJwkCache = pubJwk;
  }

  Future<Map<String, dynamic>?> publicJwk() async {
    await ensureKey();
    return _publicJwkCache;
  }

  // ---- Request signing ----

  Future<String?> signRequest({
    required String method,
    required String url,
    required String accessToken,
  }) async {
    await ensureKey();
    final priv = _privateKey;
    final pub = _publicJwkCache;
    if (priv == null || pub == null) return null;

    // Header
    final headerB64 = _b64uString(
      jsonEncode({'typ': 'dpop+jwt', 'alg': 'ES256', 'jwk': pub}),
    );

    // ath = base64url(SHA-256(accessToken))
    final tokenBytes = Uint8List.fromList(utf8.encode(accessToken));
    final hashBufJs = await _subtle
        .callMethod<JSPromise>('digest'.toJS, 'SHA-256'.toJS, tokenBytes.buffer.toJS)
        .toDart as JSObject;
    final ath = _b64u((hashBufJs as JSArrayBuffer).toDart.asUint8List());

    // Payload
    final payloadB64 = _b64uString(jsonEncode({
      'htm': method,
      'htu': url,
      'iat': DateTime.now().millisecondsSinceEpoch ~/ 1000,
      'jti': _randomUUID(),
      'ath': ath,
    }));

    // Sign
    final signingInput = '$headerB64.$payloadB64';
    final signingBytes = Uint8List.fromList(utf8.encode(signingInput));
    final sigBufJs = await _subtle
        .callMethod<JSPromise>(
          'sign'.toJS,
          (<String, dynamic>{'name': 'ECDSA', 'hash': 'SHA-256'}).jsify(),
          priv,
          signingBytes.buffer.toJS,
        )
        .toDart as JSObject;
    final sigB64 = _b64u((sigBufJs as JSArrayBuffer).toDart.asUint8List());

    return '$signingInput.$sigB64';
  }

  // ---- Helpers ----

  String _b64u(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  String _b64uString(String s) => _b64u(utf8.encode(s));
}