import 'json.dart';

/// A reusable language pattern inside a saved phrase (`chunks[]`).
class Chunk {
  const Chunk({required this.text, this.type = 'other', this.definition, this.transliteration, this.confidence = 0, this.lemma, this.form, this.acceptedAnswers = const []});

  final String text;

  /// collocation, phrasal_verb, idiom, discourse_marker, other.
  final String type;
  final String? definition;
  final String? transliteration;
  final double confidence;

  /// The base form for a fill-the-gap cue ("sein"), and the form asked for
  /// ("present perfect, ich"). Set by 2.0 servers.
  final String? lemma;
  final String? form;

  /// Every answer the server accepts for this chunk in a fill-the-gap card.
  final List<String> acceptedAnswers;

  factory Chunk.fromJson(dynamic v) {
    final j = asJson(v);
    return Chunk(
      text: str(j['text']),
      type: str(j['type'], 'other'),
      definition: strOrNull(j['definition']),
      transliteration: strOrNull(j['transliteration']),
      confidence: number(j['confidence']),
      lemma: strOrNull(j['lemma']),
      form: strOrNull(j['form']),
      acceptedAnswers: listOf(j['acceptedAnswers'], (e) => str(e)),
    );
  }

  Json toJson() => {
        'text': text,
        'type': type,
        'definition': ?definition,
        'transliteration': ?transliteration,
        'confidence': confidence,
        'lemma': ?lemma,
        'form': ?form,
        if (acceptedAnswers.isNotEmpty) 'acceptedAnswers': acceptedAnswers,
      };
}

/// AI analysis of a linguistic phrase (`linguistic_data`).
class LinguisticData {
  const LinguisticData({this.isValid = true, this.type = '', this.definition = '', this.transliteration = '', this.formality = 'neutral'});

  final bool isValid;

  /// noun, verb, idiom, phrasal verb, expression, …
  final String type;
  final String definition;
  final String transliteration;

  /// formal, neutral, informal.
  final String formality;

  factory LinguisticData.fromJson(dynamic v) {
    final j = asJson(v);
    return LinguisticData(
      isValid: boolean(j['isValid'], true),
      type: str(j['type']),
      definition: str(j['definition']),
      transliteration: str(asJson(j['phonetic'])['transliteration']),
      formality: str(j['formality_level'], 'neutral'),
    );
  }

  Json toJson() => {
        'isValid': isValid,
        'type': type,
        'definition': definition,
        'phonetic': {'transliteration': transliteration},
        'formality_level': formality,
      };
}

/// A saved phrase (`user_content.phrase`).
class Phrase {
  const Phrase({
    required this.id,
    required this.phrase,
    required this.translation,
    this.translationLanguage,
    this.type = 'normal',
    this.context,
    this.sourceDirection,
    this.targetDirection,
    this.sourceLanguage,
    this.targetLanguage,
    this.linguistic,
    this.chunks = const [],
    this.sourceUrl,
    this.createdAt,
    this.language,
    this.languageSource,
    this.status,
  });

  final String id;
  final String phrase;
  final String translation;
  final String? translationLanguage;

  /// `normal` (just a translation) or `linguistic` (with AI fields).
  final String type;

  /// The sentence the phrase was saved from.
  final String? context;
  final String? sourceDirection;

  /// `rtl` when the translation is in a right-to-left script.
  final String? targetDirection;
  final String? sourceLanguage;
  final String? targetLanguage;
  final LinguisticData? linguistic;
  final List<Chunk> chunks;
  final String? sourceUrl;
  final DateTime? createdAt;

  /// The learning language the phrase belongs to. Null on phrases saved before
  /// 2.0: read [languageCode], which treats them as English.
  final String? language;

  /// How the server chose [language]: `given`, `detected` or `active`.
  final String? languageSource;

  /// `pending` for a phrase kept for a language not added yet.
  final String? status;

  /// The phrase's language, with old phrases read as English (ADR-006).
  String get languageCode => language ?? 'en';

  bool get translationIsRtl => targetDirection == 'rtl';

