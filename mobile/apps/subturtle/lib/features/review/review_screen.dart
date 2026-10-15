import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/swipe_card.dart';
import '../../shared/widgets.dart';
import '../phrase/phrase_parts.dart';
import '../today/today_screen.dart';
import 'review_logic.dart';
import 'summary_view.dart';

enum _Phase { loading, error, empty, session, summary }

/// S5 · Smart Review. Recognition cards (levels 1–2) and fill-the-gap cards
/// (level 3+). Forgot / Learned buttons, and swipe once the answer shows.
/// [bundleId] reviews one bundle instead of today's due cards.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({super.key, this.bundleId});
  final String? bundleId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> with WidgetsBindingObserver {
  _Phase _phase = _Phase.loading;
  Object? _error;
  List<ReviewItem> _items = [];
  String? _bundleTitle;
  int _index = 0;
  bool _revealed = false;
  int _hintUses = 0;
  late final GradeQueue _queue;
  final _started = DateTime.now();

  // Fill-the-gap state.
  final _typed = TextEditingController();
  final _typedFocus = FocusNode();
  ClozeResult? _clozeResult;
  bool _keyboardOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final api = ref.read(apiProvider);
    _queue = GradeQueue((g) => api.review.submit(g.phraseId, learned: g.learned));
    _typedFocus.addListener(() => setState(() => _keyboardOpen = _typedFocus.hasFocus));
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _queue.flush();
    _typed.dispose();
    _typedFocus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Leaving the app: send what we have, so a killed app loses nothing.
    if (state == AppLifecycleState.paused) _queue.flush();
  }

  Future<void> _load() async {
    setState(() => _phase = _Phase.loading);
    final api = ref.read(apiProvider);
    try {
      List<ReviewItem> items;
      if (widget.bundleId != null) {
        final bundle = await api.bundles.getBundle(widget.bundleId!);
        _bundleTitle = bundle?.title;
        items = await api.review.getCustomSession(bundle?.phraseIds ?? const []);
      } else {
        items = await api.review.getDueSession();
      }
      setState(() {
        _items = items;
        _phase = items.isEmpty ? _Phase.empty : _Phase.session;
      });
    } catch (e) {
      setState(() {
        _error = e;
        _phase = _Phase.error;
      });
    }
  }

  ReviewItem get _item => _items[_index];
  Cloze? get _cloze => Cloze.fromItem(_item);

  void _reveal() {
    if (_revealed) return;
    ref.read(hapticsProvider).selection();
    _typedFocus.unfocus();
    setState(() {
      _revealed = true;
      _hintUses++;
    });
    SemanticsService.sendAnnouncement(View.of(context), 'Answer. ${_item.phrase.translation}', TextDirection.ltr);
  }

  void _checkCloze(Cloze cloze) {
    final res = checkAnswer(_typed.text, cloze.answer);
    if (res == ClozeResult.correct) ref.read(hapticsProvider).medium();
    _typedFocus.unfocus();
    setState(() {
      _clozeResult = res;
      _revealed = true;
    });
  }

  Future<void> _grade(bool learned) async {
    if (!_revealed) return;
    final h = ref.read(hapticsProvider);
    learned ? h.medium() : h.light();
    final grade = Grade(_index, _item.phraseId, learned);
    final settings = ref.read(settingsProvider.notifier);
    if (!ref.read(settingsProvider).swipeHintSeen) settings.markSwipeHintSeen();
    _queue.add(grade);
    final last = _index + 1 >= _items.length;
    if (mounted && !last) {
      showStToast(
        context,
        title: learned ? 'Marked Learned' : 'Marked Forgot',
        color: learned ? StToastColor.success : StToastColor.neutral,
        actionLabel: 'Undo',
        onAction: _undo,
      );
    }
    if (last) {
      await _finish();
    } else {
      setState(() {
        _index++;
        _revealed = false;
        _clozeResult = null;
        _typed.clear();
      });
    }
  }

  void _undo() {
    final g = _queue.undo();
    if (g == null) return;
    ref.read(hapticsProvider).light();
    ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
    setState(() {
      _phase = _Phase.session;
      _index = g.index;
      _revealed = true;
    });
  }

  Future<void> _finish() async {
    // The summary is the end of the session, so the last grade is sent now.
    await _queue.flush();
    ref.read(hapticsProvider).success();
    ref.invalidate(todayProvider);
    refreshLearningData(ref);
    if (mounted) setState(() => _phase = _Phase.summary);
  }

  Future<void> _close() async {
    final graded = _queue.all.length;
    if (_phase != _Phase.session || graded == 0) {
      await _queue.flush();
      if (mounted) context.pop();
      return;
    }
    final end = await confirmSheet(context, title: 'End review?', body: 'Your ${Fmt.plural(graded, 'answer')} ${graded == 1 ? 'is' : 'are'} saved.', confirm: 'End', cancel: 'Keep going');
    if (!end) return;
    await _queue.flush();
    ref.invalidate(todayProvider);
    refreshLearningData(ref);
    if (mounted) context.pop();
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent || _phase != _Phase.session || _typedFocus.hasFocus) return KeyEventResult.ignored;
    if (e.logicalKey == LogicalKeyboardKey.space) {
      _reveal();
      return KeyEventResult.handled;
    }
    if (_revealed && e.logicalKey == LogicalKeyboardKey.arrowLeft) {
      _grade(false);
      return KeyEventResult.handled;
    }
    if (_revealed && e.logicalKey == LogicalKeyboardKey.arrowRight) {
      _grade(true);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final title = _bundleTitle == null ? 'Smart Review' : 'Review: $_bundleTitle';
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Focus(
        autofocus: true,
        onKeyEvent: _onKey,
        child: Scaffold(
          body: switch (_phase) {
            _Phase.summary => SummaryView(
                reviewed: _queue.all.length,
                learned: _queue.learned,
                forgot: _queue.forgot,
                elapsed: DateTime.now().difference(_started),
                again: [for (final g in _queue.all.where((g) => !g.learned)) _items[g.index].phrase],
                unsent: _queue.failed.length,
              ),
            _ => Column(
                children: [
                  StTaskHeader(
                    title: title,
                    onClose: _close,
                    closeLabel: 'End review',
                    progress: _phase == _Phase.session ? _index + 1 : null,
                    total: _phase == _Phase.session ? _items.length : null,
                    trailing: _phase == _Phase.session ? StTopBarButton(icon: StIcons.undo, semanticLabel: 'Undo last answer', iconSize: 24, onPressed: _queue.canUndo ? _undo : null) : null,
                  ),
                  Expanded(child: _body(context)),
                ],
              ),
          },
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    switch (_phase) {
      case _Phase.loading:
        return const Padding(padding: EdgeInsets.all(16), child: StSkeleton(height: 420, radius: StRadius.xl));
      case _Phase.error:
        return Center(child: ErrorPanel(title: "We couldn't load your review.", error: _error, onRetry: _load));
      case _Phase.empty:
        final hour = ref.watch(statsProvider).value?.reviewHour ?? 9;
        return Center(
          child: StEmptyState(
            icon: StIcons.confetti,
            color: StBadgeColor.accent,
            title: 'Nothing to review right now',
            description: widget.bundleId != null ? 'This bundle has no phrases yet.' : 'Next review: tomorrow at ${hour.toString().padLeft(2, '0')}:00.',
            action: StButton(label: 'Back to today', onPressed: () => context.pop()),
          ),
        );
      case _Phase.session:
        return _session(context);
      case _Phase.summary:
        return const SizedBox.shrink();
    }
  }

  Widget _session(BuildContext context) {
    final c = context.st;
    final cloze = _cloze;
    final stack = MediaQuery.textScalerOf(context).scale(1) >= 1.5;
    final swipeHint = !ref.watch(settingsProvider).swipeHintSeen;

    final card = Semantics(
      label: _cardLabel(cloze),
      customSemanticsActions: {
        if (!_revealed && cloze == null) const CustomSemanticsAction(label: 'Show answer'): _reveal,
        if (_revealed) const CustomSemanticsAction(label: 'Mark learned'): () => _grade(true),
        if (_revealed) const CustomSemanticsAction(label: 'Mark forgot'): () => _grade(false),
        if (_queue.canUndo) const CustomSemanticsAction(label: 'Undo'): _undo,
      },
      child: GestureDetector(
        onTap: cloze == null ? _reveal : null,
        child: _CardFace(
          key: ValueKey('card-$_index-$_revealed'),
          item: _item,
          cloze: cloze,
          revealed: _revealed,
          clozeResult: _clozeResult,
          typed: _typed.text,
          showTapHint: cloze == null && !_revealed && _hintUses < 3,
        ),
      ),
    );

    final swipeable = SwipeCard(
      key: ValueKey('swipe-$_index'),
      enabled: _revealed && !_keyboardOpen,
      onLeft: () => _grade(false),
      onRight: () => _grade(true),
      onThreshold: () => ref.read(hapticsProvider).light(),
      onBlocked: () => showStToast(context, title: 'Show the answer first', color: StToastColor.info, duration: const Duration(seconds: 2)),
      rightLabel: const StBadge('Learned', color: StBadgeColor.accent, solid: true, icon: StIcons.check),
      leftLabel: const StBadge('Forgot', color: StBadgeColor.neutral, solid: true, icon: StIcons.closeBold),
      child: card,
    );

    final suggestLearned = _clozeResult == ClozeResult.correct;
    final grades = [
      Expanded(
        flex: stack ? 0 : 1,
        child: StButton(
          label: 'Forgot',
          variant: StButtonVariant.outline,
          tone: StTone.danger,
          size: StSize.lg,
          block: true,
          icon: StIcons.forgotDuo,
          emphasis: _clozeResult != null && !suggestLearned,
          onPressed: () => _grade(false),
        ),
      ),
      SizedBox(width: 10, height: stack ? 8 : 0),
      Expanded(
        flex: stack ? 0 : 1,
        child: StButton(
          label: 'Learned',
          variant: StButtonVariant.outline,
          tone: StTone.accent,
          size: StSize.lg,
          block: true,
          icon: StIcons.checkDuo,
          emphasis: suggestLearned,
          onPressed: () => _grade(true),
        ),
      ),
    ];

    Widget bottom;
    if (_revealed) {
      bottom = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          stack ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: grades.map((w) => w is Expanded ? w.child : w).toList()) : Row(children: grades),
          if (swipeHint)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Swipe left', style: StType.bodySmall.copyWith(color: c.textFaint)),
                  Text('Swipe right', style: StType.bodySmall.copyWith(color: c.textFaint)),
                ],
              ),
            ),
        ],
      );
    } else if (cloze != null) {
      bottom = _ClozeInput(
        controller: _typed,
        focusNode: _typedFocus,
        onCheck: () => _checkCloze(cloze),
        onShow: () {
          _typedFocus.unfocus();
          setState(() {
            _clozeResult = ClozeResult.wrong;
            _revealed = true;
          });
        },
      );
    } else {
      bottom = StButton(label: 'Show answer', variant: StButtonVariant.soft, size: StSize.lg, block: true, onPressed: _reveal);
    }

    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(16, 20, 16, 16 + MediaQuery.paddingOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight - 36 - MediaQuery.paddingOf(context).bottom),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // The card keeps most of the height; it shrinks when the keyboard is open.
              ConstrainedBox(constraints: BoxConstraints(minHeight: _keyboardOpen ? 0 : box.maxHeight * 0.5), child: swipeable),
              const SizedBox(height: 16),
              bottom,
            ],
          ),
        ),
      ),
    );
  }

  String _cardLabel(Cloze? cloze) {
    final p = _item.phrase;
    final n = 'Flashcard ${_index + 1} of ${_items.length}.';
    if (cloze != null && !_revealed) {
      return '$n Fill the gap. ${cloze.before} blank ${cloze.after}. ${cloze.hint == null ? '' : 'Hint: ${cloze.hint}'}';
    }
    final tags = [p.linguistic?.type, p.linguistic?.formality].whereType<String>().where((t) => t.isNotEmpty).join(', ');
    final example = (p.context ?? '').isEmpty ? '' : ' Example: ${p.context}.';
    if (!_revealed) return '$n Phrase: ${p.phrase}. $tags.$example Double-tap to show answer.';
    return '$n Phrase: ${p.phrase}. Answer: ${p.translation}. ${p.linguistic?.definition ?? ''}';
  }
}

