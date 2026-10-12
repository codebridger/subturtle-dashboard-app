import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_backend.dart';

void main() {
  testWidgets('signed out: sign in screen with Google and email', (tester) async {
    await pumpApp(tester, signedIn: false);
    expect(find.text('Learn English from what you watch'), findsOneWidget);
    expect(find.bySemanticsLabel('Continue with Google'), findsOneWidget);
    expect(find.text('Continue with email'), findsOneWidget);
    expect(find.textContaining('Apple'), findsNothing, reason: 'no backend support for Sign in with Apple');

    await tester.tap(find.text('Continue with email'));
    await tester.pumpAndSettle();
    expect(find.text('Password'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Please enter a valid email.'), findsOneWidget);
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
    expect(find.text('Nice work. 2 reviewed.'), findsOneWidget);
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
