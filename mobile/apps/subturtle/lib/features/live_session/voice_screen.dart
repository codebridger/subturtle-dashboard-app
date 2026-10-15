import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/format.dart';
import '../coach/coach_home_screen.dart';
import 'chat_bubbles.dart';
import 'session_launch.dart';
import 'voice_controller.dart';

/// S13 · Live session, voice. It works like a phone call: the mic is open from
/// the start and the big button mutes it.
class VoiceScreen extends ConsumerStatefulWidget {
  const VoiceScreen({super.key, required this.launch});
  final SessionLaunch launch;

  @override
  ConsumerState<VoiceScreen> createState() => _VoiceScreenState();
}

class _VoiceScreenState extends ConsumerState<VoiceScreen> {
  late final VoiceController _voice;

  @override
  void initState() {
    super.initState();
    final sub = ref.read(subscriptionProvider).value;
    final haptics = ref.read(hapticsProvider);
    _voice = VoiceController(
      repo: ref.read(apiProvider).liveSessions,
      launch: widget.launch,
      isFreemium: sub?.isFreemium ?? true,
      onHaptic: (k) => k == 'warning' ? haptics.warning() : haptics.light(),
    )..addListener(_changed);
    _voice.start();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _voice.removeListener(_changed);
    _voice.dispose();
    super.dispose();
  }

  /// Ends at once, as on the web. With nothing practised there is no recap:
  /// go straight back.
  Future<void> _end() async {
    await _voice.end();
    ref.invalidate(subscriptionProvider);
    ref.invalidate(coachHistoryProvider);
    if (_voice.done.isEmpty && mounted) _leave();
  }

  void _leave() {
    ref.invalidate(subscriptionProvider);
    ref.invalidate(coachHistoryProvider);
    context.pop();
  }

  void _switchToText() async {
    await _voice.end();
    if (!mounted) return;
    final router = GoRouter.of(context);
    router.pop();
    router.push('/coach/text', extra: widget.launch);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final v = _voice;
    final timerText = v.maxSeconds > 0 && v.isFreemium ? Fmt.clock(v.remaining.isNegative ? Duration.zero : v.remaining) : Fmt.clock(v.elapsed);
    return PopScope(
      canPop: v.status == VoiceStatus.ended || v.status == VoiceStatus.error,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _end();
      },
      child: Scaffold(
        body: Column(
          children: [
            Container(
              decoration: BoxDecoration(color: c.surfaceCard, border: Border(bottom: BorderSide(color: c.borderSubtle))),
              padding: EdgeInsets.fromLTRB(4, MediaQuery.paddingOf(context).top + 4, 8, 6),
              child: Row(
                children: [
                  Semantics(
                    button: true,
                    label: 'End session',
                    excludeSemantics: true,
                    child: StPressable(
                      onTap: v.status == VoiceStatus.ended || v.status == VoiceStatus.error ? _leave : _end,
                      child: SizedBox(
                        height: 48,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: Row(children: [StIcon(StIcons.close, size: 24, color: c.textStrong), const SizedBox(width: 6), Text('End', style: StType.label.copyWith(color: c.textStrong))]),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        // The timer is not announced every second; see the status line instead.
                        ExcludeSemantics(
                          child: Text(
                            timerText,
                            style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: v.timerLow ? c.amber600 : c.textFaint, fontFeatures: const [FontFeature.tabularFigures()]),
                          ),
                        ),
                        Text(widget.launch.bundle.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.label.copyWith(color: c.textStrong)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 80),
                ],
              ),
            ),
            PhraseStrip(phrases: widget.launch.phrases, active: v.active, done: v.done, onTap: v.selectPhrase, showTranslations: v.showTranslations),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
              child: Text('${v.done.length} of ${widget.launch.phrases.length} practised', style: StType.bodySmall.copyWith(color: c.textMuted)),
            ),
            Expanded(child: _center(context)),
            _bottom(context),
          ],
        ),
      ),
    );
  }

