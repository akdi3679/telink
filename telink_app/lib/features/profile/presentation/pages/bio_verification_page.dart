import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/routing/routes.dart';
import '../providers/stepup_providers.dart';
import '../widgets/coming_soon_sheet.dart';

class BioVerificationPage extends ConsumerWidget {
  const BioVerificationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(stepUpStatusProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Bio Verification')),
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
                Text('Could not load.\n$e', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(stepUpStatusProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (status) => _Body(status: status),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final dynamic status;
  const _Body({required this.status});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final hasQuestions = status.hasQuestions as bool;
    final elevated = status.elevated as bool;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (elevated)
          Card(
            color: Colors.green.shade50,
            child: const ListTile(
              leading: Icon(Icons.check_circle, color: Colors.green),
              title: Text('Session elevated'),
              subtitle: Text('High-risk actions are unlocked for 5 minutes.'),
            ),
          ),
        if (elevated) const SizedBox(height: 12),

        const _SectionHeader(
          icon: Icons.verified_outlined,
          title: 'Available now',
        ),
        const _RealCard(
          icon: Icons.fingerprint,
          title: 'Device biometric',
          subtitle: kIsWeb
              ? 'Use your fingerprint or face when this browser asks'
              : 'Use Face ID, fingerprint, or Windows Hello',
          trailing: Icon(Icons.check, color: Colors.green),
        ),
        const SizedBox(height: 8),
        _RealCard(
          icon: Icons.help_outline,
          title: 'Security questions',
          subtitle: hasQuestions
              ? '3 questions set up. Used for high-risk actions.'
              : 'Not set up yet. Tap to enroll.',
          trailing: hasQuestions
              ? const Icon(Icons.check, color: Colors.green)
              : const Icon(Icons.arrow_forward_ios, size: 14),
          onTap: () => context.push(Routes.profileSecurityQuestions),
        ),
        const SizedBox(height: 24),

        const _SectionHeader(
          icon: Icons.upcoming_outlined,
          title: 'Coming soon (on mobile)',
        ),
        _MockCard(
          icon: Icons.pan_tool_outlined,
          title: 'Hand palmprint',
          subtitle: 'Palmprint scan + liveness via MediaPipe',
          onTap: () => ComingSoonSheet.show(
            context,
            const ComingSoonSheet(
              icon: Icons.pan_tool_outlined,
              title: 'Hand palmprint',
              status: 'Planned - mobile build',
              shortDescription:
                  'Verify your identity by scanning your palm. Runs entirely on your phone.',
              howItWorks: [
                'Camera detects your hand and 21 landmarks',
                'Palm region is cropped and normalized',
                'Unique palmprint texture is extracted',
                'Compared to your enrolled palmprint',
                'Liveness check confirms it is a real hand',
              ],
              whatWeUse: [
                'MediaPipe Hand Landmarker (Google, open source)',
                'OpenCV for image processing',
                'On-device matching - no server',
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        _MockCard(
          icon: Icons.face_outlined,
          title: 'Face liveness',
          subtitle: 'Proves a live human, not a photo',
          onTap: () => ComingSoonSheet.show(
            context,
            const ComingSoonSheet(
              icon: Icons.face_outlined,
              title: 'Face liveness',
              status: 'Planned - mobile build',
              shortDescription:
                  'Confirms that the person in front of the camera is a real, live human.',
              howItWorks: [
                'Screen flashes light patterns on the face',
                'Camera captures the response of the skin',
                'Signals: texture, color response, micro-movements',
                'Rejects photos, screens, masks, or dummies',
              ],
              whatWeUse: [
                'MediaPipe Face Mesh (Google, open source)',
                'The user-designed light-pattern technique',
                'On-device - no data leaves the phone',
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        _MockCard(
          icon: Icons.waves,
          title: 'Vein mode (experimental)',
          subtitle: 'Test on device: red-light vein imaging',
          onTap: () => ComingSoonSheet.show(
            context,
            const ComingSoonSheet(
              icon: Icons.waves,
              title: 'Vein mode',
              status: 'Experimental - will be tested on real phones',
              shortDescription:
                  'Uses controlled colored light to reveal blood vessels under the skin.',
              howItWorks: [
                'Screen emits specific colors',
                'Hemoglobin absorbs blue/green and reflects red',
                'Camera captures the difference',
                'Vein-like pattern is enhanced with filters',
                'Only useful on phones with weak IR filters',
              ],
              whatWeUse: [
                'Screen as a controlled light source',
                'OpenCV: CLAHE, Gabor filters, line extraction',
                'Honest limitation: not all phones can do this',
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        _MockCard(
          icon: Icons.remove_red_eye_outlined,
          title: 'Iris scan',
          subtitle: 'Advanced - requires quality camera',
          onTap: () => ComingSoonSheet.show(
            context,
            const ComingSoonSheet(
              icon: Icons.remove_red_eye_outlined,
              title: 'Iris scan',
              status: 'Experimental - accuracy depends on device',
              shortDescription:
                  'Reads the unique pattern of the iris in the eye.',
              howItWorks: [
                'Camera focuses on the iris',
                'Iris boundaries are detected',
                'Pattern is extracted and matched',
                'Liveness check via pupil response to light',
              ],
              whatWeUse: [
                'worldcoin/open-iris (open source)',
                'MediaPipe eye tracking for guidance',
                'Note: real banks use NIR cameras. Phone cameras are RGB.',
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        const _SectionHeader(
          icon: Icons.info_outline,
          title: 'How this protects you',
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Each layer is an independent proof that you are the original '
              'account owner. No single layer is 100%, but combined they '
              'make impersonation practically impossible.',
              style: theme.textTheme.bodyMedium,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionHeader({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Text(title,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _RealCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  const _RealCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: trailing ?? (onTap != null ? const Icon(Icons.chevron_right) : null),
        onTap: onTap,
      ),
    );
  }
}

class _MockCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _MockCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
      child: ListTile(
        leading: Icon(icon, color: theme.colorScheme.onSurfaceVariant),
        title: Row(
          children: [
            Flexible(child: Text(title)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.amber.shade100,
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text('Soon',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.info_outline, size: 18),
        onTap: onTap,
      ),
    );
  }
}