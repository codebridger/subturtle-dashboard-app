import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/swipe_card.dart';
import '../../shared/widgets.dart';
import '../capture/capture_sheet.dart';
import '../phrase/phrase_parts.dart';
import '../review/summary_view.dart';
import '../today/today_screen.dart';

enum _Phase { loading, error, empty, session, saving, saveError, done }

/// S4 · Pool player: a first meeting with new words. Reveal, then Next.
/// No grading. At the end the seen words move into review box 1.
class PoolScreen extends ConsumerStatefulWidget {
  const PoolScreen({super.key});

  @override
  ConsumerState<PoolScreen> createState() => _PoolScreenState();
}

class _PoolScreenState extends ConsumerState<PoolScreen> {
  _Phase _phase = _Phase.loading;
  Object? _error;
  List<PoolItem> _items = [];
  int _index = 0;
  bool _revealed = false;
  final Set<String> _seen = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _phase = _Phase.loading);
    final api = ref.read(apiProvider);
    try {
      final all = await api.board.getPool();
      final chunk = (await api.review.getStats().catchError((_) => null))?.poolChunkSize ?? 10;
      setState(() {
        _items = all.take(chunk.clamp(1, 100)).toList();
        _phase = _items.isEmpty ? _Phase.empty : _Phase.session;
      });
    } catch (e) {
      setState(() {
        _error = e;
        _phase = _Phase.error;
      });
    }
  }

  void _toggle() {
    ref.read(hapticsProvider).selection();
    setState(() {
      _revealed = !_revealed;
      if (_revealed) _seen.add(_items[_index].phraseId);
    });
  }

  void _next() {
    _seen.add(_items[_index].phraseId);
    if (_index + 1 >= _items.length) {
      _complete();
      return;
    }
    setState(() {
      _index++;
      _revealed = false;
    });
  }

  void _previous() {
    if (_index == 0) return;
    setState(() {
      _index--;
      _revealed = true;
    });
  }

  Future<void> _complete() async {
    if (_seen.isEmpty) {
      if (mounted) context.pop();
      return;
    }
    setState(() => _phase = _Phase.saving);
    try {
      await ref.read(apiProvider).board.completePoolSession(_seen.toList());
      ref.read(hapticsProvider).success();
      ref.invalidate(todayProvider);
      refreshLearningData(ref);
      if (mounted) setState(() => _phase = _Phase.done);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _phase = _Phase.saveError;
        });
      }
    }
  }

  Future<void> _close() async {
    if (_phase != _Phase.session || _seen.isEmpty) {
      context.pop();
      return;
    }
    final end = await confirmSheet(
      context,
      title: 'End new words?',
      body: 'The ${Fmt.plural(_seen.length, 'word')} you saw move into your review box.',
      confirm: 'End',
      cancel: 'Keep going',
    );
    if (end) await _complete();
  }

  @override
  Widget build(BuildContext context) {
    if (_phase == _Phase.done) {
      return Scaffold(body: SummaryView(reviewed: _seen.length, learned: 0, forgot: 0, elapsed: Duration.zero, pool: true));
    }
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        body: Column(
          children: [
            StTaskHeader(
              title: 'New words',
              onClose: _close,
              closeLabel: 'End new words',
              progress: _phase == _Phase.session ? _index + 1 : null,
              total: _phase == _Phase.session ? _items.length : null,
              progressColor: StBadgeColor.accent,
              trailing: _phase == _Phase.session && _index > 0
                  ? StButton(label: 'Previous', variant: StButtonVariant.ghost, tone: StTone.neutral, size: StSize.sm, icon: 'solar:alt-arrow-left-linear', onPressed: _previous)
                  : null,
            ),
            Expanded(child: _body(context)),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    switch (_phase) {
      case _Phase.loading:
        return const Padding(padding: EdgeInsets.all(16), child: StSkeleton(height: 420, radius: StRadius.xl));
      case _Phase.error:
        return Center(child: ErrorPanel(title: "We couldn't load your new words.", error: _error, onRetry: _load));
      case _Phase.saveError:
        return Center(child: ErrorPanel(title: "We couldn't save your progress.", error: _error, onRetry: _complete));
      case _Phase.saving:
        return const Center(child: CircularProgressIndicator());
      case _Phase.empty:
        return Center(
          child: StEmptyState(
            icon: StIcons.stars,
            color: StBadgeColor.accent,
            title: 'No new words right now',
            description: 'Save a phrase to fill your pool.',
            action: StButton(
              label: 'Save a phrase',
              icon: StIcons.add,
              onPressed: () {
                context.pop();
                openCapture(context, ref);
              },
            ),
          ),
        );
      case _Phase.session:
      case _Phase.done:
        return _session(context);
    }
  }

  Widget _session(BuildContext context) {
    final item = _items[_index];
    final stack = MediaQuery.textScalerOf(context).scale(1) >= 1.5;
    final buttons = [
      StButton(label: _revealed ? 'Flip back' : 'Reveal', variant: StButtonVariant.outline, tone: StTone.neutral, size: StSize.lg, block: true, icon: StIcons.flip, onPressed: _toggle),
      StButton(label: _index + 1 >= _items.length ? 'Done' : 'Next', tone: StTone.accent, size: StSize.lg, block: true, icon: StIcons.next, onPressed: _next),
    ];
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
            child: SwipeCard(
              key: ValueKey('pool-$_index'),
              enabled: _revealed,
              onLeft: _next,
              onThreshold: () => ref.read(hapticsProvider).light(),
              onBlocked: () => showStToast(context, title: 'Reveal it first', color: StToastColor.info, duration: const Duration(seconds: 2)),
              child: Semantics(
                label: 'New word ${_index + 1} of ${_items.length}. ${item.phrase.phrase}.${_revealed ? ' Meaning: ${item.phrase.translation}.' : ' Double-tap to reveal.'}',
                customSemanticsActions: {
                  CustomSemanticsAction(label: _revealed ? 'Flip back' : 'Reveal'): _toggle,
                  const CustomSemanticsAction(label: 'Next'): _next,
                },
                child: GestureDetector(onTap: _toggle, child: _PoolCard(item: item, revealed: _revealed)),
              ),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.paddingOf(context).bottom),
          child: stack
              ? Column(children: [buttons[0], const SizedBox(height: 8), buttons[1]])
              : Row(children: [Expanded(child: buttons[0]), const SizedBox(width: 10), Expanded(child: buttons[1])]),
        ),
      ],
    );
  }
}