  factory Phrase.fromJson(dynamic v) {
    final j = docOf(v);
    final dir = asJson(j['direction']);
    final lang = asJson(j['language_info']);
    return Phrase(
      id: idOf(j),
      phrase: str(j['phrase']),
      translation: str(j['translation']),
      translationLanguage: strOrNull(j['translation_language']),
      type: str(j['type'], 'normal'),
      context: strOrNull(j['context']),
      sourceDirection: strOrNull(dir['source']),
      targetDirection: strOrNull(dir['target']),
      sourceLanguage: strOrNull(lang['source']),
      targetLanguage: strOrNull(lang['target']),
      linguistic: j['linguistic_data'] is Map ? LinguisticData.fromJson(j['linguistic_data']) : null,
      chunks: listOf(j['chunks'], Chunk.fromJson),
      sourceUrl: strOrNull(j['sourceUrl']),
      createdAt: date(j['createdAt']),
      language: strOrNull(j['language']),
      languageSource: strOrNull(j['languageSource']),
      status: strOrNull(j['status']),
    );
  }

  Phrase copyWith({String? translation}) => Phrase(
        id: id,
        phrase: phrase,
        translation: translation ?? this.translation,
        translationLanguage: translationLanguage,
        type: type,
        context: context,
        sourceDirection: sourceDirection,
        targetDirection: targetDirection,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        linguistic: linguistic,
        chunks: chunks,
        sourceUrl: sourceUrl,
        createdAt: createdAt,
        language: language,
        languageSource: languageSource,
        status: status,
      );
}

/// A phrase bundle (`user_content.phrase_bundle`).
class Bundle {
  const Bundle({required this.id, required this.title, this.desc, this.phraseIds = const [], this.createdAt, this.updatedAt, this.language});

  final String id;
  final String title;
  final String? desc;

  /// Phrase ids, oldest first (the server appends new saves at the end).
  final List<String> phraseIds;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// The learning language. Null on bundles from before 2.0 (English).
  final String? language;

  String get languageCode => language ?? 'en';

  int get phraseCount => phraseIds.length;

  factory Bundle.fromJson(dynamic v) {
    final j = docOf(v);
    return Bundle(
      id: idOf(j),
      title: str(j['title']),
      desc: strOrNull(j['desc']),
      phraseIds: listOf(j['phrases'], (e) => str(e)),
      createdAt: date(j['createdAt']),
      updatedAt: date(j['updatedAt']),
      language: strOrNull(j['language']),
    );
  }
}

/// A Smart Review card (`get-review-session` / `get-custom-review-session`).
class ReviewItem {
  const ReviewItem({
    required this.phraseId,
    required this.boxLevel,
    required this.phrase,
    this.confirmedChunk,
    this.sourceSentence,
    this.nextReviewDate,
    this.consecutiveIncorrect = 0,
    this.cueLemma,
    this.cueForm,
    this.acceptedAnswers = const [],
  });

  final String phraseId;

  /// Leitner box 1–5. Level 3 and up shows the fill-the-gap card.
  final int boxLevel;
  final Phrase phrase;

  /// Text of the phrase's primary chunk, or null (then show the recognition card).
  final String? confirmedChunk;

  /// The phrase's `context`, or null.
  final String? sourceSentence;
  final DateTime? nextReviewDate;
  final int consecutiveIncorrect;

  /// The fill-the-gap cue (`cue: {lemma, form}`), from 2.0 servers.
  final String? cueLemma;
  final String? cueForm;

  /// Answers the server accepts. When empty, the app checks the answer itself.
  final List<String> acceptedAnswers;

  bool get hasCue => cueLemma != null && cueLemma!.isNotEmpty;

  factory ReviewItem.fromJson(dynamic v) {
    final j = docOf(v);
    final cue = asJson(j['cue']);
    return ReviewItem(
      phraseId: str(j['phraseId']),
      boxLevel: integer(j['boxLevel'], 1),
      phrase: Phrase.fromJson(j['phrase']),
      confirmedChunk: strOrNull(j['confirmed_chunk']),
      sourceSentence: strOrNull(j['source_sentence']),
      nextReviewDate: date(j['nextReviewDate']),
      consecutiveIncorrect: integer(j['consecutiveIncorrect']),
      cueLemma: strOrNull(cue['lemma']),
      cueForm: strOrNull(cue['form']),
      acceptedAnswers: listOf(j['acceptedAnswers'], (e) => str(e)),
    );
  }
}

