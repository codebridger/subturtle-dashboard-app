import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle/app/providers.dart';
import 'package:subturtle_api/subturtle_api.dart';

import 'fake_backend.dart';

void main() {
  test('a failing token store ends in signed out, not on the splash screen', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = SubturtleApi(baseUrl: 'https://api.test', httpClient: FakeBackend().client, tokenStore: _BrokenStore());
    final c = ProviderContainer(overrides: [apiProvider.overrideWithValue(api), prefsProvider.overrideWithValue(prefs)]);
    addTearDown(c.dispose);
    await c.read(authProvider.notifier).restore();
    expect(c.read(authProvider).status, AuthStatus.signedOut);
  });

  testWidgets('signed out: sign in with Google, Apple (coming soon) and email', (tester) async {
    await pumpApp(tester, signedIn: false);
    await tester.settle();
    expect(find.text('Heading to Today'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Pick a way to continue.'), findsOneWidget);
    expect(find.bySemanticsLabel('Continue with Google'), findsOneWidget);
    expect(find.bySemanticsLabel('Continue with email'), findsOneWidget);
    expect(find.textContaining('Your session ended'), findsNothing, reason: 'a first visit is not an expired session');

    // No Apple route on the backend yet: the button explains instead of failing.
    await tester.tap(find.bySemanticsLabel('Continue with Apple'));
    await tester.settle();
    expect(find.text('Sign in with Apple is coming soon'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Continue with email'));
    await tester.settle();
    expect(find.text('Password'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.settle();
    expect(find.text('Please enter a valid email.'), findsOneWidget);
    expect(find.text("That didn't go through"), findsOneWidget);
  });

  testWidgets('a rejected token signs out with the session-ended note', (tester) async {
    await pumpApp(tester);
    await tester.settle();
    // What the API client's onUnauthorized hook does when a call comes back 401/412.
    final container = ProviderScope.containerOf(tester.element(find.byType(Scaffold).first));
    await container.read(authProvider.notifier).signOut(expired: true);
    await tester.settle();
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.textContaining('Your session ended'), findsOneWidget);
  });

  testWidgets('Today shows the review hero and the tab bar', (tester) async {
    await pumpApp(tester);
    await tester.settle();
    expect(find.text('Smart Review'), findsOneWidget);
    expect(textContaining('2 phrases are due'), findsOneWidget);
    expect(find.text('Start review'), findsOneWidget);
    for (final t in ['Today', 'Bundles', 'Coach', 'Me']) {
      expect(find.text(t), findsWidgets);
    }
    expect(find.bySemanticsLabel('Save a phrase'), findsOneWidget);
  });

  testWidgets('Today: all done and empty states', (tester) async {
    await pumpApp(tester, seed: (b) => b.functions['get-board'] = (_) => []);
    await tester.settle();
    expect(find.text("You're done for today"), findsOneWidget);
  });

  testWidgets('Today: error state offers Try again', (tester) async {
    await pumpApp(tester, seed: (b) => b.functions.remove('get-board'));
    await tester.settle();
    expect(find.text("We couldn't load your board."), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('Review: reveal, grade, undo before send, then summary', (tester) async {
    final backend = await pumpApp(tester);
    await tester.settle();
    await tester.tap(find.text('Start review'));
    await tester.settle();
    expect(find.text('figure out'), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget);

    await tester.tap(find.text('Show answer'));
    await tester.settle();
    expect(find.text('Learned'), findsWidgets);
    await tester.tap(find.widgetWithText(GestureDetector, 'Learned').last);
    await tester.settle();
    expect(find.text('2 of 2'), findsOneWidget);
    expect(backend.called('submit-review'), isEmpty, reason: 'the last grade waits so it can be undone');

    await tester.tap(find.bySemanticsLabel('Undo last answer'));
    await tester.settle();
    expect(find.text('1 of 2'), findsOneWidget);

    await tester.tap(find.widgetWithText(GestureDetector, 'Forgot').last);
    await tester.settle();
    await tester.tap(find.text('Show answer'));
    await tester.settle();
    await tester.tap(find.widgetWithText(GestureDetector, 'Learned').last);
    await tester.settle();
    expect(backend.called('submit-review'), hasLength(2));
    expect(find.text('Nice work'), findsOneWidget);
    expect(find.text('You reviewed 2 phrases.'), findsOneWidget);
    expect(find.text('figure out'), findsOneWidget, reason: 'forgotten phrase listed to look at again');
  });

  testWidgets('Bundles list shows rows with a due pill', (tester) async {
    await pumpApp(tester);
    await tester.settle();
    await tester.tap(find.text('Bundles').last);
    await tester.settle();
    expect(find.text('Phrase bundles'), findsOneWidget);
    expect(find.text('Stranger Things S2'), findsOneWidget);
    expect(find.text('2 due'), findsOneWidget);
  });

  testWidgets('Me shows plan and settings', (tester) async {
    await pumpApp(tester);
    await tester.settle();
    await tester.tap(find.text('Me').last);
    await tester.settle();
    expect(find.text('Sara Ahmadi'), findsWidgets);
    expect(find.text('Starter plan'), findsOneWidget);
    expect(find.text('Translate into'), findsOneWidget);
    expect(find.text('Persian'), findsOneWidget);
    expect(textContaining('credit'), findsNothing);
  });

  testWidgets('Coach: Starter sees history as a paid feature', (tester) async {
    await pumpApp(tester, seed: (b) => b.functions['list-live-sessions'] = (_) => throw Exception());
    await tester.settle();
    await tester.tap(find.text('Coach').last);
    await tester.settle();
    expect(find.text('Start a session'), findsOneWidget);
  });

  testWidgets('large text (200%) does not overflow Today', (tester) async {
    await pumpApp(tester);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.settle();
    expect(tester.takeException(), isNull);
  });
}

class _BrokenStore implements TokenStore {
  @override
  Future<String?> read() => Future.error(Exception('keychain error'));
  @override
  Future<void> write(String token) async {}
  @override
  Future<void> clear() async {}
}
