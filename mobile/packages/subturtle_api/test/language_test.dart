import 'package:subturtle_api/subturtle_api.dart';
import 'package:test/test.dart';

import 'api_test.dart' show signedIn;
import 'fake_server.dart';

Map<String, dynamic> stateJson({String? active = 'de', String plan = 'reader', int max = 3}) => {
      'translationLanguage': 'fa',
      'learningLanguage': active,
      'languages': [
        {'code': 'en', 'status': 'active', 'startLevel': 'B1', 'startLevelSource': 'test', 'dueCount': 12, 'phraseCount': 142, 'explanationLanguage': 'fa', 'starterPack': {'state': 'none', 'heard': 0, 'total': 0}},
        {'code': 'de', 'status': 'active', 'startLevel': 'A1', 'startLevelSource': 'default', 'dueCount': 7, 'phraseCount': 38, 'explanationLanguage': 'fa', 'starterPack': {'state': 'in_progress', 'heard': 12, 'total': 150}},
        {'code': 'it', 'status': 'paused', 'startLevel': 'A1', 'startLevelSource': 'default', 'dueCount': 0, 'phraseCount': 3, 'explanationLanguage': 'fa', 'starterPack': {'state': 'none', 'heard': 0, 'total': 0}},
        {'code': 'fr', 'status': 'removed', 'startLevel': 'A1', 'startLevelSource': 'default', 'dueCount': 0, 'phraseCount': 5, 'explanationLanguage': 'fa', 'purgeAt': '2026-11-15T00:00:00.000Z', 'starterPack': {'state': 'none', 'heard': 0, 'total': 0}},
        {'code': 'sv', 'status': 'purging', 'startLevel': 'A1', 'startLevelSource': 'default', 'dueCount': 0, 'phraseCount': 0},
      ],
      'onboardingState': 'done',
      'plan': plan,
      'maxLanguages': max,
      'pending': [
        {'language': 'es', 'count': 3, 'expiresAt': '2026-11-14T00:00:00.000Z'},
      ],
    };

