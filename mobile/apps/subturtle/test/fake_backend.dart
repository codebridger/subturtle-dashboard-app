import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle/app/app.dart';
import 'package:subturtle/app/providers.dart';
import 'package:subturtle_api/subturtle_api.dart';

/// A fake Subturtle backend for widget tests. No network, no real account.
class FakeBackend {
  final calls = <(String, Map<String, dynamic>)>[];
  final Map<String, Object? Function(Map<String, dynamic> args)> functions = {};
  final Map<String, Object? Function(Map<String, dynamic> body)> paths = {};
  bool signedIn = true;

  List<String> called(String fn) => [for (final c in calls) if (c.$1 == fn) fn];

  late final http.Client client = MockClient((req) async {
    final body = req.body.isEmpty ? <String, dynamic>{} : Map<String, dynamic>.from(jsonDecode(req.body) as Map);
    if (req.url.path == '/verify/token') {
      return signedIn ? _json({'status': 'success', 'user': {'id': 'u1', 'email': 'sara@example.com', 'type': 'user'}}) : _json({'status': 'error'}, 412);
    }
    if (req.url.path == '/function/run') {
      final name = body['name'] as String;
      final args = Map<String, dynamic>.from((body['args'] ?? {}) as Map);
      calls.add((name, args));
      final h = functions[name];
      if (h == null) return _json({'status': 'error', 'message': 'Function $name not found'}, 400);
      try {
        return _json({'status': 'success', 'data': h(args)});
      } on ApiException catch (e) {
        return _json({'status': 'error', 'message': e.message}, 400);
      }
    }
    calls.add((req.url.path, body));
    final h = paths[req.url.path];
    if (h == null) return _json({'data': []});
    return _json({'data': h(body)});
  });

  static http.Response _json(Object? b, [int status = 200]) => http.Response(jsonEncode(b), status, headers: {'content-type': 'application/json'});

  /// A reasonable signed-in Starter user with one bundle and two due cards.
  void seedDefaults() {
    functions['getSubscriptionDetails'] = (_) => {
          'is_freemium': true,
          'tier': 'starter',
          'voice_minutes_total': 5,
          'voice_minutes_used': 0,
          'allowed_save_words': 200,
          'allowed_save_words_used': 12,
          'allowed_text_chats': 5,
          'allowed_text_chats_used': 0,
          'end_date': '2026-11-01T00:00:00.000Z',
        };
    functions['get-board'] = (_) => [
          {'_id': 'a1', 'type': 'leitner_review', 'state': 'toasted', 'persistent': true, 'meta': {'dueCount': 2, 'isActive': true}},
        ];
    functions['get-pool'] = (_) => [];
    functions['consume-activity'] = (_) => {'success': true};
    functions['get-stats'] = (_) => {'settings': {'dailyLimit': 20, 'reviewHour': 9}, 'distribution': {'1': 2, '5': 4}, 'totalItems': 6};
    functions['get-phrase-management-info'] = (_) => {'phraseToBoxMap': {'p1': 1, 'p2': 3}, 'duePhraseIds': ['p1', 'p2'], 'bundles': []};
    functions['get-review-session'] = (_) => [
          {
            'phraseId': 'p1',
            'boxLevel': 1,
            'phrase': {'_id': 'p1', 'phrase': 'figure out', 'translation': 'فهمیدن', 'context': 'We need to figure out what happened.'},
          },
          {
            'phraseId': 'p2',
            'boxLevel': 2,
            'phrase': {'_id': 'p2', 'phrase': 'get out of', 'translation': 'بیرون رفتن', 'context': 'I had to get out of there.'},
          },
        ];
    functions['submit-review'] = (_) => {'success': true};
    functions['generateChartDataForInsertionRatio'] = (_) => throw ApiException('TIER_LIMIT_REACHED: "weekly_insights" is not included in your plan');
    paths['/data-provider/find'] = (body) => body['collection'] == 'phrase_bundle'
        ? [
            {'_id': 'b1', 'title': 'Stranger Things S2', 'phrases': ['p1', 'p2'], 'updatedAt': '2026-10-12T10:00:00.000Z'},
          ]
        : [
            {'_id': 'p2', 'phrase': 'get out of', 'translation': 'بیرون رفتن', 'translation_language': 'Persian'},
          ];
    paths['/data-provider/find-one'] = (body) => body['collection'] == 'profile' ? {'_id': 'pr', 'refId': 'u1', 'name': 'Sara Ahmadi'} : null;
  }
}

/// Pumps the whole app with the fake backend.
Future<FakeBackend> pumpApp(WidgetTester tester, {bool signedIn = true, void Function(FakeBackend b)? seed, Size size = const Size(390, 844)}) async {
  final backend = FakeBackend()..signedIn = signedIn;
  backend.seedDefaults();
  seed?.call(backend);
  SharedPreferences.setMockInitialValues({'language': 'Persian', 'haptics': false});
  final prefs = await SharedPreferences.getInstance();
  final api = SubturtleApi(baseUrl: 'https://api.test', httpClient: backend.client, tokenStore: MemoryTokenStore(signedIn ? 'header.eyJpZCI6InUxIn0.sig' : null));
  final container = ProviderContainer(overrides: [apiProvider.overrideWithValue(api), prefsProvider.overrideWithValue(prefs)], retry: (_, _) => null);
  addTearDown(container.dispose);
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await container.read(authProvider.notifier).restore();
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SubturtleApp()));
  await tester.pumpAndSettle();
  return backend;
}

extension Settle on WidgetTester {
  /// pumpAndSettle that tolerates endless animations (skeleton pulse).
  Future<void> settle([Duration step = const Duration(milliseconds: 100), int max = 30]) async {
    for (var i = 0; i < max; i++) {
      await pump(step);
    }
  }
}

Finder textContaining(String s) => find.byWidgetPredicate((w) => w is Text && (w.data ?? w.textSpan?.toPlainText() ?? '').contains(s));

Widget wrap(Widget w) => MaterialApp(home: w);
