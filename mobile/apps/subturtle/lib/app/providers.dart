import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle_api/subturtle_api.dart';

import '../shared/languages.dart';

/// The API, created in `main()` and injected with an override.
final apiProvider = Provider<SubturtleApi>((ref) => throw UnimplementedError('apiProvider must be overridden in main()'));

/// App preferences, created in `main()` and injected with an override.
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider must be overridden in main()'));

/// Keeps the JWT in the iOS Keychain / Android Keystore.
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _key = 'subturtle.token';

  // A Keychain / Keystore error must not stop the app: treat it as "no saved session".
  @override
  Future<String?> read() async {
    try {
      return await _s.read(key: _key);
    } catch (e) {
      debugPrint('Token read failed: $e');
      return null;
    }
  }

  @override
  Future<void> write(String token) async {
    try {
      await _s.write(key: _key, value: token);
    } catch (e) {
      debugPrint('Token write failed: $e');
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _s.delete(key: _key);
    } catch (e) {
      debugPrint('Token delete failed: $e');
    }
  }
}

// ---------------------------------------------------------------- auth

enum AuthStatus { unknown, signedOut, signedIn }

@immutable
class AuthState {
  const AuthState(this.status, [this.user, this.expired = false]);
  final AuthStatus status;
  final AuthUser? user;

  /// Signed out because the server rejected the saved token (not because the
  /// learner tapped Sign out). Sign in shows a "your session ended" note.
  final bool expired;
}

