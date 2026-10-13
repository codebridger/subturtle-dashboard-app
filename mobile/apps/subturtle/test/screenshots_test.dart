import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_backend.dart';

/// Writes PNG screenshots of the main screens (fake data) to SCREENSHOT_DIR.
/// Skipped unless run with: flutter test test/screenshots_test.dart --dart-define=SCREENSHOT_DIR=/some/dir
const _dir = String.fromEnvironment('SCREENSHOT_DIR');

void main() {
  final key = GlobalKey();

  Future<void> shot(WidgetTester tester, String name) async {
    await tester.settle();
    await tester.runAsync(() async {
      // Let flutter_svg finish decoding the icons.
      for (var i = 0; i < 5; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
      final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      File('$_dir/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
    });
  }

  for (final theme in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('screenshots ${theme.name}', (tester) async {
      await pumpApp(tester, theme: theme, boundaryKey: key, seed: (b) {
        b.functions['get-pool'] = (_) => [
              {'phraseId': 'n1', 'phrase': {'_id': 'n1', 'phrase': 'no wonder', 'translation': 'جای تعجب نیست'}},
            ];
      });
      await shot(tester, '${theme.name}-01-today');
      await tester.tap(find.text('Start review'));
      await shot(tester, '${theme.name}-02-review-front');
      await tester.tap(find.text('Show answer'));
      await shot(tester, '${theme.name}-03-review-answer');
      await tester.tap(find.bySemanticsLabel('End review'));
      await tester.settle();
      if (find.text('End').evaluate().isNotEmpty) await tester.tap(find.text('End').last);
      await tester.settle();
      await tester.tap(find.text('Bundles').last);
      await shot(tester, '${theme.name}-04-bundles');
      await tester.tap(find.text('Coach').last);
      await shot(tester, '${theme.name}-05-coach');
      await tester.tap(find.text('Me').last);
      await shot(tester, '${theme.name}-06-me');
    }, skip: _dir.isEmpty);
  }

  for (final theme in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('screenshot sign in ${theme.name}', (tester) async {
      await pumpApp(tester, signedIn: false, theme: theme, boundaryKey: key);
      await shot(tester, '${theme.name}-00-sign-in');
    }, skip: _dir.isEmpty);

    testWidgets('screenshot summary ${theme.name}', (tester) async {
      await pumpApp(tester, theme: theme, boundaryKey: key);
      await tester.settle();
      await tester.tap(find.text('Start review'));
      await tester.settle();
      await tester.tap(find.text('Show answer'));
      await tester.settle();
      await tester.tap(find.widgetWithText(GestureDetector, 'Forgot').last);
      await tester.settle();
      await tester.tap(find.text('Show answer'));
      await tester.settle();
      await tester.tap(find.widgetWithText(GestureDetector, 'Learned').last);
      await shot(tester, '${theme.name}-11-summary');
    }, skip: _dir.isEmpty);

    testWidgets('screenshots save assistant ${theme.name}', (tester) async {
      const sentence = 'I had to get out of there before it got worse.';
      await pumpApp(tester, theme: theme, boundaryKey: key, seed: (b) {
        b.functions['translateWithContext'] = (args) => {
              'translation': {'phrase': args['phrase'] == 'had to' ? 'مجبور بودن' : 'بیرون رفتن، ترک کردن'},
              'direction': {'source': 'ltr', 'target': 'rtl'},
              'chunks': args['phrase'] == sentence
                  ? [
                      {'text': 'had to'},
                      {'text': 'get out of'},
                      {'text': 'got worse'},
                    ]
                  : [],
              'linguistic_data': {'type': 'phrasal verb', 'definition': 'To leave a place, often quickly or to escape something bad.', 'phonetic': {'transliteration': 'get owt uv'}, 'formality_level': 'informal'},
            };
        b.functions['createPhrase'] = (args) => {'_id': 'p9', 'phrase': args['phrase'], 'translation': args['translation']};
        b.functions['translationAdvice'] = (_) => {'reply': 'It is informal but very common. In formal writing you can use "leave".'};
      });
      await tester.tap(find.bySemanticsLabel('Save a phrase'));
      await shot(tester, '${theme.name}-07-save-start');
      await tester.enterText(find.byType(TextField).first, sentence);
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('Send'));
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('get out of'));
      await shot(tester, '${theme.name}-08-save-chat');
      await tester.tap(find.text('Save to Stranger Things S2'));
      await tester.settle();
      await tester.tap(find.bySemanticsLabel('Is it formal?'));
      await shot(tester, '${theme.name}-09-save-chat-saved');
      await tester.tap(find.bySemanticsLabel('Save history'));
      await shot(tester, '${theme.name}-10-save-history');
    }, skip: _dir.isEmpty);
  }
}
