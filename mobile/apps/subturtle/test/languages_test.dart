import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle/features/languages/language_ui.dart';
import 'package:subturtle/shared/languages.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import 'fake_backend.dart';
import 'fake_languages.dart';

/// Multilingual round 1 on the phone (M-01, M-03 to M-07, M-13 to M-15),
/// against the stateful fake of the server's `language` module.
/// Eyebrows render in capitals.
Finder eyebrow(String text) => find.text(text.toUpperCase());

void main() {
  Iterable<Map<String, dynamic>> argsOf(FakeBackend b, String fn) => b.calls.where((c) => c.$1 == fn).map((c) => c.$2);

  Future<void> openSwitcher(WidgetTester tester) async {
    await tester.tap(find.byType(StLanguagePill).first);
    await tester.settle();
  }

  group('a 1.x server (no language module)', () {
    testWidgets('Today has no pill and no first run; calls still work', (tester) async {
      final b = await pumpApp(tester);
      expect(find.text('Smart Review'), findsOneWidget);
      expect(find.byType(StLanguagePill), findsNothing);
      expect(find.text('What do you want to learn?'), findsNothing);
      // The English-only app sends the active language, which old servers ignore.
      expect(argsOf(b, 'get-board').last['language'], 'en');
    });
  });

  group('languages from the server (M-01)', () {
    testWidgets('the own language kept on the phone moves to the server once', (tester) async {
      final langs = FakeLanguageServer(translationLanguage: null);
      final b = await pumpApp(tester, languages: langs);
      expect(argsOf(b, 'set-translation-language').single['language'], 'fa', reason: 'prefs hold "Persian" from 1.x');
      expect(langs.translationLanguage, 'fa');
    });

    testWidgets('the pill shows the active language and where it started', (tester) async {
      await pumpApp(tester, languages: FakeLanguageServer(startLevels: {'en': 'B1', 'de': 'A1'}));
      expect(find.byType(StLanguagePill), findsOneWidget);
      expect(find.text('English'), findsWidgets);
      expect(textContaining('Starting at B1'), findsOneWidget);
      expect(eyebrow('Today · English'), findsOneWidget);
    });
  });

  group('switch language (M-03, M-04)', () {
    testWidgets('pick German: the server is told, Today reloads in German', (tester) async {
      final langs = FakeLanguageServer(startLevels: {'en': 'B1', 'de': 'A1'}, dueCounts: {'en': 12, 'de': 7}, phraseCounts: {'en': 142, 'de': 38});
      final b = await pumpApp(tester, languages: langs);
      await openSwitcher(tester);
      expect(find.text('Which language now?'), findsOneWidget);
      expect(find.text('Starting at A1 · 7 due · 38 phrases'), findsOneWidget);
      expect(find.text('2 of 10 used'), findsOneWidget);
      expect(find.text('You speak Persian'), findsOneWidget);

      await tester.tap(find.text('German · Deutsch'));
      await tester.settle();
      expect(argsOf(b, 'set-active-language').single['language'], 'de');
      expect(langs.active, 'de');
      expect(eyebrow('Today · German'), findsOneWidget);
      expect(argsOf(b, 'get-board').last['language'], 'de', reason: 'Today reloaded for German');
      final bundleQuery = b.calls.where((c) => c.$1 == '/data-provider/find' && c.$2['collection'] == 'phrase_bundle').last.$2['query'] as Map;
      expect(bundleQuery['language'], 'de');
    });

    testWidgets('Starter at its limit: a plan card, no add row, no swap', (tester) async {
      await pumpApp(tester, languages: FakeLanguageServer(plan: 'starter'));
      await openSwitcher(tester);
      expect(textContaining('Starter includes 1 language'), findsOneWidget);
      expect(find.text('See plans'), findsOneWidget);
      expect(find.text('Add a language'), findsNothing);
      expect(find.text('Manage'), findsNothing, reason: 'Starter never offers a swap');
    });

    testWidgets('Reader at 3 of 3: Upgrade or Manage', (tester) async {
      await pumpApp(tester, languages: FakeLanguageServer(plan: 'reader', startLevels: {'en': 'B1', 'de': 'A1', 'es': 'A1'}));
      await openSwitcher(tester);
      expect(textContaining('You use 3 of 3 languages on Reader'), findsOneWidget);
      expect(find.text('Upgrade'), findsOneWidget);
      expect(find.text('Manage'), findsOneWidget);
    });
  });

  group('add a language (M-05, M-14, M-06)', () {
    testWidgets('Start at A1 adds it with no level and opens the starter pack', (tester) async {
      final langs = FakeLanguageServer(startLevels: {'en': 'B1', 'de': 'A1'});
      final b = await pumpApp(tester, languages: langs);
      await openSwitcher(tester);
      await tester.tap(find.text('Add a language'));
      await tester.settle();
      expect(find.text('What do you want to learn?'), findsOneWidget);
      expect(find.text('German'), findsNothing, reason: 'languages the learner has are not offered');
      expect(find.text('Portuguese · Português'), findsOneWidget, reason: 'coming later');

      await tester.tap(find.text('Tell me'));
      await tester.settle();
      expect(langs.interests, {'pt'});
      expect(find.text('Got it'), findsOneWidget);

      await tester.tap(find.text('Spanish'));
      await tester.settle();
      await tester.tap(find.text('Next: Spanish'));
      await tester.settle();
      expect(find.text('Where should we start?'), findsOneWidget);
      await tester.tap(find.text('Start at A1').first);
      await tester.settle();
      await tester.tap(find.widgetWithText(StButton, 'Start at A1'));
      await tester.settle();

      final add = argsOf(b, 'add-language').single;
      expect(add['language'], 'es');
      expect(add.containsKey('startLevel'), isFalse, reason: 'no hand-picked level; the server defaults to A1');
      expect(langs.active, 'es');
      expect(find.text('Starter pack'), findsOneWidget);
      expect(find.text('Guten Morgen'), findsOneWidget);

      await tester.tap(find.text('Next chunk'));
      await tester.settle();
      expect(argsOf(b, 'complete-starter-pack-items').single['itemIds'], ['c0']);
      expect(find.text('1 of 4 chunks heard'), findsOneWidget);

      await tester.tap(find.text('Skip the starter pack for now'));
      await tester.settle();
      expect(argsOf(b, 'skip-starter-pack').single['language'], 'es');
      expect(eyebrow('Today · Spanish'), findsOneWidget);
    });

    testWidgets('the chat test sets "Starting at A2" and adds the language with it', (tester) async {
      final langs = FakeLanguageServer();
      final b = await pumpApp(tester, languages: langs);
      await openSwitcher(tester);
      await tester.tap(find.text('Add a language'));
      await tester.settle();
      await tester.tap(find.text('German'));
      await tester.settle();
      await tester.tap(find.text('Next: German'));
      await tester.settle();
      await tester.tap(find.text('Start the chat test'));
      await tester.settle();

      expect(find.text('German · chat test'), findsOneWidget);
      expect(find.text('Hallo! Wie heißt du?'), findsOneWidget);
      expect(find.text('سلام! اسمت چیه؟'), findsOneWidget, reason: 'help in the own language');
      expect(argsOf(b, 'add-language'), isEmpty, reason: 'nothing is added until the test ends');
      for (var i = 0; i < 6; i++) {
        await tester.enterText(find.byType(TextField), 'Antwort $i');
        await tester.tap(find.bySemanticsLabel('Send'));
        await tester.settle();
      }
      expect(find.text('Starting at A2'), findsOneWidget);
      expect(textContaining('a start point, not a grade'), findsOneWidget);

      await tester.tap(find.text('Go to German Today'));
      await tester.settle();
      final add = argsOf(b, 'add-language').single;
      expect(add['startLevel'], 'A2');
      expect(add['startLevelSource'], 'test');
      expect(argsOf(b, 'finish-level-test').single['accept'], isTrue);
      expect(langs.active, 'de');
      expect(eyebrow('Today · German'), findsOneWidget);
      expect(textContaining('Starting at A2'), findsOneWidget);
    });

    testWidgets('"Stop and start at A1" adds it at A1', (tester) async {
      final b = await pumpApp(tester, languages: FakeLanguageServer());
      await openSwitcher(tester);
      await tester.tap(find.text('Add a language'));
      await tester.settle();
      await tester.tap(find.text('French'));
      await tester.settle();
      await tester.tap(find.text('Next: French'));
      await tester.settle();
      await tester.tap(find.text('Start the chat test'));
      await tester.settle();
      await tester.tap(find.text('Stop and start at A1'));
      await tester.settle();
      final add = argsOf(b, 'add-language').single;
      expect(add['startLevel'], 'A1');
      expect(add['startLevelSource'], 'default');
      expect(argsOf(b, 'finish-level-test').single['accept'], isFalse);
    });

    testWidgets('the server refusing at the limit shows the plan card', (tester) async {
      final langs = FakeLanguageServer(plan: 'reader', startLevels: {'en': 'B1', 'de': 'A1'});
      await pumpApp(tester, languages: langs);
      await openSwitcher(tester);
      await tester.tap(find.text('Add a language'));
      await tester.settle();
      // Another device used the last slot meanwhile.
      langs.langs['it'] = FakeLanguageServer(startLevels: {'it': 'A1'}).langs['it']!;
      await tester.tap(find.text('Spanish'));
      await tester.settle();
      await tester.tap(find.text('Next: Spanish'));
      await tester.settle();
      await tester.tap(find.text('Start at A1').first);
      await tester.settle();
      await tester.tap(find.widgetWithText(StButton, 'Start at A1'));
      await tester.settle();
      expect(textContaining('You use 3 of 3 languages on Reader'), findsOneWidget);
    });

    testWidgets('kept phrases: the notice, and Spanish picked', (tester) async {
      await pumpApp(tester, languages: FakeLanguageServer(pending: {'es': 3}));
      await openSwitcher(tester);
      await tester.tap(find.text('Add a language'));
      await tester.settle();
      expect(find.text('3 phrases are waiting for Spanish. Add it and they join your Spanish.'), findsOneWidget);
      expect(find.text('Next: Spanish'), findsOneWidget);
    });
  });

  group('first run (L10)', () {
    testWidgets('a new account chooses a language; no close button; English offered', (tester) async {
      final langs = FakeLanguageServer(active: null);
      final b = await pumpApp(tester, languages: langs);
      expect(eyebrow('Welcome to Subturtle'), findsOneWidget);
      expect(find.bySemanticsLabel('Close and go back'), findsNothing);
      expect(find.text('English'), findsOneWidget);
      await tester.tap(find.text('Italian'));
      await tester.settle();
      await tester.tap(find.text('Next: Italian'));
      await tester.settle();
      await tester.tap(find.text('Start at A1').first);
      await tester.settle();
      await tester.tap(find.widgetWithText(StButton, 'Start at A1'));
      await tester.settle();
      expect(argsOf(b, 'add-language').single['language'], 'it');
      expect(find.text('Starter pack'), findsOneWidget);
    });

    testWidgets('a server error on the first run offers Sign out, never a trap', (tester) async {
      final langs = FakeLanguageServer(active: null)..failures['add-language'] = 'Something went wrong';
      await pumpApp(tester, languages: langs);
      await tester.tap(find.text('German'));
      await tester.settle();
      await tester.tap(find.text('Next: German'));
      await tester.settle();
      await tester.tap(find.text('Start at A1').first);
      await tester.settle();
      await tester.tap(find.widgetWithText(StButton, 'Start at A1'));
      await tester.settle();
      expect(find.text("We couldn't add the language."), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  group('Languages and Manage (M-07)', () {
    testWidgets('cards, "not yet", kept phrases; remove asks first and keeps 30 days', (tester) async {
      final langs = FakeLanguageServer(startLevels: {'en': 'B1', 'de': 'A1'}, pending: {'es': 3});
      final b = await pumpApp(tester, languages: langs);
      await openSwitcher(tester);
      await tester.tap(find.text('Manage languages'));
      await tester.settle();
      expect(find.text('Languages'), findsOneWidget);
      expect(find.text('Map: not yet'), findsWidgets);
      expect(find.text('Starter pack: not yet'), findsOneWidget, reason: 'English has no starter pack');
      expect(find.text('3 phrases kept for Spanish'), findsOneWidget);

      await tester.tap(find.text('German · Deutsch'));
      await tester.settle();
      expect(find.text('Make German active'), findsOneWidget);
      expect(find.text('Starting at A1 · you skipped the test'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Remove German'), 100);
      await tester.tap(find.text('Remove German'));
      await tester.settle();
      expect(textContaining('kept for 30 days'), findsOneWidget);
      await tester.tap(find.text('Remove German').last);
      await tester.settle();
      expect(argsOf(b, 'remove-language').single['language'], 'de');
      expect(langs.langs['de']!.status, 'removed');
      expect(textContaining('Removed · kept until'), findsOneWidget);
    });

    testWidgets('the only language cannot be removed', (tester) async {
      await pumpApp(tester, languages: FakeLanguageServer());
      await openSwitcher(tester);
      await tester.tap(find.text('Manage languages'));
      await tester.settle();
      await tester.tap(find.text('English').last);
      await tester.settle();
      expect(find.text('Go to Today'), findsOneWidget);
      expect(find.text('Remove English'), findsNothing);
    });
  });

  group('Me (M-08)', () {
    testWidgets('settings grouped by scope; own language and Coach language go to the server', (tester) async {
      final langs = FakeLanguageServer(startLevels: {'en': 'B1', 'de': 'A1'});
      final b = await pumpApp(tester, languages: langs);
      await tester.tap(find.text('Me'));
      await tester.settle();
      expect(eyebrow('Languages'), findsOneWidget);
      expect(eyebrow('English only'), findsOneWidget);
      expect(eyebrow('All languages'), findsOneWidget);
      expect(find.text('English, German'), findsOneWidget);
      expect(textContaining('· all languages'), findsOneWidget, reason: 'voice minutes are shared');

      await tester.tap(find.text('My language'));
      await tester.settle();
      expect(find.text('Kurdish'), findsOneWidget, reason: 'every own language, not a short list');
      await tester.tap(find.text('Arabic'));
      await tester.settle();
      expect(argsOf(b, 'set-translation-language').last['language'], 'ar');

      await tester.tap(find.text('Coach explains in'));
      await tester.settle();
      expect(find.text('checked by a teacher'), findsWidgets);
      expect(find.text('checked by AI'), findsWidgets);
      await tester.tap(find.text('Turkish'));
      await tester.settle();
      final upd = argsOf(b, 'update-language-settings').last;
      expect(upd['language'], 'en');
      expect(upd['explanationLanguage'], 'tr');

      await tester.scrollUntilVisible(find.text('New phrases a day'), 100);
      await tester.tap(find.text('New phrases a day'));
      await tester.settle();
      await tester.tap(find.text('5 phrases'));
      await tester.settle();
      expect(argsOf(b, 'update-language-settings').last['newPhrasesPerDay'], 5);
    });

    testWidgets('a 1.x server keeps "Translate into" on the phone', (tester) async {
      await pumpApp(tester);
      await tester.tap(find.text('Me'));
      await tester.settle();
      expect(find.text('Translate into'), findsOneWidget);
      expect(eyebrow('All languages'), findsNothing);
    });
  });

  group('helpers', () {
    test('plan limits by plan (M-15)', () {
      LanguageState s(String plan, int used, int max) => LanguageState(
            learningLanguage: 'en',
            plan: plan,
            maxLanguages: max,
            languages: [for (var i = 0; i < used; i++) LanguageSummary(code: 'l$i')],
          );
      expect(planLimitOf(s('learner', 2, 10)), isNull);
      expect(planLimitOf(s('starter', 1, 1))!.canManage, isFalse);
      expect(planLimitOf(s('reader', 3, 3))!.actionLabel, 'Upgrade');
      expect(planLimitOf(s('coach', 10, 10))!.actionLabel, isNull);
      expect(planLimitOf(LanguageState.englishOnly()), isNull, reason: 'no limit card on a 1.x server');
      expect(usedText(s('reader', 2, 3)), '2 of 3 used');
    });

    test('right-to-left only from the script for text with no language (M-13)', () {
      expect(startsRightToLeft('سر درآوردن'), isTrue);
      expect(startsRightToLeft('figure out'), isFalse);
      expect(startsRightToLeft('  «بیرون»'), isTrue);
      expect(startsRightToLeft('123 Tschüss'), isFalse);
    });
  });
}
