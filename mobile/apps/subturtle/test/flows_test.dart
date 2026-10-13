import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle/app/router.dart';
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

  testWidgets('Save assistant: send, pick a phrase, save, undo, ask, then history', (tester) async {
    const sentence = 'I had to get out of there before it got worse.';
    final backend = await pumpApp(tester, seed: (b) {
      b.functions['translateWithContext'] = (args) {
        final phrase = args['phrase'] as String;
        return {
          'translation': {'phrase': {'had to': 'مجبور بودن', 'get out of': 'بیرون رفتن'}[phrase] ?? 'جمله'},
          'direction': {'source': 'ltr', 'target': 'rtl'},
          'language_info': {'source': 'en', 'target': 'fa'},
          // The whole sentence comes back with its phrases.
          'chunks': phrase == sentence
              ? [
                  {'text': 'get out of', 'type': 'phrasal_verb'},
                  {'text': 'had to', 'type': 'collocation'},
                ]
              : [],
          'linguistic_data': {'isValid': true, 'type': 'phrasal verb', 'definition': 'To leave a place.', 'phonetic': {'transliteration': 'get owt uv'}, 'formality_level': 'informal'},
        };
      };
      b.functions['createPhrase'] = (args) => {'_id': 'p9', 'phrase': args['phrase'], 'translation': args['translation']};
      b.functions['removePhrase'] = (_) => {'success': true};
      b.functions['translationAdvice'] = (_) => {'reply': 'It is informal but very common.'};
    });
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Save a phrase'));
    await tester.settle();
    expect(find.text('What do you want to learn?'), findsOneWidget);
    expect(find.text('OR TRY ONE'), findsOneWidget, reason: 'no history yet');
    expect(find.text('Ask, or paste a new sentence…'), findsNothing, reason: 'no input bar before the first message');

    await tester.enterText(find.byType(TextField).first, sentence);
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Send'));
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(find.text('Which part do you want to learn?'), findsOneWidget);
    // Chips come in sentence order; the first one is picked and translated.
    expect(find.bySemanticsLabel('had to'), findsOneWidget);
    expect(find.text('مجبور بودن'), findsOneWidget);
    expect(find.text('Ask, or paste a new sentence…'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('get out of'));
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(find.text('بیرون رفتن'), findsOneWidget);
    expect(find.text('Say it: get owt uv'), findsOneWidget);

    await tester.tap(find.text('Save to Stranger Things S2'));
    await tester.settle(const Duration(milliseconds: 100), 15);
    final create = backend.calls.lastWhere((c) => c.$1 == 'createPhrase').$2;
    expect(create['phrase'], 'get out of');
    expect(create['type'], 'linguistic');
    expect(create['bundleIds'], ['b1']);
    expect(create['translation_language'], 'Persian');
    expect(create['context'], sentence);
    expect(find.text('Saved to Stranger Things S2'), findsOneWidget);
    expect(textContaining('Want to save "had to" too?'), findsOneWidget);

    await tester.tap(find.text('Undo'));
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(backend.calls.lastWhere((c) => c.$1 == 'removePhrase').$2['phraseId'], 'p9');
    expect(find.text('Save to Stranger Things S2'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Is it formal?'));
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(backend.calls.lastWhere((c) => c.$1 == 'translationAdvice').$2['phrase'], 'get out of');
    expect(find.text('It is informal but very common.'), findsOneWidget);

    // Back on the prompt, the chat is in Recent and in Save history.
    await tester.tap(find.bySemanticsLabel('Close'));
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Save a phrase'));
    await tester.settle();
    expect(find.text('RECENT'), findsOneWidget);
    expect(textContaining('Asked only'), findsOneWidget, reason: 'the save was undone');

    await tester.tap(find.bySemanticsLabel('Save history'));
    await tester.settle();
    expect(find.text('1 session · 0 phrases saved'), findsOneWidget);
    expect(find.text('TODAY'), findsWidgets);
    await tester.enterText(find.byType(TextField).first, 'elephant');
    await tester.settle();
    expect(find.text('Nothing found'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'worse');
    await tester.settle();
    await tester.tap(textContaining('I had to get out of there').first);
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(find.text('It is informal but very common.'), findsOneWidget, reason: 'the chat reopens where it was');
  });

  testWidgets('Save assistant: shared text opens straight in the chat', (tester) async {
    final backend = await pumpApp(tester, seed: (b) {
      b.functions['translateWithContext'] = (args) => {
            'translation': {'phrase': 'جای تعجب نیست'},
            'direction': {'source': 'ltr', 'target': 'rtl'},
            'chunks': [],
          };
    });
    await tester.settle();
    final container = ProviderScope.containerOf(tester.element(find.byType(Scaffold).first));
    container.read(routerProvider).go('/capture?text=no%20wonder');
    await tester.settle(const Duration(milliseconds: 100), 15);
    expect(find.text('no wonder'), findsWidgets, reason: 'the shared text is the first message');
    expect(find.text('جای تعجب نیست'), findsOneWidget);
    expect(find.text('Ask, or paste a new sentence…'), findsOneWidget);
    // Two words: no need to look for phrases inside it, one translation call.
    expect(backend.called('translateWithContext'), hasLength(1));
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
