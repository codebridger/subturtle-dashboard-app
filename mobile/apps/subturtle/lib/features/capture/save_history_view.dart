import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../shared/format.dart';
import '../../shared/widgets.dart';
import 'capture_sheet.dart';
import 'save_session.dart';

/// Save history: every save-assistant chat on this phone, grouped by day.
/// Tapping a row reopens that chat.
class SaveHistoryView extends ConsumerStatefulWidget {
  const SaveHistoryView({super.key, required this.onBack, required this.onOpen});
  final VoidCallback onBack;
  final ValueChanged<SaveSession> onOpen;

  @override
  ConsumerState<SaveHistoryView> createState() => _SaveHistoryViewState();
}

class _SaveHistoryViewState extends ConsumerState<SaveHistoryView> {
  final _search = TextEditingController();
  bool _savedOnly = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _clear() async {
    final ok = await confirmSheet(
      context,
      title: 'Clear save history?',
      body: 'This removes the chats from this phone. Phrases you saved stay in your bundles.',
      confirm: 'Clear',
      danger: true,
    );
    if (!ok) return;
    try {
      await ref.read(saveSessionRepositoryProvider).clear();
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
    ref.invalidate(saveSessionsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final all = ref.watch(saveSessionsProvider).value ?? const <SaveSession>[];
    final now = DateTime.now();
    final shown = filterSessions(all, query: _search.text, savedOnly: _savedOnly);
    final savedCount = all.fold<int>(0, (n, s) => n + s.saved.length);

    return Column(
      children: [
        const SheetGrabber(),
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: SheetHeader(
            leading: StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Save a phrase', iconSize: 24, onPressed: widget.onBack),
            title: 'Save history',
            subtitle: '${Fmt.plural(all.length, 'session')} · ${Fmt.plural(savedCount, 'phrase')} saved',
            actions: [
              PopupMenuButton<String>(
                tooltip: 'More options',
                icon: StIcon(StIcons.more, size: 22, color: c.textMuted),
                onSelected: (_) => _clear(),
                itemBuilder: (_) => [PopupMenuItem(value: 'clear', enabled: all.isNotEmpty, child: const Text('Clear history'))],
              ),
            ],
          ),
        ),
        Divider(height: 1, thickness: 1, color: c.borderSubtle),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              StInput(
                controller: _search,
                placeholder: 'Search sentences or phrases',
                icon: StIcons.search,
                textInputAction: TextInputAction.search,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _Filter(label: 'All', on: !_savedOnly, onTap: () => setState(() => _savedOnly = false)),
                  const SizedBox(width: 8),
                  _Filter(label: 'With saved phrases', on: _savedOnly, onTap: () => setState(() => _savedOnly = true)),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: shown.isEmpty
              ? _Nothing(empty: all.isEmpty)
              : ListView(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 24 + MediaQuery.paddingOf(context).bottom),
                  children: [
                    for (final group in historyGroups)
                      if (shown.any((s) => historyGroup(s.updatedAt, now) == group)) ...[
                        Padding(padding: const EdgeInsets.only(top: 10, bottom: 6), child: StEyebrow.section(group)),
                        for (final s in shown.where((s) => historyGroup(s.updatedAt, now) == group))
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: SessionRow(session: s, when: historyTime(s.updatedAt, now), showPhrases: true, onTap: () => widget.onOpen(s)),
                          ),
                      ],
                  ],
                ),
        ),
      ],
    );
  }
}

/// Chats matching [query] (in the sentence or a saved phrase); with
/// [savedOnly], only chats that saved something.
List<SaveSession> filterSessions(List<SaveSession> all, {String query = '', bool savedOnly = false}) {
  final q = query.trim().toLowerCase();
  return [
    for (final s in all)
      if ((!savedOnly || s.saved.isNotEmpty) && (q.isEmpty || s.sentence.toLowerCase().contains(q) || s.saved.any((r) => r.text.toLowerCase().contains(q)))) s,
  ];
}

/// "10:42" today and yesterday, "Mon" this week, "2 Oct" earlier.
String historyTime(DateTime at, DateTime now) => switch (historyGroup(at, now)) {
      'Today' || 'Yesterday' => DateFormat('HH:mm').format(at),
      'This week' => DateFormat('EEE').format(at),
      _ => DateFormat('d MMM').format(at),
    };

/// One chat in Recent or Save history: icon, the first sentence, and what was
/// saved. A jade bookmark when something was saved, a grey bubble when not.
class SessionRow extends StatelessWidget {
  const SessionRow({super.key, required this.session, required this.onTap, this.meta, this.when, this.showPhrases = false, this.chevron = false});
  final SaveSession session;
  final VoidCallback onTap;

  /// A one-line summary ("2 saved · 10 min ago") instead of the badge row.
  final String? meta;
  final String? when;
  final bool showPhrases;
  final bool chevron;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final saved = session.saved.isNotEmpty;
    final names = session.saved.map((r) => r.text).join(', ');
    final detail = meta ?? (saved ? names : 'Asked only, nothing saved');
    return Semantics(
      button: true,
      label: '${session.sentence}. ${saved ? '${session.saved.length} saved: $names' : 'Nothing saved'}${when == null ? '' : '. $when'}',
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 60),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd, border: Border.all(color: c.borderSubtle)),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: saved ? c.accentSoft : c.ink100, borderRadius: StRadius.brSm),
                alignment: Alignment.center,
                child: StIcon(saved ? StIcons.bookmark : StIcons.chatDots, size: 18, color: saved ? c.jade600 : c.textMuted),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(session.sentence, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.base(size: 14, weight: FontWeight.w700, height: 1.35).copyWith(color: c.textStrong)),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (showPhrases && saved && meta == null) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(color: c.accentSoft, borderRadius: StRadius.brPill),
                            child: Text('${session.saved.length} saved', style: StType.base(size: 11, weight: FontWeight.w800, height: 1.3).copyWith(color: c.jade700)),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Expanded(child: Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.bodySmall.copyWith(color: c.textMuted))),
                      ],
                    ),
                  ],
                ),
              ),
              if (when != null) ...[const SizedBox(width: 8), Text(when!, style: StType.base(size: 12, weight: FontWeight.w700, height: 1).copyWith(color: c.textFaint))],
              if (chevron) ...[const SizedBox(width: 4), StIcon(StIcons.chevronRight, size: 18, color: c.textFaint)],
            ],
          ),
        ),
      ),
    );
  }
}

class _Filter extends StatelessWidget {
  const _Filter({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      selected: on,
      label: label,
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.96,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? c.surfaceInverse : c.surfaceCard,
              borderRadius: StRadius.brPill,
              border: Border.all(color: on ? c.surfaceInverse : c.borderDefault, width: 1.5),
            ),
            child: Text(label, style: StType.base(size: 14, weight: FontWeight.w700, height: 1).copyWith(color: on ? c.paper : c.textStrong)),
          ),
        ),
      ),
    );
  }
}

class _Nothing extends StatelessWidget {
  const _Nothing({required this.empty});

  /// No chats at all, rather than no matches.
  final bool empty;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 40, 28, 0),
      child: Column(
        children: [
          StIcon(StIcons.history, size: 40, color: c.textFaint),
          const SizedBox(height: 8),
          Text(empty ? 'No chats yet' : 'Nothing found', style: StType.titleSmall.copyWith(color: c.textStrong)),
          const SizedBox(height: 4),
          Text(
            empty ? 'Phrases you ask about will show up here.' : 'Try another word, or clear the search.',
            textAlign: TextAlign.center,
            style: StType.bodyMedium.copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}
