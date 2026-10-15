import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../phrase/phrase_parts.dart';
import '../today/today_screen.dart';

final starterPackProvider = FutureProvider.autoDispose.family<StarterPack, String>((ref, lang) => ref.read(apiProvider).starterPacks.get(lang));

/// "greetings" → "Greetings", "food_and_drinks" → "Food and drinks".
String groupName(String id) {
  final words = id.replaceAll(RegExp(r'[_-]+'), ' ').trim();
  return words.isEmpty ? 'More' : words[0].toUpperCase() + words.substring(1);
}

/// "Top 1,000" for band 1, and so on.
String bandLabel(int band) => 'Top ${band.clamp(1, 9)},000';

/// L4 · the starter pack: short chunks with sound, one at a time. Every chunk
/// heard goes into review. It is an offer, not a gate: saving from videos is
/// open at any time, and Skip keeps the pack as a card on Today.
class StarterPackScreen extends ConsumerStatefulWidget {
  const StarterPackScreen({super.key, required this.language});
  final String language;

  @override
  ConsumerState<StarterPackScreen> createState() => _StarterPackScreenState();
}

class _StarterPackScreenState extends ConsumerState<StarterPackScreen> {
  final _heardNow = <String>{};
  bool _saving = false;
  bool _done = false;
  int? _serverHeard;

  void _back() {
    ref.invalidate(todayProvider);
    ref.invalidate(languageStateProvider);
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/today');
    }
  }

  Future<void> _next(StarterPackItem item, int total) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final p = await ref.read(apiProvider).starterPacks.complete(widget.language, [item.id]);
      ref.read(hapticsProvider).light();
      if (!mounted) return;
      setState(() {
        _heardNow.add(item.id);
        _serverHeard = p.heard;
        _saving = false;
        _done = p.done;
      });
      if (p.done) ref.read(hapticsProvider).success();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _skip() async {
    setState(() => _saving = true);
    try {
      ref.read(languageStateProvider.notifier).replace(await ref.read(apiProvider).starterPacks.skip(widget.language));
    } catch (e) {
      // Skipping is only a note for Today; leaving works without it.
      debugPrint('skip-starter-pack failed: $e');
    }
    if (mounted) _back();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final caps = capsOf(ref, widget.language);
    final pack = ref.watch(starterPackProvider(widget.language));
    final l1 = ref.watch(l1Provider).value;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) {
          ref.invalidate(todayProvider);
          ref.invalidate(languageStateProvider);
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: AsyncBody<StarterPack>(
            value: pack,
            onRetry: () => ref.invalidate(starterPackProvider(widget.language)),
            errorTitle: "We couldn't load the starter pack.",
            loading: const Padding(padding: EdgeInsets.all(16), child: SkeletonList(count: 4)),
            data: (p) {
              final heard = {...p.heard, ..._heardNow};
              final total = p.items.length;
              final count = _serverHeard ?? heard.length;
              final next = p.items.where((i) => !heard.contains(i.id)).firstOrNull;
              final done = _done || next == null;
              final groups = <String, (int, int)>{};
              for (final i in p.items) {
                final (h, t) = groups[i.group] ?? (0, 0);
                groups[i.group] = (h + (heard.contains(i.id) ? 1 : 0), t + 1);
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
                    child: Row(children: [StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Today', iconSize: 24, onPressed: _back)]),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      children: [
                        StEyebrow('${caps.name} · A1 start'),
                        const SizedBox(height: 6),
                        Semantics(header: true, child: Text('Starter pack', style: StType.headline.copyWith(color: c.textStrong))),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(child: Text('$count of $total chunks heard', style: StType.labelMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w800))),
                            Text(done ? 'Done' : 'About 2 min a day', style: StType.bodySmall.copyWith(color: c.textMuted)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        StProgressBar(value: total == 0 ? 0 : count / total, max: 1, color: StBadgeColor.accent, semanticLabel: '$count of $total chunks heard'),
                        const SizedBox(height: 10),
                        Text(
                          done
                              ? 'Well done. ${caps.name} review cards are ready on Today.'
                              : 'Short, useful ${caps.name} with sound. Every chunk goes into your review. You can save phrases from videos at any time.',
                          style: StType.bodyMedium.copyWith(color: c.textMuted),
                        ),
                        const SizedBox(height: 16),
                        if (done)
                          StCard(
                            child: Column(
                              children: [
                                StIcon(StIcons.checkDuo, size: 34, color: c.jade600),
                                const SizedBox(height: 8),
                                Semantics(
                                  liveRegion: true,
                                  child: Text('You finished the starter pack', textAlign: TextAlign.center, style: StType.titleMedium.copyWith(color: c.textStrong)),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'All $total chunks are in your review. Saving ${caps.name} from videos and web pages is open now.',
                                  textAlign: TextAlign.center,
                                  style: StType.bodyMedium.copyWith(color: c.textMuted),
                                ),
                              ],
                            ),
                          )
                        else
                          _ChunkCard(item: next, language: widget.language, l1Rtl: l1?.rtl ?? false),
                        if (!done && groups.length > 1) ...[
                          const SizedBox(height: 18),
                          const StEyebrow('Groups'),
                          const SizedBox(height: 8),
                          for (final e in groups.entries)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  StIcon(e.value.$1 >= e.value.$2 ? StIcons.checkDuo : StIcons.playCircle, size: 22, color: e.value.$1 >= e.value.$2 ? c.jade600 : c.textMuted),
                                  const SizedBox(width: 10),
                                  Expanded(child: Text(groupName(e.key), style: StType.bodyMedium.copyWith(color: c.textStrong))),
                                  Text('${e.value.$1} of ${e.value.$2}', style: StType.bodySmall.copyWith(color: c.textMuted)),
                                ],
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: done
                        ? StButton(label: 'Go to Today', size: StSize.lg, block: true, onPressed: _back)
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              StButton(label: 'Next chunk', size: StSize.lg, block: true, loading: _saving, onPressed: _saving ? null : () => _next(next, total)),
                              const SizedBox(height: 4),
                              Center(
                                child: StButton(label: 'Skip the starter pack for now', size: StSize.sm, variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: _saving ? null : _skip),
                              ),
                              Text('You can come back from Today at any time.', textAlign: TextAlign.center, style: StType.bodySmall.copyWith(color: c.textMuted)),
                            ],
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ChunkCard extends StatelessWidget {
  const _ChunkCard({required this.item, required this.language, required this.l1Rtl});
  final StarterPackItem item;
  final String language;
  final bool l1Rtl;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return StCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: StEyebrow('Next chunk', color: c.textMuted)),
              StBadge(bandLabel(item.band), color: StBadgeColor.info),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: Text(item.text, style: StType.titleLarge.copyWith(color: c.textStrong))),
              SpeakButton(text: item.text, language: language, audioUrl: item.audioUrl, icon: StIcons.playCircle),
            ],
          ),
          const SizedBox(height: 6),
          StL1Text(item.translation, rtl: l1Rtl, style: StType.bodyLarge.copyWith(color: c.textBody)),
        ],
      ),
    );
  }
}
