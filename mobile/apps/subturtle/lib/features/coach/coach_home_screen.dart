import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import 'start_session_sheet.dart';

/// Recent coach sessions. Session history is a paid feature on the backend.
final coachHistoryProvider = FutureProvider<CoachSessionPage>((ref) => ref.read(apiProvider).liveSessions.listSessions(limit: 20));

/// S11 · Coach: the minutes meter, "Start a session", and recent sessions.
class CoachHomeScreen extends ConsumerWidget {
  const CoachHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final sub = ref.watch(subscriptionProvider).value;
    final history = ref.watch(coachHistoryProvider);
    return RefreshIndicator(
      color: c.primary,
      onRefresh: () async {
        ref.invalidate(coachHistoryProvider);
        ref.invalidate(subscriptionProvider);
        await ref.read(coachHistoryProvider.future).catchError((_) => const CoachSessionPage(items: []));
      },
      child: ListView(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top, bottom: 40),
        children: [
          StPageHeader(
            eyebrow: 'AI coaching',
            title: 'Coach',
            subtitle: Text('Talk about your saved phrases, by voice or by text.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: StCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const StIconTile(icon: StIcons.coach, color: StBadgeColor.primary, size: 48),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('New session', style: StType.titleMedium.copyWith(color: c.textStrong)),
                            Text('Pick a bundle, then voice or text.', style: StType.bodySmall.copyWith(color: c.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (sub != null) ...[const SizedBox(height: 12), _Meter(sub: sub)],
                  const SizedBox(height: 14),
                  StButton(label: 'Start a session', icon: StIcons.play, size: StSize.lg, block: true, onPressed: () => openStartSession(context, ref)),
                ],
              ),
            ),
          ),
          const Padding(padding: EdgeInsets.fromLTRB(16, 24, 16, 10), child: StEyebrow.section('Recent sessions')),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _history(context, ref, history, sub),
          ),
        ],
      ),
    );
  }

  Widget _history(BuildContext context, WidgetRef ref, AsyncValue<CoachSessionPage> history, SubscriptionDetails? sub) {
    final c = context.st;
    if (history.hasError) {
      final e = history.error;
      if (e is ApiException && e.isTierLimit) {
        return StCard(
          elevation: StCardElevation.none,
          color: c.surfaceSunken,
          child: Row(
            children: [
              const StIconTile(icon: StIcons.lock, color: StBadgeColor.neutral),
              const SizedBox(width: 12),
              Expanded(child: Text('Your past sessions show here on a paid plan.', style: StType.bodyMedium.copyWith(color: c.textBody))),
              if (AppConfig.purchaseLinks) StButton(label: 'Plans', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: () => context.go('/me/plan')),
            ],
          ),
        );
      }
      return ErrorPanel(title: "We couldn't load your sessions.", error: e, onRetry: () => ref.invalidate(coachHistoryProvider));
    }
    if (!history.hasValue) return const SkeletonList(count: 4, height: 64, padding: EdgeInsets.zero);
    final items = history.requireValue.items;
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('Your talks with the coach will show here.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
      );
    }
    return Column(
      children: [
        for (final s in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ListRowCard(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: s.isText ? c.infoSoft : c.primaryTint, borderRadius: StRadius.brSm),
                alignment: Alignment.center,
                child: StIcon(s.isText ? StIcons.keyboard : StIcons.mic, size: 20, color: s.isText ? c.sky600 : c.rose600),
              ),
              title: Text(s.title ?? 'Coach session', maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.titleSmall.copyWith(color: c.textStrong)),
              subtitle: Text(
                '${s.isText ? 'Text' : 'Voice'} · ${Fmt.day(s.createdAt)} · ${s.isText ? Fmt.plural(s.messageCount, 'message') : Fmt.minutes(s.length)}',
                style: StType.bodySmall.copyWith(color: c.textMuted),
              ),
              trailing: StIcon(StIcons.chevronRight, size: 20, color: c.textFaint),
              onTap: () => context.go('/coach/sessions/${s.id}'),
            ),
          ),
      ],
    );
  }
}

class _Meter extends StatelessWidget {
  const _Meter({required this.sub});
  final SubscriptionDetails sub;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    if (!sub.hasVoice) {
      return Text('Your plan has text chat. Voice comes with Learner and Coach.', style: StType.bodySmall.copyWith(color: c.textMuted));
    }
    if (sub.isFreemium) {
      return Text('Free voice chats are up to 5 minutes each.', style: StType.bodySmall.copyWith(color: c.textMuted));
    }
    final total = sub.voiceTotal;
    final left = sub.voiceRemaining;
    final low = left <= total * 0.2;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Voice minutes', style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: c.textStrong)),
            const Spacer(),
            Text('$left of $total left this month', style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: left == 0 ? c.red600 : (low ? c.amber600 : c.textMuted))),
          ],
        ),
        const SizedBox(height: 6),
        StProgressBar(
          value: (total - left).toDouble(),
          max: total.toDouble(),
          color: left == 0 ? StBadgeColor.danger : (low ? StBadgeColor.warning : StBadgeColor.primary),
          size: StSize3.sm,
          semanticLabel: 'Voice minutes used',
        ),
      ],
    );
  }
}
