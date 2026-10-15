import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../live_session/chat_bubbles.dart';

final _sessionProvider = FutureProvider.family<CoachSession?, String>((ref, id) => ref.read(apiProvider).liveSessions.getSession(id));

/// S15 · Session transcript (read only).
class TranscriptScreen extends ConsumerWidget {
  const TranscriptScreen({super.key, required this.sessionId});
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final session = ref.watch(_sessionProvider(sessionId));
    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(4, MediaQuery.paddingOf(context).top, 16, 0),
            child: Row(children: [StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Coach', iconSize: 24, onPressed: () => context.go('/coach'))]),
          ),
          Expanded(
            child: AsyncBody<CoachSession?>(
              value: session,
              onRetry: () => ref.invalidate(_sessionProvider(sessionId)),
              errorTitle: "We couldn't load this session.",
              loading: const SkeletonList(count: 6, height: 56),
              data: (s) {
                if (s == null) return const StEmptyState(title: 'Session not found', icon: StIcons.inbox, compact: true);
                final when = s.createdAt == null ? '' : DateFormat('d MMM, HH:mm').format(s.createdAt!);
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                  children: [
                    StEyebrow(s.isText ? 'Text session' : 'Voice session'),
                    const SizedBox(height: 6),
                    Semantics(header: true, child: Text(s.title ?? 'Coach session', style: StType.titleLarge.copyWith(color: c.textStrong))),
                    const SizedBox(height: 4),
                    Text(
                      [when, if (!s.isText) Fmt.minutes(s.length), Fmt.plural(s.messageCount, 'message')].where((x) => x.isNotEmpty).join(' · '),
                      style: StType.bodySmall.copyWith(color: c.textMuted),
                    ),
                    const SizedBox(height: 20),
                    if (s.dialogs.isEmpty) Text('Nothing was said in this session.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                    for (final d in s.dialogs) ChatBubble(text: d.content, fromUser: d.fromUser),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
