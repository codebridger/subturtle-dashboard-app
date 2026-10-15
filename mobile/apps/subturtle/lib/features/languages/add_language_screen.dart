import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import 'language_ui.dart';
import 'own_language_picker.dart';

/// L2 + L3 (and L10, the first run): add a language in two steps.
///
/// Step 1 picks one of the ready languages the learner does not have yet
/// ("Tell me" on the ones coming later). Step 2 has only two choices: the AI
/// chat test, or Start at A1 with the starter pack. There is no hand-picked
/// level.
///
/// The first run ([firstRun]) has no close button, but a server error never
/// traps the learner: it offers Try again and Sign out.
class AddLanguageScreen extends ConsumerStatefulWidget {
  const AddLanguageScreen({super.key, this.firstRun = false, this.preselect});

  final bool firstRun;

  /// A language to pick at once (from "3 phrases kept for Spanish").
  final String? preselect;

  @override
  ConsumerState<AddLanguageScreen> createState() => _AddLanguageScreenState();
}

/// Goal chips on step 2: id → label (the label names the language).
const _goals = [('watch', 'Watch without subtitles'), ('work', 'Study or work'), ('travel', 'Travel'), ('curious', 'Just curious')];

class _AddLanguageScreenState extends ConsumerState<AddLanguageScreen> {
  int _step = 1;
  String? _pick;
  bool _test = true;
  final _goalsOn = <String>{'watch'};
  bool _busy = false;
  Object? _error;

  /// "Tell me" answers this visit (code → on).
  final _told = <String, bool>{};

  List<LearningLanguageCaps> _choices(LanguageCapabilities caps, LanguageState s) {
    // A removed language can be added again (its data comes back); active and
    // paused ones are already in the list.
    final have = {for (final l in s.languages) if (!l.isRemoved) l.code};
    return [for (final l in caps.ready) if (widget.firstRun || !have.contains(l.code)) l];
  }

