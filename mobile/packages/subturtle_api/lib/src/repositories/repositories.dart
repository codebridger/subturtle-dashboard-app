import '../core/api_exception.dart';
import '../core/providers.dart';
import '../models/account.dart';
import '../models/content.dart';
import '../models/json.dart';
import '../models/language.dart';
import '../models/save_assistant.dart';

/// Gives repositories the signed-in user's id. The server's caller guard
/// rejects any other id, so this must be the token's id.
typedef UserIdReader = String Function();

/// Gives repositories the active learning language (`de`), or null before the
/// app knows it. Language-scoped functions send it as `language`; a server
/// without languages ignores the extra argument.
typedef LanguageReader = String? Function();

String? _noLanguage() => null;

abstract class _Repo {
  _Repo(this.fn, this.data, this.userId, [this.activeLanguage = _noLanguage]);
  final FunctionProvider fn;
  final DataProvider data;
  final UserIdReader userId;
  final LanguageReader activeLanguage;

  String get uid {
    final id = userId();
    if (id.isEmpty) throw ApiException('You are signed out.', statusCode: 401);
    return id;
  }

  /// `{language: …}` for a language-scoped call: [language], else the active one.
  Map<String, dynamic> scope([String? language]) {
    final l = language ?? activeLanguage();
    return l == null || l.isEmpty ? const {} : {'language': l};
  }

  /// A data-provider filter for one language. Documents saved before 2.0 have
  /// no `language` and read as English (ADR-006), so English also matches them.
  Map<String, dynamic> languageFilter([String? language]) {
    final l = language ?? activeLanguage();
    if (l == null || l.isEmpty) return const {};
    return l == 'en'
        ? {
            'language': {
              r'$in': ['en', null],
            },
          }
        : {'language': l};
  }
}

/// Today board (`board` module) and the Pool (`pool` module).
class BoardRepository extends _Repo {
  BoardRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  /// The board of one language, with the "new language" flag of 2.0 servers.
  Future<BoardSnapshot> getBoardSnapshot({String? language}) async {
    final res = await fn.run('get-board', {'userId': uid, ...scope(language)});
    return BoardSnapshot.fromJson(res);
  }

  /// Active board records. Today only `leitner_review` exists.
  Future<List<BoardActivity>> getBoard({String? language}) async => (await getBoardSnapshot(language: language)).activities;

  /// Marks a card as seen (`state: idle`).
  Future<void> consume(String type, {String? refId, String? language}) => fn.run('consume-activity', {'userId': uid, 'type': type, 'refId': ?refId, ...scope(language)});

  /// Pooled phrases waiting for their first meeting, oldest first.
  Future<List<PoolItem>> getPool({String? language}) async {
    final res = await fn.run('get-pool', {'userId': uid, ...scope(language)});
    return listOf(res, PoolItem.fromJson);
  }

  /// Ends a Pool session: the phrases move into review box 1.
  Future<void> completePoolSession(List<String> phraseIds, {String? language}) => fn.run('complete-pool-session', {'userId': uid, 'phraseIds': phraseIds, ...scope(language)});
}

/// Smart Review (`leitner_box` module).
///
/// The server has no way to undo a grade, so the app must hold a grade back
/// until it is sure (see the review screen's pending-grade logic).
class ReviewRepository extends _Repo {
  ReviewRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  /// Today's due cards (daily limit and per-box quotas applied by the server).
  Future<List<ReviewItem>> getDueSession({int limit = 20, String? language}) async {
    final res = await fn.run('get-review-session', {'userId': uid, 'limit': limit, ...scope(language)});
    return listOf(res, ReviewItem.fromJson);
  }

  /// Cards for chosen phrases (review one bundle).
  Future<List<ReviewItem>> getCustomSession(List<String> phraseIds, {String? language}) async {
    if (phraseIds.isEmpty) return [];
    final res = await fn.run('get-custom-review-session', {'userId': uid, 'phraseIds': phraseIds, ...scope(language)});
    return listOf(res, ReviewItem.fromJson);
  }

  /// Learned (true) or Forgot (false). [result] is the 2.0 three-way result
  /// (`right`, `close`, `wrong`); `close` keeps the card in its box. Old servers
  /// read only `isCorrect`, so a close answer counts as learned there, as the
  /// 1.x app did with a typo.
  Future<void> submit(String phraseId, {required bool learned, String? result, String? language}) => fn.run('submit-review', {
        'userId': uid,
        'phraseId': phraseId,
        'isCorrect': learned,
        'result': result ?? (learned ? ReviewResult.right : ReviewResult.wrong),
        ...scope(language),
      });

