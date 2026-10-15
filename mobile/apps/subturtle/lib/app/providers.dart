import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;
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

  /// The learner's own language (L1) as 1.x kept it on the phone. A 2.0
  /// server owns it (`translationLanguage`); this is only the fallback for a
  /// server without languages, and the value moved to the server once.
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

// ---------------------------------------------------------------- languages

/// The capability register: learning languages with their features, and every
/// own language. English only on a server without languages.
final languageCapsProvider = FutureProvider<LanguageCapabilities>((ref) async {
  ref.watch(authProvider.select((s) => s.user?.id));
  try {
    return await ref.read(apiProvider).languages.capabilities();
  } catch (e) {
    debugPrint('Language capabilities failed: $e');
    return LanguageCapabilities.fallback;
  }
});

/// The learner's languages, from the server (`get-language-state`).
///
/// A 1.x server has no language module: the state is English only, with the
/// own language the phone kept. It reloads on sign in and out, so nothing of
/// one account shows for the next.
class LanguageController extends AsyncNotifier<LanguageState> {
  SubturtleApi get _api => ref.read(apiProvider);

  @override
  Future<LanguageState> build() async {
    final uid = ref.watch(authProvider.select((s) => s.status == AuthStatus.signedIn ? s.user?.id : null));
    if (uid == null) {
      _api.activeLanguage = null;
      return LanguageState.englishOnly();
    }
    final phone = ref.read(settingsProvider).language;
    var state = await _api.languages.state();
    if (state == null) return _apply(LanguageState.englishOnly(translationLanguage: phone?.code));
    // 1.x kept the own language on the phone. Move it to the server once.
    if (state.translationLanguage == null && phone != null) {
      try {
        state = await _api.languages.setTranslationLanguage(phone.code);
      } catch (e) {
        debugPrint('Moving the own language to the server failed: $e');
        state = state!.copyWith(translationLanguage: phone.code);
      }
    }
    return _apply(state);
  }

  LanguageState _apply(LanguageState s) {
    // Every language-scoped call sends this unless it names another language.
    _api.activeLanguage = s.active;
    return s;
  }

  void _set(LanguageState s) => state = AsyncData(_apply(s));

  /// Makes [code] the active language. Scoped data reloads (its providers watch
  /// [activeLanguageProvider]); the caller then goes to Today.
  Future<void> setActive(String code) async {
    final current = state.value;
    if (current == null || current.active == code) return;
    _set(await _api.languages.setActive(code));
  }

  /// Adds and activates a language. Throws [AddLanguageRefusal] at the plan's limit.
  Future<LanguageState> add(String code, {String? startLevel, String? startLevelSource, List<String>? goals}) async {
    final s = await _api.languages.add(code, startLevel: startLevel, startLevelSource: startLevelSource, goals: goals);
    _set(s);
    return s;
  }

  Future<DateTime?> remove(String code) async {
    final (s, purgeAt) = await _api.languages.remove(code);
    _set(s);
    return purgeAt;
  }

  /// The own language. On a 1.x server it stays on the phone.
  Future<void> setTranslationLanguage(String code) async {
    final current = state.value;
    if (current != null && !current.fromServer) {
      final l = AppLanguage.byCode(code);
      if (l != null) ref.read(settingsProvider.notifier).setLanguage(l);
      _set(current.copyWith(translationLanguage: code));
      return;
    }
    _set(await _api.languages.setTranslationLanguage(code));
  }

  Future<void> updateSettings(String code, {String? explanationLanguage, int? newPhrasesPerDay}) async {
    _set(await _api.languages.updateSettings(code, explanationLanguage: explanationLanguage, newPhrasesPerDay: newPhrasesPerDay));
  }

