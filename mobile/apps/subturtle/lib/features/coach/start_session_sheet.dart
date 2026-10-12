import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:record/record.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../capture/bundle_picker.dart';
import '../live_session/session_launch.dart';
import '../phrase/phrase_parts.dart';
import 'voice_cap_sheet.dart';

/// Opens S12 · Start a session. [bundleId] pre-selects a bundle.
Future<void> openStartSession(BuildContext context, WidgetRef ref, {String? bundleId}) {
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfaceCard,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => StartSessionSheet(bundleId: bundleId),
  );
}

enum CoachMode { voice, text }

class StartSessionSheet extends ConsumerStatefulWidget {
  const StartSessionSheet({super.key, this.bundleId});
  final String? bundleId;

  @override
  ConsumerState<StartSessionSheet> createState() => _StartSessionSheetState();
}

class _StartSessionSheetState extends ConsumerState<StartSessionSheet> {
  Bundle? _bundle;
  CoachMode? _mode;
  String? _voice;
  bool _starting = false;
  String? _error;
  bool _micDenied = false;

  @override
  void initState() {
    super.initState();
    _voice = ref.read(settingsProvider).lastVoice;
    _pickDefaultBundle();
  }

  Future<void> _pickDefaultBundle() async {
    final bundles = await ref.read(bundlesProvider.future).catchError((_) => <Bundle>[]);
    final info = await ref.read(phraseInfoProvider.future).catchError((_) => const PhraseManagementInfo());
    final withPhrases = bundles.where((b) => b.phraseCount > 0).toList();
    Bundle? pick = bundles.where((b) => b.id == (widget.bundleId ?? ref.read(settingsProvider).lastBundleId)).firstOrNull;
    if (pick == null && withPhrases.isNotEmpty) {
      withPhrases.sort((a, b) => info.dueIn(b).compareTo(info.dueIn(a)));
      pick = withPhrases.first;
    }
    if (mounted) setState(() => _bundle = pick);
  }

  CoachMode _effectiveMode(SubscriptionDetails? sub) => _mode ?? (sub != null && sub.hasVoice && sub.voiceRemaining > 0 ? CoachMode.voice : CoachMode.text);

  Future<void> _start() async {
    final sub = ref.read(subscriptionProvider).value;
    final bundle = _bundle;
    if (bundle == null) return setState(() => _error = 'Choose a bundle first.');
    var mode = _effectiveMode(sub);
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      if (mode == CoachMode.voice) {
        if (sub != null && sub.voiceRemaining <= 0) {
          setState(() => _starting = false);
          final choice = await showVoiceCapSheet(context, sub);
          if (!mounted) return;
          if (choice == VoiceCapChoice.getMore) {
            Navigator.pop(context);
            GoRouter.of(context).go('/me/plan');
            return;
          }
          if (choice != VoiceCapChoice.useText) return;
          mode = CoachMode.text;
          setState(() {
            _mode = mode;
            _starting = true;
          });
        } else {
          // Ask for the mic here, on the first Start tap, with the reason already on screen.
          final recorder = AudioRecorder();
          final allowed = await recorder.hasPermission();
          await recorder.dispose();
          if (!allowed) {
            setState(() {
              _micDenied = true;
              _mode = CoachMode.text;
              _starting = false;
            });
            return;
          }
        }
      }

      final api = ref.read(apiProvider);
      final ids = bundle.phraseIds.reversed.take(SessionLaunch.maxPhrases).toList();
      final phrases = await api.bundles.getPhrases(ids);
      if (phrases.isEmpty) throw ApiException('This bundle has no phrases yet.');
      final lang = ref.read(languageProvider).value;
      final voice = _voice ?? 'Kore';
      ref.read(settingsProvider.notifier).setLastBundle(bundle.id);
      ref.read(settingsProvider.notifier).setLastVoice(voice);
      final launch = SessionLaunch(bundle: bundle, phrases: phrases, voice: voice, nativeLanguage: lang?.name ?? 'auto');
      if (!mounted) return;
      final router = GoRouter.of(context);
      Navigator.pop(context);
      router.push(mode == CoachMode.voice ? '/coach/voice' : '/coach/text', extra: launch);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException && e.code == null && !e.isNetwork ? e.message : friendlyError(e));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final sub = ref.watch(subscriptionProvider).value;
    final info = ref.watch(phraseInfoProvider).value;
    final voices = ref.watch(voicesProvider).value ?? CoachVoice.fallback;
    final mode = _effectiveMode(sub);
    final voice = voices.firstWhere((v) => v.name == _voice, orElse: () => voices.first);
    final due = _bundle == null ? 0 : info?.dueIn(_bundle!) ?? 0;

