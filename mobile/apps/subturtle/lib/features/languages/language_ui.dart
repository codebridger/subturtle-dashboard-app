import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/languages.dart';
import '../../shared/widgets.dart';

/// Shared language helpers: the copy every language screen uses, the plan
/// limit (M-15), and the switch that takes the learner to the new Today.

/// "Starting at A1 · 7 due · 38 phrases".
String languageMeta(LanguageSummary s) => 'Starting at ${s.startLevel} · ${s.dueCount} due · ${Fmt.plural(s.phraseCount, 'phrase')}';

/// "2 of 10 used".
String usedText(LanguageState s) => '${s.used} of ${s.maxLanguages} used';

/// The plan's name as learners see it.
String planName(String plan) => plan.isEmpty ? 'Starter' : plan[0].toUpperCase() + plan.substring(1);

/// What to show instead of "Add a language" at the plan's limit, or null when
/// the learner can still add one. Starter never offers a swap (no Manage).
class PlanLimit {
  const PlanLimit({required this.text, this.actionLabel, this.canManage = false});
  final String text;

  /// "See plans" or "Upgrade"; null when no bigger plan has more languages.
  final String? actionLabel;

  /// Reader (and the top plans) may remove one to make room. Starter may not.
  final bool canManage;
}

PlanLimit? planLimitOf(LanguageState s) {
  if (!s.fromServer || !s.atLimit) return null;
  return switch (s.plan) {
    'starter' => const PlanLimit(text: 'Starter includes 1 language. To learn another, go Reader (3 languages) or Learner (10).', actionLabel: 'See plans'),
    'reader' => PlanLimit(text: 'You use ${s.used} of ${s.maxLanguages} languages on Reader. For up to 10, go Learner. Or remove one.', actionLabel: 'Upgrade', canManage: true),
    _ => PlanLimit(text: 'You use ${s.used} of ${s.maxLanguages} languages on ${planName(s.plan)}. Remove one to add another.', canManage: true),
  };
}

/// The plan-limit card. Upgrade opens Plans (read-only on the phone).
class PlanLimitCard extends StatelessWidget {
  const PlanLimitCard({super.key, required this.limit, this.onManage, this.onUpgrade});
  final PlanLimit limit;
  final VoidCallback? onManage;
  final VoidCallback? onUpgrade;

  @override
  Widget build(BuildContext context) => StPlanLimitCard(
        text: limit.text,
        actionLabel: limit.actionLabel,
        onAction: onUpgrade ?? () => context.push('/me/plan'),
        secondaryLabel: limit.canManage && onManage != null ? 'Manage' : null,
        onSecondary: onManage,
      );
}

/// The ready languages the learner does not have yet, for the add row's note.
String addNote(LanguageCapabilities caps, LanguageState s) {
  final have = {for (final l in s.languages) if (!l.isRemoved) l.code};
  final names = [for (final l in caps.ready) if (!have.contains(l.code)) l.name];
  if (names.isEmpty) return 'All our languages are in your list';
  if (names.length <= 3) return names.join(', ');
  return '${names.take(3).join(', ')} and more';
}

/// Makes [code] the active language and goes to its Today, with every tab back
/// at its first screen (a bundle of the old language must not stay open).
/// The scoped screens show their skeleton while they reload.
Future<bool> switchLanguage(BuildContext context, WidgetRef ref, String code) async {
  final router = GoRouter.of(context);
  try {
    await ref.read(languageStateProvider.notifier).setActive(code);
  } catch (e) {
    if (context.mounted) showStToast(context, title: friendlyError(e), color: StToastColor.danger);
    return false;
  }
  ref.read(hapticsProvider).success();
  resetTabsToToday(router);
  return true;
}

/// Sends every tab back to its root and shows Today.
void resetTabsToToday(GoRouter router) {
  for (final root in const ['/coach', '/me', '/bundles', '/today']) {
    router.go(root);
  }
}

/// The active language's pill (Today, Bundles). Hidden on a 1.x server.
class ActiveLanguagePill extends ConsumerWidget {
  const ActiveLanguagePill({super.key, this.caption});
  final String? caption;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(languageStateProvider).value;
    if (state == null || !state.fromServer || state.learningLanguage == null) return const SizedBox.shrink();
    final caps = capsOf(ref, state.active);
    final summary = state.summaryOf(state.active);
    return StLanguagePill(
      code: caps.code,
      name: caps.name,
      level: summary?.startLevel ?? CefrStart.a1,
      caption: caption,
      onTap: () => openLanguageSwitcher(context, ref),
    );
  }
}

/// L1 · the language switcher sheet.
Future<void> openLanguageSwitcher(BuildContext context, WidgetRef ref) {
  ref.read(hapticsProvider).selection();
  return showStBottomSheet<void>(context: context, useRootNavigator: true, builder: (_) => const LanguageSwitcherSheet());
}

