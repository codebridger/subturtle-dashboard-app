/// Models of the `language` module (multilingual round 1). Field names follow
/// the API contract (`docs/tech/multilingual-api.md` in the docs repo) exactly.
///
/// Old servers have no `language` module. Every model here has a fallback that
/// describes the English-only app as it was before, so the screens still work.
library;

import 'json.dart';

/// Where a learner starts in a new language. Never "your level".
abstract final class CefrStart {
  static const a1 = 'A1';
  static const a2 = 'A2';
  static const b1 = 'B1';
  static const b2 = 'B2';
  static const all = [a1, a2, b1, b2];
}

/// What a learning language has. A feature that is false is hidden in that
/// language (the Languages page is the one place that says "not yet").
class LanguageFeatures {
  const LanguageFeatures({
    this.save = true,
    this.review = true,
    this.cloze = true,
    this.coachText = true,
    this.coachVoice = true,
    this.levelTest = false,
    this.starterPack = false,
    this.map = false,
  });

  final bool save;
  final bool review;
  final bool cloze;
  final bool coachText;
  final bool coachVoice;
  final bool levelTest;
  final bool starterPack;
  final bool map;

  factory LanguageFeatures.fromJson(dynamic v) {
    final j = asJson(v);
    return LanguageFeatures(
      save: boolean(j['save'], true),
      review: boolean(j['review'], true),
      cloze: boolean(j['cloze'], true),
      coachText: boolean(j['coachText'], true),
      coachVoice: boolean(j['coachVoice'], true),
      levelTest: boolean(j['levelTest']),
      starterPack: boolean(j['starterPack']),
      map: boolean(j['map']),
    );
  }
}

/// A language a learner can study (`get-language-capabilities` → `learning`).
class LearningLanguageCaps {
  const LearningLanguageCaps({
    required this.code,
    required this.name,
    required this.nativeName,
    this.rtl = false,
    this.ttsVoice = '',
    this.enabled = true,
    this.features = const LanguageFeatures(),
  });

  final String code;
  final String name;
  final String nativeName;
  final bool rtl;

  /// A Google TTS voice name, e.g. `de-DE-Chirp3-HD-Kore`.
  final String ttsVoice;

  /// Switched on for learners. A language that is not enabled is "Coming later".
  final bool enabled;
  final LanguageFeatures features;

  /// "German · Deutsch" (pickers show both names; English shows once).
  String get label => nativeName.isEmpty || nativeName == name ? name : '$name · $nativeName';

  /// `de-DE` from `de-DE-Chirp3-HD-Kore`, for the TTS `languageCode`.
  String get ttsLanguageCode {
    final parts = ttsVoice.split('-');
    return parts.length >= 2 ? '${parts[0]}-${parts[1]}' : (_defaultLocales[code] ?? code);
  }

  factory LearningLanguageCaps.fromJson(dynamic v) {
    final j = asJson(v);
    final code = str(j['code']);
    return LearningLanguageCaps(
      code: code,
      name: str(j['name'], code.toUpperCase()),
      nativeName: str(j['nativeName']),
      rtl: boolean(j['rtl']),
      ttsVoice: str(j['ttsVoice']),
      enabled: boolean(j['enabled'], true),
      features: LanguageFeatures.fromJson(j['features']),
    );
  }

  /// English as the app had it before 2.0 (no test, no starter pack).
  static const english = LearningLanguageCaps(code: 'en', name: 'English', nativeName: 'English', ttsVoice: 'en-US-Standard-A');

  static const _defaultLocales = {'en': 'en-US', 'es': 'es-ES', 'de': 'de-DE', 'fr': 'fr-FR', 'it': 'it-IT', 'sv': 'sv-SE', 'lt': 'lt-LT', 'pt': 'pt-PT'};
}

/// A language a learner speaks (`get-language-capabilities` → `own`).
class OwnLanguage {
  const OwnLanguage({required this.code, required this.name, required this.nativeName, this.rtl = false, this.explanationReviewed = 'ai'});

