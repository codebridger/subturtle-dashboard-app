import 'content.dart';
import 'json.dart';

/// A phrase the save assistant offers to explain (`save_assistant` module).
/// [type] is `full` for the learner's whole first message, else a chunk type
/// (`phrasal_verb`, `idiom`, …).
class SaveCandidate {
  const SaveCandidate({required this.text, this.type = 'other'});

  final String text;
  final String type;

  bool get isFull => type == 'full';

  factory SaveCandidate.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveCandidate(text: str(j['text']), type: str(j['type'], 'other'));
  }
}

/// `createSaveSession`: the new session, its candidates and the translation of
/// the whole message.
class SaveSessionStart {
  const SaveSessionStart({required this.sessionId, required this.candidates, required this.translation, required this.messageId});

  final String sessionId;
  final List<SaveCandidate> candidates;
  final DetailedTranslation translation;
  final String messageId;

  factory SaveSessionStart.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveSessionStart(
      sessionId: str(j['sessionId']),
      candidates: listOf(j['candidates'], SaveCandidate.fromJson),
      translation: DetailedTranslation.fromJson(j['translation']),
      messageId: str(j['messageId']),
    );
  }
}

/// `saveSessionTurn` with `pick`: the picked phrase's translation. [cached]
/// is true when the session already had it (no AI call, no charge).
class SavePickResult {
  const SavePickResult({required this.translation, required this.messageId, this.cached = false, this.wrapUp = false});

  final DetailedTranslation translation;
  final String messageId;
  final bool cached;

  /// The session is a few messages from its cap.
  final bool wrapUp;

  factory SavePickResult.fromJson(dynamic v) {
    final j = asJson(v);
    return SavePickResult(
      translation: DetailedTranslation.fromJson(j['translation']),
      messageId: str(j['messageId']),
      cached: boolean(j['cached']),
      wrapUp: boolean(j['wrapUp']),
    );
  }
}

/// `saveSessionTurn` with `message`: the tutor's answer. [candidates] is the
/// full new list, only when the answer added phrase options.
class SaveReplyResult {
  const SaveReplyResult({required this.reply, required this.messageId, this.wrapUp = false, this.candidates});

  final String reply;
  final String messageId;
  final bool wrapUp;
  final List<SaveCandidate>? candidates;

  factory SaveReplyResult.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveReplyResult(
      reply: str(j['reply']).trim(),
      messageId: str(j['messageId']),
      wrapUp: boolean(j['wrapUp']),
      candidates: j['candidates'] is List ? listOf(j['candidates'], SaveCandidate.fromJson) : null,
    );
  }
}

/// `attachSavedPhrase`. [attached] is false when the phrase was already there.
class SaveAttachResult {
  const SaveAttachResult({required this.attached, required this.savedCount, this.messageId});

  final bool attached;
  final int savedCount;
  final String? messageId;

  factory SaveAttachResult.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveAttachResult(attached: boolean(j['attached']), savedCount: integer(j['savedCount']), messageId: strOrNull(j['messageId']));
  }
}

/// A row of `listSaveSessions`: no messages. [title] is the first message,
/// shortened by the server when it is long.
class SaveSessionSummary {
  const SaveSessionSummary({required this.sessionId, required this.title, this.savedCount = 0, this.savedPhrases = const [], this.lastMessageAt});

  final String sessionId;
  final String title;
  final int savedCount;
  final List<String> savedPhrases;
  final DateTime? lastMessageAt;

  factory SaveSessionSummary.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveSessionSummary(
      sessionId: str(j['sessionId']),
      title: str(j['title']),
      savedCount: integer(j['savedCount']),
      savedPhrases: listOf(j['savedPhrases'], (e) => str(e)),
      lastMessageAt: date(j['lastMessageAt']),
    );
  }
}

/// One row of a stored conversation.
///  - `text`: a plain message (a pick is stored as a user `text` message).
///  - `translation`: [text] is the phrase, [translation] its card.
///  - `saved`: [savedPhraseId], [savedPhrase] and [savedBundleId] are set.
class SaveSessionMessage {
  const SaveSessionMessage({
    required this.id,
    required this.fromUser,
    required this.kind,
    this.text = '',
    this.translation,
    this.savedPhraseId,
    this.savedPhrase,
    this.savedBundleId,
    this.createdAt,
  });

  final String id;
  final bool fromUser;

  /// `text`, `translation` or `saved`.
  final String kind;
  final String text;
  final DetailedTranslation? translation;
  final String? savedPhraseId;
  final String? savedPhrase;
  final String? savedBundleId;
  final DateTime? createdAt;

  factory SaveSessionMessage.fromJson(dynamic v) {
    final j = asJson(v);
    final kind = str(j['kind'], 'text');
    final payload = asJson(j['payload']);
    return SaveSessionMessage(
      id: str(j['id']),
      fromUser: j['role'] == 'user',
      kind: kind,
      text: str(j['text']),
      translation: kind == 'translation' && j['payload'] is Map ? DetailedTranslation.fromJson(payload) : null,
      savedPhraseId: kind == 'saved' ? strOrNull(payload['phraseId']) : null,
      savedPhrase: kind == 'saved' ? strOrNull(payload['phrase']) : null,
      savedBundleId: kind == 'saved' ? strOrNull(payload['bundleId']) : null,
      createdAt: date(j['createdAt']),
    );
  }
}

/// `getSaveSession`: the whole conversation.
class SaveSessionDetail {
  const SaveSessionDetail({
    required this.sessionId,
    required this.title,
    this.messages = const [],
    this.candidates = const [],
    this.savedPhraseIds = const [],
    this.savedPhrases = const [],
    this.targetLanguage,
    this.createdAt,
    this.lastMessageAt,
  });

  final String sessionId;
  final String title;
  final List<SaveSessionMessage> messages;
  final List<SaveCandidate> candidates;
  final List<String> savedPhraseIds;
  final List<String> savedPhrases;
  final String? targetLanguage;
  final DateTime? createdAt;
  final DateTime? lastMessageAt;

  /// The learner's first message, in full (the title may be shortened).
  String get firstMessage => messages.where((m) => m.fromUser && m.kind == 'text').firstOrNull?.text ?? title;

  factory SaveSessionDetail.fromJson(dynamic v) {
    final j = asJson(v);
    return SaveSessionDetail(
      sessionId: str(j['sessionId']),
      title: str(j['title']),
      messages: listOf(j['messages'], SaveSessionMessage.fromJson),
      candidates: listOf(j['candidates'], SaveCandidate.fromJson),
      savedPhraseIds: listOf(j['savedPhraseIds'], (e) => str(e)),
      savedPhrases: listOf(j['savedPhrases'], (e) => str(e)),
      targetLanguage: strOrNull(j['targetLanguage']),
      createdAt: date(j['createdAt']),
      lastMessageAt: date(j['lastMessageAt']),
    );
  }
}
