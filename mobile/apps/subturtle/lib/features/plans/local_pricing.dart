import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import 'plans_screen.dart';

/// Prices in the learner's own currency, exactly as Stripe Checkout will
/// charge them (Adaptive Pricing), the same way the web Plans page does.
///
/// Stripe only reveals the localized currency and its rate to Stripe.js, in
/// the browser: it picks the currency for the visitor and adds a 2–4%
/// conversion fee that a market rate cannot reproduce. So the app runs the web's
/// probe in a hidden WebView: create a Checkout session, open it with
/// `adaptivePricing`, read the session's currency and rate.
@immutable
class LocalPricing {
  const LocalPricing({required this.currency, required this.fxRate, required this.at});

  /// ISO code in lower case, as Stripe sends it (`eur`).
  final String currency;

  /// Local units per pound.
  final double fxRate;
  final DateTime at;

  /// [gbp] in the local currency, e.g. "€13.53".
  String format(double gbp) => NumberFormat.simpleCurrency(name: currency.toUpperCase()).format(gbp * fxRate);

  Map<String, dynamic> toJson() => {'currency': currency, 'fxRate': fxRate, 'at': at.toIso8601String()};

  static LocalPricing? fromJson(Map<String, dynamic> j) {
    final currency = j['currency'], rate = j['fxRate'], at = DateTime.tryParse('${j['at']}');
    if (currency is! String || rate is! num || at == null) return null;
    return LocalPricing(currency: currency, fxRate: rate.toDouble(), at: at);
  }
}

/// Reads the probe's reply. Uses Stripe's own conversion rate when present
/// (so every price matches checkout), else derives it from the probed plan's
/// localized amount ([probeGbp] is that plan's monthly price). Null for GBP
/// (nothing to localize) or anything unexpected.
@visibleForTesting
LocalPricing? localPricingFromProbe(Map<String, dynamic> reply, {required double probeGbp, required DateTime now}) {
  final currency = reply['currency'];
  if (currency is! String || currency.isEmpty || currency.toLowerCase() == 'gbp') return null;
  final fx = reply['fxRate'], minor = reply['minor'];
  final rate = fx is num ? fx.toDouble() : (minor is num && probeGbp > 0 ? minor / (probeGbp * 100) : null);
  if (rate == null || rate <= 0) return null;
  return LocalPricing(currency: currency.toLowerCase(), fxRate: rate, at: now);
}

/// Stripe guarantees a rate for 24 hours; probe again after 12.
const localPricingMaxAge = Duration(hours: 12);
const _cacheKey = 'localPricing.v1';

/// Opens a Checkout session with Stripe.js and reports its currency and rate.
abstract class PricingProbe {
  Future<Map<String, dynamic>?> run({required String clientSecret, required String publishableKey, required String origin});
}

/// The local prices, or null to show GBP: for paid users (the server refuses
/// them a new checkout, as on the web), when Stripe keeps GBP, or on any failure.
final localPricingProvider = FutureProvider<LocalPricing?>((ref) async {
  final prefs = ref.read(prefsProvider);
  try {
    final cached = LocalPricing.fromJson(Map<String, dynamic>.from(jsonDecode(prefs.getString(_cacheKey) ?? '{}') as Map));
    if (cached != null && DateTime.now().difference(cached.at) < localPricingMaxAge) return cached;
  } catch (_) {
    // A bad cache only means probing again.
  }

  final sub = await ref.read(subscriptionProvider.future).catchError((_) => const SubscriptionDetails(isFreemium: false, tier: ''));
  if (!sub.isFreemium || AppConfig.stripePublishableKey.isEmpty) return null;
  final plans = await ref.read(plansProvider.future);
  final probePlan = plans.where((p) => p.id == 'reader' && p.monthlyGbp != null).firstOrNull ?? plans.where((p) => p.isPaid && p.monthlyGbp != null).firstOrNull;
  if (probePlan == null) return null;

  try {
    final api = ref.read(apiProvider);
    final secret = await api.subscription.createCheckoutSession(tierId: probePlan.id, successUrl: '${AppConfig.dashboardUrl}/#/payment-success');
    final reply = await ref.read(pricingProbeProvider).run(clientSecret: secret, publishableKey: AppConfig.stripePublishableKey, origin: AppConfig.dashboardUrl);
    if (reply == null) return null;
    final local = localPricingFromProbe(reply, probeGbp: probePlan.monthlyGbp!, now: DateTime.now());
    if (local != null) await prefs.setString(_cacheKey, jsonEncode(local.toJson()));
    return local;
  } catch (e) {
    debugPrint('Local pricing probe failed (showing GBP): $e');
    return null;
  }
});