/// The card: front, or front + answer once revealed.
class _CardFace extends ConsumerWidget {
  const _CardFace({super.key, required this.item, required this.cloze, required this.revealed, required this.clozeResult, required this.typed, required this.showTapHint});

  final ReviewItem item;
  final Cloze? cloze;
  final bool revealed;
  final ClozeResult? clozeResult;
  final String typed;
  final bool showTapHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final p = item.phrase;
    final reduced = StMotion.reduced(context);
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            StLevelPip(level: item.boxLevel.clamp(1, 5), label: 'Level ${item.boxLevel}', showCount: false),
            const Spacer(),
            if (cloze != null) const StBadge('Fill the gap', color: StBadgeColor.primary),
          ],
        ),
        const SizedBox(height: 16),
        if (cloze == null) ...[
          Row(
            children: [
              Expanded(child: Text(p.phrase, style: StType.headline.copyWith(color: c.textStrong), textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.6))),
              SpeakButton(text: p.phrase, language: p.language),
            ],
          ),
          const SizedBox(height: 10),
          PhraseTags(phrase: p),
          if ((p.context ?? '').isNotEmpty) ...[
            const SizedBox(height: 14),
            HighlightedSentence(sentence: p.context!, highlight: p.phrase, style: StType.bodyLarge.copyWith(color: c.textMuted)),
          ],
        ] else
          _ClozeSentence(cloze: cloze!, result: clozeResult, typed: typed, rtl: l1IsRtl(ref, p)),
        if (showTapHint) ...[
          const SizedBox(height: 28),
          Center(child: Text('Tap card to see answer', style: StType.bodySmall.copyWith(color: c.textFaint))),
        ],
        AnimatedSize(
          duration: reduced ? Duration.zero : StMotion.flip,
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: revealed
              ? Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (cloze != null) ...[
                        Text(p.phrase, style: StType.titleLarge.copyWith(color: c.textStrong)),
                        const SizedBox(height: 12),
                      ],
                      Divider(color: c.borderSubtle),
                      const SizedBox(height: 12),
                      AnswerBlock(phrase: p),
                    ],
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
    return AnimatedSwitcher(
      duration: reduced ? StMotion.fast : StMotion.flip,
      child: StCard(
        key: ValueKey(revealed),
        radius: StRadius.xl,
        elevation: StCardElevation.lg,
        padding: const EdgeInsets.all(StSpace.s6),
        child: content,
      ),
    );
  }
}

