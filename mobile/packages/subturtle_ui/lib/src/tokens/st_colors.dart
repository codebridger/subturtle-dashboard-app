import 'package:flutter/material.dart';

/// Every colour token of the Subturtle Design System, for one theme.
///
/// Ported 1:1 from `ds/subturtle/tokens/colors.css` (light) and `dark.css` (dark).
/// The dark theme does not pick new colours per component: it inverts each ramp
/// around its middle step, and keeps `rose500` and `jade500` exactly the same.
/// So a widget that says "soft background = rose100, text = rose700" is correct
/// in both themes without any `if (dark)` code. Read the ramp, not a hex value.
///
/// Get it with `context.st` (see [StThemeContext]).
@immutable
class StColors extends ThemeExtension<StColors> {
  const StColors({
    required this.brightness,
    required this.rose50,
    required this.rose100,
    required this.rose200,
    required this.rose300,
    required this.rose400,
    required this.rose500,
    required this.rose600,
    required this.rose700,
    required this.rose800,
    required this.rose900,
    required this.jade50,
    required this.jade100,
    required this.jade200,
    required this.jade300,
    required this.jade400,
    required this.jade500,
    required this.jade600,
    required this.jade700,
    required this.jade800,
    required this.jade900,
    required this.ink950,
    required this.ink900,
    required this.ink800,
    required this.ink700,
    required this.ink600,
    required this.ink500,
    required this.ink400,
    required this.ink300,
    required this.ink200,
    required this.ink150,
    required this.ink100,
    required this.ink50,
    required this.paper,
    required this.white,
    required this.amber100,
    required this.amber500,
    required this.amber600,
    required this.red100,
    required this.red500,
    required this.red600,
    required this.sky100,
    required this.sky500,
    required this.sky600,
    required this.primaryHover,
    required this.primaryPress,
    required this.onPrimary,
    required this.accentHover,
    required this.onAccent,
    required this.textOnDark,
    required this.textLink,
    required this.surfaceCard,
    required this.surfaceRaised,
    required this.surfaceSunken,
    required this.surfaceInverse,
    required this.surfaceOverlay,
    required this.surfaceTopbar,
    required this.ringFocus,
  });

  final Brightness brightness;

  // Brand: rose (primary).
  final Color rose50, rose100, rose200, rose300, rose400, rose500, rose600, rose700, rose800, rose900;

  // Grow: jade (progress, streak, learned).
  final Color jade50, jade100, jade200, jade300, jade400, jade500, jade600, jade700, jade800, jade900;

  // Warm mauve neutrals.
  final Color ink950, ink900, ink800, ink700, ink600, ink500, ink400, ink300, ink200, ink150, ink100, ink50;

  /// Page background.
  final Color paper;

  /// The card neutral. Literal white in light; `#1e1826` in dark. Never use it for
  /// text that must stay white: use [onPrimary] or `Colors.white`.
  final Color white;

  // Semantic hues.
  final Color amber100, amber500, amber600, red100, red500, red600, sky100, sky500, sky600;

  // Aliases that are not a plain ramp step in at least one theme.
  final Color primaryHover, primaryPress, onPrimary, accentHover, onAccent;
  final Color textOnDark, textLink;
  final Color surfaceCard, surfaceRaised, surfaceSunken, surfaceInverse, surfaceOverlay, surfaceTopbar;
  final Color ringFocus;

  bool get isDark => brightness == Brightness.dark;

  // ---- Semantic aliases (same mapping in both themes) ----
  Color get primary => rose500;
  Color get primarySoft => rose100;
  Color get primaryTint => rose50;
  Color get accent => jade500;
  Color get accentSoft => jade100;
  Color get accentTint => jade50;

  Color get textStrong => ink950;
  Color get textBody => ink800;
  Color get textMuted => ink500;
  Color get textFaint => ink400;

  Color get surfacePage => paper;

  Color get borderSubtle => ink200;
  Color get borderDefault => ink300;
  Color get borderStrong => ink400;

  Color get success => jade500;
  Color get successSoft => jade100;
  Color get warning => amber500;
  Color get warningSoft => amber100;
  Color get danger => red500;
  Color get dangerSoft => red100;
  Color get info => sky500;
  Color get infoSoft => sky100;

