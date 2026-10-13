import 'json.dart';

/// Plan limits snapshot locked at purchase (`entitlements`). For every cap:
/// null = unlimited, 0 = not in the plan.
class Entitlements {
  const Entitlements({this.tierId, this.voiceMinutesGranted, this.saveWordsCap, this.textChatCap, this.textChatMaxMessages, this.liveSessionsCap, this.sessionHistory = false, this.weeklyInsights = false});

  final String? tierId;
  final int? voiceMinutesGranted;
  final int? saveWordsCap;
  final int? textChatCap;
  final int? textChatMaxMessages;
  final int? liveSessionsCap;
  final bool sessionHistory;
  final bool weeklyInsights;

  factory Entitlements.fromJson(dynamic v) {
    final j = asJson(v);
    return Entitlements(
      tierId: strOrNull(j['tierId']),
      voiceMinutesGranted: intOrNull(j['voiceMinutesGranted']),
      saveWordsCap: intOrNull(j['saveWordsCap']),
      textChatCap: intOrNull(j['textChatCap']),
      textChatMaxMessages: intOrNull(j['textChatMaxMessages']),
      liveSessionsCap: intOrNull(j['liveSessionsCap']),
      sessionHistory: boolean(j['sessionHistory']),
      weeklyInsights: boolean(j['weeklyInsights']),
    );
  }
}

/// A bought pack of extra voice minutes.
class TopUp {
  const TopUp({required this.packSize, required this.minutesRemaining, this.expiresAt});
  final int packSize;
  final int minutesRemaining;
  final DateTime? expiresAt;

  factory TopUp.fromJson(dynamic v) {
    final j = asJson(v);
    return TopUp(packSize: integer(j['pack_size']), minutesRemaining: integer(j['minutes_remaining']), expiresAt: date(j['expires_at']));
  }
}

/// A "used of total" meter. [total] null means unlimited.
class Allowance {
  const Allowance({required this.used, this.total});
  final int used;
  final int? total;

  bool get unlimited => total == null;
  bool get locked => total == 0;
  int get remaining => total == null ? 1 << 30 : (total! - used).clamp(0, total!);
  double get fraction => total == null || total == 0 ? 0 : (used / total!).clamp(0, 1).toDouble();
}

/// The user's plan and usage (`getSubscriptionDetails`). One class for both
/// shapes the server returns: free (Starter, [isFreemium]) and paid.
///
/// "Credits" are an internal AI budget and are never shown to users. Voice is
/// shown in minutes only (see [voiceRemaining]).
class SubscriptionDetails {
  const SubscriptionDetails({
    required this.isFreemium,
    required this.tier,
    this.label,
    this.status,
    this.cadence,
    this.startDate,
    this.endDate,
    this.cancelAtPeriodEnd = false,
    this.trialEnd,
    this.voiceMinutesTotal = 0,
    this.voiceMinutesUsed = 0,
    this.topUps = const [],
    this.entitlements,
    this.saveWords = const Allowance(used: 0, total: 200),
    this.textChats = const Allowance(used: 0, total: 5),
    this.liveSessions = const Allowance(used: 0, total: 3),
    this.usagePercentage = 0,
    this.portalUrl,
  });

  final bool isFreemium;

  /// starter, reader, learner or coach.
  final String tier;

  /// Stripe product name for paid plans ("Learner").
  final String? label;
  final String? status;

  /// monthly or annual.
  final String? cadence;
  final DateTime? startDate;

  /// When the plan renews (paid) or the free allowance resets.
  final DateTime? endDate;
  final bool cancelAtPeriodEnd;
  final DateTime? trialEnd;
  final int voiceMinutesTotal;
  final int voiceMinutesUsed;
  final List<TopUp> topUps;
  final Entitlements? entitlements;
  final Allowance saveWords;
  final Allowance textChats;
  final Allowance liveSessions;

  /// Share of the AI budget used (0–100). Only used to decide warnings; never shown.
  final double usagePercentage;
  final String? portalUrl;

