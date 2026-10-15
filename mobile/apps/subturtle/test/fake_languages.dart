import 'package:subturtle_api/subturtle_api.dart';

import 'fake_backend.dart';

/// A stateful fake of the server's `language` module (contract
/// `multilingual-api.md`, section 2), for widget and flow tests.
///
/// It keeps the learner's languages in memory and answers the way the real
/// module is specified: plan limits on add, restore of a removed language,
/// kept phrases joining on add, a six-question chat test, starter packs.
/// [install] registers its functions on a [FakeBackend]; leave it out to test
/// a 1.x server (no language functions at all).
class FakeLanguageServer {
  FakeLanguageServer({
    this.translationLanguage = 'fa',
    String? active = 'en',
    Map<String, String>? startLevels,
    this.plan = 'learner',
    this.pending = const {},
    this.dueCounts = const {},
    this.phraseCounts = const {},
  }) : active = active {
    for (final e in (startLevels ?? (active == null ? const <String, String>{} : {active: 'B1'})).entries) {
      langs[e.key] = _Lang(e.key, e.value, e.key == 'en' ? 'test' : 'default');
    }
  }

  String? translationLanguage;
  String? active;
  String plan;
  final langs = <String, _Lang>{};
  Map<String, int> pending;
  final Map<String, int> dueCounts;
  final Map<String, int> phraseCounts;
  final interests = <String>{};

  /// Languages that see the seeded board, pool and bundles. Others are empty.
  Set<String> seededLanguages = {'en'};
  final kept = <Map<String, dynamic>>[];

  /// Chat tests by id: answers so far.
  final tests = <String, List<String>>{};
  String _testLanguage = '';

  /// When set, every call of this function fails with this message.
  final failures = <String, String>{};

  int get maxLanguages => const {'starter': 1, 'reader': 3, 'learner': 10, 'coach': 10}[plan] ?? 1;

  static const learning = [
    {'code': 'en', 'name': 'English', 'nativeName': 'English', 'ttsVoice': 'en-US-Chirp3-HD-Kore', 'pack': false},
    {'code': 'es', 'name': 'Spanish', 'nativeName': 'Español', 'ttsVoice': 'es-ES-Chirp3-HD-Kore', 'pack': true},
    {'code': 'de', 'name': 'German', 'nativeName': 'Deutsch', 'ttsVoice': 'de-DE-Chirp3-HD-Kore', 'pack': true},
    {'code': 'fr', 'name': 'French', 'nativeName': 'Français', 'ttsVoice': 'fr-FR-Chirp3-HD-Kore', 'pack': true},
    {'code': 'it', 'name': 'Italian', 'nativeName': 'Italiano', 'ttsVoice': 'it-IT-Chirp3-HD-Kore', 'pack': true},
    {'code': 'sv', 'name': 'Swedish', 'nativeName': 'Svenska', 'ttsVoice': 'sv-SE-Chirp3-HD-Kore', 'pack': false},
    {'code': 'lt', 'name': 'Lithuanian', 'nativeName': 'Lietuvių', 'ttsVoice': 'lt-LT-Chirp3-HD-Kore', 'pack': false},
    {'code': 'pt', 'name': 'Portuguese', 'nativeName': 'Português', 'ttsVoice': 'pt-PT-Chirp3-HD-Kore', 'pack': false, 'enabled': false},
  ];

  Map<String, dynamic> capabilities() => {
        'learning': [
          for (final l in learning)
            {
              'code': l['code'],
              'name': l['name'],
              'nativeName': l['nativeName'],
              'rtl': false,
              'ttsVoice': l['ttsVoice'],
              'enabled': l['enabled'] ?? true,
              'features': {'save': true, 'review': true, 'cloze': true, 'coachText': true, 'coachVoice': true, 'levelTest': true, 'starterPack': l['pack'], 'map': false},
            },
        ],
        'own': [
          {'code': 'ar', 'name': 'Arabic', 'nativeName': 'العربية', 'rtl': true, 'explanationReviewed': 'teacher'},
          {'code': 'en', 'name': 'English', 'nativeName': 'English', 'rtl': false, 'explanationReviewed': 'teacher'},
          {'code': 'de', 'name': 'German', 'nativeName': 'Deutsch', 'rtl': false, 'explanationReviewed': 'ai'},
          {'code': 'ku', 'name': 'Kurdish', 'nativeName': 'Kurdî', 'rtl': false, 'explanationReviewed': 'ai'},
          {'code': 'fa', 'name': 'Persian', 'nativeName': 'فارسی', 'rtl': true, 'explanationReviewed': 'teacher'},
          {'code': 'tr', 'name': 'Turkish', 'nativeName': 'Türkçe', 'rtl': false, 'explanationReviewed': 'teacher'},
        ],
      };

