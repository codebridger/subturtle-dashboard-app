import 'package:intl/intl.dart';
import 'package:subturtle_api/subturtle_api.dart';

/// Short, kind, sentence-case text helpers.
abstract final class Fmt {
  /// "today", "yesterday", "2 days ago", "last week", "3 weeks ago", "12 Oct".
  static String ago(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final n = now ?? DateTime.now();
    final days = DateTime(n.year, n.month, n.day).difference(DateTime(d.year, d.month, d.day)).inDays;
    if (days <= 0) return 'today';
    if (days == 1) return 'yesterday';
    if (days < 7) return '$days days ago';
    if (days < 14) return 'last week';
    if (days < 31) return '${days ~/ 7} weeks ago';
    if (days < 62) return 'last month';
    return DateFormat('d MMM').format(d);
  }

  /// "Today", "Yesterday", "Mon", "12 Oct".
  static String day(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final n = now ?? DateTime.now();
    final days = DateTime(n.year, n.month, n.day).difference(DateTime(d.year, d.month, d.day)).inDays;
    if (days <= 0) return 'Today';
    if (days == 1) return 'Yesterday';
    if (days < 7) return DateFormat('EEE').format(d);
    return DateFormat('d MMM').format(d);
  }

  /// "1 November".
  static String longDate(DateTime? d) => d == null ? '' : DateFormat('d MMMM').format(d);

  /// "4:12".
  static String clock(Duration d) {
    final m = d.inMinutes;
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  /// "4 min", "under a minute".
  static String minutes(Duration d) {
    if (d.inSeconds < 60) return 'under a minute';
    return '${(d.inSeconds / 60).round()} min';
  }

  static String plural(int n, String one, [String? many]) => '$n ${n == 1 ? one : (many ?? '${one}s')}';

  /// "Good morning" / "Good afternoon" / "Good evening".
  static String greeting([DateTime? now]) {
    final h = (now ?? DateTime.now()).hour;
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /// "£10.99"
  static String gbp(double v) => NumberFormat.currency(locale: 'en_GB', symbol: '£', decimalDigits: v == v.roundToDouble() ? 0 : 2).format(v);
}

/// Turns any error into one short, kind sentence for the screen. Never says "credit".
String friendlyError(Object error) {
  if (error is ApiException) {
    if (error.isNetwork) return "You're offline or the server is not answering. Please try again.";
    switch (error.code) {
      case ApiException.tierLimitReached:
        return switch (error.feature) {
          'save_words' => 'You reached the save limit of your plan.',
          'voice_minutes' => error.isNotInPlan ? 'Voice chat is not part of your plan.' : 'You have used all your voice minutes.',
          'live_sessions' => 'You have used all your free voice chats this month.',
          'session_history' => 'Session history comes with a paid plan.',
          'text_chat_count' => 'You have used all your text chats this month.',
          'text_chat_messages_per_chat' => 'This chat has reached its message limit. Start a new one.',
          _ => 'This is not part of your plan yet.',
        };
      case ApiException.aiCreditExhausted:
        return "The coach and translations are paused until your plan renews.";
      case ApiException.voicePaused:
        return 'Voice practice is paused for a short while. Text chat still works.';
      case ApiException.coachUnavailable:
        return error.detail == 'upstream_rate_limited' ? 'The coach is busy right now. Please try again in a moment.' : 'The coach is not available right now. Please try again.';
    }
    if (error.isAuthError) return 'Please sign in again.';
  }
  return 'Something went wrong. Please try again.';
}