/// Sign-in state. The router listens to it to show Sign in or the app.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final api = ref.read(apiProvider);
    // A request that carried a token came back 401/412: the token is dead.
    api.client.onUnauthorized = (_) => signOut(expired: true);
    return const AuthState(AuthStatus.unknown);
  }

  SubturtleApi get _api => ref.read(apiProvider);

  /// Never leaves the app on the splash screen: any failure here means "signed out".
  Future<void> restore() async {
    try {
      final user = await _api.auth.restore().timeout(const Duration(seconds: 20));
      state = user == null || user.isAnonymous ? const AuthState(AuthStatus.signedOut) : AuthState(AuthStatus.signedIn, user);
    } catch (e) {
      debugPrint('Session restore failed: $e');
      state = const AuthState(AuthStatus.signedOut);
    }
  }

  Future<void> signedIn(AuthUser user) async {
    state = AuthState(AuthStatus.signedIn, user);
  }

  Future<void> signOut({bool expired = false}) async {
    await _api.auth.signOut();
    state = AuthState(AuthStatus.signedOut, null, expired);
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

// ---------------------------------------------------------------- settings

@immutable
class AppSettings {
  const AppSettings({this.themeMode = ThemeMode.system, this.haptics = true, this.language, this.lastBundleId, this.lastVoice, this.swipeHintSeen = false});

  final ThemeMode themeMode;
  final bool haptics;

  /// The learner's language (L1) for translations. Kept on the phone: the
  /// profile has no language field yet (see README, "Needs backend work").
  final AppLanguage? language;

  /// Default bundle for Capture and Coach.
  final String? lastBundleId;
  final String? lastVoice;
  final bool swipeHintSeen;

  AppSettings copyWith({ThemeMode? themeMode, bool? haptics, AppLanguage? language, String? lastBundleId, String? lastVoice, bool? swipeHintSeen}) => AppSettings(
        themeMode: themeMode ?? this.themeMode,
        haptics: haptics ?? this.haptics,
        language: language ?? this.language,
        lastBundleId: lastBundleId ?? this.lastBundleId,
        lastVoice: lastVoice ?? this.lastVoice,
        swipeHintSeen: swipeHintSeen ?? this.swipeHintSeen,
      );
}

class SettingsController extends Notifier<AppSettings> {
  SharedPreferences get _p => ref.read(prefsProvider);

  @override
  AppSettings build() {
    final p = ref.read(prefsProvider);
    return AppSettings(
      themeMode: ThemeMode.values.firstWhere((m) => m.name == p.getString('theme'), orElse: () => ThemeMode.system),
      haptics: p.getBool('haptics') ?? true,
      language: AppLanguage.byName(p.getString('language')),
      lastBundleId: p.getString('lastBundle'),
      lastVoice: p.getString('lastVoice'),
      swipeHintSeen: p.getBool('swipeHintSeen') ?? false,
    );
  }

  void setTheme(ThemeMode m) {
    _p.setString('theme', m.name);
    state = state.copyWith(themeMode: m);
  }

  void setHaptics(bool v) {
    _p.setBool('haptics', v);
    state = state.copyWith(haptics: v);
  }

  void setLanguage(AppLanguage l) {
    _p.setString('language', l.name);
    state = state.copyWith(language: l);
  }

  void setLastBundle(String id) {
    _p.setString('lastBundle', id);
    state = state.copyWith(lastBundleId: id);
  }

  void setLastVoice(String v) {
    _p.setString('lastVoice', v);
    state = state.copyWith(lastVoice: v);
  }

  void markSwipeHintSeen() {
    _p.setBool('swipeHintSeen', true);
    state = state.copyWith(swipeHintSeen: true);
  }
}

final settingsProvider = NotifierProvider<SettingsController, AppSettings>(SettingsController.new);

/// The learner's language: the saved choice, else a guess from the latest
/// saved phrase, else the phone's language, else Persian (the core user group).
final languageProvider = FutureProvider<AppLanguage>((ref) async {
  final chosen = ref.watch(settingsProvider.select((s) => s.language));
  if (chosen != null) return chosen;
  try {
    final recent = await ref.read(apiProvider).bundles.recentPhrases(limit: 5);
    for (final p in recent) {
      final l = AppLanguage.byName(p.translationLanguage) ?? AppLanguage.byCode(p.targetLanguage);
      if (l != null && l.code != 'en') return l;
    }
  } catch (_) {
    // Fall through to the device language.
  }
  final device = PlatformDispatcher.instance.locale.languageCode;
  return AppLanguage.byCode(device) ?? AppLanguage.all.firstWhere((l) => l.code == 'fa');
});

// ---------------------------------------------------------------- haptics

/// Haptics that respect the Me → Haptics switch.
class Haptics {
  Haptics(this._on);
  final bool _on;

  void selection() => _on ? HapticFeedback.selectionClick() : null;
  void light() => _on ? HapticFeedback.lightImpact() : null;
  void medium() => _on ? HapticFeedback.mediumImpact() : null;
  void success() => _on ? HapticFeedback.heavyImpact() : null;
  void warning() => _on ? HapticFeedback.vibrate() : null;
}

final hapticsProvider = Provider<Haptics>((ref) => Haptics(ref.watch(settingsProvider.select((s) => s.haptics))));

// ---------------------------------------------------------------- data

/// Plan and usage. Refreshed after voice sessions and saves.
final subscriptionProvider = FutureProvider<SubscriptionDetails>((ref) => ref.read(apiProvider).subscription.getDetails());

final profileProvider = FutureProvider<Profile?>((ref) => ref.read(apiProvider).profile.getProfile());

/// All bundles, newest first.
final bundlesProvider = FutureProvider<List<Bundle>>((ref) => ref.read(apiProvider).bundles.listBundles());

/// Phrase → level and due ids, for "N due" counts and level dots.
final phraseInfoProvider = FutureProvider<PhraseManagementInfo>((ref) => ref.read(apiProvider).review.getPhraseInfo());

final statsProvider = FutureProvider<LeitnerStats?>((ref) => ref.read(apiProvider).review.getStats());

final voicesProvider = FutureProvider<List<CoachVoice>>((ref) async {
  try {
    return await ref.read(apiProvider).liveSessions.getVoices();
  } catch (_) {
    return CoachVoice.fallback;
  }
});

/// One bundle with its phrases, newest first.
final bundleDetailProvider = FutureProvider.family<(Bundle, List<Phrase>), String>((ref, id) async {
  final api = ref.read(apiProvider);
  final bundle = await api.bundles.getBundle(id);
  if (bundle == null) throw ApiException('This bundle was not found.');
  final phrases = await api.bundles.getPhrases(bundle.phraseIds.reversed.toList());
  return (bundle, phrases);
});

/// Reloads everything that depends on phrases (after a save, a delete or a review).
void refreshLearningData(WidgetRef ref) {
  ref.invalidate(bundlesProvider);
  ref.invalidate(phraseInfoProvider);
  ref.invalidate(statsProvider);
  ref.invalidate(subscriptionProvider);
}
