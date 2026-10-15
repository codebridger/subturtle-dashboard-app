import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import '../capture/capture_sheet.dart';
import '../coach/start_session_sheet.dart';
import '../languages/language_ui.dart';

/// Everything Today needs, loaded together.
class TodayData {
  const TodayData({required this.board, required this.pool, required this.bundles, this.language = 'en', this.newLanguage = false});
  final List<BoardActivity> board;
  final List<PoolItem> pool;
  final List<Bundle> bundles;

  /// The language this board is for.
  final String language;

  /// The server says the language has no phrases yet (2.0).
  final bool newLanguage;

  BoardActivity? get review => board.where((a) => a.type == BoardActivity.leitnerReview && a.dueCount > 0).firstOrNull;
  int get dueCount => review?.dueCount ?? 0;
  bool get hasAnyPhrase => bundles.any((b) => b.phraseCount > 0) || pool.isNotEmpty;
}

final todayProvider = FutureProvider<TodayData>((ref) async {
  final lang = await ref.watch(activeLanguageProvider.future);
  final api = ref.read(apiProvider);
  final results = await Future.wait([api.board.getBoardSnapshot(language: lang), api.board.getPool(language: lang), api.bundles.listBundles(language: lang)]);
  final board = results[0] as BoardSnapshot;
  return TodayData(board: board.activities, pool: results[1] as List<PoolItem>, bundles: results[2] as List<Bundle>, language: lang, newLanguage: board.newLanguage);
});

/// The Today tab shows a dot when the board has a card the user has not seen.
final todayHasNewProvider = Provider<bool>((ref) => ref.watch(todayProvider).value?.board.any((a) => a.isNew) ?? false);

const _hideExtensionKey = 'today.hideExtensionCard';

/// S3 · Today (Board). One hero card with the next step, then a few optional
/// cards, each with one button. No popups: every prompt is a card here.
class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  String? _handledCapture;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Shared text arrives as /today?capture=… (share sheet or deep link).
    final text = GoRouterState.of(context).uri.queryParameters['capture'];
    if (text != null && text != _handledCapture) {
      _handledCapture = text;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.go('/today');
        openCapture(context, ref, initialText: text);
      });
    }
  }

  Future<void> _refresh() async {
    if (ref.read(languageStateProvider).hasError) ref.invalidate(languageStateProvider);
    ref.invalidate(todayProvider);
    ref.invalidate(subscriptionProvider);
    await ref.read(todayProvider.future).catchError((_) => const TodayData(board: [], pool: [], bundles: []));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final today = ref.watch(todayProvider);
    final profile = ref.watch(profileProvider).value;
    final firstName = (profile?.name ?? '').trim().split(' ').first;
    final sub = ref.watch(subscriptionProvider).value;
    final multilingual = ref.watch(multilingualProvider);
    final langName = ref.watch(activeCapsProvider).name;
    final avatar = Semantics(
      button: true,
      label: 'Open Me',
      child: GestureDetector(
        onTap: () => context.go('/me'),
        child: Padding(padding: const EdgeInsets.all(6), child: StAvatar(name: profile?.name ?? 'Me', imageUrl: profile?.pictureUrl, size: StAvatarSize.sm)),
      ),
    );

    return RefreshIndicator(
      onRefresh: _refresh,
      color: c.primary,
      child: ListView(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top, bottom: 120),
        children: [
          if (multilingual)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 10, 0),
              child: Row(children: [const Expanded(child: Align(alignment: Alignment.centerLeft, child: ActiveLanguagePill(caption: 'Saves go here'))), const SizedBox(width: 8), avatar]),
            ),
          StPageHeader(
            eyebrow: multilingual ? 'Today · $langName' : 'Today',
            title: firstName.isEmpty ? Fmt.greeting() : '${Fmt.greeting()}, $firstName',
            subtitle: today.hasValue && today.requireValue.dueCount > 0
                ? Text('${Fmt.plural(today.requireValue.dueCount, 'phrase')} ready for review', style: StType.bodyMedium.copyWith(color: c.textMuted))
                : null,
            trailing: multilingual ? null : avatar,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: AsyncBody<TodayData>(
              value: today,
              onRetry: () => retryScoped(ref, todayProvider),
              errorTitle: "We couldn't load your board.",
              loading: const _TodaySkeleton(),
              data: (d) => _Board(data: d, sub: sub),
            ),
          ),
          if (today.hasError && today.hasValue)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text("We couldn't refresh. Showing your last board.", style: StType.bodySmall.copyWith(color: c.textMuted)),
            ),
        ],
      ),
    );
  }
}

