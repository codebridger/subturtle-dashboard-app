import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

/// A chat bubble: coach on the left (card), learner on the right (rose tint).
/// Bundle phrases inside coach messages are bold-underlined and tappable.
class ChatBubble extends StatelessWidget {
  const ChatBubble({super.key, required this.text, required this.fromUser, this.phrases = const [], this.onPhraseTap, this.failed = false, this.onRetry});

  final String text;
  final bool fromUser;
  final List<Phrase> phrases;
  final ValueChanged<Phrase>? onPhraseTap;

  /// "Not sent · Tap to retry".
  final bool failed;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final base = StType.bodyLarge.copyWith(color: c.textStrong);
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: fromUser ? c.primaryTint : c.surfaceCard,
        border: Border.all(color: fromUser ? c.primarySoft : c.borderSubtle),
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(StRadius.lg),
          topRight: const Radius.circular(StRadius.lg),
          bottomLeft: Radius.circular(fromUser ? StRadius.lg : StRadius.xs),
          bottomRight: Radius.circular(fromUser ? StRadius.xs : StRadius.lg),
        ),
      ),
      child: Text.rich(TextSpan(style: base, children: fromUser ? [TextSpan(text: text)] : _spans(context))),
    );
    return Semantics(
      label: '${fromUser ? 'You' : 'Coach'}: $text${failed ? '. Not sent. Double-tap to retry.' : ''}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: fromUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            GestureDetector(onTap: failed ? onRetry : null, child: bubble),
            if (failed)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: GestureDetector(
                  onTap: onRetry,
                  child: Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('Not sent · Tap to retry', style: StType.bodySmall.copyWith(color: c.red600))),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<InlineSpan> _spans(BuildContext context) {
    final c = context.st;
    if (phrases.isEmpty) return [TextSpan(text: text)];
    final lower = text.toLowerCase();
    final hits = <(int, int, Phrase)>[];
    for (final p in phrases) {
      final t = p.phrase.trim().toLowerCase();
      if (t.isEmpty) continue;
      var i = lower.indexOf(t);
      while (i >= 0) {
        hits.add((i, i + t.length, p));
        i = lower.indexOf(t, i + t.length);
      }
    }
    hits.sort((a, b) => a.$1.compareTo(b.$1));
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final (s, e, p) in hits) {
      if (s < cursor) continue;
      if (s > cursor) spans.add(TextSpan(text: text.substring(cursor, s)));
      spans.add(TextSpan(
        text: text.substring(s, e),
        style: TextStyle(fontWeight: FontWeight.w800, color: c.rose700, decoration: TextDecoration.underline, decorationColor: c.rose300),
        recognizer: onPhraseTap == null ? null : (TapGestureRecognizer()..onTap = () => onPhraseTap!(p)),
      ));
      cursor = e;
    }
    if (cursor < text.length) spans.add(TextSpan(text: text.substring(cursor)));
    return spans;
  }
}

/// Three dots while the coach is typing.
class TypingBubble extends StatefulWidget {
  const TypingBubble({super.key});

  @override
  State<TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<TypingBubble> with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final reduced = StMotion.reduced(context);
    return Semantics(
      label: 'Coach is typing',
      liveRegion: true,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(color: c.surfaceCard, border: Border.all(color: c.borderSubtle), borderRadius: StRadius.brLg),
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < 3; i++)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: c.textMuted.withValues(alpha: reduced ? 0.6 : (0.3 + 0.7 * ((_ctrl.value * 3 - i) % 3 < 1 ? 1 : 0))),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The horizontal phrase cards on top of a live session: ✓ done, ● active.
class PhraseStrip extends StatelessWidget {
  const PhraseStrip({super.key, required this.phrases, required this.active, required this.done, required this.onTap});
  final List<Phrase> phrases;
  final int active;
  final Set<int> done;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return SizedBox(
      height: 72,
      child: Semantics(
        label: 'Phrases in this session',
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
          itemCount: phrases.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (context, i) {
            final isActive = i == active;
            final isDone = done.contains(i) && !isActive;
            return Semantics(
              button: true,
              selected: isActive,
              label: '${i + 1}. ${phrases[i].phrase}${isDone ? ', practised' : ''}${isActive ? ', now' : ''}. Double-tap to practise this one.',
              excludeSemantics: true,
              child: StPressable(
                onTap: () => onTap(i),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: isActive ? c.primaryTint : c.surfaceCard,
                        borderRadius: StRadius.brMd,
                        border: Border.all(color: isActive ? c.primary : c.borderSubtle, width: isActive ? 1.5 : 1),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(isActive ? '${i + 1} · now' : '${i + 1}', style: StType.base(size: 11, weight: FontWeight.w800).copyWith(color: isActive ? c.rose600 : c.textFaint)),
                          Text(phrases[i].phrase, style: StType.base(size: 14, weight: FontWeight.w800).copyWith(color: isActive || isDone ? c.textStrong : c.textMuted)),
                        ],
                      ),
                    ),
                    if (isDone)
                      Positioned(
                        top: -7,
                        right: -7,
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                          alignment: Alignment.center,
                          child: StIcon(StIcons.check, size: 14, color: c.onAccent),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
