import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/languages.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';

final _versionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

/// Day streak of saving phrases, like the web statistics page. Needs the
/// "weekly insights" feature (Learner and up); null when not available.
final streakProvider = FutureProvider<int?>((ref) async {
  try {
    final api = ref.read(apiProvider);
    final res = await api.functions.run('generateChartDataForInsertionRatio', {
      'userId': api.auth.user!.id,
      'days': 13,
      'database': Db.userContent,
      'collection': Db.phrase,
    });
    if (res is! List) return null;
    final byDay = <String, int>{};
    for (final row in res) {
      if (row is List && row.length >= 2) byDay[row[0].toString()] = (row[1] as num).toInt();
    }
    var streak = 0;
    var day = DateTime.now();
    String key(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    // Today without a save yet does not break the streak.
    if ((byDay[key(day)] ?? 0) == 0) day = day.subtract(const Duration(days: 1));
    while ((byDay[key(day)] ?? 0) > 0) {
      streak++;
      day = day.subtract(const Duration(days: 1));
    }
    return streak;
  } catch (_) {
    return null;
  }
});

/// S17 · Me: profile, plan, settings, links, sign out.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.st;
    final user = ref.watch(authProvider).user;
    final profile = ref.watch(profileProvider).value;
    final sub = ref.watch(subscriptionProvider);
    final stats = ref.watch(statsProvider).value;
    final streak = ref.watch(streakProvider).value;
    final settings = ref.watch(settingsProvider);
    final lang = ref.watch(languageProvider).value;
    final name = (profile?.name ?? '').isEmpty ? 'Your account' : profile!.name!;

    return RefreshIndicator(
      color: c.primary,
      onRefresh: () async {
        ref.invalidate(profileProvider);
        ref.invalidate(subscriptionProvider);
        ref.invalidate(statsProvider);
        ref.invalidate(streakProvider);
        await ref.read(subscriptionProvider.future).catchError((_) => const SubscriptionDetails(isFreemium: true, tier: 'starter'));
      },
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 16, 16, 40),
        children: [
          Row(
            children: [
              StAvatar(name: name, imageUrl: profile?.pictureUrl, size: StAvatarSize.lg),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const StEyebrow('Account'),
                    const SizedBox(height: 2),
                    Semantics(header: true, child: Text(name, style: StType.titleLarge.copyWith(color: c.textStrong))),
                    if (user?.email != null) Text(user!.email!, style: StType.bodySmall.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _MiniStat(value: streak == null ? '—' : '$streak', label: 'day streak', accent: true)),
              const SizedBox(width: 8),
              Expanded(child: _MiniStat(value: stats == null ? '—' : '${stats.learned}', label: 'phrases learned')),
              const SizedBox(width: 8),
              Expanded(child: _MiniStat(value: sub.value == null ? '—' : '${sub.value!.voiceMinutesUsed}', label: 'minutes talked')),
            ],
          ),
          const SizedBox(height: 14),
          _PlanRow(sub: sub),
          const SizedBox(height: 14),
          _Group(
            children: [
              _Row(
                label: 'Translate into',
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (lang != null) ...[
                      if (lang.nativeName != lang.name) StL1Text(lang.nativeName, rtl: lang.rtl, style: StType.bodyMedium.copyWith(color: c.textMuted)),
                      const SizedBox(width: 4),
                      Text(lang.name, style: StType.bodyMedium.copyWith(color: c.textMuted, fontWeight: FontWeight.w700)),
                    ],
                    StIcon(StIcons.chevronRight, size: 16, color: c.textMuted),
                  ],
                ),
                onTap: () => _pickLanguage(context, ref, lang),
              ),
              _Row(label: 'Haptics', trailing: StSwitch(value: settings.haptics, onChanged: ref.read(settingsProvider.notifier).setHaptics, semanticLabel: 'Haptics')),
              _Row(
                label: 'Theme',
                last: true,
                trailing: StSegmentedControl<ThemeMode>(
                  small: true,
                  segments: const [StSegment(ThemeMode.system, 'System'), StSegment(ThemeMode.light, 'Light'), StSegment(ThemeMode.dark, 'Dark')],
                  value: settings.themeMode,
                  onChanged: ref.read(settingsProvider.notifier).setTheme,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text("Text size follows your phone's setting.", style: StType.bodySmall.copyWith(color: c.textMuted)),
          ),
          const SizedBox(height: 14),
          _Group(
            children: [
              _LinkRow(icon: StIcons.chart, label: 'Progress and review settings on the web', onTap: () => openDashboard(context, ref, '/statistic')),
              _LinkRow(
                icon: StIcons.chrome,
                label: 'Copy the Chrome extension link',
                external: false,
                onTap: () {
                  Clipboard.setData(const ClipboardData(text: AppConfig.chromeExtensionUrl));
                  showStToast(context, title: 'Link copied', description: 'Open it on your computer.');
                },
              ),
              _LinkRow(icon: StIcons.info, label: 'Contact us', onTap: () => openExternal(context, AppConfig.contactEmail)),
              _LinkRow(icon: StIcons.lock, label: 'Privacy', onTap: () => openExternal(context, AppConfig.privacyUrl)),
              _LinkRow(icon: StIcons.documents, label: 'Terms', last: true, onTap: () => openExternal(context, AppConfig.termsUrl)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              StButton(
                label: 'Sign out',
                icon: StIcons.logout,
                variant: StButtonVariant.ghost,
                tone: StTone.neutral,
                size: StSize.sm,
                onPressed: () async {
                  final ok = await confirmSheet(context, title: 'Sign out?', confirm: 'Sign out');
                  if (ok) await ref.read(authProvider.notifier).signOut();
                },
              ),
              const SizedBox(width: 8),
              StButton(label: 'Delete account', icon: StIcons.trash, variant: StButtonVariant.ghost, tone: StTone.danger, size: StSize.sm, onPressed: () => _deleteAccount(context, ref)),
            ],
          ),
          const SizedBox(height: 10),
          Center(child: Text('Version ${ref.watch(_versionProvider).value ?? ''}', style: StType.bodySmall.copyWith(color: c.textFaint))),
        ],
      ),
    );
  }

  Future<void> _pickLanguage(BuildContext context, WidgetRef ref, AppLanguage? current) async {
    final picked = await showModalBottomSheet<AppLanguage>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.st.surfaceCard,
      barrierColor: context.st.surfaceOverlay,
      builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: _LanguagePicker(current: current)),
    );
    if (picked != null) ref.read(settingsProvider.notifier).setLanguage(picked);
  }

  /// There is no delete-account API yet, so this explains how to ask for it.
  /// Deletes the account in the app (App Store 5.1.1(v)): phrases, bundles,
  /// reviews, coach sessions and a paid plan go with it.
  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await confirmSheet(
      context,
      title: 'Delete your account?',
      body: 'This deletes your account and everything in it: your phrases, bundles, reviews and coach sessions. A paid plan is cancelled. This cannot be undone.',
      confirm: 'Delete my account',
      danger: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(apiProvider).profile.deleteAccount();
      if (context.mounted) showStToast(context, title: 'Your account was deleted.');
      await ref.read(authProvider.notifier).signOut();
    } catch (e) {
      if (context.mounted) showStToast(context, title: "We couldn't delete your account.", description: friendlyError(e), color: StToastColor.danger);
    }
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.value, required this.label, this.accent = false});
  final String value;
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      label: '$value $label',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: c.surfaceCard, border: Border.all(color: c.borderSubtle), borderRadius: StRadius.brMd),
        child: Column(
          children: [
            Text(value, style: StType.titleLarge.copyWith(color: accent ? c.jade600 : c.textStrong)),
            Text(label, textAlign: TextAlign.center, style: StType.base(size: 11, weight: FontWeight.w800).copyWith(color: c.textMuted)),
          ],
        ),
      ),
    );
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({required this.sub});
  final AsyncValue<SubscriptionDetails> sub;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final s = sub.value;
    if (s == null) return sub.hasError ? const SizedBox.shrink() : const StSkeleton(height: 64, radius: StRadius.lg);
    final low = s.hasVoice && s.voiceRemaining <= s.voiceTotal * 0.2;
    final line = !s.hasVoice ? 'Text chat with your coach' : '${s.voiceRemaining} of ${s.voiceTotal} voice minutes left';
    return Semantics(
      button: true,
      label: '${s.tierName} plan. $line. Open your plan.',
      excludeSemantics: true,
      child: StPressable(
        onTap: () => context.go('/me/plan'),
        pressedScale: 0.99,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.primaryTint, border: Border.all(color: c.primarySoft), borderRadius: StRadius.brLg),
          child: Row(
            children: [
              StIcon(StIcons.crown, size: 26, color: c.rose600),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${s.tierName} plan', style: StType.titleSmall.copyWith(color: c.textStrong)),
                    Text(line, style: StType.bodySmall.copyWith(color: low ? c.amber600 : c.textMuted, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              StIcon(StIcons.chevronRight, size: 20, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(color: c.surfaceCard, border: Border.all(color: c.borderSubtle), borderRadius: StRadius.brLg),
      child: Column(children: children),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.trailing, this.onTap, this.last = false});
  final String label;
  final Widget trailing;
  final VoidCallback? onTap;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final row = Container(
      constraints: const BoxConstraints(minHeight: 52),
      decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: c.borderSubtle))),
      child: Row(
        children: [
          Expanded(child: Text(label, style: StType.bodyMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w700))),
          const SizedBox(width: 8),
          // The control keeps its natural size, and shrinks to fit at very large text sizes.
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.62),
            child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerRight, child: trailing),
          ),
        ],
      ),
    );
    if (onTap == null) return row;
    return Semantics(button: true, child: StPressable(onTap: onTap, pressedScale: 1, child: row));
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.icon, required this.label, required this.onTap, this.external = true, this.last = false});
  final String icon;
  final String label;
  final VoidCallback onTap;
  final bool external;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: StPressable(
        onTap: onTap,
        pressedScale: 1,
        child: Container(
          constraints: const BoxConstraints(minHeight: 50),
          decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: c.borderSubtle))),
          child: Row(
            children: [
              StIcon(icon, size: 20, color: c.textMuted),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: StType.bodyMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w700))),
              if (external) StIcon(StIcons.external, size: 16, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _LanguagePicker extends StatefulWidget {
  const _LanguagePicker({this.current});
  final AppLanguage? current;

  @override
  State<_LanguagePicker> createState() => _LanguagePickerState();
}

class _LanguagePickerState extends State<_LanguagePicker> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final q = _q.text.trim().toLowerCase();
    final list = AppLanguage.all.where((l) => q.isEmpty || l.name.toLowerCase().contains(q) || l.nativeName.toLowerCase().contains(q)).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: StSheet(
        title: 'Translate into',
        scrollable: false,
        child: Column(
          children: [
            Text('Which language should we translate into?', style: StType.bodyMedium.copyWith(color: c.textMuted)),
            const SizedBox(height: 10),
            StInput(controller: _q, placeholder: 'Search languages', icon: StIcons.search, onChanged: (_) => setState(() {})),
            const SizedBox(height: 8),
            Expanded(
              child: ListView(
                children: [
                  for (final l in list)
                    Semantics(
                      button: true,
                      selected: l == widget.current,
                      label: l.name,
                      excludeSemantics: true,
                      child: StPressable(
                        pressedScale: 1,
                        onTap: () => Navigator.pop(context, l),
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 52),
                          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.borderSubtle))),
                          child: Row(
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    StL1Text(l.nativeName, rtl: l.rtl, style: StType.titleSmall.copyWith(color: c.textStrong)),
                                    if (l.nativeName != l.name) Text('  ${l.name}', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                                  ],
                                ),
                              ),
                              if (l == widget.current) StIcon(StIcons.check, size: 20, color: c.rose600),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