final pricingProbeProvider = Provider<PricingProbe>((ref) {
  final probe = WebViewPricingProbe();
  ref.onDispose(probe.dispose);
  return probe;
});

/// Runs the probe in a WebView. [PricingProbeHost] keeps it in the widget
/// tree (1×1, invisible) while it works, so both platforms run its scripts.
class WebViewPricingProbe implements PricingProbe {
  final active = ValueNotifier<WebViewController?>(null);

  @override
  Future<Map<String, dynamic>?> run({required String clientSecret, required String publishableKey, required String origin}) async {
    final done = Completer<Map<String, dynamic>?>();
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setOnConsoleMessage((m) => debugPrint('Local pricing probe console: ${m.message}'))
      ..setNavigationDelegate(NavigationDelegate(
        onWebResourceError: (e) => debugPrint('Local pricing probe load error: ${e.errorCode} ${e.description} ${e.url ?? ''}'),
      ))
      ..addJavaScriptChannel('Probe', onMessageReceived: (m) {
        if (done.isCompleted) return;
        try {
          final reply = Map<String, dynamic>.from(jsonDecode(m.message) as Map);
          if (reply['error'] != null) debugPrint('Local pricing probe: ${reply['error']}');
          done.complete(reply['error'] == null ? reply : null);
        } catch (_) {
          done.complete(null);
        }
      });
    active.value = controller;
    try {
      // The page's origin is the dashboard's, like the web probe.
      await controller.loadHtmlString(_probePage(publishableKey: publishableKey, clientSecret: clientSecret), baseUrl: origin);
      return await done.future.timeout(const Duration(seconds: 20), onTimeout: () {
        debugPrint('Local pricing probe timed out');
        return null;
      });
    } finally {
      active.value = null;
    }
  }

  void dispose() => active.dispose();
}

/// Mount on screens that show prices: invisible, and empty unless probing.
class PricingProbeHost extends ConsumerWidget {
  const PricingProbeHost({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final probe = ref.watch(pricingProbeProvider);
    if (probe is! WebViewPricingProbe) return const SizedBox.shrink();
    return ValueListenableBuilder<WebViewController?>(
      valueListenable: probe.active,
      builder: (_, controller, _) => controller == null
          ? const SizedBox.shrink()
          : ExcludeSemantics(child: IgnorePointer(child: Opacity(opacity: 0, child: SizedBox(width: 1, height: 1, child: WebViewWidget(controller: controller))))),
    );
  }
}

/// The web's probe (frontend/pages/settings/subscription.vue,
/// probeLocalCurrency), on the same Stripe.js release as the dashboard.
String _probePage({required String publishableKey, required String clientSecret}) => '''
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<script src="https://js.stripe.com/dahlia/stripe.js"></script></head>
<body><script>
(async function () {
  function send(o) { Probe.postMessage(JSON.stringify(o)); }
  try {
    var stripe = Stripe(${jsonEncode(publishableKey)});
    var sdk = stripe.initCheckoutElementsSdk({ clientSecret: ${jsonEncode(clientSecret)}, adaptivePricing: { allowed: true } });
    var res = await sdk.loadActions();
    if (res.type !== 'success') return send({ error: 'loadActions: ' + res.type });
    var s = res.actions.getSession();
    var opt = (s.currencyOptions || []).find(function (o) { return o && o.currencyConversion && o.currencyConversion.fxRate; });
    var item = s.lineItems && s.lineItems[0];
    send({
      currency: s.currency,
      fxRate: opt ? parseFloat(opt.currencyConversion.fxRate) : null,
      minor: item && item.unitAmount ? item.unitAmount.minorUnitsAmount : null
    });
  } catch (e) { send({ error: String(e) }); }
})();
</script></body></html>
''';
