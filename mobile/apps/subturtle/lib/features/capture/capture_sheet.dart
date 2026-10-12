import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/languages.dart';
import '../today/today_screen.dart';
import 'bundle_picker.dart';
import 'word_selection.dart';

/// Opens S10 · Capture. With [initialText] (a share) it goes straight to the
/// save sheet; without, it starts with the paste box. [bundleId] pre-selects a bundle.
Future<void> openCapture(BuildContext context, WidgetRef ref, {String? initialText, String? bundleId}) async {
  final saved = await showModalBottomSheet<(Phrase, Bundle)>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfaceCard,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => FractionallySizedBox(heightFactor: 0.94, child: CaptureSheet(initialText: initialText, bundleId: bundleId)),
  );
  if (saved == null || !context.mounted) return;
  final (_, bundle) = saved;
  showStToast(
    context,
    title: 'Saved to ${bundle.title}',
    actionLabel: 'View',
    onAction: () => GoRouter.of(context).go('/bundles/${bundle.id}'),
  );
}

class CaptureSheet extends ConsumerStatefulWidget {
  const CaptureSheet({super.key, this.initialText, this.bundleId});
  final String? initialText;
  final String? bundleId;

  @override
  ConsumerState<CaptureSheet> createState() => _CaptureSheetState();
}

class _CaptureSheetState extends ConsumerState<CaptureSheet> {
  late bool _pasteStep = (widget.initialText ?? '').trim().isEmpty;
  late final _sentence = TextEditingController(text: widget.initialText?.trim() ?? '');
  late WordSelection _sel = WordSelection.fromSentence(_sentence.text);
  bool _showAll = false;
  bool _clipboardHasText = false;

  Bundle? _bundle;
  bool _saving = false;
  bool _saved = false;
  String? _error;

  // Live translation preview.
  Timer? _debounce;
  String? _previewFor;
  DetailedTranslation? _detail;
  bool _translating = false;
  bool _previewSlow = false;
  Future<DetailedTranslation?>? _pending;

  @override
  void initState() {
    super.initState();
    Clipboard.hasStrings().then((v) {
      if (mounted) setState(() => _clipboardHasText = v);
    });
    _pickDefaultBundle();
    if (!_pasteStep) _schedulePreview();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _sentence.dispose();
    super.dispose();
  }

  Future<void> _pickDefaultBundle() async {
    final bundles = await ref.read(bundlesProvider.future).catchError((_) => <Bundle>[]);
    final wanted = widget.bundleId ?? ref.read(settingsProvider).lastBundleId;
    if (!mounted) return;
    setState(() => _bundle = bundles.where((b) => b.id == wanted).firstOrNull ?? bundles.firstOrNull);
  }

  AppLanguage _language() => ref.read(languageProvider).value ?? AppLanguage.all.first;

  void _onSentenceChanged(String text) {
    setState(() {
      _sel = WordSelection.fromSentence(text);
      _detail = null;
      _previewFor = null;
    });
    _schedulePreview();
  }

  void _tapWord(int i) {
    ref.read(hapticsProvider).selection();
    setState(() {
      _sel = _sel.tap(i);
      _error = null;
    });
    _schedulePreview();
  }

