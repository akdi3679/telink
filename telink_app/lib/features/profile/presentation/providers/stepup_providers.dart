import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/stepup_repository.dart';

final stepUpRepositoryProvider = Provider<StepUpRepository>((ref) {
  return StepUpRepository(ref.read(dioClientProvider).dio);
});

final stepUpStatusProvider = FutureProvider<StepUpStatus>((ref) async {
  return ref.read(stepUpRepositoryProvider).status();
});

final securityQuestionsProvider =
    FutureProvider<List<SecurityQuestion>>((ref) async {
  return ref.read(stepUpRepositoryProvider).questions();
});