    return StSheet(
      eyebrow: 'AI coaching',
      title: 'Start a session',
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Semantics(liveRegion: true, child: Text(_error!, style: StType.bodyMedium.copyWith(color: c.red600)))),
          StButton(
            label: mode == CoachMode.voice ? 'Start voice chat' : 'Start text chat',
            icon: StIcons.play,
            size: StSize.lg,
            block: true,
            loading: _starting,
            onPressed: _bundle == null ? null : _start,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _label(context, 'Bundle'),
          StPickerRow(
            value: _bundle == null ? 'Choose a bundle' : (due > 0 ? '${_bundle!.title} · $due due' : _bundle!.title),
            leading: StIcon(StIcons.notebook, size: 20, color: c.rose600),
            semanticLabel: 'Bundle: ${_bundle?.title ?? 'none'}. Change',
            onTap: () async {
              final b = await pickBundle(context, current: _bundle?.id);
              if (b != null) setState(() => _bundle = b);
            },
          ),
          const SizedBox(height: 18),
          _label(context, 'Mode'),
          StSegmentedControl<CoachMode>(
            block: true,
            segments: const [StSegment(CoachMode.voice, 'Voice', icon: StIcons.mic), StSegment(CoachMode.text, 'Text', icon: StIcons.keyboard)],
            value: mode,
            onChanged: (m) => setState(() {
              _mode = m;
              _micDenied = false;
            }),
          ),
          const SizedBox(height: 18),
          if (mode == CoachMode.voice) ...[
            _label(context, 'Coach voice'),
            StPickerRow(
              value: voice.label,
              leading: StAvatar(name: voice.label, size: StAvatarSize.xs, background: _hex(voice.avatarColor), foreground: Colors.white),
              trailingIcon: StIcons.chevronDown,
              semanticLabel: 'Coach voice: ${voice.label}. Change',
              onTap: () => _pickVoice(voices),
            ),
            const SizedBox(height: 14),
            if (sub != null && sub.hasVoice) _VoiceMeter(sub: sub),
            const SizedBox(height: 10),
            Text(
              _micDenied ? 'Mic is off. Turn on the microphone for Subturtle in your phone settings, or use text.' : 'Subturtle needs the mic so you can talk to your coach. Use headphones for the best result.',
              style: StType.bodySmall.copyWith(color: _micDenied ? c.red600 : c.textMuted),
            ),
          ] else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: StRadius.brMd),
              child: Text(
                _micDenied ? 'Mic is off, so we switched to text chat.' : _textNote(sub),
                style: StType.bodyMedium.copyWith(color: c.textMuted),
              ),
            ),
        ],
      ),
    );
  }

  String _textNote(SubscriptionDetails? sub) {
    final base = 'Text chat does not use voice minutes.';
    if (sub == null || sub.textChats.unlimited) return base;
    return '$base ${sub.textChats.remaining} of ${sub.textChats.total} text chats left this month.';
  }

  Widget _label(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: StType.base(size: 14, weight: FontWeight.w700).copyWith(color: context.st.textStrong)),
      );

  Future<void> _pickVoice(List<CoachVoice> voices) async {
    final picked = await showStBottomSheet<String>(
      context: context,
      builder: (ctx) => StSheet(
        title: 'Coach voice',
        child: Column(
          children: [
            for (final v in voices)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ListRowCard(
                  minHeight: 56,
                  leading: StAvatar(name: v.label, size: StAvatarSize.sm, background: _hex(v.avatarColor), foreground: Colors.white),
                  title: Text(v.label, style: StType.titleSmall.copyWith(color: ctx.st.textStrong)),
                  subtitle: Text(v.description, style: StType.bodySmall.copyWith(color: ctx.st.textMuted)),
                  trailing: SpeakButton(
                    text: "Hi, I'm your coach. Ready when you are.",
                    voiceName: coachPreviewVoice[v.name] ?? 'en-US-Standard-A',
                    semanticLabel: 'Hear ${v.label}',
                    icon: StIcons.playCircle,
                  ),
                  semanticLabel: '${v.label}. ${v.description}${v.name == _voice ? ', selected' : ''}',
                  onTap: () => Navigator.pop(ctx, v.name),
                ),
              ),
            Text('The sample is close to the coach voice, not the same.', style: StType.bodySmall.copyWith(color: ctx.st.textMuted)),
          ],
        ),
      ),
    );
    if (picked != null) setState(() => _voice = picked);
  }
}

Color? _hex(String? hex) {
  if (hex == null || !hex.startsWith('#') || hex.length != 7) return null;
  return Color(int.parse('FF${hex.substring(1)}', radix: 16));
}

/// "Only 18 of 90 voice minutes left this month" (amber at 80% used, red at 100%).
class _VoiceMeter extends StatelessWidget {
  const _VoiceMeter({required this.sub});
  final SubscriptionDetails sub;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final total = sub.voiceTotal;
    final left = sub.voiceRemaining;
    final low = left <= total * 0.2;
    final color = left == 0 ? StBadgeColor.danger : (low ? StBadgeColor.warning : StBadgeColor.primary);
    final text = sub.isFreemium
        ? 'Free voice chats are up to 5 minutes each. $left ${left == 1 ? 'minute' : 'minutes'} left.'
        : low
            ? 'Only $left of $total voice minutes left this month'
            : '$left of $total voice minutes left this month';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: low ? c.warningSoft : c.surfaceSunken, borderRadius: StRadius.brMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StIcon(StIcons.clock, size: 18, color: low ? c.amber600 : c.textMuted),
              const SizedBox(width: 8),
              Expanded(child: Text(text, style: StType.bodyMedium.copyWith(color: low ? c.amber600 : c.textBody, fontWeight: FontWeight.w800))),
            ],
          ),
          const SizedBox(height: 8),
          StProgressBar(value: (total - left).toDouble(), max: total.toDouble(), color: color, size: StSize3.sm, semanticLabel: 'Voice minutes used'),
        ],
      ),
    );
  }
}

/// Used by Coach home and Me.
String voiceLine(SubscriptionDetails sub) {
  if (!sub.hasVoice) return 'Text chat only';
  return '${sub.voiceRemaining} of ${sub.voiceTotal} voice minutes left';
}
