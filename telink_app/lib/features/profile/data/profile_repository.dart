import 'package:dio/dio.dart';
import '../../auth/data/models/user_model.dart';

class ProfileRepository {
  final Dio _dio;
  ProfileRepository(this._dio);

  Future<AuthResult> getMe() async {
    final res = await _dio.get('/users/me');
    final data = (res.data as Map).cast<String, dynamic>();
    return AuthResult(
      user: User.fromJson((data['user'] as Map).cast<String, dynamic>()),
      profile: data['profile'] == null
          ? null
          : Profile.fromJson((data['profile'] as Map).cast<String, dynamic>()),
    );
  }

  Future<Profile> update(Map<String, dynamic> patch) async {
    final res = await _dio.patch('/users/me', data: patch);
    final data = (res.data as Map).cast<String, dynamic>();
    return Profile.fromJson((data['profile'] as Map).cast<String, dynamic>());
  }
}