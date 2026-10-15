import 'package:flutter/material.dart';

import '../icons/st_icon.dart';
import '../theme/st_theme.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';
import 'st_pressable.dart';

/// Colour of a [StBadge] / [StProgressBar] / tile.
enum StBadgeColor { primary, accent, neutral, warning, danger, info }

/// Small pill label ("Due", "New", "Current"). Mirrors the design system `Badge`.
class StBadge extends StatelessWidget {
  const StBadge(this.label, {super.key, this.color = StBadgeColor.neutral, this.solid = false, this.icon});

  final String label;
  final StBadgeColor color;
  final bool solid;
  final String? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color fg) = solid
        ? switch (color) {
            StBadgeColor.primary => (c.primary, Colors.white),
            StBadgeColor.accent => (c.accent, Colors.white),
            StBadgeColor.neutral => (c.surfaceInverse, c.paper),
            StBadgeColor.warning => (c.warning, Colors.white),
            StBadgeColor.danger => (c.danger, Colors.white),
            StBadgeColor.info => (c.info, Colors.white),
          }
        : switch (color) {
            StBadgeColor.primary => (c.primarySoft, c.rose700),
            StBadgeColor.accent => (c.accentSoft, c.jade700),
            StBadgeColor.neutral => (c.ink100, c.ink700),
            StBadgeColor.warning => (c.warningSoft, c.amber600),
            StBadgeColor.danger => (c.dangerSoft, c.red600),
            StBadgeColor.info => (c.infoSoft, c.sky600),
          };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: StRadius.brPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[StIcon(icon!, size: 13, color: fg), const SizedBox(width: 5)],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: StType.base(size: 11, weight: FontWeight.w800, height: 1.4, letterSpacing: 0.22).copyWith(color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// Chip for languages, part of speech, and the tap-the-words chips in Capture.
/// Mirrors the design system `Tag`. With [onTap] it is a toggle button.
class StTag extends StatelessWidget {
  const StTag(this.label, {super.key, this.active = false, this.onTap, this.icon, this.large = false, this.semanticLabel});

  final String label;
  final bool active;
  final VoidCallback? onTap;
  final String? icon;

  /// 40 dp tall, 16 px text: the word chips in the save sheet.
  final bool large;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final fg = active ? c.rose700 : c.textBody;
    final chip = AnimatedContainer(
      duration: StMotion.fast,
      curve: StMotion.easeOut,
      constraints: BoxConstraints(minHeight: large ? 40 : 30),
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: large ? 6 : 4),
      decoration: BoxDecoration(
        color: active ? c.primarySoft : c.ink50,
        borderRadius: StRadius.brPill,
        border: Border.all(color: active ? c.rose200 : c.borderSubtle),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[StIcon(icon!, size: 15, color: fg), const SizedBox(width: 7)],
          Flexible(
            child: Text(
              label,
              style: (large ? StType.base(size: 16, weight: FontWeight.w700, height: 1.3) : StType.labelMedium).copyWith(color: fg),
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return chip;
    return Semantics(
      button: true,
      toggled: active,
      label: semanticLabel ?? label,
      excludeSemantics: true,
      // Chips are 40 dp; pad the hit area to 48 as the spec asks.
      child: StPressable(onTap: onTap, pressedScale: 0.95, child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: chip)),
    );
  }
}

/// Round avatar with an image or initials. Mirrors the design system `Avatar`.
enum StAvatarSize { xs, sm, md, lg, xl }

class StAvatar extends StatelessWidget {
  const StAvatar({super.key, required this.name, this.imageUrl, this.size = StAvatarSize.md, this.background, this.foreground});

  final String name;
  final String? imageUrl;
  final StAvatarSize size;

  /// Custom fill, e.g. a coach voice's own colour.
  final Color? background;
  final Color? foreground;

  static double dimOf(StAvatarSize s) => switch (s) {
        StAvatarSize.xs => 28,
        StAvatarSize.sm => 36,
        StAvatarSize.md => 44,
        StAvatarSize.lg => 56,
        StAvatarSize.xl => 72,
      };

  /// First letter of the first two words: "Somi Park" → "SP".
  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => String.fromCharCode(p.runes.first)).join().toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final dim = dimOf(size);
    final initials = Text(
      initialsOf(name),
      style: StType.base(size: dim * 0.38, weight: FontWeight.w800, height: 1).copyWith(color: foreground ?? c.rose700),
    );
    return ExcludeSemantics(
      child: Container(
        width: dim,
        height: dim,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: background ?? c.primarySoft,
          border: Border.all(color: c.surfaceCard, width: 1.5),
          boxShadow: context.stShadows.xs,
        ),
        clipBehavior: Clip.antiAlias,
        alignment: Alignment.center,
        child: imageUrl == null || imageUrl!.isEmpty
            ? initials
            : Image.network(imageUrl!, width: dim, height: dim, fit: BoxFit.cover, errorBuilder: (_, _, _) => Center(child: initials)),
      ),
    );
  }
}

