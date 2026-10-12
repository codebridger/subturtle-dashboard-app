import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../coach/coach_home_screen.dart';
import '../phrase/phrase_sheet.dart';
import 'chat_bubbles.dart';
import 'session_launch.dart';
import 'text_chat_controller.dart';

/// S14 · Live session, text. Chat with the coach about the bundle's phrases.
class TextChatScreen extends ConsumerStatefulWidget {
  const TextChatScreen({super.key, required this.launch});
  final SessionLaunch launch;

  @override
  ConsumerState<TextChatScreen> createState() => _TextChatScreenState();
}

class _TextChatScreenState extends ConsumerState<TextChatScreen> {
  late final TextChatController _chat;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _stripOpen = true;
  bool _finishedShown = false;

  @override
  void initState() {
    super.initState();
    final sub = ref.read(subscriptionProvider).value;
    final cap = sub == null ? null : (sub.isFreemium ? 20 : sub.entitlements?.textChatMaxMessages);
    _chat = TextChatController(
      repo: ref.read(apiProvider).textChat,
      phrases: widget.launch.phrases,
      instructions: widget.launch.instructions,
      metadata: widget.launch.metadata('text'),
      messageCap: cap,
    )..addListener(_onChange);
    _chat.start();
  }

  void _onChange() {
    if (!mounted) return;
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: StMotion.base, curve: StMotion.easeOut);
    });
    if (_chat.status == TextChatStatus.ended && !_finishedShown) {
      // finish_practice: the coach said goodbye. Say it once.
      _finishedShown = true;
      showStToast(context, title: 'Session finished', description: 'Your chat is saved in Coach.');
    }
  }

  @override
  void dispose() {
    _chat.removeListener(_onChange);
    _chat.dispose();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final t = _input.text;
    if (t.trim().isEmpty) return;
    _input.clear();
    _chat.send(t);
  }

  void _end() {
    _chat.end();
    ref.invalidate(coachHistoryProvider);
    ref.invalidate(subscriptionProvider);
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final left = _chat.messagesLeft;
    final starting = _chat.status == TextChatStatus.starting;
    return PopScope(
      canPop: false,
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
                      onTap: _end,
                      child: SizedBox(
                        height: 48,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: Row(children: [StIcon(StIcons.close, size: 24, color: c.textStrong), const SizedBox(width: 6), Text('End', style: StType.label.copyWith(color: c.textStrong))]),
                        ),
                      ),
                    ),
                  ),
                  Expanded(child: Text(widget.launch.bundle.title, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.label.copyWith(color: c.textStrong))),
                  StIconButton(
                    icon: _stripOpen ? StIcons.chevronDown : StIcons.chevronRight,
                    semanticLabel: _stripOpen ? 'Hide phrases' : 'Show phrases',
                    variant: StButtonVariant.ghost,
                    onPressed: () => setState(() => _stripOpen = !_stripOpen),
                  ),
                ],
              ),
            ),
            if (_stripOpen)
              PhraseStrip(phrases: widget.launch.phrases, active: _chat.active, done: _chat.done, onTap: _chat.selectPhrase)
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text('${_chat.done.length + (_chat.active >= 0 ? 1 : 0)} of ${widget.launch.phrases.length} practised', style: StType.bodySmall.copyWith(color: c.textMuted)),
              ),
            Expanded(child: _messages(context, starting)),
            if (_chat.capReached)
              _Notice(text: 'This chat reached its message limit. Start a new one from Coach.', color: c.red600)
            else if (left != null && left <= 9 && left > 0)
              _Notice(text: '${Fmt.plural(left, 'message')} left in this chat.', color: c.textMuted),
            if (_chat.status != TextChatStatus.ended && _chat.status != TextChatStatus.error) _composer(context),
          ],
        ),
      ),
    );
  }

  Widget _messages(BuildContext context, bool starting) {
    if (_chat.status == TextChatStatus.error) {
      final e = _chat.error;
      final plan = e is ApiException && e.isTierLimit;
      return Center(
        child: ErrorPanel(
          title: plan ? friendlyError(e) : "We couldn't start the chat.",
          error: plan ? null : e,
          onRetry: plan ? null : _chat.start,
        ),
      );
    }
    final items = _chat.messages;
    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      children: [
        for (final m in items)
          ChatBubble(
            text: m.text,
            fromUser: m.fromUser,
            phrases: widget.launch.phrases,
            onPhraseTap: (p) => openPhraseSheet(context, p),
            failed: m.failed,
            onRetry: () => _chat.retry(m),
          ),
        if (starting || _chat.status == TextChatStatus.waiting) const TypingBubble(),
        if (_chat.error != null && _chat.status == TextChatStatus.ready && !_chat.capReached)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text(friendlyError(_chat.error!), style: StType.bodySmall.copyWith(color: context.st.red600))),
      ],
    );
  }

  Widget _composer(BuildContext context) {
    final c = context.st;
    final busy = _chat.status != TextChatStatus.ready;
    return Container(
      decoration: BoxDecoration(color: c.surfaceCard, border: Border(top: BorderSide(color: c.borderSubtle))),
      padding: EdgeInsets.fromLTRB(12, 8, 8, 8 + MediaQuery.paddingOf(context).bottom),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: StInput(
              controller: _input,
              placeholder: 'Write in English…',
              minLines: 1,
              maxLines: 4,
              enabled: !_chat.capReached,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.newline,
            ),
          ),
          const SizedBox(width: 4),
          StIconButton(icon: StIcons.send, semanticLabel: 'Send', variant: StButtonVariant.solid, tone: StTone.primary, size: StSize.lg, round: true, onPressed: busy || _chat.capReached ? null : _send),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 4), child: Text(text, style: StType.bodySmall.copyWith(color: color))),
      );
}
