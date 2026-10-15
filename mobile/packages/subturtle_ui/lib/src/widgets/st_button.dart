import 'package:flutter/material.dart';

import '../icons/st_icon.dart';
import '../theme/st_theme.dart';
import '../tokens/st_colors.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';
import 'st_pressable.dart';

/// Colour role of a control. Same names as the web kit (`StTone`).
enum StTone { primary, accent, neutral, danger }

/// Visual weight of a button.
enum StButtonVariant { solid, soft, outline, ghost }

/// Control size: 32 / 40 / 48 dp tall.
enum StSize { sm, md, lg }

/// Resolved colours for one variant × tone, ported from `Button.jsx` / `StButton.vue`.
class StButtonLook {
  const StButtonLook({required this.background, required this.foreground, this.border, this.shadow});
  final Color background;
  final Color foreground;
  final Color? border;
  final List<BoxShadow>? shadow;

  static StButtonLook of(BuildContext context, StButtonVariant variant, StTone tone) {
    final c = context.st;
    final s = context.stShadows;
    return resolve(c, s, variant, tone);
  }

  static StButtonLook resolve(StColors c, StShadows s, StButtonVariant variant, StTone tone) {
    switch (variant) {
      case StButtonVariant.solid:
        return switch (tone) {
          StTone.primary => StButtonLook(background: c.primary, foreground: c.onPrimary, shadow: s.primary),
          StTone.accent => StButtonLook(background: c.accent, foreground: c.onAccent, shadow: s.accent),
          // The ink ramp inverts in dark, so neutral pairs surface-inverse with paper.
          StTone.neutral => StButtonLook(background: c.surfaceInverse, foreground: c.paper, shadow: s.sm),
          StTone.danger => StButtonLook(background: c.danger, foreground: Colors.white, shadow: s.sm),
        };
      case StButtonVariant.soft:
        return switch (tone) {
          StTone.primary => StButtonLook(background: c.primaryTint, foreground: c.rose700),
          StTone.accent => StButtonLook(background: c.accentTint, foreground: c.jade700),
          StTone.neutral => StButtonLook(background: c.ink50, foreground: c.ink900),
          StTone.danger => StButtonLook(background: c.dangerSoft, foreground: c.red600),
        };
      case StButtonVariant.outline:
        return switch (tone) {
          StTone.primary => StButtonLook(background: Colors.transparent, foreground: c.rose700, border: c.primary),
          StTone.accent => StButtonLook(background: Colors.transparent, foreground: c.jade700, border: c.accent),
          StTone.neutral => StButtonLook(background: Colors.transparent, foreground: c.ink900, border: c.ink900),
          StTone.danger => StButtonLook(background: Colors.transparent, foreground: c.red600, border: c.danger),
        };
      case StButtonVariant.ghost:
        return switch (tone) {
          StTone.primary => StButtonLook(background: Colors.transparent, foreground: c.rose700),
          StTone.accent => StButtonLook(background: Colors.transparent, foreground: c.jade700),
          StTone.neutral => StButtonLook(background: Colors.transparent, foreground: c.ink700),
          StTone.danger => StButtonLook(background: Colors.transparent, foreground: c.red600),
        };
    }
  }
}

/// The Subturtle button. Mirrors the design system `Button`.
///
/// - [variant] × [tone] picks the colours (solid primary is the one rose CTA per screen).
/// - [size]: sm 32, md 40, lg 48 dp. Main phone actions use `lg`.
/// - [loading] shows a spinner in place of the icon and blocks taps.
/// - The tap area is padded to 48 dp tall even for sm/md, as the mobile spec asks.
class StButton extends StatelessWidget {
  const StButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = StButtonVariant.solid,
    this.tone = StTone.primary,
    this.size = StSize.md,
    this.block = false,
    this.pill = false,
    this.icon,
    this.iconRight,
    this.loading = false,
    this.semanticLabel,
    this.emphasis = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final StButtonVariant variant;
  final StTone tone;
  final StSize size;
  final bool block;
  final bool pill;
  final String? icon;
  final String? iconRight;
  final bool loading;
  final String? semanticLabel;

  /// A stronger border, used for the suggested grade after a cloze check.
  final bool emphasis;

  bool get _enabled => onPressed != null && !loading;

