import 'package:flutter/material.dart';

/// Type tokens from `typography.css`, mapped to Flutter as on the "Tokens" board.
///
/// One family, Nunito. Nunito has no Arabic-script glyphs, so Vazirmatn is the
/// fallback: a Persian translation inside an English card still renders. Use
/// [StL1Text] for learner-language (L1) strings so they also get RTL and the
/// taller Arabic-script line height.
///
/// Styles carry no colour. Widgets set it from [StColors], so the same style
/// works in light and dark.
abstract final class StType {
  /// Fonts are bundled by this package, so every style names the package.
  static const String package = 'subturtle_ui';
  static const String nunito = 'Nunito';
  static const String vazirmatn = 'Vazirmatn';

  /// Family name as Flutter resolves it for a font bundled in a package.
  static const String nunitoFamily = 'packages/$package/$nunito';
  static const String vazirmatnFamily = 'packages/$package/$vazirmatn';

  static const List<String> _fallback = [vazirmatn];

  /// Base style: Nunito with Vazirmatn as fallback.
  static TextStyle base({double size = 16, FontWeight weight = FontWeight.w400, double height = 1.5, double? letterSpacing}) {
    return TextStyle(
      package: package,
      fontFamily: nunito,
      fontFamilyFallback: _fallback,
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: letterSpacing,
      leadingDistribution: TextLeadingDistribution.even,
    );
  }

  // Tracking from the CSS (em) converted to logical pixels for each size.
  static double _em(double em, double size) => em * size;

  /// 36 / 900, tight. Summary numbers.
  static final TextStyle display = base(size: 36, weight: FontWeight.w900, height: 1.1, letterSpacing: _em(-0.02, 36));

  /// 28 / 900, tight. Screen titles and the phrase on a flashcard ("cardPhrase").
  static final TextStyle headline = base(size: 28, weight: FontWeight.w900, height: 1.1, letterSpacing: _em(-0.02, 28));

  /// 22 / 900. Sheet titles, section titles.
  static final TextStyle titleLarge = base(size: 22, weight: FontWeight.w900, height: 1.25);

  /// 18 / 800. Card titles.
  static final TextStyle titleMedium = base(size: 18, weight: FontWeight.w800, height: 1.25);

  /// 16 / 800. List row titles.
  static final TextStyle titleSmall = base(size: 16, weight: FontWeight.w800, height: 1.4);

  /// 16 / 400. Default body: source sentences, chat. Learning text is never smaller.
  static final TextStyle bodyLarge = base(size: 16, weight: FontWeight.w400, height: 1.5);

  /// 14 / 600. Secondary UI.
  static final TextStyle bodyMedium = base(size: 14, weight: FontWeight.w600, height: 1.45);

  /// 12 / 600. Meta lines ("34 phrases · 2 days ago").
  static final TextStyle bodySmall = base(size: 12, weight: FontWeight.w600, height: 1.35);

  /// 14 / 800. Button text (sm, md).
  static final TextStyle label = base(size: 14, weight: FontWeight.w800, height: 1, letterSpacing: _em(0.01, 14));

  /// 18 / 800. Large button text.
  static final TextStyle labelLarge = base(size: 18, weight: FontWeight.w800, height: 1, letterSpacing: _em(0.01, 18));

  /// 12 / 700. Tags, field helper text.
  static final TextStyle labelMedium = base(size: 12, weight: FontWeight.w700, height: 1.35);

  /// 11 / 800, caps, wide tracking. Eyebrow and section labels. Write the text in
  /// sentence case; [StEyebrow] upper-cases it.
  static final TextStyle overline = base(size: 11, weight: FontWeight.w800, height: 1.35, letterSpacing: _em(0.12, 11));

  /// Material [TextTheme] built from the tokens, so stock widgets look right too.
  static TextTheme textTheme(Color strong, Color body, Color muted) {
    return TextTheme(
      displayLarge: display.copyWith(color: strong),
      displayMedium: display.copyWith(color: strong),
      displaySmall: display.copyWith(color: strong),
      headlineLarge: headline.copyWith(color: strong),
      headlineMedium: headline.copyWith(color: strong),
      headlineSmall: titleLarge.copyWith(color: strong),
      titleLarge: titleLarge.copyWith(color: strong),
      titleMedium: titleMedium.copyWith(color: strong),
      titleSmall: titleSmall.copyWith(color: strong),
      bodyLarge: bodyLarge.copyWith(color: body),
      bodyMedium: bodyMedium.copyWith(color: body),
      bodySmall: bodySmall.copyWith(color: muted),
      labelLarge: label.copyWith(color: strong),
      labelMedium: labelMedium.copyWith(color: body),
      labelSmall: overline.copyWith(color: muted),
    );
  }
}