/// A phrase waiting for its first meeting (`get-pool`).
class PoolItem {
  const PoolItem({required this.phraseId, required this.phrase, this.pooledAt, this.confirmedChunk, this.sourceSentence});

  final String phraseId;
  final Phrase phrase;
  final DateTime? pooledAt;
  final String? confirmedChunk;
  final String? sourceSentence;

  factory PoolItem.fromJson(dynamic v) {
    final j = docOf(v);
    return PoolItem(
      phraseId: str(j['phraseId']),
      phrase: Phrase.fromJson(j['phrase']),
      pooledAt: date(j['pooled_at']),
      confirmedChunk: strOrNull(j['confirmed_chunk']),
      sourceSentence: strOrNull(j['source_sentence']),
    );
  }
}

/// A Today board record (`get-board`). The server only creates `leitner_review` today.
class BoardActivity {
  const BoardActivity({required this.id, required this.type, this.refId, this.state = 'idle', this.persistent = false, this.meta = const {}, this.lastUpdated});

  final String id;
  final String type;
  final String? refId;

  /// `toasted` (new, not seen) or `idle`.
  final String state;
  final bool persistent;
  final Json meta;
  final DateTime? lastUpdated;

  bool get isNew => state == 'toasted';
  int get dueCount => integer(meta['dueCount']);

  static const leitnerReview = 'leitner_review';

  factory BoardActivity.fromJson(dynamic v) {
    final j = docOf(v);
    return BoardActivity(
      id: idOf(j),
      type: str(j['type']),
      refId: strOrNull(j['refId']),
      state: str(j['state'], 'idle'),
      persistent: boolean(j['persistent']),
      meta: asJson(j['meta']),
      lastUpdated: date(j['lastUpdated']),
    );
  }
}

/// What `get-board` returns. A 1.x server sends a bare list of activities; a
/// 2.0 server sends `{language, newLanguage, activities}`.
class BoardSnapshot {
  const BoardSnapshot({this.language, this.newLanguage = false, this.activities = const []});

  final String? language;

  /// The language has no phrases yet: Today asks for a first phrase.
  final bool newLanguage;
  final List<BoardActivity> activities;

  factory BoardSnapshot.fromJson(dynamic v) {
    if (v is List) return BoardSnapshot(activities: listOf(v, BoardActivity.fromJson));
    final j = asJson(v);
    final list = j['activities'] ?? j['items'] ?? j['board'] ?? j['records'];
    return BoardSnapshot(language: strOrNull(j['language']), newLanguage: boolean(j['newLanguage']), activities: listOf(list, BoardActivity.fromJson));
  }
}

/// Leitner stats and settings (`get-stats`).
class LeitnerStats {
  const LeitnerStats({this.distribution = const {}, this.totalItems = 0, this.dailyLimit = 20, this.reviewHour = 9, this.poolChunkSize = 10, this.totalBoxes = 5});

  /// Box level → number of phrases in it.
  final Map<int, int> distribution;
  final int totalItems;
  final int dailyLimit;
  final int reviewHour;
  final int poolChunkSize;
  final int totalBoxes;

  /// Phrases in the top box: the app calls these "learned".
  int get learned => distribution[totalBoxes] ?? 0;

  factory LeitnerStats.fromJson(dynamic v) {
    final j = asJson(v);
    final s = asJson(j['settings']);
    final dist = <int, int>{};
    asJson(j['distribution']).forEach((k, val) => dist[int.tryParse(k) ?? 0] = integer(val));
    return LeitnerStats(
      distribution: dist,
      totalItems: integer(j['totalItems']),
      dailyLimit: integer(s['dailyLimit'], 20),
      reviewHour: integer(s['reviewHour'], 9),
      poolChunkSize: integer(s['poolChunkSize'], 10),
      totalBoxes: integer(s['totalBoxes'], 5),
    );
  }
}

