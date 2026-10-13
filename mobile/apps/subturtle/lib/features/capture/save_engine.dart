import 'package:flutter/foundation.dart';
import 'package:subturtle_api/subturtle_api.dart';

import 'save_session.dart';

/// Where the save assistant gets its answers and keeps its chats.
///
/// [LocalSaveEngine] calls the translation functions itself and keeps chats on
/// the phone. [ServerSaveEngine] uses the `save_assistant` backend, which does
/// the translation work and keeps the history. The sheet does not know which
/// one it talks to.
abstract class SaveEngine {
  /// The chats for Recent and Save history.
  SaveSessionRepository get history;

  /// Starts a chat with [sentence]. Returns the chat (with its phrase
  /// candidates) and any translations already known, by phrase.
  /// [source] is `typed`, `paste` or `share`.
  Future<(SaveSession, Map<String, DetailedTranslation>)> start(String sentence, {required DateTime now, String source = 'typed'});

  /// Loads a chat picked in the history, with the translations it already has.
  Future<(SaveSession, Map<String, DetailedTranslation>)> open(SaveSession session);

  /// The translation card for [phrase], one of the chat's candidates.
  Future<SaveTranslation> translate(SaveSession session, String phrase);

  /// Answers a follow-up question about [phrase]. [session] is the chat
  /// before the question.
  Future<SaveAnswer> ask(SaveSession session, String phrase, String message);

  /// Links a phrase saved with `createPhrase` to the chat.
  Future<void> attach(SaveSession session, SavedPhraseRef saved);

  /// Called after every change to the chat. The phone engine stores it; the
  /// server already has it.
  Future<void> persist(SaveSession session);
}

/// A translation card, and whether the chat is close to its message cap.
typedef SaveTranslation = ({DetailedTranslation translation, bool wrapUp});

/// A tutor answer. [candidates] is set when the answer added phrase options.
typedef SaveAnswer = ({String reply, List<String>? candidates, bool wrapUp});

int _wordCount(String s) => s.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

/// The [chunks] that really appear in [sentence], without repeats, in the order
/// they appear there.
@visibleForTesting
List<String> phrasesIn(String sentence, Iterable<String> chunks) {
  final lower = sentence.toLowerCase();
  final found = <(int, String)>[];
  for (final raw in chunks) {
    final c = raw.trim();
    if (c.isEmpty || found.any((f) => f.$2.toLowerCase() == c.toLowerCase())) continue;
    final at = lower.indexOf(c.toLowerCase());
    if (at >= 0) found.add((at, sentence.substring(at, at + c.length)));
  }
  found.sort((a, b) => a.$1.compareTo(b.$1));
  return [for (final f in found) f.$2];
}

// ------------------------------------------------------------------ phone

/// Calls `translateWithContext` and `translationAdvice` directly and keeps
/// chats in [history] on the phone.
class LocalSaveEngine implements SaveEngine {
  LocalSaveEngine({required this.api, required this.history, required this.languageName});

  final SubturtleApi api;
  @override
  final SaveSessionRepository history;
  final String languageName;

  @override
  Future<(SaveSession, Map<String, DetailedTranslation>)> start(String sentence, {required DateTime now, String source = 'typed'}) async {
    final cards = <String, DetailedTranslation>{};
    var parts = [sentence];
    // A word or a short phrase is the phrase itself; only split real sentences.
    if (_wordCount(sentence) > 3) {
      try {
        final whole = await api.translation.translateDetailed(phrase: sentence, context: sentence, targetLanguage: languageName);
        parts = phrasesIn(sentence, whole.chunks.map((c) => c.text));
        if (parts.isEmpty) parts = [sentence];
        if (parts.length == 1 && parts.single == sentence) cards[sentence] = whole;
      } catch (e) {
        // The phrases are a help, not a must: offer the whole sentence instead.
        debugPrint('Finding phrases failed: $e');
      }
    }
    return (SaveSession(id: '${now.microsecondsSinceEpoch}', sentence: sentence, createdAt: now, updatedAt: now, candidates: parts), cards);
  }

  @override
  Future<(SaveSession, Map<String, DetailedTranslation>)> open(SaveSession session) async => (session, <String, DetailedTranslation>{});

  @override
  Future<SaveTranslation> translate(SaveSession session, String phrase) async =>
      (translation: await api.translation.translateDetailed(phrase: phrase, context: session.sentence, targetLanguage: languageName), wrapUp: false);

  @override
  Future<SaveAnswer> ask(SaveSession session, String phrase, String message) async {
    final history = [ChatLine(fromUser: true, text: session.sentence), ...session.log];
    final reply = await api.translation.advise(
      phrase: phrase,
      context: session.sentence,
      message: message,
      history: [for (final l in history) (l.role, l.text)],
      targetLanguage: languageName,
    );
    return (reply: reply, candidates: null, wrapUp: false);
  }

  @override
  Future<void> attach(SaveSession session, SavedPhraseRef saved) async {}

  @override
  Future<void> persist(SaveSession session) => history.put(session);
}

// ------------------------------------------------------------------ server

/// Uses the `save_assistant` backend: the server translates, answers and
/// keeps the history.
class ServerSaveEngine implements SaveEngine {
  ServerSaveEngine({required this.api, required this.languageName}) : history = ServerSaveSessionRepository(api.saveAssistant);

  final SubturtleApi api;
  @override
  final ServerSaveSessionRepository history;
  final String languageName;

  SaveAssistantRepository get _repo => api.saveAssistant;