  /// A state the server sent back from another call (chat test, starter pack).
  void replace(LanguageState s) => _set(s);

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

final languageStateProvider = AsyncNotifierProvider<LanguageController, LanguageState>(LanguageController.new);

/// The server has languages (2.0). False: the app is the English-only app.
final multilingualProvider = Provider<bool>((ref) => ref.watch(languageStateProvider).value?.fromServer ?? false);

/// The active learning language code (`de`). Language-scoped data providers
/// watch it, so a switch reloads them (and a sign-out clears them).
final activeLanguageProvider = FutureProvider<String>((ref) async => (await ref.watch(languageStateProvider.future)).active);

/// Capabilities of the active language (what to show and what to hide).
final activeCapsProvider = Provider<LearningLanguageCaps>((ref) {
  final code = ref.watch(activeLanguageProvider).value ?? 'en';
  return ref.watch(languageCapsProvider).value?.learningByCode(code) ?? LearningLanguageCaps.english;
});

/// Capabilities of any learning language (English when unknown).
LearningLanguageCaps capsOf(WidgetRef ref, String? code) =>
    ref.watch(languageCapsProvider).value?.learningByCode(code ?? 'en') ?? (code == null || code == 'en' ? LearningLanguageCaps.english : LearningLanguageCaps(code: code, name: code.toUpperCase(), nativeName: ''));

/// The learner's own language (L1): translations and Coach explanations go
/// into it, for every learning language. From the server; a 1.x server has
/// the phone's choice. With neither, the phone's language, else English.
/// It never guesses from saved phrases.
final l1Provider = FutureProvider<AppLanguage>((ref) async {
  final state = await ref.watch(languageStateProvider.future);
  final caps = ref.watch(languageCapsProvider).value;
  final code = state.translationLanguage ?? ref.watch(settingsProvider.select((s) => s.language?.code)) ?? PlatformDispatcher.instance.locale.languageCode;
  return appLanguageOf(code, caps) ?? AppLanguage.byCode('en')!;
});

/// Kept for screens that still say "language": the own language.
final languageProvider = l1Provider;

/// An [AppLanguage] for an own-language code, from the register when it has it.
AppLanguage? appLanguageOf(String? code, LanguageCapabilities? caps) {
  if (code == null || code.isEmpty) return null;
  final own = caps?.ownByCode(code);
  if (own != null) return AppLanguage(own.code, own.name, own.nativeName, rtl: own.rtl);
  return AppLanguage.byCode(code);
}

/// Retry for a scoped screen: when the language state itself failed, reload
/// it too (every scoped provider waits on it).
void retryScoped(WidgetRef ref, ProviderOrFamily provider) {
  if (ref.read(languageStateProvider).hasError) ref.invalidate(languageStateProvider);
  ref.invalidate(provider);
}

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
final subscriptionProvider = FutureProvider<SubscriptionDetails>((ref) {
  ref.watch(authProvider.select((s) => s.user?.id));
  return ref.read(apiProvider).subscription.getDetails();
});

final profileProvider = FutureProvider<Profile?>((ref) {
  ref.watch(authProvider.select((s) => s.user?.id));
  return ref.read(apiProvider).profile.getProfile();
});

/// The active language's bundles, newest first.
final bundlesProvider = FutureProvider<List<Bundle>>((ref) async {
  final lang = await ref.watch(activeLanguageProvider.future);
  return ref.read(apiProvider).bundles.listBundles(language: lang);
});

/// Phrase → level and due ids, for "N due" counts and level dots (active language).
final phraseInfoProvider = FutureProvider<PhraseManagementInfo>((ref) async {
  final lang = await ref.watch(activeLanguageProvider.future);
  return ref.read(apiProvider).review.getPhraseInfo(language: lang);
});

final statsProvider = FutureProvider<LeitnerStats?>((ref) async {
  final lang = await ref.watch(activeLanguageProvider.future);
  return ref.read(apiProvider).review.getStats(language: lang);
});

final voicesProvider = FutureProvider<List<CoachVoice>>((ref) async {
  try {
    return await ref.read(apiProvider).liveSessions.getVoices();
  } catch (_) {
    return CoachVoice.fallback;
  }
});

/// One bundle with its phrases, newest first.
final bundleDetailProvider = FutureProvider.family<(Bundle, List<Phrase>), String>((ref, id) async {
  ref.watch(authProvider.select((s) => s.user?.id));
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
  // Due and phrase counts in the switcher.
  ref.invalidate(languageStateProvider);
}
