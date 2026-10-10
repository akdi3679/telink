import 'package:dio/dio.dart';

class SessionRow {
  final String id;
  final String? deviceId;
  final String? ip;
  final String? userAgent;
  final String? geoCity;
  final String? geoCountry;
  final DateTime createdAt;
  final DateTime lastSeenAt;
  final bool isCurrent;

  const SessionRow({
    required this.id,
    this.deviceId,
    this.ip,
    this.userAgent,
    this.geoCity,
    this.geoCountry,
    required this.createdAt,
    required this.lastSeenAt,
    required this.isCurrent,
  });

  factory SessionRow.fromJson(Map<String, dynamic> j) => SessionRow(
        id: j['id'] as String,
        deviceId: j['deviceId'] as String?,
        ip: j['ip'] as String?,
        userAgent: j['userAgent'] as String?,
        geoCity: j['geoCity'] as String?,
        geoCountry: j['geoCountry'] as String?,
        createdAt: DateTime.parse(j['createdAt'] as String),
        lastSeenAt: DateTime.parse(j['lastSeenAt'] as String),
        isCurrent: j['isCurrent'] as bool? ?? false,
      );
}

class SessionsRepository {
  final Dio _dio;
  SessionsRepository(this._dio);

  Future<List<SessionRow>> list() async {
    final res = await _dio.get('/auth/sessions');
    final list = (res.data as List).cast<Map<String, dynamic>>();
    return list.map(SessionRow.fromJson).toList();
  }

  Future<void> revoke(String id) async {
    await _dio.delete('/auth/sessions/$id');
  }

  Future<int> revokeOthers() async {
    final res = await _dio.delete('/auth/sessions');
    final data = (res.data as Map).cast<String, dynamic>();
    return data['revoked'] as int? ?? 0;
  }
}