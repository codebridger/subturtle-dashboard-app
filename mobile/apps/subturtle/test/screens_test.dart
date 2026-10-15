import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle/app/config.dart';
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

  testWidgets('signed out: sign in with Google and email (no Apple off iOS)', (tester) async {
    await pumpApp(tester, signedIn: false);
    await tester.settle();
    expect(find.text('Heading to Today'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Pick a way to continue.'), findsOneWidget);
    expect(find.bySemanticsLabel('Continue with Google'), findsOneWidget);
    expect(find.bySemanticsLabel('Continue with email'), findsOneWidget);
    expect(find.textContaining('Your session ended'), findsNothing, reason: 'a first visit is not an expired session');

    expect(find.bySemanticsLabel('Continue with Apple'), findsNothing, reason: 'Sign in with Apple is iOS only');

    await tester.tap(find.bySemanticsLabel('Continue with email'));
    await tester.settle();
    expect(find.text('Password'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.settle();
    expect(find.text('Please enter a valid email.'), findsOneWidget);
    expect(find.text("That didn't go through"), findsOneWidget);
  });

  testWidgets('iOS offers Sign in with Apple (App Store rule 4.8)', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    await pumpApp(tester, signedIn: false);
    await tester.settle();
    expect(find.bySemanticsLabel('Continue with Apple'), findsOneWidget);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('Me: delete account asks, deletes on the server, then signs out', (tester) async {
    final backend = await pumpApp(tester, seed: (b) => b.functions['delete-account'] = (_) => {'deleted': true});
    await tester.settle();
    await tester.tap(find.text('Me').last);
    await tester.settle();
    await tester.scrollUntilVisible(find.text('Delete account'), 200);
    await tester.tap(find.text('Delete account'));
    await tester.settle();
    expect(textContaining('This cannot be undone'), findsOneWidget);
    await tester.tap(find.text('Delete my account'));
    await tester.settle();
    expect(backend.calls.lastWhere((c) => c.$1 == 'delete-account').$2['userId'], 'u1');
    expect(find.text('Pick a way to continue.'), findsOneWidget, reason: 'back on Sign in');
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

  testWidgets('store builds show the current plan only: no prices, plan list or web links', (tester) async {
    final probe = FakePricingProbe({'currency': 'eur', 'fxRate': 1.2});
    final backend = await pumpApp(tester, pricingProbe: probe);
    await tester.settle();
    await tester.tap(find.text('Me').last);
    await tester.settle();
    await tester.tap(find.text('Starter plan'));
    await tester.settle();
    expect(find.text('Your plan'), findsOneWidget);
    expect(find.text('ALL PLANS'), findsNothing);
    expect(find.text('Manage on the web'), findsNothing);
    expect(probe.runs, 0);
    expect(backend.called('createCustomCheckoutSession'), isEmpty);
  });

  group('Plans: local prices', () {
    // The plan list and prices only show in builds with purchase links.
    setUp(() => AppConfig.purchaseLinks = true);
    tearDown(() => AppConfig.purchaseLinks = false);

    void seedPlans(FakeBackend b) {
      b.functions['getSubscriptionPlans'] = (_) => [
            {'id': 'starter', 'name': 'Starter', 'isPaid': false, 'featureLabels': ['Save up to 200 phrases a month']},
            {'id': 'reader', 'name': 'Reader', 'isPaid': true, 'pricing': {'monthly': {'gbp': 4.49}, 'annual': {'gbp': 43.0}}, 'featureLabels': ['Everything in Starter']},
            {'id': 'learner', 'name': 'Learner', 'isPaid': true, 'highlight': true, 'pricing': {'monthly': {'gbp': 10.99}}, 'featureLabels': ['Everything in Reader']},
          ];
      b.functions['createCustomCheckoutSession'] = (_) => {'clientSecret': 'cs_test_secret'};
    }

    Future<void> openPlans(WidgetTester tester) async {
      await tester.settle();
      await tester.tap(find.text('Me').last);
      await tester.settle();
      await tester.tap(find.text('Starter plan'));
      await tester.settle();
    }

    testWidgets('a free user sees the prices Stripe would charge in their currency', (tester) async {
      final probe = FakePricingProbe({'currency': 'eur', 'fxRate': 1.2311, 'minor': 553});
      final backend = await pumpApp(tester, seed: seedPlans, pricingProbe: probe);
      await openPlans(tester);
      expect(probe.runs, 1);
      final session = backend.calls.lastWhere((c) => c.$1 == 'createCustomCheckoutSession').$2;
      expect(session['tierId'], 'reader');
      expect(session['successUrl'], endsWith('/#/payment-success'));
      expect(find.text('€13.53/mo'), findsOneWidget, reason: '10.99 × 1.2311');
      expect(textContaining('Prices are in your currency'), findsOneWidget);
    });

    testWidgets('a paid user keeps GBP and never opens a checkout', (tester) async {
      final probe = FakePricingProbe({'currency': 'eur', 'fxRate': 1.2});
      final backend = await pumpApp(tester, pricingProbe: probe, seed: (b) {
        seedPlans(b);
        final details = b.functions['getSubscriptionDetails']!;
        b.functions['getSubscriptionDetails'] = (a) => {...(details(a) as Map), 'is_freemium': false, 'tier': 'learner'};
      });
      await tester.settle();
      await tester.tap(find.text('Me').last);
      await tester.settle();
      await tester.tap(textContaining('Learner plan').first);
      await tester.settle();
      expect(probe.runs, 0);
      expect(backend.called('createCustomCheckoutSession'), isEmpty);
      expect(find.text('£10.99/mo'), findsWidgets);
      expect(textContaining('€'), findsNothing);
    });
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