  Map<String, dynamic> state() => {
        'translationLanguage': translationLanguage,
        'learningLanguage': active,
        'languages': [for (final l in langs.values) l.toJson(dueCounts[l.code] ?? 0, phraseCounts[l.code] ?? 0, translationLanguage)],
        'onboardingState': active == null ? 'needs_language' : 'done',
        'plan': plan,
        'maxLanguages': maxLanguages,
        'pending': [
          for (final e in pending.entries) {'language': e.key, 'count': e.value, 'expiresAt': '2026-11-14T00:00:00.000Z'},
        ],
      };

  Map<String, dynamic> _wrapped() => {'state': state()};

  bool _hasPack(String code) => learning.any((l) => l['code'] == code && l['pack'] == true);

  void install(FakeBackend b) {
    Object? guard(String name, Object? Function(Map<String, dynamic>) f, Map<String, dynamic> a) {
      final fail = failures[name];
      if (fail != null) throw ApiException(fail);
      return f(a);
    }

    void on(String name, Object? Function(Map<String, dynamic>) f) => b.functions[name] = (a) => guard(name, f, a);

    // The seeded board, pool and bundles belong to the languages in
    // [seededLanguages]; every other language starts empty, as on the server.
    bool seeded(Map<String, dynamic> a) => seededLanguages.contains(a['language'] ?? active ?? 'en');
    final board = b.functions['get-board'];
    final pool = b.functions['get-pool'];
    b.functions['get-board'] = (a) => seeded(a) ? board?.call(a) : {'language': a['language'], 'newLanguage': true, 'activities': []};
    b.functions['get-pool'] = (a) => seeded(a) ? pool?.call(a) : [];
    final find = b.paths['/data-provider/find'];
    b.paths['/data-provider/find'] = (body) {
      final q = body['query'];
      final lang = q is Map ? q['language'] : null;
      final en = lang == null || lang == 'en' || (lang is Map && (lang[r'$in'] as List?)?.contains('en') == true);
      if (!en && !seededLanguages.contains(lang)) return [];
      return find?.call(body);
    };

    on('get-language-capabilities', (_) => capabilities());
    on('get-language-state', (_) => state());
    on('add-language', (a) {
      final code = a['language'] as String;
      if (!learning.any((l) => l['code'] == code && (l['enabled'] ?? true) == true)) throw ApiException('not_available');
      final existing = langs[code];
      final activeCount = langs.values.where((l) => l.status == 'active').length;
      if ((existing == null || existing.status != 'active') && activeCount >= maxLanguages) {
        throw ApiException('upgrade_needed: {"plan":"$plan","maxLanguages":$maxLanguages}');
      }
      if (existing != null && existing.status == 'removed') {
        existing.status = 'active';
      } else {
        final level = (a['startLevel'] as String?) ?? 'A1';
        langs[code] = _Lang(code, level, (a['startLevelSource'] as String?) ?? 'default')
          ..pack = _hasPack(code) ? 'offered' : 'none';
      }
      pending = {...pending}..remove(code);
      active = code;
      return _wrapped();
    });
    on('set-active-language', (a) {
      final l = langs[a['language']];
      if (l == null || l.status != 'active') throw ApiException('That language is not active.');
      active = l.code;
      return _wrapped();
    });
    on('remove-language', (a) {
      final code = a['language'] as String;
      langs[code]!.status = 'removed';
      if (active == code) active = langs.values.where((l) => l.status == 'active').map((l) => l.code).firstOrNull;
      return {'state': state(), 'purgeAt': '2026-11-15T00:00:00.000Z'};
    });
    on('pause-languages', (a) {
      final keep = (a['keep'] as List).cast<String>();
      for (final l in langs.values) {
        if (l.status == 'active' && !keep.contains(l.code)) l.status = 'paused';
      }
      return _wrapped();
    });
    on('update-language-settings', (a) {
      final l = langs[a['language']]!;
      if (a['explanationLanguage'] != null) l.explanationLanguage = a['explanationLanguage'] as String;
      if (a['newPhrasesPerDay'] != null) l.newPerDay = a['newPhrasesPerDay'] as int;
      return _wrapped();
    });
    on('set-translation-language', (a) {
      translationLanguage = a['language'] as String;
      return _wrapped();
    });
    on('set-language-interest', (a) {
      final on = a['on'] == true;
      on ? interests.add(a['language'] as String) : interests.remove(a['language']);
      return {'on': on};
    });
    on('keep-phrase-pending', (a) {
      kept.add(a);
      final code = a['language'] as String;
      pending = {...pending, code: (pending[code] ?? 0) + 1};
      return {'phraseId': 'kept${kept.length}', 'expiresAt': '2026-11-14T00:00:00.000Z'};
    });
    on('start-level-test', (a) {
      final id = 't${tests.length + 1}';
      tests[id] = [];
      _testLanguage = a['language'] as String;
      return {'testId': id, 'turn': _question(0), 'index': 1, 'total': 6};
    });
    on('answer-level-test', (a) {
      final answers = tests[a['testId']]!..add(a['text'] as String);
      if (answers.length >= 6) {
        return {'index': 6, 'total': 6, 'done': true, 'result': {'startLevel': 'A2', 'reason': 'You answered in short sentences and used the past once.'}};
      }
      return {'turn': _question(answers.length), 'index': answers.length + 1, 'total': 6, 'done': false};
    });
    on('finish-level-test', (a) {
      final l = langs[_testLanguage];
      if (a['accept'] == true && l != null) {
        l.startLevel = 'A2';
        l.source = 'test';
      }
      return _wrapped();
    });
    on('get-starter-pack', (a) {
      final l = langs[a['language']];
      return {
        'items': [
          for (var i = 0; i < 4; i++) {'id': 'c$i', 'text': const ['Guten Morgen', 'Danke schön', 'Wie geht es dir?', 'Bis später'][i], 'translation': const ['صبح بخیر', 'خیلی ممنون', 'حالت چطوره؟', 'بعداً می‌بینمت'][i], 'band': 1, 'group': 'Greetings'},
        ],
        'heard': [...?l?.heard],
      };
    });
    on('complete-starter-pack-items', (a) {
      final l = langs[a['language']]!;
      l.heard.addAll((a['itemIds'] as List).cast<String>());
      l.pack = l.heard.length >= 4 ? 'done' : 'in_progress';
      return {'heard': l.heard.length, 'total': 4, 'done': l.pack == 'done'};
    });
    on('skip-starter-pack', (a) {
      langs[a['language']]!.pack = 'skipped';
      return _wrapped();
    });
  }

