import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/settings_rows.dart';
import '../../shared/widgets.dart';
import 'language_ui.dart';
import 'own_language_picker.dart';

/// L6 · Languages: one card per language with where it started, its counts
/// and what is ready. This is the one place that lists "not yet": everywhere
/// else a missing feature is hidden.
class LanguagesScreen extends ConsumerWidget {
  const LanguagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final state = ref.watch(languageStateProvider);
    final caps = ref.watch(languageCapsProvider).value ?? LanguageCapabilities.fallback;
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 4),
              child: Row(
                children: [
                  StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Me', iconSize: 24, onPressed: () => context.canPop() ? context.pop() : context.go('/me')),
                  Expanded(child: Semantics(header: true, child: Text('Languages', style: StType.titleMedium.copyWith(color: c.textStrong)))),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: c.primary,
                onRefresh: () => ref.read(languageStateProvider.notifier).refresh().catchError((_) {}),
                child: AsyncBody<LanguageState>(
                  value: state,
                  onRetry: () => ref.invalidate(languageStateProvider),
                  errorTitle: "We couldn't load your languages.",
                  loading: const Padding(padding: EdgeInsets.all(16), child: SkeletonList(count: 3)),
                  data: (s) => _list(context, ref, s, caps),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, LanguageState s, LanguageCapabilities caps) {
    final c = context.st;
    final limit = planLimitOf(s, nameOf: (c) => caps.learningByCode(c)?.name ?? c.toUpperCase());
    final shown = [...s.studying, ...s.paused, ...s.removed];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 32),
      children: [
        Text(
          'Each language has its own phrases, review and Coach history. Your account, plan and voice minutes are shared. Tap a language to manage it.',
          style: StType.bodyMedium.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 12),
        for (final l in shown) ...[
          _LanguageCard(summary: l, caps: caps.learningByCode(l.code), active: l.code == s.active && l.isActive),
          const SizedBox(height: 10),
        ],
        for (final p in s.pending) ...[
          _PendingCard(pending: p, name: caps.learningByCode(p.language)?.name ?? p.language.toUpperCase()),
          const SizedBox(height: 10),
        ],
        if (limit == null)
          StLanguageAddRow(note: addNote(caps, s), usedText: usedText(s), onTap: () => context.push('/add-language'))
        else
          PlanLimitCard(limit: limit, onRestore: (code) => restoreLanguage(context, ref, code)),
        const SizedBox(height: 12),
        Text('A feature that is not ready for a language shows here as "not yet". It is not shown anywhere else in that language.', style: StType.bodySmall.copyWith(color: c.textMuted)),
      ],
    );
  }
}

class _LanguageCard extends StatelessWidget {
  const _LanguageCard({required this.summary, required this.caps, required this.active});
  final LanguageSummary summary;
  final LearningLanguageCaps? caps;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final f = caps?.features ?? const LanguageFeatures();
    final name = caps?.label ?? summary.code.toUpperCase();
    final meta = switch (summary.status) {
      'paused' => 'Paused · your ${Fmt.plural(summary.phraseCount, 'phrase')} are kept · Upgrade to continue',
      'removed' => 'Removed · kept until ${Fmt.longDate(summary.purgeAt)} · add it again to bring it back',
      _ => languageMeta(summary),
    };
    void open() {
      if (summary.isPaused) {
        context.push('/me/plan');
      } else if (summary.isRemoved) {
        context.push('/add-language?lang=${summary.code}');
      } else {
        context.push('/me/languages/${summary.code}');
      }
    }

