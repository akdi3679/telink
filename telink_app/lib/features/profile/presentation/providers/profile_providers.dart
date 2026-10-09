import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/data/models/user_model.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioClientProvider).dio);
});

/// Own full profile (user + profile row), refetched on invalidate.
final myProfileProvider = FutureProvider<AuthResult>((ref) async {
  return ref.read(profileRepositoryProvider).getMe();
});