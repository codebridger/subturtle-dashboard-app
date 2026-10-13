import '../core/api_exception.dart';
import '../core/providers.dart';
import '../models/account.dart';
import '../models/content.dart';
import '../models/json.dart';
import '../models/save_assistant.dart';

/// Gives repositories the signed-in user's id. The server's caller guard
/// rejects any other id, so this must be the token's id.
typedef UserIdReader = String Function();

abstract class _Repo {
  _Repo(this.fn, this.data, this.userId);
  final FunctionProvider fn;
  final DataProvider data;
  final UserIdReader userId;

  String get uid {
    final id = userId();
    if (id.isEmpty) throw ApiException('You are signed out.', statusCode: 401);
    return id;
  }
}

/// Today board (`board` module) and the Pool (`pool` module).
class BoardRepository extends _Repo {
  BoardRepository(super.fn, super.data, super.userId);

  /// Active board records. Today only `leitner_review` exists.
  Future<List<BoardActivity>> getBoard() async {
    final res = await fn.run('get-board', {'userId': uid});
    return listOf(res, BoardActivity.fromJson);
  }

  /// Marks a card as seen (`state: idle`).
  Future<void> consume(String type, {String? refId}) => fn.run('consume-activity', {'userId': uid, 'type': type, 'refId': ?refId});

  /// Pooled phrases waiting for their first meeting, oldest first.
  Future<List<PoolItem>> getPool() async {
    final res = await fn.run('get-pool', {'userId': uid});
    return listOf(res, PoolItem.fromJson);
  }

  /// Ends a Pool session: the phrases move into review box 1.
  Future<void> completePoolSession(List<String> phraseIds) => fn.run('complete-pool-session', {'userId': uid, 'phraseIds': phraseIds});
}

/// Smart Review (`leitner_box` module).
///
/// The server has no way to undo a grade, so the app must hold a grade back
/// until it is sure (see the review screen's pending-grade logic).
class ReviewRepository extends _Repo {
  ReviewRepository(super.fn, super.data, super.userId);

  /// Today's due cards (daily limit and per-box quotas applied by the server).
  Future<List<ReviewItem>> getDueSession({int limit = 20}) async {
    final res = await fn.run('get-review-session', {'userId': uid, 'limit': limit});
    return listOf(res, ReviewItem.fromJson);
  }

  /// Cards for chosen phrases (review one bundle).
  Future<List<ReviewItem>> getCustomSession(List<String> phraseIds) async {
    if (phraseIds.isEmpty) return [];
    final res = await fn.run('get-custom-review-session', {'userId': uid, 'phraseIds': phraseIds});
    return listOf(res, ReviewItem.fromJson);
  }

  /// Learned (true) or Forgot (false).
  Future<void> submit(String phraseId, {required bool learned}) => fn.run('submit-review', {'userId': uid, 'phraseId': phraseId, 'isCorrect': learned});

  /// Stats and settings, or null when the user has no review box yet.
  Future<LeitnerStats?> getStats() async {
    final res = await fn.run('get-stats', {'userId': uid});
    return res == null ? null : LeitnerStats.fromJson(res);
  }

  Future<PhraseManagementInfo> getPhraseInfo() async {
    final res = await fn.run('get-phrase-management-info', {'userId': uid});
    return PhraseManagementInfo.fromJson(res);
  }

  /// Recomputes the Today review card.
  Future<void> refreshBoard() => fn.run('refresh-board-status', {'userId': uid});
}

/// Bundles and phrases (`phrase_bundle` module + data provider).
class BundleRepository extends _Repo {
  BundleRepository(super.fn, super.data, super.userId);

  /// All bundles, newest first (same query as the web Bundles page).
  Future<List<Bundle>> listBundles({String? search, int limit = 200}) async {
    final docs = await data.find(
      database: Db.userContent,
      collection: Db.bundle,
      query: {
        'refId': uid,
        if (search != null && search.isNotEmpty) 'title': {r'$regex': RegExp.escape(search), r'$options': 'i'},
      },
      options: {
        'sort': {'_id': -1},
        'limit': limit,
      },
    );
    return docs.map(Bundle.fromJson).toList();
  }

  Future<Bundle?> getBundle(String id) async {
    final docs = await data.findByIds(database: Db.userContent, collection: Db.bundle, ids: [id], accessQuery: {'refId': uid});
    return docs.isEmpty ? null : Bundle.fromJson(docs.first);
  }

  /// Phrases by id, in the order of [ids].
  Future<List<Phrase>> getPhrases(List<String> ids) async {
    final docs = await data.findByIds(database: Db.userContent, collection: Db.phrase, ids: ids, accessQuery: {'refId': uid});
    final byId = {for (final d in docs) idOf(d): Phrase.fromJson(d)};
    return [for (final id in ids) ?byId[id]];
  }

