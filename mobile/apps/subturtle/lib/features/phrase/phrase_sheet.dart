import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../coach/start_session_sheet.dart';
import 'phrase_parts.dart';

/// Opens S9 · Phrase detail as a bottom sheet (70% height, drag up to full).
/// [bundleId] enables "Move to bundle" and "Delete" (they act on that bundle).
/// Returns true when the phrase was changed or removed.
Future<bool> openPhraseSheet(BuildContext context, Phrase phrase, {String? bundleId}) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfaceCard,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 1,
      builder: (context, scroll) => PhraseSheet(phrase: phrase, bundleId: bundleId, scroll: scroll),
    ),
  );
  return changed ?? false;
}

class PhraseSheet extends ConsumerStatefulWidget {
  const PhraseSheet({super.key, required this.phrase, this.bundleId, this.scroll});
  final Phrase phrase;
  final String? bundleId;
  final ScrollController? scroll;

  @override
  ConsumerState<PhraseSheet> createState() => _PhraseSheetState();
}

class _PhraseSheetState extends ConsumerState<PhraseSheet> {
  late Phrase _phrase = widget.phrase;
  bool _changed = false;

  SubturtleApi get _api => ref.read(apiProvider);

  Future<void> _editTranslation() async {
    final ctrl = TextEditingController(text: _phrase.translation);
    final rtl = l1IsRtl(ref, _phrase);
    final value = await showStBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: StSheet(
          title: 'Edit translation',
          footer: StButton(label: 'Save', size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, ctrl.text.trim())),
          child: Directionality(
            textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
            child: StInput(controller: ctrl, autofocus: true, maxLines: 4, minLines: 1),
          ),
        ),
      ),
    );
    if (value == null || value.isEmpty || value == _phrase.translation) return;
    final before = _phrase;
    setState(() => _phrase = _phrase.copyWith(translation: value));
    try {
      await _api.bundles.updatePhrase(_phrase.id, {'translation': value});
      _changed = true;
      if (mounted) showStToast(context, title: 'Translation saved');
    } catch (e) {
      setState(() => _phrase = before);
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _more() async {
    final action = await showStBottomSheet<String>(
      context: context,
      builder: (ctx) => StSheet(
        title: _phrase.phrase,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StButton(label: 'Move to another bundle', variant: StButtonVariant.soft, tone: StTone.neutral, size: StSize.lg, block: true, icon: StIcons.bundles, onPressed: () => Navigator.pop(ctx, 'move')),
            const SizedBox(height: 8),
            StButton(label: 'Delete from this bundle', variant: StButtonVariant.soft, tone: StTone.danger, size: StSize.lg, block: true, icon: StIcons.trash, onPressed: () => Navigator.pop(ctx, 'delete')),
            SizedBox(height: MediaQuery.paddingOf(ctx).bottom),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'delete') await _delete();
    if (action == 'move') await _move();
  }

  Future<void> _delete() async {
    final ok = await confirmSheet(context, title: 'Delete "${_phrase.phrase}"?', body: 'It is removed from this bundle.', confirm: 'Delete', danger: true);
    if (!ok) return;
    try {
      await _api.bundles.removePhrase(phraseId: _phrase.id, bundleId: widget.bundleId!);
      refreshLearningData(ref);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  /// Move = add to the other bundle (the server reuses the same phrase), then
  /// remove from this one. Neither step can lose the phrase.
  Future<void> _move() async {
    final bundles = await ref.read(bundlesProvider.future).catchError((_) => <Bundle>[]);
    if (!mounted) return;
    final target = await showStBottomSheet<Bundle>(
      context: context,
      builder: (ctx) => StSheet(
        title: 'Move to',
        child: Column(
          children: [
            for (final b in bundles.where((b) => b.id != widget.bundleId))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ListRowCard(
                  leading: BundleCover(title: b.title, size: 36),
                  title: Text(b.title, style: StType.titleSmall.copyWith(color: ctx.st.textStrong)),
                  onTap: () => Navigator.pop(ctx, b),
                ),
              ),
          ],
        ),
      ),
    );
    if (target == null) return;
    try {
      await _api.bundles.createPhrase(phrase: _phrase.phrase, translation: _phrase.translation, bundleIds: [target.id], translationLanguage: _phrase.translationLanguage);
      await _api.bundles.removePhrase(phraseId: _phrase.id, bundleId: widget.bundleId!);
      refreshLearningData(ref);
      if (mounted) {
        showStToast(context, title: 'Moved to ${target.title}');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final p = _phrase;
    final level = ref.watch(phraseInfoProvider).value?.levelOf(p.id) ?? 0;
    final missingAi = p.type == 'linguistic' && p.linguistic == null;
    final host = p.sourceUrl == null ? null : Uri.tryParse(p.sourceUrl!)?.host.replaceFirst('www.', '');
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _changed);
      },
      child: Column(
        children: [
          Center(
            child: Container(margin: const EdgeInsets.only(top: 10), width: 36, height: 4, decoration: BoxDecoration(color: c.borderStrong, borderRadius: BorderRadius.circular(2))),
          ),
          Expanded(
            child: ListView(
              controller: widget.scroll,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              children: [
                Row(
                  children: [
                    Expanded(child: Semantics(header: true, child: Text(p.phrase, style: StType.headline.copyWith(color: c.textStrong)))),
                    SpeakButton(text: p.phrase),
                    if (widget.bundleId != null) StIconButton(icon: StIcons.more, semanticLabel: 'More options', variant: StButtonVariant.ghost, onPressed: _more),
                  ],
                ),
                const SizedBox(height: 10),
                PhraseTags(phrase: p, extra: level > 0 ? StLevelPip(level: level, label: 'Level $level', showCount: false) : null),
                if ((p.context ?? '').isNotEmpty) ...[
                  const SizedBox(height: 12),
                  HighlightedSentence(sentence: p.context!, highlight: p.phrase, chunks: p.chunks.map((ch) => ch.text).toList()),
                ],
                if (host != null && host.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Semantics(
                    link: true,
                    label: 'Open source: $host',
                    excludeSemantics: true,
                    child: GestureDetector(
                      onTap: () => openExternal(context, p.sourceUrl!),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            StIcon(StIcons.video, size: 16, color: c.textLink),
                            const SizedBox(width: 6),
                            Text(host, style: StType.bodyMedium.copyWith(color: c.textLink, fontWeight: FontWeight.w700)),
                            const SizedBox(width: 4),
                            StIcon(StIcons.external, size: 14, color: c.textLink),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Divider(color: c.borderSubtle),
                const SizedBox(height: 12),
                AnswerBlock(
                  phrase: p,
                  showLabel: false,
                  translationOverride: Semantics(
                    button: true,
                    label: 'Edit translation: ${p.translation}',
                    excludeSemantics: true,
                    child: StPressable(
                      onTap: _editTranslation,
                      pressedScale: 0.99,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: StRadius.brMd, border: Border.all(color: c.borderSubtle)),
                        child: Row(
                          children: [
                            StIcon(StIcons.pen, size: 18, color: c.textMuted),
                            const SizedBox(width: 10),
                            Expanded(
                              child: StL1Text(
                                p.translation.isEmpty ? 'Add a translation' : p.translation,
                                rtl: l1IsRtl(ref, p),
                                align: l1IsRtl(ref, p) ? TextAlign.right : TextAlign.left,
                                style: StType.base(size: 20, weight: FontWeight.w600).copyWith(color: c.textStrong),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                if (missingAi) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                      const SizedBox(width: 10),
                      Text('Getting translation…', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                    ],
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.paddingOf(context).bottom),
            child: StButton(
              label: 'Practise with Coach',
              icon: StIcons.chatDots,
              variant: StButtonVariant.soft,
              size: StSize.lg,
              block: true,
              onPressed: () {
                Navigator.pop(context, _changed);
                openStartSession(context, ref, bundleId: widget.bundleId);
              },
            ),
          ),
        ],
      ),
    );
  }
}
