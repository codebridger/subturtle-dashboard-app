import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../capture/capture_sheet.dart';
import '../coach/start_session_sheet.dart';
import '../phrase/phrase_parts.dart';
import '../phrase/phrase_sheet.dart';
import 'bundles_screen.dart';

/// S8 · Bundle detail: Review and Talk with Coach, then the phrase list.
/// Swipe a row left to delete it (with a 5 s undo).
class BundleDetailScreen extends ConsumerStatefulWidget {
  const BundleDetailScreen({super.key, required this.bundleId});
  final String bundleId;

  @override
  ConsumerState<BundleDetailScreen> createState() => _BundleDetailScreenState();
}

class _BundleDetailScreenState extends ConsumerState<BundleDetailScreen> {
  /// Rows hidden while their delete waits for the undo window.
  final Set<String> _hidden = {};
  final Map<String, Timer> _pendingDeletes = {};

  // Kept so the waiting deletes can still run in dispose(), where ref is gone.
  late final SubturtleApi _api = ref.read(apiProvider);

  @override
  void initState() {
    super.initState();
    _api; // read now, while ref is usable
  }

  @override
  void dispose() {
    // Leaving the page: run the waiting deletes now.
    for (final e in _pendingDeletes.entries) {
      e.value.cancel();
      _deleteNow(e.key);
    }
    super.dispose();
  }

  void _deleteNow(String phraseId) {
    _api.bundles.removePhrase(phraseId: phraseId, bundleId: widget.bundleId).catchError((_) {});
  }

  void _swipeDelete(Phrase p) {
    ref.read(hapticsProvider).light();
    setState(() => _hidden.add(p.id));
    _pendingDeletes[p.id] = Timer(const Duration(seconds: 5), () async {
      _pendingDeletes.remove(p.id);
      try {
        await ref.read(apiProvider).bundles.removePhrase(phraseId: p.id, bundleId: widget.bundleId);
        refreshLearningData(ref);
        ref.invalidate(bundleDetailProvider(widget.bundleId));
      } catch (e) {
        if (mounted) {
          setState(() => _hidden.remove(p.id));
          showStToast(context, title: friendlyError(e), color: StToastColor.danger);
        }
      }
    });
    showStToast(
      context,
      title: 'Deleted "${p.phrase}"',
      actionLabel: 'Undo',
      duration: const Duration(seconds: 5),
      onAction: () {
        _pendingDeletes.remove(p.id)?.cancel();
        setState(() => _hidden.remove(p.id));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final detail = ref.watch(bundleDetailProvider(widget.bundleId));
    final info = ref.watch(phraseInfoProvider).value;
    return Scaffold(
      body: RefreshIndicator(
        color: c.primary,
        onRefresh: () async {
          ref.invalidate(bundleDetailProvider(widget.bundleId));
          ref.invalidate(phraseInfoProvider);
          await ref.read(bundleDetailProvider(widget.bundleId).future).catchError((_) => (const Bundle(id: '', title: ''), <Phrase>[]));
        },
        child: ListView(
          padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top, bottom: 40),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
              child: Row(
                children: [
                  StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to bundles', iconSize: 24, onPressed: () => context.go('/bundles')),
                  const Spacer(),
                  if (detail.hasValue)
                    StIconButton(
                      icon: StIcons.more,
                      semanticLabel: 'More options',
                      variant: StButtonVariant.ghost,
                      onPressed: () => showBundleActions(context, ref, detail.requireValue.$1, fromDetail: true),
                    ),
                ],
              ),
            ),
            AsyncBody<(Bundle, List<Phrase>)>(
              value: detail,
              onRetry: () => ref.invalidate(bundleDetailProvider(widget.bundleId)),
              errorTitle: "We couldn't load this bundle.",
              loading: const Padding(padding: EdgeInsets.only(top: 12), child: SkeletonList(count: 7, height: 64)),
              data: (d) {
                final (bundle, all) = d;
                final phrases = all.where((p) => !_hidden.contains(p.id)).toList();
                final due = info?.dueIn(bundle) ?? 0;
                final meta = [
                  Fmt.plural(phrases.length, 'phrase'),
                  if (due > 0) '$due due',
                  if (bundle.updatedAt != null) 'saved ${Fmt.ago(bundle.updatedAt)}',
                ].join(' · ');
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      child: Row(
                        children: [
                          BundleCover(title: bundle.title, size: 56),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Semantics(header: true, child: Text(bundle.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: StType.titleLarge.copyWith(color: c.textStrong))),
                                const SizedBox(height: 4),
                                Text(meta, style: StType.bodySmall.copyWith(color: c.textMuted, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (phrases.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Row(
                          children: [
                            Expanded(
                              child: StButton(
                                label: due > 0 ? 'Review $due' : 'Review',
                                icon: StIcons.play,
                                block: true,
                                onPressed: () => context.push('/review?bundle=${bundle.id}'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: StButton(
                                label: 'Talk with Coach',
                                icon: StIcons.chatDots,
                                variant: StButtonVariant.soft,
                                tone: StTone.neutral,
                                block: true,
                                onPressed: () => openStartSession(context, ref, bundleId: bundle.id),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (phrases.isEmpty)
                      StEmptyState(
                        compact: true,
                        icon: StIcons.inbox,
                        title: 'This bundle is empty',
                        action: StButton(label: 'Save a phrase', icon: StIcons.add, onPressed: () => openCapture(context, ref, bundleId: bundle.id)),
                      ),
                    for (final p in phrases)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: Dismissible(
                          key: ValueKey(p.id),
                          direction: DismissDirection.endToStart,
                          onDismissed: (_) => _swipeDelete(p),
                          background: Container(
                            decoration: BoxDecoration(color: c.danger, borderRadius: StRadius.brMd),
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 20),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const StIcon(StIcons.trash, size: 20, color: Colors.white),
                                const SizedBox(width: 6),
                                Text('Delete', style: StType.label.copyWith(color: Colors.white)),
                              ],
                            ),
                          ),
                          child: _PhraseRow(phrase: p, level: info?.levelOf(p.id) ?? 0, bundleId: bundle.id),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _PhraseRow extends ConsumerWidget {
  const _PhraseRow({required this.phrase, required this.level, required this.bundleId});
  final Phrase phrase;
  final int level;
  final String bundleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    return ListRowCard(
      title: Text(phrase.phrase, style: StType.titleSmall.copyWith(color: c.textStrong)),
      subtitle: StL1Text(phrase.translation, rtl: l1IsRtl(ref, phrase), maxLines: 2, align: TextAlign.start, style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w400)),
      trailing: level > 0 ? StLevelPip(level: level, showCount: false) : StBadge('New', color: StBadgeColor.accent),
      semanticLabel: '${phrase.phrase}. ${phrase.translation}. ${level > 0 ? 'Level $level' : 'New'}. Swipe left to delete.',
      onTap: () async {
        final changed = await openPhraseSheet(context, phrase, bundleId: bundleId);
        if (changed) ref.invalidate(bundleDetailProvider(bundleId));
      },
      onLongPress: () async {
        final changed = await openPhraseSheet(context, phrase, bundleId: bundleId);
        if (changed) ref.invalidate(bundleDetailProvider(bundleId));
      },
    );
  }
}
