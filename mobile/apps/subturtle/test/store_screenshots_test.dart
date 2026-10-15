import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_backend.dart';

/// App Store screenshots for the 6.3" iPhone (1206 × 2622), from the app with
/// sample data. Skipped unless run with:
///   flutter test test/store_screenshots_test.dart --dart-define=STORE_SHOTS_DIR=/some/dir
const _dir = String.fromEnvironment('STORE_SHOTS_DIR');

void main() {
  final key = GlobalKey();
  const size = Size(402, 874); // × 3 = 1206 × 2622 (6.3" iPhone, the size App Store Connect asks for)

  Future<void> shot(WidgetTester tester, String name) async {
    await tester.settle();
    // Real shadows for the capture (tests draw them as solid slabs), then back.
    debugDisableShadows = false;
    tester.binding.renderViews.first.markNeedsPaint();
    await tester.runAsync(() async {
      for (var i = 0; i < 6; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
      final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      File('$_dir/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
    });
    debugDisableShadows = true;
  }

  testWidgets('store: sign in', (tester) async {
    await pumpApp(tester, signedIn: false, size: size, theme: ThemeMode.light, boundaryKey: key);
    await shot(tester, '01-sign-in');
  }, skip: _dir.isEmpty);

  testWidgets('store: today, review, bundles, coach', (tester) async {
    await pumpApp(tester, size: size, theme: ThemeMode.light, boundaryKey: key, seed: (b) {
      b.functions['get-pool'] = (_) => [
            {'phraseId': 'n1', 'phrase': {'_id': 'n1', 'phrase': 'no wonder', 'translation': 'جای تعجب نیست'}},
          ];
    });
    await shot(tester, '02-today');
    await tester.tap(find.text('Start review'));
    await tester.settle();
    await tester.tap(find.text('Show answer'));
    await shot(tester, '03-review');
    await tester.tap(find.bySemanticsLabel('End review'));
    await tester.settle();
    if (find.text('End').evaluate().isNotEmpty) await tester.tap(find.text('End').last);
    await tester.settle();
    await tester.tap(find.text('Bundles').last);
    await shot(tester, '05-bundles');
    await tester.tap(find.text('Coach').last);
    await shot(tester, '06-coach');
  }, skip: _dir.isEmpty);

  testWidgets('store: save a phrase', (tester) async {
    const sentence = 'I had to get out of there before it got worse.';
    await pumpApp(tester, size: size, theme: ThemeMode.light, boundaryKey: key, seed: (b) {
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
    });
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Save a phrase'));
    await tester.settle();
    await tester.enterText(find.byType(TextField).first, sentence);
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('Send'));
    await tester.settle();
    await tester.tap(find.bySemanticsLabel('get out of'));
    await shot(tester, '04-save-a-phrase');
  }, skip: _dir.isEmpty);
}
