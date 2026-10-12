import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
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

  Future<void> _end() async {
    // Ask only when the session is very short, to catch a mis-tap.
    if (_voice.status == VoiceStatus.live && _voice.elapsed.inSeconds < 30) {
      final ok = await confirmSheet(context, title: 'End the session?', confirm: 'End', cancel: 'Keep talking');
      if (!ok) return;
    }
    await _voice.end();
    ref.invalidate(subscriptionProvider);
    ref.invalidate(coachHistoryProvider);
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
            PhraseStrip(phrases: widget.launch.phrases, active: v.active, done: v.done, onTap: v.selectPhrase),
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
    if (v.status == VoiceStatus.ended) {
      final practised = v.done.length + (v.active >= 0 ? 1 : 0);
      return Center(
        child: StEmptyState(
          icon: StIcons.confetti,
          color: StBadgeColor.accent,
          title: 'Session done',
          description: '${Fmt.minutes(v.elapsed)} talked · ${Fmt.plural(practised, 'phrase')} practised. The transcript is in Coach.',
          action: StButton(label: 'Back to Coach', onPressed: _leave),
        ),
      );
    }
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
    final status = switch (v.status) {
      VoiceStatus.connecting => 'Connecting…',
      VoiceStatus.reconnecting => 'Trying to reconnect…',
      VoiceStatus.capReached => 'Muted',
      _ => v.muted ? 'Muted' : (v.coachSpeaking ? 'Coach is speaking' : 'Listening'),
    };
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        children: [
          const SizedBox(height: 12),
          _CoachOrb(speaking: v.coachSpeaking && !connecting, dimmed: connecting),
          const SizedBox(height: 18),
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
          const SizedBox(height: 18),
          if (v.captions && (v.coachLine.isNotEmpty || v.userLine.isNotEmpty))
            StCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const StEyebrow.section('Captions'),
                  const SizedBox(height: 6),
                  if (v.coachLine.isNotEmpty) ChatBubble(text: v.coachLine, fromUser: false, phrases: widget.launch.phrases),
                  if (v.userLine.isNotEmpty) ChatBubble(text: v.userLine, fromUser: true),
                ],
              ),
            ),
        ],
      ),
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
                icon: v.captions ? StIcons.captions : StIcons.captionsOff,
                semanticLabel: v.captions ? 'Captions on' : 'Captions off',
                size: StSize.lg,
                round: true,
                onPressed: v.toggleCaptions,
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
  const _CoachOrb({required this.speaking, required this.dimmed});
  final bool speaking;
  final bool dimmed;

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
            child: Container(
              width: 132,
              height: 132,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c.rose400, c.rose600]),
                boxShadow: [
                  ...context.stShadows.primary,
                  BoxShadow(color: c.rose500.withValues(alpha: alpha), spreadRadius: ring),
                ],
              ),
              alignment: Alignment.center,
              child: const StIcon(StIcons.soundwave, size: 56, color: Colors.white),
            ),
          );
        },
      ),
    );
  }
}