  /// The most recent saved phrases (used to guess the translation language).
  Future<List<Phrase>> recentPhrases({int limit = 5}) async {
    final docs = await data.find(
      database: Db.userContent,
      collection: Db.phrase,
      query: {'refId': uid},
      options: {
        'sort': {'_id': -1},
        'limit': limit,
      },
    );
    return docs.map(Phrase.fromJson).toList();
  }

  Future<Bundle> createBundle(String title) async {
    final doc = await data.insertOne(database: Db.userContent, collection: Db.bundle, doc: {'title': title.trim(), 'refId': uid});
    if (doc == null) throw ApiException('Could not create the bundle.');
    return Bundle.fromJson(doc);
  }

  Future<void> renameBundle(String id, String title) => data.updateOne(
        database: Db.userContent,
        collection: Db.bundle,
        query: {'_id': id, 'refId': uid},
        update: {'title': title.trim()},
      );

  /// Deletes the bundle and every phrase that is in no other bundle.
  Future<void> removeBundle(String id) => fn.run('removeBundle', {'_id': id, 'refId': uid});

  /// Removes a phrase from a bundle; deletes it when no other bundle has it.
  Future<void> removePhrase({required String phraseId, required String bundleId}) => fn.run('removePhrase', {'phraseId': phraseId, 'bundleId': bundleId, 'refId': uid});

  /// Changes fields of a phrase. Mobile only edits `translation`.
  Future<void> updatePhrase(String phraseId, Map<String, dynamic> update) => fn.run('updatePhrase', {'phraseId': phraseId, 'refId': uid, 'update': update});

  /// Saves a phrase into [bundleIds]. With [detail] it is saved as a
  /// `linguistic` phrase (chunks, definition, direction), like the extension does.
  /// Reuses an existing phrase with the same text. Throws `TIER_LIMIT_REACHED: "save_words"`
  /// when the Starter cap is reached.
  Future<Phrase> createPhrase({
    required String phrase,
    required String translation,
    required List<String> bundleIds,
    String? translationLanguage,
    String? context,
    DetailedTranslation? detail,
  }) async {
    final res = await fn.run('createPhrase', {
      'phrase': phrase,
      'translation': translation,
      'translation_language': ?translationLanguage,
      'bundleIds': bundleIds,
      'refId': uid,
      'type': detail == null ? 'normal' : 'linguistic',
      if (detail != null) ...{
        'context': ?context,
        'direction': {'source': detail.sourceDirection, 'target': detail.targetDirection},
        'language_info': {'source': detail.sourceLanguage ?? 'en', 'target': detail.targetLanguage ?? translationLanguage ?? ''},
        'linguistic_data': ?detail.linguistic?.toJson(),
        'chunks': detail.chunks.map((c) => c.toJson()).toList(),
      },
    });
    return Phrase.fromJson(res);
  }
}

/// Translation and speech (`translation` module).
class TranslationRepository extends _Repo {
  TranslationRepository(super.fn, super.data, super.userId);

  /// One-line translation of [phrase] in [context].
  Future<String> translateSimple({required String phrase, required String context, required String targetLanguage}) async {
    final res = await fn.run('translateWithContext', {
      'phrase': phrase,
      'context': context,
      'translationType': 'simple',
      'sourceLanguage': 'auto',
      'targetLanguage': targetLanguage,
      'userId': uid,
    });
    return str(res).trim();
  }

  /// Full analysis: translation, chunks, definition, transliteration, direction.
  Future<DetailedTranslation> translateDetailed({required String phrase, required String context, required String targetLanguage}) async {
    final res = await fn.run('translateWithContext', {
      'phrase': phrase,
      'context': context,
      'translationType': 'detailed',
      'sourceLanguage': 'auto',
      'targetLanguage': targetLanguage,
      'userId': uid,
    });
    return DetailedTranslation.fromJson(res);
  }

  /// Answers a follow-up question about [phrase] ("Is it formal?") in the
  /// learner's language. [history] is the chat so far, oldest first, as
  /// `(role, text)` pairs where role is `user` or `assistant`. Returns the
  /// reply text, or '' when the tutor had nothing to say.
  Future<String> advise({
    required String phrase,
    required String context,
    required String message,
    List<(String, String)> history = const [],
    String? targetLanguage,
  }) async {
    final res = await fn.run('translationAdvice', {
      'phrase': phrase,
      'context': context,
      'message': message,
      'history': [for (final (role, text) in history) {'role': role, 'text': text}],
      'sourceLanguage': 'English',
      'targetLanguage': ?targetLanguage,
    });
    return str(asJson(res)['reply']).trim();
  }

