import 'package:dio/dio.dart';

class PasskeyRecord {
  final String id;
  final String? name;
  final String? aaguid;
  final DateTime createdAt;
  final DateTime? lastUsedAt;

  const PasskeyRecord({
    required this.id,
    this.name,
    this.aaguid,
    required this.createdAt,
    this.lastUsedAt,
  });

  factory PasskeyRecord.fromJson(Map<String, dynamic> j) => PasskeyRecord(
        id: j['id'] as String,
        name: j['name'] as String?,
        aaguid: j['aaguid'] as String?,
        createdAt: DateTime.parse(j['createdAt'] as String),
        lastUsedAt: j['lastUsedAt'] == null
            ? null
            : DateTime.parse(j['lastUsedAt'] as String),
      );
}

class PasskeyRepository {
  final Dio _dio;
  PasskeyRepository(this._dio);

  Future<List<PasskeyRecord>> list() async {
    final res = await _dio.get('/auth/passkey');
    final list = (res.data as List).cast<Map<String, dynamic>>();
    return list.map(PasskeyRecord.fromJson).toList();
  }

  Future<Map<String, dynamic>> beginRegistration(String? name) async {
    final res = await _dio.post(
      '/auth/passkey/register/begin',
      data: {if (name != null) 'name': name},
    );
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<void> finishRegistration(Map<String, dynamic> response) async {
    await _dio.post(
      '/auth/passkey/register/finish',
      data: {'response': response},
    );
  }

  Future<void> delete(String id) async {
    await _dio.delete('/auth/passkey/$id');
  }
}