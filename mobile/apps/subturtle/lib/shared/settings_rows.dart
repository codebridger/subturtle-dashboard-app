import 'package:flutter/material.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

/// A labelled group of settings rows. The label says the scope ("Languages",
/// "English only", "All languages"), so every setting says what it changes.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, this.label, this.note, required this.children});
  final String? label;

  /// One line under the label, e.g. "These change German only."
  final String? note;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
            child: Semantics(header: true, child: StEyebrow(label!)),
          ),
        if (note != null) Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 6), child: Text(note!, style: StType.bodySmall.copyWith(color: c.textMuted))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          decoration: BoxDecoration(color: c.surfaceCard, border: Border.all(color: c.borderSubtle), borderRadius: StRadius.brLg),
          child: Column(children: children),
        ),
      ],
    );
  }
}

/// A row: label (and an optional second line) on the left, a value or a
/// control on the right. With [onTap] it is a button with a chevron.
class SettingsRow extends StatelessWidget {
  const SettingsRow({super.key, required this.label, this.sublabel, this.value, this.trailing, this.onTap, this.last = false, this.semanticLabel});

  final String label;
  final String? sublabel;

  /// Shown on the right in muted text (with a chevron when tappable).
  final Widget? value;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool last;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final row = Container(
      constraints: const BoxConstraints(minHeight: 52),
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: c.borderSubtle))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: StType.bodyMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w700)),
                if (sublabel != null) Text(sublabel!, style: StType.bodySmall.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.55),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (value != null) DefaultTextStyle.merge(style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w700), child: value!),
                  ?trailing,
                  if (onTap != null && trailing == null) ...[const SizedBox(width: 2), StIcon(StIcons.chevronRight, size: 16, color: c.textMuted)],
                ],
              ),
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return row;
    return Semantics(button: true, label: semanticLabel, child: StPressable(onTap: onTap, pressedScale: 1, child: row));
  }
}
