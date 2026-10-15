import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/languages.dart';
import '../phrase/phrase_parts.dart';
import '../today/today_screen.dart';
import 'bundle_picker.dart';
import 'save_assistant.dart';
import 'save_engine.dart';
import 'save_history_view.dart';
import 'save_session.dart';

/// Where the save assistant works: the `save_assistant` backend with
/// `--dart-define=SAVE_ASSISTANT_BACKEND=true`, else on the phone (chats kept
/// per signed-in user). Tests override it.
final saveEngineProvider = Provider<SaveEngine>((ref) {
  final api = ref.read(apiProvider);
  final own = ref.watch(languageProvider).value ?? AppLanguage.all.first;
  final multilingual = ref.watch(multilingualProvider);
  if (AppConfig.saveAssistantBackend) return ServerSaveEngine(api: api, languageName: own.name, languageCode: multilingual ? own.code : null);
  final userId = ref.watch(authProvider.select((a) => a.user?.id)) ?? 'anonymous';
  final active = ref.watch(activeLanguageProvider).value ?? 'en';
  // Save history is per language; English keeps the 1.x key so old chats stay.
  final key = active == 'en' ? userId : '$userId.$active';
  return LocalSaveEngine(
    api: api,
    history: LocalSaveSessionRepository(ref.read(prefsProvider), userId: key),
    languageName: own.name,
    languageCode: multilingual ? own.code : null,
    learningName: ref.watch(activeCapsProvider).name,
  );
});

/// The chats for Recent and Save history.
final saveSessionRepositoryProvider = Provider<SaveSessionRepository>((ref) => ref.watch(saveEngineProvider).history);

/// All chats, newest first. Invalidated when the sheet closes.
final saveSessionsProvider = FutureProvider<List<SaveSession>>((ref) => ref.watch(saveSessionRepositoryProvider).list());

/// Opens S10 · Save a phrase, the save assistant. With [initialText] (a share
/// or a deep link) the chat starts with it; without, it opens on the prompt.
/// [bundleId] pre-selects a bundle.
Future<void> openCapture(BuildContext context, WidgetRef ref, {String? initialText, String? bundleId}) async {
  await showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfacePage,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => FractionallySizedBox(heightFactor: 0.94, child: CaptureSheet(initialText: initialText, bundleId: bundleId)),
  );
  ref.invalidate(saveSessionsProvider);
}

enum _View { start, chat, history }

class CaptureSheet extends ConsumerStatefulWidget {
  const CaptureSheet({super.key, this.initialText, this.bundleId});
  final String? initialText;
  final String? bundleId;

  @override
  ConsumerState<CaptureSheet> createState() => _CaptureSheetState();
}