class _Board extends ConsumerWidget {
  const _Board({required this.data, required this.sub});
  final TodayData data;
  final SubscriptionDetails? sub;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final multilingual = ref.watch(multilingualProvider);
    final caps = capsOf(ref, data.language);
    final pack = ref.watch(languageStateProvider).value?.summaryOf(data.language)?.starterPack;
    final cards = <Widget>[];

    // ---- hero: the one next step ----
    // A new language never shows an empty board: it asks for a first phrase (L12).
    final fresh = !data.hasAnyPhrase || (data.newLanguage && data.dueCount == 0 && data.pool.isEmpty);
    Widget hero;
    if (data.dueCount > 0) {
      hero = _ReviewHero(activity: data.review!);
    } else if (data.pool.isNotEmpty) {
      hero = _PoolHero(count: data.pool.length);
    } else if (fresh) {
      hero = _FirstPhraseHero(languageName: multilingual ? caps.name : null);
    } else {
      hero = const _DoneHero();
    }

    // ---- optional cards, in priority order ----
    // The starter pack is an offer, not a gate (L5, L12).
    if (multilingual && caps.features.starterPack && pack != null && pack.isOpen) cards.add(_StarterCard(language: data.language, name: caps.name, pack: pack));
    if (data.dueCount > 0 && data.pool.isNotEmpty) cards.add(_PoolCard(count: data.pool.length));
    final practice = _practisePhrase(data);
    final hasCoach = caps.features.coachText || caps.features.coachVoice;
    if (data.hasAnyPhrase && sub != null && hasCoach) cards.add(_CoachCard(sub: sub!, phrase: practice?.$1, bundle: practice?.$2, sharedMinutes: multilingual));
    final plan = _planCard(sub);
    if (plan != null) cards.add(plan);
    if (!(prefs.getBool(_hideExtensionKey) ?? false)) cards.add(const _ExtensionCard());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StEyebrow.section(data.dueCount > 0 || data.pool.isNotEmpty ? 'Due today' : (fresh && multilingual ? 'Start here' : 'Next step')),
        const SizedBox(height: 12),
        hero,
        if (cards.isNotEmpty) ...[
          const SizedBox(height: 18),
          const StEyebrow.section('Optional practice'),
          const SizedBox(height: 12),
          for (final card in cards) Padding(padding: const EdgeInsets.only(bottom: 12), child: card),
        ],
      ],
    );
  }

  /// A phrase to suggest for the coach: the newest pooled phrase, else the newest bundle's.
  (String?, Bundle)? _practisePhrase(TodayData d) {
    final withPhrases = d.bundles.where((b) => b.phraseCount > 0).toList();
    if (withPhrases.isEmpty) return null;
    return (d.pool.isNotEmpty ? d.pool.last.phrase.phrase : null, withPhrases.first);
  }

  /// At most one plan-related card: the Starter save cap getting close.
  Widget? _planCard(SubscriptionDetails? s) {
    if (s == null || !s.isFreemium || s.saveWords.unlimited) return null;
    if (s.saveWords.fraction < 0.8) return null;
    return _PlanCard(used: s.saveWords.used, total: s.saveWords.total!);
  }
}

// ---------------------------------------------------------------- hero cards

class _HeroShell extends StatelessWidget {
  const _HeroShell({required this.icon, required this.iconColor, required this.title, required this.body, required this.action, this.badge, this.onTap});

  final String icon;
  final StBadgeColor iconColor;
  final String title;
  final String body;
  final Widget action;
  final Widget? badge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return StCard(
      onTap: onTap,
      semanticLabel: '$title. $body',
      padding: const EdgeInsets.all(StSpace.s5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [StIconTile(icon: icon, color: iconColor, size: 48), const Spacer(), ?badge],
          ),
          const SizedBox(height: 14),
          Text(title, style: StType.titleMedium.copyWith(color: c.textStrong)),
          const SizedBox(height: 6),
          Text(body, style: StType.bodyMedium.copyWith(color: c.textMuted)),
          const SizedBox(height: 18),
          action,
        ],
      ),
    );
  }
}

