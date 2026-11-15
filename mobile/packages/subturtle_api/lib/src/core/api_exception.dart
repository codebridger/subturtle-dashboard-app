/// An error from the Subturtle backend, or from the network on the way to it.
///
/// The backend sends errors in a few shapes:
/// - functions: HTTP 400 `{status: "error", message: "CODE: detail"}`
/// - the caller guard: HTTP 403 `{status: "error", message: "FORBIDDEN: ..."}`
/// - user routes: HTTP 412 `{status: "error", e: ...}` or `{status: "fail"}`
/// - the data provider: a plain text body
///
/// Business errors start with an upper-case code: `TIER_LIMIT_REACHED`,
/// `AI_CREDIT_EXHAUSTED`, `VOICE_PAUSED`, `COACH_UNAVAILABLE`, `SAVE_ASSISTANT_UNAVAILABLE`,
/// `ALREADY_SUBSCRIBED`.
/// [code] and [detail] hold the two halves.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.isNetwork = false}) {
    final match = _codePattern.firstMatch(message);
    code = match?.group(1);
    detail = match?.group(2) ?? message;
    final f = _featurePattern.firstMatch(message);
    feature = f?.group(1);
    final cap = _capPattern.firstMatch(message);
    limit = cap == null ? null : int.tryParse(cap.group(1)!);
  }

  /// A network failure (no response at all): offline, DNS, timeout.
  ApiException.network(String message) : this(message, isNetwork: true);

  final String message;
  final int? statusCode;
  final bool isNetwork;

  /// `TIER_LIMIT_REACHED`, `AI_CREDIT_EXHAUSTED`, … or null for a plain message.
  late final String? code;

  /// The text after `CODE:`, or the whole message when there is no code.
  late final String detail;

  /// For `TIER_LIMIT_REACHED`: the feature, e.g. `voice_minutes`, `save_words`.
  late final String? feature;

  /// For `TIER_LIMIT_REACHED: "x" limit reached (N)`: N.
  late final int? limit;

  static final _codePattern = RegExp(r'^([A-Z][A-Z_]+):\s*(.*)$', dotAll: true);
  static final _featurePattern = RegExp(r'TIER_LIMIT_REACHED:\s*"?([a-z_]+)"?');
  static final _capPattern = RegExp(r'limit reached \((\d+)\)');

  static const tierLimitReached = 'TIER_LIMIT_REACHED';
  static const aiCreditExhausted = 'AI_CREDIT_EXHAUSTED';
  static const voicePaused = 'VOICE_PAUSED';
  static const coachUnavailable = 'COACH_UNAVAILABLE';
  static const saveAssistantUnavailable = 'SAVE_ASSISTANT_UNAVAILABLE';

  bool get isTierLimit => code == tierLimitReached;

  /// The server does not have this function: an older build (modular-rest
  /// answers "Function with name X not found"). Callers fall back to the
  /// behaviour from before the function existed.
  bool get isMissingFunction => statusCode != 403 && _missingFunction.hasMatch(message);
  static final _missingFunction = RegExp(r'^Function (with name )?\S+ not found', caseSensitive: false);

  /// The plan does not include the feature at all (cap 0), not just "used up".
  bool get isNotInPlan => isTierLimit && message.contains('is not included in your plan');

  /// 401 or 412. When the request carried a token, this means the token is bad
  /// (expired, revoked, user gone) and the app should sign out, as the web does.
  bool get isAuthError => statusCode == 401 || statusCode == 412;

  @override
  String toString() => 'ApiException(${statusCode ?? '-'}): $message';
}
