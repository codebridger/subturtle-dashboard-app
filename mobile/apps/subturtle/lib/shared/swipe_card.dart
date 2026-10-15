import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

/// A card that can be swiped left or right to act on it.
///
/// - Only works when [enabled]; before that a swipe bounces back and calls [onBlocked].
/// - Threshold: 35% of the width, or a fling over 800 dp/s.
/// - Tilts up to 8° and fades in [leftLabel] / [rightLabel] while dragging.
/// - [onThreshold] fires once when the drag crosses the threshold (for a light haptic).
/// - Under reduced motion the card leaves with a fade instead of a fly-out.
class SwipeCard extends StatefulWidget {
  const SwipeCard({
    super.key,
    required this.child,
    required this.enabled,
    this.onLeft,
    this.onRight,
    this.onBlocked,
    this.onThreshold,
    this.leftLabel,
    this.rightLabel,
  });

  final Widget child;
  final bool enabled;
  final VoidCallback? onLeft;
  final VoidCallback? onRight;
  final VoidCallback? onBlocked;
  final VoidCallback? onThreshold;
  final Widget? leftLabel;
  final Widget? rightLabel;

  @override
  State<SwipeCard> createState() => _SwipeCardState();
}

class _SwipeCardState extends State<SwipeCard> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this);
  double _dx = 0;
  double _width = 1;
  bool _past = false;
  Animation<double>? _anim;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(() {
      if (_anim != null) setState(() => _dx = _anim!.value);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _animateTo(double target, {required Duration duration, Curve curve = Curves.easeOut, VoidCallback? done}) {
    _anim = Tween<double>(begin: _dx, end: target).animate(CurvedAnimation(parent: _ctrl, curve: curve));
    _ctrl
      ..duration = duration
      ..forward(from: 0).whenComplete(() => done?.call());
  }

  bool get _canLeft => widget.onLeft != null;
  bool get _canRight => widget.onRight != null;

  void _update(DragUpdateDetails d) {
    var next = _dx + d.delta.dx;
    if (!widget.enabled) next = _dx + d.delta.dx * 0.25; // resist
    if (next < 0 && !_canLeft) next = next * 0.3;
    if (next > 0 && !_canRight) next = next * 0.3;
    final past = widget.enabled && next.abs() > _width * 0.35 && ((next < 0 && _canLeft) || (next > 0 && _canRight));
    if (past && !_past) widget.onThreshold?.call();
    setState(() {
      _dx = next;
      _past = past;
    });
  }

  void _end(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond.dx;
    final reduced = StMotion.reduced(context);
    if (!widget.enabled) {
      if (_dx.abs() > 12) widget.onBlocked?.call();
      _animateTo(0, duration: const Duration(milliseconds: 260), curve: StMotion.spring);
      return;
    }
    final goLeft = _canLeft && (_dx < -_width * 0.35 || v < -800);
    final goRight = _canRight && (_dx > _width * 0.35 || v > 800);
    if (goLeft || goRight) {
      final target = (goLeft ? -1 : 1) * _width * 1.4;
      void fire() {
        setState(() {
          _dx = 0;
          _past = false;
        });
        (goLeft ? widget.onLeft : widget.onRight)?.call();
      }

      if (reduced) {
        fire();
      } else {
        _animateTo(target, duration: StMotion.swipeOut, curve: Curves.easeIn, done: fire);
      }
      return;
    }
    _past = false;
    _animateTo(0, duration: const Duration(milliseconds: 260), curve: StMotion.spring);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      _width = box.maxWidth;
      final t = (_dx / (_width * 0.35)).clamp(-1.0, 1.0);
      final angle = (8 * math.pi / 180) * (_dx / _width).clamp(-1.0, 1.0);
      return GestureDetector(
        onHorizontalDragUpdate: _update,
        onHorizontalDragEnd: _end,
        onHorizontalDragCancel: () => _animateTo(0, duration: const Duration(milliseconds: 200)),
        child: Stack(
          children: [
            Transform.translate(
              offset: Offset(_dx, 0),
              child: Transform.rotate(angle: angle, child: widget.child),
            ),
            if (widget.rightLabel != null && t > 0)
              Positioned(top: 24, left: 24, child: Opacity(opacity: t.abs(), child: widget.rightLabel)),
            if (widget.leftLabel != null && t < 0)
              Positioned(top: 24, right: 24, child: Opacity(opacity: t.abs(), child: widget.leftLabel)),
          ],
        ),
      );
    });
  }
}