class _CaptureSheetState extends ConsumerState<CaptureSheet> {
  late final SaveAssistant _assistant;
  _View _view = _View.start;
  _View _beforeHistory = _View.start;
  Bundle? _bundle;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    _assistant = SaveAssistant(
      api: ref.read(apiProvider),
      engine: ref.read(saveEngineProvider),
      languageName: (ref.read(languageProvider).value ?? AppLanguage.all.first).name,
    )..addListener(_onChange);
    _pickDefaultBundle();
    final text = widget.initialText?.trim() ?? '';
    if (text.isNotEmpty) _start(text, source: 'share');
  }

  @override
  void dispose() {
    _assistant
      ..removeListener(_onChange)
      ..dispose();
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  Future<void> _pickDefaultBundle() async {
    final bundles = await ref.read(bundlesProvider.future).catchError((_) => <Bundle>[]);
    final wanted = widget.bundleId ?? ref.read(settingsProvider).lastBundleId;
    if (!mounted) return;
    setState(() => _bundle = bundles.where((b) => b.id == wanted).firstOrNull ?? bundles.firstOrNull);
  }

  void _start(String text, {String source = 'typed'}) {
    setState(() {
      _view = _View.chat;
      _saveError = null;
    });
    _assistant.start(text, source: source);
  }

  /// A new chat from the chat's own "New chat" button.
  void _newChat() {
    ref.invalidate(saveSessionsProvider);
    setState(() => _view = _View.start);
  }

  void _open(SaveSession s) {
    setState(() {
      _view = _View.chat;
      _saveError = null;
    });
    _assistant.open(s);
  }

  /// The input bar: a question about the phrase, or a new sentence (new chat).
  void _send(String text) {
    if (text.trim().isEmpty) return;
    if (!_assistant.started) return _start(text);
    if (looksLikeQuestion(text)) {
      _assistant.ask(text);
    } else {
      ref.invalidate(saveSessionsProvider);
      _start(text);
    }
  }

  Future<void> _save() async {
    final bundle = _bundle;
    if (bundle == null) return;
    setState(() => _saveError = null);
    try {
      await _assistant.save(bundle);
      ref.read(hapticsProvider).medium();
      ref.read(settingsProvider.notifier).setLastBundle(bundle.id);
      refreshLearningData(ref);
      ref.invalidate(todayProvider);
    } on ApiException catch (e) {
      setState(() => _saveError = friendlyError(e));
      if (e.isTierLimit) ref.invalidate(subscriptionProvider);
    } catch (e) {
      setState(() => _saveError = friendlyError(e));
    }
  }

  Future<void> _undo(String phrase) async {
    try {
      await _assistant.undo(phrase);
      refreshLearningData(ref);
      ref.invalidate(todayProvider);
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _chooseBundle() async {
    final picked = await pickBundle(context, current: _bundle?.id, suggestedNew: null);
    if (picked != null && mounted) setState(() => _bundle = picked);
  }

  void _showHistory() {
    ref.invalidate(saveSessionsProvider);
    setState(() {
      _beforeHistory = _view;
      _view = _View.history;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_view == _View.history) {
      return SaveHistoryView(
        onBack: () => setState(() => _view = _beforeHistory),
        onOpen: _open,
      );
    }
    final c = context.st;
    final chat = _view == _View.chat;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        children: [
          const SheetGrabber(),
          SheetHeader(
            leading: Image.asset('assets/images/logo.png', width: 32, height: 32, excludeFromSemantics: true),
            title: 'Save a phrase',
            subtitle: chat ? 'Ask me anything about it' : 'Your save assistant',
            actions: [
              StTopBarButton(icon: StIcons.history, semanticLabel: 'Save history', iconSize: 24, onPressed: _showHistory),
              StTopBarButton(icon: StIcons.close, semanticLabel: 'Close', onPressed: () => Navigator.of(context).maybePop()),
            ],
          ),
          Divider(height: 1, thickness: 1, color: c.borderSubtle),
          Expanded(
            child: chat
                ? _ChatView(
                    assistant: _assistant,
                    bundle: _bundle,
                    saveError: _saveError,
                    onSave: _save,
                    onUndo: _undo,
                    onChangeBundle: _chooseBundle,
                    onNewChat: _newChat,
                  )
                : _StartView(onSend: _start, onOpen: _open, onSeeAll: _showHistory),
          ),
          // The input bar slides in after the first message.
          AnimatedSwitcher(
            duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : StMotion.base,
            transitionBuilder: (child, a) => SlideTransition(position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(a), child: child),
            child: chat ? _InputBar(key: const ValueKey('bar'), assistant: _assistant, onSend: _send) : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ chrome

class SheetGrabber extends StatelessWidget {
  const SheetGrabber({super.key});

  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          margin: const EdgeInsets.only(top: 10, bottom: 4),
          width: 36,
          height: 4,
          decoration: BoxDecoration(color: context.st.borderStrong, borderRadius: BorderRadius.circular(2)),
        ),
      );
}

/// The sheet's top row: leading (logo or back), title over subtitle, actions.
class SheetHeader extends StatelessWidget {
  const SheetHeader({super.key, required this.leading, required this.title, required this.subtitle, this.actions = const []});
  final Widget leading;
  final String title;
  final String subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 4, 4),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text(title, style: StType.base(size: 18, weight: FontWeight.w900, height: 1.25).copyWith(color: c.textStrong))),
                Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.bodySmall.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          ...actions,
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ start

class _StartView extends ConsumerStatefulWidget {
  const _StartView({required this.onSend, required this.onOpen, required this.onSeeAll});
  final void Function(String text, {String source}) onSend;
  final ValueChanged<SaveSession> onOpen;
  final VoidCallback onSeeAll;

  @override
  ConsumerState<_StartView> createState() => _StartViewState();
}

class _StartViewState extends ConsumerState<_StartView> {
  final _text = TextEditingController();
  bool _clipboardHasText = false;

  /// What is on the clipboard, for the Paste chip. Android only: reading the
  /// clipboard on iOS shows the system "Allow Paste" prompt, so iOS waits for a tap.
  String? _clipboardPreview;

  @override
  void initState() {
    super.initState();
    _readClipboard();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _readClipboard() async {
    final has = await Clipboard.hasStrings();
    String? preview;
    if (has && !Platform.isIOS) {
      preview = (await Clipboard.getData(Clipboard.kTextPlain))?.text?.trim();
    }
    if (mounted) {
      setState(() {
        _clipboardHasText = has;
        _clipboardPreview = preview == null || preview.isEmpty ? null : preview;
      });
    }
  }

  Future<void> _paste() async {
    final text = (await Clipboard.getData(Clipboard.kTextPlain))?.text?.trim() ?? '';
    if (text.isNotEmpty) widget.onSend(text, source: 'paste');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final sessions = ref.watch(saveSessionsProvider).value ?? const [];
    final recent = sessions.take(3).toList();
    final preview = _clipboardPreview;
    final pasteLabel = preview == null ? 'Paste' : 'Paste "${preview.length > 22 ? '${preview.substring(0, 22).trimRight()}…' : preview}"';
    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight - 36),
          child: IntrinsicHeight(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(),
                if (sessions.isEmpty) ...[
                  Center(
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(color: c.primarySoft, borderRadius: StRadius.brXl),
                      alignment: Alignment.center,
                      child: StIcon(StIcons.translationDuo, size: 30, color: c.rose600),
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                Semantics(
                  header: true,
                  child: Text('What do you want to learn?', textAlign: TextAlign.center, style: StType.base(size: 22, weight: FontWeight.w900, height: 1.25).copyWith(color: c.textStrong)),
                ),
                const SizedBox(height: 8),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 280),
                    child: Text(
                      "Paste a word or a sentence. I'll explain it, and you can save it.",
                      textAlign: TextAlign.center,
                      style: StType.base(size: 16, weight: FontWeight.w600).copyWith(color: c.textMuted),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                _PromptBox(
                  controller: _text,
                  pasteLabel: _clipboardHasText ? pasteLabel : null,
                  onPaste: _paste,
                  onSend: () => widget.onSend(_text.text),
                ),
                const SizedBox(height: 18),
                if (sessions.isEmpty)
                  _TryOne(onPick: (t) => widget.onSend(t))
                else ...[
                  Row(
                    children: [
                      const Expanded(child: StEyebrow.section('Recent')),
                      Semantics(
                        button: true,
                        label: 'See all',
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: widget.onSeeAll,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              children: [
                                Text('See all', style: StType.bodyMedium.copyWith(color: c.textLink, fontWeight: FontWeight.w700)),
                                StIcon(StIcons.chevronRight, size: 16, color: c.textLink),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  for (final s in recent)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: SessionRow(session: s, meta: recentMeta(s, DateTime.now()), onTap: () => widget.onOpen(s), chevron: true),
                    ),
                ],
                const Spacer(),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StIcon(StIcons.lightbulb, size: 16, color: c.amber600),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(text: 'Tip: in YouTube or any app, tap '),
                            TextSpan(text: 'Share', style: TextStyle(fontWeight: FontWeight.w800, color: c.textBody)),
                            const TextSpan(text: ', then '),
                            TextSpan(text: 'Subturtle', style: TextStyle(fontWeight: FontWeight.w800, color: c.textBody)),
                            const TextSpan(text: '.'),
                          ],
                        ),
                        style: StType.bodySmall.copyWith(color: c.textMuted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "2 saved · 10 min ago" or "Asked only · Mon".
String recentMeta(SaveSession s, DateTime now) {
  final mins = now.difference(s.updatedAt).inMinutes;
  final when = mins < 1
      ? 'just now'
      : mins < 60
          ? '$mins min ago'
          : Fmt.day(s.updatedAt, now: now);
  return '${s.saved.isEmpty ? 'Asked only' : '${s.saved.length} saved'} · $when';
}

class _PromptBox extends StatelessWidget {
  const _PromptBox({required this.controller, required this.pasteLabel, required this.onPaste, required this.onSend});
  final TextEditingController controller;
  final String? pasteLabel;
  final VoidCallback onPaste;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 12),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: StRadius.brLg,
        border: Border.all(color: c.borderDefault, width: 1.5),
        boxShadow: context.stShadows.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            minLines: 3,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            style: StType.base(size: 18, weight: FontWeight.w400).copyWith(color: c.textStrong),
            // The card is the field: no fill or outline from the app's input theme.
            decoration: InputDecoration(
              isCollapsed: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintText: 'Paste or type a word or sentence…',
              hintStyle: StType.base(size: 18, weight: FontWeight.w400).copyWith(color: c.textFaint),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (pasteLabel != null)
                Flexible(child: _Chip(label: pasteLabel!, icon: StIcons.documents, tinted: true, onTap: onPaste, semanticLabel: 'Paste from clipboard'))
              else
                const Spacer(),
              const Spacer(),
              ListenableBuilder(
                listenable: controller,
                builder: (_, _) => SendButton(onPressed: controller.text.trim().isEmpty ? null : onSend),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// New learners have no history: two example sentences instead.
class _TryOne extends StatelessWidget {
  const _TryOne({required this.onPick});
  final ValueChanged<String> onPick;

  static const examples = ['I had to get out of there before it got worse.', 'I had to leave early.'];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          const StEyebrow.section('Or try one'),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [for (final e in examples) _Chip(label: e, onTap: () => onPick(e))],
          ),
        ],
      );
}

// ------------------------------------------------------------------ chat

class _ChatView extends StatefulWidget {
  const _ChatView({
    required this.assistant,
    required this.bundle,
    required this.saveError,
    required this.onSave,
    required this.onUndo,
    required this.onChangeBundle,
    required this.onNewChat,
  });
  final SaveAssistant assistant;
  final Bundle? bundle;
  final String? saveError;
  final VoidCallback onSave;
  final ValueChanged<String> onUndo;
  final VoidCallback onChangeBundle;
  final VoidCallback onNewChat;

  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  @override
  Widget build(BuildContext context) {
    final a = widget.assistant;
    final s = a.session;
    if (s == null) return const SizedBox.shrink();
    // A reversed list keeps the newest bubble in view as the chat grows.
    final items = <Widget>[
      const _Bubble(fromUser: false, text: assistantGreeting),
      _Bubble(fromUser: true, text: s.sentence),
      if (a.startError != null)
        _ProblemCard(error: a.startError!, onRetry: a.retryStart, onNewChat: widget.onNewChat)
      else
        _PhraseCard(assistant: a, bundle: widget.bundle, saveError: widget.saveError, onSave: widget.onSave, onUndo: widget.onUndo, onChangeBundle: widget.onChangeBundle),
      for (final l in s.log) _Bubble(fromUser: l.fromUser, text: l.text),
      if (a.thinking) const _Typing(),
      if (a.limit != null) _ProblemCard(error: a.limit!, onNewChat: widget.onNewChat),
      if (a.wrapUp && a.limit == null) const _Bubble(fromUser: false, text: 'This chat is almost full. Send a new sentence to start a fresh one.'),
    ];
    return Semantics(
      liveRegion: true,
      child: ListView.separated(
        reverse: true,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) => items[items.length - 1 - i],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.fromUser, required this.text});
  final bool fromUser;
  final String text;

  static final _rtl = RegExp(r'[֐-ࣿ]');

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final rtl = _rtl.hasMatch(text);
    final radius = fromUser
        ? const BorderRadius.only(topLeft: Radius.circular(StRadius.lg), topRight: Radius.circular(StRadius.lg), bottomLeft: Radius.circular(StRadius.lg), bottomRight: Radius.circular(StRadius.xs))
        : const BorderRadius.only(topLeft: Radius.circular(StRadius.lg), topRight: Radius.circular(StRadius.lg), bottomRight: Radius.circular(StRadius.lg), bottomLeft: Radius.circular(StRadius.xs));
    return Align(
      alignment: fromUser ? Alignment.centerRight : Alignment.centerLeft,
      child: FractionallySizedBox(
        widthFactor: fromUser ? 0.78 : 0.86,
        alignment: fromUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Align(
          alignment: fromUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: fromUser ? c.surfaceInverse : c.surfaceCard,
              borderRadius: radius,
              border: fromUser ? null : Border.all(color: c.borderSubtle),
            ),
            child: Text(
              text,
              textDirection: rtl ? TextDirection.rtl : null,
              style: StType.bodyLarge.copyWith(color: fromUser ? c.paper : c.textBody),
            ),
          ),
        ),
      ),
    );
  }
}

/// A failed start or a plan limit, in place of an answer. A limit (AI budget,
/// message cap) offers plans or a new chat; anything else offers Try again.
class _ProblemCard extends StatelessWidget {
  const _ProblemCard({required this.error, this.onRetry, required this.onNewChat});
  final Object error;
  final VoidCallback? onRetry;
  final VoidCallback onNewChat;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final e = error;
    final credit = e is ApiException && e.code == ApiException.aiCreditExhausted;
    final full = e is ApiException && e.isTierLimit;
    return FractionallySizedBox(
      widthFactor: 0.86,
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        decoration: BoxDecoration(color: c.warningSoft, borderRadius: StRadius.brLg),
        child: Semantics(
          liveRegion: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(padding: const EdgeInsets.only(top: 1), child: StIcon(StIcons.danger, size: 20, color: c.amber600)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(saveAssistantError(e), style: StType.bodyMedium.copyWith(color: c.ink700))),
                ],
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 4,
                children: [
                  if (credit && AppConfig.purchaseLinks)
                    StButton(
                      label: 'See plans',
                      variant: StButtonVariant.ghost,
                      size: StSize.sm,
                      onPressed: () {
                        Navigator.pop(context);
                        GoRouter.of(context).go('/me/plan');
                      },
                    )
                  else if (full)
                    StButton(label: 'New chat', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: onNewChat)
                  else if (onRetry != null)
                    StButton(label: 'Try again', icon: StIcons.refresh, variant: StButtonVariant.ghost, size: StSize.sm, onPressed: onRetry),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Typing extends StatelessWidget {
  const _Typing();

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Align(
      alignment: Alignment.centerLeft,
      child: Semantics(
        label: 'The assistant is typing',
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brLg, border: Border.all(color: c.borderSubtle)),
          child: SizedBox(width: 40, height: 10, child: StSkeleton(radius: 5)),
        ),
      ),
    );
  }
}

/// The assistant's main bubble: phrase chips, the translation card, and Save.
class _PhraseCard extends ConsumerWidget {
  const _PhraseCard({required this.assistant, required this.bundle, required this.saveError, required this.onSave, required this.onUndo, required this.onChangeBundle});
  final SaveAssistant assistant;
  final Bundle? bundle;
  final String? saveError;
  final VoidCallback onSave;
  final ValueChanged<String> onUndo;
  final VoidCallback onChangeBundle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final a = assistant;
    final s = a.session!;
    final phrase = a.current;
    final lang = ref.watch(languageProvider).value;
    final sub = ref.watch(subscriptionProvider).value;
    final limitReached = sub != null && sub.isFreemium && !sub.saveWords.unlimited && sub.saveWords.remaining <= 0;
    final saved = phrase == null ? null : s.saved.where((r) => r.text == phrase).firstOrNull;

    return FractionallySizedBox(
      widthFactor: 0.86,
      alignment: Alignment.centerLeft,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: c.surfaceCard,
          border: Border.all(color: c.borderSubtle),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(StRadius.lg),
            topRight: Radius.circular(StRadius.lg),
            bottomRight: Radius.circular(StRadius.lg),
            bottomLeft: Radius.circular(StRadius.xs),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
              child: Text(
                a.findingParts ? 'Finding the phrases in your sentence…' : 'Which part do you want to learn?',
                style: StType.bodyMedium.copyWith(color: c.textMuted),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
              child: a.findingParts
                  ? Row(children: [for (final w in [72.0, 56.0, 84.0]) Padding(padding: const EdgeInsets.only(right: 6), child: StSkeleton(width: w, height: 36, radius: 18))])
                  : Semantics(
                      label: 'Phrases in your sentence',
                      container: true,
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (var i = 0; i < s.candidates.length; i++)
                            _Chip(
                              label: s.candidates[i],
                              selected: s.candidates[i] == phrase,
                              icon: s.isSaved(s.candidates[i]) ? StIcons.check : null,
                              onTap: () {
                                ref.read(hapticsProvider).selection();
                                a.pick(i);
                              },
                            ),
                        ],
                      ),
                    ),
            ),
            if (phrase != null) ...[
              Divider(height: 1, thickness: 1, color: c.borderSubtle),
              Padding(padding: const EdgeInsets.fromLTRB(14, 10, 8, 12), child: _Translation(assistant: a, phrase: phrase, language: lang)),
              if (saved != null)
                _SavedFooter(
                  bundleTitle: saved.bundleTitle.isNotEmpty
                      ? saved.bundleTitle
                      : ref.watch(bundlesProvider).value?.where((b) => b.id == saved.bundleId).firstOrNull?.title ?? 'your bundle',
                  // Undo needs the bundle; a chat from the server may not say which one.
                  onUndo: saved.bundleId.isEmpty ? null : () => onUndo(phrase),
                )
              else
                Container(
                  decoration: BoxDecoration(border: Border(top: BorderSide(color: c.borderSubtle))),
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (saveError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Semantics(liveRegion: true, child: Text(saveError!, style: StType.bodyMedium.copyWith(color: c.red600))),
                        ),
                      StButton(
                        label: limitReached ? 'Limit reached' : (bundle == null ? 'Save phrase' : 'Save to ${bundle!.title}'),
                        icon: StIcons.bookmark,
                        block: true,
                        loading: a.saving,
                        onPressed: limitReached || bundle == null || a.saving ? null : onSave,
                      ),
                      if (limitReached)
                        if (AppConfig.purchaseLinks)
                        Center(
                          child: StButton(
                            label: 'See plans',
                            variant: StButtonVariant.ghost,
                            size: StSize.sm,
                            onPressed: () {
                              Navigator.pop(context);
                              GoRouter.of(context).go('/me/plan');
                            },
                          ),
                        )
                      else
                        Center(
                          child: StButton(
                            label: 'Change bundle',
                            icon: StIcons.notebook,
                            variant: StButtonVariant.ghost,
                            tone: StTone.neutral,
                            size: StSize.sm,
                            onPressed: a.saving ? null : onChangeBundle,
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Translation extends StatelessWidget {
  const _Translation({required this.assistant, required this.phrase, required this.language});
  final SaveAssistant assistant;
  final String phrase;
  final AppLanguage? language;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final d = assistant.cardFor(phrase);
    final lx = d?.linguistic;
    final tags = [
      if (lx != null && lx.type.isNotEmpty) lx.type,
      if (lx != null && lx.formality.isNotEmpty && lx.formality != 'neutral') lx.formality,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(phrase, style: StType.base(size: 22, weight: FontWeight.w900, height: 1.25).copyWith(color: c.textStrong))),
            SpeakButton(text: phrase),
          ],
        ),
        if (d == null && assistant.cardFailed(phrase))
          Row(
            children: [
              Expanded(child: Text("We couldn't translate this.", style: StType.bodyMedium.copyWith(color: c.textMuted))),
              StButton(label: 'Try again', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: assistant.retryCard),
            ],
          )
        else if (d == null)
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [StSkeleton(width: 140, height: 22), SizedBox(height: 8), StSkeleton(height: 14), SizedBox(height: 6), StSkeleton(width: 180, height: 14)],
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (tags.isNotEmpty) ...[
                  Wrap(spacing: 6, runSpacing: 6, children: [for (final t in tags) StBadge(t)]),
                  const SizedBox(height: 8),
                ],
                StL1Text(
                  d.translation,
                  rtl: language?.rtl ?? d.targetIsRtl,
                  languageName: language?.name,
                  style: StType.base(size: 22, weight: FontWeight.w600, height: 1.4).copyWith(color: c.textStrong),
                ),
                if (lx != null && lx.definition.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(lx.definition, style: StType.bodyMedium.copyWith(color: c.textBody, fontWeight: FontWeight.w400)),
                ],
                if (lx != null && lx.transliteration.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text('Say it: ${lx.transliteration}', style: StType.bodySmall.copyWith(color: c.textMuted)),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _SavedFooter extends StatelessWidget {
  const _SavedFooter({required this.bundleTitle, required this.onUndo});
  final String bundleTitle;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      liveRegion: true,
      child: Container(
        decoration: BoxDecoration(color: c.accentTint, border: Border(top: BorderSide(color: c.accentSoft))),
        padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
        child: Row(
          children: [
            StIcon(StIcons.check, size: 20, color: c.jade600),
            const SizedBox(width: 8),
            Expanded(child: Text('Saved to $bundleTitle', style: StType.base(size: 14, weight: FontWeight.w800, height: 1.3).copyWith(color: c.jade700))),
            if (onUndo != null) StButton(label: 'Undo', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: onUndo),
          ],
        ),
      ),
    );
  }
}

class _InputBar extends StatefulWidget {
  const _InputBar({super.key, required this.assistant, required this.onSend});
  final SaveAssistant assistant;
  final ValueChanged<String> onSend;

  @override
  State<_InputBar> createState() => _InputBarState();
}

class _InputBarState extends State<_InputBar> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _submit() {
    final t = _text.text.trim();
    if (t.isEmpty) return;
    _text.clear();
    widget.onSend(t);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final a = widget.assistant;
    final busy = a.thinking || a.findingParts;
    return Container(
      decoration: BoxDecoration(color: c.surfaceCard, border: Border(top: BorderSide(color: c.borderSubtle))),
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom > 0 ? 0 : MediaQuery.paddingOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              children: [
                for (final (chip, message) in a.quickReplies())
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _Chip(label: chip, onTap: busy ? null : () => a.ask(message, shown: message)),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _text,
                    textInputAction: TextInputAction.send,
                    textCapitalization: TextCapitalization.sentences,
                    onSubmitted: (_) => _submit(),
                    style: StType.bodyLarge.copyWith(color: c.textStrong),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Ask, or paste a new sentence…',
                      hintStyle: StType.bodyLarge.copyWith(color: c.textFaint),
                      filled: true,
                      fillColor: c.surfaceSunken,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: StRadius.brPill, borderSide: BorderSide(color: c.borderSubtle, width: 1.5)),
                      enabledBorder: OutlineInputBorder(borderRadius: StRadius.brPill, borderSide: BorderSide(color: c.borderSubtle, width: 1.5)),
                      focusedBorder: OutlineInputBorder(borderRadius: StRadius.brPill, borderSide: BorderSide(color: c.primary, width: 1.5)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ListenableBuilder(listenable: _text, builder: (_, _) => SendButton(onPressed: _text.text.trim().isEmpty || busy ? null : _submit)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ bits

/// Round rose arrow-up button.
class SendButton extends StatelessWidget {
  const SendButton({super.key, required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: 'Send',
      excludeSemantics: true,
      child: StPressable(
        onTap: onPressed,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: onPressed == null ? c.ink200 : c.primary, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: StIcon(StIcons.sendUp, size: 20, color: onPressed == null ? c.textFaint : c.onPrimary),
        ),
      ),
    );
  }
}

/// A 36 dp pill: phrase choices (selected = rose), quick replies, examples.
class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.onTap, this.selected = false, this.tinted = false, this.icon, this.semanticLabel});
  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final bool tinted;
  final String? icon;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color fg, Color border) = selected
        ? (c.primary, c.onPrimary, c.primary)
        : tinted
            ? (c.primaryTint, c.rose700, c.primarySoft)
            : (c.surfaceCard, c.textStrong, c.borderDefault);
    return Semantics(
      button: true,
      selected: selected,
      enabled: onTap != null,
      label: semanticLabel ?? label,
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.96,
        child: Padding(
          // 36 dp chip, 44 dp touch target.
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(color: bg, borderRadius: StRadius.brPill, border: Border.all(color: border, width: 1.5)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[StIcon(icon!, size: 16, color: fg), const SizedBox(width: 6)],
                Flexible(
                  child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.base(size: 14, weight: FontWeight.w700, height: 1).copyWith(color: fg)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
