import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle/features/capture/capture_sheet.dart';
import 'package:subturtle/features/capture/save_assistant.dart';
import 'package:subturtle/features/capture/save_engine.dart';
import 'package:subturtle/features/capture/save_history_view.dart';
import 'package:subturtle/features/capture/save_session.dart';
import 'package:subturtle/features/live_session/gemini_live_client.dart';
import 'package:subturtle/features/plans/local_pricing.dart';
import 'package:subturtle/features/review/review_logic.dart';
import 'package:subturtle/shared/format.dart';
import 'package:subturtle/shared/languages.dart';
import 'package:subturtle/shared/widgets.dart';
import 'package:subturtle_api/subturtle_api.dart';

ReviewItem item({int level = 3, String? chunk = 'had to', String? sentence = 'I had to get out of there.'}) => ReviewItem(
      phraseId: 'p1',
      boxLevel: level,
      phrase: Phrase(id: 'p1', phrase: 'had to', translation: 'باید', chunks: [Chunk(text: 'had to', definition: 'مجبور بودن')]),
      confirmedChunk: chunk,
      sourceSentence: sentence,
    );

void main() {
  group('Cloze', () {
    test('level 3+ with a chunk in the sentence is a fill-the-gap card', () {
      final c = Cloze.fromItem(item())!;
      expect(c.before, 'I ');
      expect(c.answer, 'had to');
      expect(c.after, ' get out of there.');
      expect(c.hint, 'مجبور بودن');
    });

    test('levels 1-2 and missing chunks fall back to recognition', () {
      expect(Cloze.fromItem(item(level: 2)), isNull);
      expect(Cloze.fromItem(item(sentence: null)), isNull);
      expect(Cloze.build('I went home.', 'had to'), isNull);
    });

    test('match is case-insensitive and keeps the sentence casing', () {
      expect(Cloze.build('Had to go.', 'had to')!.answer, 'Had to');
    });
  });

  group('checkAnswer', () {
    test('ignores case, spaces and end punctuation', () {
      expect(checkAnswer('  Had   To. ', 'had to'), ClozeResult.correct);
      expect(checkAnswer('"had to!"', 'had to'), ClozeResult.correct);
    });

    test('contractions match the long form', () {
      expect(checkAnswer("don't", 'do not'), ClozeResult.correct);
      expect(checkAnswer("can't", 'cannot'), ClozeResult.correct);
    });

    test('a small typo or one changed word is close', () {
      expect(checkAnswer('hd to', 'had to'), ClozeResult.close);
      expect(checkAnswer('have to', 'had to'), ClozeResult.close);
      expect(checkAnswer('get out off', 'get out of'), ClozeResult.close);
    });

    test('wrong and empty answers', () {
      expect(checkAnswer('', 'had to'), ClozeResult.wrong);
      expect(checkAnswer('went away', 'had to'), ClozeResult.wrong);
    });
  });

  group('GradeQueue', () {
    test('the newest grade waits; undo drops it without sending', () async {
      final sent = <String>[];
      final q = GradeQueue((g) async => sent.add('${g.phraseId}:${g.learned}'));
      await q.add(const Grade(0, 'a', true));
      expect(sent, isEmpty, reason: 'held back for undo');
      expect(q.canUndo, isTrue);
      final undone = q.undo();
      expect(undone?.phraseId, 'a');
      expect(sent, isEmpty);
      await q.add(const Grade(0, 'a', false));
      await q.add(const Grade(1, 'b', true));
      expect(sent, ['a:false']);
      await q.flush();
      expect(sent, ['a:false', 'b:true']);
      expect(q.learned, 1);
      expect(q.forgot, 1);
    });

    test('failed sends are kept and retried on flush', () async {
      var fail = true;
      final sent = <String>[];
      final q = GradeQueue((g) async {
        if (fail) throw Exception('offline');
        sent.add(g.phraseId);
      });
      await q.add(const Grade(0, 'a', true));
      await q.flush();
      expect(q.failed.length, 1);
      fail = false;
      await q.flush();
      expect(sent, ['a']);
      expect(q.failed, isEmpty);
    });
  });

  group('local pricing', () {
    final now = DateTime(2026, 10, 13);
    test("Stripe's own rate wins; the line item is the fallback", () {
      expect(localPricingFromProbe({'currency': 'eur', 'fxRate': 1.2311, 'minor': 553}, probeGbp: 4.49, now: now)!.fxRate, 1.2311);
      expect(localPricingFromProbe({'currency': 'EUR', 'minor': 553}, probeGbp: 4.49, now: now)!.fxRate, closeTo(553 / 449, 1e-9));
    });

    test('GBP, errors and missing rates mean no localization', () {
      expect(localPricingFromProbe({'currency': 'gbp', 'fxRate': 1}, probeGbp: 4.49, now: now), isNull);
      expect(localPricingFromProbe({'currency': 'eur'}, probeGbp: 4.49, now: now), isNull);
      expect(localPricingFromProbe({}, probeGbp: 4.49, now: now), isNull);
    });

    test('formats in the local currency', () {
      final eur = LocalPricing(currency: 'eur', fxRate: 1.2311, at: now);
      expect(eur.format(10.99), '€13.53');
      expect(LocalPricing.fromJson(eur.toJson())!.currency, 'eur');
    });
  });

  group('dashboard links', () {
    test('signed in: the login_with_token handoff, with the page as redirect', () {
      final url = Uri.parse(dashboardLink('https://dev.dashboard.subturtle.app', '/settings/subscription?suggest=learner&from=mobile', token: 'h.p.s'));
      expect(url.path, '/');
      // Everything after # stays in the browser: the token is never sent to a server.
      final route = Uri.parse(url.fragment);
      expect(route.path, '/auth/login_with_token');
      expect(route.queryParameters['token'], 'h.p.s');
      expect(route.queryParameters['redirect'], '/settings/subscription?suggest=learner&from=mobile');
    });

    test('signed out: the plain page', () {
      expect(dashboardLink('https://d.app', '/statistic'), 'https://d.app/#/statistic');
    });
  });

  group('Save assistant', () {
    test('phrases are the chunks found in the sentence, in sentence order, once', () {
      expect(
        phrasesIn('I had to get out of there before it got worse.', ['got worse', 'get out of', 'had to', 'GET OUT OF', 'not here', ' ']),
        ['had to', 'get out of', 'got worse'],
      );
    });

    test('server candidates: sentence order, no whole sentence, tutor additions last', () {
      const sentence = 'I had to get out of there before it got worse.';
      final chips = shownCandidates(sentence, const [
        SaveCandidate(text: sentence, type: 'full'),
        SaveCandidate(text: 'got worse', type: 'collocation'),
        SaveCandidate(text: 'keep an eye on', type: 'idiom'),
        SaveCandidate(text: 'had to', type: 'collocation'),
      ]);
      expect(chips, ['had to', 'got worse', 'keep an eye on']);
      // A short message is its own phrase.
      expect(shownCandidates('no wonder', const [SaveCandidate(text: 'no wonder', type: 'full'), SaveCandidate(text: 'wonder')]), ['no wonder']);
      expect(shownCandidates(sentence, const [SaveCandidate(text: sentence, type: 'full')]), [sentence]);
    });

    test('the input bar tells a question from a new sentence', () {
      expect(looksLikeQuestion('Is it formal?'), isTrue);
      expect(looksLikeQuestion('give me another example'), isTrue);
      expect(looksLikeQuestion('Explain the grammar'), isTrue);
      expect(looksLikeQuestion('She got out of the car and ran inside.'), isFalse);
    });

    test('history groups and times', () {
      final now = DateTime(2026, 10, 13, 18);
      expect(historyGroup(DateTime(2026, 10, 13, 9), now), 'Today');
      expect(historyGroup(DateTime(2026, 10, 12, 23), now), 'Yesterday');
      expect(historyGroup(DateTime(2026, 10, 8), now), 'This week');
      expect(historyGroup(DateTime(2026, 10, 6), now), 'Earlier');
      expect(historyTime(DateTime(2026, 10, 13, 10, 42), now), '10:42');
      expect(historyTime(DateTime(2026, 10, 2), now), '2 Oct');
    });

    final saved = SaveSession(
      id: 'a',
      sentence: 'I had to get out of there.',
      createdAt: DateTime(2026, 10, 13, 10),
      updatedAt: DateTime(2026, 10, 13, 10, 32),
      candidates: const ['had to', 'get out of'],
      picked: 1,
      saved: const [SavedPhraseRef(text: 'get out of', phraseId: 'p1', bundleId: 'b1', bundleTitle: 'Stranger Things S2')],
      log: const [ChatLine(fromUser: true, text: 'Is it formal?'), ChatLine(fromUser: false, text: 'It is informal.')],
    );
    final asked = SaveSession(id: 'b', sentence: 'What does "keep an eye on" mean?', createdAt: DateTime(2026, 10, 12), updatedAt: DateTime(2026, 10, 12));

    test('search looks in sentences and saved phrases; the filter keeps chats that saved', () {
      expect(filterSessions([saved, asked], query: 'EYE'), [asked]);
      expect(filterSessions([saved, asked], query: 'get out'), [saved]);
      expect(filterSessions([saved, asked], savedOnly: true), [saved]);
      expect(filterSessions([saved, asked], query: 'nothing like this'), isEmpty);
    });

    test('recent rows say what was saved and when', () {
      expect(recentMeta(saved, DateTime(2026, 10, 13, 10, 42)), '1 saved · 10 min ago');
      expect(recentMeta(asked, DateTime(2026, 10, 13, 10, 42)), 'Asked only · Yesterday');
    });

    test('chats survive a round trip, per user, newest first, capped', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final repo = LocalSaveSessionRepository(prefs, userId: 'u1', maxSessions: 2);
      await repo.put(asked);
      await repo.put(saved);
      final back = await repo.list();
      expect(back.map((s) => s.id), ['a', 'b']);
      expect(back.first.saved.single.phraseId, 'p1');
      expect(back.first.log.last.text, 'It is informal.');
      expect(back.first.picked, 1);
      expect(await LocalSaveSessionRepository(prefs, userId: 'u2').list(), isEmpty, reason: 'another account sees nothing');

      await repo.put(SaveSession(id: 'c', sentence: 'x', createdAt: DateTime(2026, 10, 13, 11), updatedAt: DateTime(2026, 10, 13, 11)));
      expect((await repo.list()).map((s) => s.id), ['c', 'a'], reason: 'only the newest 2 are kept');
      await repo.delete('a');
      expect((await repo.list()).map((s) => s.id), ['c']);

      await prefs.setString('saveSessions.v1.u1', 'not json');
      expect(await repo.list(), isEmpty, reason: 'a broken store starts empty instead of failing');
    });
  });

  group('Gemini Live messages', () {
    test('setup carries model, voice, tools and transcription', () {
      final c = GeminiLiveClient(token: 't', model: 'gemini-3.1-flash-live-preview', voice: 'Aoede', instructions: 'Hi', tools: CoachPractice.tools, resumeHandle: 'h1');
      final setup = c.setupMessage()['setup'] as Map;
      expect(setup['model'], 'models/gemini-3.1-flash-live-preview');
      expect(setup['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'], 'Aoede');
      expect(setup['sessionResumption'], {'handle': 'h1'});
      expect((setup['tools'] as List).first['functionDeclarations'], hasLength(2));
      expect(setup.containsKey('inputAudioTranscription'), isTrue);
      expect(GeminiLiveClient.endpoint('abc').queryParameters['access_token'], 'abc');
      expect(GeminiLiveClient.endpoint('abc').path, contains('BidiGenerateContentConstrained'));
    });

    test('server content becomes events', () {
      final events = GeminiLiveClient.parseServerMessage({
        'serverContent': {
          'modelTurn': {
            'parts': [
              {'inlineData': {'data': 'AAEC', 'mimeType': 'audio/pcm;rate=24000'}},
            ],
          },
          'outputTranscription': {'text': 'Hello'},
          'inputTranscription': {'text': 'hi', 'finished': true},
          'turnComplete': true,
        },
        'toolCall': {
          'functionCalls': [
            {'id': 'c1', 'name': 'activate_phrase', 'args': {'index': 1}},
          ],
        },
        'sessionResumptionUpdate': {'newHandle': 'h2', 'resumable': true},
        'goAway': {'timeLeft': '10s'},
      });
      expect(events.whereType<LiveAudio>().single.pcm, [0, 1, 2]);
      expect(events.whereType<LiveTranscript>().map((e) => '${e.fromUser}:${e.text}:${e.finished}'), containsAll(['false:Hello:false', 'true:hi:true']));
      expect(events.whereType<LiveTurnComplete>(), hasLength(1));
      expect(events.whereType<LiveToolCall>().single.calls.single.id, 'c1');
      expect(events.whereType<LiveResumeHandle>().single.handle, 'h2');
      expect(events.whereType<LiveGoAway>(), hasLength(1));
    });

    test('usage maps to the backend shape with every field', () {
      final u = GeminiLiveClient.mapUsage({
        'promptTokenCount': 10,
        'responseTokenCount': 20,
        'totalTokenCount': 30,
        'promptTokensDetails': [
          {'modality': 'AUDIO', 'tokenCount': 7},
          {'modality': 'TEXT', 'tokenCount': 3},
        ],
        'responseTokensDetails': [
          {'modality': 'AUDIO', 'tokenCount': 20},
        ],
      });
      expect(u['total_tokens'], 30);
      expect(u['prompt_tokens_details'], {'text_tokens': 3, 'audio_tokens': 7, 'image_tokens': 0, 'video_tokens': 0});
      expect(u['response_tokens_details'], {'text_tokens': 0, 'audio_tokens': 20});
      expect(u['cached_tokens_details'], {'text_tokens': 0, 'audio_tokens': 0});
      final sum = GeminiLiveClient.addUsage(u, u);
      expect(sum['total_tokens'], 60);
      expect(sum['prompt_tokens_details']['audio_tokens'], 14);
    });
  });

  group('helpers', () {
    test('relative dates', () {
      final now = DateTime(2026, 10, 13, 12);
      expect(Fmt.ago(DateTime(2026, 10, 13, 8), now: now), 'today');
      expect(Fmt.ago(DateTime(2026, 10, 12), now: now), 'yesterday');
      expect(Fmt.ago(DateTime(2026, 10, 10), now: now), '3 days ago');
      expect(Fmt.ago(DateTime(2026, 10, 3), now: now), 'last week');
    });

    test('friendly errors never say credit', () {
      final msgs = [
        friendlyError(ApiException('AI_CREDIT_EXHAUSTED: AI features are paused')),
        friendlyError(ApiException('TIER_LIMIT_REACHED: "voice_minutes" limit reached (90)')),
        friendlyError(ApiException('TIER_LIMIT_REACHED: "save_words" limit reached (200)')),
        friendlyError(ApiException.network('x')),
      ];
      for (final m in msgs) {
        expect(m.toLowerCase(), isNot(contains('credit')));
      }
    });

    test('languages: names, codes, the old Arabic code', () {
      expect(AppLanguage.byName('Persian')!.rtl, isTrue);
      expect(AppLanguage.byName('fa')!.name, 'Persian');
      expect(AppLanguage.byName('ae')!.name, 'Arabic');
      expect(AppLanguage.byName('Turkish')!.rtl, isFalse);
      expect(AppLanguage.byName('Klingon'), isNull);
    });
  });
}
