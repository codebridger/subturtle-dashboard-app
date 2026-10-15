import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../test/fake_backend.dart';
import '../test/fake_languages.dart';

/// The add-language and switch flows end to end on a device, against the
/// in-memory fake of the language module (no network, no account):
///
///   `flutter test integration_test/languages_flow_test.dart -d DEVICE_ID`
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Finder eyebrow(String t) => find.text(t.toUpperCase());

  testWidgets('add German with the chat test, then switch back to English', (tester) async {
    final langs = FakeLanguageServer(startLevels: {'en': 'B1'}, dueCounts: {'en': 2});
    await pumpApp(tester, languages: langs);
    expect(eyebrow('Today · English'), findsOneWidget);

    // Pill → switcher → Add a language.
    await tester.tap(find.byType(StLanguagePill));
    await tester.settle();
    await tester.tap(find.text('Add a language'));
    await tester.settle();
    await tester.tap(find.text('German'));
    await tester.settle();
    await tester.tap(find.text('Next: German'));
    await tester.settle();
    await tester.tap(find.text('Start the chat test'));
    await tester.settle();

    for (var i = 0; i < 6; i++) {
      await tester.enterText(find.byType(StInput), 'Ich heiße Sara $i.');
      await tester.tap(find.bySemanticsLabel('Send'));
      await tester.settle();
    }
    expect(find.text('Starting at A2'), findsOneWidget);
    await tester.tap(find.text('Go to German Today'));
    await tester.settle();
    expect(langs.active, 'de');
    expect(eyebrow('Today · German'), findsOneWidget);
    expect(find.text('Save your first German phrase'), findsOneWidget, reason: 'a new language never shows an empty board');

    // Switch back.
    await tester.tap(find.byType(StLanguagePill));
    await tester.settle();
    await tester.tap(find.text('English'));
    await tester.settle();
    expect(langs.active, 'en');
    expect(eyebrow('Today · English'), findsOneWidget);
  });

  testWidgets('a new account: first run, Start at A1, the starter pack', (tester) async {
    final langs = FakeLanguageServer(active: null);
    await pumpApp(tester, languages: langs);
    expect(eyebrow('Welcome to Subturtle'), findsOneWidget);
    await tester.tap(find.text('Spanish'));
    await tester.settle();
    await tester.tap(find.text('Next: Spanish'));
    await tester.settle();
    await tester.tap(find.text('Start at A1').first);
    await tester.settle();
    await tester.tap(find.widgetWithText(StButton, 'Start at A1'));
    await tester.settle();
    expect(find.text('Starter pack'), findsOneWidget);
    for (var i = 0; i < 4; i++) {
      await tester.tap(find.text('Next chunk'));
      await tester.settle();
    }
    expect(find.text('You finished the starter pack'), findsOneWidget);
    await tester.tap(find.text('Go to Today'));
    await tester.settle();
    expect(eyebrow('Today · Spanish'), findsOneWidget);
  });
}