  /// Base minutes of the plan, without top-ups (same maths as `useVoiceBalance` on the web).
  int get voiceBase => entitlements?.voiceMinutesGranted ?? voiceMinutesTotal;

  int get _topUpMinutes => topUps.where((t) => t.expiresAt == null || t.expiresAt!.isAfter(DateTime.now())).fold(0, (a, t) => a + t.minutesRemaining);

  /// Voice minutes left this period, top-ups included.
  int get voiceRemaining => (voiceBase - voiceMinutesUsed).clamp(0, 1 << 30) + _topUpMinutes;

  /// Total voice minutes this period, top-ups included.
  int get voiceTotal => voiceBase + topUps.where((t) => t.expiresAt == null || t.expiresAt!.isAfter(DateTime.now())).fold(0, (a, t) => a + t.packSize);

  /// The plan has voice at all (Reader has none).
  bool get hasVoice => voiceTotal > 0;

  /// Session history (Coach tab list) is a paid feature.
  bool get hasSessionHistory => !isFreemium && (entitlements?.sessionHistory ?? false);

  bool get isTrial => status == 'trialing';

  /// Nice name for the tier.
  String get tierName {
    if (label != null && label!.isNotEmpty) return label!;
    if (tier.isEmpty) return 'Starter';
    return tier[0].toUpperCase() + tier.substring(1);
  }

  factory SubscriptionDetails.fromJson(dynamic v) {
    final j = asJson(v);
    final free = boolean(j['is_freemium']);
    final ent = j['entitlements'] is Map ? Entitlements.fromJson(j['entitlements']) : null;
    return SubscriptionDetails(
      isFreemium: free,
      tier: str(j['tier'], free ? 'starter' : ''),
      label: strOrNull(j['label']),
      status: strOrNull(j['status']),
      cadence: strOrNull(j['subscription_type']),
      startDate: date(j['start_date']),
      endDate: date(j['end_date']),
      cancelAtPeriodEnd: boolean(j['cancel_at_period_end']),
      trialEnd: date(j['trial_end']),
      voiceMinutesTotal: integer(j['voice_minutes_total']),
      voiceMinutesUsed: integer(j['voice_minutes_used']),
      topUps: listOf(j['active_top_ups'], TopUp.fromJson),
      entitlements: ent,
      saveWords: free ? Allowance(used: integer(j['allowed_save_words_used']), total: intOrNull(j['allowed_save_words']) ?? 200) : Allowance(used: 0, total: ent?.saveWordsCap),
      textChats: Allowance(used: integer(j['allowed_text_chats_used']), total: j.containsKey('allowed_text_chats') ? intOrNull(j['allowed_text_chats']) : (free ? 5 : ent?.textChatCap)),
      liveSessions: free ? Allowance(used: integer(j['allowed_lived_sessions_used']), total: intOrNull(j['allowed_lived_sessions']) ?? 3) : Allowance(used: 0, total: ent?.liveSessionsCap),
      usagePercentage: number(j['usage_percentage']),
      portalUrl: strOrNull(j['portal_url']),
    );
  }
}

/// A plan in the public price list (`getSubscriptionPlans`).
class TierPlan {
  const TierPlan({required this.id, required this.name, this.tagline = '', this.isPaid = false, this.live = true, this.featureLabels = const [], this.monthlyGbp, this.annualGbp, this.highlight = false, this.badge, this.trialDays = 0});

  final String id;
  final String name;
  final String tagline;
  final bool isPaid;

  /// false = "dark" (coming soon).
  final bool live;
  final List<String> featureLabels;
  final double? monthlyGbp;
  final double? annualGbp;
  final bool highlight;
  final String? badge;
  final int trialDays;