  String? _defaultPick(List<LearningLanguageCaps> choices, LanguageState s) {
    final codes = choices.map((c) => c.code).toSet();
    if (widget.preselect != null && codes.contains(widget.preselect)) return widget.preselect;
    for (final p in s.pending) {
      if (codes.contains(p.language)) return p.language;
    }
    return null;
  }

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/today');
    }
  }

  Future<void> _toggleTell(String code) async {
    final on = !(_told[code] ?? false);
    setState(() => _told[code] = on);
    ref.read(hapticsProvider).selection();
    try {
      await ref.read(apiProvider).languages.setInterest(code, on: on);
    } catch (e) {
      if (!mounted) return;
      setState(() => _told[code] = !on);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _changeOwnLanguage(String? current) async {
    final code = await pickOwnLanguage(context, ref, title: 'My language', subtitle: 'Translations and Coach explanations use it, for every language.', current: current);
    if (code == null || !mounted) return;
    try {
      await ref.read(languageStateProvider.notifier).setTranslationLanguage(code);
    } catch (e) {
      if (mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    }
  }

  Future<void> _start(LearningLanguageCaps lang) async {
    final goals = _goalsOn.toList();
    if (_test && lang.features.levelTest) {
      // The chat test adds the language when it ends (with the level it found,
      // or A1 when the learner stops).
      context.push(Uri(path: '/level-test', queryParameters: {'lang': lang.code, 'from': widget.firstRun ? 'first' : 'add', if (goals.isNotEmpty) 'goals': goals.join(',')}).toString());
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final router = GoRouter.of(context);
    try {
      final s = await ref.read(languageStateProvider.notifier).add(lang.code, goals: goals);
      ref.read(hapticsProvider).success();
      refreshLearningData(ref);
      final pack = s.summaryOf(lang.code)?.starterPack;
      resetTabsToToday(router);
      // A1 opens the starter pack first, when the language has one.
      if (lang.features.starterPack && pack != null && pack.state != 'none' && !pack.isDone) router.push('/starter?lang=${lang.code}');
    } on AddLanguageRefusal catch (r) {
      if (!mounted) return;
      setState(() => _busy = false);
      // The state behind the screen is stale: reload it so the limit card shows.
      ref.invalidate(languageStateProvider);
      setState(() {
        _step = 1;
        _error = r.upgradeNeeded ? null : r;
      });
      if (r.upgradeNeeded) showStToast(context, title: 'Your plan is full', description: 'See the card on this screen.');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final stateAsync = ref.watch(languageStateProvider);
    final capsAsync = ref.watch(languageCapsProvider);
    final s = stateAsync.value;
    final caps = capsAsync.value;

    Widget body;
    if (s == null || caps == null) {
      body = stateAsync.hasError
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: ErrorPanel(title: "We couldn't load your languages.", error: stateAsync.error, onRetry: () => ref.invalidate(languageStateProvider)),
            )
          : const Padding(padding: EdgeInsets.all(16), child: SkeletonList(count: 4));
    } else {
      final choices = _choices(caps, s);
      _pick ??= _defaultPick(choices, s) ?? (choices.isEmpty ? null : choices.firstWhere((l) => l.code != 'en', orElse: () => choices.first).code);
      final picked = choices.where((l) => l.code == _pick).firstOrNull;
      body = _step == 1 || picked == null ? _stepOne(context, caps, s, choices) : _stepTwo(context, picked);
    }

    final showClose = !widget.firstRun && _step == 1;
    return PopScope(
      canPop: !widget.firstRun || _step == 2,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == 2) setState(() => _step = 1);
      },
      child: Scaffold(
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
                child: Row(
                  children: [
                    if (showClose)
                      StTopBarButton(icon: StIcons.close, semanticLabel: 'Close and go back', onPressed: _close)
                    else if (_step == 2)
                      StTopBarButton(icon: StIcons.back, semanticLabel: 'Back', iconSize: 24, onPressed: () => setState(() => _step = 1))
                    else
                      const SizedBox(width: 48, height: 48),
                    const Spacer(),
                    Text('Step $_step of 2', style: StType.labelMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stepOne(BuildContext context, LanguageCapabilities caps, LanguageState s, List<LearningLanguageCaps> choices) {
    final c = context.st;
    final l1 = ref.watch(l1Provider).value;
    final limit = widget.firstRun ? null : planLimitOf(s);
    final picked = choices.where((l) => l.code == _pick).firstOrNull;
    final waiting = picked == null ? null : s.pendingFor(picked.code);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              StEyebrow(widget.firstRun ? 'Welcome to Subturtle' : 'Add a language'),
              const SizedBox(height: 6),
              Semantics(header: true, child: Text('What do you want to learn?', style: StType.headline.copyWith(color: c.textStrong))),
              const SizedBox(height: 12),
              if (l1 != null)
                Semantics(
                  button: true,
                  label: 'Translations and explanations stay in ${l1.name}. Change it',
                  excludeSemantics: true,
                  child: StPressable(
                    pressedScale: 0.99,
                    onTap: () => _changeOwnLanguage(s.translationLanguage ?? l1.code),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: StRadius.brMd),
                      child: Row(
                        children: [
                          StIcon(StIcons.chatDots, size: 20, color: c.textMuted),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text('Translations and explanations stay in ', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                                StL1Text(l1.nativeName, rtl: l1.rtl, style: StType.bodyMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w700)),
                                Text('. ', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                                Text('Change', style: StType.bodyMedium.copyWith(color: c.textLink, fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (waiting != null && picked != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(color: c.infoSoft, borderRadius: StRadius.brMd),
                  child: Row(
                    children: [
                      StIcon(StIcons.inbox, size: 20, color: c.sky600),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${waiting.count == 1 ? '1 phrase is' : '${waiting.count} phrases are'} waiting for ${picked.name}. Add it and they join your ${picked.name}.',
                          style: StType.bodyMedium.copyWith(color: c.sky600, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (_error != null) ...[const SizedBox(height: 12), ErrorPanel(title: _errorTitle(_error!), error: _error is AddLanguageRefusal ? null : _error)],
              if (limit != null) ...[
                const SizedBox(height: 14),
                PlanLimitCard(limit: limit, onManage: () => context.push('/me/languages')),
              ] else ...[
                const SizedBox(height: 18),
                const StEyebrow('Ready now'),
                const SizedBox(height: 8),
                if (choices.isEmpty)
                  Text('You have every language we offer. More are coming.', style: StType.bodyMedium.copyWith(color: c.textMuted))
                else
                  _ReadyGrid(choices: choices, picked: _pick, onPick: (code) => setState(() => _pick = code)),
              ],
              if (caps.comingLater.isNotEmpty) ...[
                const SizedBox(height: 18),
                const StEyebrow('Coming later'),
                const SizedBox(height: 8),
                for (final l in caps.comingLater) ...[
                  _ComingLaterRow(lang: l, told: _told[l.code] ?? false, onToggle: () => _toggleTell(l.code)),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          ),
        ),
        if (limit == null && picked != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: StButton(label: 'Next: ${picked.name}', size: StSize.lg, block: true, onPressed: () => setState(() => _step = 2)),
          ),
        if (widget.firstRun && _error != null)
          Center(
            child: StButton(label: 'Sign out', variant: StButtonVariant.ghost, tone: StTone.neutral, size: StSize.sm, onPressed: () => ref.read(authProvider.notifier).signOut()),
          ),
      ],
    );
  }

  String _errorTitle(Object e) {
    if (e is AddLanguageRefusal) {
      return switch (e.reason) {
        AddLanguageRefusal.purgingCode => 'This language is being deleted. Try again in a few minutes.',
        AddLanguageRefusal.notAvailableCode => 'This language is not ready yet.',
        _ => 'Your plan is full.',
      };
    }
    return "We couldn't add the language.";
  }

  Widget _stepTwo(BuildContext context, LearningLanguageCaps lang) {
    final c = context.st;
    final canTest = lang.features.levelTest;
    final test = _test && canTest;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              StEyebrow(lang.name),
              const SizedBox(height: 6),
              Semantics(header: true, child: Text('Where should we start?', style: StType.headline.copyWith(color: c.textStrong))),
              const SizedBox(height: 6),
              Text(
                canTest ? 'Chat with the Coach for about 3 minutes and it finds a start point for you. Or start at A1. You can take the test later.' : 'Start at A1. The chat test for ${lang.name} comes later.',
                style: StType.bodyMedium.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: 14),
              if (canTest) ...[
                _Choice(
                  icon: StIcons.chatDots,
                  title: 'Take the chat test',
                  text: 'About 3 minutes. It starts easy and gets harder.',
                  selected: test,
                  onTap: () => setState(() => _test = true),
                ),
                const SizedBox(height: 10),
              ],
              _Choice(
                icon: StIcons.stars,
                title: 'Start at A1',
                text: lang.features.starterPack ? 'Begin with the starter pack: short ${lang.name} with sound.' : 'Begin by saving your first ${lang.name} phrases.',
                selected: !test,
                onTap: () => setState(() => _test = false),
              ),
              const SizedBox(height: 18),
              StEyebrow('Why ${lang.name}? (pick any)'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (id, label) in _goals)
                    _GoalChip(
                      label: id == 'work' ? 'Study or work in ${lang.name}' : label,
                      on: _goalsOn.contains(id),
                      onTap: () => setState(() => _goalsOn.contains(id) ? _goalsOn.remove(id) : _goalsOn.add(id)),
                    ),
                ],
              ),
              if (_error != null) ...[const SizedBox(height: 14), ErrorPanel(title: _errorTitle(_error!), error: _error is AddLanguageRefusal ? null : _error, onRetry: () => _start(lang))],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              StButton(label: test ? 'Start the chat test' : 'Start at A1', size: StSize.lg, block: true, loading: _busy, onPressed: _busy ? null : () => _start(lang)),
              const SizedBox(height: 6),
              Text(
                test ? 'You can stop at any time and start at A1.' : (lang.features.starterPack ? 'Next: a short starter pack. Saving from videos is open too.' : 'Saving from videos is open now.'),
                textAlign: TextAlign.center,
                style: StType.bodySmall.copyWith(color: c.textMuted),
              ),
              if (widget.firstRun && _error != null)
                Center(
                  child: StButton(label: 'Sign out', variant: StButtonVariant.ghost, tone: StTone.neutral, size: StSize.sm, onPressed: () => ref.read(authProvider.notifier).signOut()),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ReadyGrid extends StatelessWidget {
  const _ReadyGrid({required this.choices, required this.picked, required this.onPick});
  final List<LearningLanguageCaps> choices;
  final String? picked;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return LayoutBuilder(
      builder: (context, box) {
        final w = (box.maxWidth - 8) / 2;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final l in choices)
              SizedBox(
                width: w,
                child: Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: l.code == picked,
                  button: true,
                  label: '${l.name}, ${l.nativeName}',
                  excludeSemantics: true,
                  child: StPressable(
                    onTap: () => onPick(l.code),
                    pressedScale: 0.98,
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 58),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: l.code == picked ? c.accentTint : c.surfaceCard,
                        borderRadius: StRadius.brLg,
                        border: Border.all(color: l.code == picked ? c.jade500 : c.borderDefault, width: l.code == picked ? 2 : 1),
                      ),
                      child: Row(
                        children: [
                          StLanguageChip(l.code, size: 34, selected: l.code == picked),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.2).copyWith(color: c.textStrong)),
                                if (l.nativeName != l.name) Text(l.nativeName, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.bodySmall.copyWith(color: c.textMuted)),
                              ],
                            ),
                          ),
                          if (l.code == picked) StIcon(StIcons.checkDuo, size: 20, color: c.jade600),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ComingLaterRow extends StatelessWidget {
  const _ComingLaterRow({required this.lang, required this.told, required this.onToggle});
  final LearningLanguageCaps lang;
  final bool told;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      constraints: const BoxConstraints(minHeight: 52),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brLg, border: Border.all(color: c.borderSubtle)),
      child: Row(
        children: [
          StLanguageChip(lang.code, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lang.label, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.25).copyWith(color: c.textStrong)),
                if (told)
                  Semantics(
                    liveRegion: true,
                    child: Text('We will tell you when it is ready. Tap again to undo.', style: StType.bodySmall.copyWith(color: c.jade700, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
          StButton(
            label: told ? 'Got it' : 'Tell me',
            size: StSize.sm,
            variant: StButtonVariant.soft,
            tone: told ? StTone.accent : StTone.neutral,
            semanticLabel: told ? 'Got it. Tap to undo' : 'Tell me when ${lang.name} is ready',
            onPressed: onToggle,
          ),
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.icon, required this.title, required this.text, required this.selected, required this.onTap});
  final String icon;
  final String title;
  final String text;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: '$title. $text',
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 84),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? c.accentTint : c.surfaceCard,
            borderRadius: StRadius.brLg,
            border: Border.all(color: selected ? c.jade500 : c.borderDefault, width: selected ? 2 : 1),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: selected ? c.surfaceCard : c.ink100, borderRadius: StRadius.brMd),
                child: Center(child: StIcon(icon, size: 24, color: selected ? c.jade700 : c.ink700)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: StType.base(size: 16, weight: FontWeight.w800, height: 1.35).copyWith(color: c.textStrong)),
                    Text(text, style: StType.bodySmall.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              if (selected) StIcon(StIcons.checkDuo, size: 24, color: c.jade600),
            ],
          ),
        ),
      ),
    );
  }
}

class _GoalChip extends StatelessWidget {
  const _GoalChip({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      toggled: on,
      button: true,
      label: label,
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: on ? c.primarySoft : c.surfaceCard,
            borderRadius: StRadius.brPill,
            border: Border.all(color: on ? c.rose400 : c.borderDefault, width: on ? 1.5 : 1),
          ),
          child: Center(widthFactor: 1, child: Text(label, style: StType.base(size: 14, weight: FontWeight.w700).copyWith(color: on ? c.rose700 : c.textStrong))),
        ),
      ),
    );
  }
}
