import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/languages.dart';

/// The learner's language, if known yet (for RTL and the language badge).
AppLanguage? currentLanguage(WidgetRef ref) => ref.watch(languageProvider).value;

/// RTL for L1 text: decided by the user's L1 setting; falls back to the
/// direction the phrase was saved with.
bool l1IsRtl(WidgetRef ref, Phrase p) => currentLanguage(ref)?.rtl ?? p.translationIsRtl;

/// Part of speech + formality chips.
class PhraseTags extends StatelessWidget {
  const PhraseTags({super.key, required this.phrase, this.extra});
  final Phrase phrase;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final l = phrase.linguistic;
    final tags = [
      if (l != null && l.type.isNotEmpty) l.type,
      if (l != null && l.formality.isNotEmpty && l.formality != 'neutral') l.formality,
    ];
    if (tags.isEmpty && extra == null) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [for (final t in tags) StTag(t), ?extra],
    );
  }
}

/// The answer side: L1 translation, definition, transliteration, chunk notes.
class AnswerBlock extends ConsumerWidget {
  const AnswerBlock({super.key, required this.phrase, this.showLabel = true, this.translationOverride});
  final Phrase phrase;
  final bool showLabel;
  final Widget? translationOverride;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final lang = currentLanguage(ref);
    final rtl = l1IsRtl(ref, phrase);
    final l = phrase.linguistic;
    final chunks = phrase.chunks.where((ch) => ch.text.trim().isNotEmpty && ch.text.trim().toLowerCase() != phrase.phrase.trim().toLowerCase()).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showLabel) ...[
          Row(
            children: [
              const StEyebrow.section('Answer'),
              const Spacer(),
              if (lang != null) StBadge(lang.name, icon: StIcons.translation),
            ],
          ),
          const SizedBox(height: 10),
        ],
        translationOverride ??
            StL1Text(
              phrase.translation,
              rtl: rtl,
              languageName: lang?.name,
              style: StType.base(size: 22, weight: FontWeight.w600, height: 1.4).copyWith(color: c.textStrong),
            ),
        if (l != null && l.definition.isNotEmpty) ...[
          const SizedBox(height: 10),
          StL1Text(l.definition, rtl: rtl, style: StType.bodyLarge.copyWith(color: c.textBody)),
        ],
        if (l != null && l.transliteration.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(l.transliteration, style: StType.bodyMedium.copyWith(color: c.textMuted)),
        ],
        for (final ch in chunks) ...[
          const SizedBox(height: 12),
          ChunkNote(chunk: ch, rtl: rtl),
        ],
      ],
    );
  }
}

/// "had to — something you needed to do" in a soft jade box.
class ChunkNote extends StatelessWidget {
  const ChunkNote({super.key, required this.chunk, required this.rtl});
  final Chunk chunk;
  final bool rtl;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: c.accentTint, border: Border.all(color: c.accentSoft), borderRadius: StRadius.brMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            chunk.text,
            style: StType.base(size: 15, weight: FontWeight.w800).copyWith(color: c.jade700, decoration: TextDecoration.underline, decorationColor: c.accent, decorationThickness: 2),
          ),
          if ((chunk.definition ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            StL1Text(chunk.definition!, rtl: rtl, style: StType.bodyMedium.copyWith(color: c.textBody, fontWeight: FontWeight.w500)),
          ],
          if ((chunk.transliteration ?? '').isNotEmpty) Text(chunk.transliteration!, style: StType.bodySmall.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

/// Plays the phrase with the backend's text-to-speech.
class SpeakButton extends ConsumerStatefulWidget {
  const SpeakButton({super.key, required this.text, this.voiceName = 'en-US-Standard-A', this.semanticLabel = 'Play pronunciation', this.icon = StIcons.speaker});
  final String text;

  /// A Google Cloud TTS voice name.
  final String voiceName;
  final String semanticLabel;
  final String icon;

  @override
  ConsumerState<SpeakButton> createState() => _SpeakButtonState();
}

class _SpeakButtonState extends ConsumerState<SpeakButton> {
  static final _cache = <String, List<int>>{};

  /// One player for the whole app, made on the first tap (lists have many buttons).
  static AudioPlayer? _shared;
  static AudioPlayer get _player => _shared ??= AudioPlayer();
  bool _loading = false;

  Future<void> _play() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final key = '${widget.voiceName}|${widget.text}';
      var bytes = _cache[key];
      if (bytes == null) {
        final uri = await ref.read(apiProvider).translation.speak(widget.text, voiceName: widget.voiceName);
        final b64 = uri.contains(',') ? uri.substring(uri.indexOf(',') + 1) : uri;
        bytes = base64Decode(b64);
        _cache[key] = bytes;
      }
      await _player.setAudioSource(_BytesSource(bytes));
      await _player.seek(Duration.zero);
      _player.play();
    } catch (_) {
      if (mounted) showStToast(context, title: "Couldn't play the sound.", color: StToastColor.danger);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(width: 48, height: 48, child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2))));
    }
    return StIconButton(icon: widget.icon, semanticLabel: widget.semanticLabel, onPressed: _play);
  }
}

// just_audio marks StreamAudioSource experimental; it is the simplest way to play bytes in memory.
// ignore: experimental_member_use
class _BytesSource extends StreamAudioSource {
  _BytesSource(this.bytes);
  final List<int> bytes;

  @override
  // ignore: experimental_member_use
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    start ??= 0;
    end ??= bytes.length;
    // ignore: experimental_member_use
    return StreamAudioResponse(
      sourceLength: bytes.length,
      contentLength: end - start,
      offset: start,
      stream: Stream.value(bytes.sublist(start, end)),
      contentType: 'audio/mpeg',
    );
  }
}
