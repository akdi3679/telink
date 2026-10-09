import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/pages/splash_page.dart';
import '../../features/auth/presentation/pages/welcome_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/signup_start_page.dart';
import '../../features/auth/presentation/pages/signup_otp_page.dart';
import '../../features/auth/presentation/pages/signup_password_page.dart';
import '../../features/auth/presentation/pages/signup_profile_page.dart';
import '../../features/profile/presentation/pages/profile_edit_page.dart';
import '../../features/profile/presentation/pages/passkeys_page.dart';
import '../../features/profile/presentation/pages/recovery_codes_page.dart';
import '../../features/profile/presentation/pages/bio_verification_page.dart';
import '../../features/profile/presentation/pages/security_questions_page.dart';
import '../../features/profile/presentation/pages/security_overview_page.dart';
import '../../features/profile/presentation/pages/login_history_page.dart';
import '../../features/debug/webauthn_check_page.dart';
import '../../shared/widgets/main_shell.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import 'routes.dart';

class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen(authProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loc = state.matchedLocation;

      // While auth is still resolving, stay on splash and don't decide yet.
      if (auth.isLoading) {
        return loc == Routes.splash ? null : Routes.splash;
      }

      final isLoggedIn = auth.valueOrNull != null;
      final isPublic = loc == Routes.splash ||
          loc == Routes.welcome ||
          loc == Routes.login ||
          loc == Routes.forgotPassword ||
          loc.startsWith('/signup') ||
          loc == Routes.debugWebauthn;

      // Splash should never be left if we can decide.
      if (loc == Routes.splash) {
        return isLoggedIn ? Routes.home : Routes.welcome;
      }

      if (!isLoggedIn && !isPublic) return Routes.welcome;
      if (isLoggedIn && isPublic && loc != Routes.debugWebauthn) {
        return Routes.home;
      }
      return null;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, __) => const SplashPage()),
      GoRoute(path: Routes.welcome, builder: (_, __) => const WelcomePage()),
      GoRoute(path: Routes.login, builder: (_, __) => const LoginPage()),
      GoRoute(
          path: Routes.forgotPassword,
          builder: (_, __) => const ForgotPasswordPage()),
      GoRoute(
          path: Routes.signupStart,
          builder: (_, __) => const SignupStartPage()),
      GoRoute(
          path: Routes.signupOtp, builder: (_, __) => const SignupOtpPage()),
      GoRoute(
          path: Routes.signupPassword,
          builder: (_, __) => const SignupPasswordPage()),
      GoRoute(
          path: Routes.signupProfile,
          builder: (_, __) => const SignupProfilePage()),
      GoRoute(path: Routes.home, builder: (_, __) => const MainShell()),
      GoRoute(
          path: Routes.profileEdit,
          builder: (_, __) => const ProfileEditPage()),
      GoRoute(
          path: Routes.profilePasskeys,
          builder: (_, __) => const PasskeysPage()),
      GoRoute(
          path: Routes.profileRecovery,
          builder: (_, __) => const RecoveryCodesPage()),
      GoRoute(
          path: Routes.profileBioVerification,
          builder: (_, __) => const BioVerificationPage()),
      GoRoute(
          path: Routes.profileSecurityQuestions,
          builder: (_, __) => const SecurityQuestionsPage()),
      GoRoute(
          path: Routes.profileSecurityOverview,
          builder: (_, __) => const SecurityOverviewPage()),
      GoRoute(
          path: Routes.profileLoginHistory,
          builder: (_, __) => const LoginHistoryPage()),
      GoRoute(
          path: Routes.debugWebauthn,
          builder: (_, __) => const WebAuthnCheckPage()),
    ],
    errorBuilder: (context, state) => const SplashPage(),
  );
});