/// White card with a subtle border. Mirrors the design system `Card`.
class StCard extends StatelessWidget {
  const StCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(StSpace.s5),
    this.radius = StRadius.lg,
    this.elevation = StCardElevation.sm,
    this.onTap,
    this.onLongPress,
    this.color,
    this.borderColor,
    this.borderWidth = 1,
    this.semanticLabel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final StCardElevation elevation;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Color? color;
  final Color? borderColor;
  final double borderWidth;

  /// Label for the whole card when it is tappable.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final s = context.stShadows;
    final shadow = switch (elevation) {
      StCardElevation.none => null,
      StCardElevation.xs => s.xs,
      StCardElevation.sm => s.sm,
      StCardElevation.md => s.md,
      StCardElevation.lg => s.lg,
    };
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surfaceCard,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor ?? c.borderSubtle, width: borderWidth),
        boxShadow: shadow,
      ),
      child: child,
    );
    if (onTap == null && onLongPress == null) return box;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: StPressable(onTap: onTap, onLongPress: onLongPress, pressedScale: 0.985, child: box),
    );
  }
}

enum StCardElevation { none, xs, sm, md, lg }

/// Rounded progress bar. Mirrors the design system `ProgressBar`, with the
/// warning / danger fills the voice meter needs at 80% and 100%.
class StProgressBar extends StatelessWidget {
  const StProgressBar({super.key, required this.value, this.max = 100, this.color = StBadgeColor.primary, this.size = StSize3.md, this.semanticLabel});

  final double value;
  final double max;

  /// primary, accent, neutral, warning or danger.
  final StBadgeColor color;
  final StSize3 size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final pct = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    final fill = switch (color) {
      StBadgeColor.primary => c.primary,
      StBadgeColor.accent => c.accent,
      StBadgeColor.neutral => c.ink700,
      StBadgeColor.warning => c.warning,
      StBadgeColor.danger => c.danger,
      StBadgeColor.info => c.info,
    };
    final h = switch (size) {
      StSize3.sm => 6.0,
      StSize3.md => 10.0,
      StSize3.lg => 14.0,
    };
    return Semantics(
      label: semanticLabel,
      value: '${(pct * 100).round()}%',
      child: Container(
        height: h,
        decoration: BoxDecoration(color: c.ink150, borderRadius: StRadius.brPill),
        clipBehavior: Clip.antiAlias,
        alignment: Alignment.centerLeft,
        child: TweenAnimationBuilder<double>(
          tween: Tween(end: pct),
          duration: StMotion.reduced(context) ? Duration.zero : StMotion.slow,
          curve: StMotion.easeOut,
          builder: (context, v, _) => FractionallySizedBox(
            widthFactor: v,
            heightFactor: 1,
            child: DecoratedBox(decoration: BoxDecoration(color: fill, borderRadius: StRadius.brPill)),
          ),
        ),
      ),
    );
  }
}

/// sm / md / lg for widgets whose sizes are not control heights.
enum StSize3 { sm, md, lg }

/// Leitner level dots: done = jade, current = wide rose, later = ink-200.
/// Mirrors the design system `LevelPip`.
class StLevelPip extends StatelessWidget {
  const StLevelPip({super.key, required this.level, this.total = 5, this.label, this.size = StSize3.sm, this.showCount = true});