/// Phrase → box map and due phrase ids (`get-phrase-management-info`).
class PhraseManagementInfo {
  const PhraseManagementInfo({this.phraseToBox = const {}, this.duePhraseIds = const {}});

  final Map<String, int> phraseToBox;
  final Set<String> duePhraseIds;

  int levelOf(String phraseId) => phraseToBox[phraseId] ?? 0;

  int dueIn(Bundle b) => b.phraseIds.where(duePhraseIds.contains).length;

  factory PhraseManagementInfo.fromJson(dynamic v) {
    final j = asJson(v);
    final map = <String, int>{};
    asJson(j['phraseToBoxMap']).forEach((k, val) => map[k] = integer(val));
    return PhraseManagementInfo(phraseToBox: map, duePhraseIds: listOf(j['duePhraseIds'], (e) => str(e)).toSet());
  }
}

/// The user's profile (`user_content.profile`). The language fields are
/// server-owned (written by the `language` functions, never by the app) and
/// only set on 2.0 servers. The app reads languages from `get-language-state`;
/// these fields are a copy.
class Profile {
  const Profile({
    required this.id,
    this.name,
    this.pictureUrl,
    this.timeZone,
    this.translationLanguage,
    this.learningLanguage,
    this.learningLanguages = const [],
    this.pausedLanguages = const [],
    this.onboardingState,
  });

  final String id;
  final String? name;
  final String? pictureUrl;
  final String? timeZone;
  final String? translationLanguage;
  final String? learningLanguage;
  final List<String> learningLanguages;
  final List<String> pausedLanguages;
  final String? onboardingState;

  factory Profile.fromJson(dynamic v) {
    final j = docOf(v);
    String code(dynamic e) => e is Map ? str(e['code'] ?? e['language']) : str(e);
    return Profile(
      id: idOf(j),
      name: strOrNull(j['name']),
      pictureUrl: strOrNull(j['gPicture']),
      timeZone: strOrNull(j['timeZone']),
      translationLanguage: strOrNull(j['translationLanguage']),
      learningLanguage: strOrNull(j['learningLanguage']),
      learningLanguages: listOf(j['learningLanguages'], code),
      pausedLanguages: listOf(j['pausedLanguages'], code),
      onboardingState: strOrNull(j['onboardingState']),
    );
  }
}

/// Result of `translateWithContext` with `translationType: detailed`.
class DetailedTranslation {
  const DetailedTranslation({
    required this.translation,
    this.chunks = const [],
    this.sourceDirection = 'ltr',
    this.targetDirection = 'ltr',
    this.sourceLanguage,
    this.targetLanguage,
    this.linguistic,
    this.detectedLanguage,
    this.resolvedLanguage,
    this.inProfile = true,
  });

  final String translation;
  final List<Chunk> chunks;
  final String sourceDirection;
  final String targetDirection;
  final String? sourceLanguage;
  final String? targetLanguage;
  final LinguisticData? linguistic;

  /// The language the server detected in the phrase (2.0 servers).
  final String? detectedLanguage;

  /// The learning language the phrase would be saved to.
  final String? resolvedLanguage;

  /// false when [detectedLanguage] is not one of the learner's languages:
  /// the save sheet offers "Save to English" or "Keep for German".
  final bool inProfile;

  bool get targetIsRtl => targetDirection == 'rtl';

  factory DetailedTranslation.fromJson(dynamic v) {
    final j = asJson(v);
    final dir = asJson(j['direction']);
    final lang = asJson(j['language_info']);
    return DetailedTranslation(
      translation: str(asJson(j['translation'])['phrase']),
      chunks: listOf(j['chunks'], Chunk.fromJson),
      sourceDirection: str(dir['source'], 'ltr'),
      targetDirection: str(dir['target'], 'ltr'),
      sourceLanguage: strOrNull(lang['source']),
      targetLanguage: strOrNull(lang['target']),
      linguistic: j['linguistic_data'] is Map ? LinguisticData.fromJson(j['linguistic_data']) : null,
      detectedLanguage: strOrNull(j['detectedLanguage']),
      resolvedLanguage: strOrNull(j['resolvedLanguage']),
      inProfile: boolean(j['inProfile'], true),
    );
  }
}
