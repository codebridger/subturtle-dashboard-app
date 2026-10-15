import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';

/// "This looks wrong" under a Coach explanation (S13, Q10). Tapping it flags
/// that turn with `flag-coach-explanation`; it then reads "Thanks, we will
/// check this explanation" with Undo.
class ExplanationFlag extends ConsumerStatefulWidget {
  const ExplanationFlag({super.key, required this.sessionId, required this.turnIndex});

  /// The session record. Null until it exists (the flag is hidden then).
  final String? sessionId;

  /// Which Coach turn this is, counting Coach messages from 0.
  final int turnIndex;

  @override
  ConsumerState<ExplanationFlag> createState() => _ExplanationFlagState();
}

class _ExplanationFlagState extends ConsumerState<ExplanationFlag> {
  bool _on = false;
  bool _busy = false;

  Future<void> _set(bool on) async {
    final id = widget.sessionId;
    if (id == null || _busy) return;
    setState(() {
      _busy = true;
      _on = on;
    });
    try {
      await ref.read(apiProvider).liveSessions.flagExplanation(sessionId: id, turnIndex: widget.turnIndex, on: on);
    } catch (e) {
      if (!mounted) return;
      setState(() => _on = !on);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.sessionId == null) return const SizedBox.shrink();
    final c = context.st;
    final style = StType.bodySmall.copyWith(color: c.textMuted);
    if (_on) {
      return Semantics(
        liveRegion: true,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Thanks, we will check this explanation.', style: style),
            StButton(label: 'Undo', size: StSize.sm, variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: _busy ? null : () => _set(false)),
          ],
        ),
      );
    }
    return Semantics(
      button: true,
      label: 'This explanation looks wrong. Tell us',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => _set(true),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 40),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                StIcon(StIcons.danger, size: 14, color: c.textMuted),
                const SizedBox(width: 4),
                Text('This looks wrong', style: style.copyWith(decoration: TextDecoration.underline)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