    return Semantics(
      button: true,
      label: '$name. $meta${active ? '. Active' : ''}',
      child: StPressable(
        onTap: open,
        pressedScale: 0.99,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: StRadius.brLg,
            border: Border.all(color: active ? c.jade500 : c.borderDefault, width: active ? 2 : 1),
          ),
          child: ExcludeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    StLanguageChip(summary.code, selected: active),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: StType.base(size: 16, weight: FontWeight.w800, height: 1.3).copyWith(color: c.textStrong)),
                          Text(meta, style: StType.bodySmall.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ),
                    if (active) const StBadge('Active', color: StBadgeColor.accent),
                    const SizedBox(width: 4),
                    StIcon(StIcons.chevronRight, size: 18, color: c.textMuted),
                  ],
                ),
                if (summary.isActive) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _Cap('Save', f.save),
                      _Cap('Review', f.review),
                      _Cap('Fill the gap', f.cloze),
                      _Cap('Coach text', f.coachText),
                      _Cap('Coach voice', f.coachVoice),
                      _Cap('Starter pack', f.starterPack),
                      _Cap('Map', f.map),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Cap extends StatelessWidget {
  const _Cap(this.label, this.ok);
  final String label;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: ok ? c.accentSoft : c.surfaceSunken, borderRadius: StRadius.brPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StIcon(ok ? StIcons.checkDuo : StIcons.clock, size: 14, color: ok ? c.jade700 : c.textMuted),
          const SizedBox(width: 4),
          Text(ok ? label : '$label: not yet', style: StType.labelMedium.copyWith(color: ok ? c.jade700 : c.textMuted)),
        ],
      ),
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.pending, required this.name});
  final PendingPhrases pending;
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final title = '${Fmt.plural(pending.count, 'phrase')} kept for $name';
    final sub = 'Add $name to study them.${pending.expiresAt == null ? '' : ' Kept until ${Fmt.longDate(pending.expiresAt)}.'}';
    return Semantics(
      button: true,
      label: '$title. $sub',
      excludeSemantics: true,
      child: StPressable(
        onTap: () => context.push('/add-language?lang=${pending.language}'),
        pressedScale: 0.99,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.infoSoft, borderRadius: StRadius.brLg),
          child: Row(
            children: [
              StIcon(StIcons.inbox, size: 24, color: c.sky600),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.3).copyWith(color: c.textStrong)),
                    Text(sub, style: StType.bodySmall.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              StIcon(StIcons.chevronRight, size: 18, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// L7 · manage one language: make it active, where it started (and the chat
/// test again), who explains, and remove (kept for 30 days).
class ManageLanguageScreen extends ConsumerStatefulWidget {
  const ManageLanguageScreen({super.key, required this.language});
  final String language;

  @override
  ConsumerState<ManageLanguageScreen> createState() => _ManageLanguageScreenState();
}

class _ManageLanguageScreenState extends ConsumerState<ManageLanguageScreen> {
  bool _busy = false;

  Future<void> _makeActive() async {
    setState(() => _busy = true);
    final ok = await switchLanguage(context, ref, widget.language);
    if (!ok && mounted) setState(() => _busy = false);
  }

  Future<void> _explainsIn(String? current) async {
    final code = await pickOwnLanguage(context, ref, title: 'Coach explains in', subtitle: 'For ${capsOf(ref, widget.language).name} only. Every choice says who checked it.', current: current, showReview: true);
    if (code == null || code == current || !mounted) return;
    try {
      await ref.read(languageStateProvider.notifier).updateSettings(widget.language, explanationLanguage: code);
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _remove(String name) async {
    // The purge date the server will set: 30 days from now.
    final until = Fmt.longDate(DateTime.now().add(const Duration(days: 30)));
    final ok = await confirmSheet(
      context,
      title: 'Remove $name?',
      body:
          '$name leaves your list now. Your $name phrases, review boxes and Coach history are kept for 30 days. Add $name again before $until and everything comes back. After that it is deleted.\n\nYour account, plan, voice minutes and other languages are not touched.',
      confirm: 'Remove $name',
      cancel: 'Keep $name',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final router = GoRouter.of(context);
    try {
      final purgeAt = await ref.read(languageStateProvider.notifier).remove(widget.language);
      refreshLearningData(ref);
      if (!mounted) return;
      showStToast(context, title: '$name removed', description: 'Kept until ${Fmt.longDate(purgeAt ?? DateTime.now().add(const Duration(days: 30)))}.');
      router.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final s = ref.watch(languageStateProvider).value;
    final caps = capsOf(ref, widget.language);
    final summary = s?.summaryOf(widget.language);
    final own = ref.watch(languageCapsProvider).value;
    if (s == null || summary == null) {
      return Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Row(children: [StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Languages', iconSize: 24, onPressed: () => context.pop())]),
              const Padding(padding: EdgeInsets.all(16), child: SkeletonList(count: 3)),
            ],
          ),
        ),
      );
    }
    final active = s.active == widget.language;
    final explain = summary.explanationLanguage ?? s.translationLanguage;
    final explainName = own?.ownByCode(explain)?.name ?? explain?.toUpperCase() ?? 'Your language';
    final canRemove = summary.isActive && s.studying.length > 1;
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 4),
              child: Row(
                children: [
                  StTopBarButton(icon: StIcons.back, semanticLabel: 'Back to Languages', iconSize: 24, onPressed: () => context.pop()),
                  Expanded(child: Semantics(header: true, child: Text(caps.name, style: StType.titleMedium.copyWith(color: c.textStrong)))),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 32),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brLg, border: Border.all(color: c.borderDefault)),
                    child: Row(
                      children: [
                        StLanguageChip(widget.language, selected: active),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(caps.label, style: StType.base(size: 16, weight: FontWeight.w800, height: 1.3).copyWith(color: c.textStrong)),
                              Text(languageMeta(summary), style: StType.bodySmall.copyWith(color: c.textMuted)),
                            ],
                          ),
                        ),
                        if (active) const StBadge('Active', color: StBadgeColor.accent),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (!active)
                    StButton(label: 'Make ${caps.name} active', size: StSize.lg, block: true, loading: _busy, onPressed: _busy ? null : _makeActive)
                  else
                    StButton(
                      label: 'Go to Today',
                      size: StSize.lg,
                      block: true,
                      variant: StButtonVariant.soft,
                      tone: StTone.neutral,
                      onPressed: () => resetTabsToToday(GoRouter.of(context)),
                    ),
                  const SizedBox(height: 18),
                  SettingsGroup(
                    label: 'Only for ${caps.name}',
                    children: [
                      SettingsRow(
                        label: 'Where you start',
                        sublabel: summary.fromTest ? 'Starting at ${summary.startLevel} · from the chat test' : 'Starting at ${summary.startLevel} · you skipped the test',
                        value: caps.features.levelTest ? Text('Take the chat test again', style: TextStyle(color: c.textLink)) : null,
                        onTap: caps.features.levelTest ? () => context.push('/level-test?lang=${widget.language}&from=manage') : null,
                      ),
                      if (caps.features.coachText || caps.features.coachVoice)
                        SettingsRow(label: 'Coach explains in', value: Text(explainName), onTap: () => _explainsIn(explain), last: true),
                    ],
                  ),
                  if (canRemove) ...[
                    const SizedBox(height: 24),
                    StButton(
                      label: 'Remove ${caps.name}',
                      icon: StIcons.trash,
                      size: StSize.lg,
                      block: true,
                      variant: StButtonVariant.soft,
                      tone: StTone.danger,
                      onPressed: _busy ? null : () => _remove(caps.name),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
