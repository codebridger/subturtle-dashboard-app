import 'package:flutter/foundation.dart';
import 'package:subturtle_api/subturtle_api.dart';

/// One message on screen.
class ChatMessage {
  ChatMessage({required this.text, required this.fromUser, this.failed = false});
  final String text;
  final bool fromUser;
  bool failed;
}

enum TextChatStatus { starting, ready, waiting, ended, error }

/// The text coach: creates a `live_session_text` session, sends turns and runs
/// the coach's tool calls (`activate_phrase`, `finish_practice`) locally, the
/// same loop as the web store `liveSessionGeminiText`.
class TextChatController extends ChangeNotifier {
  TextChatController({required this.repo, required this.phrases, required this.instructions, required this.metadata, this.messageCap});

  final TextChatRepository repo;
  final List<Phrase> phrases;
  final String instructions;
  final Map<String, dynamic> metadata;

  /// Per-chat cap on learner messages (null = unlimited).
  final int? messageCap;

  final List<ChatMessage> messages = [];
  TextChatStatus status = TextChatStatus.starting;
  Object? error;

  /// True when the chat reached its message cap; the composer is then off.
  bool capReached = false;
  bool wrapUpWarning = false;
  int active = -1;
  final Set<int> done = {};
  String? _sessionId;

  /// The model never answered yet: a COACH_UNAVAILABLE now refunds and closes
  /// the chat on the server, so a retry must start a new one.
  bool _hadReply = false;

  int get userMessages => messages.where((m) => m.fromUser && !m.failed).length;
  int? get messagesLeft => messageCap == null ? null : (messageCap! - userMessages).clamp(0, messageCap!);

  Future<void> start() async {
    status = TextChatStatus.starting;
    error = null;
    notifyListeners();
    try {
      _sessionId = await repo.create(instructions: instructions, tools: CoachPractice.tools, metadata: metadata);
      status = TextChatStatus.waiting;
      notifyListeners();
      await _run(await repo.sendSystem(_sessionId!, CoachPractice.welcomeText));
    } catch (e) {
      _fail(e);
    }
  }

  Future<void> send(String text) async {
    final t = text.trim();
    if (t.isEmpty || _sessionId == null || status == TextChatStatus.waiting || capReached) return;
    final msg = ChatMessage(text: t, fromUser: true);
    messages.add(msg);
    await _sendUser(msg);
  }

  Future<void> retry(ChatMessage msg) async {
    if (!msg.failed) return;
    msg.failed = false;
    if (_sessionId == null) {
      // The server closed the chat (the coach failed before its first reply): start a new one.
      try {
        _sessionId = await repo.create(instructions: instructions, tools: CoachPractice.tools, metadata: metadata);
      } catch (e) {
        msg.failed = true;
        error = e;
        notifyListeners();
        return;
      }
    }
    await _sendUser(msg);
  }

  Future<void> _sendUser(ChatMessage msg) async {
    status = TextChatStatus.waiting;
    notifyListeners();
    try {
      await _run(await repo.sendUser(_sessionId!, msg.text));
    } on ApiException catch (e) {
      if (e.feature == 'text_chat_messages_per_chat') {
        capReached = true;
        messages.remove(msg);
        status = TextChatStatus.ready;
        error = e;
        notifyListeners();
        return;
      }
      msg.failed = true;
      if (e.code == ApiException.coachUnavailable && !_hadReply) _sessionId = null;
      status = TextChatStatus.ready;
      error = e;
      notifyListeners();
    } catch (e) {
      msg.failed = true;
      status = TextChatStatus.ready;
      error = e;
      notifyListeners();
    }
  }

  /// The learner tapped a phrase card.
  Future<void> selectPhrase(int i) async {
    if (_sessionId == null || status == TextChatStatus.waiting || i < 0 || i >= phrases.length) return;
    _activate(i);
    status = TextChatStatus.waiting;
    notifyListeners();
    try {
      await _run(await repo.sendSystem(_sessionId!, CoachPractice.cardTapped(phrases[i])));
    } catch (e) {
      status = TextChatStatus.ready;
      error = e;
      notifyListeners();
    }
  }

  void _activate(int i) {
    if (active >= 0 && active != i) done.add(active);
    active = i;
  }

  /// Runs tool calls until the model answers with text.
  Future<void> _run(TextTurnResult result) async {
    var r = result;
    var finished = false;
    var guard = 0;
    while (!r.done && guard++ < 6) {
      final outputs = <Map<String, dynamic>>[];
      for (final call in r.toolCalls) {
        final out = CoachPractice.runTool(call, phrases, onActivate: _activate, onFinish: () => finished = true);
        outputs.add({'id': ?call.id, 'name': call.name, 'output': out});
      }
      if (outputs.isEmpty) break;
      r = await repo.sendToolResults(_sessionId!, outputs);
    }
    if (r.text.trim().isNotEmpty) {
      messages.add(ChatMessage(text: r.text.trim(), fromUser: false));
      _hadReply = true;
    }
    wrapUpWarning = wrapUpWarning || r.wrapUpWarning;
    status = finished ? TextChatStatus.ended : TextChatStatus.ready;
    error = null;
    notifyListeners();
  }

  void _fail(Object e) {
    error = e;
    status = TextChatStatus.error;
    notifyListeners();
  }

  /// There is no "end" call on the server: every turn is saved as it happens.
  void end() {
    status = TextChatStatus.ended;
    notifyListeners();
  }
}