  final int level;
  final int total;
  final String? label;
  final StSize3 size;
  final bool showCount;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final dot = switch (size) {
      StSize3.sm => 8.0,
      StSize3.md => 12.0,
      StSize3.lg => 16.0,
    };
    return Semantics(
      label: 'Level $level of $total',
      excludeSemantics: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label!.toUpperCase(), style: StType.base(size: 11, weight: FontWeight.w800, height: 1.2, letterSpacing: 0.88).copyWith(color: c.textFaint)),
            const SizedBox(height: 6),
          ],
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var n = 1; n <= total; n++) ...[
                if (n > 1) const SizedBox(width: 5),
                AnimatedContainer(
                  duration: StMotion.base,
                  width: n == level ? dot * 1.6 : dot,
                  height: dot,
                  decoration: BoxDecoration(
                    borderRadius: StRadius.brPill,
                    color: n == level ? c.primary : (n < level ? c.accent : c.ink200),
                  ),
                ),
              ],
              if (showCount) ...[
                const SizedBox(width: 11),
                Text('$level / $total', style: StType.labelMedium.copyWith(color: c.textMuted)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// Uppercase eyebrow above a title (`.eyebrow`): rose, or faint for section labels.
class StEyebrow extends StatelessWidget {
  const StEyebrow(this.text, {super.key, this.color}) : section = false;

  /// A section label (`.section-label`): faint instead of rose.
  const StEyebrow.section(this.text, {super.key})
      : section = true,
        color = null;

  final String text;
  final Color? color;
  final bool section;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final fg = color ?? (section ? c.textFaint : c.primary);
    return Semantics(
      header: true,
      child: Text(text.toUpperCase(), style: StType.overline.copyWith(color: fg)),
    );
  }
}

/// A big number with an icon tile. Mirrors the design system `StatTile`; on the
/// phone it stacks vertically so three fit in a row.
class StStatTile extends StatelessWidget {
  const StStatTile({super.key, required this.value, required this.label, this.icon, this.accent = StBadgeColor.primary, this.compact = true});

  final String value;
  final String label;
  final String? icon;

  /// primary, accent, info or warning.
  final StBadgeColor accent;

  /// Vertical layout for a 3-up row on a phone.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color fg) = switch (accent) {
      StBadgeColor.accent => (c.accentSoft, c.jade600),
      StBadgeColor.info => (c.infoSoft, c.sky600),
      StBadgeColor.warning => (c.warningSoft, c.amber600),
      _ => (c.primarySoft, c.rose600),
    };
    final tile = icon == null
        ? null
        : Container(
            width: compact ? 32 : 52,
            height: compact ? 32 : 52,
            decoration: BoxDecoration(color: bg, borderRadius: compact ? StRadius.brSm : StRadius.brMd),
            alignment: Alignment.center,
            child: StIcon(icon!, size: compact ? 18 : 28, color: fg),
          );
    final number = Text(
      value,
      maxLines: 1,
      style: StType.base(size: 28, weight: FontWeight.w900, height: 1).copyWith(color: c.textStrong, fontFeatures: const [FontFeature.tabularFigures()]),
    );
    final caption = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      textAlign: compact ? TextAlign.center : TextAlign.start,
      style: compact ? StType.base(size: 12, weight: FontWeight.w700, height: 1.35).copyWith(color: c.textMuted) : StType.bodyMedium.copyWith(color: c.textMuted),
    );
    return Semantics(
      label: '$label: $value',
      excludeSemantics: true,
      child: Container(
        padding: compact ? const EdgeInsets.fromLTRB(8, 14, 8, 12) : const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          border: Border.all(color: c.borderSubtle),
          borderRadius: StRadius.brLg,
          boxShadow: compact ? context.stShadows.xs : context.stShadows.sm,
        ),
        // Compact: icon chip, number, label, each centred on its own line, so
        // three tiles fit in a row on a phone without the text wrapping.
        child: compact
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ?tile,
                  if (tile != null) const SizedBox(height: 8),
                  FittedBox(fit: BoxFit.scaleDown, child: number),
                  const SizedBox(height: 2),
                  caption,
                ],
              )
            : Row(children: [?tile, const SizedBox(width: 16), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [number, caption]))]),
      ),
    );
  }
}

