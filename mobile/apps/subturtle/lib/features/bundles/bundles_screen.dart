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
import '../today/today_screen.dart';

enum BundleSort { recent, due, az }

/// S7 · Bundles. Sort chips, rows with a due pill, long-press for actions.
class BundlesScreen extends ConsumerStatefulWidget {
  const BundlesScreen({super.key});

  @override
  ConsumerState<BundlesScreen> createState() => _BundlesScreenState();
}

class _BundlesScreenState extends ConsumerState<BundlesScreen> {
  BundleSort _sort = BundleSort.recent;

  Future<void> _refresh() async {
    ref.invalidate(bundlesProvider);
    ref.invalidate(phraseInfoProvider);
    await ref.read(bundlesProvider.future).catchError((_) => <Bundle>[]);
  }

  List<Bundle> _sorted(List<Bundle> list, PhraseManagementInfo? info) {
    final out = [...list];
    switch (_sort) {
      case BundleSort.recent:
        break; // server order: newest first
      case BundleSort.az:
        out.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case BundleSort.due:
        if (info != null) out.sort((a, b) => info.dueIn(b).compareTo(info.dueIn(a)));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final bundles = ref.watch(bundlesProvider);
    final info = ref.watch(phraseInfoProvider).value;
    return RefreshIndicator(
      onRefresh: _refresh,
      color: c.primary,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: StPageHeader(
              padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 12, 8, 8),
              eyebrow: 'Study',
              title: 'Phrase bundles',
              trailing: StIconButton(
                icon: StIcons.search,
                semanticLabel: 'Search bundles and phrases',
                variant: StButtonVariant.ghost,
                onPressed: () => Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => const BundleSearchScreen())),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: StSegmentedControl<BundleSort>(
                  small: true,
                  segments: const [StSegment(BundleSort.recent, 'Recent'), StSegment(BundleSort.due, 'Most due'), StSegment(BundleSort.az, 'A–Z')],
                  value: _sort,
                  onChanged: (v) => setState(() => _sort = v),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: AsyncBody<List<Bundle>>(
              value: bundles,
              onRetry: () => ref.invalidate(bundlesProvider),
              errorTitle: "We couldn't load your bundles.",
              loading: const SkeletonList(),
              data: (list) {
                if (list.isEmpty) {
                  return StEmptyState(
                    icon: StIcons.notebook,
                    title: 'No bundles yet',
                    description: 'Share a word from any app, or paste one here.',
                    action: StButton(label: 'Save a phrase', icon: StIcons.add, onPressed: () => openCapture(context, ref)),
                  );
                }
                final sorted = _sorted(list, info);
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                  child: Column(children: [for (final b in sorted) Padding(padding: const EdgeInsets.only(bottom: 8), child: BundleRow(bundle: b, due: info?.dueIn(b) ?? 0))]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class BundleRow extends ConsumerWidget {
  const BundleRow({super.key, required this.bundle, required this.due});
  final Bundle bundle;
  final int due;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final meta = '${Fmt.plural(bundle.phraseCount, 'phrase')} · ${Fmt.ago(bundle.updatedAt ?? bundle.createdAt)}';
    return ListRowCard(
      minHeight: 68,
      leading: BundleCover(title: bundle.title),
      title: Text(bundle.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.titleSmall.copyWith(color: c.textStrong)),
      subtitle: Text(meta, style: StType.bodySmall.copyWith(color: c.textMuted)),
      trailing: due > 0 ? StBadge('$due due', color: StBadgeColor.warning) : null,
      semanticLabel: '${bundle.title}. $meta${due > 0 ? '. $due due' : ''}. Long press for actions.',
      onTap: () => context.go('/bundles/${bundle.id}'),
      onLongPress: () => showBundleActions(context, ref, bundle),
    );
  }
}

/// Rename, Review, Talk with Coach, Delete. Also reached from the ⋯ menu on the detail page.
Future<void> showBundleActions(BuildContext context, WidgetRef ref, Bundle bundle, {bool fromDetail = false}) async {
  ref.read(hapticsProvider).selection();
  final action = await showStBottomSheet<String>(
    context: context,
    builder: (ctx) => StSheet(
      title: bundle.title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StButton(label: 'Rename', icon: StIcons.pen, variant: StButtonVariant.soft, tone: StTone.neutral, size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, 'rename')),
          if (!fromDetail) ...[
            const SizedBox(height: 8),
            StButton(label: 'Review this bundle', icon: StIcons.play, variant: StButtonVariant.soft, tone: StTone.neutral, size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, 'review')),
            const SizedBox(height: 8),
            StButton(label: 'Talk with Coach', icon: StIcons.chatDots, variant: StButtonVariant.soft, tone: StTone.neutral, size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, 'coach')),
          ],
          const SizedBox(height: 8),
          StButton(label: 'Delete bundle', icon: StIcons.trash, variant: StButtonVariant.soft, tone: StTone.danger, size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, 'delete')),
          SizedBox(height: MediaQuery.paddingOf(ctx).bottom),
        ],
      ),
    ),
  );
  if (!context.mounted || action == null) return;
  final api = ref.read(apiProvider);
  switch (action) {
    case 'review':
      context.push('/review?bundle=${bundle.id}');
    case 'coach':
      openStartSession(context, ref, bundleId: bundle.id);
    case 'rename':
      final ctrl = TextEditingController(text: bundle.title);
      final name = await showStBottomSheet<String>(
        context: context,
        builder: (ctx) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: StSheet(
            title: 'Rename bundle',
            footer: StButton(label: 'Save', size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, ctrl.text.trim())),
            child: StInput(controller: ctrl, autofocus: true, label: 'Name', onSubmitted: (v) => Navigator.pop(ctx, v.trim())),
          ),
        ),
      );
      if (name == null || name.isEmpty || name == bundle.title) return;
      try {
        await api.bundles.renameBundle(bundle.id, name);
        ref.invalidate(bundlesProvider);
        ref.invalidate(bundleDetailProvider(bundle.id));
      } catch (e) {
        if (context.mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
      }
    case 'delete':
      final ok = await confirmSheet(
        context,
        title: 'Delete "${bundle.title}"?',
        body: 'Its ${Fmt.plural(bundle.phraseCount, 'phrase')} will be deleted too, unless they are in another bundle. This cannot be undone.',
        confirm: 'Delete bundle',
        danger: true,
      );
      if (!ok) return;
      try {
        await api.bundles.removeBundle(bundle.id);
        refreshLearningData(ref);
        ref.invalidate(todayProvider);
        if (context.mounted) {
          if (fromDetail) context.go('/bundles');
          showStToast(context, title: 'Bundle deleted');
        }
      } catch (e) {
        if (context.mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
      }
  }
}

