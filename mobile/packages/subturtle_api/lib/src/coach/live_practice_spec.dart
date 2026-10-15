import 'dart:convert';

import '../models/json.dart';

part 'live_practice_spec.g.dart';

/// The live practice coach shared with the web: the prompt template, tools,
/// hidden messages and practice rules from `shared/live-practice/spec.json`
/// (embedded at build time by `tool/gen_live_practice.dart`).
abstract final class LivePracticeSpec {
  static final Json _spec = asJson(jsonDecode(_specJson));

  /// The spec file's text, for the sync tests.
  static String get rawJson => _specJson;

  static String get instructionsTemplate => str(_spec['instructionsTemplate']);
  static String get phraseLine => str(_spec['phraseLine']);
  static String get nativeAutoDetected => str(asJson(_spec['nativeLanguage'])['autoDetected']);
  static String get nativeFallback => str(asJson(_spec['nativeLanguage'])['fallback']);

  /// Tool declarations: `{name, description, parameters?}`.
  static List<Json> get tools => [for (final t in (_spec['tools'] as List)) asJson(t)];

  static String message(String key) => str(asJson(_spec['messages'])[key]);

  static Json get _rules => asJson(_spec['rules']);
  static bool get micStartsMuted => boolean(_rules['micStartsMuted'], true);

  /// `user-turn`: the active phrase counts as practised when the learner says or
  /// types something while it is active, never on activation alone.
  static String get practicedOn => str(_rules['practicedOn'], 'user-turn');
  static bool get singlePhraseStartsActive => boolean(_rules['singlePhraseStartsActive'], true);
  static Duration get finishDelay => Duration(milliseconds: integer(_rules['finishDelayMs'], 4000));

  /// Fills `{name}` placeholders.
  static String fill(String text, Map<String, Object> values) =>
      text.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => values.containsKey(m[1]) ? '${values[m[1]]}' : m[0]!);
}
