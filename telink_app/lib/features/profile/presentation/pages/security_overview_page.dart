import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/stepup_providers.dart';

class SecurityOverviewPage extends ConsumerWidget {
  const SecurityOverviewPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(stepUpStatusProvider).valueOrNull;
    final hasQuestions = status?.hasQuestions ?? false;

    final rows = <_Row>[
      const _Row(
        icon: Icons.lock_outline,
        label: 'Password',
        status: 'Strong (Argon2id)',
        good: true,
      ),
      const _Row(
        icon: Icons.fingerprint,
        label: 'Device biometric',
        status: 'Available',
        good: true,
      ),
      _Row(
        icon: Icons.help_outline,
        label: 'Security questions',
        status: hasQuestions ? 'Enrolled' : 'Not set up',
        good: hasQuestions,
      ),
      const _Row(
        icon: Icons.vpn_key_outlined,
        label: 'Passkeys',
        status: 'Available',
        good: true,
      ),
      const _Row(
        icon: Icons.shield_outlined,
        label: 'Recovery codes',
        status: 'Available',
        good: true,
      ),
      const _Row(
        icon: Icons.verified_user_outlined,
        label: 'DPoP device trust',
        status: 'Enabled',
        good: true,
      ),
      const _Row(
        icon: Icons.public,
        label: 'IP-based geolocation',
        status: 'Enabled',
        good: true,
      ),
      const _Row(
        icon: Icons.travel_explore,
        label: 'Impossible travel detection',
        status: 'Enabled',
        good: true,
      ),
      const _Row(
        icon: Icons.mail_outline,
        label: 'Login alerts',
        status: 'Enabled',
        good: true,
      ),
      const _Row(
        icon: Icons.lock_clock,
        label: 'Account lockout',
        status: 'Enabled',
        good: true,
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Security overview')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'A snapshot of everything protecting your account right now.',
              ),
            ),
          ),
          const SizedBox(height: 12),
          ...rows.map(
            (r) => Card(
              child: ListTile(
                leading: Icon(
                  r.icon,
                  color: r.good ? Colors.green : Colors.orange,
                ),
                title: Text(r.label),
                subtitle: Text(r.status),
                trailing: Icon(
                  r.good ? Icons.check_circle : Icons.warning_amber,
                  color: r.good ? Colors.green : Colors.orange,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Row {
  final IconData icon;
  final String label;
  final String status;
  final bool good;
  const _Row({
    required this.icon,
    required this.label,
    required this.status,
    required this.good,
  });
}