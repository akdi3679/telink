import 'package:flutter/material.dart';

class TwoFactorPage extends StatelessWidget {
  const TwoFactorPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Two-factor authentication')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Icon(Icons.security, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 16),
          Text(
            'Two-factor authentication',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Text(
            'We support two ways to secure your account:',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          const _OptionCard(
            icon: Icons.vpn_key_outlined,
            title: 'Passkeys',
            subtitle: 'Fingerprint, Face ID, or security key',
            status: 'Available',
            statusColor: Colors.green,
          ),
          const SizedBox(height: 12),
          const _OptionCard(
            icon: Icons.help_outline,
            title: 'Security questions',
            subtitle: 'For step-up verification on high-risk actions',
            status: 'Available',
            statusColor: Colors.green,
          ),
          const SizedBox(height: 12),
          const _OptionCard(
            icon: Icons.qr_code_scanner,
            title: 'Authenticator app (TOTP)',
            subtitle: 'Requires an external app like Google Authenticator',
            status: 'Not planned',
            statusColor: Colors.orange,
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'We do not currently offer TOTP because it requires an external '
                'authenticator app. Passkeys and security questions provide '
                'equivalent or stronger protection without any external app.',
                style: theme.textTheme.bodySmall,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String status;
  final Color statusColor;
  const _OptionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.status,
    required this.statusColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            status,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: statusColor,
            ),
          ),
        ),
      ),
    );
  }
}