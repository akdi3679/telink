import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:telink_app/features/auth/presentation/pages/welcome_page.dart';
import 'package:telink_app/core/routing/routes.dart';

void main() {
  testWidgets('WelcomePage shows primary and secondary CTAs', (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const WelcomePage()),
        GoRoute(path: Routes.signupStart, builder: (_, __) => const SizedBox()),
        GoRoute(path: Routes.login, builder: (_, __) => const SizedBox()),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Telink'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
    expect(find.text('I already have an account'), findsOneWidget);
  });
}