  /// Light theme: `colors.css`.
  static const light = StColors(
    brightness: Brightness.light,
    rose50: Color(0xFFFFF1F5),
    rose100: Color(0xFFFFE3EC),
    rose200: Color(0xFFFECDDA),
    rose300: Color(0xFFFDA4BD),
    rose400: Color(0xFFFB6F96),
    rose500: Color(0xFFF91E5A),
    rose600: Color(0xFFE30B4B),
    rose700: Color(0xFFBD0840),
    rose800: Color(0xFF9C0A3A),
    rose900: Color(0xFF840D36),
    jade50: Color(0xFFECFDF6),
    jade100: Color(0xFFD2F9E8),
    jade200: Color(0xFFA8F0D3),
    jade300: Color(0xFF6EE2B9),
    jade400: Color(0xFF34CD9C),
    jade500: Color(0xFF14B485),
    jade600: Color(0xFF0A916C),
    jade700: Color(0xFF097458),
    jade800: Color(0xFF0A5C47),
    jade900: Color(0xFF094C3C),
    ink950: Color(0xFF1B1620),
    ink900: Color(0xFF271F2D),
    ink800: Color(0xFF382F3F),
    ink700: Color(0xFF4D4455),
    ink600: Color(0xFF665C6E),
    ink500: Color(0xFF857A8D),
    ink400: Color(0xFFA59DAC),
    ink300: Color(0xFFC9C2CF),
    ink200: Color(0xFFE6E0EA),
    ink150: Color(0xFFEEE9F1),
    ink100: Color(0xFFF4F0F6),
    ink50: Color(0xFFFAF8FB),
    paper: Color(0xFFF8F5F7),
    white: Color(0xFFFFFFFF),
    amber100: Color(0xFFFEF0D3),
    amber500: Color(0xFFF5A524),
    amber600: Color(0xFFD4860B),
    red100: Color(0xFFFFE2E2),
    red500: Color(0xFFEF4444),
    red600: Color(0xFFD92D2D),
    sky100: Color(0xFFDCF1FE),
    sky500: Color(0xFF1F9CF0),
    sky600: Color(0xFF0D7FCD),
    primaryHover: Color(0xFFE30B4B), // rose-600
    primaryPress: Color(0xFFBD0840), // rose-700
    onPrimary: Color(0xFFFFFFFF),
    accentHover: Color(0xFF0A916C), // jade-600
    onAccent: Color(0xFFFFFFFF),
    textOnDark: Color(0xFFFFFFFF),
    textLink: Color(0xFFE30B4B), // rose-600
    surfaceCard: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFF4F0F6), // ink-100
    surfaceInverse: Color(0xFF1B1620), // ink-950
    surfaceOverlay: Color(0x731B1620), // rgba(27,22,32,.45)
    surfaceTopbar: Color(0xCCF8F5F7), // rgba(248,245,247,.80)
    ringFocus: Color(0x59F91E5A), // rgba(249,30,90,.35)
  );

  /// Dark theme: `dark.css`. Ramps are inverted; rose500 and jade500 are unchanged.
  static const dark = StColors(
    brightness: Brightness.dark,
    rose50: Color(0xFF2C0C19),
    rose100: Color(0xFF481026),
    rose200: Color(0xFF6B1030),
    rose300: Color(0xFF9C0F3C),
    rose400: Color(0xFFD4114A),
    rose500: Color(0xFFF91E5A),
    rose600: Color(0xFFFF6D95),
    rose700: Color(0xFFFFA3BD),
    rose800: Color(0xFFFFC2D4),
    rose900: Color(0xFFFFD9E4),
    jade50: Color(0xFF0A241D),
    jade100: Color(0xFF0C3A2E),
    jade200: Color(0xFF0A5642),
    jade300: Color(0xFF0B7A5B),
    jade400: Color(0xFF0E9D73),
    jade500: Color(0xFF14B485),
    jade600: Color(0xFF3FD6A4),
    jade700: Color(0xFF78E7BD),
    jade800: Color(0xFFA5F0D2),
    jade900: Color(0xFFC8F7E4),
    ink950: Color(0xFFFAF8FB),
    ink900: Color(0xFFF2EEF4),
    ink800: Color(0xFFE4DEE8),
    ink700: Color(0xFFCDC5D3),
    ink600: Color(0xFFABA2B2),
    ink500: Color(0xFF8D8496),
    ink400: Color(0xFF6F6679),
    ink300: Color(0xFF4E4657),
    ink200: Color(0xFF3A3242),
    ink150: Color(0xFF322B3A),
    ink100: Color(0xFF2A2432),
    ink50: Color(0xFF221C29),
    paper: Color(0xFF15111A),
    white: Color(0xFF1E1826),
    amber100: Color(0xFF4A3311),
    amber500: Color(0xFFF7B249),
    amber600: Color(0xFFFFC978),
    red100: Color(0xFF4D1F22),
    red500: Color(0xFFF26363),
    red600: Color(0xFFFF8B8B),
    sky100: Color(0xFF10344D),
    sky500: Color(0xFF3FB0F7),
    sky600: Color(0xFF78C8FB),
    primaryHover: Color(0xFFD4114A), // rose-400: on dark, hover brightens
    primaryPress: Color(0xFF9C0F3C), // rose-300
    onPrimary: Color(0xFFFFFFFF),
    accentHover: Color(0xFF0E9D73), // jade-400
    onAccent: Color(0xFF06251C),
    textOnDark: Color(0xFFFAF8FB), // ink-950
    textLink: Color(0xFFFFA3BD), // rose-700
    surfaceCard: Color(0xFF1E1826),
    surfaceRaised: Color(0xFF262030),
    surfaceSunken: Color(0xFF1A1522),
    surfaceInverse: Color(0xFFF4F0F6),
    surfaceOverlay: Color(0x9E08050B), // rgba(8,5,11,.62)
    surfaceTopbar: Color(0xD115111A), // rgba(21,17,26,.82)
    ringFocus: Color(0x73F91E5A), // rgba(249,30,90,.45)
  );

  @override
  StColors copyWith() => this;

  /// Themes switch as a whole; interpolating 60 tokens buys nothing visible.
  @override
  StColors lerp(ThemeExtension<StColors>? other, double t) {
    if (other is! StColors) return this;
    return t < 0.5 ? this : other;
  }
}
