/// The language client against a real server. Skipped unless both are set:
///
/// ```
/// SUBTURTLE_LIVE_API=http://localhost:8080 \
/// SUBTURTLE_LIVE_TOKEN=<a standard user's JWT from server/scripts/create-standard-user.mjs> \
///   dart test test/live_server_test.dart
/// ```
///
/// Use a fresh local test account on a local server: the test adds and removes
/// languages, keeps a phrase and creates a bundle. Never point it at production.
library;

import 'dart:io';

import 'package:subturtle_api/subturtle_api.dart';
import 'package:test/test.dart';

void main() {
  final base = Platform.environment['SUBTURTLE_LIVE_API'];
  final token = Platform.environment['SUBTURTLE_LIVE_TOKEN'];
  final skip = base == null || token == null ? 'Set SUBTURTLE_LIVE_API and SUBTURTLE_LIVE_TOKEN to run against a server' : null;
  if (base != null && base.contains('dashboard.subturtle.app')) throw StateError('Never run this against production.');

  late SubturtleApi api;
  setUpAll(() async {
    if (skip != null) return;
    api = SubturtleApi(baseUrl: base!, tokenStore: MemoryTokenStore(token));
    final user = await api.auth.restore();
    expect(user, isNotNull, reason: 'the token must be valid');
  });

  test('capabilities: the launch languages and every own language', () async {
    final caps = await api.languages.capabilities();
    expect(caps.fromServer, isTrue);
    expect(caps.learning.map((l) => l.code), containsAll(['en', 'es', 'de', 'fr', 'it', 'sv', 'lt']));
    expect(caps.learningByCode('de')!.ttsLanguageCode, 'de-DE');
    expect(caps.own.length, greaterThan(30));
    expect(caps.ownByCode('fa')!.rtl, isTrue);
  }, skip: skip);

  test('a fresh account: state, own language, add German, the plan limit, kept phrases', () async {
    var s = (await api.languages.state())!;
    expect(s.plan, isNotEmpty);
    expect(s.maxLanguages, greaterThan(0));
    print(
      'fresh state: active=${s.learningLanguage} onboarding=${s.onboardingState} plan=${s.plan} max=${s.maxLanguages} langs=${s.languages.map((l) => '${l.code}:${l.status}').toList()}',
    );

    s = await api.languages.setTranslationLanguage('fa');
    expect(s.translationLanguage, 'fa');

    s = await api.languages.add('de', goals: ['watch']);
    expect(s.active, 'de');
    expect(s.summaryOf('de')!.startLevel, CefrStart.a1);
    expect(s.needsLanguage, isFalse);
    api.activeLanguage = s.active;

    // Starter studies one language: a second one is refused with the limit.
    if (s.atLimit) {
      await expectLater(api.languages.add('es'), throwsA(isA<AddLanguageRefusal>().having((r) => r.upgradeNeeded, 'upgrade', isTrue)));
    }

    s = await api.languages.updateSettings('de', explanationLanguage: 'fa');
    expect(s.summaryOf('de')!.explanationLanguage, 'fa');
    // Per-language settings come back with the state (server #134).
    expect(s.summaryOf('de')!.newPhrasesPerDay, isNotNull);
    s = await api.languages.updateSettings('de', newPhrasesPerDay: 8);
    expect(s.summaryOf('de')!.newPhrasesPerDay, 8);
    expect(s.summaryOf('de')!.goals, ['watch']);

    expect(await api.languages.setInterest('pt', on: true), isTrue);

    final kept = await api.languages.keepPending(language: 'es', phrase: {'phrase': 'tengo que', 'translation': 'باید', 'translation_language': 'Persian'});
    expect(kept.phraseId, isNotEmpty);
    s = (await api.languages.state())!;
    expect(s.pendingFor('es')?.count, 1);
  }, skip: skip);

  test('scoped data: bundles and the board follow the language', () async {
    api.activeLanguage = 'de';
    final b = await api.bundles.createBundle('Dark S1 ${DateTime.now().millisecondsSinceEpoch}');
    expect(b.language, 'de');
    expect((await api.bundles.listBundles()).map((x) => x.id), contains(b.id));
    expect((await api.bundles.listBundles(language: 'en')).map((x) => x.id), isNot(contains(b.id)));
    final board = await api.board.getBoardSnapshot();
    print('board de: language=${board.language} newLanguage=${board.newLanguage} activities=${board.activities.length}');
  }, skip: skip);

  test('missing round-1 functions fall back instead of failing', () async {
    final cloze = await api.review.checkCloze(phraseId: '000000000000000000000000', answer: 'x').then<Object?>((v) => v, onError: (Object e) => e);
    print('check-cloze-answer on an unknown phrase: $cloze');
    final coach = await api.liveSessions
        .getCoachInstructions(explanationLanguage: 'fa', phraseIds: const [], mode: 'text', language: 'de')
        .then<Object?>((v) => v, onError: (Object e) => e);
    print('get-coach-instructions: ${coach is CoachInstructions ? '${coach.instructions.length} chars, voice ${coach.voiceName}' : coach}');
  }, skip: skip);

  test('the chat test runs before adding; its level goes to add-language', () async {
    final first = await api.languages.startLevelTest('fr');
    final id = first.testId!;
    expect(first.turn!.ai, isNotEmpty);
    print('Q1: ${first.turn!.ai} | help: ${first.turn!.help}');
    var step = first;
    var n = 0;
    while (!step.done && n++ < 10) {
      step = await api.languages.answerLevelTest(id, "Je m'appelle Sara et j'habite à Berlin.");
    }
    expect(step.done, isTrue);
    expect(CefrStart.all, contains(step.result!.startLevel));
    print('result: ${step.result!.startLevel} - ${step.result!.reason}');
    // The phone adds the language with the level, then accepts the test.
    final s = await api.languages.add('fr', startLevel: step.result!.startLevel, startLevelSource: 'test').then<Object>((v) => v, onError: (Object e) => e);
    print('add after test: ${s is LanguageState ? 'active=${s.active}' : s}');
    final done = await api.languages.finishLevelTest(id, accept: true);
    expect(done.state.languages, isNotEmpty);
    expect(done.result, isNotNull);
  }, skip: skip);

  test('the starter pack of an added language (German, from the test above)', () async {
    final pack = await api.starterPacks.get('de');
    expect(pack.items.length, greaterThan(50));
    final first = pack.items.first;
    print('pack: ${pack.items.length} items; first: ${first.text} = ${first.translation} (band ${first.band}, ${first.group})');
    final p = await api.starterPacks.complete('de', [first.id]);
    expect(p.heard, greaterThanOrEqualTo(1));
    final s = await api.starterPacks.skip('de');
    expect(s.summaryOf('de')?.starterPack.state, isNotNull);
  }, skip: skip);
}