class _PoolCard extends ConsumerWidget {
  const _PoolCard({required this.item, required this.revealed});
  final PoolItem item;
  final bool revealed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final p = item.phrase;
    final host = p.sourceUrl == null ? null : Uri.tryParse(p.sourceUrl!)?.host.replaceFirst('www.', '');
    final sentence = item.sourceSentence ?? p.context;
    return StCard(
      radius: StRadius.xl,
      elevation: StCardElevation.md,
      padding: const EdgeInsets.all(StSpace.s6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const StBadge('New', color: StBadgeColor.accent, icon: StIcons.stars),
              const Spacer(),
              if (host != null) Flexible(child: Text(host, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.bodySmall.copyWith(color: c.textMuted, fontWeight: FontWeight.w700))),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: Text(p.phrase, style: StType.headline.copyWith(color: c.textStrong), textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.6))),
              SpeakButton(text: p.phrase, language: p.language),
            ],
          ),
          const SizedBox(height: 10),
          PhraseTags(phrase: p),
          if ((sentence ?? '').isNotEmpty) ...[
            const SizedBox(height: 14),
            HighlightedSentence(sentence: sentence!, highlight: p.phrase, chunks: [?item.confirmedChunk], style: StType.base(size: 18, height: 1.5).copyWith(color: c.textBody)),
          ],
          AnimatedSize(
            duration: StMotion.reduced(context) ? Duration.zero : StMotion.flip,
            alignment: Alignment.topCenter,
            child: revealed
                ? Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Divider(color: c.borderSubtle),
                        const SizedBox(height: 12),
                        const StEyebrow.section('Meaning'),
                        const SizedBox(height: 8),
                        AnswerBlock(phrase: p, showLabel: false),
                      ],
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}
