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

  group('Save assistant on the server', () {
    const sentence = 'I had to get out of there before it got worse.';
    Map<String, dynamic> card(String text) => {
          'translation': {'phrase': {'get out of': 'بیرون رفتن', 'had to': 'مجبور بودن'}[text] ?? 'جمله'},
          'direction': {'source': 'ltr', 'target': 'rtl'},
          'chunks': [],
          'linguistic_data': {'type': 'phrasal verb', 'definition': 'To leave.', 'phonetic': {'transliteration': ''}, 'formality_level': 'informal'},
        };

    void seedServer(FakeBackend b) {
      b.functions['createSaveSession'] = (args) => {
            'sessionId': 's1',
            'candidates': [
              {'text': args['message'], 'type': 'full'},
              {'text': 'get out of', 'type': 'phrasal_verb'},
              {'text': 'had to', 'type': 'collocation'},
            ],
            'translation': card(args['message'] as String),
            'messageId': 'm2',
          };
      b.functions['saveSessionTurn'] = (args) => args.containsKey('pick')
          ? {'translation': card(args['pick'] as String), 'messageId': 'm4', 'cached': false, 'wrapUp': false}
          : {'reply': 'It is informal.', 'messageId': 'm6', 'wrapUp': true};
      b.functions['attachSavedPhrase'] = (_) => {'attached': true, 'messageId': 'm7', 'savedCount': 1};
      b.functions['createPhrase'] = (args) => {'_id': 'p9', 'phrase': args['phrase'], 'translation': args['translation']};
      b.functions['listSaveSessions'] = (_) => [];
    }

    Future<void> send(WidgetTester tester, String text) async {
      await tester.tap(find.bySemanticsLabel('Save a phrase'));
      await tester.settle();
      await tester.enterText(find.byType(TextField).first, text);
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('Send'));
      await tester.settle(const Duration(milliseconds: 100), 15);
    }

    testWidgets('the chat runs on save_assistant functions, not the translation ones', (tester) async {
      final backend = await pumpApp(tester, saveAssistantBackend: true, seed: seedServer);
      await tester.settle();
      await send(tester, sentence);

      expect(backend.calls.lastWhere((c) => c.$1 == 'createSaveSession').$2, {'userId': 'u1', 'message': sentence, 'targetLanguage': 'Persian', 'source': {'kind': 'typed'}});
      // Chips in sentence order, without the whole sentence; the first is picked.
      expect(backend.calls.lastWhere((c) => c.$1 == 'saveSessionTurn').$2['pick'], 'had to');
      expect(find.text('مجبور بودن'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel('get out of'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      await tester.tap(find.text('Save to Stranger Things S2'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(backend.calls.lastWhere((c) => c.$1 == 'attachSavedPhrase').$2, {'userId': 'u1', 'sessionId': 's1', 'phraseId': 'p9', 'bundleId': 'b1'});

      await tester.tap(find.bySemanticsLabel('Is it formal?'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(backend.calls.lastWhere((c) => c.$1 == 'saveSessionTurn').$2, {'userId': 'u1', 'sessionId': 's1', 'message': 'Is "get out of" formal?'});
      expect(find.text('It is informal.'), findsOneWidget);
      expect(textContaining('This chat is almost full'), findsOneWidget, reason: 'wrapUp came back true');

      expect(backend.called('translateWithContext'), isEmpty);
      expect(backend.called('translationAdvice'), isEmpty);
    });

    testWidgets('SAVE_ASSISTANT_UNAVAILABLE on start offers Try again', (tester) async {
      var fail = true;
      final backend = await pumpApp(tester, saveAssistantBackend: true, seed: (b) {
        seedServer(b);
        final create = b.functions['createSaveSession']!;
        b.functions['createSaveSession'] = (args) {
          if (fail) throw ApiException('SAVE_ASSISTANT_UNAVAILABLE: the assistant could not answer. Please try again.');
          return create(args);
        };
      });
      await tester.settle();
      await send(tester, sentence);
      expect(find.text("The assistant couldn't answer. Please try again."), findsOneWidget);
      fail = false;
      await tester.tap(find.text('Try again'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(find.text('مجبور بودن'), findsOneWidget);
      expect(backend.called('createSaveSession'), hasLength(2));
    });

    testWidgets('AI_CREDIT_EXHAUSTED shows the limit card with plans', (tester) async {
      await pumpApp(tester, saveAssistantBackend: true, seed: (b) {
        seedServer(b);
        b.functions['saveSessionTurn'] = (args) => args.containsKey('pick')
            ? {'translation': card(args['pick'] as String), 'messageId': 'm4', 'wrapUp': false}
            : throw ApiException("AI_CREDIT_EXHAUSTED: AI features are paused — this month's AI budget is used up.");
      });
      await tester.settle();
      await send(tester, sentence);
      await tester.tap(find.bySemanticsLabel('Is it formal?'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(find.text('The coach and translations are paused until your plan renews.'), findsOneWidget);
      expect(find.text('See plans'), findsNothing, reason: 'store builds have no purchase links');
    });

    testWidgets('TIER_LIMIT_REACHED (message cap) offers a new chat', (tester) async {
      await pumpApp(tester, saveAssistantBackend: true, seed: (b) {
        seedServer(b);
        b.functions['saveSessionTurn'] = (args) => args.containsKey('pick')
            ? {'translation': card(args['pick'] as String), 'messageId': 'm4', 'wrapUp': false}
            : throw ApiException('TIER_LIMIT_REACHED: "text_chat_messages_per_chat" limit reached (60)');
      });
      await tester.settle();
      await send(tester, sentence);
      await tester.tap(find.bySemanticsLabel('Is it formal?'));
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(find.text('This chat has reached its message limit. Start a new one.'), findsOneWidget);
      await tester.tap(find.text('New chat'));
      await tester.settle();
      expect(find.text('What do you want to learn?'), findsOneWidget);
    });

    testWidgets('history comes from the server and reopens a chat with getSaveSession', (tester) async {
      final backend = await pumpApp(tester, saveAssistantBackend: true, seed: (b) {
        seedServer(b);
        b.functions['listSaveSessions'] = (_) => [
              {'sessionId': 's1', 'title': 'I had to get out of there…', 'savedCount': 1, 'savedPhrases': ['get out of'], 'lastMessageAt': DateTime.now().toUtc().toIso8601String()},
            ];
        b.functions['getSaveSession'] = (_) => {
              'sessionId': 's1',
              'title': 'I had to get out of there…',
              'candidates': [
                {'text': sentence, 'type': 'full'},
                {'text': 'get out of', 'type': 'phrasal_verb'},
              ],
              'messages': [
                {'id': 'm1', 'role': 'user', 'kind': 'text', 'text': sentence},
                {'id': 'm2', 'role': 'assistant', 'kind': 'translation', 'text': sentence, 'payload': card(sentence)},
                {'id': 'm3', 'role': 'user', 'kind': 'text', 'text': 'get out of'},
                {'id': 'm4', 'role': 'assistant', 'kind': 'translation', 'text': 'get out of', 'payload': card('get out of')},
                {'id': 'm5', 'role': 'assistant', 'kind': 'saved', 'payload': {'phraseId': 'p9', 'phrase': 'get out of', 'bundleId': 'b1'}},
                {'id': 'm6', 'role': 'user', 'kind': 'text', 'text': 'Is it formal?'},
                {'id': 'm7', 'role': 'assistant', 'kind': 'text', 'text': 'It is informal.'},
              ],
            };
      });
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('Save a phrase'));
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('Save history'));
      await tester.settle();
      expect(find.text('1 session · 1 phrase saved'), findsOneWidget);
      await tester.tap(textContaining('I had to get out of there').first);
      await tester.settle(const Duration(milliseconds: 100), 15);
      expect(find.text(sentence), findsOneWidget, reason: 'the full first message, not the short title');
      expect(find.text('بیرون رفتن'), findsOneWidget, reason: 'the stored card, no new pick');
      expect(find.text('Saved to Stranger Things S2'), findsOneWidget);
      expect(find.text('It is informal.'), findsOneWidget);
      expect(find.text('get out of'), findsWidgets);
      expect(backend.called('saveSessionTurn'), isEmpty);
    });
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
