import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/stepup_providers.dart';

/// Modal that asks the user to verify with 2 of their 3 security questions.
/// Returns `true` if elevated, `false` if cancelled.
Future<bool> showStepUpVerifyDialog(BuildContext context, WidgetRef ref) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _StepUpVerifyDialog(),
  );
  return result == true;
}

class _StepUpVerifyDialog extends ConsumerStatefulWidget {
  const _StepUpVerifyDialog();

  @override
  ConsumerState<_StepUpVerifyDialog> createState() =>
      _StepUpVerifyDialogState();
}

class _StepUpVerifyDialogState extends ConsumerState<_StepUpVerifyDialog> {
  final _answers = <String, TextEditingController>{};
  bool _loading = false;
  String? _error;
  List<dynamic>? _questions;

  @override
  void dispose() {
    for (final c in _answers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    if (_questions != null) return;
    try {
      final qs = await ref.read(securityQuestionsProvider.future);
      setState(() {
        _questions = qs;
        for (final q in qs) {
          _answers[q.id] = TextEditingController();
        }
      });
    } catch (e) {
      setState(() => _error = 'Could not load questions');
    }
  }

  Future<void> _submit() async {
    if (_questions == null) return;
    final answered = _questions!
        .where((q) => (_answers[q.id]?.text ?? '').trim().isNotEmpty)
        .toList();
    if (answered.length < 2) {
      setState(() => _error = 'Answer at least 2 questions');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final answers = answered
          .take(2)
          .map((q) => {
                'questionId': q.id as String,
                'answer': _answers[q.id]!.text.trim(),
              })
          .toList();
      await ref.read(stepUpRepositoryProvider).verify(answers);
      ref.invalidate(stepUpStatusProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = 'One or more answers are incorrect');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    final theme = Theme.of(context);

    return AlertDialog(
      icon: const Icon(Icons.verified_user_outlined, size: 32),
      title: const Text('Confirm it is you'),
      content: SizedBox(
        width: 400,
        child: _questions == null
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Answer at least 2 of your security questions to unlock this action for 5 minutes.',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    ...(_questions!.asMap().entries.map((entry) {
                      final q = entry.value;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: TextField(
                          controller: _answers[q.id],
                          enabled: !_loading,
                          decoration: InputDecoration(
                            labelText: q.questionText ?? q.questionKey,
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      );
                    })),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: TextStyle(color: theme.colorScheme.error)),
                    ],
                  ],
                ),
              ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Verify'),
        ),
      ],
    );
  }
}