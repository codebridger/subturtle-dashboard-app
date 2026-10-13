import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One chat with the save assistant: the sentence the learner sent first, the
/// phrases found in it, what they asked and what they saved.
///
/// Translations are not stored: reopening a chat translates the picked phrase
/// again. The backend does not keep these chats yet, so they live on the phone
/// behind [SaveSessionRepository].
@immutable
class SaveSession {
  const SaveSession({
    required this.id,
    required this.sentence,
    required this.createdAt,
    required this.updatedAt,
    this.candidates = const [],
    this.picked = 0,
    this.saved = const [],
    this.log = const [],
  });

  final String id;

  /// The first message: a word or a sentence.
  final String sentence;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// "Which part do you want to learn?" chips, in sentence order.
  final List<String> candidates;
  final int picked;
  final List<SavedPhraseRef> saved;

  /// Everything after the translation card, oldest first.
  final List<ChatLine> log;

  bool isSaved(String phrase) => saved.any((s) => s.text == phrase);

  SaveSession copyWith({List<String>? candidates, int? picked, List<SavedPhraseRef>? saved, List<ChatLine>? log, DateTime? updatedAt}) => SaveSession(
        id: id,
        sentence: sentence,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        candidates: candidates ?? this.candidates,
        picked: picked ?? this.picked,
        saved: saved ?? this.saved,
        log: log ?? this.log,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'sentence': sentence,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'candidates': candidates,
        'picked': picked,
        'saved': [for (final s in saved) s.toJson()],
        'log': [for (final l in log) l.toJson()],
      };

  factory SaveSession.fromJson(Map<String, dynamic> j) => SaveSession(
        id: j['id'] as String,
        sentence: j['sentence'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
        candidates: [for (final c in (j['candidates'] as List? ?? const [])) c as String],
        picked: j['picked'] as int? ?? 0,
        saved: [for (final s in (j['saved'] as List? ?? const [])) SavedPhraseRef.fromJson(Map<String, dynamic>.from(s as Map))],
        log: [for (final l in (j['log'] as List? ?? const [])) ChatLine.fromJson(Map<String, dynamic>.from(l as Map))],
      );
}

/// A phrase saved from a chat, with what Undo needs to remove it again.
@immutable
class SavedPhraseRef {
  const SavedPhraseRef({required this.text, required this.phraseId, required this.bundleId, required this.bundleTitle});

  final String text;
  final String phraseId;
  final String bundleId;
  final String bundleTitle;

  Map<String, dynamic> toJson() => {'text': text, 'phraseId': phraseId, 'bundleId': bundleId, 'bundleTitle': bundleTitle};

  factory SavedPhraseRef.fromJson(Map<String, dynamic> j) =>
      SavedPhraseRef(text: j['text'] as String, phraseId: j['phraseId'] as String, bundleId: j['bundleId'] as String, bundleTitle: j['bundleTitle'] as String? ?? '');
}

/// One bubble. [fromUser] is the dark bubble on the right.
@immutable
class ChatLine {
  const ChatLine({required this.fromUser, required this.text});

  final bool fromUser;
  final String text;

  /// The role name `translationAdvice` expects in its history.
  String get role => fromUser ? 'user' : 'assistant';

  Map<String, dynamic> toJson() => {'role': role, 'text': text};

  factory ChatLine.fromJson(Map<String, dynamic> j) => ChatLine(fromUser: j['role'] == 'user', text: j['text'] as String);
}

/// Where save-assistant chats are kept. The phone for now; a server
/// implementation can replace [LocalSaveSessionRepository] without UI changes.
abstract class SaveSessionRepository {
  /// Newest first (by last activity).
  Future<List<SaveSession>> list();

  /// Adds or replaces the chat with the same id.
  Future<void> put(SaveSession session);

  Future<void> delete(String id);

  /// Removes every chat. Saved phrases stay in their bundles.
  Future<void> clear();
}

/// Keeps chats as JSON in [SharedPreferences], one list per signed-in user so
/// a shared phone does not mix accounts. Keeps the newest [maxSessions].
class LocalSaveSessionRepository implements SaveSessionRepository {
  LocalSaveSessionRepository(this._prefs, {required String userId, this.maxSessions = 200}) : _key = 'saveSessions.v1.$userId';

  final SharedPreferences _prefs;
  final String _key;
  final int maxSessions;

  @override
  Future<List<SaveSession>> list() async {
    final raw = _prefs.getString(_key);
    if (raw == null) return [];
    try {
      final items = [for (final j in jsonDecode(raw) as List) SaveSession.fromJson(Map<String, dynamic>.from(j as Map))];
      return items..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    } catch (e) {
      // A broken store must not break the sheet: start again with no history.
      debugPrint('Save history could not be read: $e');
      return [];
    }
  }

  @override
  Future<void> put(SaveSession session) async {
    final all = (await list()).where((s) => s.id != session.id).toList()..insert(0, session);
    await _write(all.take(maxSessions).toList());
  }

  @override
  Future<void> delete(String id) async => _write((await list()).where((s) => s.id != id).toList());

  @override
  Future<void> clear() => _prefs.remove(_key);

  Future<void> _write(List<SaveSession> items) => _prefs.setString(_key, jsonEncode([for (final s in items) s.toJson()]));
}

/// "Today", "Yesterday", "This week" or "Earlier" for the history list.
/// "This week" is 2 to 6 days ago, not the calendar week.
String historyGroup(DateTime at, DateTime now) {
  final day = DateTime(at.year, at.month, at.day);
  final today = DateTime(now.year, now.month, now.day);
  final days = today.difference(day).inDays;
  if (days <= 0) return 'Today';
  if (days == 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

/// The order of [historyGroup] labels on screen.
const historyGroups = ['Today', 'Yesterday', 'This week', 'Earlier'];
