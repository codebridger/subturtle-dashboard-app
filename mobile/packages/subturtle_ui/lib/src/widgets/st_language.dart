import 'package:flutter/material.dart';

import '../icons/st_icon.dart';
import '../theme/st_theme.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';
import 'st_button.dart';
import 'st_pressable.dart';

/// The shared language parts of 2.0 (design: Part-LanguagePill,
/// Part-LanguagePicker, Part-LanguageRow). They hold no app logic: the app
/// passes names, counts and callbacks.

/// A language code in a soft square or circle ("DE").
class StLanguageChip extends StatelessWidget {
  const StLanguageChip(this.code, {super.key, this.size = 44, this.round = false, this.selected = false, this.dashed = false, this.tone});

  final String code;
  final double size;
  final bool round;

  /// The ticked row of a picker (jade).
  final bool selected;

  /// A language that is not in the learner's list yet (sky, dashed).
  final bool dashed;

  /// Overrides the colours: `primary` (rose, the pill) or `kept` (jade).
  final String? tone;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color ink) = switch (tone) {
      'primary' => (c.primarySoft, c.rose700),
      'kept' => (c.accentSoft, c.jade700),
      _ when dashed => (c.surfaceCard, c.sky600),
      _ when selected => (c.surfaceCard, c.jade700),
      _ => (c.ink100, c.ink700),
    };
    final radius = round ? StRadius.brPill : StRadius.brMd;
    final box = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: radius),
      child: Text(code.toUpperCase(), style: StType.base(size: size < 40 ? 12 : 14, weight: FontWeight.w900, height: 1).copyWith(color: ink)),
    );
    if (!dashed) return ExcludeSemantics(child: box);
    return ExcludeSemantics(
      child: CustomPaint(foregroundPainter: _DashedBorder(color: c.sky600, radius: round ? size / 2 : StRadius.md), child: box),
    );
  }
}

/// The language pill at the top of Today and Bundles: the one place the
/// learner sees and changes the active language. [level] is where the learner
/// started ("Starting at B1"), never a measured level.
class StLanguagePill extends StatelessWidget {
  const StLanguagePill({super.key, required this.code, required this.name, required this.level, this.caption, this.onTap});

  final String code;
  final String name;
  final String level;