class _ReviewHero extends ConsumerWidget {
  const _ReviewHero({required this.activity});
  final BoardActivity activity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = activity.dueCount;
    final minutes = (n / 3).ceil().clamp(1, 60);
    void start() {
      ref.read(apiProvider).board.consume(activity.type, refId: activity.refId).ignore();
      context.push('/review');
    }

    return _HeroShell(
      icon: StIcons.layers,
      iconColor: StBadgeColor.warning,
      badge: const StBadge('Due', color: StBadgeColor.warning),
      title: 'Smart Review',
      body: '${Fmt.plural(n, 'phrase')} ${n == 1 ? 'is' : 'are'} due. About ${Fmt.plural(minutes, 'minute')}.',
      onTap: start,
      action: StButton(label: 'Start review', icon: StIcons.play, size: StSize.lg, block: true, onPressed: start),
    );
  }
}

class _PoolHero extends StatelessWidget {
  const _PoolHero({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return _HeroShell(
      icon: StIcons.stars,
      iconColor: StBadgeColor.accent,
      badge: const StBadge('New', color: StBadgeColor.accent),
      title: '${Fmt.plural(count, 'new word')} to meet',
      body: 'Meet them once before they go into your review box.',
      onTap: () => context.push('/pool'),
      action: StButton(label: 'Start', icon: StIcons.play, size: StSize.lg, block: true, onPressed: () => context.push('/pool')),
    );
  }
}

class _FirstPhraseHero extends ConsumerWidget {
  const _FirstPhraseHero({this.languageName});

  /// The language's name on a 2.0 server ("Save your first German phrase").
  final String? languageName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = languageName;
    return _HeroShell(
      icon: StIcons.bookmark,
      iconColor: StBadgeColor.primary,
      title: name == null ? 'Save your first phrase' : 'Save your first $name phrase',
      body: name == null ? 'Heard a phrase you like? Share it to Subturtle, or paste it here.' : 'From a video, a message or anything you read. Your $name review starts with it.',
      action: StButton(label: 'Save a phrase', icon: StIcons.add, size: StSize.lg, block: true, onPressed: () => openCapture(context, ref)),
    );
  }
}