void main() {
  group('LanguageRepository', () {
    test('reads the state and drops purging languages', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-language-state', stateJson());
      final s = (await api.languages.state())!;
      expect(server.last('get-language-state').args['userId'], 'u1');
      expect(s.active, 'de');
      expect(s.translationLanguage, 'fa');
      expect(s.languages.map((l) => l.code), ['en', 'de', 'it', 'fr']);
      expect(s.studying.map((l) => l.code), ['en', 'de']);
      expect(s.paused.single.code, 'it');
      expect(s.removed.single.purgeAt, isNotNull);
      expect(s.summaryOf('de')!.starterPack.heard, 12);
      expect(s.summaryOf('en')!.fromTest, isTrue);
      expect(s.used, 2);
      expect(s.atLimit, isFalse);
      expect(s.pendingFor('es')!.count, 3);
      expect(s.needsLanguage, isFalse);
    });

    test('a server without the module means English only', () async {
      final (api, _) = await signedIn();
      // No functions registered: the fake answers like modular-rest does.
      expect(await api.languages.state(), isNull);
      final caps = await api.languages.capabilities();
      expect(caps.fromServer, isFalse);
      expect(caps.learning.single.code, 'en');
      expect(caps.ownByCode('fa')!.rtl, isTrue);
      final s = LanguageState.englishOnly(translationLanguage: 'fa');
      expect(s.active, 'en');
      expect(s.needsLanguage, isFalse);
      expect(s.maxLanguages, 1);
    });

    test('a missing function is told apart from other errors', () {
      expect(ApiException('Function with name get-language-state not found', statusCode: 400).isMissingFunction, isTrue);
      expect(ApiException('Function get-board not found', statusCode: 400).isMissingFunction, isTrue);
      expect(ApiException('Bundle not found', statusCode: 400).isMissingFunction, isFalse);
      expect(ApiException('FORBIDDEN: Function x not found', statusCode: 403).isMissingFunction, isFalse);
    });

    test('a new account needs a language', () {
      final s = LanguageState.fromJson({'translationLanguage': 'fa', 'learningLanguage': null, 'languages': [], 'onboardingState': 'needs_language', 'plan': 'starter', 'maxLanguages': 1, 'pending': []});
      expect(s.needsLanguage, isTrue);
    });

    test('capabilities: labels, voices and feature flags', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-language-capabilities', {
        'learning': [
          {'code': 'de', 'name': 'German', 'nativeName': 'Deutsch', 'rtl': false, 'ttsVoice': 'de-DE-Chirp3-HD-Kore', 'enabled': true, 'features': {'save': true, 'review': true, 'cloze': true, 'coachText': true, 'coachVoice': false, 'levelTest': true, 'starterPack': true, 'map': false}},
          {'code': 'pt', 'name': 'Portuguese', 'nativeName': 'Português', 'ttsVoice': 'pt-PT-Chirp3-HD-Kore', 'enabled': false, 'features': {}},
        ],
        'own': [
          {'code': 'fa', 'name': 'Persian', 'nativeName': 'فارسی', 'rtl': true, 'explanationReviewed': 'teacher'},
          {'code': 'ku', 'name': 'Kurdish', 'nativeName': 'Kurdî', 'rtl': false, 'explanationReviewed': 'ai'},
        ],
      });
      final caps = await api.languages.capabilities();
      final de = caps.learningByCode('de')!;
      expect(de.label, 'German · Deutsch');
      expect(de.ttsLanguageCode, 'de-DE');
      expect(de.features.coachVoice, isFalse);
      expect(de.features.starterPack, isTrue);
      expect(caps.ready.map((l) => l.code), ['de']);
      expect(caps.comingLater.map((l) => l.code), ['pt']);
      expect(caps.learningByCode('en'), LearningLanguageCaps.english, reason: 'English is always known');
      expect(caps.ownByCode('fa')!.teacherChecked, isTrue);
      expect(caps.ownByCode('ku')!.teacherChecked, isFalse);
    });

    test('add-language sends the start level and reads the state', () async {
      final (api, server) = await signedIn();
      server.onFunction('add-language', {'state': stateJson(active: 'de')});
      final s = await api.languages.add('de', startLevel: 'A2', startLevelSource: 'test', goals: ['watch']);
      final args = server.last('add-language').args;
      expect(args, {'userId': 'u1', 'language': 'de', 'startLevel': 'A2', 'startLevelSource': 'test', 'goals': ['watch']});
      expect(s.active, 'de');
    });

    test('add-language without a level leaves it to the server (A1)', () async {
      final (api, server) = await signedIn();
      server.onFunction('add-language', {'state': stateJson()});
      await api.languages.add('it');
      expect(server.last('add-language').args.containsKey('startLevel'), isFalse);
    });

    test('add-language refusals become AddLanguageRefusal, in any shape', () async {
      final (api, server) = await signedIn();
      server.onFunction('add-language', {'status': 'error', 'message': 'upgrade_needed: {"plan":"reader","maxLanguages":3}'}, status: 400);
      await expectLater(
        api.languages.add('fr'),
        throwsA(isA<AddLanguageRefusal>().having((r) => r.upgradeNeeded, 'upgradeNeeded', isTrue).having((r) => r.plan, 'plan', 'reader').having((r) => r.maxLanguages, 'max', 3)),
      );
      server.onFunction('add-language', {'error': 'upgrade_needed', 'plan': 'starter', 'maxLanguages': 1});
      await expectLater(api.languages.add('fr'), throwsA(isA<AddLanguageRefusal>().having((r) => r.plan, 'plan', 'starter')));
      server.onFunction('add-language', {'status': 'error', 'message': 'PURGING: the language is being deleted'}, status: 400);
      await expectLater(api.languages.add('fr'), throwsA(isA<AddLanguageRefusal>().having((r) => r.reason, 'reason', 'purging')));
      server.onFunction('add-language', {'status': 'error', 'message': 'Something else'}, status: 400);
      await expectLater(api.languages.add('fr'), throwsA(isA<ApiException>()));
    });

    test('set active, remove, pause, settings, own language, interest, keep', () async {
      final (api, server) = await signedIn();
      server.onFunction('set-active-language', {'state': stateJson(active: 'en')});
      server.onFunction('remove-language', {'state': stateJson(active: 'en'), 'purgeAt': '2026-11-15T00:00:00.000Z'});
      server.onFunction('pause-languages', {'state': stateJson()});
      server.onFunction('update-language-settings', {'state': stateJson()});
      server.onFunction('set-translation-language', {'state': stateJson()});
      server.onFunction('set-language-interest', {'on': true});
      server.onFunction('keep-phrase-pending', {'phraseId': 'p9', 'expiresAt': '2026-11-14T00:00:00.000Z'});

      expect((await api.languages.setActive('en')).active, 'en');
      expect(server.last('set-active-language').args['language'], 'en');
      final (_, purgeAt) = await api.languages.remove('de');
      expect(purgeAt, isNotNull);
      await api.languages.pause(keep: ['en']);
      expect(server.last('pause-languages').args['keep'], ['en']);
      await api.languages.updateSettings('de', explanationLanguage: 'fa');
      expect(server.last('update-language-settings').args, {'userId': 'u1', 'language': 'de', 'explanationLanguage': 'fa'});
      await api.languages.setTranslationLanguage('ar');
      expect(server.last('set-translation-language').args['language'], 'ar');
      expect(await api.languages.setInterest('pt', on: true), isTrue);
      final kept = await api.languages.keepPending(phrase: {'phrase': 'ich muss', 'translation': 'باید'}, language: 'de');
      expect(kept.phraseId, 'p9');
      expect(server.last('keep-phrase-pending').args['phrase'], {'phrase': 'ich muss', 'translation': 'باید'});
    });

    test('the chat test: start, answer, done, finish', () async {
      final (api, server) = await signedIn();
      server.onFunction('start-level-test', {'testId': 't1', 'turn': {'ai': 'Hallo! Wie heißt du?', 'help': 'سلام! اسمت چیه؟'}, 'index': 1, 'total': 6});
      final first = await api.languages.startLevelTest('de');
      expect(first.testId, 't1');
      expect(first.turn!.help, isNotNull);
      server.onFunction('answer-level-test', {'index': 6, 'total': 6, 'done': true, 'result': {'startLevel': 'A2', 'reason': 'You used the past once.'}});
      final last = await api.languages.answerLevelTest('t1', 'Ich heiße Sara.');
      expect(last.done, isTrue);
      expect(last.result!.startLevel, 'A2');
      expect(server.last('answer-level-test').args['text'], 'Ich heiße Sara.');
      server.onFunction('finish-level-test', {'state': stateJson(), 'result': {'startLevel': 'A2', 'reason': 'x'}, 'applied': false, 'language': 'fr'});
      final f = await api.languages.finishLevelTest('t1', accept: true);
      expect(server.last('finish-level-test').args['accept'], isTrue);
      expect(f.applied, isFalse, reason: 'a new language: the client sends the level to add-language');
      expect(f.result!.startLevel, 'A2');
      expect(f.language, 'fr');
      expect(f.state.active, 'de');
    });
  });

  group('contract updates', () {
    test('simple translation: a plain string, or the withLanguage object', () async {
      final (api, server) = await signedIn();
      server.onFunction('translateWithContext', 'باید');
      expect(await api.translation.translateSimple(phrase: 'muss', context: '', targetLanguage: 'Persian'), 'باید');
      server.onFunction('translateWithContext', {'translation': 'باید', 'detectedLanguage': 'de', 'resolvedLanguage': 'de', 'inProfile': true});
      expect(await api.translation.translateSimple(phrase: 'muss', context: '', targetLanguage: 'Persian'), 'باید');
    });

    test('check-cloze-answer: result, expected and reason', () async {
      final (api, server) = await signedIn();
      server.onFunction('check-cloze-answer', {'result': 'close', 'expected': 'bin', 'reason': 'accent'});
      final c = (await api.review.checkCloze(phraseId: 'p1', answer: 'bin'))!;
      expect([c.result, c.expected, c.reason], ['close', 'bin', 'accent']);
      server.onFunction('check-cloze-answer', {'result': 'right', 'expected': 'bin'});
      expect((await api.review.checkCloze(phraseId: 'p1', answer: 'bin'))!.reason, isNull);
    });

    test('speech never asks for an HD voice (the TTS function refuses them)', () async {
      final (api, server) = await signedIn();
      server.onFunction('textToSpeechBase64', 'data:audio/mp3;base64,AA');
      await api.translation.speak('Labas', voiceName: 'lt-LT-Chirp3-HD-Kore');
      expect(server.last('textToSpeechBase64').args, {'text': 'Labas', 'languageCode': 'lt-LT', 'voiceName': 'lt-LT-Standard-B'});
      for (final code in ['en', 'es', 'de', 'fr', 'it', 'sv', 'lt']) {
        final caps = LearningLanguageCaps(code: code, name: code, nativeName: '', ttsVoice: '$code-XX-Chirp3-HD-Kore');
        expect(caps.speechVoice, isNot(contains('HD')), reason: code);
      }
      expect(const LearningLanguageCaps(code: 'de', name: 'German', nativeName: 'Deutsch', ttsVoice: 'de-DE-Chirp3-HD-Kore').speechVoice, 'de-DE-Neural2-G');
    });

    test('submit-review reply and the board without language stay readable', () async {
      final (api, server) = await signedIn();
      server.onFunction('submit-review', {'success': true, 'language': 'de', 'result': 'close'});
      await api.review.submit('p1', learned: true, result: 'close', language: 'de');
      server.onFunction('get-board', [
        {'_id': 'a', 'type': 'leitner_review', 'meta': {'dueCount': 1}},
      ]);
      expect((await api.board.getBoard()).single.dueCount, 1);
    });
  });

  group('StarterPackRepository', () {
    test('get, complete, skip', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-starter-pack', {
        'items': [
          {'id': 'g1', 'text': 'Guten Morgen', 'translation': 'صبح بخیر', 'translationLanguage': 'fa', 'band': 1, 'group': 'greetings', 'lemma': 'Morgen', 'form': 'Morgen'},
          {'id': 'g2', 'text': 'Danke', 'translation': 'ممنون', 'translationLanguage': 'fa', 'band': 1, 'group': 'greetings'},
        ],
        'heard': ['g1'],
        'state': 'in_progress',
        'total': 150,
        'groups': [
          {'id': 'greetings', 'name': 'Greetings'},
        ],
        'version': 1,
      });
      final pack = await api.starterPacks.get('de');
      expect(pack.unheard.single.id, 'g2');
      expect(pack.groups['greetings'], 'Greetings');
      expect([pack.state, pack.total, pack.version], ['in_progress', 150, 1]);
      expect(pack.items.first.audioUrl, isNull);
      expect(pack.items.first.translationLanguage, 'fa');
      expect(pack.items.first.lemma, 'Morgen');
      server.onFunction('complete-starter-pack-items', {'heard': 2, 'total': 150, 'done': false, 'added': ['g2'], 'deferred': ['g3']});
      final p = await api.starterPacks.complete('de', ['g2', 'g3']);
      expect(p.added, ['g2']);
      expect(p.deferred, ['g3']);
      expect(p.done, isFalse);
      server.onFunction('skip-starter-pack', {'state': stateJson()});
      await api.starterPacks.skip('de');
      expect(server.last('skip-starter-pack').args['language'], 'de');
    });
  });

  group('language on scoped functions (contract section 3)', () {
    test('the active language goes on every scoped call', () async {
      final (api, server) = await signedIn();
      api.activeLanguage = 'de';
      for (final f in ['get-board', 'get-pool', 'get-review-session', 'submit-review', 'get-stats', 'get-phrase-management-info', 'refresh-board-status', 'list-live-sessions', 'consume-activity', 'complete-pool-session']) {
        server.onFunction(f, f == 'get-stats' ? null : (f == 'list-live-sessions' ? {'items': []} : []));
      }
      await api.board.getBoard();
      await api.board.getPool();
      await api.board.consume('leitner_review');
      await api.board.completePoolSession(['p1']);
      await api.review.getDueSession();
      await api.review.submit('p1', learned: true);
      await api.review.getStats();
      await api.review.getPhraseInfo();
      await api.review.refreshBoard();
      await api.liveSessions.listSessions();
      for (final c in server.calls.where((c) => c.fn != null)) {
        expect(c.args['language'], 'de', reason: c.fn);
      }
    });

    test('a call can name another language; no language sends none', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-review-session', []);
      await api.review.getDueSession();
      expect(server.last('get-review-session').args.containsKey('language'), isFalse);
      api.activeLanguage = 'de';
      await api.review.getDueSession(language: 'en');
      expect(server.last('get-review-session').args['language'], 'en');
    });

    test('get-board reads both the 1.x list and the 2.0 object', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-board', [
        {'_id': 'a', 'type': 'leitner_review', 'meta': {'dueCount': 3}},
      ]);
      final old = await api.board.getBoardSnapshot();
      expect(old.activities.single.dueCount, 3);
      expect(old.newLanguage, isFalse);
      server.onFunction('get-board', {'language': 'de', 'newLanguage': true, 'activities': []});
      final fresh = await api.board.getBoardSnapshot();
      expect(fresh.newLanguage, isTrue);
      expect(fresh.language, 'de');
    });

    test('submit-review sends the three-way result and isCorrect', () async {
      final (api, server) = await signedIn();
      server.onFunction('submit-review', {'success': true});
      await api.review.submit('p1', learned: true, result: ReviewResult.close);
      expect(server.last('submit-review').args, containsPair('result', 'close'));
      expect(server.last('submit-review').args, containsPair('isCorrect', true));
      await api.review.submit('p1', learned: false);
      expect(server.last('submit-review').args, containsPair('result', 'wrong'));
    });

    test('check-cloze-answer, with a fallback on old servers', () async {
      final (api, server) = await signedIn();
      expect(await api.review.checkCloze(phraseId: 'p1', answer: 'bist'), isNull);
      server.onFunction('check-cloze-answer', {'result': 'close', 'expected': 'bin'});
      final c = await api.review.checkCloze(phraseId: 'p1', answer: 'bist', language: 'de');
      expect(c!.result, 'close');
      expect(c.expected, 'bin');
      expect(server.last('check-cloze-answer').args['language'], 'de');
    });

    test('review items carry the cue and accepted answers', () {
      final item = ReviewItem.fromJson({
        'phraseId': 'p1',
        'boxLevel': 3,
        'phrase': {'_id': 'p1', 'phrase': 'ich bin', 'translation': 'من هستم', 'language': 'de'},
        'cue': {'lemma': 'sein', 'form': 'present perfect, ich'},
        'acceptedAnswers': ['bin'],
      });
      expect(item.hasCue, isTrue);
      expect(item.cueLemma, 'sein');
      expect(item.acceptedAnswers, ['bin']);
      expect(item.phrase.languageCode, 'de');
      expect(Phrase.fromJson({'_id': 'x', 'phrase': 'a', 'translation': 'b'}).languageCode, 'en', reason: 'old phrases read as English');
    });

    test('bundles are filtered by language; English also matches old bundles', () async {
      final (api, server) = await signedIn();
      server.onPath('/data-provider/find', (c) => FakeServer.json({'data': []}));
      server.onPath('/data-provider/insert-one', (c) => FakeServer.json({'data': {'_id': 'b1', 'title': 'x'}}));
      api.activeLanguage = 'de';
      await api.bundles.listBundles();
      expect((server.calls.last.body as Map)['query']['language'], 'de');
      await api.bundles.listBundles(language: 'en');
      expect((server.calls.last.body as Map)['query']['language'], {
        r'$in': ['en', null],
      });
      await api.bundles.searchPhrases('ich');
      final q = (server.calls.last.body as Map)['query'] as Map;
      expect(q['language'], 'de');
      expect(q['phrase'], isNotNull);
      await api.bundles.createBundle('Dark S1');
      expect((server.calls.last.body as Map)['doc'], {'title': 'Dark S1', 'refId': 'u1', 'language': 'de'});
    });

    test('createPhrase sends the language and no longer assumes English', () async {
      final (api, server) = await signedIn();
      server.onFunction('createPhrase', {'_id': 'p1', 'phrase': 'ich muss', 'translation': 'باید', 'language': 'de', 'languageSource': 'given'});
      api.activeLanguage = 'de';
      final p = await api.bundles.createPhrase(
        phrase: 'ich muss',
        translation: 'باید',
        bundleIds: ['b1'],
        translationLanguage: 'Persian',
        detail: const DetailedTranslation(translation: 'باید'),
      );
      final args = server.last('createPhrase').args;
      expect(args['language'], 'de');
      expect(args['language_info'], {'source': 'de', 'target': 'Persian'});
      expect(p.language, 'de');
      expect(p.languageSource, 'given');
    });

    test('translateWithContext sends both own-language fields and reads detection', () async {
      final (api, server) = await signedIn();
      server.onFunction('translateWithContext', {
        'translation': {'phrase': 'باید'},
        'detectedLanguage': 'de',
        'resolvedLanguage': 'de',
        'inProfile': false,
      });
      final t = await api.translation.translateDetailed(phrase: 'ich muss', context: 'Ich muss gehen.', targetLanguage: 'Persian', translationLanguage: 'fa');
      final args = server.last('translateWithContext').args;
      expect(args['targetLanguage'], 'Persian');
      expect(args['translationLanguage'], 'fa');
      expect(t.detectedLanguage, 'de');
      expect(t.inProfile, isFalse);
    });

    test('advise names the phrase language; speak follows the voice', () async {
      final (api, server) = await signedIn();
      server.onFunction('translationAdvice', {'reply': 'ok'});
      server.onFunction('textToSpeechBase64', 'data:audio/mp3;base64,AA');
      await api.translation.advise(phrase: 'ich muss', context: '', message: 'Is it formal?', sourceLanguage: 'German');
      expect(server.last('translationAdvice').args['sourceLanguage'], 'German');
      await api.translation.speak('Guten Morgen', voiceName: 'de-DE-Chirp3-HD-Kore');
      expect(server.last('textToSpeechBase64').args, {'text': 'Guten Morgen', 'languageCode': 'de-DE', 'voiceName': 'de-DE-Neural2-G'});
      await api.translation.speak('Hello');
      expect(server.last('textToSpeechBase64').args['languageCode'], 'en-US');
    });

    test('coach: server prompt with fallback, flags, session language', () async {
      final (api, server) = await signedIn();
      expect(await api.liveSessions.getCoachInstructions(explanationLanguage: 'fa', phraseIds: ['p1'], mode: 'voice', language: 'de'), isNull);
      server.onFunction('get-coach-instructions', {'instructions': 'Du bist ein Coach.', 'voiceName': 'Kore'});
      final ci = await api.liveSessions.getCoachInstructions(explanationLanguage: 'fa', phraseIds: ['p1'], mode: 'text', language: 'de');
      expect(ci!.instructions, 'Du bist ein Coach.');
      expect(server.last('get-coach-instructions').args, {'userId': 'u1', 'language': 'de', 'explanationLanguage': 'fa', 'phraseIds': ['p1'], 'mode': 'text'});
      expect(await api.liveSessions.flagExplanation(sessionId: 's1', turnIndex: 2, on: true), isFalse);
      server.onFunction('flag-coach-explanation', {'ok': true});
      expect(await api.liveSessions.flagExplanation(sessionId: 's1', turnIndex: 2, on: true), isTrue);
      server.onFunction('create-text-session', {'sessionId': 's2'});
      await api.textChat.create(instructions: 'x', language: 'de', explanationLanguage: 'fa');
      expect(server.last('create-text-session').args['language'], 'de');
      expect(server.last('create-text-session').args['explanationLanguage'], 'fa');
    });

    test('save assistant: language out, detection back', () async {
      final (api, server) = await signedIn();
      api.activeLanguage = 'en';
      server.onFunction('createSaveSession', {
        'sessionId': 's1',
        'candidates': [],
        'messageId': 'm1',
        'translation': {'phrase': 'باید', 'translation': {'phrase': 'باید'}},
        'detectedLanguage': 'de',
        'inProfile': false,
      });
      final start = await api.saveAssistant.createSession(message: 'Ich muss gehen', targetLanguage: 'Persian', translationLanguage: 'fa');
      expect(server.last('createSaveSession').args['language'], 'en');
      expect(start.translation.detectedLanguage, 'de');
      expect(start.translation.inProfile, isFalse);
    });
  });

  group('Profile', () {
    test('reads the server-owned language fields', () {
      final p = Profile.fromJson({'_id': 'pr', 'translationLanguage': 'fa', 'learningLanguage': 'de', 'learningLanguages': ['en', 'de'], 'pausedLanguages': [], 'onboardingState': 'done'});
      expect(p.translationLanguage, 'fa');
      expect(p.learningLanguages, ['en', 'de']);
      expect(Profile.fromJson({'_id': 'pr'}).learningLanguage, isNull);
    });
  });
}