  factory TierPlan.fromJson(dynamic v) {
    final j = asJson(v);
    final pricing = asJson(j['pricing']);
    double? gbp(String k) {
      final p = asJson(pricing[k])['gbp'];
      return p == null ? null : number(p);
    }

    return TierPlan(
      id: str(j['id']),
      name: str(j['name']),
      tagline: str(j['tagline']),
      isPaid: boolean(j['isPaid']),
      live: str(j['status'], 'live') == 'live',
      featureLabels: listOf(j['featureLabels'], (e) => str(e)),
      monthlyGbp: gbp('monthly'),
      annualGbp: gbp('annual'),
      highlight: boolean(j['highlight']),
      badge: strOrNull(j['badge']),
      trialDays: integer(j['trialDays']),
    );
  }
}

/// A Gemini coach voice (`get-live-session-voices`).
class CoachVoice {
  const CoachVoice({required this.name, required this.label, this.description = '', this.gender, this.avatarColor});
  final String name;
  final String label;
  final String description;
  final String? gender;

  /// `#RRGGBB`.
  final String? avatarColor;

  factory CoachVoice.fromJson(dynamic v) {
    final j = asJson(v);
    return CoachVoice(name: str(j['name']), label: str(j['label'], str(j['name'])), description: str(j['description']), gender: strOrNull(j['gender']), avatarColor: strOrNull(j['avatarColor']));
  }

  /// The eight voices in `server/src/modules/live_session/voices.ts`, used when the list cannot load.
  static const fallback = [
    CoachVoice(name: 'Kore', label: 'Kore', description: 'Firm and clear', gender: 'female', avatarColor: '#7C3AED'),
    CoachVoice(name: 'Puck', label: 'Puck', description: 'Upbeat and lively', gender: 'male', avatarColor: '#2563EB'),
    CoachVoice(name: 'Charon', label: 'Charon', description: 'Informative and calm', gender: 'male', avatarColor: '#0D9488'),
    CoachVoice(name: 'Fenrir', label: 'Fenrir', description: 'Excitable and energetic', gender: 'male', avatarColor: '#EA580C'),
    CoachVoice(name: 'Aoede', label: 'Aoede', description: 'Breezy and warm', gender: 'female', avatarColor: '#DB2777'),
    CoachVoice(name: 'Leda', label: 'Leda', description: 'Youthful and bright', gender: 'female', avatarColor: '#D97706'),
    CoachVoice(name: 'Orus', label: 'Orus', description: 'Firm and grounded', gender: 'male', avatarColor: '#4F46E5'),
    CoachVoice(name: 'Zephyr', label: 'Zephyr', description: 'Bright and friendly', gender: 'female', avatarColor: '#059669'),
  ];
}

/// One line of a coach conversation.
class DialogLine {
  const DialogLine({required this.id, required this.content, required this.fromUser});
  final String id;
  final String content;

  /// true = the learner, false = the coach (`speaker: user | ai`).
  final bool fromUser;

  factory DialogLine.fromJson(dynamic v) {
    final j = asJson(v);
    return DialogLine(id: str(j['id']), content: str(j['content']), fromUser: str(j['speaker']) == 'user');
  }

  Json toJson() => {'id': id, 'content': content, 'speaker': fromUser ? 'user' : 'ai'};
}

/// A past coach session (voice or text), for the history list and transcript.
class CoachSession {
  const CoachSession({required this.id, required this.isText, this.title, this.bundleId, this.createdAt, this.updatedAt, this.dialogs = const []});

  final String id;
  final bool isText;

  /// The bundle name the session was started from (`metadata.title`).
  final String? title;
  final String? bundleId;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<DialogLine> dialogs;

  Duration get length => createdAt != null && updatedAt != null ? updatedAt!.difference(createdAt!) : Duration.zero;
  int get messageCount => dialogs.length;

  factory CoachSession.fromJson(dynamic v) {
    final j = docOf(v);
    final meta = asJson(j['metadata']);
    final session = asJson(j['session']);
    final modalities = listOf(session['modalities'], (e) => str(e));
    final isText = str(meta['mode']) == 'text' || modalities.contains('TEXT') || j.containsKey('contents');
    return CoachSession(
      id: idOf(j),
      isText: isText,
      title: strOrNull(meta['title']),
      bundleId: strOrNull(meta['bundleId']),
      createdAt: date(j['createdAt']),
      updatedAt: date(j['updatedAt']),
      dialogs: listOf(j['dialogs'], DialogLine.fromJson),
    );
  }
}

