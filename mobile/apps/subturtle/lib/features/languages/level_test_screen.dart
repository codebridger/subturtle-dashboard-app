import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../live_session/chat_bubbles.dart';
import 'language_ui.dart';

/// Where the chat test was opened from; it decides where each way out goes.
enum LevelTestFrom {
  /// Step 2 of Add a language. The language is added when the test ends.
  add,

  /// The first run of a new account (L10). Same as [add].
  first,

  /// "Take the chat test again" on Manage. The language exists; the test
  /// returns to Manage.
  manage;

  static LevelTestFrom parse(String? v) => LevelTestFrom.values.where((f) => f.name == v).firstOrNull ?? LevelTestFrom.add;
}

/// L11 · the AI chat test. Six short questions from the Coach in the new
/// language, easy first, with help in the learner's own language. The result
/// is a start point ("Starting at A2"), never a grade.
///
/// Ways out on every step: X (back), "Stop and start at A1". The test never
/// blocks adding a language: if it fails, the learner starts at A1.
class LevelTestScreen extends ConsumerStatefulWidget {
  const LevelTestScreen({super.key, required this.language, this.from = LevelTestFrom.add, this.goals = const []});

  final String language;
  final LevelTestFrom from;
  final List<String> goals;

  @override
  ConsumerState<LevelTestScreen> createState() => _LevelTestScreenState();
}

class _Line {
  const _Line(this.text, {required this.fromUser, this.help});
  final String text;
  final bool fromUser;
  final String? help;
}

