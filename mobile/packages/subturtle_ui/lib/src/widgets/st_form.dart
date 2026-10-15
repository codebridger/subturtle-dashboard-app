import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/st_icon.dart';
import '../theme/st_theme.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';
import 'st_pressable.dart';

/// Text field with a label, a leading icon and helper / error text.
/// Mirrors the design system `Input`: 1.5 px border that turns rose on focus,
/// with the 3 px focus ring around the whole box.
class StInput extends StatefulWidget {
  const StInput({
    super.key,
    this.controller,
    this.label,
    this.placeholder,
    this.icon,
    this.hint,
    this.error,
    this.enabled = true,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
    this.minLines = 1,
    this.maxLines = 1,
    this.autofocus = false,
    this.obscureText = false,
    this.textCapitalization = TextCapitalization.none,
    this.inputFormatters,
    this.sunken = false,
    this.trailing,
  });

  final TextEditingController? controller;
  final String? label;
  final String? placeholder;
  final String? icon;
  final String? hint;
  final String? error;
  final bool enabled;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final FocusNode? focusNode;
  final int minLines;
  final int maxLines;
  final bool autofocus;
  final bool obscureText;
  final TextCapitalization textCapitalization;
  final List<TextInputFormatter>? inputFormatters;

  /// Sunken fill (the Capture sentence box) instead of the card fill.
  final bool sunken;
  final Widget? trailing;

  @override
  State<StInput> createState() => _StInputState();
}

class _StInputState extends State<StInput> {
  late final FocusNode _focus = widget.focusNode ?? FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_onFocus);
  }

  void _onFocus() => setState(() => _focused = _focus.hasFocus);

  @override
  void dispose() {
    _focus.removeListener(_onFocus);
    if (widget.focusNode == null) _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final hasError = widget.error != null && widget.error!.isNotEmpty;
    final border = hasError ? c.danger : (_focused ? c.primary : c.borderDefault);
    final multi = widget.maxLines > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null) ...[
          Text(widget.label!, style: StType.base(size: 14, weight: FontWeight.w700, height: 1.3).copyWith(color: c.textStrong)),
          const SizedBox(height: 6),
        ],
        AnimatedContainer(
          duration: StMotion.fast,
          constraints: const BoxConstraints(minHeight: 48),
          padding: EdgeInsets.symmetric(horizontal: 14, vertical: multi ? 10 : 0),
          decoration: BoxDecoration(
            color: !widget.enabled ? c.ink100 : (widget.sunken ? c.surfaceSunken : c.surfaceCard),
            borderRadius: StRadius.brMd,
            border: Border.all(color: border, width: 1.5),
            boxShadow: _focused ? [BoxShadow(color: c.ringFocus, spreadRadius: 3)] : null,
          ),
          child: Row(
            crossAxisAlignment: multi ? CrossAxisAlignment.start : CrossAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[
                Padding(padding: EdgeInsets.only(top: multi ? 3 : 0), child: StIcon(widget.icon!, size: 18, color: c.textFaint)),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  enabled: widget.enabled,
                  autofocus: widget.autofocus,
                  obscureText: widget.obscureText,
                  keyboardType: widget.keyboardType ?? (multi ? TextInputType.multiline : null),
                  textInputAction: widget.textInputAction,
                  textCapitalization: widget.textCapitalization,
                  autofillHints: widget.autofillHints,
                  inputFormatters: widget.inputFormatters,
                  onChanged: widget.onChanged,
                  onSubmitted: widget.onSubmitted,
                  minLines: widget.minLines,
                  maxLines: widget.maxLines,
                  style: StType.base(size: 16, weight: FontWeight.w500, height: 1.5).copyWith(color: c.textStrong),
                  cursorColor: c.primary,
                  decoration: InputDecoration(
                    isDense: true,
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: multi ? 2 : 12),
                    hintText: widget.placeholder,
                    hintStyle: StType.base(size: 16, weight: FontWeight.w500, height: 1.5).copyWith(color: c.textFaint),
                  ),
                ),
              ),
              if (widget.trailing != null) widget.trailing!,
            ],
          ),
        ),
        if (hasError || widget.hint != null) ...[
          const SizedBox(height: 6),
          Semantics(
            liveRegion: hasError,
            child: Text(hasError ? widget.error! : widget.hint!, style: StType.bodySmall.copyWith(color: hasError ? c.danger : c.textMuted)),
          ),
        ],
      ],
    );
  }
}

/// One option of a [StSegmentedControl].
class StSegment<T> {
  const StSegment(this.value, this.label, {this.icon});
  final T value;
  final String label;
  final String? icon;
}

/// 2–4 exclusive options in a sunken pill track. Mirrors the design system
/// `SegmentedControl`. The selected pill is the card neutral, not literal white,
/// so it flips correctly in dark mode.
class StSegmentedControl<T> extends StatelessWidget {
  const StSegmentedControl({super.key, required this.segments, required this.value, required this.onChanged, this.small = false, this.block = false, this.enabled = true});

  final List<StSegment<T>> segments;
  final T value;
  final ValueChanged<T> onChanged;
  final bool small;
  final bool block;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    Widget seg(StSegment<T> s) {
      final on = s.value == value;
      final fg = on ? c.rose700 : c.textMuted;
      final pill = AnimatedContainer(
        duration: StMotion.fast,
        curve: StMotion.easeOut,
        height: small ? 32 : 40,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: on ? c.surfaceCard : Colors.transparent,
          borderRadius: StRadius.brPill,
          boxShadow: on ? context.stShadows.sm : null,
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (s.icon != null) ...[StIcon(s.icon!, size: 16, color: fg), const SizedBox(width: 6)],
            Flexible(child: Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.label.copyWith(color: fg))),
          ],
        ),
      );
      final tappable = Semantics(
        button: true,
        selected: on,
        inMutuallyExclusiveGroup: true,
        label: s.label,
        excludeSemantics: true,
        child: StPressable(
          pressedScale: 1,
          onTap: enabled && !on
              ? () {
                  HapticFeedback.selectionClick();
                  onChanged(s.value);
                }
              : null,
          child: pill,
        ),
      );
      return block ? Expanded(child: tappable) : tappable;
    }

    return Opacity(
      opacity: enabled ? 1 : 0.6,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: c.ink100, borderRadius: StRadius.brPill),
        child: Row(
          mainAxisSize: block ? MainAxisSize.max : MainAxisSize.min,
          children: [
            for (var i = 0; i < segments.length; i++) ...[if (i > 0) const SizedBox(width: 2), seg(segments[i])],
          ],
        ),
      ),
    );
  }
}

/// On/off switch: rose track when on, a white knob that springs across.
/// Mirrors the design system `Switch` (46 × 26).
class StSwitch extends StatelessWidget {
  const StSwitch({super.key, required this.value, required this.onChanged, required this.semanticLabel});

  final bool value;
  final ValueChanged<bool>? onChanged;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      toggled: value,
      enabled: onChanged != null,
      label: semanticLabel,
      excludeSemantics: true,
      child: StPressable(
        pressedScale: 1,
        onTap: onChanged == null ? null : () => onChanged!(!value),
        child: SizedBox(
          width: StSpace.minTap,
          height: StSpace.minTap,
          child: Center(
            child: AnimatedContainer(
              duration: StMotion.base,
              curve: StMotion.easeOut,
              width: 46,
              height: 26,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(color: value ? c.primary : c.ink300, borderRadius: StRadius.brPill),
              child: AnimatedAlign(
                duration: StMotion.base,
                curve: StMotion.spring,
                alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: context.stShadows.sm),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
