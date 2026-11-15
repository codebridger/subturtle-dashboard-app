import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import 'widgets_test.dart' show host;

void main() {
  group('language parts', () {
    testWidgets('the pill says where the learner started, never "your level"', (tester) async {
      var taps = 0;
      await tester.pumpWidget(host(StLanguagePill(code: 'de', name: 'German', level: 'A2', caption: 'Saves go here', onTap: () => taps++)));
      expect(find.text('DE'), findsOneWidget);
      expect(find.text('Saves go here · Starting at A2'), findsOneWidget);
      expect(find.bySemanticsLabel('Change language. Learning German, starting at A2'), findsOneWidget);
      expect(find.textContaining('level'), findsNothing);
      await tester.tap(find.byType(StLanguagePill));
      expect(taps, 1);
      expect(tester.getSize(find.byType(StLanguagePill)).height, greaterThanOrEqualTo(48));
    });

    testWidgets('picker row ticks the active language', (tester) async {
      await tester.pumpWidget(host(const StLanguageOption(code: 'de', title: 'German · Deutsch', meta: 'Starting at A1 · 7 due · 38 phrases', selected: true)));
      expect(find.bySemanticsLabel('German · Deutsch, Starting at A1 · 7 due · 38 phrases, active'), findsOneWidget);
    });

    testWidgets('the save row: missing offers both choices, kept shows Undo', (tester) async {
      String? picked;
      Widget row(StSaveLanguageState s) => host(SizedBox(
            width: 358,
            child: StSaveLanguageRow(
              state: s,
              code: 'de',
              name: 'German',
              activeName: 'English',
              onSaveToActive: () => picked = 'active',
              onKeep: () => picked = 'keep',
              onUndo: () => picked = 'undo',
              onAddLanguage: () => picked = 'add',
              onChange: () => picked = 'change',
            ),
          ));
      await tester.pumpWidget(row(StSaveLanguageState.missing));
      expect(find.text('This looks like German'), findsOneWidget);
      expect(find.text('German is not in your languages yet'), findsOneWidget);
      await tester.tap(find.text('Keep for German'));
      expect(picked, 'keep');
      await tester.tap(find.text('Save to English'));
      expect(picked, 'active');
      await tester.tap(find.text('add German now'));
      expect(picked, 'add');

      await tester.pumpWidget(row(StSaveLanguageState.kept));
      expect(find.text('Kept for German'), findsOneWidget);
      expect(find.text('It joins German when you add it. Kept for 30 days.'), findsOneWidget);
      await tester.tap(find.text('Undo'));
      expect(picked, 'undo');

      await tester.pumpWidget(row(StSaveLanguageState.other));
      expect(find.text('Saves to your German profile. You stay in English.'), findsOneWidget);
      await tester.tap(find.text('Change'));
      expect(picked, 'change');
    });

    testWidgets('plan card and add row render in dark mode at 200% text', (tester) async {
      await tester.pumpWidget(host(
        const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            StPlanLimitCard(text: 'Starter includes 1 language.', actionLabel: 'See plans'),
            StLanguageAddRow(note: 'Spanish, French and more', usedText: '2 of 10 used'),
          ],
        ),
        dark: true,
        textScale: 2,
      ));
      expect(tester.takeException(), isNull);
      expect(find.text('See plans'), findsOneWidget);
      expect(find.text('2 of 10 used'), findsOneWidget);
    });
  });
}
