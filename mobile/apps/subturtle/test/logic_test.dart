import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle/features/capture/word_selection.dart';
import 'package:subturtle/features/live_session/gemini_live_client.dart';
import 'package:subturtle/features/review/review_logic.dart';
import 'package:subturtle/shared/format.dart';
import 'package:subturtle/shared/languages.dart';
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

  group('WordSelection', () {
    test('short shares start fully selected', () {
      final s = WordSelection.fromSentence('get out of');
      expect(s.phrase, 'get out of');
    });

    test('tap one, tap another = range; third tap restarts', () {
      var s = WordSelection.fromSentence('I had to get out of there before it got worse.');
      expect(s.isEmpty, isTrue);
      s = s.tap(3);
      expect(s.phrase, 'get');
      s = s.tap(5);
      expect(s.phrase, 'get out of');
      s = s.tap(1);
      expect(s.phrase, 'had');
    });

    test('tapping an end of a range shrinks it', () {
      var s = WordSelection.fromSentence('I had to get out of there before it got worse.').tap(3).tap(5);
      s = s.tap(5);
      expect(s.phrase, 'get out');
      s = s.tap(3);
      expect(s.phrase, 'out');
    });

    test('edge punctuation is trimmed', () {
      final s = WordSelection.fromSentence('before it got worse.').tap(2).tap(3);
      expect(s.phrase, 'got worse');
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