/// Icon, title, text and an optional action. Mirrors the design system `EmptyState`.
/// Used for empty lists and for inline error states ("We couldn't load …").
class StEmptyState extends StatelessWidget {
  const StEmptyState({
    super.key,
    required this.title,
    this.description,
    this.icon,
    this.color = StBadgeColor.primary,
    this.action,
    this.compact = false,
  });

  final String title;
  final String? description;
  final String? icon;

  /// primary, accent or neutral.
  final StBadgeColor color;
  final Widget? action;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color fg) = switch (color) {
      StBadgeColor.accent => (c.accentSoft, c.accent),
      StBadgeColor.neutral => (c.ink100, c.textMuted),
      StBadgeColor.danger => (c.dangerSoft, c.danger),
      StBadgeColor.warning => (c.warningSoft, c.amber600),
      _ => (c.primarySoft, c.primary),
    };
    return Padding(
      padding: compact ? const EdgeInsets.symmetric(horizontal: 20, vertical: 24) : const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Container(
              width: compact ? 48 : 64,
              height: compact ? 48 : 64,
              decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: StIcon(icon!, size: compact ? 24 : 30, color: fg),
            ),
          SizedBox(height: compact ? 10 : 14),
          Semantics(
            header: true,
            child: Text(title, textAlign: TextAlign.center, style: (compact ? StType.titleMedium : StType.titleLarge).copyWith(color: c.textStrong, fontWeight: FontWeight.w900)),
          ),
          if (description != null) ...[
            const SizedBox(height: 7),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Text(description!, textAlign: TextAlign.center, style: StType.bodyMedium.copyWith(color: c.textMuted)),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

/// Learner-language (L1) text, e.g. a Persian translation inside an English card.
///
/// The app layout stays LTR; only this string turns RTL when [rtl] is true. The
/// caller decides [rtl] from the user's L1 setting, not by guessing from the text.
/// Arabic-script lines get Vazirmatn first and 10% more line height.
class StL1Text extends StatelessWidget {
  const StL1Text(this.text, {super.key, required this.rtl, this.style, this.align, this.maxLines, this.languageName});

  final String text;
  final bool rtl;
  final TextStyle? style;

  /// Defaults to the start of the text's own direction (right for Persian).
  final TextAlign? align;
  final int? maxLines;

  /// Spoken before the text by screen readers, e.g. "Persian".
  final String? languageName;

  @override
  Widget build(BuildContext context) {
    final base = style ?? StType.bodyLarge.copyWith(color: context.st.textStrong);
    final effective = rtl
        ? base.copyWith(
            fontFamily: StType.vazirmatn,
            package: StType.package,
            fontFamilyFallback: const [StType.nunito],
            height: (base.height ?? 1.5) * 1.1,
          )
        : base;
    return Semantics(
      label: languageName == null ? null : '$languageName: $text',
      excludeSemantics: languageName != null,
      child: Directionality(
        textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
        child: Text(
          text,
          style: effective,
          textAlign: align ?? TextAlign.start,
          maxLines: maxLines,
          overflow: maxLines == null ? null : TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

/// A row that looks like a select field: icon, value and a chevron (bundle and voice pickers).
class StPickerRow extends StatelessWidget {
  const StPickerRow({super.key, required this.value, this.leading, this.onTap, this.semanticLabel, this.trailingIcon = StIcons.chevronDown});

  final String value;
  final Widget? leading;
  final VoidCallback? onTap;
  final String? semanticLabel;
  final String trailingIcon;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      label: semanticLabel ?? value,
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd, border: Border.all(color: c.borderDefault)),
          child: Row(
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 10)],
              Expanded(child: Text(value, style: StType.base(size: 16, weight: FontWeight.w700, height: 1.3).copyWith(color: c.textStrong))),
              StIcon(trailingIcon, size: 18, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
