import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../shared/format.dart';
import '../phrase/phrase_parts.dart';
import '../phrase/phrase_sheet.dart';
import '../today/today_screen.dart';

/// S6 · End-of-session summary. A full page (the tab bar stays hidden).
class SummaryView extends ConsumerWidget {
  const SummaryView({
    super.key,
    required this.reviewed,
    required this.learned,
    required this.forgot,
    required this.elapsed,
    this.again = const [],
    this.unsent = 0,
    this.pool = false,
  });

  final int reviewed;
  final int learned;
  final int forgot;
  final Duration elapsed;

  /// Phrases marked Forgot, to look at again.
  final List<Phrase> again;

  /// Grades that could not be sent (offline).
  final int unsent;

  /// The Pool version: "N new words are now in your review box".
  final bool pool;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final today = ref.watch(todayProvider).value;
    final nextPool = !pool && (today?.pool.isNotEmpty ?? false) ? today!.pool.length : 0;
    final minutes = elapsed.inMinutes < 1 ? '<1m' : '${elapsed.inMinutes}m';
    return Stack(
      children: [
        Positioned(
          top: -160,
          left: -40,
          child: IgnorePointer(
            child: Container(
              width: 460,
              height: 460,
              decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [c.jade500.withValues(alpha: 0.12), c.jade500.withValues(alpha: 0)], stops: const [0, 0.65])),
            ),
          ),
        ),
        SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 40, 16, 24),
            children: [
              Center(
                child: Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(StRadius.x2l)),
                  alignment: Alignment.center,
                  child: StIcon(StIcons.confetti, size: 48, color: c.jade600),
                ),
              ),
              const SizedBox(height: 12),
              Center(child: StEyebrow(pool ? 'First look done' : 'Session done', color: c.jade600)),
              const SizedBox(height: 12),
              Semantics(
                header: true,
                liveRegion: true,
                child: Text(
                  pool ? '${Fmt.plural(reviewed, 'new word')} ${reviewed == 1 ? 'is' : 'are'} now in your review box.' : 'Nice work. $reviewed reviewed.',
                  textAlign: TextAlign.center,
                  style: StType.headline.copyWith(color: c.textStrong, height: 1.2),
                ),
              ),
              const SizedBox(height: 20),
              if (!pool)
                Row(
                  children: [
                    Expanded(child: StStatTile(icon: StIcons.checkDuo, value: '$learned', label: 'Learned', accent: StBadgeColor.accent)),
                    const SizedBox(width: 8),
                    Expanded(child: StStatTile(icon: StIcons.refreshCircle, value: '$forgot', label: 'To review', accent: StBadgeColor.warning)),
                    const SizedBox(width: 8),
                    Expanded(child: StStatTile(icon: StIcons.clock, value: minutes, label: 'Time', accent: StBadgeColor.info)),
                  ],
                ),
              if (unsent > 0) ...[
                const SizedBox(height: 12),
                Text("${Fmt.plural(unsent, 'answer')} could not be sent. Check your connection; we'll try again next time.", style: StType.bodySmall.copyWith(color: c.amber600)),
              ],
              if (again.isNotEmpty) ...[
                const SizedBox(height: 20),
                const StEyebrow.section('Look at these again'),
                const SizedBox(height: 8),
                for (final p in again)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _AgainRow(phrase: p),
                  ),
              ],
              const SizedBox(height: 28),
              StButton(label: 'Back to today', icon: StIcons.rocket, size: StSize.lg, block: true, onPressed: () => context.go('/today')),
              if (nextPool > 0) ...[
                const SizedBox(height: 10),
                StButton(
                  label: 'Next: ${Fmt.plural(nextPool, 'new word')}',
                  icon: StIcons.stars,
                  variant: StButtonVariant.soft,
                  tone: StTone.accent,
                  size: StSize.lg,
                  block: true,
                  onPressed: () => context.pushReplacement('/pool'),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _AgainRow extends ConsumerWidget {
  const _AgainRow({required this.phrase});
  final Phrase phrase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    return Semantics(
      button: true,
      label: '${phrase.phrase}. ${phrase.translation}',
      excludeSemantics: true,
      child: StPressable(
        onTap: () => openPhraseSheet(context, phrase),
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 60),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd, border: Border.all(color: c.borderSubtle)),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(phrase.phrase, style: StType.titleSmall.copyWith(color: c.textStrong)),
                    StL1Text(phrase.translation, rtl: l1IsRtl(ref, phrase), maxLines: 1, style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w400)),
                  ],
                ),
              ),
              StIcon(StIcons.chevronRight, size: 20, color: c.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}