  /// MP3 for [text] as a `data:audio/mp3;base64,…` URI (use it as is).
  Future<String> speak(String text, {String languageCode = 'en-US', String voiceName = 'en-US-Standard-A'}) async {
    final res = await fn.run('textToSpeechBase64', {'text': text, 'languageCode': languageCode, 'voiceName': voiceName});
    return str(res);
  }
}

/// Profile (data provider on `user_content.profile`).
class ProfileRepository extends _Repo {
  ProfileRepository(super.fn, super.data, super.userId);

  Future<Profile?> getProfile() async {
    final doc = await data.findOne(database: Db.userContent, collection: Db.profile, query: {'refId': uid});
    return doc == null ? null : Profile.fromJson(doc);
  }

  Future<void> updateName(String name) => data.updateOne(database: Db.userContent, collection: Db.profile, query: {'refId': uid}, update: {'name': name.trim()});
}

/// Plan and usage (`subscription` module). Read-only on mobile.
class SubscriptionRepository extends _Repo {
  SubscriptionRepository(super.fn, super.data, super.userId);

  Future<SubscriptionDetails> getDetails() async {
    final res = await fn.run('getSubscriptionDetails', {'userId': uid});
    return SubscriptionDetails.fromJson(res);
  }

  /// The public price list. Needs a token (an anonymous one is enough).
  Future<List<TierPlan>> getPlans() async {
    final res = await fn.run('getSubscriptionPlans', const <String, dynamic>{});
    return listOf(res, TierPlan.fromJson);
  }
}

/// Coach sessions, voice side (`live_session` module) and history.
class LiveSessionRepository extends _Repo {
  LiveSessionRepository(super.fn, super.data, super.userId);

  Future<List<CoachVoice>> getVoices() async {
    final res = await fn.run('get-live-session-voices', const <String, dynamic>{});
    final list = listOf(res, CoachVoice.fromJson);
    return list.isEmpty ? CoachVoice.fallback : list;
  }

  /// Past sessions, newest first. Throws `TIER_LIMIT_REACHED: "session_history"` on Starter.
  Future<CoachSessionPage> listSessions({int page = 0, int limit = 20}) async {
    final res = await fn.run('list-live-sessions', {'userId': uid, 'page': page, 'limit': limit});
    return CoachSessionPage.fromJson(res);
  }

  /// One session with its transcript (voice collection first, then text).
  Future<CoachSession?> getSession(String id) async {
    for (final collection in [Db.liveSession, Db.liveSessionText]) {
      final doc = await data.findOne(database: Db.userContent, collection: collection, query: {'_id': id, 'refId': uid});
      if (doc != null) return CoachSession.fromJson(doc);
    }
    return null;
  }

  /// A single-use Gemini Live token. [resume] is true when reconnecting the same session.
  Future<GeminiLiveToken> requestGeminiToken({required String instructions, required String voice, List<CoachTool> tools = const [], bool resume = false}) async {
    final res = await fn.run('request-gemini-live-session-ephemeral-token', {
      'userId': uid,
      'instructions': instructions,
      'voice': voice,
      'tools': tools.map((t) => t.toJson()).toList(),
      if (resume) 'isResume': true,
    });
    return GeminiLiveToken.fromJson(res);
  }

  /// Creates the voice session record. Returns its id.
  Future<String> createRecord({required GeminiLiveToken token, required Map<String, dynamic> metadata}) async {
    final res = await fn.run('create-live-session-record', {
      'userId': uid,
      'type': 'bundle-practice',
      'provider': 'gemini',
      'session': token.raw,
      'metadata': metadata,
    });
    return idOf(asJson(res));
  }

  /// Saves transcript lines (upsert by line id).
  Future<void> saveDialogs(String sessionId, List<DialogLine> lines) {
    if (lines.isEmpty) return Future.value();
    return fn.run('update-live-session-record', {
      'userId': uid,
      'sessionId': sessionId,
      'provider': 'gemini',
      'update': {'dialogs': lines.map((l) => l.toJson()).toList()},
    });
  }

  /// Reports token usage. [partial] is billed: send each delta exactly once.
  Future<void> reportUsage(String sessionId, {required Map<String, dynamic> partial, required Map<String, dynamic> total}) => fn.run('update-live-session-record', {
        'userId': uid,
        'sessionId': sessionId,
        'provider': 'gemini',
        'update': {'partialUsage': partial, 'totalUsage': total},
      });

  /// Charges voice time at the end of a session (rounded up to whole minutes).
  Future<VoiceBudget> debitVoice(int seconds) async {
    final res = await fn.run('debit-voice-minutes', {'userId': uid, 'seconds': seconds});
    return VoiceBudget.fromJson(res);
  }
}

/// Coach sessions, text side (`live_session_text` module).
class TextChatRepository extends _Repo {
  TextChatRepository(super.fn, super.data, super.userId);

