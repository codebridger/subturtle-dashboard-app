import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads the real Nunito and Vazirmatn fonts, so layout tests measure real
/// text widths instead of the square test font.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<void> load(String family, List<String> files) async {
    final loader = FontLoader('packages/subturtle_ui/$family');
    for (final f in files) {
      loader.addFont(rootBundle.load('packages/subturtle_ui/assets/fonts/$f'));
    }
    await loader.load();
  }

  await load('Nunito', ['Nunito-Regular.ttf', 'Nunito-Medium.ttf', 'Nunito-SemiBold.ttf', 'Nunito-Bold.ttf', 'Nunito-ExtraBold.ttf', 'Nunito-Black.ttf']);
  await load('Vazirmatn', ['Vazirmatn-Regular.ttf', 'Vazirmatn-SemiBold.ttf', 'Vazirmatn-Bold.ttf']);
  await testMain();
}
