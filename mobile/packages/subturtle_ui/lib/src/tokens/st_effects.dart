import 'package:flutter/material.dart';

/// Spacing scale from `spacing.css` (4 dp grid), plus the phone gutter.
abstract final class StSpace {
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
  static const double s12 = 48;
  static const double s16 = 64;

  /// Side gutter of every phone screen.
  static const double gutter = 16;

  /// Control heights (`--control-h-sm/md/lg`).
  static const double controlSm = 32;
  static const double controlMd = 40;
  static const double controlLg = 48;

  /// Smallest tap area on the phone (Material 48 dp, also covers Apple's 44 pt).
  static const double minTap = 48;
}

/// Corner radius from `effects.css`.
abstract final class StRadius {
  static const double xs = 6;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 28;
  static const double x2l = 36;
  static const double pill = 999;

  static const BorderRadius brXs = BorderRadius.all(Radius.circular(xs));
  static const BorderRadius brSm = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius brMd = BorderRadius.all(Radius.circular(md));
  static const BorderRadius brLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius brXl = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius brPill = BorderRadius.all(Radius.circular(pill));
}

/// Motion tokens from `effects.css`, plus the phone-only ones from the mobile UX spec.
abstract final class StMotion {
  static const Duration fast = Duration(milliseconds: 120);
  static const Duration base = Duration(milliseconds: 200);
  static const Duration slow = Duration(milliseconds: 360);

  /// Flashcard flip (3D Y-rotate). With reduced motion it becomes [fast] crossfade.
  static const Duration flip = Duration(milliseconds: 280);

  /// A graded card leaving the screen.
  static const Duration swipeOut = Duration(milliseconds: 220);

  /// One beat of the "coach is speaking" ring (design: 1.4 s).
  static const Duration voicePulse = Duration(milliseconds: 1400);

  static const Curve easeOut = Cubic(0.22, 1, 0.36, 1);
  static const Curve easeInOut = Cubic(0.65, 0, 0.35, 1);
  static const Curve spring = Cubic(0.34, 1.56, 0.64, 1);

  /// True when the user asked the OS for less motion.
  static bool reduced(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;
}

/// Shadows from `effects.css` (light) and `dark.css` (dark). Warm, soft and low in
/// light mode; neutral black and deeper in dark mode.
@immutable
class StShadows extends ThemeExtension<StShadows> {
  const StShadows({
    required this.xs,
    required this.sm,
    required this.md,
    required this.lg,
    required this.xl,
    required this.primary,
    required this.accent,
  });

  final List<BoxShadow> xs, sm, md, lg, xl;

  /// Brand-tinted lift, only for the main action of a screen.
  final List<BoxShadow> primary;
  final List<BoxShadow> accent;

  static const _warm = Color(0xFF271F2D);

  static final light = StShadows(
    xs: [BoxShadow(color: _warm.withValues(alpha: 0.06), offset: const Offset(0, 1), blurRadius: 2)],
    sm: [
      BoxShadow(color: _warm.withValues(alpha: 0.07), offset: const Offset(0, 1), blurRadius: 3),
      BoxShadow(color: _warm.withValues(alpha: 0.05), offset: const Offset(0, 1), blurRadius: 2),
    ],
    md: [
      BoxShadow(color: _warm.withValues(alpha: 0.08), offset: const Offset(0, 4), blurRadius: 14),
      BoxShadow(color: _warm.withValues(alpha: 0.05), offset: const Offset(0, 2), blurRadius: 4),
    ],
    lg: [
      BoxShadow(color: _warm.withValues(alpha: 0.10), offset: const Offset(0, 12), blurRadius: 30),
      BoxShadow(color: _warm.withValues(alpha: 0.05), offset: const Offset(0, 4), blurRadius: 10),
    ],
    xl: [
      BoxShadow(color: _warm.withValues(alpha: 0.14), offset: const Offset(0, 24), blurRadius: 50),
      BoxShadow(color: _warm.withValues(alpha: 0.06), offset: const Offset(0, 8), blurRadius: 18),
    ],
    primary: [BoxShadow(color: const Color(0xFFF91E5A).withValues(alpha: 0.30), offset: const Offset(0, 8), blurRadius: 22)],
    accent: [BoxShadow(color: const Color(0xFF14B485).withValues(alpha: 0.28), offset: const Offset(0, 8), blurRadius: 22)],
  );

  static final dark = StShadows(
    xs: [BoxShadow(color: Colors.black.withValues(alpha: 0.50), offset: const Offset(0, 1), blurRadius: 2)],
    sm: [
      BoxShadow(color: Colors.black.withValues(alpha: 0.55), offset: const Offset(0, 1), blurRadius: 3),
      BoxShadow(color: Colors.black.withValues(alpha: 0.40), offset: const Offset(0, 1), blurRadius: 2),
    ],
    md: [
      BoxShadow(color: Colors.black.withValues(alpha: 0.50), offset: const Offset(0, 4), blurRadius: 14),
      BoxShadow(color: Colors.black.withValues(alpha: 0.40), offset: const Offset(0, 2), blurRadius: 4),
    ],
    lg: [
      BoxShadow(color: Colors.black.withValues(alpha: 0.55), offset: const Offset(0, 12), blurRadius: 30),
      BoxShadow(color: Colors.black.withValues(alpha: 0.40), offset: const Offset(0, 4), blurRadius: 10),
    ],
    xl: [
      BoxShadow(color: Colors.black.withValues(alpha: 0.60), offset: const Offset(0, 24), blurRadius: 50),
      BoxShadow(color: Colors.black.withValues(alpha: 0.45), offset: const Offset(0, 8), blurRadius: 18),
    ],
    primary: [BoxShadow(color: const Color(0xFFF91E5A).withValues(alpha: 0.40), offset: const Offset(0, 8), blurRadius: 24)],
    accent: [BoxShadow(color: const Color(0xFF14B485).withValues(alpha: 0.35), offset: const Offset(0, 8), blurRadius: 24)],
  );

  @override
  StShadows copyWith() => this;

  @override
  StShadows lerp(ThemeExtension<StShadows>? other, double t) {
    if (other is! StShadows) return this;
    return t < 0.5 ? this : other;
  }
}