  Widget _center(BuildContext context) {
    final c = context.st;
    final v = _voice;
    if (v.status == VoiceStatus.ended) return _Recap(phrases: widget.launch.phrases, done: v.done, onDone: _leave);
    if (v.status == VoiceStatus.error) {
      final e = v.error;
      final plan = e is ApiException && (e.isTierLimit || e.code == ApiException.voicePaused || e.code == ApiException.aiCreditExhausted);
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              StEmptyState(
                compact: true,
                icon: StIcons.danger,
                color: StBadgeColor.warning,
                title: plan ? friendlyError(e) : 'Connection lost',
                description: plan ? null : 'Voice minutes are not counted while you are disconnected.',
              ),
              if (!plan) StButton(label: 'Try again', icon: StIcons.refresh, onPressed: v.retry),
              const SizedBox(height: 8),
              StButton(label: 'Use text chat instead', variant: StButtonVariant.outline, tone: StTone.neutral, icon: StIcons.keyboard, onPressed: _switchToText),
            ],
          ),
        ),
      );
    }
    final connecting = v.status == VoiceStatus.connecting || v.status == VoiceStatus.reconnecting;
    // The web's status words (live-practice.status.*), touch version.
    final status = switch (v.status) {
      VoiceStatus.connecting => 'Connecting…',
      VoiceStatus.reconnecting => 'Reconnecting…',
      VoiceStatus.capReached => 'Muted',
      _ => v.coachSpeaking ? 'Coach is speaking…' : (v.muted ? 'Tap the mic to speak' : 'Listening — go ahead'),
    };
    final lines = v.transcript.where((l) => l.text.trim().isNotEmpty).toList();
    final activePhrase = v.active >= 0 ? widget.launch.phrases[v.active].phrase : null;
    return Column(
      children: [
        const SizedBox(height: 12),
        _CoachOrb(speaking: v.coachSpeaking && !connecting, dimmed: connecting, size: lines.isEmpty ? 150 : 96),
        const SizedBox(height: 12),
        Semantics(
          liveRegion: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (connecting) ...[SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: c.rose600)), const SizedBox(width: 8)],
              Text(status, style: StType.base(size: 14, weight: FontWeight.w800).copyWith(color: c.rose600)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: lines.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    children: [
                      Text.rich(
                        activePhrase == null
                            ? const TextSpan(text: 'Tap any vocabulary card to start practicing')
                            : TextSpan(children: [const TextSpan(text: 'Currently practicing: '), TextSpan(text: activePhrase, style: const TextStyle(fontWeight: FontWeight.w900))]),
                        textAlign: TextAlign.center,
                        style: StType.bodyMedium.copyWith(color: c.textBody),
                      ),
                      const SizedBox(height: 4),
                      Text('Your conversation will appear here.', textAlign: TextAlign.center, style: StType.bodySmall.copyWith(color: c.textMuted)),
                    ],
                  ),
                )
              // Newest at the bottom, kept in view as the conversation grows.
              : ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  itemCount: lines.length,
                  itemBuilder: (_, i) {
                    final l = lines[lines.length - 1 - i];
                    return Column(
                      crossAxisAlignment: l.fromUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(bottom: 2, left: 4, right: 4),
                          child: Text(l.fromUser ? 'You' : 'Coach', style: StType.labelMedium.copyWith(color: c.textFaint)),
                        ),
                        ChatBubble(text: l.text, fromUser: l.fromUser, phrases: l.fromUser ? const [] : widget.launch.phrases),
                      ],
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _bottom(BuildContext context) {
    final c = context.st;
    final v = _voice;
    final sub = ref.watch(subscriptionProvider).value;
    final bottomPad = MediaQuery.paddingOf(context).bottom + 16;
    if (v.status == VoiceStatus.ended || v.status == VoiceStatus.error) return SizedBox(height: bottomPad);
    if (v.status == VoiceStatus.capReached) {
      // No popup over the coach: the bottom area changes instead.
      return Container(
        padding: EdgeInsets.fromLTRB(16, 16, 16, bottomPad),
        decoration: BoxDecoration(color: c.warningSoft, border: Border(top: BorderSide(color: c.borderSubtle))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              liveRegion: true,
              child: Text(v.isFreemium ? 'Your free 5 minutes are up.' : 'You have used your voice minutes.', textAlign: TextAlign.center, style: StType.titleMedium.copyWith(color: c.textStrong)),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (AppConfig.purchaseLinks) ...[
                Expanded(
                  child: StButton(
                    label: v.isFreemium ? 'See plans' : 'Get more minutes',
                    block: true,
                    onPressed: () async {
                      await v.end();
                      if (context.mounted) context.go('/me/plan');
                    },
                  ),
                ),
                const SizedBox(width: 10),
                ],
                Expanded(child: StButton(label: 'Continue in text', variant: StButtonVariant.outline, tone: StTone.neutral, block: true, onPressed: _switchToText)),
              ],
            ),
          ],
        ),
      );
    }
    final minutesLeft = sub == null || v.maxSeconds <= 0 ? null : (v.remaining.inSeconds / 60).ceil();
    return Padding(
      padding: EdgeInsets.fromLTRB(40, 8, 40, bottomPad),
      child: Column(
        children: [
          if (minutesLeft != null && !(sub?.isFreemium ?? true))
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: StBadge(
                '${Fmt.plural(minutesLeft, 'minute')} left this month',
                color: v.timerLow ? StBadgeColor.warning : StBadgeColor.neutral,
                icon: StIcons.clock,
              ),
            ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              StIconButton(
                icon: v.showTranslations ? StIcons.captions : StIcons.captionsOff,
                semanticLabel: v.showTranslations ? 'Hide translations' : 'Show translations',
                size: StSize.lg,
                round: true,
                onPressed: v.toggleTranslations,
              ),
              _MuteButton(muted: v.muted, enabled: v.status == VoiceStatus.live, onTap: v.toggleMute),
              StIconButton(icon: StIcons.keyboard, semanticLabel: 'End and continue in text', size: StSize.lg, round: true, onPressed: _switchToText),
            ],
          ),
        ],
      ),
    );
  }
}