class _DoneHero extends StatelessWidget {
  const _DoneHero();

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return StCard(
      color: c.accentTint,
      borderColor: c.accentSoft,
      child: Row(
        children: [
          const StIconTile(icon: StIcons.confetti, color: StBadgeColor.accent, size: 48),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("You're done for today", style: StType.titleMedium.copyWith(color: c.textStrong)),
                const SizedBox(height: 4),
                Text('Next review: tomorrow.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- optional cards

class _RowCard extends StatelessWidget {
  const _RowCard({required this.icon, required this.iconColor, required this.title, required this.subtitle, required this.action, this.subtitleColor, this.footer, this.onDismiss, this.note});

  final String icon;
  final StBadgeColor iconColor;
  final String title;
  final String subtitle;
  final Widget action;
  final Color? subtitleColor;
  final Widget? footer;
  final VoidCallback? onDismiss;

  /// A small line under the footer.
  final String? note;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return StCard(
      padding: const EdgeInsets.all(StSpace.s4),
      elevation: StCardElevation.xs,
      child: Column(
        children: [
          Row(
            children: [
              StIconTile(icon: icon, color: iconColor),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: StType.titleSmall.copyWith(color: c.textStrong)),
                    Text(subtitle, style: StType.bodySmall.copyWith(color: subtitleColor ?? c.textMuted, fontWeight: subtitleColor == null ? FontWeight.w600 : FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // A dismissable card puts its × here and its action on its own row below.
              if (onDismiss == null) action else StIconButton(icon: StIcons.close, semanticLabel: 'Hide this card', variant: StButtonVariant.ghost, size: StSize.sm, onPressed: onDismiss),
            ],
          ),
          if (onDismiss != null) Align(alignment: Alignment.centerRight, child: action),
          if (footer != null) ...[const SizedBox(height: 10), footer!],
          if (note != null) ...[const SizedBox(height: 6), Align(alignment: Alignment.centerLeft, child: Text(note!, style: StType.bodySmall.copyWith(color: c.textMuted)))],
        ],
      ),
    );
  }
}

class _PoolCard extends StatelessWidget {
  const _PoolCard({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) => _RowCard(
        icon: StIcons.stars,
        iconColor: StBadgeColor.accent,
        title: '${Fmt.plural(count, 'new word')} to meet',
        subtitle: 'A first look before review',
        action: StButton(label: 'Start', variant: StButtonVariant.soft, tone: StTone.accent, size: StSize.sm, onPressed: () => context.push('/pool')),
      );
}

class _StarterCard extends StatelessWidget {
  const _StarterCard({required this.language, required this.name, required this.pack});
  final String language;
  final String name;
  final StarterPackSummary pack;

  @override
  Widget build(BuildContext context) {
    final started = pack.heard > 0;
    return _RowCard(
      icon: StIcons.stars,
      iconColor: StBadgeColor.accent,
      title: '$name starter pack',
      subtitle: started ? '${pack.heard} of ${pack.total} chunks heard' : 'Optional · ${pack.total > 0 ? '${pack.total} ' : ''}short phrases with sound',
      action: StButton(label: started ? 'Continue' : 'Start', variant: StButtonVariant.soft, tone: StTone.accent, size: StSize.sm, onPressed: () => context.push('/starter?lang=$language')),
    );
  }
}

class _CoachCard extends ConsumerWidget {
  const _CoachCard({required this.sub, this.phrase, this.bundle, this.sharedMinutes = false});
  final SubscriptionDetails sub;
  final String? phrase;
  final Bundle? bundle;

  /// Say that voice minutes are shared by every language (2.0).
  final bool sharedMinutes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final total = sub.voiceTotal;
    final left = sub.voiceRemaining;
    final low = sub.hasVoice && total > 0 && left <= total * 0.2;
    final subtitle = !sub.hasVoice
        ? 'Text chat with your coach'
        : left == 0
            ? 'No voice minutes left this month'
            : low
                ? 'Only $left of $total minutes left this month'
                : '$left of $total voice minutes left';
    return _RowCard(
      icon: StIcons.coach,
      iconColor: StBadgeColor.info,
      title: phrase == null ? 'Practise with Coach' : 'Practise "$phrase" with Coach',
      subtitle: subtitle,
      subtitleColor: low ? c.amber600 : null,
      action: StButton(label: 'Talk', variant: StButtonVariant.ghost, tone: StTone.neutral, size: StSize.sm, onPressed: () => openStartSession(context, ref, bundleId: bundle?.id)),
      footer: sub.hasVoice && total > 0
          ? StProgressBar(
              value: (total - left).toDouble(),
              max: total.toDouble(),
              color: left == 0 ? StBadgeColor.danger : (low ? StBadgeColor.warning : StBadgeColor.primary),
              size: StSize3.sm,
              semanticLabel: 'Voice minutes used',
            )
          : null,
      note: sharedMinutes && sub.hasVoice ? 'Voice minutes are shared by all your languages.' : null,
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.used, required this.total});
  final int used;
  final int total;

  @override
  Widget build(BuildContext context) => _RowCard(
        icon: StIcons.crown,
        iconColor: StBadgeColor.primary,
        title: '$used of $total saves used',
        subtitle: 'Starter saves up to $total phrases a month',
        action: AppConfig.purchaseLinks ? StButton(label: 'See plans', variant: StButtonVariant.soft, size: StSize.sm, onPressed: () => context.go('/me/plan')) : const SizedBox.shrink(),
      );
}

class _ExtensionCard extends ConsumerWidget {
  const _ExtensionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) => _RowCard(
        icon: StIcons.monitor,
        iconColor: StBadgeColor.neutral,
        title: 'Save words while you watch',
        subtitle: 'Get the Chrome extension on your computer',
        action: StButton(
          label: 'Copy link',
          variant: StButtonVariant.ghost,
          tone: StTone.neutral,
          size: StSize.sm,
          onPressed: () {
            Clipboard.setData(const ClipboardData(text: AppConfig.chromeExtensionUrl));
            showStToast(context, title: 'Link copied', description: 'Open it on your computer.');
          },
        ),
        onDismiss: () {
          ref.read(prefsProvider).setBool(_hideExtensionKey, true);
          ref.invalidate(todayProvider);
        },
      );
}

class _TodaySkeleton extends StatelessWidget {
  const _TodaySkeleton();
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading your board',
        child: const Column(children: [StSkeleton(height: 210), SizedBox(height: 12), StSkeleton(height: 76), SizedBox(height: 12), StSkeleton(height: 76)]),
      );
}
