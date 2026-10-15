import 'package:flutter/material.dart';

import '../tokens/st_effects.dart';

/// Shared press feedback for Subturtle controls: a small spring scale on press
/// (the web's `active:scale-[0.97]`), no ripple. Turned off under reduced motion.
class StPressable extends StatefulWidget {
  const StPressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.pressedScale = 0.97,
    this.behavior = HitTestBehavior.opaque,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double pressedScale;
  final HitTestBehavior behavior;

  @override
  State<StPressable> createState() => _StPressableState();
}

class _StPressableState extends State<StPressable> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null || widget.onLongPress != null;
    final reduced = StMotion.reduced(context);
    return GestureDetector(
      behavior: widget.behavior,
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      onTapDown: enabled ? (_) => _set(true) : null,
      onTapUp: enabled ? (_) => _set(false) : null,
      onTapCancel: enabled ? () => _set(false) : null,
      child: AnimatedScale(
        scale: _down && !reduced ? widget.pressedScale : 1,
        duration: StMotion.fast,
        curve: _down ? StMotion.easeOut : StMotion.spring,
        child: widget.child,
      ),
    );
  }
}
