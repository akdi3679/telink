import 'package:flutter/material.dart';

/// Bottom sheet used by the mock feature cards in Bio Verification.
/// Explains the feature, its status, and the plan. Never fakes a feature.
class ComingSoonSheet extends StatelessWidget {
  final IconData icon;
  final String title;
  final String shortDescription;
  final List<String> howItWorks;
  final List<String> whatWeUse;
  final String status;

  const ComingSoonSheet({
    super.key,
    required this.icon,
    required this.title,
    required this.shortDescription,
    required this.howItWorks,
    required this.whatWeUse,
    required this.status,
  });

  static Future<void> show(BuildContext context, ComingSoonSheet sheet) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => sheet,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        children: [
          Row(
            children: [
              Icon(icon, size: 32, color: theme.colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title,
                    style: theme.textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Chip(
            label: Text(status, style: const TextStyle(fontSize: 12)),
            backgroundColor: Colors.amber.shade100,
            side: BorderSide.none,
          ),
          const SizedBox(height: 16),
          Text(shortDescription, style: theme.textTheme.bodyLarge),
          const SizedBox(height: 24),
          _section(context, 'How it will work', howItWorks),
          const SizedBox(height: 20),
          _section(context, 'Tools we will use', whatWeUse),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'This feature is planned for the mobile build. '
              'Everything runs on your device. No data leaves your phone.',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(BuildContext context, String title, List<String> items) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        ...items.map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Icon(Icons.circle, size: 6),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(s)),
                ],
              ),
            )),
      ],
    );
  }
}