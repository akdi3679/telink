import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/stepup_providers.dart';
import '../stepup_actions.dart';

const _availableQuestions = <Map<String, String>>[
  {'key': 'birth_city', 'text': 'What city were you born in?'},
  {'key': 'first_school', 'text': 'What was the name of your first school?'},
  {'key': 'first_pet', 'text': 'What was the name of your first pet?'},
  {'key': 'fav_teacher', 'text': "What was your favorite teacher's name?"},
  {'key': 'childhood_friend',
   'text': "What was your best friend's name as a child?"},
  {'key': 'first_car', 'text': 'What was your first car model?'},
  {'key': 'fav_book', 'text': 'What is your favorite book?'},
  {'key': 'mother_maiden', 'text': "What is your mother's maiden name?"},
  {'key': 'first_job', 'text': 'Where did you work at your first job?'},
  {'key': 'fav_food', 'text': 'What is your favorite childhood food?'},
];

const _customMarker = '__custom__';

class SecurityQuestionsPage extends ConsumerWidget {
  const SecurityQuestionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(securityQuestionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Security questions')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load.\n$e', textAlign: TextAlign.center),
          ),
        ),
        data: (qs) => _Body(existing: qs),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  final List<dynamic> existing;
  const _Body({required this.existing});

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  /// Per-slot question key (either a preset key or _customMarker).
  final _picks = <int, String>{};

  /// Per-slot custom question text (only used when pick == _customMarker).
  final _customText = <int, TextEditingController>{};

  /// Per-slot answer. Empty means "keep the existing hash for this key".
  final _answerCtrls = <int, TextEditingController>{};

  /// The original question keys we loaded from the server, for change detection.
  final _originalKeys = <int, String>{};

  /// The original custom question text (if the loaded row had one).
  final _originalCustomText = <int, String>{};

  bool _saving = false;
  String? _error;

  bool get _alreadyEnrolled => widget.existing.length >= 3;

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < 3; i++) {
      _answerCtrls[i] = TextEditingController();
      _customText[i] = TextEditingController();
    }
    // Preselect existing questions and remember their original state so we
    // can tell if the user actually changed anything.
    for (var i = 0; i < widget.existing.length && i < 3; i++) {
      final row = widget.existing[i];
      final k = row.questionKey as String;
      final t = row.questionText as String? ?? '';
      final known = _availableQuestions.any((q) => q['key'] == k);
      _originalKeys[i] = k;
      if (known) {
        _picks[i] = k;
      } else {
        _picks[i] = _customMarker;
        _customText[i]!.text = t;
        _originalCustomText[i] = t;
      }
    }
  }

  @override
  void dispose() {
    for (final c in _answerCtrls.values) {
      c.dispose();
    }
    for (final c in _customText.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _resolveQuestionKey(int i) {
    if (_picks[i] == _customMarker) return 'custom_$i';
    return _picks[i] ?? '';
  }

  String _resolveQuestionText(int i) {
    if (_picks[i] == _customMarker) {
      return _customText[i]!.text.trim();
    }
    final key = _picks[i];
    final known = _availableQuestions.firstWhere(
      (q) => q['key'] == key,
      orElse: () => {'text': ''},
    );
    return known['text'] ?? '';
  }

  /// True if the user has changed the question in this slot from what was
  /// loaded from the server. A new question always needs an answer.
  bool _questionChanged(int i) {
    final newKey = _resolveQuestionKey(i);
    final oldKey = _originalKeys[i];
    if (oldKey == null) return true; // no existing question
    if (newKey != oldKey) return true;
    // Same key. If it's a custom question, check the text too.
    if (newKey.startsWith('custom_')) {
      final newText = _customText[i]!.text.trim();
      final oldText = _originalCustomText[i] ?? '';
      if (newText != oldText) return true;
    }
    return false;
  }

  Future<void> _save() async {
    // If the user already enrolled before, require step-up first so a
    // stolen session cannot quietly change the questions.
    if (_alreadyEnrolled) {
      if (!context.mounted) return;
      final verified = await requireStepUp(context, ref);
      if (!verified) return;
      if (!context.mounted) return;
    }

    for (var i = 0; i < 3; i++) {
      if (_picks[i] == null) {
        setState(() => _error = 'Pick a question for slot ${i + 1}');
        return;
      }
      if (_picks[i] == _customMarker &&
          _customText[i]!.text.trim().isEmpty) {
        setState(() => _error = 'Write your custom question in slot ${i + 1}');
        return;
      }
      final answer = _answerCtrls[i]!.text.trim();
      if (answer.isEmpty && _questionChanged(i)) {
        setState(() => _error =
            'Provide an answer for the new question in slot ${i + 1}');
        return;
      }
      if (answer.isNotEmpty && answer.length < 2) {
        setState(() => _error = 'Answer in slot ${i + 1} is too short');
        return;
      }
    }

    final keys = <String>{};
    for (var i = 0; i < 3; i++) {
      final k = _resolveQuestionKey(i);
      if (keys.contains(k)) {
        setState(() => _error = 'Pick three different questions');
        return;
      }
      keys.add(k);
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final list = <Map<String, dynamic>>[];
      for (var i = 0; i < 3; i++) {
        list.add({
          'questionKey': _resolveQuestionKey(i),
          'questionText': _resolveQuestionText(i),
          // Empty answer = "keep existing hash for this key".
          'answer': _answerCtrls[i]!.text.trim(),
        });
      }
      await ref.read(stepUpRepositoryProvider).enroll(list);
      ref.invalidate(securityQuestionsProvider);
      ref.invalidate(stepUpStatusProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Security questions saved')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      setState(() => _error = 'Could not save: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          _alreadyEnrolled
              ? 'Your 3 questions'
              : 'Choose 3 questions',
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          _alreadyEnrolled
              ? 'Leave an answer blank to keep the current one. You only '
                  'need to fill in the slots you want to change. You will be '
                  'asked to verify with your current answers first.'
              : 'Answers are hashed on the server. Nobody - not even we - can '
                  'read them. You will answer 2 of these whenever you do a '
                  'high-risk action.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        for (var i = 0; i < 3; i++) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Question ${i + 1}',
                    style: theme.textTheme.labelLarge),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _picks[i],
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: [
                    ..._availableQuestions
                        .map((q) => DropdownMenuItem(
                              value: q['key'],
                              child: Text(q['text']!,
                                  style: const TextStyle(fontSize: 14)),
                            )),
                    const DropdownMenuItem(
                      value: _customMarker,
                      child: Text('Custom question...',
                          style: TextStyle(
                              fontSize: 14,
                              fontStyle: FontStyle.italic)),
                    ),
                  ],
                  onChanged: _saving
                      ? null
                      : (v) => setState(() {
                            _picks[i] = v ?? '';
                            // If user picks a different preset, clear any
                            // custom text they had typed.
                            if (v != _customMarker) {
                              _customText[i]!.clear();
                            }
                          }),
                ),
                if (_picks[i] == _customMarker) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _customText[i],
                    enabled: !_saving,
                    maxLength: 120,
                    decoration: const InputDecoration(
                      labelText: 'Your question',
                      border: OutlineInputBorder(),
                      isDense: true,
                      counterText: '',
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                TextField(
                  controller: _answerCtrls[i],
                  enabled: !_saving,
                  decoration: InputDecoration(
                    labelText: 'Your answer',
                    hintText: _originalKeys[i] != null && !_questionChanged(i)
                        ? 'Leave blank to keep current answer'
                        : 'New answer required',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (_error != null) ...[
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16)),
          child: _saving
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(_alreadyEnrolled
                  ? 'Verify and save changes'
                  : 'Save questions'),
        ),
      ],
    );
  }
}