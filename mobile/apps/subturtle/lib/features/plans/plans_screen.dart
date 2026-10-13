import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';
import 'local_pricing.dart';

final plansProvider = FutureProvider<List<TierPlan>>((ref) => ref.read(apiProvider).subscription.getPlans());

/// S18 · Your plan. Read only on mobile: buying or changing a plan happens on
/// the web ("Manage"), because in-app purchase needs backend work first.
class PlansScreen extends ConsumerStatefulWidget {
  const PlansScreen({super.key});

  @override
  ConsumerState<PlansScreen> createState() => _PlansScreenState();
}

class _PlansScreenState extends ConsumerState<PlansScreen> {
  bool _yearly = false;

  /// The web subscription page, signed in. [suggest] opens it with that plan picked.
  void _manage([String? suggest]) =>
      openDashboard(context, ref, Uri(path: '/settings/subscription', queryParameters: {'suggest': ?suggest, 'from': 'mobile'}).toString());

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final sub = ref.watch(subscriptionProvider);
    final plans = ref.watch(plansProvider);
    final hasYearly = plans.value?.any((p) => p.annualGbp != null) ?? false;
    // Local prices, like the web (Stripe Adaptive Pricing); GBP until known or for paid users.
    final local = ref.watch(localPricingProvider);
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              color: c.primary,
              onRefresh: () async {
                ref.invalidate(subscriptionProvider);
                ref.invalidate(plansProvider);
                await ref.read(subscriptionProvider.future).catchError((_) => const SubscriptionDetails(isFreemium: true, tier: 'starter'));
              },
              child: ListView(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top, 16, 24),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 0),
                      child: Transform.translate(offset: const Offset(-12, 0), child: StTopBarButton(icon: StIcons.back, semanticLabel: 'Back', iconSize: 24, onPressed: () => context.go('/me'))),
                    ),
                  ),
                  const StEyebrow('Account'),
                  const SizedBox(height: 6),
                  Semantics(header: true, child: Text('Your plan', style: StType.headline.copyWith(color: c.textStrong))),
                  const SizedBox(height: 14),
                  AsyncBody<SubscriptionDetails>(
                    value: sub,
                    onRetry: () => ref.invalidate(subscriptionProvider),
                    errorTitle: "We couldn't load your plan.",
                    loading: const StSkeleton(height: 180),
                    data: (s) => _CurrentPlan(sub: s, plan: plans.value?.where((p) => p.id == s.tier).firstOrNull, onManage: _manage),
                  ),
                  const SizedBox(height: 20),
                  const StEyebrow.section('All plans'),
                  const SizedBox(height: 10),
                  if (hasYearly) ...[
                    StSegmentedControl<bool>(
                      block: true,
                      segments: const [StSegment(false, 'Monthly'), StSegment(true, 'Yearly')],
                      value: _yearly,
                      onChanged: (v) => setState(() => _yearly = v),
                    ),
                    const SizedBox(height: 10),
                  ],
                  AsyncBody<List<TierPlan>>(
                    value: plans,
                    onRetry: () => ref.invalidate(plansProvider),
                    errorTitle: "We couldn't load the plans.",
                    loading: const Column(children: [StSkeleton(height: 84), SizedBox(height: 10), StSkeleton(height: 84), SizedBox(height: 10), StSkeleton(height: 84)]),
                    data: (list) => Column(
                      children: [
                        for (final p in list)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _TierCard(
                              plan: p,
                              yearly: _yearly,
                              current: sub.value?.tier == p.id,
                              local: local.value,
                              pricing: local.isLoading,
                              onTap: () => _manage(p.id),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(color: c.surfaceCard, border: Border(top: BorderSide(color: c.borderSubtle))),
            padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                StButton(label: 'Manage on the web', iconRight: StIcons.external, size: StSize.lg, block: true, onPressed: _manage),
                const SizedBox(height: 8),
                Text(
                  local.value == null
                      ? 'For now, plans and extra minutes are bought on the web. Prices are in GBP. Plans renew automatically; cancel any time.'
                      : 'For now, plans and extra minutes are bought on the web. Prices are in your currency, as charged at checkout. Plans renew automatically; cancel any time.',
                  textAlign: TextAlign.center,
                  style: StType.base(size: 11, weight: FontWeight.w600).copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          const PricingProbeHost(),
        ],
      ),
    );
  }
}