/// Full-screen search across bundles (by name) and phrases (by text).
class BundleSearchScreen extends ConsumerStatefulWidget {
  const BundleSearchScreen({super.key});

  @override
  ConsumerState<BundleSearchScreen> createState() => _BundleSearchScreenState();
}

class _BundleSearchScreenState extends ConsumerState<BundleSearchScreen> {
  final _q = TextEditingController();
  List<Phrase> _phrases = [];
  bool _searching = false;
  int _token = 0;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    final t = ++_token;
    if (q.trim().length < 2) {
      setState(() => _phrases = []);
      return;
    }
    setState(() => _searching = true);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (t != _token) return;
    try {
      final api = ref.read(apiProvider);
      final docs = await api.data.find(
        database: Db.userContent,
        collection: Db.phrase,
        query: {
          'refId': api.auth.user!.id,
          'phrase': {r'$regex': RegExp.escape(q.trim()), r'$options': 'i'},
        },
        options: {'limit': 30},
      );
      if (t == _token) setState(() => _phrases = docs.map(Phrase.fromJson).toList());
    } catch (_) {
      if (t == _token) setState(() => _phrases = []);
    } finally {
      if (t == _token && mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final q = _q.text.trim().toLowerCase();
    final bundles = (ref.watch(bundlesProvider).value ?? const <Bundle>[]).where((b) => q.isNotEmpty && b.title.toLowerCase().contains(q)).toList();
    final info = ref.watch(phraseInfoProvider).value;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 8),
              child: Row(
                children: [
                  StTopBarButton(icon: StIcons.back, semanticLabel: 'Back', iconSize: 24, onPressed: () => Navigator.pop(context)),
                  Expanded(
                    child: StInput(
                      controller: _q,
                      autofocus: true,
                      placeholder: 'Search bundles and phrases',
                      icon: StIcons.search,
                      textInputAction: TextInputAction.search,
                      onChanged: (v) {
                        setState(() {});
                        _search(v);
                      },
                    ),
                  ),
                ],
              ),
            ),
            if (_searching) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (q.isEmpty) Text('Type at least 2 letters.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                  if (bundles.isNotEmpty) ...[
                    const StEyebrow.section('Bundles'),
                    const SizedBox(height: 8),
                    for (final b in bundles)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: ListRowCard(
                          leading: BundleCover(title: b.title, size: 36),
                          title: Text(b.title, style: StType.titleSmall.copyWith(color: c.textStrong)),
                          subtitle: Text(Fmt.plural(b.phraseCount, 'phrase'), style: StType.bodySmall.copyWith(color: c.textMuted)),
                          onTap: () {
                            Navigator.pop(context);
                            GoRouter.of(context).go('/bundles/${b.id}');
                          },
                        ),
                      ),
                  ],
                  if (_phrases.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const StEyebrow.section('Phrases'),
                    const SizedBox(height: 8),
                    for (final p in _phrases)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: ListRowCard(
                          title: Text(p.phrase, style: StType.titleSmall.copyWith(color: c.textStrong)),
                          subtitle: StL1Text(p.translation, rtl: l1IsRtl(ref, p), maxLines: 1, style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w400)),
                          trailing: (info?.levelOf(p.id) ?? 0) > 0 ? StLevelPip(level: info!.levelOf(p.id), showCount: false) : null,
                          onTap: () => openPhraseSheet(context, p),
                        ),
                      ),
                  ],
                  if (q.length >= 2 && !_searching && bundles.isEmpty && _phrases.isEmpty)
                    Text('Nothing found for "${_q.text.trim()}".', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