  static const _questions = [
    ('Hallo! Wie heißt du?', 'سلام! اسمت چیه؟'),
    ('Woher kommst du?', null),
    ('Was hast du gestern gemacht?', 'دیروز چه کار کردی؟'),
    ('Warum lernst du Deutsch?', null),
    ('Was möchtest du am Wochenende machen?', null),
    ('Erzähl kurz von deiner Stadt.', null),
  ];

  Map<String, dynamic> _question(int i) => {'ai': _questions[i].$1, 'help': ?_questions[i].$2};
}

class _Lang {
  _Lang(this.code, this.startLevel, this.source);
  final String code;
  String startLevel;
  String source;
  String status = 'active';
  String pack = 'none';
  String? explanationLanguage;
  int newPerDay = 10;
  final heard = <String>{};

  Map<String, dynamic> toJson(int due, int phrases, String? l1) => {
        'code': code,
        'status': status,
        'startLevel': startLevel,
        'startLevelSource': source,
        'dueCount': due,
        'phraseCount': phrases,
        'explanationLanguage': explanationLanguage ?? l1,
        'starterPack': {'state': pack, 'heard': heard.length, 'total': pack == 'none' ? 0 : 4},
        if (status == 'removed') 'purgeAt': '2026-11-15T00:00:00.000Z',
      };
}