class _LevelTestScreenState extends ConsumerState<LevelTestScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _lines = <_Line>[];
  String? _testId;
  int _index = 1;
  int _total = 6;
  bool _waiting = true;
  bool _finishing = false;
  Object? _error;
  LevelTestResult? _result;

  @override
  void initState() {
    super.initState();
    _begin();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  SubturtleApi get _api => ref.read(apiProvider);

  bool get _alreadyAdded => ref.read(languageStateProvider).value?.summaryOf(widget.language)?.isActive ?? false;

  Future<void> _begin() async {
    setState(() {
      _lines.clear();
      _result = null;
      _error = null;
      _waiting = true;
      _index = 1;
    });
    try {
      final step = await _api.languages.startLevelTest(widget.language);
      if (!mounted) return;
      setState(() {
        _testId = step.testId;
        _total = step.total;
        _index = step.index;
        if (step.turn != null) _lines.add(_Line(step.turn!.ai, fromUser: false, help: step.turn!.help));
        _waiting = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _waiting = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    final id = _testId;
    if (text.isEmpty || id == null || _waiting) return;
    ref.read(hapticsProvider).light();
    setState(() {
      _lines.add(_Line(text, fromUser: true));
      _input.clear();
      _waiting = true;
      _error = null;
    });
    _scrollDown();
    try {
      final step = await _api.languages.answerLevelTest(id, text);
      if (!mounted) return;
      setState(() {
        _waiting = false;
        _index = step.index;
        _total = step.total;
        if (step.done) {
          _result = step.result ?? const LevelTestResult(startLevel: CefrStart.a1);
          ref.read(hapticsProvider).success();
        } else if (step.turn != null) {
          _lines.add(_Line(step.turn!.ai, fromUser: false, help: step.turn!.help));
        }
      });
      _scrollDown();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _waiting = false;
        _error = e;
        // Put the answer back so the learner can send it again.
        final last = _lines.removeLast();
        _input.text = last.text;
      });
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  void _back() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/today');
    }
  }

  /// Ends the test. [level] null means "start at A1" (stop, or A1 instead).
  Future<void> _finish({String? level}) async {
    final accept = level != null;
    setState(() => _finishing = true);
    final router = GoRouter.of(context);
    final controller = ref.read(languageStateProvider.notifier);
    try {
      if (widget.from == LevelTestFrom.manage) {
        // The language exists. Accept saves the new start level; stopping keeps the old one.
        if (_testId != null) controller.replace(await _api.languages.finishLevelTest(_testId!, accept: accept));
        if (mounted) router.pop();
        return;
      }
      if (!_alreadyAdded) {
        await controller.add(widget.language, startLevel: level ?? CefrStart.a1, startLevelSource: accept ? 'test' : 'default', goals: widget.goals.isEmpty ? null : widget.goals);
      }
      if (_testId != null) {
        try {
          controller.replace(await _api.languages.finishLevelTest(_testId!, accept: accept));
        } catch (e) {
          // The level is already saved by add-language; a missing finish is not worth a stop.
          debugPrint('finish-level-test failed: $e');
        }
      }
      refreshLearningData(ref);
      final s = ref.read(languageStateProvider).value;
      final caps = ref.read(languageCapsProvider).value?.learningByCode(widget.language);
      final pack = s?.summaryOf(widget.language)?.starterPack;
      resetTabsToToday(router);
      // Start at A1 opens the starter pack; after a test, Today offers it as a card.
      if (!accept && (caps?.features.starterPack ?? false) && pack != null && pack.state != 'none' && !pack.isDone) router.push('/starter?lang=${widget.language}');
    } on AddLanguageRefusal catch (r) {
      if (!mounted) return;
      setState(() => _finishing = false);
      showStToast(context, title: r.upgradeNeeded ? 'Your plan is full. Manage your languages or see plans.' : "We couldn't add the language.", color: StToastColor.danger);
    } catch (e) {
      if (!mounted) return;
      setState(() => _finishing = false);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final caps = capsOf(ref, widget.language);
    final l1 = ref.watch(l1Provider).value;
    final done = _result != null;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 4),
              child: Row(
                children: [
                  StTopBarButton(icon: StIcons.close, semanticLabel: 'Leave the test and go back', onPressed: _finishing ? null : _back),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${caps.name} · chat test', style: StType.titleSmall.copyWith(color: c.textStrong)),
                        const SizedBox(height: 4),
                        Semantics(
                          label: done ? 'Done' : 'Question $_index of $_total',
                          child: StProgressBar(value: done ? 1 : (_index / _total).clamp(0, 1).toDouble(), max: 1, color: StBadgeColor.accent, size: StSize3.sm),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(done ? 'Done' : 'Question $_index of $_total', style: StType.labelMedium.copyWith(color: c.textMuted)),
                ],
              ),
            ),
            Expanded(child: done ? _resultView(context, caps) : _chatView(context, caps, l1?.rtl ?? false)),
          ],
        ),
      ),
    );
  }

  Widget _chatView(BuildContext context, LearningLanguageCaps caps, bool l1Rtl) {
    final c = context.st;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            children: [
              Text('Answer in ${caps.name}. Short answers are fine.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
              const SizedBox(height: 10),
              for (final l in _lines) ...[
                ChatBubble(text: l.text, fromUser: l.fromUser),
                if (l.help != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 6, bottom: 8),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: StL1Text(l.help!, rtl: l1Rtl, style: StType.bodySmall.copyWith(color: c.textMuted)),
                    ),
                  ),
              ],
              if (_waiting) const TypingBubble(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: _testId == null
                      ? (_error is ApiException && (_error as ApiException).isMissingFunction
                          // A server without the chat test: never a dead end.
                          ? StEmptyState(
                              compact: true,
                              icon: StIcons.chatDots,
                              color: StBadgeColor.info,
                              title: 'The chat test is not ready yet',
                              description: widget.from == LevelTestFrom.manage ? 'Your start point stays as it is.' : 'Start at A1 for now. You can take the test later from Languages.',
                            )
                          : ErrorPanel(title: "We couldn't start the chat test.", error: _error, onRetry: _begin))
                      : Text(friendlyError(_error!), style: StType.bodySmall.copyWith(color: c.red600)),
                ),
            ],
          ),
        ),
        Center(
          child: StButton(
            label: widget.from == LevelTestFrom.manage ? 'Stop the test' : 'Stop and start at A1',
            size: StSize.sm,
            variant: StButtonVariant.ghost,
            tone: StTone.neutral,
            loading: _finishing,
            onPressed: _finishing ? null : () => _finish(),
          ),
        ),
        Container(
          decoration: BoxDecoration(color: c.surfaceCard, border: Border(top: BorderSide(color: c.borderSubtle))),
          padding: EdgeInsets.fromLTRB(12, 8, 8, 8 + MediaQuery.paddingOf(context).bottom),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: StInput(
                  controller: _input,
                  placeholder: 'Write in ${caps.name}…',
                  minLines: 1,
                  maxLines: 4,
                  enabled: _testId != null,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 4),
              StIconButton(icon: StIcons.send, semanticLabel: 'Send', variant: StButtonVariant.solid, tone: StTone.primary, size: StSize.lg, round: true, onPressed: _waiting || _testId == null ? null : _send),
            ],
          ),
        ),
      ],
    );
  }

  Widget _resultView(BuildContext context, LearningLanguageCaps caps) {
    final c = context.st;
    final r = _result!;
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.paddingOf(context).bottom),
      children: [
        Center(
          child: Container(
            width: 72,
            height: 72,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.accentSoft, shape: BoxShape.circle),
            child: Text(r.startLevel, style: StType.titleLarge.copyWith(color: c.jade700)),
          ),
        ),
        const SizedBox(height: 14),
        Semantics(header: true, child: Text('Starting at ${r.startLevel}', textAlign: TextAlign.center, style: StType.headline.copyWith(color: c.textStrong))),
        const SizedBox(height: 8),
        if (r.reason.isNotEmpty) Text(r.reason, textAlign: TextAlign.center, style: StType.bodyLarge.copyWith(color: c.textBody)),
        const SizedBox(height: 8),
        Text('This is a start point, not a grade. It sets which phrases and Coach topics you see first.', textAlign: TextAlign.center, style: StType.bodyMedium.copyWith(color: c.textMuted)),
        const SizedBox(height: 14),
        if (widget.from != LevelTestFrom.manage && caps.features.starterPack)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: StRadius.brMd),
            child: Row(
              children: [
                StIcon(StIcons.info, size: 20, color: c.textMuted),
                const SizedBox(width: 8),
                Expanded(child: Text('The starter pack is still there if you want it. Saving from videos is open now.', style: StType.bodySmall.copyWith(color: c.textMuted))),
              ],
            ),
          ),
        const SizedBox(height: 20),
        StButton(
          label: widget.from == LevelTestFrom.manage ? 'Save and go back' : 'Go to ${caps.name} Today',
          size: StSize.lg,
          block: true,
          loading: _finishing,
          onPressed: _finishing ? null : () => _finish(level: r.startLevel),
        ),
        const SizedBox(height: 8),
        StButton(label: 'Retake the test', size: StSize.lg, block: true, variant: StButtonVariant.soft, tone: StTone.neutral, onPressed: _finishing ? null : _begin),
        const SizedBox(height: 4),
        Center(
          child: StButton(
            label: widget.from == LevelTestFrom.manage ? 'Keep my start point' : 'Start at A1 instead',
            size: StSize.sm,
            variant: StButtonVariant.ghost,
            tone: StTone.neutral,
            onPressed: _finishing ? null : () => _finish(),
          ),
        ),
      ],
    );
  }
}
