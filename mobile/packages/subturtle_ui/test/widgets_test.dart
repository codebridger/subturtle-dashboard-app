import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

Widget host(Widget child, {bool dark = false, double textScale = 1}) {
  return MaterialApp(
    theme: StTheme.light(),
    darkTheme: StTheme.dark(),
    themeMode: dark ? ThemeMode.dark : ThemeMode.light,
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(textScale), size: const Size(390, 844)),
      child: Scaffold(body: Center(child: child)),
    ),
  );
}

void main() {
  group('tokens', () {
    test('rose-500 and jade-500 are the same in both themes', () {
      expect(StColors.light.rose500, StColors.dark.rose500);
      expect(StColors.light.jade500, StColors.dark.jade500);
      expect(StColors.light.rose500, const Color(0xFFF91E5A));
      expect(StColors.light.jade500, const Color(0xFF14B485));
    });

    test('dark theme inverts the ramps', () {
      // Light ink-950 is near-black; dark ink-950 is near-white.
      expect(StColors.light.ink950, const Color(0xFF1B1620));
      expect(StColors.dark.ink950, const Color(0xFFFAF8FB));
      expect(StColors.dark.rose100, isNot(StColors.light.rose100));
      expect(StColors.dark.paper, const Color(0xFF15111A));
    });

    test('theme carries the extensions', () {
      final t = StTheme.dark();
      expect(t.extension<StColors>(), StColors.dark);
      expect(t.extension<StShadows>(), isNotNull);
      expect(t.colorScheme.primary, StColors.dark.rose500);
      expect(t.useMaterial3, isTrue);
    });
  });

  group('StButton', () {
    testWidgets('calls onPressed and exposes a button node', (tester) async {
      var taps = 0;
      await tester.pumpWidget(host(StButton(label: 'Start review', onPressed: () => taps++)));
      expect(find.bySemanticsLabel('Start review'), findsOneWidget);
      await tester.tap(find.text('Start review'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('disabled and loading buttons ignore taps', (tester) async {
      var taps = 0;
      await tester.pumpWidget(host(Column(children: [
        const StButton(label: 'Disabled'),
        StButton(label: 'Loading', loading: true, onPressed: () => taps++),
      ])));
      await tester.tap(find.text('Loading'));
      await tester.pump();
      expect(taps, 0);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('small button keeps a 48 dp tap height', (tester) async {
      await tester.pumpWidget(host(StButton(label: 'Start', size: StSize.sm, onPressed: () {})));
      final size = tester.getSize(find.byType(StPressable));
      expect(size.height, greaterThanOrEqualTo(48));
    });

    testWidgets('renders in dark mode at 200% text', (tester) async {
      await tester.pumpWidget(host(StButton(label: 'Save phrase', size: StSize.lg, block: true, onPressed: () {}), dark: true, textScale: 2));
      expect(tester.takeException(), isNull);
    });
  });

  group('StIconButton', () {
    testWidgets('has its label and a 48 dp target', (tester) async {
      await tester.pumpWidget(host(StIconButton(icon: StIcons.speaker, semanticLabel: 'Play pronunciation', size: StSize.sm, onPressed: () {})));
      expect(find.bySemanticsLabel('Play pronunciation'), findsOneWidget);
      expect(tester.getSize(find.byType(StPressable)).width, greaterThanOrEqualTo(48));
    });
  });

  group('StTag', () {
    testWidgets('tappable tag is a toggle', (tester) async {
      var on = false;
      await tester.pumpWidget(host(StatefulBuilder(builder: (context, set) => StTag('had', active: on, onTap: () => set(() => on = !on)))));
      await tester.tap(find.text('had'));
      await tester.pumpAndSettle();
      expect(on, isTrue);
      expect(tester.getSemantics(find.bySemanticsLabel('had')), isSemantics(isToggled: true, hasToggledState: true));
    });
  });

  group('StSwitch and StSegmentedControl', () {
    testWidgets('switch toggles', (tester) async {
      var v = false;
      await tester.pumpWidget(host(StatefulBuilder(builder: (context, set) => StSwitch(value: v, onChanged: (n) => set(() => v = n), semanticLabel: 'Haptics'))));
      await tester.tap(find.byType(StSwitch));
      await tester.pumpAndSettle();
      expect(v, isTrue);
    });

    testWidgets('segmented control changes value', (tester) async {
      var v = 'voice';
      await tester.pumpWidget(host(StatefulBuilder(
        builder: (context, set) => StSegmentedControl<String>(
          segments: const [StSegment('voice', 'Voice'), StSegment('text', 'Text')],
          value: v,
          onChanged: (n) => set(() => v = n),
        ),
      )));
      await tester.tap(find.text('Text'));
      await tester.pumpAndSettle();
      expect(v, 'text');
    });
  });

  group('display widgets', () {
    testWidgets('progress bar reports a percentage', (tester) async {
      await tester.pumpWidget(host(const SizedBox(width: 200, child: StProgressBar(value: 72, max: 90, semanticLabel: 'Voice minutes'))));
      await tester.pumpAndSettle();
      expect(tester.getSemantics(find.byType(StProgressBar)).value, '80%');
    });

    testWidgets('level pip reads its level', (tester) async {
      await tester.pumpWidget(host(const StLevelPip(level: 3)));
      expect(find.bySemanticsLabel('Level 3 of 5'), findsOneWidget);
    });

    testWidgets('avatar initials', (tester) async {
      expect(StAvatar.initialsOf('Sara Ahmadi'), 'SA');
      expect(StAvatar.initialsOf('  somi  '), 'S');
      expect(StAvatar.initialsOf(''), '');
    });

    testWidgets('empty state shows title, text and action', (tester) async {
      await tester.pumpWidget(host(StEmptyState(title: 'No bundles yet', description: 'Save one.', action: StButton(label: 'Save a phrase', onPressed: () {}))));
      expect(find.text('No bundles yet'), findsOneWidget);
      expect(find.text('Save one.'), findsOneWidget);
      expect(find.text('Save a phrase'), findsOneWidget);
    });

    testWidgets('L1 text is RTL only when asked', (tester) async {
      await tester.pumpWidget(host(const Column(children: [StL1Text('باید', rtl: true), StL1Text('must', rtl: false)])));
      final dirs = tester.widgetList<Directionality>(find.descendant(of: find.byType(StL1Text), matching: find.byType(Directionality))).map((d) => d.textDirection).toList();
      expect(dirs, [TextDirection.rtl, TextDirection.ltr]);
    });

    testWidgets('skeleton is static under reduced motion', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: StTheme.light(),
        home: const MediaQuery(data: MediaQueryData(disableAnimations: true), child: StSkeleton(height: 20)),
      ));
      expect(tester.hasRunningAnimations, isFalse);
    });

    testWidgets('icons resolve', (tester) async {
      expect(StIcon.exists(StIcons.today), isTrue);
      expect(StIcon.exists(StIcons.google), isTrue);
      await tester.pumpWidget(host(const StIcon(StIcons.fire, size: 24, color: Colors.red)));
      expect(tester.takeException(), isNull);
    });
  });

  group('mobile parts', () {
    testWidgets('tab bar labels are always shown and tappable', (tester) async {
      var index = 0;
      await tester.pumpWidget(MaterialApp(
        theme: StTheme.light(),
        home: Scaffold(
          bottomNavigationBar: StatefulBuilder(
            builder: (context, set) => StTabBar(
              currentIndex: index,
              onTap: (i) => set(() => index = i),
              items: const [
                StTabItem(label: 'Today', icon: StIcons.today, showDot: true),
                StTabItem(label: 'Bundles', icon: StIcons.bundles),
                StTabItem(label: 'Coach', icon: StIcons.coach),
                StTabItem(label: 'Me', icon: StIcons.me),
              ],
            ),
          ),
        ),
      ));
      for (final l in ['Today', 'Bundles', 'Coach', 'Me']) {
        expect(find.text(l), findsOneWidget);
      }
      await tester.tap(find.text('Coach'));
      await tester.pumpAndSettle();
      expect(index, 2);
      expect(find.bySemanticsLabel(RegExp('Today, tab 1 of 4, new')), findsOneWidget);
    });

    testWidgets('FAB collapses to an icon', (tester) async {
      await tester.pumpWidget(host(StFab(label: 'Save a phrase', onPressed: () {}, extended: false)));
      await tester.pumpAndSettle();
      expect(find.text('Save a phrase'), findsNothing);
      expect(find.bySemanticsLabel('Save a phrase'), findsOneWidget);
    });

    testWidgets('bottom sheet closes with its close button', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: StTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: StButton(
              label: 'Open',
              onPressed: () => showStBottomSheet<void>(context: context, builder: (_) => const StSheet(title: 'Start a session', child: Text('Body'))),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('Start a session'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Start a session'), findsNothing);
    });

    testWidgets('toast shows its action', (tester) async {
      var undone = false;
      await tester.pumpWidget(MaterialApp(
        theme: StTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: StButton(label: 'Grade', onPressed: () => showStToast(context, title: 'Marked Learned', actionLabel: 'Undo', onAction: () => undone = true)),
          ),
        ),
      ));
      await tester.tap(find.text('Grade'));
      await tester.pumpAndSettle();
      expect(find.text('Marked Learned'), findsOneWidget);
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(undone, isTrue);
    });
  });
}
