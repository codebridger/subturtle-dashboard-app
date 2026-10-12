import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle/features/live_session/text_chat_controller.dart';
import 'package:subturtle_api/subturtle_api.dart';

import 'fake_backend.dart';

void main() {
  group('TextChatController', () {
    late FakeBackend backend;
    late SubturtleApi api;
    const phrases = [Phrase(id: '1', phrase: 'had to', translation: 'باید'), Phrase(id: '2', phrase: 'get out of', translation: 'بیرون رفتن')];

    setUp(() async {
      backend = FakeBackend()..seedDefaults();
      api = SubturtleApi(baseUrl: 'https://api.test', httpClient: backend.client, tokenStore: MemoryTokenStore('h.eyJpZCI6InUxIn0.s'));
      await api.auth.restore();
      backend.functions['create-text-session'] = (_) => {'sessionId': 's1'};
    });

    TextChatController make({int? cap}) => TextChatController(repo: api.textChat, phrases: phrases, instructions: 'x', metadata: const {'mode': 'text'}, messageCap: cap);

    test('welcome, tool call, then the coach reply', () async {
      var turn = 0;
      backend.functions['text-turn'] = (args) {
        turn++;
        final input = args['input'] as Map;
        if (input['kind'] == 'system') return {'done': true, 'text': 'Hello! Pick a phrase.'};
        if (input['kind'] == 'user') {
          return {
            'done': false,
            'functionCalls': [
              {'id': 'c1', 'name': 'activate_phrase', 'args': {'index': 2}},
            ],
          };
        }
        expect(input['kind'], 'toolResults');
        expect((input['results'] as List).single['output']['phrase'], 'get out of');
        return {'done': true, 'text': 'Great, let us practise get out of.', 'wrap_up_warning': false};
      };
      final chat = make();
      await chat.start();
      expect(chat.messages.single.text, 'Hello! Pick a phrase.');
      await chat.send('Can we do number 2?');
      expect(turn, 3);
      expect(chat.active, 1);
      expect(chat.messages.last.text, contains('get out of'));
      expect(chat.status, TextChatStatus.ready);
    });

    test('a send error marks the message, retry sends it again', () async {
      var fail = true;
      backend.functions['text-turn'] = (args) {
        if ((args['input'] as Map)['kind'] == 'system') return {'done': true, 'text': 'Hi'};
        if (fail) throw ApiException('COACH_UNAVAILABLE: upstream_rate_limited');
        return {'done': true, 'text': 'Back!'};
      };
      final chat = make();
      await chat.start();
      await chat.send('hello');
      expect(chat.messages.last.failed, isTrue);
      fail = false;
      await chat.retry(chat.messages.firstWhere((m) => m.fromUser));
      expect(chat.messages.last.text, 'Back!');
    });

    test('the per-chat cap turns the composer off', () async {
      backend.functions['text-turn'] = (args) {
        if ((args['input'] as Map)['kind'] == 'system') return {'done': true, 'text': 'Hi'};
        throw ApiException('TIER_LIMIT_REACHED: "text_chat_messages_per_chat" limit reached (20)');
      };
      final chat = make(cap: 20);
      await chat.start();
      await chat.send('one more');
      expect(chat.capReached, isTrue);
      expect(chat.messages.where((m) => m.fromUser), isEmpty);
    });

    test('a chat-count limit is an error state', () async {
      backend.functions['create-text-session'] = (_) => throw ApiException('TIER_LIMIT_REACHED: "text_chat_count" limit reached (5)');
      final chat = make();
      await chat.start();
      expect(chat.status, TextChatStatus.error);
    });
  });

  testWidgets('Capture: paste, tap words, save to a bundle', (tester) async {
    final backend = await pumpApp(tester, seed: (b) {
      b.functions['translateWithContext'] = (args) => {
            'translation': {'phrase': 'بیرون رفتن'},
            'direction': {'source': 'ltr', 'target': 'rtl'},
            'language_info': {'source': 'en', 'target': 'fa'},
            'chunks': [],
            'linguistic_data': {'isValid': true, 'type': 'phrasal verb', 'definition': 'leave', 'phonetic': {'transliteration': ''}, 'formality_level': 'informal'},
          };
      b.functions['createPhrase'] = (args) => {'_id': 'p9', 'phrase': args['phrase'], 'translation': args['translation']};
    });
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Save a phrase'));
    await tester.settle();
    expect(find.text('Paste or type a sentence'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'I had to get out of there before it got worse.');
    await tester.settle();
    await tester.tap(find.text('Next'));
    await tester.settle();
    expect(find.text('Tap at least one word'), findsOneWidget);
    await tester.tap(find.text('get'));
    await tester.tap(find.text('of'));
    await tester.settle(const Duration(milliseconds: 200), 10);
    expect(find.text('get out of'), findsOneWidget);
    expect(find.text('بیرون رفتن'), findsOneWidget);
    await tester.tap(find.text('Save to Stranger Things S2'));
    await tester.settle(const Duration(milliseconds: 200), 10);
    final create = backend.calls.lastWhere((c) => c.$1 == 'createPhrase').$2;
    expect(create['phrase'], 'get out of');
    expect(create['type'], 'linguistic');
    expect(create['bundleIds'], ['b1']);
    expect(create['translation_language'], 'Persian');
    expect(create['context'], 'I had to get out of there before it got worse.');
  });

  testWidgets('Pool: reveal, next, done moves words to review', (tester) async {
    final backend = await pumpApp(tester, seed: (b) {
      b.functions['get-board'] = (_) => [];
      b.functions['get-pool'] = (_) => [
            {'phraseId': 'n1', 'phrase': {'_id': 'n1', 'phrase': 'no wonder', 'translation': 'جای تعجب نیست'}},
          ];
      b.functions['complete-pool-session'] = (_) => {'success': true};
    });
    await tester.settle();
    expect(find.text('1 new word to meet'), findsOneWidget);
    await tester.tap(find.text('Start').first);
    await tester.settle();
    expect(find.text('no wonder'), findsOneWidget);
    await tester.tap(find.text('Reveal'));
    await tester.settle();
    expect(find.text('جای تعجب نیست'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.settle();
    expect(backend.calls.lastWhere((c) => c.$1 == 'complete-pool-session').$2['phraseIds'], ['n1']);
    expect(textContaining('now in your review box'), findsOneWidget);
  });
}
