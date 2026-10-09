import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/stepup_providers.dart';
import 'widgets/stepup_verify_dialog.dart';

/// Ensures the current session is elevated before running a high-risk
/// action. If not elevated, prompts for 2 security questions first.
///
/// Returns true if the action should proceed, false otherwise.
Future<bool> requireStepUp(BuildContext context, WidgetRef ref) async {
  try {
    final status = await ref.read(stepUpStatusProvider.future);
    if (status.elevated) return true;
    if (!status.hasQuestions) {
      if (!context.mounted) return false;
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.warning_amber, size: 32),
          title: const Text('Security questions not set up'),
          content: const Text(
            'Set up your 3 security questions first. Go to '
            'Profile -> Security -> Bio Verification -> Security Questions.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return false;
    }
    if (!context.mounted) return false;
    return showStepUpVerifyDialog(context, ref);
  } catch (e) {
    return false;
  }
}