class _MuteButton extends StatelessWidget {
  const _MuteButton({required this.muted, required this.enabled, required this.onTap});
  final bool muted;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      enabled: enabled,
      label: muted ? 'Muted. Double-tap to unmute.' : 'Microphone on. Double-tap to mute.',
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: StPressable(
          onTap: enabled ? onTap : null,
          pressedScale: 0.94,
          child: Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: muted ? Colors.transparent : c.surfaceInverse,
              border: muted ? Border.all(color: c.ink900, width: 2) : null,
              boxShadow: muted ? null : context.stShadows.lg,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                StIcon(muted ? StIcons.micOff : StIcons.mic, size: 30, color: muted ? c.ink900 : c.paper),
                const SizedBox(height: 2),
                Text(muted ? 'Unmute' : 'Mute', style: StType.base(size: 12, weight: FontWeight.w800, height: 1).copyWith(color: muted ? c.ink900 : c.paper)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The coach "avatar": a rose orb whose ring pulses while the coach speaks
/// (a static ring under reduced motion).
class _CoachOrb extends StatefulWidget {
  const _CoachOrb({required this.speaking, required this.dimmed, this.size = 132});
  final bool speaking;
  final bool dimmed;

  /// Smaller once the conversation needs the room.
  final double size;

  @override
  State<_CoachOrb> createState() => _CoachOrbState();
}

class _CoachOrbState extends State<_CoachOrb> with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(vsync: this, duration: StMotion.voicePulse);

  @override
  void didUpdateWidget(covariant _CoachOrb old) {
    super.didUpdateWidget(old);
    _sync();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  void _sync() {
    final animate = widget.speaking && !StMotion.reduced(context);
    if (animate && !_ctrl.isAnimating) _ctrl.repeat();
    if (!animate && _ctrl.isAnimating) _ctrl.stop();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final reduced = StMotion.reduced(context);
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          final t = StMotion.easeOut.transform(_ctrl.value);
          final ring = widget.speaking ? (reduced ? 10.0 : 26 * t) : 0.0;
          final alpha = widget.speaking ? (reduced ? 0.25 : 0.30 * (1 - t)) : 0.0;
          return Opacity(
            opacity: widget.dimmed ? 0.45 : 1,
            child: AnimatedContainer(
              duration: StMotion.base,
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c.rose400, c.rose600]),
                boxShadow: [
                  ...context.stShadows.primary,
                  BoxShadow(color: c.rose500.withValues(alpha: alpha), spreadRadius: ring),
                ],
              ),
              alignment: Alignment.center,
              child: StIcon(StIcons.soundwave, size: widget.size * 0.42, color: Colors.white),
            ),
          );
        },
      ),
    );
  }
}

/// "Practice complete": what was practised this session (the web's recap).
class _Recap extends StatelessWidget {
  const _Recap({required this.phrases, required this.done, required this.onDone});
  final List<Phrase> phrases;
  final Set<int> done;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
      children: [
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(StRadius.x2l)),
            alignment: Alignment.center,
            child: StIcon(StIcons.confetti, size: 40, color: c.jade600),
          ),
        ),
        const SizedBox(height: 16),
        Semantics(header: true, child: Text('Practice complete', textAlign: TextAlign.center, style: StType.headline.copyWith(color: c.textStrong))),
        const SizedBox(height: 6),
        Text(
          'You practiced ${done.length} of ${phrases.length} phrases this session.',
          textAlign: TextAlign.center,
          style: StType.base(size: 16, weight: FontWeight.w600).copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 20),
        for (var i = 0; i < phrases.length; i++)
          Semantics(
            label: '${phrases[i].phrase}, ${done.contains(i) ? 'practised' : 'not practised'}',
            excludeSemantics: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  StIcon(done.contains(i) ? StIcons.check : StIcons.closeBold, size: 20, color: done.contains(i) ? c.jade600 : c.textFaint),
                  const SizedBox(width: 10),
                  Expanded(child: Text(phrases[i].phrase, style: StType.titleSmall.copyWith(color: done.contains(i) ? c.textStrong : c.textMuted))),
                ],
              ),
            ),
          ),
        const SizedBox(height: 24),
        StButton(label: 'Done', size: StSize.lg, block: true, onPressed: onDone),
      ],
    );
  }
}
