import 'package:subturtle_api/subturtle_api.dart';
import 'package:test/test.dart';

import 'fake_server.dart';

const base = 'https://api.test';

Future<(SubturtleApi, FakeServer)> signedIn({String id = 'u1'}) async {
  final server = FakeServer();
  final token = fakeJwt(id);
  server.onPath('/verify/token', (c) => FakeServer.json({'status': 'success', 'user': {'id': id, 'email': 'a@b.c', 'type': 'user'}}));
  final api = SubturtleApi(baseUrl: base, httpClient: server.client, tokenStore: MemoryTokenStore(token));
  await api.auth.restore();
  return (api, server);
}

void main() {
  group('RestClient', () {
    test('joins base and path with one slash', () {
      final c = RestClient(baseUrl: 'https://x.test/');
      expect(c.url('/function/run').toString(), 'https://x.test/function/run');
      expect(c.url('verify/token').toString(), 'https://x.test/verify/token');
      expect(c.url('/a', {'q': '1'}).toString(), 'https://x.test/a?q=1');
    });

    test('sends the raw token in authorization (no Bearer)', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-board', []);
      await api.board.getBoard();
      final call = server.last('get-board');
      expect(call.headers['authorization'], fakeJwt('u1'));
      expect(call.headers['content-type'], startsWith('application/json'));
    });

    test('function errors become ApiException with code and feature', () async {
      final (api, server) = await signedIn();
      server.onFunction('createPhrase', {'status': 'error', 'message': 'TIER_LIMIT_REACHED: "save_words" limit reached (200)'}, status: 400);
      try {
        await api.bundles.createPhrase(phrase: 'had to', translation: 'باید', bundleIds: ['b1']);
        fail('should throw');
      } on ApiException catch (e) {
        expect(e.statusCode, 400);
        expect(e.isTierLimit, isTrue);
        expect(e.feature, 'save_words');
        expect(e.limit, 200);
        expect(e.isNotInPlan, isFalse);
      }
    });

    test('a 401 with a token calls onUnauthorized', () async {
      final (api, server) = await signedIn();
      ApiException? seen;
      api.client.onUnauthorized = (e) => seen = e;
      server.functions['get-pool'] = (_) => FakeServer.json('Unauthorized', status: 401);
      await expectLater(api.board.getPool(), throwsA(isA<ApiException>()));
      expect(seen?.statusCode, 401);
    });

    test('plain text error bodies are read', () async {
      final (api, server) = await signedIn();
      server.onPath('/data-provider/find', (_) => FakeServer.json('wrong query', status: 500));
      await expectLater(api.bundles.listBundles(), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'wrong query')));
    });
  });

  group('ApiException', () {
    test('parses codes', () {
      final e = ApiException('COACH_UNAVAILABLE: upstream_rate_limited', statusCode: 400);
      expect(e.code, 'COACH_UNAVAILABLE');
      expect(e.detail, 'upstream_rate_limited');
      final n = ApiException('TIER_LIMIT_REACHED: "voice_minutes" is not included in your plan');
      expect(n.isNotInPlan, isTrue);
      expect(n.feature, 'voice_minutes');
      expect(ApiException('Bundle not found').code, isNull);
    });
  });

  group('AuthService', () {
    test('password sign in posts to /user/login then verifies', () async {
      final server = FakeServer();
      final token = fakeJwt('u9');
      server.onPath('/user/login', (c) => FakeServer.json({'status': 'success', 'token': token}));
      server.onPath('/verify/token', (c) => FakeServer.json({'status': 'success', 'user': {'id': 'u9', 'email': 'a@b.c', 'type': 'user'}}));
      final store = MemoryTokenStore();
      final api = SubturtleApi(baseUrl: base, httpClient: server.client, tokenStore: store);
      final user = await api.auth.signInWithPassword(email: ' a@b.c ', password: 'pw');
      expect(user.id, 'u9');
      expect(server.calls.first.body, {'idType': 'email', 'id': 'a@b.c', 'password': 'pw'});
      expect(server.calls[1].body, {'token': token});
      expect(await store.read(), token);
      expect(api.auth.isSignedIn, isTrue);
    });

    test('google sign in sends the access token as a query', () async {
      final server = FakeServer();
      server.onPath('/auth/google/access-token-login', (c) => FakeServer.json({'status': 'success', 'token': fakeJwt('g1')}));
      server.onPath('/verify/token', (c) => FakeServer.json({'status': 'success', 'user': {'id': 'g1', 'type': 'user'}}));
      final api = SubturtleApi(baseUrl: base, httpClient: server.client);
      await api.auth.signInWithGoogleAccessToken('ya29.abc');
      expect(server.calls.first.method, 'GET');
      expect(server.calls.first.url.queryParameters['access_token'], 'ya29.abc');
    });

    test('a rejected saved token signs out', () async {
      final server = FakeServer();
      server.onPath('/verify/token', (c) => FakeServer.json({'status': 'error', 'e': 'invalid'}, status: 412));
      final store = MemoryTokenStore('bad');
      final api = SubturtleApi(baseUrl: base, httpClient: server.client, tokenStore: store);
      expect(await api.auth.restore(), isNull);
      expect(await store.read(), isNull);
    });

    test('offline at start keeps the saved token', () async {
      final api = SubturtleApi(baseUrl: 'http://127.0.0.1:1', tokenStore: MemoryTokenStore(fakeJwt('off')));
      final user = await api.auth.restore();
      expect(user?.id, 'off');
      api.client.close();
    });

    test('code sign up runs register, validate, submit, login', () async {
      final server = FakeServer();
      server.onPath('/user/register_id', (c) => FakeServer.json({'status': 'success'}));
      server.onPath('/user/validateCode', (c) => FakeServer.json({'status': 'success', 'isValid': true}));
      server.onPath('/user/submit_password', (c) => FakeServer.json({'status': 'success'}));
      server.onPath('/user/login', (c) => FakeServer.json({'status': 'success', 'token': fakeJwt('n1')}));
      server.onPath('/verify/token', (c) => FakeServer.json({'status': 'success', 'user': {'id': 'n1', 'type': 'user'}}));
      final api = SubturtleApi(baseUrl: base, httpClient: server.client);
      await api.auth.registerEmail('new@b.c');
      expect(await api.auth.validateCode(email: 'new@b.c', code: '123456'), isTrue);
      await api.auth.submitPassword(email: 'new@b.c', code: '123456', password: 'secret1');
      expect(server.calls.map((c) => c.url.path), ['/user/register_id', '/user/validateCode', '/user/submit_password', '/user/login', '/verify/token']);
      expect(api.auth.user?.id, 'n1');
    });

    test('reads the user id from a JWT', () {
      expect(AuthService.userIdFromToken(fakeJwt('abc')), 'abc');
      expect(AuthService.userIdFromToken('nope'), isNull);
    });
  });

  group('repositories', () {
    test('every function call carries the signed-in user id', () async {
      final (api, server) = await signedIn(id: 'me');
      server.onFunction('get-review-session', []);
      server.onFunction('submit-review', {'success': true});
      server.onFunction('get-pool', []);
      server.onFunction('complete-pool-session', {'success': true});
      await api.review.getDueSession();
      await api.review.submit('p1', learned: true);
      await api.board.getPool();
      await api.board.completePoolSession(['p1', 'p2']);
      expect(server.last('get-review-session').args, {'userId': 'me', 'limit': 20});
      expect(server.last('submit-review').args, {'userId': 'me', 'phraseId': 'p1', 'isCorrect': true});
      expect(server.last('complete-pool-session').args['phraseIds'], ['p1', 'p2']);
    });

    test('review items parse, including fields under _doc', () async {
      final (api, server) = await signedIn();
      server.onFunction('get-review-session', [
        {
          '_doc': {'phraseId': 'p1', 'boxLevel': 3, 'nextReviewDate': '2026-10-13T00:00:00.000Z'},
          'phrase': {
            '_id': 'p1',
            'phrase': 'had to',
            'translation': 'مجبور بودن',
            'direction': {'source': 'ltr', 'target': 'rtl'},
            'chunks': [
              {'text': 'had to', 'type': 'collocation', 'confidence': 0.9},
            ],
            'linguistic_data': {'type': 'phrase', 'definition': 'needed to', 'phonetic': {'transliteration': 'hed tu'}, 'formality_level': 'informal'},
          },
          'confirmed_chunk': 'had to',
          'source_sentence': 'I had to go.',
        },
      ]);
      final items = await api.review.getDueSession();
      expect(items.single.boxLevel, 3);
      expect(items.single.phrase.translationIsRtl, isTrue);
      expect(items.single.phrase.linguistic?.transliteration, 'hed tu');
      expect(items.single.confirmedChunk, 'had to');
    });

    test('bundles are listed newest first with the owner query', () async {
      final (api, server) = await signedIn(id: 'me');
      server.onPath('/data-provider/find', (c) => FakeServer.json({
            'data': [
              {'_id': 'b1', 'title': 'Stranger Things S2', 'phrases': ['p1', 'p2']},
            ],
          }));
      final list = await api.bundles.listBundles(search: 'stranger');
      expect(list.single.phraseCount, 2);
      final body = server.calls.last.body as Map;
      expect(body['database'], 'user_content');
      expect(body['collection'], 'phrase_bundle');
      expect(body['query']['refId'], 'me');
      expect(body['query']['title'][r'$options'], 'i');
      expect(body['options']['sort'], {'_id': -1});
    });

    test('phrases keep the requested order and skip empty id lists', () async {
      final (api, server) = await signedIn();
      server.onPath('/data-provider/findByIds', (c) => FakeServer.json({
            'data': [
              {'_id': 'b', 'phrase': 'B', 'translation': ''},
              {'_id': 'a', 'phrase': 'A', 'translation': ''},
            ],
          }));
      final phrases = await api.bundles.getPhrases(['a', 'b']);
      expect(phrases.map((p) => p.phrase), ['A', 'B']);
      final before = server.calls.length;
      expect(await api.bundles.getPhrases([]), isEmpty);
      expect(server.calls.length, before);
    });

    test('createPhrase sends a linguistic phrase when there is detail', () async {
      final (api, server) = await signedIn(id: 'me');
      server.onFunction('createPhrase', {'_id': 'p9', 'phrase': 'get out of', 'translation': 'بیرون رفتن'});
      final detail = DetailedTranslation.fromJson({
        'translation': {'phrase': 'بیرون رفتن'},
        'direction': {'source': 'ltr', 'target': 'rtl'},
        'language_info': {'source': 'en', 'target': 'fa'},
        'chunks': [],
        'linguistic_data': {'isValid': true, 'type': 'phrasal verb', 'definition': 'leave', 'phonetic': {'transliteration': ''}, 'formality_level': 'informal'},
      });
      final p = await api.bundles.createPhrase(phrase: 'get out of', translation: detail.translation, bundleIds: ['b1'], translationLanguage: 'Persian', context: 'I had to get out of there.', detail: detail);
      expect(p.id, 'p9');
      final args = server.last('createPhrase').args;
      expect(args['type'], 'linguistic');
      expect(args['refId'], 'me');
      expect(args['direction'], {'source': 'ltr', 'target': 'rtl'});
      expect(args['context'], 'I had to get out of there.');
      expect(args['linguistic_data']['formality_level'], 'informal');
    });

    test('translation advice sends the chat history and reads the reply', () async {
      final (api, server) = await signedIn(id: 'me');
      server.onFunction('translationAdvice', {'reply': '  It is informal.  '});
      final reply = await api.translation.advise(
        phrase: 'get out of',
        context: 'I had to get out of there.',
        message: 'Is it formal?',
        history: const [('user', 'I had to get out of there.'), ('assistant', 'Which part?')],
        targetLanguage: 'Persian',
      );
      expect(reply, 'It is informal.');
      final args = server.last('translationAdvice').args;
      expect(args['message'], 'Is it formal?');
      expect(args['history'], [
        {'role': 'user', 'text': 'I had to get out of there.'},
        {'role': 'assistant', 'text': 'Which part?'},
      ]);
      expect(args['targetLanguage'], 'Persian');

      // The tutor may answer with chunk edits only; that is "no reply".
      server.onFunction('translationAdvice', {'chunks': []});
      expect(await api.translation.advise(phrase: 'x', context: 'x', message: 'highlight x'), '');
    });

    test('subscription: free and paid voice maths', () async {
      final free = SubscriptionDetails.fromJson({
        'is_freemium': true,
        'tier': 'starter',
        'voice_minutes_total': 5,
        'voice_minutes_used': 2,
        'allowed_save_words': 200,
        'allowed_save_words_used': 48,
        'allowed_text_chats': 5,
        'allowed_text_chats_used': 1,
        'end_date': '2026-11-01T00:00:00.000Z',
      });
      expect(free.voiceRemaining, 3);
      expect(free.saveWords.remaining, 152);
      expect(free.tierName, 'Starter');
      expect(free.hasSessionHistory, isFalse);

      final paid = SubscriptionDetails.fromJson({
        'is_freemium': false,
        'tier': 'learner',
        'label': 'Learner',
        'voice_minutes_total': 120, // top-ups raise this, so it is not the base
        'voice_minutes_used': 72,
        'active_top_ups': [
          {'pack_size': 30, 'minutes_remaining': 30, 'expires_at': '2099-01-01T00:00:00.000Z'},
        ],
        'entitlements': {'voiceMinutesGranted': 90, 'saveWordsCap': null, 'textChatCap': null, 'sessionHistory': true},
      });
      expect(paid.voiceBase, 90);
      expect(paid.voiceRemaining, 18 + 30);
      expect(paid.voiceTotal, 120);
      expect(paid.saveWords.unlimited, isTrue);
      expect(paid.textChats.unlimited, isTrue);
      expect(paid.hasSessionHistory, isTrue);
    });

    test('text chat: create, turn with tool calls, final text', () async {
      final (api, server) = await signedIn();
      server.onFunction('create-text-session', {'sessionId': 's1', 'model': 'gemini-3.1-flash-lite'});
      final id = await api.textChat.create(instructions: 'x', tools: CoachPractice.tools);
      expect(id, 's1');
      final decl = server.last('create-text-session').args['toolDeclarations'] as List;
      expect(decl.first, isNot(contains('parameters')), reason: 'no-arg tools must omit parameters');

      server.onFunction('text-turn', {
        'done': false,
        'functionCalls': [
          {'id': 'c1', 'name': 'activate_phrase', 'args': {'index': 2}},
        ],
      });
      final r1 = await api.textChat.sendUser('s1', 'hi');
      expect(r1.done, isFalse);
      expect(r1.toolCalls.single.args['index'], 2);
      expect(server.last('text-turn').args['input'], {'kind': 'user', 'text': 'hi'});

      server.onFunction('text-turn', {'done': true, 'text': 'Great!', 'wrap_up_warning': true});
      final r2 = await api.textChat.sendToolResults('s1', [
        {'id': 'c1', 'name': 'activate_phrase', 'output': {'success': true}},
      ]);
      expect(r2.text, 'Great!');
      expect(r2.wrapUpWarning, isTrue);
    });

    test('voice: token, record and debit', () async {
      final (api, server) = await signedIn();
      server.onFunction('request-gemini-live-session-ephemeral-token', {
        'model': 'gemini-3.1-flash-live-preview',
        'voice': 'Aoede',
        'voice_session_max_seconds': 300,
        'client_secret': {'value': 'auth_tokens/abc', 'expires_at': 1900000000},
      });
      server.onFunction('create-live-session-record', {'_id': 'ls1'});
      server.onFunction('debit-voice-minutes', {'total': 5, 'used': 2, 'remaining': 3, 'scope': 'freemium'});
      final t = await api.liveSessions.requestGeminiToken(instructions: 'x', voice: 'Aoede', tools: CoachPractice.tools);
      expect(t.token, 'auth_tokens/abc');
      expect(t.maxSeconds, 300);
      expect(await api.liveSessions.createRecord(token: t, metadata: {'mode': 'voice'}), 'ls1');
      expect(server.last('create-live-session-record').args['session']['client_secret']['value'], 'auth_tokens/abc');
      final b = await api.liveSessions.debitVoice(61);
      expect(b.remaining, 3);
      expect(server.last('debit-voice-minutes').args['seconds'], 61);
    });

    test('session history parses voice and text items', () async {
      final page = CoachSessionPage.fromJson({
        'items': [
          {'_id': 'a', 'type': 'bundle-practice', 'provider': 'gemini', 'metadata': {'title': 'TED', 'mode': 'voice'}, 'dialogs': [], 'createdAt': '2026-10-12T10:00:00Z', 'updatedAt': '2026-10-12T10:08:00Z'},
          {'_id': 'b', 'session': {'modalities': ['TEXT']}, 'contents': [], 'metadata': {'title': 'BBC'}, 'dialogs': [{'id': 'u', 'content': 'hi', 'speaker': 'user'}]},
        ],
        'hasMore': false,
      });
      expect(page.items[0].isText, isFalse);
      expect(page.items[0].length.inMinutes, 8);
      expect(page.items[1].isText, isTrue);
      expect(page.items[1].dialogs.single.fromUser, isTrue);
    });
  });

  group('CoachPractice', () {
    final phrases = [
      const Phrase(id: '1', phrase: 'had to', translation: 'باید', translationLanguage: 'Persian'),
      const Phrase(id: '2', phrase: 'get out of', translation: 'بیرون رفتن', translationLanguage: 'Persian'),
    ];

    test('builds the numbered prompt', () {
      final s = CoachPractice.instructions(phrases, 'Persian');
      expect(s, contains('1. had to: باید'));
      expect(s, contains('2. get out of: بیرون رفتن'));
      expect(s, isNot(contains('[nativeLanguage]')));
    });

    test('auto language uses the single bundle language', () {
      expect(CoachPractice.resolveNativeLanguage(null, phrases), startsWith('Persian'));
      expect(CoachPractice.resolveNativeLanguage('Turkish', phrases), 'Turkish');
    });

    test('activate_phrase by index or text', () {
      var active = -1;
      var finished = false;
      final out = CoachPractice.runTool(const CoachToolCall(name: 'activate_phrase', args: {'phrase': 'GET OUT'}), phrases, onActivate: (i) => active = i, onFinish: () => finished = true);
      expect(active, 1);
      expect(out['success'], isTrue);
      expect(CoachPractice.runTool(const CoachToolCall(name: 'activate_phrase', args: {'index': 9}), phrases, onActivate: (_) {}, onFinish: () {})['success'], isFalse);
      CoachPractice.runTool(const CoachToolCall(name: 'finish_practice'), phrases, onActivate: (_) {}, onFinish: () => finished = true);
      expect(finished, isTrue);
    });
  });
}