  /// Translate the selection 600 ms after the last tap. The preview is nice to
  /// have: if it takes more than 1.5 s it hides, and Save still works.
  void _schedulePreview() {
    _debounce?.cancel();
    final phrase = _sel.phrase;
    if (phrase.isEmpty) {
      setState(() {
        _detail = null;
        _translating = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 600), () => _translate(phrase));
  }

  Future<DetailedTranslation?> _translate(String phrase) {
    if (_previewFor == phrase && _pending != null) return _pending!;
    _previewFor = phrase;
    setState(() {
      _translating = true;
      _previewSlow = false;
      _detail = null;
    });
    final slow = Timer(const Duration(milliseconds: 1500), () {
      if (mounted && _translating && _previewFor == phrase) setState(() => _previewSlow = true);
    });
    final api = ref.read(apiProvider);
    final future = api.translation
        .translateDetailed(phrase: phrase, context: _sentence.text.trim(), targetLanguage: _language().name)
        .then<DetailedTranslation?>((d) => d)
        .catchError((Object _) => null);
    _pending = future;
    future.then((d) {
      slow.cancel();
      if (!mounted || _previewFor != phrase) return;
      setState(() {
        _detail = d;
        _translating = false;
      });
    });
    return future;
  }

  Future<void> _save() async {
    final phrase = _sel.phrase;
    final bundle = _bundle;
    if (phrase.isEmpty || bundle == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(apiProvider);
    final lang = _language();
    try {
      // Use the preview when it is ready; else wait for it, then fall back to a simple translation.
      var detail = _previewFor == phrase ? _detail : null;
      detail ??= await _translate(phrase).timeout(const Duration(seconds: 25), onTimeout: () => null);
      var translation = detail?.translation ?? '';
      if (translation.isEmpty) {
        translation = await api.translation.translateSimple(phrase: phrase, context: _sentence.text.trim(), targetLanguage: lang.name);
      }
      if (translation.isEmpty) throw ApiException("We couldn't translate this phrase.");
      final saved = await api.bundles.createPhrase(
        phrase: phrase,
        translation: translation,
        bundleIds: [bundle.id],
        translationLanguage: lang.name,
        context: _sentence.text.trim(),
        detail: detail,
      );
      ref.read(hapticsProvider).medium();
      ref.read(settingsProvider.notifier).setLastBundle(bundle.id);
      refreshLearningData(ref);
      ref.invalidate(todayProvider);
      setState(() => _saved = true);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (mounted) Navigator.pop(context, (saved, bundle));
    } on ApiException catch (e) {
      setState(() => _error = e.isNetwork ? "You're offline. Please try again when you're connected." : friendlyError(e));
      if (e.isTierLimit) ref.invalidate(subscriptionProvider);
    } catch (e) {
      setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _chooseBundle() async {
    final picked = await pickBundle(context, current: _bundle?.id, suggestedNew: null);
    if (picked != null && mounted) setState(() => _bundle = picked);
  }

  @override
  Widget build(BuildContext context) {
    return _pasteStep ? _paste(context) : _saveSheet(context);
  }

  // ------------------------------------------------------------ paste step

  Widget _paste(BuildContext context) {
    final c = context.st;
    final empty = _sentence.text.trim().isEmpty;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: StSheet(
        eyebrow: 'New phrase',
        title: 'Save a phrase',
        closeOnLeft: true,
        footer: StButton(
          label: 'Next',
          iconRight: StIcons.next,
          size: StSize.lg,
          block: true,
          onPressed: empty
              ? null
              : () {
                  setState(() {
                    _pasteStep = false;
                    _sel = WordSelection.fromSentence(_sentence.text);
                  });
                  _schedulePreview();
                },
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(
              controller: _sentence,
              label: 'Paste or type a sentence',
              placeholder: 'I had to get out of there before it got worse.',
              sunken: true,
              autofocus: !_clipboardHasText,
              minLines: 3,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            if (_clipboardHasText)
              Align(
                alignment: Alignment.centerLeft,
                child: StTag(
                  'Paste',
                  icon: StIcons.documents,
                  onTap: () async {
                    final data = await Clipboard.getData(Clipboard.kTextPlain);
                    final text = data?.text?.trim() ?? '';
                    if (text.isNotEmpty) setState(() => _sentence.text = text);
                  },
                ),
              ),
            const SizedBox(height: 12),
            Text('Tip: in YouTube or any app, select text and share it to Subturtle.', style: StType.bodySmall.copyWith(color: c.textMuted)),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------ save sheet

  Widget _saveSheet(BuildContext context) {
    final c = context.st;
    final sub = ref.watch(subscriptionProvider).value;
    final limitReached = sub != null && sub.isFreemium && !sub.saveWords.unlimited && sub.saveWords.remaining <= 0;
    final lang = ref.watch(languageProvider).value;
    final words = _sel.words;
    final visible = _showAll || words.length <= 40 ? words.length : 40;
    final phrase = _sel.phrase;

    String label;
    if (_saved) {
      label = 'Saved';
    } else if (limitReached) {
      label = 'Limit reached';
    } else if (phrase.isEmpty) {
      label = 'Tap at least one word';
    } else {
      label = _bundle == null ? 'Save phrase' : 'Save to ${_bundle!.title}';
    }

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: StSheet(
        eyebrow: 'New phrase',
        title: 'Save a phrase',
        closeOnLeft: true,
        footer: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Semantics(liveRegion: true, child: Text(_error!, style: StType.bodyMedium.copyWith(color: c.red600))),
              ),
            StButton(
              label: label,
              icon: _saved ? StIcons.check : StIcons.bookmark,
              size: StSize.lg,
              block: true,
              loading: _saving,
              onPressed: phrase.isEmpty || limitReached || _bundle == null || _saved ? null : _save,
            ),
            if (limitReached) ...[
              const SizedBox(height: 6),
              Wrap(
                alignment: WrapAlignment.center,
                children: [
                  Text('Starter saves up to ${sub.saveWords.total} phrases. ', style: StType.bodySmall.copyWith(color: c.textMuted)),
                  GestureDetector(
                    onTap: () {
                      Navigator.pop(context);
                      GoRouter.of(context).go('/me/plan');
                    },
                    child: Text('See plans', style: StType.bodySmall.copyWith(color: c.textLink, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ],
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(controller: _sentence, label: 'Sentence', sunken: true, minLines: 1, maxLines: 4, onChanged: _onSentenceChanged),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: Text('Tap the words you want to learn', style: StType.base(size: 14, weight: FontWeight.w800).copyWith(color: c.textStrong))),
                StButton(label: 'Clear', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: _sel.isEmpty ? null : () => setState(() => _sel = _sel.clear())),
              ],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              children: [
                for (var i = 0; i < visible; i++)
                  StTag(words[i], large: true, active: _sel.isSelected(i), onTap: () => _tapWord(i), semanticLabel: '${words[i]}, word ${i + 1} of ${words.length}'),
                if (visible < words.length) StButton(label: 'Show all', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: () => setState(() => _showAll = true)),
              ],
            ),
            const SizedBox(height: 16),
            Semantics(
              liveRegion: true,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(color: c.primaryTint, border: Border.all(color: c.primarySoft), borderRadius: StRadius.brLg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const StEyebrow.section('Saving'),
                    const SizedBox(height: 4),
                    Text(phrase.isEmpty ? 'Nothing yet' : phrase, style: StType.titleLarge.copyWith(color: phrase.isEmpty ? c.textFaint : c.textStrong)),
                    if (phrase.isNotEmpty && _detail != null && _detail!.translation.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      StL1Text(
                        _detail!.translation,
                        rtl: lang?.rtl ?? _detail!.targetIsRtl,
                        languageName: lang?.name,
                        style: StType.base(size: 18, weight: FontWeight.w600).copyWith(color: c.rose700),
                      ),
                    ] else if (phrase.isNotEmpty && _translating && !_previewSlow) ...[
                      const SizedBox(height: 4),
                      Text('Translating…', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Bundle', style: StType.base(size: 14, weight: FontWeight.w700).copyWith(color: c.textStrong)),
            const SizedBox(height: 6),
            StPickerRow(
              value: _bundle?.title ?? 'Choose a bundle',
              leading: StIcon(StIcons.notebook, size: 20, color: c.rose600),
              semanticLabel: 'Bundle: ${_bundle?.title ?? 'none'}. Change',
              onTap: _chooseBundle,
            ),
            if (lang != null) ...[
              const SizedBox(height: 10),
              Text('Translating into ${lang.name}. Change it in Me.', style: StType.bodySmall.copyWith(color: c.textMuted)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Small helper so "N phrases" reads right in the picker.
String bundleMeta(Bundle b) => Fmt.plural(b.phraseCount, 'phrase');