  static const defaultModel = 'gemini-3.1-flash-lite';

  /// Starts a chat (uses one of the monthly chats). Returns the session id.
  Future<String> create({required String instructions, List<CoachTool> tools = const [], Map<String, dynamic> metadata = const {}}) async {
    final res = await fn.run('create-text-session', {
      'userId': uid,
      'instructions': instructions,
      'toolDeclarations': tools.map((t) => t.toJson()).toList(),
      'model': defaultModel,
      'metadata': metadata,
    });
    return str(asJson(res)['sessionId']);
  }

  /// A message the learner typed.
  Future<TextTurnResult> sendUser(String sessionId, String text) => _turn(sessionId, {'kind': 'user', 'text': text});

  /// A hidden nudge (welcome, card switch). Not shown in the transcript.
  Future<TextTurnResult> sendSystem(String sessionId, String text) => _turn(sessionId, {'kind': 'system', 'text': text});

  /// Answers to the coach's tool calls.
  Future<TextTurnResult> sendToolResults(String sessionId, List<Map<String, dynamic>> results) => _turn(sessionId, {'kind': 'toolResults', 'results': results});

  Future<TextTurnResult> _turn(String sessionId, Map<String, dynamic> input) async {
    final res = await fn.run('text-turn', {'userId': uid, 'sessionId': sessionId, 'input': input});
    return TextTurnResult.fromJson(res);
  }
}

/// The save assistant's conversations (`save_assistant` module). The server
/// keeps the history and does the translation work: the app sends only the
/// new message or the phrase it picked.
///
/// Errors: `AI_CREDIT_EXHAUSTED` (budget used up), `TIER_LIMIT_REACHED:
/// "text_chat_messages_per_chat"` (the session is full) and
/// `SAVE_ASSISTANT_UNAVAILABLE` (the AI provider failed; nothing was stored).
class SaveAssistantRepository extends _Repo {
  SaveAssistantRepository(super.fn, super.data, super.userId);

  /// Starts a session with [message]. [source] is `share`, `paste` or `typed`.
  Future<SaveSessionStart> createSession({required String message, required String targetLanguage, String? sourceLanguage, String? source, String? app}) async {
    final res = await fn.run('createSaveSession', {
      'userId': uid,
      'message': message,
      'targetLanguage': targetLanguage,
      'sourceLanguage': ?sourceLanguage,
      if (source != null) 'source': {'kind': source, 'app': ?app},
    });
    return SaveSessionStart.fromJson(res);
  }

  /// The translation of one of the session's candidates ([phrase] is its text).
  Future<SavePickResult> pick(String sessionId, String phrase) async {
    final res = await fn.run('saveSessionTurn', {'userId': uid, 'sessionId': sessionId, 'pick': phrase});
    return SavePickResult.fromJson(res);
  }

  /// A follow-up question about the phrase shown last.
  Future<SaveReplyResult> ask(String sessionId, String message) async {
    final res = await fn.run('saveSessionTurn', {'userId': uid, 'sessionId': sessionId, 'message': message});
    return SaveReplyResult.fromJson(res);
  }

  /// Links a phrase saved with `createPhrase` to the session. Safe to repeat.
  Future<SaveAttachResult> attachSavedPhrase(String sessionId, {required String phraseId, String? bundleId}) async {
    final res = await fn.run('attachSavedPhrase', {'userId': uid, 'sessionId': sessionId, 'phraseId': phraseId, 'bundleId': ?bundleId});
    return SaveAttachResult.fromJson(res);
  }

  /// Newest first. For the next page, pass the last row's [lastMessageAt] as [before].
  Future<List<SaveSessionSummary>> listSessions({String? query, bool onlySaved = false, int limit = 20, DateTime? before}) async {
    final res = await fn.run('listSaveSessions', {
      'userId': uid,
      if (query != null && query.trim().isNotEmpty) 'query': query.trim(),
      if (onlySaved) 'onlySaved': true,
      'limit': limit,
      if (before != null) 'before': before.toUtc().toIso8601String(),
    });
    return listOf(res, SaveSessionSummary.fromJson);
  }

  Future<SaveSessionDetail> getSession(String sessionId) async {
    final res = await fn.run('getSaveSession', {'userId': uid, 'sessionId': sessionId});
    return SaveSessionDetail.fromJson(res);
  }

  /// Removes one conversation. Saved phrases stay in their bundles.
  Future<int> deleteSession(String sessionId) async => integer(asJson(await fn.run('deleteSaveSession', {'userId': uid, 'sessionId': sessionId}))['deleted']);

  /// Removes every conversation of the user.
  Future<int> deleteAll() async => integer(asJson(await fn.run('deleteSaveSession', {'userId': uid, 'all': true}))['deleted']);
}