class _CurrentPlan extends StatelessWidget {
  const _CurrentPlan({required this.sub, required this.plan, required this.onManage});
  final SubscriptionDetails sub;
  final TierPlan? plan;
  final VoidCallback onManage;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final price = sub.isFreemium
        ? 'Free'
        : (sub.cadence == 'annual' ? (plan?.annualGbp == null ? null : '${Fmt.gbp(plan!.annualGbp!)}/yr') : (plan?.monthlyGbp == null ? null : '${Fmt.gbp(plan!.monthlyGbp!)}/mo'));
    final dateLine = sub.isFreemium
        ? 'Free allowance resets on ${Fmt.longDate(sub.endDate)}'
        : sub.cancelAtPeriodEnd
            ? 'Ends on ${Fmt.longDate(sub.endDate)}'
            : sub.isTrial
                ? 'Trial ends on ${Fmt.longDate(sub.trialEnd ?? sub.endDate)}'
                : 'Renews on ${Fmt.longDate(sub.endDate)}';
    return StCard(
      borderColor: c.primary,
      borderWidth: 1.5,
      elevation: StCardElevation.md,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(sub.tierName, style: StType.titleLarge.copyWith(color: c.textStrong)),
              const SizedBox(width: 8),
              StBadge(sub.cancelAtPeriodEnd ? 'Ending' : (sub.isTrial ? 'Trial' : 'Current'), color: sub.cancelAtPeriodEnd ? StBadgeColor.warning : StBadgeColor.neutral),
              const Spacer(),
              if (price != null) Text(price, style: StType.titleSmall.copyWith(color: c.textStrong)),
            ],
          ),
          const SizedBox(height: 4),
          Text(dateLine, style: StType.bodySmall.copyWith(color: c.textMuted)),
          const SizedBox(height: 14),
          if (sub.hasVoice) _Meter(label: 'Voice minutes', used: sub.voiceTotal - sub.voiceRemaining, total: sub.voiceTotal, unit: 'minutes left', showLeft: true),
          _Meter(label: 'Saved phrases', used: sub.saveWords.used, total: sub.saveWords.total),
          _Meter(label: 'Text chats', used: sub.textChats.used, total: sub.textChats.total),
          if (sub.isFreemium) _Meter(label: 'Voice chats', used: sub.liveSessions.used, total: sub.liveSessions.total),
        ],
      ),
    );
  }
}

class _Meter extends StatelessWidget {
  const _Meter({required this.label, required this.used, required this.total, this.unit, this.showLeft = false});
  final String label;
  final int used;
  final int? total;
  final String? unit;
  final bool showLeft;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final unlimited = total == null;
    final frac = unlimited || total == 0 ? 0.0 : used / total!;
    final color = frac >= 1 ? StBadgeColor.danger : (frac >= 0.8 ? StBadgeColor.warning : StBadgeColor.primary);
    final value = unlimited ? 'Unlimited' : (showLeft ? '${(total! - used).clamp(0, total!)} of $total ${unit ?? ''}' : '$used / $total');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(label, style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: c.textStrong)),
              const Spacer(),
              Text(value, style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: frac >= 0.8 ? c.amber600 : c.textMuted)),
            ],
          ),
          if (!unlimited) ...[const SizedBox(height: 5), StProgressBar(value: used.toDouble(), max: (total ?? 0).toDouble(), color: color, size: StSize3.sm, semanticLabel: label)],
        ],
      ),
    );
  }
}

class _TierCard extends StatelessWidget {
  const _TierCard({required this.plan, required this.yearly, required this.current, required this.onTap, this.local, this.pricing = false});
  final TierPlan plan;
  final bool yearly;
  final bool current;

  /// Local prices when known; else GBP.
  final LocalPricing? local;

  /// Still finding the local prices: a placeholder, so GBP does not flash first.
  final bool pricing;

  /// Opens the web subscription page with this plan picked.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    String amount(double gbp) => local?.format(gbp) ?? Fmt.gbp(gbp);
    final price = !plan.isPaid
        ? 'Free'
        : yearly
            ? (plan.annualGbp == null ? '' : '${amount(plan.annualGbp!)}/yr')
            : (plan.monthlyGbp == null ? '' : '${amount(plan.monthlyGbp!)}/mo');
    final key = plan.featureLabels.isNotEmpty ? plan.featureLabels.first : plan.tagline;
    final more = plan.featureLabels.skip(1).take(2).join(' · ');
    return StCard(
      onTap: onTap,
      semanticLabel: '${plan.name}, $price${current ? ', current plan' : ''}. Opens the plan on the web.',
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      elevation: current ? StCardElevation.md : StCardElevation.xs,
      borderColor: current ? c.primary : null,
      borderWidth: current ? 1.5 : 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(plan.name, style: StType.titleMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w900)),
              const SizedBox(width: 8),
              if (current) const StBadge('Current'),
              if (!current && plan.highlight) StBadge(plan.badge ?? 'Most popular', color: StBadgeColor.primary),
              if (!plan.live) const StBadge('Coming soon'),
              const Spacer(),
              if (pricing && plan.isPaid)
                const StSkeleton(width: 72, height: 18)
              else
                Text(price, style: StType.titleSmall.copyWith(color: c.textStrong, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 3),
          if (key.isNotEmpty) Text(key, style: StType.bodyMedium.copyWith(color: current ? c.rose700 : c.textBody, fontWeight: FontWeight.w800)),
          if (more.isNotEmpty) Text(more, style: StType.bodySmall.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}