  final String code;
  final String name;
  final String nativeName;
  final bool rtl;

  /// `teacher` when a teacher checked the Coach's explanations in it, else `ai`.
  final String explanationReviewed;

  bool get teacherChecked => explanationReviewed == 'teacher';

  /// "Persian · فارسی".
  String get label => nativeName.isEmpty || nativeName == name ? name : '$name · $nativeName';

  factory OwnLanguage.fromJson(dynamic v) {
    final j = asJson(v);
    final code = str(j['code']);
    return OwnLanguage(
      code: code,
      name: str(j['name'], code.toUpperCase()),
      nativeName: str(j['nativeName']),
      rtl: boolean(j['rtl']),
      explanationReviewed: str(j['explanationReviewed'], 'ai'),
    );
  }
}

/// The capability register: every learning and own language.
class LanguageCapabilities {
  const LanguageCapabilities({required this.learning, required this.own, this.fromServer = true});

  final List<LearningLanguageCaps> learning;
  final List<OwnLanguage> own;

  /// false when the server has no `language` module (English only).
  final bool fromServer;

  LearningLanguageCaps? learningByCode(String? code) {
    if (code == null) return null;
    for (final l in learning) {
      if (l.code == code) return l;
    }
    return code == 'en' ? LearningLanguageCaps.english : null;
  }

  OwnLanguage? ownByCode(String? code) {
    if (code == null) return null;
    for (final l in own) {
      if (l.code == code) return l;
    }
    return null;
  }

  /// Languages a learner can add now.
  List<LearningLanguageCaps> get ready => [for (final l in learning) if (l.enabled) l];

  /// Languages in the register that are not switched on yet ("Coming later").
  List<LearningLanguageCaps> get comingLater => [for (final l in learning) if (!l.enabled) l];

  factory LanguageCapabilities.fromJson(dynamic v) {
    final j = asJson(v);
    final learning = listOf(j['learning'], LearningLanguageCaps.fromJson);
    final own = listOf(j['own'], OwnLanguage.fromJson);
    return LanguageCapabilities(learning: learning.isEmpty ? const [LearningLanguageCaps.english] : learning, own: own.isEmpty ? fallbackOwn : own);
  }

  /// Before 2.0: English only, and the own languages the app listed itself.
  static const fallback = LanguageCapabilities(learning: [LearningLanguageCaps.english], own: fallbackOwn, fromServer: false);