class LanguageSwitcherSheet extends ConsumerStatefulWidget {
  const LanguageSwitcherSheet({super.key});

  @override
  ConsumerState<LanguageSwitcherSheet> createState() => _LanguageSwitcherSheetState();
}

class _LanguageSwitcherSheetState extends ConsumerState<LanguageSwitcherSheet> {
  String? _switching;

  Future<void> _pick(String code, LanguageState s) async {
    if (code == s.active) {
      Navigator.pop(context);
      return;
    }
    setState(() => _switching = code);
    final router = GoRouter.of(context);
    try {
      await ref.read(languageStateProvider.notifier).setActive(code);
    } catch (e) {
      if (!mounted) return;
      setState(() => _switching = null);
      showStToast(context, title: friendlyError(e), color: StToastColor.danger);
      return;
    }
    ref.read(hapticsProvider).success();
    if (mounted) Navigator.pop(context);
    resetTabsToToday(router);
  }

  void _goTo(String location) {
    final router = GoRouter.of(context);
    Navigator.pop(context);
    router.push(location);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final s = ref.watch(languageStateProvider).value;
    final caps = ref.watch(languageCapsProvider).value ?? LanguageCapabilities.fallback;
    final l1 = ref.watch(l1Provider).value;
    if (s == null) return const StSheet(title: 'Which language now?', child: SkeletonList(count: 2));
    final limit = planLimitOf(s);
    return StSheet(
      eyebrow: 'Your languages',
      title: 'Which language now?',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Picking a language takes you to its Today. Your plan and voice minutes stay the same.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
          const SizedBox(height: 14),
          LanguagePicker(
            state: s,
            caps: caps,
            busyCode: _switching,
            onPick: (code) => _pick(code, s),
          ),
          const SizedBox(height: 10),
          if (limit == null)
            StLanguageAddRow(note: addNote(caps, s), usedText: usedText(s), onTap: () => _goTo('/add-language'))
          else
            PlanLimitCard(limit: limit, onManage: () => _goTo('/me/languages'), onUpgrade: () => _goTo('/me/plan')),
          const SizedBox(height: 18),
          const StEyebrow('Your own language'),
          const SizedBox(height: 8),
          if (l1 != null) OwnLanguageRow(language: l1, onTap: () {
                final router = GoRouter.of(context);
                Navigator.pop(context);
                router.go('/me');
              }),
          const SizedBox(height: 12),
          Center(
            child: StButton(label: 'Manage languages', size: StSize.sm, variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: () => _goTo('/me/languages')),
          ),
          SizedBox(height: MediaQuery.paddingOf(context).bottom),
        ],
      ),
    );
  }
}

/// The learner's languages with the active one ticked (Part-LanguagePicker).
/// Used to switch language and to choose where one phrase is saved.
class LanguagePicker extends ConsumerWidget {
  const LanguagePicker({super.key, required this.state, required this.caps, required this.onPick, this.selected, this.busyCode});

  final LanguageState state;
  final LanguageCapabilities caps;
  final ValueChanged<String> onPick;

  /// The ticked row; the active language by default.
  final String? selected;
  final String? busyCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticked = selected ?? state.active;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final l in state.studying) ...[
          StLanguageOption(
            code: l.code,
            title: caps.learningByCode(l.code)?.label ?? l.code.toUpperCase(),
            meta: languageMeta(l),
            selected: l.code == ticked,
            trailing: busyCode == l.code ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)) : null,
            onTap: busyCode == null ? () => onPick(l.code) : null,
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

/// "You speak Persian · Change" (the own language is the same for every language).
class OwnLanguageRow extends StatelessWidget {
  const OwnLanguageRow({super.key, required this.language, this.onTap});
  final AppLanguage language;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    // "فا" for a right-to-left script (as drawn), the code for the others ("EN").
    final short = language.rtl ? language.nativeName.characters.take(2).toString() : language.code.toUpperCase();
    return Semantics(
      button: true,
      label: 'Your own language is ${language.name}. Change it',
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 0.99,
        child: Container(
          constraints: const BoxConstraints(minHeight: 60),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: StRadius.brLg),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd),
                child: StL1Text(short, rtl: language.rtl, style: StType.base(size: 14, weight: FontWeight.w700).copyWith(color: c.textStrong)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('You speak ${language.name}', style: StType.base(size: 14, weight: FontWeight.w800, height: 1.3).copyWith(color: c.textStrong)),
                    Text('Translations and Coach explanations use it, for every language.', style: StType.bodySmall.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              Text('Change', style: StType.label.copyWith(color: c.textLink)),
              StIcon(StIcons.chevronRight, size: 16, color: c.textLink),
            ],
          ),
        ),
      ),
    );
  }
}