  /// Checks a typed fill-the-gap answer on the server. Null when the server
  /// has no `check-cloze-answer` (the app checks it itself then).
  Future<ClozeCheck?> checkCloze({required String phraseId, required String answer, String? language}) async {
    try {
      final res = await fn.run('check-cloze-answer', {'userId': uid, 'phraseId': phraseId, 'answer': answer, ...scope(language)});
      return ClozeCheck.fromJson(res);
    } on ApiException catch (e) {
      if (e.isMissingFunction) return null;
      rethrow;
    }
  }

  /// Stats and settings, or null when the user has no review box yet.
  Future<LeitnerStats?> getStats({String? language}) async {
    final res = await fn.run('get-stats', {'userId': uid, ...scope(language)});
    return res == null ? null : LeitnerStats.fromJson(res);
  }

  Future<PhraseManagementInfo> getPhraseInfo({String? language}) async {
    final res = await fn.run('get-phrase-management-info', {'userId': uid, ...scope(language)});
    return PhraseManagementInfo.fromJson(res);
  }

  /// Recomputes the Today review card.
  Future<void> refreshBoard({String? language}) => fn.run('refresh-board-status', {'userId': uid, ...scope(language)});
}

/// Bundles and phrases (`phrase_bundle` module + data provider).
class BundleRepository extends _Repo {
  BundleRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  /// The bundles of one language (the active one by default), newest first.
  Future<List<Bundle>> listBundles({String? search, int limit = 200, String? language}) async {
    final docs = await data.find(
      database: Db.userContent,
      collection: Db.bundle,
      query: {
        'refId': uid,
        ...languageFilter(language),
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

  /// The most recent saved phrases of one language.
  Future<List<Phrase>> recentPhrases({int limit = 5, String? language}) async {
    final docs = await data.find(
      database: Db.userContent,
      collection: Db.phrase,
      query: {'refId': uid, ...languageFilter(language)},
      options: {
        'sort': {'_id': -1},
        'limit': limit,
      },
    );
    return docs.map(Phrase.fromJson).toList();
  }

  /// Saved phrases of one language whose text contains [query] (Bundles search).
  Future<List<Phrase>> searchPhrases(String query, {int limit = 30, String? language}) async {
    final q = query.trim();
    if (q.isEmpty) return [];
    final docs = await data.find(
      database: Db.userContent,
      collection: Db.phrase,
      query: {
        'refId': uid,
        ...languageFilter(language),
        'phrase': {r'$regex': RegExp.escape(q), r'$options': 'i'},
      },
      options: {'limit': limit},
    );
    return docs.map(Phrase.fromJson).toList();
  }

  /// A new bundle in [language] (the active one by default).
  Future<Bundle> createBundle(String title, {String? language}) async {
    final doc = await data.insertOne(database: Db.userContent, collection: Db.bundle, doc: {'title': title.trim(), 'refId': uid, ...scope(language)});
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
  /// when the Starter cap is reached. [language] is the learning language the
  /// phrase belongs to (the active one by default); the server answers with
  /// the language it used.
  Future<Phrase> createPhrase({
    required String phrase,
    required String translation,
    required List<String> bundleIds,
    String? translationLanguage,
    String? context,
    DetailedTranslation? detail,
    String? language,
  }) async {
    final lang = scope(language)['language'] as String?;
    final res = await fn.run('createPhrase', {
      'phrase': phrase,
      'translation': translation,
      'translation_language': ?translationLanguage,
      'bundleIds': bundleIds,
      'refId': uid,
      'type': detail == null ? 'normal' : 'linguistic',
      'language': ?lang,
      if (detail != null) ...{
        'context': ?context,
        'direction': {'source': detail.sourceDirection, 'target': detail.targetDirection},
        'language_info': {'source': lang ?? detail.resolvedLanguage ?? detail.sourceLanguage ?? 'en', 'target': detail.targetLanguage ?? translationLanguage ?? ''},
        'linguistic_data': ?detail.linguistic?.toJson(),
        'chunks': detail.chunks.map((c) => c.toJson()).toList(),
      },
    });
    return Phrase.fromJson(res);
  }
}

/// Translation and speech (`translation` module).
class TranslationRepository extends _Repo {
  TranslationRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  /// Translation args. [targetLanguage] is the own language's English name
  /// ("Persian"), as 1.x servers want it; [translationLanguage] is its code
  /// for 2.0 servers. [language] is the learning language the learner expects.
  Map<String, dynamic> _args(String phrase, String context, String type, String targetLanguage, String? translationLanguage, String? language) => {
        'phrase': phrase,
        'context': context,
        'translationType': type,
        'sourceLanguage': 'auto',
        'targetLanguage': targetLanguage,
        'translationLanguage': ?translationLanguage,
        'userId': uid,
        ...scope(language),
      };

  /// One-line translation of [phrase] in [context].
  Future<String> translateSimple({required String phrase, required String context, required String targetLanguage, String? translationLanguage, String? language}) async {
    final res = await fn.run('translateWithContext', _args(phrase, context, 'simple', targetLanguage, translationLanguage, language));
    // 2.0 servers may wrap the text with the detected language.
    if (res is Map) return str(res['translation'] is Map ? res['translation']['phrase'] : res['translation'] ?? res['text']).trim();
    return str(res).trim();
  }

  /// Full analysis: translation, chunks, definition, transliteration,
  /// direction, and (2.0) the detected language and whether the learner has it.
  Future<DetailedTranslation> translateDetailed({required String phrase, required String context, required String targetLanguage, String? translationLanguage, String? language}) async {
    final res = await fn.run('translateWithContext', _args(phrase, context, 'detailed', targetLanguage, translationLanguage, language));
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
    String sourceLanguage = 'English',
    String? language,
  }) async {
    final res = await fn.run('translationAdvice', {
      'phrase': phrase,
      'context': context,
      'message': message,
      'history': [for (final (role, text) in history) {'role': role, 'text': text}],
      'sourceLanguage': sourceLanguage,
      'targetLanguage': ?targetLanguage,
      ...scope(language),
    });
    return str(asJson(res)['reply']).trim();
  }

  /// MP3 for [text] as a `data:audio/mp3;base64,…` URI (use it as is).
  /// Pass the phrase language's voice ([LearningLanguageCaps.speechVoice]); the
  /// English default is only for callers that do not know the language. The
  /// server refuses HD voices, so an HD name becomes that locale's standard voice.
  Future<String> speak(String text, {String? languageCode, String? voiceName}) async {
    var voice = voiceName == null || voiceName.isEmpty ? 'en-US-Standard-A' : voiceName;
    final parts = voice.split('-');
    final code = languageCode ?? (parts.length >= 2 ? '${parts[0]}-${parts[1]}' : 'en-US');
    if (voice.contains('HD')) voice = LearningLanguageCaps.speechVoices[code] ?? '$code-Standard-A';
    final res = await fn.run('textToSpeechBase64', {'text': text, 'languageCode': code, 'voiceName': voice});
    return str(res);
  }
}

/// Profile (data provider on `user_content.profile`).
class ProfileRepository extends _Repo {
  ProfileRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  Future<Profile?> getProfile() async {
    final doc = await data.findOne(database: Db.userContent, collection: Db.profile, query: {'refId': uid});
    return doc == null ? null : Profile.fromJson(doc);
  }

  /// Deletes the account and everything in it (phrases, bundles, reviews,
  /// sessions, profile), and cancels a paid plan. Cannot be undone.
  Future<void> deleteAccount() => fn.run('delete-account', {'userId': uid});

  Future<void> updateName(String name) => data.updateOne(database: Db.userContent, collection: Db.profile, query: {'refId': uid}, update: {'name': name.trim()});
}

/// Plan and usage (`subscription` module). Read-only on mobile.
class SubscriptionRepository extends _Repo {
  SubscriptionRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  Future<SubscriptionDetails> getDetails() async {
    final res = await fn.run('getSubscriptionDetails', {'userId': uid});
    return SubscriptionDetails.fromJson(res);
  }

  /// The public price list. Needs a token (an anonymous one is enough).
  Future<List<TierPlan>> getPlans() async {
    final res = await fn.run('getSubscriptionPlans', const <String, dynamic>{});
    return listOf(res, TierPlan.fromJson);
  }

  /// A Stripe Checkout session (`ui_mode: custom`, Adaptive Pricing on) for
  /// [tierId]. Returns its client secret, for Stripe.js. The server refuses it
  /// for paid users (no stacking plans). [successUrl] is where Stripe returns.
  Future<String> createCheckoutSession({required String tierId, String cadence = 'monthly', required String successUrl}) async {
    final res = await fn.run('createCustomCheckoutSession', {'userId': uid, 'tierId': tierId, 'cadence': cadence, 'successUrl': successUrl});
    return str(asJson(res)['clientSecret']);
  }
}

/// Coach sessions, voice side (`live_session` module) and history.
class LiveSessionRepository extends _Repo {
  LiveSessionRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  Future<List<CoachVoice>> getVoices() async {
    final res = await fn.run('get-live-session-voices', const <String, dynamic>{});
    final list = listOf(res, CoachVoice.fromJson);
    return list.isEmpty ? CoachVoice.fallback : list;
  }

  /// Past sessions of one language, newest first. Throws `TIER_LIMIT_REACHED: "session_history"` on Starter.
  Future<CoachSessionPage> listSessions({int page = 0, int limit = 20, String? language}) async {
    final res = await fn.run('list-live-sessions', {'userId': uid, 'page': page, 'limit': limit, ...scope(language)});
    return CoachSessionPage.fromJson(res);
  }

  /// The Coach prompt, built on the server for [language] with explanations in
  /// [explanationLanguage]. Null on servers without `get-coach-instructions`:
  /// the app builds the prompt itself then (from the shared live-practice spec).
  Future<CoachInstructions?> getCoachInstructions({
    required String explanationLanguage,
    required List<String> phraseIds,
    required String mode,
    String? language,
    String? voice,
  }) async {
    try {
      final res = await fn.run('get-coach-instructions', {
        'userId': uid,
        ...scope(language),
        'explanationLanguage': explanationLanguage,
        'phraseIds': phraseIds,
        'mode': mode,
        'voice': ?voice,
      });
      final out = CoachInstructions.fromJson(res);
      return out.instructions.isEmpty ? null : out;
    } on ApiException catch (e) {
      if (e.isMissingFunction) return null;
      rethrow;
    }
  }

  /// "This looks wrong" under a Coach explanation ([on] false is Undo).
  /// Returns false when the server cannot take flags yet.
  Future<bool> flagExplanation({required String sessionId, required int turnIndex, required bool on, String? language, String? explanationLanguage}) async {
    try {
      await fn.run('flag-coach-explanation', {
        'userId': uid,
        'sessionId': sessionId,
        'turnIndex': turnIndex,
        'on': on,
        ...scope(language),
        'explanationLanguage': ?explanationLanguage,
      });
      return true;
    } on ApiException catch (e) {
      if (e.isMissingFunction) return false;
      rethrow;
    }
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
  Future<String> createRecord({required GeminiLiveToken token, required Map<String, dynamic> metadata, String? language, String? explanationLanguage}) async {
    final res = await fn.run('create-live-session-record', {
      'userId': uid,
      'type': 'bundle-practice',
      'provider': 'gemini',
      'session': token.raw,
      'metadata': metadata,
      ...scope(language),
      'explanationLanguage': ?explanationLanguage,
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
  TextChatRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  static const defaultModel = 'gemini-3.1-flash-lite';

  /// Starts a chat (uses one of the monthly chats). Returns the session id.
  Future<String> create({required String instructions, List<CoachTool> tools = const [], Map<String, dynamic> metadata = const {}, String? language, String? explanationLanguage}) async {
    final res = await fn.run('create-text-session', {
      'userId': uid,
      'instructions': instructions,
      'toolDeclarations': tools.map((t) => t.toJson()).toList(),
      'model': defaultModel,
      'metadata': metadata,
      ...scope(language),
      'explanationLanguage': ?explanationLanguage,
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
  SaveAssistantRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  /// Starts a session with [message]. [source] is `share`, `paste` or `typed`.
  /// [language] is the learning language the learner expects (the active one
  /// by default); the answer carries the language the server detected.
  Future<SaveSessionStart> createSession({required String message, required String targetLanguage, String? sourceLanguage, String? source, String? app, String? translationLanguage, String? language}) async {
    final res = await fn.run('createSaveSession', {
      'userId': uid,
      'message': message,
      'targetLanguage': targetLanguage,
      'translationLanguage': ?translationLanguage,
      'sourceLanguage': ?sourceLanguage,
      ...scope(language),
      if (source != null) 'source': {'kind': source, 'app': ?app},
    });
    return SaveSessionStart.fromJson(res);
  }

  /// The translation of one of the session's candidates ([phrase] is its text).
  Future<SavePickResult> pick(String sessionId, String phrase, {String? language}) async {
    final res = await fn.run('saveSessionTurn', {'userId': uid, 'sessionId': sessionId, 'pick': phrase, ...scope(language)});
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
  Future<List<SaveSessionSummary>> listSessions({String? query, bool onlySaved = false, int limit = 20, DateTime? before, String? language}) async {
    final res = await fn.run('listSaveSessions', {
      'userId': uid,
      ...scope(language),
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

/// The learner's languages (`language` module, 2.0 servers).
///
/// A 1.x server has no `language` functions: [capabilities] then answers the
/// English-only register and [state] answers null, so the app keeps working as
/// the English-only app it was. The other calls are only reachable from screens
/// the app shows when the server has the module.
class LanguageRepository extends _Repo {
  LanguageRepository(super.fn, super.data, super.userId, [super.activeLanguage, this.anonymousToken]);

  /// Gets an anonymous token (`/user/loginAnonymous`). Before sign in the
  /// server still wants a token, even on a public function: with none it
  /// answers 401 and the app would fall back to English only.
  final Future<String> Function()? anonymousToken;
  String? _anonymous;

  /// Every learning and own language. Public (works with an anonymous token).
  Future<LanguageCapabilities> capabilities() async {
    try {
      String? as;
      if (userId().isEmpty && anonymousToken != null) as = _anonymous ??= await anonymousToken!();
      return LanguageCapabilities.fromJson(await fn.run('get-language-capabilities', const <String, dynamic>{}, as));
    } on ApiException catch (e) {
      if (e.isMissingFunction) return LanguageCapabilities.fallback;
      if (e.isAuthError) _anonymous = null; // an old anonymous token: get a new one next time
      rethrow;
    }
  }

  /// The learner's languages, or null when the server has no languages.
  Future<LanguageState?> state() async {
    try {
      return LanguageState.fromJson(await fn.run('get-language-state', {'userId': uid}));
    } on ApiException catch (e) {
      if (e.isMissingFunction) return null;
      rethrow;
    }
  }

  /// Adds [language] and makes it active. Without [startLevel] the server
  /// starts it at A1 and seeds the starter pack. Throws [AddLanguageRefusal]
  /// for `upgrade_needed` (the plan's limit), `not_available` and `purging`.
  Future<LanguageState> add(String language, {String? startLevel, String? startLevelSource, List<String>? goals}) => _refusable(() => fn.run('add-language', {
        'userId': uid,
        'language': language,
        'startLevel': ?startLevel,
        'startLevelSource': ?startLevelSource,
        'goals': ?goals,
      }));

  /// Makes an added (active-status) language the one the app shows.
  Future<LanguageState> setActive(String language) async => _state(await fn.run('set-active-language', {'userId': uid, 'language': language}));

  /// Removes [language]: hidden now, deleted after 30 days. Returns the new
  /// state and when it is deleted.
  Future<(LanguageState, DateTime?)> remove(String language) async {
    final res = asJson(await fn.run('remove-language', {'userId': uid, 'language': language}));
    return (_state(res), date(res['purgeAt']));
  }

  /// After a smaller plan: keeps [keep] and pauses the others.
  Future<LanguageState> pause({required List<String> keep}) async => _state(await fn.run('pause-languages', {'userId': uid, 'keep': keep}));

  /// Per-language settings. Only the given fields change.
  Future<LanguageState> updateSettings(
    String language, {
    String? explanationLanguage,
    int? newPhrasesPerDay,
    int? poolChunkSize,
    int? poolAgeCutoffDays,
    List<String>? goals,
  }) async =>
      _state(await fn.run('update-language-settings', {
        'userId': uid,
        'language': language,
        'explanationLanguage': ?explanationLanguage,
        'newPhrasesPerDay': ?newPhrasesPerDay,
        'poolChunkSize': ?poolChunkSize,
        'poolAgeCutoffDays': ?poolAgeCutoffDays,
        'goals': ?goals,
      }));

  /// The learner's own language (translations and explanations go into it).
  Future<LanguageState> setTranslationLanguage(String language) async => _state(await fn.run('set-translation-language', {'userId': uid, 'language': language}));

  /// "Tell me" when a coming-later language is ready ([on] false is undo).
  Future<bool> setInterest(String language, {required bool on}) async {
    final res = asJson(await fn.run('set-language-interest', {'userId': uid, 'language': language, 'on': on}));
    return boolean(res['on'], on);
  }

  /// Keeps a phrase for a language the learner has not added ("Keep for
  /// German"). [phrase] are the `createPhrase` args, without bundles.
  Future<({String phraseId, DateTime? expiresAt})> keepPending({required Map<String, dynamic> phrase, required String language}) async {
    final res = asJson(await fn.run('keep-phrase-pending', {'userId': uid, 'phrase': phrase, 'language': language}));
    return (phraseId: str(res['phraseId']), expiresAt: date(res['expiresAt']));
  }

  // ------------------------------------------------------------ chat test

  /// Starts the chat test for [language]: the first Coach question.
  Future<LevelTestStep> startLevelTest(String language) async => LevelTestStep.fromJson(await fn.run('start-level-test', {'userId': uid, 'language': language}));

  /// Sends one answer. After the last one, the step is `done` with a result.
  Future<LevelTestStep> answerLevelTest(String testId, String text) async => LevelTestStep.fromJson(await fn.run('answer-level-test', {'userId': uid, 'testId': testId, 'text': text}));

  /// [accept] true saves the test's start level (source `test`) on a language
  /// the learner has; for a new one [LevelTestFinish.applied] is false and the
  /// client sends the result to [add].
  Future<LevelTestFinish> finishLevelTest(String testId, {required bool accept}) async =>
      LevelTestFinish.fromJson(await fn.run('finish-level-test', {'userId': uid, 'testId': testId, 'accept': accept}));

  static LanguageState _state(dynamic res) {
    final j = asJson(res);
    return LanguageState.fromJson(j['state'] is Map ? j['state'] : j);
  }

  Future<LanguageState> _refusable(Future<dynamic> Function() call) async {
    dynamic res;
    try {
      res = await call();
    } on ApiException catch (e) {
      throw refusalOf(e) ?? e;
    }
    final j = asJson(res);
    final code = strOrNull(j['error'] ?? j['code']);
    if (code != null && AddLanguageRefusal.codes.contains(code.toLowerCase())) {
      throw AddLanguageRefusal(code.toLowerCase(), plan: strOrNull(j['plan']), maxLanguages: intOrNull(j['maxLanguages']));
    }
    return _state(res);
  }

  /// Reads `upgrade_needed`, `not_available` or `purging` out of an error,
  /// whatever its shape (`upgrade_needed`, `UPGRADE_NEEDED: {...}`, JSON).
  static AddLanguageRefusal? refusalOf(ApiException e) {
    final text = e.message;
    final lower = text.toLowerCase();
    final reason = AddLanguageRefusal.codes.where(lower.contains).firstOrNull;
    if (reason == null) return null;
    final plan = RegExp(r'"?plan"?\s*[:=]\s*"?([a-z]+)').firstMatch(text)?.group(1);
    final max = RegExp(r'"?maxLanguages"?\s*[:=]\s*(\d+)').firstMatch(text)?.group(1);
    return AddLanguageRefusal(reason, plan: plan, maxLanguages: max == null ? null : int.parse(max));
  }
}

/// A new language's starter pack (`language` module).
class StarterPackRepository extends _Repo {
  StarterPackRepository(super.fn, super.data, super.userId, [super.activeLanguage]);

  Future<StarterPack> get(String language) async => StarterPack.fromJson(await fn.run('get-starter-pack', {'userId': uid, 'language': language}));

  /// Marks chunks as heard; they join the language's starter bundle.
  Future<StarterPackProgress> complete(String language, List<String> itemIds) async =>
      StarterPackProgress.fromJson(await fn.run('complete-starter-pack-items', {'userId': uid, 'language': language, 'itemIds': itemIds}));

  /// Skips the pack for now (Today keeps an offer card).
  Future<LanguageState> skip(String language) async => LanguageRepository._state(await fn.run('skip-starter-pack', {'userId': uid, 'language': language}));
}
