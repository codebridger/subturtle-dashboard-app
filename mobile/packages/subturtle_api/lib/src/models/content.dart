import 'json.dart';

/// A reusable language pattern inside a saved phrase (`chunks[]`).
class Chunk {
  const Chunk({required this.text, this.type = 'other', this.definition, this.transliteration, this.confidence = 0});

  final String text;

  /// collocation, phrasal_verb, idiom, discourse_marker, other.
  final String type;
  final String? definition;
  final String? transliteration;
  final double confidence;

  factory Chunk.fromJson(dynamic v) {
    final j = asJson(v);
    return Chunk(
      text: str(j['text']),
      type: str(j['type'], 'other'),
      definition: strOrNull(j['definition']),
      transliteration: strOrNull(j['transliteration']),
      confidence: number(j['confidence']),
    );
  }

  Json toJson() => {
        'text': text,
        'type': type,
        'definition': ?definition,
        'transliteration': ?transliteration,
        'confidence': confidence,
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
      );
}

/// A phrase bundle (`user_content.phrase_bundle`).
class Bundle {
  const Bundle({required this.id, required this.title, this.desc, this.phraseIds = const [], this.createdAt, this.updatedAt});

  final String id;
  final String title;
  final String? desc;

  /// Phrase ids, oldest first (the server appends new saves at the end).
  final List<String> phraseIds;
  final DateTime? createdAt;
  final DateTime? updatedAt;

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
    );
  }
}

/// A Smart Review card (`get-review-session` / `get-custom-review-session`).
class ReviewItem {
  const ReviewItem({required this.phraseId, required this.boxLevel, required this.phrase, this.confirmedChunk, this.sourceSentence, this.nextReviewDate, this.consecutiveIncorrect = 0});

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

  factory ReviewItem.fromJson(dynamic v) {
    final j = docOf(v);
    return ReviewItem(
      phraseId: str(j['phraseId']),
      boxLevel: integer(j['boxLevel'], 1),
      phrase: Phrase.fromJson(j['phrase']),
      confirmedChunk: strOrNull(j['confirmed_chunk']),
      sourceSentence: strOrNull(j['source_sentence']),
      nextReviewDate: date(j['nextReviewDate']),
      consecutiveIncorrect: integer(j['consecutiveIncorrect']),
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

/// The user's profile (`user_content.profile`). It has no language field.
class Profile {
  const Profile({required this.id, this.name, this.pictureUrl, this.timeZone});

  final String id;
  final String? name;
  final String? pictureUrl;
  final String? timeZone;

  factory Profile.fromJson(dynamic v) {
    final j = docOf(v);
    return Profile(id: idOf(j), name: strOrNull(j['name']), pictureUrl: strOrNull(j['gPicture']), timeZone: strOrNull(j['timeZone']));
  }
}

/// Result of `translateWithContext` with `translationType: detailed`.
class DetailedTranslation {
  const DetailedTranslation({required this.translation, this.chunks = const [], this.sourceDirection = 'ltr', this.targetDirection = 'ltr', this.sourceLanguage, this.targetLanguage, this.linguistic});

  final String translation;
  final List<Chunk> chunks;
  final String sourceDirection;
  final String targetDirection;
  final String? sourceLanguage;
  final String? targetLanguage;
  final LinguisticData? linguistic;

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
    );
  }
}