  @override
  Future<(SaveSession, Map<String, DetailedTranslation>)> start(String sentence, {required DateTime now, String source = 'typed'}) async {
    final res = await _repo.createSession(message: sentence, targetLanguage: languageName, source: source);
    final full = res.candidates.where((c) => c.isFull).firstOrNull?.text ?? sentence;
    final session = SaveSession(id: res.sessionId, sentence: sentence, createdAt: now, updatedAt: now, candidates: shownCandidates(sentence, res.candidates));
    return (session, {full: res.translation});
  }

  @override
  Future<(SaveSession, Map<String, DetailedTranslation>)> open(SaveSession session) async {
    final d = await _repo.getSession(session.id);
    return sessionFromDetail(d, fallback: session);
  }

  @override
  Future<SaveTranslation> translate(SaveSession session, String phrase) async {
    final res = await _repo.pick(session.id, phrase);
    return (translation: res.translation, wrapUp: res.wrapUp);
  }

  @override
  Future<SaveAnswer> ask(SaveSession session, String phrase, String message) async {
    final res = await _repo.ask(session.id, message);
    final candidates = res.candidates == null ? null : shownCandidates(session.sentence, res.candidates!);
    return (reply: res.reply, candidates: candidates, wrapUp: res.wrapUp);
  }

  @override
  Future<void> attach(SaveSession session, SavedPhraseRef saved) async {
    await _repo.attachSavedPhrase(session.id, phraseId: saved.phraseId, bundleId: saved.bundleId);
  }

  @override
  Future<void> persist(SaveSession session) async {}
}

/// The chips to show for the server's candidates: the phrases in sentence
/// order, then any the tutor added later. The whole message (`full`) is left
/// out of a real sentence when there are phrases to pick, as on the phone.
@visibleForTesting
List<String> shownCandidates(String sentence, List<SaveCandidate> candidates) {
  final phrases = [for (final c in candidates) if (!c.isFull && c.text.trim().isNotEmpty) c.text.trim()];
  if (phrases.isEmpty || _wordCount(sentence) <= 3) return [sentence];
  final lower = sentence.toLowerCase();
  final inSentence = [for (final p in phrases) if (lower.contains(p.toLowerCase())) p]..sort((a, b) => lower.indexOf(a.toLowerCase()).compareTo(lower.indexOf(b.toLowerCase())));
  return [...inSentence, for (final p in phrases) if (!inSentence.contains(p)) p];
}

/// Rebuilds a chat from `getSaveSession`: the full first message, the chips,
/// the saved phrases, the bubbles after the first card, and the translations
/// it already has. A pick is stored as a user message holding the phrase; it
/// is not shown as a bubble.
@visibleForTesting
(SaveSession, Map<String, DetailedTranslation>) sessionFromDetail(SaveSessionDetail d, {required SaveSession fallback}) {
  final sentence = d.firstMessage;
  final candidates = shownCandidates(sentence, d.candidates);
  final cards = <String, DetailedTranslation>{};
  final saved = <SavedPhraseRef>[];
  final log = <ChatLine>[];
  var picked = 0;
  var firstUserSeen = false;
  for (var i = 0; i < d.messages.length; i++) {
    final m = d.messages[i];
    final next = i + 1 < d.messages.length ? d.messages[i + 1] : null;
    switch (m.kind) {
      case 'translation':
        if (m.translation != null) cards[m.text] = m.translation!;
        final at = candidates.indexWhere((c) => c.toLowerCase() == m.text.toLowerCase());
        if (at >= 0) picked = at;
      case 'saved':
        final text = m.savedPhrase ?? '';
        if (m.savedPhraseId != null && text.isNotEmpty && !saved.any((s) => s.phraseId == m.savedPhraseId)) {
          saved.add(SavedPhraseRef(text: text, phraseId: m.savedPhraseId!, bundleId: m.savedBundleId ?? '', bundleTitle: ''));
          log.add(ChatLine(fromUser: false, text: 'Saved "$text".'));
        }
      default:
        if (m.fromUser && !firstUserSeen) {
          firstUserSeen = true; // the first message is the dark bubble above the card
        } else if (m.fromUser && next?.kind == 'translation') {
          // A pick: the chip shows it.
        } else if (m.text.isNotEmpty) {
          log.add(ChatLine(fromUser: m.fromUser, text: m.text));
        }
    }
  }
  final session = SaveSession(
    id: d.sessionId,
    sentence: sentence,
    createdAt: d.createdAt ?? fallback.createdAt,
    updatedAt: d.lastMessageAt ?? fallback.updatedAt,
    candidates: candidates,
    picked: picked,
    saved: saved,
    log: log,
  );
  return (session, cards);
}

/// Save history from `listSaveSessions`. Rows carry the title (the first
/// message, shortened when long) and the saved phrase texts; opening a row
/// loads the rest.
class ServerSaveSessionRepository implements SaveSessionRepository {
  ServerSaveSessionRepository(this._repo);
  final SaveAssistantRepository _repo;

  @override
  Future<List<SaveSession>> list() async {
    final rows = await _repo.listSessions(limit: 50);
    return [
      for (final r in rows)
        SaveSession(
          id: r.sessionId,
          sentence: r.title,
          createdAt: r.lastMessageAt ?? DateTime.now(),
          updatedAt: r.lastMessageAt ?? DateTime.now(),
          saved: [for (final p in r.savedPhrases) SavedPhraseRef(text: p, phraseId: '', bundleId: '', bundleTitle: '')],
        ),
    ];
  }

  /// The server stores every turn itself.
  @override
  Future<void> put(SaveSession session) async {}

  @override
  Future<void> delete(String id) => _repo.deleteSession(id);

  @override
  Future<void> clear() => _repo.deleteAll();
}