class _ClozeSentence extends StatelessWidget {
  const _ClozeSentence({required this.cloze, required this.result, required this.typed, required this.rtl});
  final Cloze cloze;
  final ClozeResult? result;
  final String typed;
  final bool rtl;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final style = StType.base(size: 22, weight: FontWeight.w700, height: 1.5).copyWith(color: c.textStrong);
    InlineSpan blank;
    if (result == null) {
      blank = WidgetSpan(
        alignment: PlaceholderAlignment.baseline,
        baseline: TextBaseline.alphabetic,
        child: Semantics(
          label: 'blank',
          child: Container(
            constraints: const BoxConstraints(minWidth: 88),
            height: 28,
            decoration: BoxDecoration(color: c.primaryTint, border: Border(bottom: BorderSide(color: c.primary, width: 3)), borderRadius: const BorderRadius.vertical(top: Radius.circular(StRadius.xs))),
          ),
        ),
      );
    } else if (result == ClozeResult.correct) {
      blank = TextSpan(text: cloze.answer, style: TextStyle(color: c.jade700, backgroundColor: c.accentSoft, fontWeight: FontWeight.w900));
    } else {
      blank = TextSpan(children: [
        if (typed.trim().isNotEmpty) TextSpan(text: '${typed.trim()} ', style: TextStyle(color: c.textMuted, decoration: TextDecoration.lineThrough)),
        TextSpan(text: cloze.answer, style: TextStyle(color: c.rose700, backgroundColor: c.primarySoft, fontWeight: FontWeight.w900)),
      ]);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text.rich(TextSpan(style: style, children: [TextSpan(text: '"${cloze.before}'), blank, TextSpan(text: '${cloze.after}"')])),
        if (result != null) ...[
          const SizedBox(height: 10),
          Semantics(
            liveRegion: true,
            child: Row(
              children: [
                StIcon(result == ClozeResult.correct ? StIcons.check : StIcons.info, size: 18, color: result == ClozeResult.correct ? c.jade600 : c.amber600),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    switch (result!) {
                      ClozeResult.correct => 'Right!',
                      ClozeResult.close => 'Almost! The answer is ${cloze.answer}.',
                      ClozeResult.wrong => 'The answer is ${cloze.answer}.',
                    },
                    style: StType.bodyMedium.copyWith(color: c.textBody, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (cloze.hint != null && result == null) ...[
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StIcon(StIcons.lightbulb, size: 18, color: c.amber600),
              const SizedBox(width: 8),
              Text('Hint: ', style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w700)),
              Expanded(child: StL1Text(cloze.hint!, rtl: rtl, style: StType.base(size: 17, weight: FontWeight.w700).copyWith(color: c.textStrong))),
            ],
          ),
        ],
      ],
    );
  }
}

class _ClozeInput extends StatelessWidget {
  const _ClozeInput({required this.controller, required this.focusNode, required this.onCheck, required this.onShow});
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onCheck;
  final VoidCallback onShow;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StInput(
          controller: controller,
          focusNode: focusNode,
          label: 'Type the missing words',
          icon: StIcons.pen,
          hint: 'Spelling is forgiving. Case and end marks are ignored.',
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => onCheck(),
        ),
        const SizedBox(height: 12),
        StButton(label: 'Check', size: StSize.lg, block: true, icon: StIcons.check, onPressed: onCheck),
        StButton(label: "I don't know, show me", variant: StButtonVariant.ghost, tone: StTone.neutral, size: StSize.lg, block: true, onPressed: onShow),
      ],
    );
  }
}