  @override
  Widget build(BuildContext context) {
    final look = StButtonLook.of(context, variant, tone);
    final height = switch (size) {
      StSize.sm => StSpace.controlSm,
      StSize.md => StSpace.controlMd,
      StSize.lg => StSpace.controlLg,
    };
    final padX = switch (size) {
      StSize.sm => 14.0,
      StSize.md => 20.0,
      StSize.lg => 26.0,
    };
    final gap = switch (size) {
      StSize.sm => 6.0,
      StSize.md => 8.0,
      StSize.lg => 10.0,
    };
    final iconSize = switch (size) {
      StSize.sm => 16.0,
      StSize.md => 18.0,
      StSize.lg => 20.0,
    };
    final text = (size == StSize.lg ? StType.labelLarge : StType.label).copyWith(color: look.foreground);

    Widget leading() {
      if (loading) {
        return SizedBox(
          width: iconSize,
          height: iconSize,
          child: CircularProgressIndicator(strokeWidth: 2.2, color: look.foreground),
        );
      }
      return StIcon(icon!, size: iconSize, color: look.foreground);
    }

    final content = Row(
      mainAxisSize: block ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null || loading) ...[leading(), SizedBox(width: gap)],
        Flexible(child: Text(label, style: text, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center)),
        if (iconRight != null) ...[SizedBox(width: gap), StIcon(iconRight!, size: iconSize, color: look.foreground)],
      ],
    );

    final borderWidth = emphasis ? 2.5 : 1.5;
    final box = AnimatedContainer(
      duration: StMotion.fast,
      curve: StMotion.easeOut,
      constraints: BoxConstraints(minHeight: height),
      padding: EdgeInsets.symmetric(horizontal: padX),
      decoration: BoxDecoration(
        color: look.background,
        borderRadius: pill ? StRadius.brPill : StRadius.brMd,
        border: Border.all(color: look.border ?? Colors.transparent, width: borderWidth),
        boxShadow: _enabled ? look.shadow : null,
      ),
      alignment: Alignment.center,
      child: content,
    );

    final padY = ((StSpace.minTap - height) / 2).clamp(0.0, 8.0);
    return Semantics(
      button: true,
      enabled: _enabled,
      label: semanticLabel ?? label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null ? 0.5 : 1,
        child: StPressable(
          onTap: _enabled ? onPressed : null,
          child: Padding(padding: EdgeInsets.symmetric(vertical: padY), child: box),
        ),
      ),
    );
  }
}

/// Square icon-only button. Mirrors the design system `IconButton`.
/// The visible box is 32/40/48 dp; the tap area is always at least 48 dp.
/// [semanticLabel] is required: the button has no text.
class StIconButton extends StatelessWidget {
  const StIconButton({
    super.key,
    required this.icon,
    required this.semanticLabel,
    this.onPressed,
    this.variant = StButtonVariant.soft,
    this.tone = StTone.neutral,
    this.size = StSize.md,
    this.round = false,
    this.color,
  });

  final String icon;
  final String semanticLabel;
  final VoidCallback? onPressed;

  /// solid, soft or ghost (outline is not part of the DS IconButton).
  final StButtonVariant variant;
  final StTone tone;
  final StSize size;
  final bool round;

  /// Overrides the icon colour (for top-bar icons that use text-strong).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final dim = switch (size) {
      StSize.sm => 32.0,
      StSize.md => 40.0,
      StSize.lg => 48.0,
    };
    final iconSize = switch (size) {
      StSize.sm => 16.0,
      StSize.md => 20.0,
      StSize.lg => 24.0,
    };
    // IconButton soft/ghost use the 600 step for the glyph (one lighter than Button).
    final (Color bg, Color fg) = switch ((variant, tone)) {
      (StButtonVariant.solid, StTone.primary) => (c.primary, c.onPrimary),
      (StButtonVariant.solid, StTone.accent) => (c.accent, c.onAccent),
      (StButtonVariant.solid, StTone.neutral) => (c.surfaceInverse, c.paper),
      (StButtonVariant.solid, StTone.danger) => (c.danger, Colors.white),
      (StButtonVariant.soft, StTone.primary) => (c.primaryTint, c.rose600),
      (StButtonVariant.soft, StTone.accent) => (c.accentTint, c.jade600),
      (StButtonVariant.soft, StTone.neutral) => (c.ink50, c.ink700),
      (StButtonVariant.soft, StTone.danger) => (c.dangerSoft, c.red600),
      (_, StTone.primary) => (Colors.transparent, c.rose600),
      (_, StTone.accent) => (Colors.transparent, c.jade600),
      (_, StTone.neutral) => (Colors.transparent, c.ink700),
      (_, StTone.danger) => (Colors.transparent, c.red600),
    };
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: semanticLabel,
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null ? 0.45 : 1,
        child: StPressable(
          pressedScale: 0.92,
          onTap: onPressed,
          child: SizedBox(
            width: dim < StSpace.minTap ? StSpace.minTap : dim,
            height: dim < StSpace.minTap ? StSpace.minTap : dim,
            child: Center(
              child: Container(
                width: dim,
                height: dim,
                decoration: BoxDecoration(color: bg, borderRadius: round ? StRadius.brPill : StRadius.brMd),
                alignment: Alignment.center,
                child: StIcon(icon, size: iconSize, color: color ?? fg),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A plain 48 dp top-bar icon button (`.tb` in mobile.css): no fill, text-strong glyph.
class StTopBarButton extends StatelessWidget {
  const StTopBarButton({super.key, required this.icon, required this.semanticLabel, this.onPressed, this.iconSize = 26});

  final String icon;
  final String semanticLabel;
  final VoidCallback? onPressed;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: StPressable(
        pressedScale: 0.92,
        onTap: onPressed,
        child: SizedBox(
          width: StSpace.minTap,
          height: StSpace.minTap,
          child: Center(child: StIcon(icon, size: iconSize, color: context.st.textStrong)),
        ),
      ),
    );
  }
}
