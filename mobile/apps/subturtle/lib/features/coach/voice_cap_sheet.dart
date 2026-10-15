import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../shared/format.dart';

/// What the learner picked on the voice cap sheet.
enum VoiceCapChoice { getMore, useText }

/// S16 · Voice minutes used up. Opens only when the learner taps Start (voice)
/// with 0 minutes. Always escapable. Minutes only; the word "credit" never shows.
Future<VoiceCapChoice?> showVoiceCapSheet(BuildContext context, SubscriptionDetails sub) {
  return showStBottomSheet<VoiceCapChoice>(
    context: context,
    builder: (ctx) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final title = _title(sub);
        SemanticsService.sendAnnouncement(View.of(ctx), title, TextDirection.ltr, assertiveness: Assertiveness.assertive);
      });
      return _VoiceCap(sub: sub);
    },
  );
}

String _title(SubscriptionDetails sub) {
  if (!sub.hasVoice) return 'Voice chat is not part of your plan';
  if (sub.isFreemium) return "You've used your free voice minutes";
  return "You've used all ${sub.voiceTotal} voice minutes this month";
}

class _VoiceCap extends StatelessWidget {
  const _VoiceCap({required this.sub});
  final SubscriptionDetails sub;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final body = !sub.hasVoice
        ? 'You can still chat with your coach by text.'
        : 'New minutes arrive on ${Fmt.longDate(sub.endDate)}. You can still chat with your coach by text.';
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(margin: const EdgeInsets.only(top: 10), width: 36, height: 4, decoration: BoxDecoration(color: c.borderStrong, borderRadius: BorderRadius.circular(2)))),
            Align(alignment: Alignment.centerRight, child: StTopBarButton(icon: StIcons.close, semanticLabel: 'Close', onPressed: () => Navigator.pop(context))),
            const StIconTile(icon: StIcons.clock, color: StBadgeColor.warning, size: 64),
            const SizedBox(height: 14),
            Semantics(header: true, child: Text(_title(sub), style: StType.titleLarge.copyWith(color: c.textStrong))),
            const SizedBox(height: 10),
            Text(body, style: StType.base(size: 16, weight: FontWeight.w600).copyWith(color: c.textMuted)),
            if (sub.hasVoice) ...[
              const SizedBox(height: 14),
              StProgressBar(value: sub.voiceTotal.toDouble(), max: sub.voiceTotal.toDouble(), color: StBadgeColor.danger, size: StSize3.sm, semanticLabel: 'Voice minutes used'),
            ],
            const SizedBox(height: 20),
            if (AppConfig.purchaseLinks) ...[
              StButton(label: 'Get more minutes', icon: StIcons.add, size: StSize.lg, block: true, onPressed: () => Navigator.pop(context, VoiceCapChoice.getMore)),
              const SizedBox(height: 10),
            ],
            StButton(
              label: 'Use text chat instead',
              icon: StIcons.keyboard,
              variant: StButtonVariant.outline,
              tone: StTone.neutral,
              size: StSize.lg,
              block: true,
              onPressed: () => Navigator.pop(context, VoiceCapChoice.useText),
            ),
          ],
        ),
      ),
    );
  }
}
