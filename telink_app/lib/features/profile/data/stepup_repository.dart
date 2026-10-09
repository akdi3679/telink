import 'package:dio/dio.dart';

class StepUpStatus {
  final bool hasQuestions;
  final int questionCount;
  final bool elevated;
  final DateTime? elevatedExpiresAt;
  final bool enforced;

  const StepUpStatus({
    required this.hasQuestions,
    required this.questionCount,
    required this.elevated,
    this.elevatedExpiresAt,
    required this.enforced,
  });

  factory StepUpStatus.fromJson(Map<String, dynamic> j) => StepUpStatus(
        hasQuestions: j['hasQuestions'] as bool? ?? false,
        questionCount: j['questionCount'] as int? ?? 0,
        elevated: j['elevated'] as bool? ?? false,
        elevatedExpiresAt: j['elevatedExpiresAt'] == null
            ? null
            : DateTime.parse(j['elevatedExpiresAt'] as String),
        enforced: j['enforced'] as bool? ?? false,
      );
}

class SecurityQuestion {
  final String id;
  final String questionKey;
  final String? questionText;
  const SecurityQuestion({
    required this.id,
    required this.questionKey,
    this.questionText,
  });

  factory SecurityQuestion.fromJson(Map<String, dynamic> j) => SecurityQuestion(
        id: j['id'] as String,
        questionKey: j['questionKey'] as String,
        questionText: j['questionText'] as String?,
      );
}

class StepUpRepository {
  final Dio _dio;
  StepUpRepository(this._dio);

  Future<StepUpStatus> status() async {
    final res = await _dio.get('/auth/stepup/status');
    return StepUpStatus.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<List<SecurityQuestion>> questions() async {
    final res = await _dio.get('/auth/stepup/questions');
    final list = (res.data as List).cast<Map<String, dynamic>>();
    return list.map(SecurityQuestion.fromJson).toList();
  }

  Future<void> enroll(List<Map<String, dynamic>> questions) async {
    await _dio.post('/auth/stepup/questions/enroll', data: {
      'questions': questions,
    });
  }

  Future<DateTime> verify(List<Map<String, String>> answers) async {
    final res = await _dio.post('/auth/stepup/verify', data: {
      'answers': answers,
    });
    final data = (res.data as Map).cast<String, dynamic>();
    return DateTime.parse(data['expiresAt'] as String);
  }

  Future<void> recordBiometric() async {
    await _dio.post('/auth/stepup/biometric');
  }

  Future<void> clear() async {
    await _dio.post('/auth/stepup/clear');
  }
}