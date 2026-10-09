import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/routing/routes.dart';
import '../../../auth/data/models/user_model.dart';
import '../providers/profile_providers.dart';

class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myProfileProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 12),
                Text('Could not load profile.\n$e',
                    textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(myProfileProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (result) => _ProfileBody(result: result),
      ),
    );
  }
}

class _ProfileBody extends StatelessWidget {
  final AuthResult result;
  const _ProfileBody({required this.result});

  @override
  Widget build(BuildContext context) {
    final p = result.profile;
    final u = result.user;
    final theme = Theme.of(context);

    final name = p == null || (p.firstName.isEmpty && p.lastName.isEmpty)
        ? u.phone
        : '${p.firstName} ${p.lastName}'.trim();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 40,
              backgroundColor: theme.colorScheme.primaryContainer,
              backgroundImage:
                  (p?.photoUrl != null && p!.photoUrl!.isNotEmpty)
                      ? NetworkImage(p.photoUrl!)
                      : null,
              child: (p?.photoUrl == null || p!.photoUrl!.isEmpty)
                  ? Text(
                      _initials(name),
                      style: const TextStyle(
                          fontSize: 24, fontWeight: FontWeight.w600),
                    )
                  : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  if (p?.headline != null && p!.headline!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(p.headline!,
                          style: theme.textTheme.bodyMedium),
                    ),
                  if (p?.jobTitle != null && p!.jobTitle.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '${p.jobTitle}${p.workCompany != null && p.workCompany!.isNotEmpty ? ' at ${p.workCompany}' : ''}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (p?.bio != null && p!.bio!.isNotEmpty) ...[
          Text('About', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(p.bio!),
          const SizedBox(height: 16),
        ],
        Card(
          child: Column(
            children: [
              _row(context, Icons.email_outlined, 'Email', u.email),
              _row(context, Icons.phone_outlined, 'Phone', u.phone),
              if (p?.city != null && p!.city!.isNotEmpty)
                _row(context, Icons.location_city_outlined, 'City', p.city!),
              if (p?.country != null && p!.country!.isNotEmpty)
                _row(context, Icons.public, 'Country', p.country!),
              _row(context, Icons.badge_outlined, 'Role', p?.role ?? '—'),
            ],
          ),
        ),
        if (p?.languages != null && p!.languages.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Languages', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children:
                p.languages.map((l) => Chip(label: Text(l))).toList(),
          ),
        ],
        if (p?.categories != null && p!.categories.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Categories', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children:
                p.categories.map((c) => Chip(label: Text(c))).toList(),
          ),
        ],
        const SizedBox(height: 24),
               Text('Security', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.verified_user_outlined),
            title: const Text('Bio Verification'),
            subtitle: const Text('Face, hand, biometrics, security questions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profileBioVerification),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.help_outline),
            title: const Text('Security questions'),
            subtitle: const Text('Used to confirm high-risk actions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profileSecurityQuestions),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.vpn_key_outlined),
            title: const Text('Passkeys'),
            subtitle: const Text('Sign in without a password'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profilePasskeys),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.shield_outlined),
            title: const Text('Recovery codes'),
            subtitle: const Text('Backup access if you lose your password and passkey'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profileRecovery),
          ),
        ),
                const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.history_outlined),
            title: const Text('Login activity'),
            subtitle: const Text('Recent sign-ins and attempts'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profileLoginHistory),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.checklist_outlined),
            title: const Text('Security overview'),
            subtitle: const Text('See everything protecting your account'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profileSecurityOverview),
          ),
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () => context.push(Routes.profileEdit),
          icon: const Icon(Icons.edit_outlined),
          label: const Text('Edit profile'),
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
        ),
      ],
    );
  }

  static Widget _row(BuildContext context, IconData icon, String label,
      String value) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
      subtitle: Text(value),
      dense: true,
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }
}