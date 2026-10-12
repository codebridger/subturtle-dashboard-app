import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../tokens/st_colors.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';

/// Builds the Material 3 [ThemeData] for Subturtle from the design tokens.
///
/// The [ColorScheme] is written by hand from the tokens (not `fromSeed`, which
/// would shift the rose). Roles Material does not have live in the [StColors]
/// and [StShadows] extensions. Read them with `context.st` and `context.stShadows`.
abstract final class StTheme {
  static ThemeData light() => _build(StColors.light, StShadows.light);
  static ThemeData dark() => _build(StColors.dark, StShadows.dark);

  static ThemeData _build(StColors c, StShadows s) {
    final scheme = ColorScheme(
      brightness: c.brightness,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primarySoft,
      onPrimaryContainer: c.rose700,
      secondary: c.accent,
      onSecondary: c.onAccent,
      secondaryContainer: c.accentSoft,
      onSecondaryContainer: c.jade700,
      tertiary: c.sky500,
      onTertiary: Colors.white,
      error: c.danger,
      onError: Colors.white,
      errorContainer: c.dangerSoft,
      onErrorContainer: c.red600,
      surface: c.surfacePage,
      onSurface: c.textStrong,
      onSurfaceVariant: c.textMuted,
      surfaceContainerLowest: c.surfaceCard,
      surfaceContainerLow: c.surfaceCard,
      surfaceContainer: c.surfaceCard,
      surfaceContainerHigh: c.surfaceRaised,
      surfaceContainerHighest: c.surfaceSunken,
      outline: c.borderDefault,
      outlineVariant: c.borderSubtle,
      inverseSurface: c.surfaceInverse,
      onInverseSurface: c.paper,
      inversePrimary: c.rose300,
      shadow: Colors.black,
      scrim: c.surfaceOverlay,
    );

    final isIos = defaultTargetPlatform == TargetPlatform.iOS;

    return ThemeData(
      useMaterial3: true,
      brightness: c.brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.surfacePage,
      canvasColor: c.surfacePage,
      fontFamily: StType.nunitoFamily,
      fontFamilyFallback: const [StType.vazirmatnFamily],
      textTheme: StType.textTheme(c.textStrong, c.textBody, c.textMuted),
      extensions: [c, s],
      // A calmer feel on iOS: no ink ripple, the platform does not use one.
      splashFactory: isIos ? NoSplash.splashFactory : InkSparkle.splashFactory,
      // Keep the iOS edge-swipe back gesture.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        },
      ),
      dividerTheme: DividerThemeData(color: c.borderSubtle, thickness: 1, space: 1),
      materialTapTargetSize: MaterialTapTargetSize.padded,
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surfaceCard,
        modalBackgroundColor: c.surfaceCard,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: c.surfaceOverlay,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(StRadius.xl))),
        showDragHandle: false,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surfaceCard,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: StRadius.brLg),
        barrierColor: c.surfaceOverlay,
        titleTextStyle: StType.titleLarge.copyWith(color: c.textStrong),
        contentTextStyle: StType.bodyLarge.copyWith(color: c.textBody),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: c.surfaceInverse,
        contentTextStyle: StType.bodyMedium.copyWith(color: c.paper, fontWeight: FontWeight.w800),
        actionTextColor: c.rose400,
        shape: const RoundedRectangleBorder(borderRadius: StRadius.brMd),
        elevation: 0,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary, linearTrackColor: c.ink150, circularTrackColor: Colors.transparent),
      textSelectionTheme: TextSelectionThemeData(cursorColor: c.primary, selectionColor: c.rose200, selectionHandleColor: c.primary),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surfaceCard,
        hintStyle: StType.bodyMedium.copyWith(color: c.textFaint, fontWeight: FontWeight.w500),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(borderRadius: StRadius.brMd, borderSide: BorderSide(color: c.borderDefault, width: 1.5)),
        enabledBorder: OutlineInputBorder(borderRadius: StRadius.brMd, borderSide: BorderSide(color: c.borderDefault, width: 1.5)),
        focusedBorder: OutlineInputBorder(borderRadius: StRadius.brMd, borderSide: BorderSide(color: c.primary, width: 1.5)),
        errorBorder: OutlineInputBorder(borderRadius: StRadius.brMd, borderSide: BorderSide(color: c.danger, width: 1.5)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: StRadius.brMd, borderSide: BorderSide(color: c.danger, width: 1.5)),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: c.surfaceRaised,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: StRadius.brMd, side: BorderSide(color: c.borderSubtle)),
        textStyle: StType.bodyMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w700),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.surfacePage,
        surfaceTintColor: Colors.transparent,
        foregroundColor: c.textStrong,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: StType.titleMedium.copyWith(color: c.textStrong),
      ),
      cupertinoOverrideTheme: null,
    );
  }
}

/// Short access to the Subturtle tokens from any widget.
extension StThemeContext on BuildContext {
  /// The colour tokens of the current theme.
  StColors get st => Theme.of(this).extension<StColors>() ?? StColors.light;

  /// The shadow tokens of the current theme.
  StShadows get stShadows => Theme.of(this).extension<StShadows>() ?? StShadows.light;
}