  /// The own languages the 1.x app offered, used when the server has no register.
  static const fallbackOwn = [
    OwnLanguage(code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true),
    OwnLanguage(code: 'zh', name: 'Chinese', nativeName: '中文'),
    OwnLanguage(code: 'da', name: 'Danish', nativeName: 'Dansk'),
    OwnLanguage(code: 'nl', name: 'Dutch', nativeName: 'Nederlands'),
    OwnLanguage(code: 'en', name: 'English', nativeName: 'English'),
    OwnLanguage(code: 'fr', name: 'French', nativeName: 'Français'),
    OwnLanguage(code: 'de', name: 'German', nativeName: 'Deutsch'),
    OwnLanguage(code: 'el', name: 'Greek', nativeName: 'Ελληνικά'),
    OwnLanguage(code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true),
    OwnLanguage(code: 'hi', name: 'Hindi', nativeName: 'हिन्दी'),
    OwnLanguage(code: 'hu', name: 'Hungarian', nativeName: 'Magyar'),
    OwnLanguage(code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia'),
    OwnLanguage(code: 'it', name: 'Italian', nativeName: 'Italiano'),
    OwnLanguage(code: 'ja', name: 'Japanese', nativeName: '日本語'),
    OwnLanguage(code: 'ko', name: 'Korean', nativeName: '한국어'),
    OwnLanguage(code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true),
    OwnLanguage(code: 'pl', name: 'Polish', nativeName: 'Polski'),
    OwnLanguage(code: 'pt', name: 'Portuguese', nativeName: 'Português'),
    OwnLanguage(code: 'ru', name: 'Russian', nativeName: 'Русский'),
    OwnLanguage(code: 'es', name: 'Spanish', nativeName: 'Español'),
    OwnLanguage(code: 'sv', name: 'Swedish', nativeName: 'Svenska'),
    OwnLanguage(code: 'th', name: 'Thai', nativeName: 'ไทย'),
    OwnLanguage(code: 'tr', name: 'Turkish', nativeName: 'Türkçe'),
    OwnLanguage(code: 'uk', name: 'Ukrainian', nativeName: 'Українська'),
    OwnLanguage(code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true),
    OwnLanguage(code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt'),
  ];
}

/// One language's starter pack progress.
class StarterPackSummary {
  const StarterPackSummary({this.state = 'none', this.heard = 0, this.total = 0});

  /// none, offered, in_progress, done or skipped.
  final String state;
  final int heard;
  final int total;

  /// The pack can be offered on Today (not finished, not missing).
  bool get isOpen => state == 'offered' || state == 'in_progress' || state == 'skipped';
  bool get isDone => state == 'done';

  factory StarterPackSummary.fromJson(dynamic v) {
    final j = asJson(v);
    return StarterPackSummary(state: str(j['state'], 'none'), heard: integer(j['heard']), total: integer(j['total']));
  }
}

/// One row of the switcher and the Languages page.
class LanguageSummary {
  const LanguageSummary({
    required this.code,
    this.status = 'active',
    this.startLevel = CefrStart.a1,
    this.startLevelSource = 'default',
    this.dueCount = 0,
    this.phraseCount = 0,
    this.explanationLanguage,
    this.starterPack = const StarterPackSummary(),
    this.purgeAt,
  });

  final String code;

  /// active, paused, removed or purging.
  final String status;

  /// "Starting at A2". Never shown as "your level".
  final String startLevel;

  /// `test` (the chat test set it) or `default` (A1, no test).
  final String startLevelSource;
  final int dueCount;
  final int phraseCount;

  /// The language the Coach explains in for this language (null: the own language).
  final String? explanationLanguage;
  final StarterPackSummary starterPack;

  /// When a removed language is deleted for good.
  final DateTime? purgeAt;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';
  bool get isRemoved => status == 'removed';
  bool get fromTest => startLevelSource == 'test';

  factory LanguageSummary.fromJson(dynamic v) {
    final j = asJson(v);
    return LanguageSummary(
      code: str(j['code']),
      status: str(j['status'], 'active'),
      startLevel: str(j['startLevel'], CefrStart.a1),
      startLevelSource: str(j['startLevelSource'], 'default'),
      dueCount: integer(j['dueCount']),
      phraseCount: integer(j['phraseCount']),
      explanationLanguage: strOrNull(j['explanationLanguage']),
      starterPack: StarterPackSummary.fromJson(j['starterPack']),
      purgeAt: date(j['purgeAt']),
    );
  }
}

/// Phrases kept for a language the learner has not added yet.
class PendingPhrases {
  const PendingPhrases({required this.language, required this.count, this.expiresAt});
  final String language;
  final int count;
  final DateTime? expiresAt;

  factory PendingPhrases.fromJson(dynamic v) {
    final j = asJson(v);
    return PendingPhrases(language: str(j['language']), count: integer(j['count']), expiresAt: date(j['expiresAt']));
  }
}

/// The learner's languages (`get-language-state`).
class LanguageState {
  const LanguageState({
    this.translationLanguage,
    this.learningLanguage,
    this.languages = const [],
    this.onboardingState = 'done',
    this.plan = 'starter',
    this.maxLanguages = 1,
    this.pending = const [],
    this.fromServer = true,
  });

  /// The learner's own language (L1) code, e.g. `fa`. Null when not set.
  final String? translationLanguage;

  /// The active learning language. Null before the first run.
  final String? learningLanguage;

  /// Active, paused and removed languages (not purging).
  final List<LanguageSummary> languages;

  /// `needs_language` sends a new account to the first run.
  final String onboardingState;

  /// starter, reader, learner or coach.
  final String plan;
  final int maxLanguages;
  final List<PendingPhrases> pending;

  /// false when built locally because the server has no `language` module.
  final bool fromServer;

  bool get needsLanguage => onboardingState == 'needs_language' || (fromServer && learningLanguage == null);

  /// The active language, falling back to English (old data reads as `en`).
  String get active => learningLanguage ?? 'en';

  LanguageSummary? summaryOf(String code) {
    for (final l in languages) {
      if (l.code == code) return l;
    }
    return null;
  }

  /// Languages the learner studies now (shown in the switcher).
  List<LanguageSummary> get studying => [for (final l in languages) if (l.isActive) l];

  List<LanguageSummary> get paused => [for (final l in languages) if (l.isPaused) l];

  List<LanguageSummary> get removed => [for (final l in languages) if (l.isRemoved) l];

  /// Languages that count against the plan. Paused languages are over the
  /// limit by definition (they were paused by a smaller plan), so only active ones count.
  int get used => studying.length;

  bool get atLimit => used >= maxLanguages;

  /// Starter cannot swap: one language, and no remove-to-add.
  bool get isStarter => plan == 'starter';

  PendingPhrases? pendingFor(String code) {
    for (final p in pending) {
      if (p.language == code) return p;
    }
    return null;
  }

  factory LanguageState.fromJson(dynamic v) {
    final j = asJson(v);
    final langs = listOf(j['languages'], LanguageSummary.fromJson);
    return LanguageState(
      translationLanguage: strOrNull(j['translationLanguage']),
      learningLanguage: strOrNull(j['learningLanguage']),
      languages: [for (final l in langs) if (l.status != 'purging') l],
      onboardingState: str(j['onboardingState'], 'done'),
      plan: str(j['plan'], 'starter'),
      maxLanguages: integer(j['maxLanguages'], 1),
      pending: listOf(j['pending'], PendingPhrases.fromJson),
    );
  }

  /// The English-only state of a server without the `language` module.
  /// [translationLanguage] is the own language kept on the phone.
  factory LanguageState.englishOnly({String? translationLanguage, String plan = 'starter'}) => LanguageState(
        translationLanguage: translationLanguage,
        learningLanguage: 'en',
        languages: const [LanguageSummary(code: 'en', startLevel: CefrStart.b1)],
        plan: plan,
        maxLanguages: 1,
        fromServer: false,
      );

  LanguageState copyWith({String? translationLanguage, String? learningLanguage}) => LanguageState(
        translationLanguage: translationLanguage ?? this.translationLanguage,
        learningLanguage: learningLanguage ?? this.learningLanguage,
        languages: languages,
        onboardingState: onboardingState,
        plan: plan,
        maxLanguages: maxLanguages,
        pending: pending,
        fromServer: fromServer,
      );
}

/// Why `add-language` refused.
class AddLanguageRefusal implements Exception {
  const AddLanguageRefusal(this.reason, {this.plan, this.maxLanguages});

  /// `upgrade_needed`, `not_available` or `purging`.
  final String reason;
  final String? plan;
  final int? maxLanguages;

  bool get upgradeNeeded => reason == upgradeNeededCode;

  static const upgradeNeededCode = 'upgrade_needed';
  static const notAvailableCode = 'not_available';
  static const purgingCode = 'purging';
  static const codes = [upgradeNeededCode, notAvailableCode, purgingCode];

  @override
  String toString() => 'AddLanguageRefusal($reason)';
}

// ---------------------------------------------------------------- level test

/// A Coach message in the chat test. [help] is in the learner's own language.
class LevelTestTurn {
  const LevelTestTurn({required this.ai, this.help});
  final String ai;
  final String? help;

  factory LevelTestTurn.fromJson(dynamic v) {
    final j = asJson(v);
    return LevelTestTurn(ai: str(j['ai']), help: strOrNull(j['help']));
  }
}

/// The start level the chat test found.
class LevelTestResult {
  const LevelTestResult({required this.startLevel, this.reason = ''});
  final String startLevel;
  final String reason;

  factory LevelTestResult.fromJson(dynamic v) {
    final j = asJson(v);
    return LevelTestResult(startLevel: str(j['startLevel'], CefrStart.a1), reason: str(j['reason']));
  }
}

/// A step of the chat test (`start-level-test` and `answer-level-test`).
class LevelTestStep {
  const LevelTestStep({this.testId, this.turn, required this.index, this.total = 6, this.done = false, this.result});

  /// Only on `start-level-test`.
  final String? testId;

  /// The next question, or null when [done].
  final LevelTestTurn? turn;

  /// 1-based number of the question shown.
  final int index;
  final int total;
  final bool done;
  final LevelTestResult? result;

  factory LevelTestStep.fromJson(dynamic v) {
    final j = asJson(v);
    return LevelTestStep(
      testId: strOrNull(j['testId']),
      turn: j['turn'] is Map ? LevelTestTurn.fromJson(j['turn']) : null,
      index: integer(j['index'], 1),
      total: integer(j['total'], 6),
      done: boolean(j['done']),
      result: j['result'] is Map ? LevelTestResult.fromJson(j['result']) : null,
    );
  }
}

// ---------------------------------------------------------------- starter pack

/// One chunk of a starter pack. [band] is the frequency band (1 = top 1,000).
class StarterPackItem {
  const StarterPackItem({required this.id, required this.text, required this.translation, this.audioUrl, this.band = 1, this.group = ''});

  final String id;
  final String text;
  final String translation;
  final String? audioUrl;
  final int band;
  final String group;

  factory StarterPackItem.fromJson(dynamic v) {
    final j = asJson(v);
    return StarterPackItem(
      id: str(j['id']),
      text: str(j['text']),
      translation: str(j['translation']),
      audioUrl: strOrNull(j['audioUrl']),
      band: integer(j['band'], 1),
      group: str(j['group']),
    );
  }
}

/// `get-starter-pack`.
class StarterPack {
  const StarterPack({required this.items, this.heard = const {}});
  final List<StarterPackItem> items;
  final Set<String> heard;

  List<StarterPackItem> get unheard => [for (final i in items) if (!heard.contains(i.id)) i];

  factory StarterPack.fromJson(dynamic v) {
    final j = asJson(v);
    return StarterPack(items: listOf(j['items'], StarterPackItem.fromJson), heard: listOf(j['heard'], (e) => str(e)).toSet());
  }
}

/// `complete-starter-pack-items`.
class StarterPackProgress {
  const StarterPackProgress({required this.heard, required this.total, required this.done});
  final int heard;
  final int total;
  final bool done;

  factory StarterPackProgress.fromJson(dynamic v) {
    final j = asJson(v);
    final heard = j['heard'];
    return StarterPackProgress(heard: heard is List ? heard.length : integer(heard), total: integer(j['total']), done: boolean(j['done']));
  }
}

// ---------------------------------------------------------------- review and coach

/// The three results of a review answer.
abstract final class ReviewResult {
  static const right = 'right';
  static const close = 'close';
  static const wrong = 'wrong';
}

/// `check-cloze-answer`.
class ClozeCheck {
  const ClozeCheck({required this.result, required this.expected});

  /// right, close or wrong.
  final String result;
  final String expected;

  factory ClozeCheck.fromJson(dynamic v) {
    final j = asJson(v);
    return ClozeCheck(result: str(j['result'], ReviewResult.wrong), expected: str(j['expected']));
  }
}

/// `get-coach-instructions`: the Coach prompt built on the server.
class CoachInstructions {
  const CoachInstructions({required this.instructions, this.voiceName});
  final String instructions;
  final String? voiceName;

  factory CoachInstructions.fromJson(dynamic v) {
    final j = asJson(v);
    return CoachInstructions(instructions: str(j['instructions']), voiceName: strOrNull(j['voiceName']));
  }
}