/// A page of [CoachSession]s (`list-live-sessions`).
class CoachSessionPage {
  const CoachSessionPage({required this.items, this.page = 0, this.total = 0, this.hasMore = false});
  final List<CoachSession> items;
  final int page;
  final int total;
  final bool hasMore;

  factory CoachSessionPage.fromJson(dynamic v) {
    final j = asJson(v);
    return CoachSessionPage(items: listOf(j['items'], CoachSession.fromJson), page: integer(j['page']), total: integer(j['total']), hasMore: boolean(j['hasMore']));
  }
}

/// What `request-gemini-live-session-ephemeral-token` returns.
class GeminiLiveToken {
  const GeminiLiveToken({required this.raw, required this.model, required this.voice, required this.token, this.maxSeconds = 0, this.expiresAt});

  /// The whole answer, stored as `session` on the live-session record (as the web does).
  final Json raw;
  final String model;
  final String voice;

  /// `client_secret.value`, e.g. `auth_tokens/…`. Single use; open the socket within 60 s.
  final String token;

  /// Longest this session may run, in seconds. 0 means no minutes left.
  final int maxSeconds;
  final DateTime? expiresAt;

  factory GeminiLiveToken.fromJson(dynamic v) {
    final j = asJson(v);
    final secret = asJson(j['client_secret']);
    final exp = intOrNull(secret['expires_at'] ?? j['expires_at']);
    return GeminiLiveToken(
      raw: j,
      model: str(j['model'], 'gemini-3.1-flash-live-preview'),
      voice: str(j['voice'], 'Kore'),
      token: str(secret['value']),
      maxSeconds: integer(j['voice_session_max_seconds']),
      expiresAt: exp == null ? null : DateTime.fromMillisecondsSinceEpoch(exp * 1000),
    );
  }
}

/// Minutes after `debit-voice-minutes`.
class VoiceBudget {
  const VoiceBudget({required this.total, required this.used, required this.remaining});
  final int total;
  final int used;
  final int remaining;

  factory VoiceBudget.fromJson(dynamic v) {
    final j = asJson(v);
    return VoiceBudget(total: integer(j['total']), used: integer(j['used']), remaining: integer(j['remaining']));
  }
}

/// A function the coach model may call (sent as a Gemini function declaration).
class CoachTool {
  const CoachTool({required this.name, required this.description, this.parameters});
  final String name;
  final String description;

  /// Gemini schema. Leave null for a tool with no arguments (an empty OBJECT is rejected).
  final Json? parameters;

  Json toJson() => {'name': name, 'description': description, 'parameters': ?parameters};
}

/// A function call the coach asked for.
class CoachToolCall {
  const CoachToolCall({this.id, required this.name, this.args = const {}});
  final String? id;
  final String name;
  final Json args;

  factory CoachToolCall.fromJson(dynamic v) {
    final j = asJson(v);
    return CoachToolCall(id: strOrNull(j['id']), name: str(j['name']), args: asJson(j['args']));
  }
}

/// One answer from `text-turn`: either final text or tool calls to run.
class TextTurnResult {
  const TextTurnResult({required this.done, this.text = '', this.toolCalls = const [], this.wrapUpWarning = false});
  final bool done;
  final String text;
  final List<CoachToolCall> toolCalls;

  /// Few messages are left in this chat.
  final bool wrapUpWarning;

  factory TextTurnResult.fromJson(dynamic v) {
    final j = asJson(v);
    return TextTurnResult(
      done: boolean(j['done'], true),
      text: str(j['text']),
      toolCalls: listOf(j['functionCalls'], CoachToolCall.fromJson),
      wrapUpWarning: boolean(j['wrap_up_warning']),
    );
  }
}