  /// Before the level, e.g. "Saves go here".
  final String? caption;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final sub = caption == null ? 'Starting at $level' : '$caption · Starting at $level';
    return Semantics(
      button: true,
      label: 'Change language. Learning $name, starting at $level',
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        child: Container(
          height: 48,
          padding: const EdgeInsets.only(left: 6, right: 12),
          decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brPill, border: Border.all(color: c.borderDefault)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StLanguageChip(code, size: 34, round: true, tone: 'primary'),
              const SizedBox(width: 8),
              Flexible(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.15).copyWith(color: c.textStrong)),
                    Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.base(size: 11, weight: FontWeight.w700, height: 1.2).copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              StIcon(StIcons.chevronDown, size: 16, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// One row of the language picker: chip, "German · Deutsch", a meta line
/// ("Starting at A1 · 7 due · 38 phrases") and a tick on the active row.
class StLanguageOption extends StatelessWidget {
  const StLanguageOption({super.key, required this.code, required this.title, this.meta, this.selected = false, this.onTap, this.trailing});

  final String code;
  final String title;
  final String? meta;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: onTap != null,
      selected: selected,
      label: [title, ?meta, if (selected) 'active'].join(', '),
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 68),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? c.accentTint : c.surfaceCard,
            borderRadius: StRadius.brLg,
            border: Border.all(color: selected ? c.jade500 : c.borderDefault, width: selected ? 2 : 1),
          ),
          child: Row(
            children: [
              StLanguageChip(code, selected: selected),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: StType.base(size: 16, weight: FontWeight.w800, height: 1.3).copyWith(color: c.textStrong)),
                    if (meta != null) Text(meta!, style: StType.bodySmall.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              ?trailing,
              if (trailing == null && selected) StIcon(StIcons.checkDuo, size: 26, color: c.jade600),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Add a language" with a dashed border and "2 of 10 used".
class StLanguageAddRow extends StatelessWidget {
  const StLanguageAddRow({super.key, this.note, this.usedText, this.onTap, this.label = 'Add a language'});

  final String label;
  final String? note;
  final String? usedText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      label: [label, ?note, ?usedText].join(', '),
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: CustomPaint(
          foregroundPainter: _DashedBorder(color: c.borderStrong, radius: StRadius.lg, width: 1.5),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              children: [
                StIcon(StIcons.add, size: 24, color: c.rose600),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(label, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.25).copyWith(color: c.textStrong)),
                      if (note != null) Text(note!, style: StType.bodySmall.copyWith(color: c.textMuted)),
                    ],
                  ),
                ),
                if (usedText != null) Text(usedText!, style: StType.labelMedium.copyWith(color: c.textMuted)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The plan-limit card that replaces "Add a language" at the plan's limit.
/// No popup: it sits where the add row was.
class StPlanLimitCard extends StatelessWidget {
  const StPlanLimitCard({super.key, required this.text, this.actionLabel, this.onAction, this.secondaryLabel, this.onSecondary});

  final String text;

  /// "See plans" or "Upgrade". Null hides the button (store builds that may
  /// not link to an outside purchase).
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(color: c.primaryTint, borderRadius: StRadius.brLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StIcon(StIcons.crown, size: 22, color: c.rose600),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: StType.bodyMedium.copyWith(color: c.textBody, height: 1.4))),
            ],
          ),
          if (actionLabel != null || secondaryLabel != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (actionLabel != null) StButton(label: actionLabel!, size: StSize.sm, onPressed: onAction),
                if (secondaryLabel != null) StButton(label: secondaryLabel!, size: StSize.sm, variant: StButtonVariant.soft, tone: StTone.neutral, onPressed: onSecondary),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// The three states of the save window's language row (Part-LanguageRow).
enum StSaveLanguageState {
  /// The detected language is the active one.
  active,

  /// Another language the learner studies: the phrase saves there and the
  /// active language does not change.
  other,

  /// Not in the learner's languages: "Save to English" or "Keep for German".
  missing,

  /// The learner chose "Save to English" for a missing language.
  savedToActive,

  /// The learner chose "Keep for German".
  kept,
}

/// Where a phrase will be saved, shown in the save sheet.
class StSaveLanguageRow extends StatelessWidget {
  const StSaveLanguageRow({
    super.key,
    required this.state,
    required this.code,
    required this.name,
    required this.activeName,
    this.onChange,
    this.onSaveToActive,
    this.onKeep,
    this.onUndo,
    this.onAddLanguage,
  });

  final StSaveLanguageState state;

  /// The phrase's (detected or chosen) language.
  final String code;
  final String name;

  /// The active language's name ("English").
  final String activeName;
  final VoidCallback? onChange;
  final VoidCallback? onSaveToActive;
  final VoidCallback? onKeep;
  final VoidCallback? onUndo;
  final VoidCallback? onAddLanguage;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (String title, String saves, String chipCode, String? tone, bool dashed) = switch (state) {
      StSaveLanguageState.active => ('$name · detected', 'Saves to your $name profile', code, 'primary', false),
      StSaveLanguageState.other => ('$name · detected', 'Saves to your $name profile. You stay in $activeName.', code, 'primary', false),
      StSaveLanguageState.missing => ('This looks like $name', '$name is not in your languages yet', code, null, true),
      StSaveLanguageState.savedToActive => ('Saves to $activeName', 'You chose $activeName for this phrase', activeName.length >= 2 ? activeName.substring(0, 2) : activeName, 'primary', false),
      StSaveLanguageState.kept => ('Kept for $name', 'It joins $name when you add it. Kept for 30 days.', code, 'kept', false),
    };
    final picked = state == StSaveLanguageState.savedToActive || state == StSaveLanguageState.kept;
    final bodySmall = StType.bodySmall.copyWith(color: c.textMuted);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: state == StSaveLanguageState.kept ? c.accentTint : c.surfaceSunken, borderRadius: StRadius.brLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StLanguageChip(chipCode, size: 36, round: true, tone: tone, dashed: dashed),
              const SizedBox(width: 10),
              Expanded(
                child: Semantics(
                  liveRegion: picked,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.25).copyWith(color: c.textStrong)),
                      Text(saves, style: bodySmall),
                    ],
                  ),
                ),
              ),
              if (!picked && state != StSaveLanguageState.missing && onChange != null)
                StButton(label: 'Change', size: StSize.sm, variant: StButtonVariant.soft, tone: StTone.neutral, onPressed: onChange, semanticLabel: 'Change the language of this phrase'),
              if (picked && onUndo != null) StButton(label: 'Undo', size: StSize.sm, variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: onUndo),
            ],
          ),
          if (state == StSaveLanguageState.missing) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: StButton(label: 'Save to $activeName', variant: StButtonVariant.soft, tone: StTone.neutral, onPressed: onSaveToActive)),
                const SizedBox(width: 8),
                Expanded(child: StButton(label: 'Keep for $name', onPressed: onKeep)),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('Keep holds the phrase until you add $name. Or ', style: bodySmall),
                if (onAddLanguage != null)
                  Semantics(
                    link: true,
                    child: GestureDetector(
                      onTap: onAddLanguage,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text('add $name now', style: bodySmall.copyWith(color: c.textLink, fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ),
                Text('.', style: bodySmall),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DashedBorder extends CustomPainter {
  _DashedBorder({required this.color, required this.radius, this.width = 1.5});
  final Color color;
  final double radius;
  final double width;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = width;
    final rect = Offset.zero & size;
    final path = Path()..addRRect(RRect.fromRectAndRadius(rect.deflate(width / 2), Radius.circular(radius)));
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + 5), paint);
        d += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) => old.color != color || old.radius != radius || old.width != width;
}
